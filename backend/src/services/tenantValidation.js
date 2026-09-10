/**
 * tenantValidation.js
 *
 * Fase 4 (isolamento multi-tenant, 08/09/2026): helper compartilhado para
 * validar que um id de referência (responsável, turma etc.) enviado no
 * corpo de uma requisição realmente pertence ao mesmo tenant de quem está
 * fazendo a chamada, antes de gravá-lo numa FK. Sem isso, vários módulos do
 * Oceano do Desenvolvimento aceitavam qualquer id (responsavel_id, turma_id)
 * sem checar dono — como os ids são sequenciais e fáceis de adivinhar, um
 * usuário de uma empresa conseguia plantar uma referência para um usuário/
 * turma de outra empresa, que depois aparecia (nome do responsável, por
 * exemplo) na resposta da própria empresa que fez a chamada.
 */

const pool = require("../lib/db");

/**
 * Confirma que o usuário `usuarioId` existe e pertence a `empresaId`.
 * Quando `empresaId` é null/undefined (super_admin, visão global), não
 * restringe — mantém o comportamento já existente para esse perfil.
 */
async function usuarioPertenceAoTenant(usuarioId, empresaId) {
  if (!usuarioId) return true;
  if (!empresaId) return true;
  const [rows] = await pool.query(
    `SELECT id FROM usuarios WHERE id = ? AND empresa_id = ? LIMIT 1`,
    [usuarioId, empresaId]
  );
  return rows.length > 0;
}

/**
 * Confirma que o treinamento (turma) `treinamentoId` existe e pertence a
 * `empresaId`. Mesmo comportamento de "não restringe" quando empresaId é
 * null/undefined.
 */
async function treinamentoPertenceAoTenant(treinamentoId, empresaId) {
  if (!treinamentoId) return true;
  if (!empresaId) return true;
  const [rows] = await pool.query(
    `SELECT id FROM treinamentos WHERE id = ? AND empresa_id = ? LIMIT 1`,
    [treinamentoId, empresaId]
  );
  return rows.length > 0;
}

module.exports = { usuarioPertenceAoTenant, treinamentoPertenceAoTenant };
