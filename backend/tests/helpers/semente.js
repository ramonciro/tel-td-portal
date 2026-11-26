/**
 * semente.js — preenche TODAS as tabelas que têm empresa_id com uma linha "marcada" por um texto sentinela.
 * Serve ao teste de isolamento: se o sentinela do ambiente B aparecer na resposta de alguém do ambiente A, vazou.
 * Ao varrer o banco (information_schema) em vez de listar tabelas à mão, uma tabela nova com empresa_id entra
 * no teste sozinha.
 */
require("./ambiente");
const pool = require("../../src/lib/db");

const TABELAS_FORA = new Set(["empresas"]);

function valorPara(col, sentinela, contador, idBase) {
  const tipo = String(col.DATA_TYPE).toLowerCase();
  const compl = col.CHARACTER_MAXIMUM_LENGTH ? Number(col.CHARACTER_MAXIMUM_LENGTH) : null;
  if (["varchar", "char"].includes(tipo)) {
    if (compl !== null && compl < sentinela.length + 2) return col.IS_NULLABLE === "YES" ? null : "x".repeat(Math.max(1, compl));
    const v = `${sentinela}${contador}`;
    return compl ? v.slice(0, compl) : v;
  }
  if (["text", "tinytext", "mediumtext", "longtext"].includes(tipo)) return `${sentinela}${contador} texto`;
  if (tipo === "json") return JSON.stringify({ s: `${sentinela}${contador}` });
  // Chaves (id / *_id) valem `idBase`, o número exclusivo deste ambiente: assim as linhas semeadas de um ambiente
  // só apontam para linhas do MESMO ambiente (A usa 7001, B usa 7002) e o teste não cria vínculos cruzados falsos.
  if (["int", "bigint", "smallint", "mediumint"].includes(tipo)) return col.COLUMN_NAME === "id" || /_id$/.test(col.COLUMN_NAME) ? idBase : 1;
  if (tipo === "tinyint") return 1;
  if (["decimal", "float", "double"].includes(tipo)) return 1;
  if (tipo === "enum") {
    const m = String(col.COLUMN_TYPE).match(/'((?:[^']|'')*)'/);
    return m ? m[1].replace(/''/g, "'") : null;
  }
  if (tipo === "date") return "2026-11-10";
  if (["datetime", "timestamp"].includes(tipo)) return "2026-11-10 10:00:00";
  if (tipo === "time") return "10:00:00";
  if (tipo === "year") return 2026;
  return null;
}

/** Insere uma linha sentinela em cada tabela com empresa_id para o ambiente `empresaId`. `idBase`: número exclusivo do ambiente. Devolve { tabelas, falhas }. */
async function semearTodasAsTabelas(empresaId, sentinela, idBase) {
  const conn = await pool.getConnection();
  const tabelas = [];
  const falhas = [];
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.query("SET SESSION sql_mode = ''"); // aceita valores "aproximados" sem recusar
    const [cols] = await conn.query(
      `SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.COLUMN_TYPE, c.CHARACTER_MAXIMUM_LENGTH, c.IS_NULLABLE, c.EXTRA, c.COLUMN_DEFAULT
         FROM information_schema.COLUMNS c
         JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE'
        WHERE c.TABLE_SCHEMA = DATABASE()
        ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`
    );
    const porTabela = new Map();
    for (const c of cols) {
      if (!porTabela.has(c.TABLE_NAME)) porTabela.set(c.TABLE_NAME, []);
      porTabela.get(c.TABLE_NAME).push(c);
    }
    let contador = 0;
    for (const [tabela, colunas] of porTabela) {
      if (TABELAS_FORA.has(tabela)) continue;
      if (!colunas.some((c) => c.COLUMN_NAME === "empresa_id")) continue;
      const campos = [];
      const valores = [];
      contador += 1;
      for (const c of colunas) {
        if (/GENERATED/i.test(c.EXTRA || "")) continue;
        // A coluna `id` automática também recebe o número exclusivo do ambiente (as demais colunas automáticas ficam de fora).
        if (/auto_increment/i.test(c.EXTRA || "") && c.COLUMN_NAME !== "id") continue;
        if (c.COLUMN_NAME === "empresa_id") { campos.push("empresa_id"); valores.push(empresaId); continue; }
        // Colunas "_id" apontam para outras linhas: deixa vazio quando pode; senão 1 (as chaves estrangeiras estão desligadas).
        const v = valorPara(c, sentinela, contador, idBase);
        campos.push(`\`${c.COLUMN_NAME}\``);
        valores.push(v);
      }
      try {
        await conn.query(`INSERT INTO \`${tabela}\` (${campos.map((x) => (x.startsWith("`") ? x : `\`${x}\``)).join(",")}) VALUES (${campos.map(() => "?").join(",")})`, valores);
        tabelas.push(tabela);
      } catch (e) {
        falhas.push(`${tabela}: ${e.code || e.message}`);
      }
    }
  } finally {
    conn.release();
  }
  return { tabelas, falhas };
}

module.exports = { semearTodasAsTabelas };
