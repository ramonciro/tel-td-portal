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

module.exports = { chave, condicaoInstrutor, adicionaisDaTurma, ehInstrutorAdicional, todosOsInstrutores };
