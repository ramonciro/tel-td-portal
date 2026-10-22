/**
 * instrutoresTurma.js — Instrutores adicionais da turma (TBT, 22/10/2026)
 *
 * Até aqui uma turma tinha UM instrutor (treinamentos.instrutor, texto). A TBT
 * é feita por mais de um instrutor ao mesmo tempo, então a turma passa a ter:
 *   - o instrutor PRINCIPAL (treinamentos.instrutor — não mudou nada nele);
 *   - zero ou mais instrutores ADICIONAIS (tabela treinamento_instrutores).
 *
 * Quem é instrutor adicional vê a turma, preenche chamada/diário/rotina e conta
 * as horas cheias nos próprios indicadores (Pacote B). Este arquivo concentra
 * "quem é instrutor desta turma" para o resto do código não repetir a regra.
 */
const pool = require("./db");

const chave = (s) => String(s || "").trim().toLowerCase();

/**
 * Condição SQL "o usuário (nome) é instrutor da turma `alias`" — principal OU
 * adicional. Usa DOIS parâmetros, os dois com o nome já em minúsculas:
 *   `... WHERE ${condicaoInstrutor("t")}`, [nome.toLowerCase(), nome.toLowerCase()]
 */
function condicaoInstrutor(alias = "t") {
  return `(LOWER(TRIM(${alias}.instrutor)) = ? OR EXISTS (
    SELECT 1 FROM treinamento_instrutores ti
     WHERE ti.treinamento_id = ${alias}.id AND LOWER(TRIM(ti.instrutor)) = ?))`;
}

/** Nomes dos instrutores adicionais de UMA turma ([] se a tabela ainda não existe). */
async function adicionaisDaTurma(treinamentoId, db = pool) {
  try {
    const [rows] = await db.query(
      "SELECT instrutor FROM treinamento_instrutores WHERE treinamento_id = ? ORDER BY id",
      [Number(treinamentoId)]
    );
    return rows.map((r) => String(r.instrutor || "").trim()).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/** O nome informado é instrutor adicional desta turma? */
async function ehInstrutorAdicional(treinamentoId, nome, db = pool) {
  const alvo = chave(nome);
  if (!alvo) return false;
  const lista = await adicionaisDaTurma(treinamentoId, db);
  return lista.some((n) => chave(n) === alvo);
}

/** Principal + adicionais, sem repetir, para exibição. */
function todosOsInstrutores(principal, adicionais = []) {
  const vistos = new Set();
  const out = [];
  for (const n of [principal, ...adicionais]) {
    const nome = String(n || "").trim();
    if (!nome || vistos.has(chave(nome))) continue;
    vistos.add(chave(nome));
    out.push(nome);
  }
  return out;
}

// A tabela treinamento_instrutores só existe depois da migração; consulta em cache
// por 60 s para os relatórios não testarem a cada chamada.
let _disp = { ok: false, ts: 0 };
async function adicionaisDisponiveis() {
  const agora = Date.now();
  if (agora - _disp.ts < 60000) return _disp.ok;
  try {
    await pool.query("SELECT 1 FROM treinamento_instrutores LIMIT 1");
    _disp = { ok: true, ts: agora };
  } catch (_) {
    _disp = { ok: false, ts: agora };
  }
  return _disp.ok;
}

/**
 * Tabela derivada "uma linha por (turma, instrutor)": as colunas de treinamentos
 * mais `instrutor_ref` (o instrutor daquela linha — principal ou adicional).
 * É o que faz cada instrutor ver a turma inteira (horas cheias, NPS, avaliação)
 * nos relatórios POR INSTRUTOR. Relatórios de TOTAL continuam em `treinamentos`
 * (uma linha por turma), para a ação não contar duas vezes.
 *   FROM ${await turmasPorInstrutorSql()} t   →   use t.instrutor_ref
 */
async function turmasPorInstrutorSql() {
  const base = "SELECT t0.*, TRIM(t0.instrutor) AS instrutor_ref FROM treinamentos t0";
  if (!(await adicionaisDisponiveis())) return `(${base})`;
  return `(${base}
    UNION ALL
    SELECT t0.*, TRIM(ti.instrutor) AS instrutor_ref
      FROM treinamentos t0
      JOIN treinamento_instrutores ti ON ti.treinamento_id = t0.id
     WHERE TRIM(ti.instrutor) <> ''
       AND LOWER(TRIM(ti.instrutor)) <> LOWER(TRIM(COALESCE(t0.instrutor, ''))))`;
}

/** Mapa treinamento_id → [nomes dos adicionais], para quem já tem a lista de turmas em memória. */
async function mapaAdicionais(empresaId = null, db = pool) {
  const out = new Map();
  if (!(await adicionaisDisponiveis())) return out;
  const [rows] = await db.query(
    `SELECT ti.treinamento_id, TRIM(ti.instrutor) AS instrutor
       FROM treinamento_instrutores ti
       ${empresaId ? "JOIN treinamentos t ON t.id = ti.treinamento_id WHERE t.empresa_id = ?" : ""}
      ORDER BY ti.treinamento_id, ti.id`,
    empresaId ? [empresaId] : []
  );
  for (const r of rows) {
    if (!out.has(r.treinamento_id)) out.set(r.treinamento_id, []);
    out.get(r.treinamento_id).push(r.instrutor);
  }
  return out;
}

module.exports = {
  chave, condicaoInstrutor, adicionaisDaTurma, ehInstrutorAdicional, todosOsInstrutores,
  adicionaisDisponiveis, turmasPorInstrutorSql, mapaAdicionais,
};
