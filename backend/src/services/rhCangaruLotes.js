/**
 * rhCangaruLotes.js — Lotes de importação do Canguru e “Desfazer importação” (Pacote 9c, 13/11/2026).
 *
 * Cada importação gravada (operador, supervisor ou admissões) cria um lote. Durante a gravação, o importador registra aqui o que
 * criou e o que alterou (com o estado anterior). Desfazer um lote:
 *   - apaga as avaliações que o lote criou e devolve as que ele atualizou ao valor anterior;
 *   - só mexe numa avaliação se nenhum lote posterior a tocou (senão ela é mantida e o motivo aparece no resultado);
 *   - apaga novatos que o lote criou e que ficaram sem nenhuma avaliação e sem ponto de atenção;
 *   - devolve campos de novatos (site, serviço, supervisor, data de admissão...) ao valor anterior, se ninguém os mudou depois.
 * Pessoas cadastradas pelo importador NÃO são apagadas (o cadastro de pessoas é compartilhado com o resto do portal).
 *
 * Importações anteriores a este pacote não têm lote: ficam listadas por arquivo e dia, e só dá para EXCLUIR (sem devolver o antes).
 */
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");

const erroHttp = (status, message) => Object.assign(new Error(message), { status });
const CAMPOS_NOVATO = ["matricula", "site", "servico", "funcao", "supervisor", "coordenador", "data_admissao", "admissao_origem"];
const TABELA_AVAL = { rh_canguru_avaliacoes: "operador", rh_canguru_aval_sup: "supervisor" };

const doisD = (n) => String(n).padStart(2, "0");
/** Date (hora local do servidor, como o mysql2 entrega) -> "AAAA-MM-DD HH:MM:SS", para devolver ao banco do mesmo jeito. */
function valorParaJson(v) {
  if (v instanceof Date) return `${v.getFullYear()}-${doisD(v.getMonth() + 1)}-${doisD(v.getDate())} ${doisD(v.getHours())}:${doisD(v.getMinutes())}:${doisD(v.getSeconds())}`;
  return v === undefined ? null : v;
}
function snapshot(row, campos) {
  const o = {};
  for (const k of campos || Object.keys(row)) o[k] = valorParaJson(row[k]);
  return o;
}
const normCmp = (v) => { if (v === null || v === undefined || v === "") return null; const t = String(v); return /^\d{4}-\d{2}-\d{2}( |T|$)/.test(t) ? t.slice(0, 10) : t; };
const mesmoValor = (a, b) => normCmp(a) === normCmp(b);

async function criarLote(conn, { empresaId, usuario, origem, arquivos }) {
  const [r] = await conn.query(
    `INSERT INTO rh_canguru_lotes (empresa_id, origem, arquivos, usuario_id, usuario_nome) VALUES (?,?,?,?,?)`,
    [empresaId, origem, String(arquivos || "").slice(0, 500) || null, usuario?.id ?? null, usuario?.nome ? String(usuario.nome).slice(0, 150) : null]);
  return r.insertId;
}
async function registrar(conn, loteId, empresaId, tabela, registroId, acao, antes, depois) {
  await conn.query(
    `INSERT INTO rh_canguru_lote_itens (lote_id, empresa_id, tabela, registro_id, acao, antes, depois) VALUES (?,?,?,?,?,?,?)`,
    [loteId, empresaId, tabela, registroId, acao, antes ? JSON.stringify(antes) : null, depois ? JSON.stringify(depois) : null]);
}
async function fecharLote(conn, loteId, resumo) {
  const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM rh_canguru_lote_itens WHERE lote_id = ?`, [loteId]);
  if (!n) { await conn.query(`DELETE FROM rh_canguru_lotes WHERE id = ?`, [loteId]); return null; }
  await conn.query(`UPDATE rh_canguru_lotes SET resumo = ? WHERE id = ?`, [JSON.stringify(resumo || {}), loteId]);
  return loteId;
}
/** Registra a mudança de um novato (criou ou alterou campos). `antes` = linha lida antes; `depois` = linha lida depois. */
async function registrarNovato(conn, loteId, empresaId, novatoId, antesRow, depoisRow) {
  if (!antesRow) { await registrar(conn, loteId, empresaId, "rh_canguru_novatos", novatoId, "criou", null, null); return; }
  const a = snapshot(antesRow, CAMPOS_NOVATO), d = snapshot(depoisRow, CAMPOS_NOVATO);
  if (CAMPOS_NOVATO.every((k) => mesmoValor(a[k], d[k]))) return;
  await registrar(conn, loteId, empresaId, "rh_canguru_novatos", novatoId, "alterou", a, d);
}
/** Registra uma avaliação (operador ou supervisor): `antesRow` é a linha que já existia, ou null se foi criada. */
async function registrarAvaliacao(conn, loteId, empresaId, tabela, id, antesRow) {
  if (!antesRow) { await registrar(conn, loteId, empresaId, tabela, id, "criou", null, null); return; }
  await registrar(conn, loteId, empresaId, tabela, id, "alterou", snapshot(antesRow), null);
}

// ── Listagem ──────────────────────────────────────────────────────────
async function listar(empresaId) {
  const [lotes] = await pool.query(
    `SELECT l.*, (SELECT COUNT(*) FROM rh_canguru_lote_itens i WHERE i.lote_id = l.id) AS itens FROM rh_canguru_lotes l WHERE l.empresa_id = ? ORDER BY l.id DESC LIMIT 100`, [empresaId]);
  const [cont] = await pool.query(
    `SELECT lote_id, tabela, acao, COUNT(*) AS n FROM rh_canguru_lote_itens WHERE empresa_id = ? GROUP BY lote_id, tabela, acao`, [empresaId]);
  const porLote = new Map();
  for (const c of cont) {
    if (!porLote.has(c.lote_id)) porLote.set(c.lote_id, { avaliacoes_criadas: 0, avaliacoes_atualizadas: 0, novatos_criados: 0, novatos_alterados: 0 });
    const o = porLote.get(c.lote_id);
    if (c.tabela === "rh_canguru_novatos") { if (c.acao === "criou") o.novatos_criados += Number(c.n); else o.novatos_alterados += Number(c.n); }
    else if (c.acao === "criou") o.avaliacoes_criadas += Number(c.n); else o.avaliacoes_atualizadas += Number(c.n);
  }
  const lista = lotes.map((l) => ({
    id: l.id, origem: l.origem, arquivos: l.arquivos, usuario: l.usuario_nome, criado_em: l.criado_em, desfeito_em: l.desfeito_em,
    desfeito_resumo: l.desfeito_resumo ? safeJson(l.desfeito_resumo) : null, ...(porLote.get(l.id) || { avaliacoes_criadas: 0, avaliacoes_atualizadas: 0, novatos_criados: 0, novatos_alterados: 0 }),
  }));
  // Importações sem lote (feitas antes deste pacote): agrupadas por arquivo e dia
  const anteriores = [];
  for (const [tabela, origem] of Object.entries(TABELA_AVAL)) {
    const [rows] = await pool.query(
      `SELECT COALESCE(origem_arquivo, '') AS arquivo, DATE(importado_em) AS dia, COUNT(*) AS linhas, COUNT(DISTINCT novato_id) AS novatos
         FROM ${tabela} WHERE empresa_id = ? AND lote_id IS NULL GROUP BY COALESCE(origem_arquivo, ''), DATE(importado_em) ORDER BY dia DESC, arquivo`, [empresaId]);
    for (const r of rows) anteriores.push({ origem, arquivo: r.arquivo, dia: r.dia instanceof Date ? `${r.dia.getFullYear()}-${doisD(r.dia.getMonth() + 1)}-${doisD(r.dia.getDate())}` : String(r.dia).slice(0, 10), linhas: Number(r.linhas), novatos: Number(r.novatos) });
  }
  return { lotes: lista, anteriores };
}
function safeJson(t) { try { return JSON.parse(t); } catch (_) { return null; } }

// ── Desfazer um lote ──────────────────────────────────────────────────
async function desfazer({ empresaId, loteId, usuario }) {
  return comTransacao(async (conn) => {
    const [[lote]] = await conn.query(`SELECT * FROM rh_canguru_lotes WHERE id = ? AND empresa_id = ? FOR UPDATE`, [loteId, empresaId]);
    if (!lote) throw erroHttp(404, "Importação não encontrada.");
    if (lote.desfeito_em) throw erroHttp(409, "Essa importação já foi desfeita.");
    const [itens] = await conn.query(`SELECT * FROM rh_canguru_lote_itens WHERE lote_id = ? ORDER BY id DESC`, [loteId]);
    const rel = { avaliacoes_apagadas: 0, avaliacoes_restauradas: 0, avaliacoes_mantidas: 0, novatos_apagados: 0, novatos_mantidos: 0, novatos_restaurados: 0, novatos_nao_restaurados: 0 };
    const novatosCriados = [];
    for (const it of itens) {
      if (TABELA_AVAL[it.tabela]) {
        const [[atual]] = await conn.query(`SELECT id, lote_id FROM ${it.tabela} WHERE id = ? AND empresa_id = ?`, [it.registro_id, empresaId]);
        if (!atual) { continue; } // já não existe (apagada por outro caminho)
        if (Number(atual.lote_id) !== Number(loteId)) { rel.avaliacoes_mantidas += 1; continue; } // outro lote mexeu depois
        if (it.acao === "criou") {
          await conn.query(`DELETE FROM ${it.tabela} WHERE id = ? AND empresa_id = ?`, [it.registro_id, empresaId]); rel.avaliacoes_apagadas += 1;
        } else {
          const antes = safeJson(it.antes) || {};
          const cols = Object.keys(antes).filter((k) => !["id", "empresa_id", "novato_id", "tipo"].includes(k));
          if (cols.length) await conn.query(`UPDATE ${it.tabela} SET ${cols.map((c) => `\`${c}\` = ?`).join(", ")} WHERE id = ? AND empresa_id = ?`, [...cols.map((c) => antes[c]), it.registro_id, empresaId]);
          rel.avaliacoes_restauradas += 1;
        }
      } else if (it.tabela === "rh_canguru_novatos") {
        if (it.acao === "criou") { novatosCriados.push(it.registro_id); continue; }
        const antes = safeJson(it.antes) || {}, depois = safeJson(it.depois) || {};
        const [[atual]] = await conn.query(`SELECT * FROM rh_canguru_novatos WHERE id = ? AND empresa_id = ?`, [it.registro_id, empresaId]);
        if (!atual) continue;
        const cur = snapshot(atual, CAMPOS_NOVATO);
        // restaura só os campos que este lote mudou e que ninguém mudou depois
        const cols = CAMPOS_NOVATO.filter((k) => !mesmoValor(antes[k], depois[k]) && mesmoValor(cur[k], depois[k]));
        const todos = CAMPOS_NOVATO.filter((k) => !mesmoValor(antes[k], depois[k]));
        if (cols.length) { await conn.query(`UPDATE rh_canguru_novatos SET ${cols.map((c) => `\`${c}\` = ?`).join(", ")} WHERE id = ? AND empresa_id = ?`, [...cols.map((c) => antes[c]), it.registro_id, empresaId]); rel.novatos_restaurados += 1; }
        if (cols.length < todos.length) rel.novatos_nao_restaurados += 1;
      }
    }
    for (const nid of novatosCriados) {
      const [[a]] = await conn.query(`SELECT (SELECT COUNT(*) FROM rh_canguru_avaliacoes WHERE novato_id = ?) + (SELECT COUNT(*) FROM rh_canguru_aval_sup WHERE novato_id = ?) + (SELECT COUNT(*) FROM rh_canguru_pontos WHERE novato_id = ?) AS n`, [nid, nid, nid]);
      if (Number(a.n) === 0) { await conn.query(`DELETE FROM rh_canguru_novatos WHERE id = ? AND empresa_id = ?`, [nid, empresaId]); rel.novatos_apagados += 1; }
      else rel.novatos_mantidos += 1;
    }
    await conn.query(`UPDATE rh_canguru_lotes SET desfeito_em = NOW(), desfeito_por = ?, desfeito_resumo = ? WHERE id = ?`, [usuario?.id ?? null, JSON.stringify(rel), loteId]);
    return { lote: { id: lote.id, origem: lote.origem, arquivos: lote.arquivos }, ...rel };
  });
}

// ── Excluir importação antiga (sem lote) ──────────────────────────────
async function excluirAnterior({ empresaId, origem, arquivo, dia, removerNovatos }) {
  const tabela = Object.keys(TABELA_AVAL).find((t) => TABELA_AVAL[t] === origem);
  if (!tabela) throw erroHttp(400, "Origem inválida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dia || ""))) throw erroHttp(400, "Dia inválido.");
  return comTransacao(async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, novato_id FROM ${tabela} WHERE empresa_id = ? AND lote_id IS NULL AND COALESCE(origem_arquivo, '') = ? AND DATE(importado_em) = ? FOR UPDATE`, [empresaId, String(arquivo || ""), dia]);
    if (!rows.length) throw erroHttp(404, "Não encontrei avaliações dessa importação (talvez já tenham sido excluídas).");
    await conn.query(`DELETE FROM ${tabela} WHERE id IN (?) AND empresa_id = ?`, [rows.map((r) => r.id), empresaId]);
    let novatosApagados = 0;
    if (removerNovatos) {
      for (const nid of new Set(rows.map((r) => r.novato_id))) {
        const [[a]] = await conn.query(`SELECT (SELECT COUNT(*) FROM rh_canguru_avaliacoes WHERE novato_id = ?) + (SELECT COUNT(*) FROM rh_canguru_aval_sup WHERE novato_id = ?) + (SELECT COUNT(*) FROM rh_canguru_pontos WHERE novato_id = ?) AS n`, [nid, nid, nid]);
        if (Number(a.n) === 0) { await conn.query(`DELETE FROM rh_canguru_novatos WHERE id = ? AND empresa_id = ?`, [nid, empresaId]); novatosApagados += 1; }
      }
    }
    return { avaliacoes_apagadas: rows.length, novatos_apagados: novatosApagados };
  });
}

module.exports = { criarLote, registrar, registrarNovato, registrarAvaliacao, fecharLote, listar, desfazer, excluirAnterior, snapshot };
