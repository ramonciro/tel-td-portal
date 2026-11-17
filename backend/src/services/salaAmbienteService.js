/**
 * salaAmbienteService.js — Salas por ambiente (17/11/2026)
 *
 * O catálogo de salas é ÚNICO (a sala física existe uma vez) e a agenda dela é compartilhada entre ambientes:
 * turma de um ambiente ocupando a sala bloqueia o horário nos demais. O que muda é QUEM USA: cada ambiente
 * (empresa_id) escolhe quais salas do catálogo aparecem para ele, na tabela sala_ambientes.
 *
 * Regras:
 *  - `empresaId` nulo (Super Admin e Assistente de Treinamento, que veem todos os ambientes) = sem filtro.
 *  - Ambiente vê o detalhe (tema, cliente, instrutor) só do que é dele; a ocupação de outro ambiente aparece
 *    como "Ocupada por outro ambiente".
 *  - Compatível com banco sem a tabela (migração ainda não rodou): tudo vira no-op, como era antes.
 */
const pool = require("../lib/db");

let _cache = { tem: null, em: 0 };
async function temTabela() {
  const agora = Date.now();
  if (_cache.tem === true) return true;
  if (_cache.tem === false && agora - _cache.em < 60000) return false;
  try {
    const [r] = await pool.query("SHOW TABLES LIKE 'sala_ambientes'");
    _cache = { tem: r.length > 0, em: agora };
  } catch (_) {
    _cache = { tem: false, em: agora };
  }
  return _cache.tem;
}
function _resetCache() { _cache = { tem: null, em: 0 }; }

/** Ids das salas habilitadas no ambiente; null = sem filtro (sem ambiente ou tabela ainda inexistente). */
async function idsDoAmbiente(empresaId) {
  if (!empresaId || !(await temTabela())) return null;
  const [rows] = await pool.query("SELECT sala_id FROM sala_ambientes WHERE empresa_id = ?", [empresaId]);
  return new Set(rows.map((r) => Number(r.sala_id)));
}

async function salaDoAmbiente(salaId, empresaId) {
  const ids = await idsDoAmbiente(empresaId);
  return ids === null ? true : ids.has(Number(salaId));
}

/** Ambientes que usam a sala (vazio se a tabela não existe). */
async function ambientesDaSala(salaId) {
  if (!(await temTabela())) return [];
  const [rows] = await pool.query("SELECT empresa_id FROM sala_ambientes WHERE sala_id = ?", [salaId]);
  return rows.map((r) => Number(r.empresa_id));
}

async function contagemPorSala() {
  if (!(await temTabela())) return new Map();
  const [rows] = await pool.query("SELECT sala_id, COUNT(*) AS n FROM sala_ambientes GROUP BY sala_id");
  return new Map(rows.map((r) => [Number(r.sala_id), Number(r.n)]));
}

async function habilitar(salaId, empresaId) {
  if (!(await temTabela())) return false;
  await pool.query("INSERT IGNORE INTO sala_ambientes (sala_id, empresa_id) VALUES (?, ?)", [salaId, empresaId]);
  return true;
}
async function desabilitar(salaId, empresaId) {
  if (!(await temTabela())) return false;
  await pool.query("DELETE FROM sala_ambientes WHERE sala_id = ? AND empresa_id = ?", [salaId, empresaId]);
  return true;
}

/** Turmas do ambiente que ainda usam a sala (não encerradas e não canceladas). */
async function turmasFuturasNaSala(salaId, empresaId, hojeISO) {
  const [rows] = await pool.query(
    `SELECT t.id, t.tema, DATE_FORMAT(COALESCE(t.data_inicio, t.data), '%d/%m/%Y') AS inicio
       FROM treinamentos t
      WHERE t.sala_id = ? AND t.empresa_id = ?
        AND (t.status IS NULL OR LOWER(TRIM(t.status)) NOT LIKE '%cancel%')
        AND (t.modalidade IS NULL OR LOWER(TRIM(t.modalidade)) <> 'online')
        AND DATE_FORMAT(COALESCE(t.data_fim, t.data_inicio, t.data), '%Y-%m-%d') >= ?
      ORDER BY COALESCE(t.data_inicio, t.data) ASC LIMIT 5`,
    [salaId, empresaId, hojeISO]
  );
  return rows;
}

/** O item de ocupação/conflito é de outro ambiente? (empresa nula = bloqueio geral: não mascara) */
function ehDeOutroAmbiente(itemEmpresaId, empresaId) {
  return Boolean(empresaId) && itemEmpresaId != null && Number(itemEmpresaId) !== Number(empresaId);
}

const ROTULO_OUTRO = "Ocupada por outro ambiente";
/** Remove o detalhe de turma/bloqueio de outro ambiente. */
function mascarar(item, empresaId) {
  if (!ehDeOutroAmbiente(item.empresa_id, empresaId)) return item;
  return {
    ...item,
    tema: ROTULO_OUTRO, cliente: "Outro ambiente", instrutor: null, criado_por: null, id: null,
    outro_ambiente: true,
  };
}

module.exports = {
  temTabela, _resetCache, idsDoAmbiente, salaDoAmbiente, ambientesDaSala, contagemPorSala,
  habilitar, desabilitar, turmasFuturasNaSala, ehDeOutroAmbiente, mascarar, ROTULO_OUTRO,
};
