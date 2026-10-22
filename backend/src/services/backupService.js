/**
 * backupService.js — backup externo do banco e dos uploads (21/10/2026).
 *
 * Por quê: o banco e os arquivos (provas escaneadas, certificados, biblioteca)
 * moram só no provedor de hospedagem. Se o provedor falhar ou perder o volume,
 * não existe nenhuma outra cópia. Este serviço guarda uma cópia FORA dele, num
 * bucket compatível com S3 (Cloudflare R2, Backblaze B2, AWS S3...).
 *
 * O que faz, todo dia (jobs/scheduler.js):
 *   1. Gera um dump completo do MySQL em SQL puro, compactado (.sql.gz), com
 *      uma fotografia consistente (transação com snapshot) — sem depender do
 *      programa mysqldump, que não existe no servidor.
 *   2. Envia o dump ao bucket e confere o tamanho gravado.
 *   3. Sincroniza a pasta de uploads: envia o que ainda não está no bucket (ou
 *      mudou de tamanho). Nunca apaga nada do bucket por causa de arquivo
 *      removido do servidor — a cópia externa é um cofre.
 *   4. Aplica a retenção dos dumps (diários por BACKUP_DIAS_DIARIOS dias,
 *      padrão 14; o do dia 1 de cada mês por 12 meses; nunca menos de 3).
 *
 * Só liga quando as variáveis BACKUP_S3_* estão configuradas; sem elas o
 * portal funciona exatamente como antes.
 *
 * Variáveis (todas no serviço do backend):
 *   BACKUP_S3_ENDPOINT          ex.: https://<id>.r2.cloudflarestorage.com
 *   BACKUP_S3_BUCKET            nome do bucket
 *   BACKUP_S3_ACCESS_KEY_ID
 *   BACKUP_S3_SECRET_ACCESS_KEY
 *   BACKUP_S3_REGION            opcional (padrão "auto", o do R2)
 *   BACKUP_DIAS_DIARIOS         opcional (padrão 14)
 *   BACKUP_ALERTA_EMAIL         opcional: e-mail avisado se o backup falhar
 *
 * Restauração: scripts/restaurarBackup.js (e ver RESTAURACAO-BACKUP.md).
 */
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { once } = require("events");
const mysqlCb = require("mysql2");
const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { pastaUploads } = require("../lib/uploadAssinado");

const LIMITE_BUFFER = 200 * 1024 * 1024; // acima disso, envia por stream
const PREFIXO_DB = "db/";
const PREFIXO_UPLOADS = "uploads/";
const CHAVE_STATUS = "status/ultimo-backup.json";

let emExecucao = false;
let ultimoResultado = null;

// ───────────────────────── configuração / cliente S3 ─────────────────────────

function configurado() {
  return !!(
    process.env.BACKUP_S3_BUCKET &&
    process.env.BACKUP_S3_ACCESS_KEY_ID &&
    process.env.BACKUP_S3_SECRET_ACCESS_KEY
  );
}

function criarCliente() {
  return new S3Client({
    region: process.env.BACKUP_S3_REGION || "auto",
    endpoint: process.env.BACKUP_S3_ENDPOINT || undefined,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY,
    },
    // R2/B2 não aceitam o checksum extra que o SDK novo manda por padrão.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

const bucket = () => process.env.BACKUP_S3_BUCKET;

// ───────────────────────────── dump do MySQL ─────────────────────────────

function abrirConexaoDump() {
  return mysqlCb.createConnection({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT,
    charset: "utf8mb4",
    connectTimeout: 15000,
    // Datas como texto exato do banco (sem conversão de fuso), números grandes
    // e decimais como texto (sem perda de precisão) e JSON como texto cru.
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    typeCast: (field, next) => (field.type === "JSON" ? field.string("utf8") : next()),
  });
}

// MySQL de produção devolve JSON como texto (typeCast acima). Outros servidores
// compatíveis (MariaDB) devolvem objeto/array já "desembrulhado" pelo driver:
// volta para texto JSON, senão o escape viraria "chave = valor" e quebraria.
function valorSql(v) {
  if (v !== null && typeof v === "object" && !Buffer.isBuffer(v) && !(v instanceof Date)) {
    return JSON.stringify(v);
  }
  return v;
}

const q = (nome) => "`" + String(nome).replace(/`/g, "``") + "`";

async function escrever(gz, texto) {
  if (!gz.write(texto)) await once(gz, "drain");
}

/**
 * Gera o dump em `destino` (.sql.gz). Cada comando SQL ocupa UMA linha, então
 * a restauração pode ser feita linha a linha (scripts/restaurarBackup.js) ou
 * simplesmente com: gunzip -c arquivo.sql.gz | mysql ...
 */
async function gerarDump(destino) {
  const conexao = abrirConexaoDump();
  const c = conexao.promise();
  const gz = zlib.createGzip({ level: 6 });
  const saida = fs.createWriteStream(destino);
  gz.pipe(saida);
  const terminou = once(saida, "finish");

  let tabelas = 0;
  let linhas = 0;
  try {
    await c.query("SET SESSION time_zone = '+00:00'");
    await c.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await c.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");

    const agora = new Date().toISOString();
    await escrever(gz, `-- Portal T&D — backup do banco ${process.env.MYSQLDATABASE} em ${agora}\n`);
    await escrever(gz, "SET NAMES utf8mb4;\n");
    await escrever(gz, "SET time_zone = '+00:00';\n");
    await escrever(gz, "SET FOREIGN_KEY_CHECKS = 0;\n");
    await escrever(gz, "SET UNIQUE_CHECKS = 0;\n");
    await escrever(gz, "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n");

    const [lista] = await c.query("SHOW FULL TABLES");
    const base = [];
    const views = [];
    for (const r of lista) {
      const nome = Object.values(r)[0];
      (String(r.Table_type).toUpperCase() === "VIEW" ? views : base).push(nome);
    }

    for (const tabela of base) {
      const [[def]] = await c.query(`SHOW CREATE TABLE ${q(tabela)}`);
      const criar = String(def["Create Table"]).replace(/\r?\n/g, " ");
      await escrever(gz, `DROP TABLE IF EXISTS ${q(tabela)};\n${criar};\n`);

      let colunas = null;
      let lote = [];
      let tamanhoLote = 0;
      const gravarLote = async () => {
        if (!lote.length) return;
        await escrever(gz, `INSERT INTO ${q(tabela)} (${colunas}) VALUES ${lote.join(",")};\n`);
        lote = [];
        tamanhoLote = 0;
      };

      const fluxo = conexao.query(`SELECT * FROM ${q(tabela)}`).stream({ highWaterMark: 200 });
      for await (const row of fluxo) {
        if (!colunas) colunas = Object.keys(row).map(q).join(",");
        const valores = Object.values(row).map((v) => conexao.escape(valorSql(v))).join(",");
        const tupla = `(${valores})`;
        lote.push(tupla);
        tamanhoLote += tupla.length;
        linhas += 1;
        if (lote.length >= 200 || tamanhoLote >= 512 * 1024) await gravarLote();
      }
      await gravarLote();
      tabelas += 1;
    }

    for (const view of views) {
      try {
        const [[def]] = await c.query(`SHOW CREATE VIEW ${q(view)}`);
        const criar = String(def["Create View"]).replace(/\r?\n/g, " ");
        await escrever(gz, `DROP VIEW IF EXISTS ${q(view)};\n${criar};\n`);
      } catch (e) {
        console.error(`[backup] View ${view} não incluída:`, e.message);
      }
    }

    await escrever(gz, "SET FOREIGN_KEY_CHECKS = 1;\n");
    await escrever(gz, `-- fim: ${tabelas} tabelas, ${linhas} linhas\n`);
    await c.query("COMMIT");
  } catch (err) {
    gz.destroy();
    saida.destroy();
    throw err;
  } finally {
    conexao.destroy();
  }
  gz.end();
  await terminou;
  return { tabelas, linhas };
}

// ───────────────────────────── helpers S3 ─────────────────────────────

async function enviarArquivo(s3, arquivo, chave, tamanho) {
  const Body = tamanho <= LIMITE_BUFFER ? await fsp.readFile(arquivo) : fs.createReadStream(arquivo);
  await s3.send(new PutObjectCommand({
    Bucket: bucket(),
    Key: chave,
    Body,
    ContentLength: tamanho,
    ContentType: chave.endsWith(".gz") ? "application/gzip" : "application/octet-stream",
  }));
}

async function listarTudo(s3, prefixo) {
  const itens = [];
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({
      Bucket: bucket(), Prefix: prefixo, ContinuationToken: token,
    }));
    for (const o of r.Contents || []) itens.push({ chave: o.Key, tamanho: o.Size, data: o.LastModified });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return itens;
}

async function enviarJson(s3, chave, objeto) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket(), Key: chave, Body: JSON.stringify(objeto, null, 2), ContentType: "application/json",
  }));
}

// Data/hora no fuso de Brasília para nomear os arquivos.
function partesBrasilia(d = new Date()) {
  const f = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t) => f.find((p) => p.type === t).value;
  return { ano: g("year"), mes: g("month"), dia: g("day"), hora: g("hour"), min: g("minute") };
}

function chaveDump(d = new Date()) {
  const p = partesBrasilia(d);
  return `${PREFIXO_DB}${p.ano}/${p.mes}/portal-td_${p.ano}-${p.mes}-${p.dia}_${p.hora}${p.min}.sql.gz`;
}

// ───────────────────────────── uploads ─────────────────────────────

async function percorrer(pasta, base = pasta, acc = []) {
  let entradas;
  try {
    entradas = await fsp.readdir(pasta, { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT") return acc;
    throw e;
  }
  for (const e of entradas) {
    if (e.name.startsWith(".")) continue;
    const abs = path.join(pasta, e.name);
    if (e.isDirectory()) await percorrer(abs, base, acc);
    else if (e.isFile()) {
      const st = await fsp.stat(abs);
      acc.push({ abs, rel: path.relative(base, abs).split(path.sep).join("/"), tamanho: st.size });
    }
  }
  return acc;
}

async function sincronizarUploads(s3, { limiteMs = 20 * 60 * 1000, simultaneos = 4 } = {}) {
  const locais = await percorrer(pastaUploads());
  const remotos = new Map((await listarTudo(s3, PREFIXO_UPLOADS)).map((o) => [o.chave, o.tamanho]));
  const pendentes = locais.filter((f) => remotos.get(PREFIXO_UPLOADS + f.rel) !== f.tamanho);

  const inicio = Date.now();
  let enviados = 0;
  let falhas = 0;
  let bytes = 0;
  let indice = 0;

  async function trabalhador() {
    while (indice < pendentes.length && Date.now() - inicio < limiteMs) {
      const f = pendentes[indice++];
      try {
        await enviarArquivo(s3, f.abs, PREFIXO_UPLOADS + f.rel, f.tamanho);
        enviados += 1;
        bytes += f.tamanho;
      } catch (e) {
        falhas += 1;
        console.error(`[backup] Falha ao enviar ${f.rel}:`, e.message);
      }
    }
  }
  await Promise.all(Array.from({ length: simultaneos }, trabalhador));

  return {
    arquivos_locais: locais.length,
    ja_no_bucket: locais.length - pendentes.length,
    enviados,
    falhas,
    restantes: Math.max(0, pendentes.length - enviados - falhas),
    bytes_enviados: bytes,
  };
}

// ───────────────────────────── retenção ─────────────────────────────

function dataDaChave(chave) {
  const m = /portal-td_(\d{4})-(\d{2})-(\d{2})_/.exec(chave);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)) : null;
}

async function aplicarRetencao(s3) {
  const diasDiarios = Number(process.env.BACKUP_DIAS_DIARIOS) || 14;
  const dumps = (await listarTudo(s3, PREFIXO_DB)).filter((o) => o.chave.endsWith(".sql.gz"));
  const hoje = Date.now();
  const dia = 24 * 3600 * 1000;

  const manter = new Set();
  // sempre os 3 mais recentes, aconteça o que acontecer
  [...dumps].sort((a, b) => b.chave.localeCompare(a.chave)).slice(0, 3).forEach((o) => manter.add(o.chave));
  for (const o of dumps) {
    const d = dataDaChave(o.chave);
    if (!d) { manter.add(o.chave); continue; } // nome desconhecido: não mexe
    const idade = (hoje - d.getTime()) / dia;
    if (idade <= diasDiarios) manter.add(o.chave);
    else if (d.getUTCDate() === 1 && idade <= 366) manter.add(o.chave); // um por mês, 12 meses
  }
  const apagar = dumps.filter((o) => !manter.has(o.chave)).map((o) => ({ Key: o.chave }));
  for (let i = 0; i < apagar.length; i += 500) {
    await s3.send(new DeleteObjectsCommand({
      Bucket: bucket(), Delete: { Objects: apagar.slice(i, i + 500), Quiet: true },
    }));
  }
  return { dumps_no_bucket: dumps.length, apagados: apagar.length };
}

// ───────────────────────────── orquestração ─────────────────────────────

async function avisarFalha(resultado) {
  const para = process.env.BACKUP_ALERTA_EMAIL;
  if (!para) return;
  try {
    const { sendMail } = require("./mailer");
    await sendMail({
      to: para,
      subject: "Portal T&D — o backup externo falhou",
      text: `O backup automático de ${resultado.iniciado_em} não terminou.\n\nErro: ${resultado.erro_dump || resultado.erro || "ver registros do servidor"}\n\nDetalhes: ${JSON.stringify(resultado)}`,
    });
  } catch (e) {
    console.error("[backup] Não consegui enviar o aviso de falha:", e.message);
  }
}

async function rodarBackup({ origem = "agendado" } = {}) {
  if (!configurado()) {
    return { ativo: false, message: "Backup externo não configurado (variáveis BACKUP_S3_*)." };
  }
  if (emExecucao) return { ativo: true, ignorado: true, message: "Já existe um backup em andamento." };
  emExecucao = true;

  const inicio = Date.now();
  const resultado = { ativo: true, origem, iniciado_em: new Date(inicio).toISOString(), ok: false };
  const s3 = criarCliente();
  const arquivoTmp = path.join(os.tmpdir(), `portal-td-dump-${process.pid}-${inicio}.sql.gz`);

  try {
    // 1) dump + envio
    try {
      const dump = await gerarDump(arquivoTmp);
      const tamanho = (await fsp.stat(arquivoTmp)).size;
      const chave = chaveDump(new Date(inicio));
      await enviarArquivo(s3, arquivoTmp, chave, tamanho);
      const conferido = await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: chave }));
      if (Number(conferido.ContentLength) !== tamanho) {
        throw new Error(`Tamanho no bucket (${conferido.ContentLength}) diferente do enviado (${tamanho}).`);
      }
      resultado.dump = { chave, bytes: tamanho, tabelas: dump.tabelas, linhas: dump.linhas };
      resultado.ok = true;
    } catch (e) {
      resultado.erro_dump = e.code ? `${e.code}: ${e.message}` : e.message;
      console.error("[backup] Falha no dump do banco:", e);
    }

    // 2) uploads (roda mesmo se o banco estiver fora)
    try {
      resultado.uploads = await sincronizarUploads(s3);
      if (resultado.uploads.falhas > 0) resultado.ok = false;
    } catch (e) {
      resultado.ok = false;
      resultado.erro_uploads = e.message;
      console.error("[backup] Falha na sincronização de uploads:", e);
    }

    // 3) retenção — só depois de um dump novo gravado com sucesso
    if (resultado.dump) {
      try {
        resultado.retencao = await aplicarRetencao(s3);
      } catch (e) {
        resultado.erro_retencao = e.message;
        console.error("[backup] Falha ao aplicar retenção:", e);
      }
    }

    resultado.duracao_segundos = Math.round((Date.now() - inicio) / 1000);
    resultado.terminado_em = new Date().toISOString();
    try { await enviarJson(s3, CHAVE_STATUS, resultado); } catch (_) { /* melhor esforço */ }
    if (!resultado.ok) await avisarFalha(resultado);
    ultimoResultado = resultado;
    return resultado;
  } finally {
    emExecucao = false;
    fsp.unlink(arquivoTmp).catch(() => {});
  }
}

// Ao subir o servidor, recupera o resultado do último backup gravado no bucket
// (a memória zera a cada reinício) — assim o /api/health/backup não dá alarme falso.
async function carregarUltimoDoBucket() {
  if (!configurado() || ultimoResultado) return;
  try {
    const s3 = criarCliente();
    const r = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: CHAVE_STATUS }));
    const texto = await r.Body.transformToString();
    const obj = JSON.parse(texto);
    if (obj && obj.terminado_em && !ultimoResultado) ultimoResultado = obj;
  } catch (_) { /* ainda não existe backup anterior */ }
}

function statusBackup() {
  const r = ultimoResultado;
  const ultimoOk = r && r.ok ? Date.parse(r.terminado_em) : null;
  return {
    configurado: configurado(),
    em_execucao: emExecucao,
    ultimo: r
      ? {
          ok: r.ok,
          terminado_em: r.terminado_em,
          duracao_segundos: r.duracao_segundos,
          dump: r.dump || null,
          uploads: r.uploads || null,
          erro: r.erro_dump || r.erro_uploads || null,
        }
      : null,
    horas_desde_ultimo_ok: ultimoOk ? Math.round((Date.now() - ultimoOk) / 36e5) : null,
  };
}

module.exports = {
  configurado,
  criarCliente,
  gerarDump,
  rodarBackup,
  statusBackup,
  carregarUltimoDoBucket,
  listarTudo,
  chaveDump,
  aplicarRetencao,
  PREFIXO_DB,
  PREFIXO_UPLOADS,
  GetObjectCommand,
};
