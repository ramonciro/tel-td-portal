#!/usr/bin/env node
/**
 * restaurarBackup.js — restaura um backup do Portal T&D (21/10/2026).
 *
 * Usa as mesmas variáveis do servidor: MYSQLHOST, MYSQLUSER, MYSQLPASSWORD,
 * MYSQLDATABASE, MYSQLPORT (banco de DESTINO) e BACKUP_S3_* (para baixar do
 * bucket). Passo a passo completo em RESTAURACAO-BACKUP.md.
 *
 * Exemplos (a partir da pasta backend/):
 *   node src/scripts/restaurarBackup.js --listar
 *   node src/scripts/restaurarBackup.js --chave db/2026/10/portal-td_2026-10-22_0230.sql.gz --confirmo
 *   node src/scripts/restaurarBackup.js --arquivo ./dump.sql.gz --confirmo
 *   node src/scripts/restaurarBackup.js --uploads --confirmo     (baixa os uploads do bucket)
 *
 * Segurança: nada é apagado/escrito sem --confirmo. Se o banco de destino já
 * tiver tabelas, também é preciso --forcar (o dump recria cada tabela do zero).
 */
require("dotenv").config();
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");
const { pipeline } = require("stream/promises");
const mysqlCb = require("mysql2");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const {
  configurado, criarCliente, listarTudo, PREFIXO_DB, PREFIXO_UPLOADS,
} = require("../services/backupService");
const { pastaUploads } = require("../lib/uploadAssinado");
const { removerColunasGeradas, tabelaDoCreate, tabelaDoInsert } = require("../lib/dumpLegado");

const args = process.argv.slice(2);
const tem = (f) => args.includes(f);
const valor = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};

const humano = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

async function baixar(s3, chave, destino) {
  const r = await s3.send(new GetObjectCommand({ Bucket: process.env.BACKUP_S3_BUCKET, Key: chave }));
  await fsp.mkdir(path.dirname(destino), { recursive: true });
  await pipeline(r.Body, fs.createWriteStream(destino));
}

async function listar() {
  if (!configurado()) throw new Error("Variáveis BACKUP_S3_* não configuradas.");
  const s3 = criarCliente();
  const dumps = (await listarTudo(s3, PREFIXO_DB)).filter((o) => o.chave.endsWith(".sql.gz"));
  dumps.sort((a, b) => b.chave.localeCompare(a.chave));
  if (!dumps.length) return console.log("Nenhum backup do banco encontrado no bucket.");
  console.log("Backups do banco no bucket (mais recente primeiro):");
  for (const d of dumps) console.log(`  ${d.chave}   ${humano(d.tamanho)}`);
}

async function restaurarBanco(arquivoGz) {
  const conexao = mysqlCb.createConnection({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT,
    charset: "utf8mb4",
    connectTimeout: 15000,
    multipleStatements: false,
  });
  const c = conexao.promise();

  console.log(`Destino: ${process.env.MYSQLUSER}@${process.env.MYSQLHOST}:${process.env.MYSQLPORT || 3306}/${process.env.MYSQLDATABASE}`);
  const [existentes] = await c.query("SHOW TABLES");
  if (existentes.length && !tem("--forcar")) {
    conexao.destroy();
    throw new Error(
      `O banco de destino já tem ${existentes.length} tabelas. A restauração recria cada tabela do zero ` +
      "(apaga os dados atuais delas). Se é isso mesmo que você quer, rode de novo com --forcar."
    );
  }

  const leitor = readline.createInterface({
    input: fs.createReadStream(arquivoGz).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
  let comandos = 0;
  let rodape = null; // "-- fim: N tabelas, M linhas" gravado pelo backup
  const geradasPorTabela = new Map(); // tabela -> Set de colunas calculadas (para ler dumps antigos)
  const ignoradas = new Set();
  for await (const linha of leitor) {
    const sql = linha.trim();
    const fim = sql.match(/^-- fim: (\d+) tabelas, (\d+) linhas/);
    if (fim) rodape = { tabelas: Number(fim[1]), linhas: Number(fim[2]) };
    if (!sql || sql.startsWith("--")) continue;
    try {
      let comando = sql;
      const nomeInsert = tabelaDoInsert(sql);
      if (nomeInsert && geradasPorTabela.has(nomeInsert)) {
        // Dump antigo (anterior a 26/11/2026): o INSERT traz o valor de coluna calculada, que o MySQL recusa.
        const r = removerColunasGeradas(sql, geradasPorTabela.get(nomeInsert));
        if (r.removidas.length) {
          comando = r.sql;
          for (const col of r.removidas) ignoradas.add(`${nomeInsert}.${col}`);
        }
      }
      await c.query(comando);
      const nomeCreate = tabelaDoCreate(sql);
      if (nomeCreate && /GENERATED ALWAYS AS/i.test(sql)) {
        const [g] = await c.query(
          `SELECT COLUMN_NAME AS nome FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
              AND (EXTRA LIKE '%VIRTUAL GENERATED%' OR EXTRA LIKE '%STORED GENERATED%')`,
          [nomeCreate]
        );
        if (g.length) geradasPorTabela.set(nomeCreate, new Set(g.map((x) => x.nome)));
      }
    } catch (e) {
      conexao.destroy();
      throw new Error(
        `${e.message}\n  Comando que falhou (início): ${sql.slice(0, 160)}\n` +
        `  ${comandos} comandos tinham rodado antes: o banco de destino ficou restaurado só até aqui.`
      );
    }
    comandos += 1;
    if (comandos % 500 === 0) process.stdout.write(`\r  ${comandos} comandos executados...`);
  }
  console.log(`\r  ${comandos} comandos executados.`);
  if (ignoradas.size) {
    console.log(`Dump antigo: valores de coluna calculada ignorados (o banco recalcula): ${[...ignoradas].join(", ")}.`);
  }

  // Conferência: o que está no banco agora tem de bater com o que o backup diz que levou.
  if (!rodape) {
    conexao.destroy();
    throw new Error("O arquivo não tem a linha final de conferência (\"-- fim: ...\"): o backup pode estar cortado/incompleto.");
  }
  const [lista] = await c.query("SHOW FULL TABLES");
  const tabelas = lista.filter((r) => String(r.Table_type).toUpperCase() !== "VIEW").map((r) => Object.values(r)[0]);
  let linhas = 0;
  for (const t of tabelas) {
    const [[n]] = await c.query(`SELECT COUNT(*) AS n FROM \`${String(t).replace(/`/g, "``")}\``);
    linhas += Number(n.n);
  }
  conexao.destroy();
  const ok = tabelas.length === rodape.tabelas && linhas === rodape.linhas;
  console.log(`Conferência: backup diz ${rodape.tabelas} tabelas e ${rodape.linhas} linhas; o banco restaurado tem ${tabelas.length} tabelas e ${linhas} linhas — ${ok ? "CONFERE." : "DIVERGE."}`);
  if (!ok) throw new Error("A contagem do banco restaurado não bate com a do backup. Não use este banco.");
  console.log("Banco restaurado e conferido.");
}

async function restaurarUploads() {
  if (!configurado()) throw new Error("Variáveis BACKUP_S3_* não configuradas.");
  const s3 = criarCliente();
  const destino = pastaUploads();
  const itens = await listarTudo(s3, PREFIXO_UPLOADS);
  console.log(`Uploads no bucket: ${itens.length}. Destino: ${destino}`);
  let baixados = 0;
  let pulados = 0;
  for (const o of itens) {
    const rel = o.chave.slice(PREFIXO_UPLOADS.length);
    const alvo = path.resolve(destino, rel);
    if (!alvo.startsWith(path.resolve(destino) + path.sep)) continue; // nunca sai da pasta
    try {
      if ((await fsp.stat(alvo)).size === o.tamanho) { pulados += 1; continue; }
    } catch (_) { /* não existe: baixa */ }
    await baixar(s3, o.chave, alvo);
    baixados += 1;
  }
  console.log(`Uploads: ${baixados} baixados, ${pulados} já estavam corretos.`);
}

(async () => {
  try {
    if (tem("--listar")) return await listar();

    if (!tem("--confirmo")) {
      console.log("Faltou --confirmo. Veja o cabeçalho deste arquivo para exemplos. Nada foi alterado.");
      process.exit(2);
    }

    if (tem("--uploads")) return await restaurarUploads();

    let arquivo = valor("--arquivo");
    let temporario = null;
    if (!arquivo) {
      const chave = valor("--chave");
      if (!chave) throw new Error("Informe --arquivo <dump.sql.gz> ou --chave <caminho no bucket> (veja --listar).");
      if (!configurado()) throw new Error("Variáveis BACKUP_S3_* não configuradas.");
      temporario = path.join(os.tmpdir(), `restaurar-${Date.now()}.sql.gz`);
      console.log(`Baixando ${chave}...`);
      await baixar(criarCliente(), chave, temporario);
      arquivo = temporario;
    }
    await restaurarBanco(arquivo);
    if (temporario) await fsp.unlink(temporario).catch(() => {});
  } catch (e) {
    console.error("ERRO:", e.message);
    process.exit(1);
  }
})();
