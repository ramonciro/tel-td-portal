/**
 * runner.js — controle de migrações do banco (G7, 26/11/2026).
 *
 * Como funciona a cada subida do servidor:
 *  1. Pega uma trava no banco (GET_LOCK), para duas instâncias subindo juntas não migrarem ao mesmo tempo.
 *  2. Roda o "legado" (database/migrate.js, os ~4.200 linhas de passos idempotentes de antes). Continua rodando
 *     a cada subida, como sempre, porque inclui acertos de dados recorrentes. O runner só MEDE e REGISTRA: duração e
 *     quantos passos "engoliram" um erro e seguiram ("não concluído — seguindo"), que antes sumiam no log.
 *  3. Aplica, em ordem, as migrações NUMERADAS de database/migracoes/NNNN_nome.js que ainda não constam na tabela
 *     td_migracoes_controle. Cada uma roda UMA vez e é registrada. Se uma falhar, o servidor para (falha alta, não silenciosa)
 *     e a mesma migração é tentada de novo na próxima subida.
 *
 * Regra daqui para frente: mudança de banco NOVA vai em um arquivo numerado novo, nunca no migrate.js.
 * Ver database/migracoes/LEIA-ME.md.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const defaultPool = require("../lib/db");

const DIR_PADRAO = path.join(__dirname, "migracoes");
const PADRAO_ARQUIVO = /^(\d{4})_([a-z0-9_]+)\.js$/;
const TRAVA = "td_migracoes";
// Nome próprio de propósito: em produção já existia uma tabela "schema_migrations" de outro formato (26/11/2026),
// e usar esse nome derrubou a subida do servidor. Nunca reaproveitar nome genérico de tabela.
const TABELA_PADRAO = "td_migracoes_controle";
const COLUNAS = ["id", "tipo", "aplicada_em", "duracao_ms", "checksum", "avisos", "detalhe"];
const ESPERA_TRAVA_S = 120;

const memoria = { alteradas: [], avisosLegado: [] };

const sha = (texto) => crypto.createHash("sha256").update(texto).digest("hex");
const curto = (v, n) => (v === null || v === undefined ? null : String(v).slice(0, n));

async function garantirTabela(pool, tabela) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`${tabela}\` (
      id VARCHAR(120) NOT NULL PRIMARY KEY,
      tipo VARCHAR(12) NOT NULL DEFAULT 'numerada',
      aplicada_em DATETIME NOT NULL,
      duracao_ms INT NULL,
      checksum CHAR(64) NULL,
      avisos INT NOT NULL DEFAULT 0,
      detalhe VARCHAR(500) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // Se a tabela já existia com outro formato, o CREATE acima não a altera: confere e para com uma mensagem clara.
  const [cols] = await pool.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [tabela]
  );
  const tem = new Set(cols.map((c) => c.COLUMN_NAME));
  const faltam = COLUNAS.filter((c) => !tem.has(c));
  if (faltam.length) {
    throw new Error(`A tabela de controle de migrações "${tabela}" já existe com outro formato (faltam as colunas: ${faltam.join(", ")}). Não mexi nela.`);
  }
}

function listarArquivos(dir) {
  if (!fs.existsSync(dir)) return [];
  const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
  const itens = [];
  const numeros = new Map();
  for (const f of arquivos) {
    const m = PADRAO_ARQUIVO.exec(f);
    if (!m) throw new Error(`Arquivo de migração com nome inválido: "${f}". Use NNNN_nome_em_minusculas.js (ex.: 0002_nova_coluna.js).`);
    if (numeros.has(m[1])) throw new Error(`Duas migrações com o mesmo número ${m[1]}: "${numeros.get(m[1])}" e "${f}".`);
    numeros.set(m[1], f);
    itens.push({ id: f.replace(/\.js$/, ""), arquivo: f, caminho: path.join(dir, f) });
  }
  return itens.sort((a, b) => a.id.localeCompare(b.id));
}

async function comTrava(pool, fn) {
  const conn = await pool.getConnection();
  try {
    const [[r]] = await conn.query("SELECT GET_LOCK(?, ?) AS ok", [TRAVA, ESPERA_TRAVA_S]);
    if (Number(r.ok) !== 1) throw new Error("Outra instância está migrando o banco há mais de 2 minutos; não consegui a trava de migrações.");
    try {
      return await fn();
    } finally {
      await conn.query("SELECT RELEASE_LOCK(?)", [TRAVA]).catch(() => {});
    }
  } finally {
    conn.release();
  }
}

// Roda o legado deixando passar o log como sempre, mas contando os passos que falharam e seguiram.
async function rodarLegado(legado) {
  const original = console.log;
  const avisos = [];
  console.log = (...args) => {
    const texto = args.map(String).join(" ");
    if (/n[ãa]o conclu[ií]d[oa]/i.test(texto)) avisos.push(texto.trim());
    original.apply(console, args);
  };
  const inicio = Date.now();
  try {
    await legado();
  } finally {
    console.log = original;
  }
  return { duracaoMs: Date.now() - inicio, avisos };
}

async function executarMigracoes({ pool = defaultPool, dir = DIR_PADRAO, legado, tabela = TABELA_PADRAO } = {}) {
  const rodaLegado = legado === undefined ? require("./migrate").runMigrations : legado;
  const arquivos = listarArquivos(dir); // valida nomes e números ANTES de mexer em qualquer coisa

  return comTrava(pool, async () => {
    await garantirTabela(pool, tabela);

    // 1) legado
    if (rodaLegado) {
      const { duracaoMs, avisos } = await rodarLegado(rodaLegado);
      memoria.avisosLegado = avisos;
      // O registro do legado é só estatística: se falhar, a subida do servidor NÃO pode cair por causa dele.
      try {
        await pool.query(
          `INSERT INTO \`${tabela}\` (id, tipo, aplicada_em, duracao_ms, avisos, detalhe)
           VALUES ('legado', 'legado', NOW(), ?, ?, ?)
           ON DUPLICATE KEY UPDATE aplicada_em = NOW(), duracao_ms = VALUES(duracao_ms), avisos = VALUES(avisos), detalhe = VALUES(detalhe)`,
          [duracaoMs, avisos.length, avisos.length ? curto(avisos.join(" | "), 500) : null]
        );
      } catch (e) {
        console.warn("[migracoes] não consegui registrar a execução do legado (segue sem registrar):", e.message);
      }
      if (avisos.length) console.warn(`[migracoes] ${avisos.length} passo(s) do legado não concluíram e seguiram — veja os avisos acima.`);
    }

    // 2) numeradas
    const [feitas] = await pool.query(`SELECT id, checksum FROM \`${tabela}\` WHERE tipo = 'numerada'`);
    const jaFeitas = new Map(feitas.map((r) => [r.id, r.checksum]));
    memoria.alteradas = [];
    let aplicadas = 0;
    for (const m of arquivos) {
      const conteudo = fs.readFileSync(m.caminho, "utf8");
      const checksum = sha(conteudo);
      if (jaFeitas.has(m.id)) {
        if (jaFeitas.get(m.id) && jaFeitas.get(m.id) !== checksum) {
          memoria.alteradas.push(m.id);
          console.warn(`[migracoes] ${m.id} já foi aplicada e o arquivo mudou depois; não rodo de novo. Mudança de banco nova vai em um arquivo novo.`);
        }
        continue;
      }
      delete require.cache[require.resolve(m.caminho)]; // sempre o conteúdo atual do arquivo
      const modulo = require(m.caminho);
      if (!modulo || typeof modulo.up !== "function") throw new Error(`Migração ${m.id} não exporta a função up({ pool }).`);
      const inicio = Date.now();
      console.log(`[migracoes] aplicando ${m.id}…`);
      try {
        await modulo.up({ pool });
      } catch (erro) {
        erro.message = `Migração ${m.id} falhou: ${erro.message}`;
        throw erro;
      }
      await pool.query(
        `INSERT INTO \`${tabela}\` (id, tipo, aplicada_em, duracao_ms, checksum, detalhe) VALUES (?, 'numerada', NOW(), ?, ?, ?)`,
        [m.id, Date.now() - inicio, checksum, curto(modulo.descricao, 500)]
      );
      aplicadas += 1;
    }
    return { aplicadas, total: arquivos.length, alteradas: memoria.alteradas.slice(), avisosLegado: memoria.avisosLegado.slice() };
  });
}

// Estado para a tela de saúde (somente leitura).
async function statusMigracoes({ pool = defaultPool, tabela = TABELA_PADRAO } = {}) {
  try {
    const [rows] = await pool.query(
      `SELECT id, tipo, aplicada_em, duracao_ms, avisos, detalhe FROM \`${tabela}\` ORDER BY aplicada_em DESC, id DESC`
    );
    const legado = rows.find((r) => r.tipo === "legado") || null;
    const numeradas = rows.filter((r) => r.tipo === "numerada");
    return {
      registrado: true,
      legado: legado ? { rodou_em: legado.aplicada_em, duracao_ms: legado.duracao_ms, avisos: Number(legado.avisos || 0), detalhe: legado.detalhe } : null,
      numeradas_aplicadas: numeradas.length,
      ultima_numerada: numeradas.length ? { id: numeradas[0].id, aplicada_em: numeradas[0].aplicada_em } : null,
      alteradas_depois_de_aplicadas: memoria.alteradas.slice(),
    };
  } catch (e) {
    return { registrado: false };
  }
}

module.exports = { executarMigracoes, statusMigracoes, listarArquivos, DIR_PADRAO, TABELA_PADRAO };
