/**
 * tenantScope.js — Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026)
 *
 * Decisão de arquitetura registrada em claude/auditoria-riscos-cruzados-
 * pacote-salas-2026-09.md: o isolamento multi-tenant do sistema inteiro roda
 * em cima de uma única variável (`req.empresaId`, calculada uma vez no
 * clientMiddleware) que todo controller usa como `req.empresaId ? "AND
 * empresa_id = ?" : ""`. O jeito "fácil" de dar visão cross-tenant à
 * Assistente de Treinamento seria tratá-la como o super_admin é tratado
 * hoje nesse middleware (empresaId = null sempre) — mas isso destravaria
 * "sem filtro" em QUALQUER rota que ela alcançasse, não só nas 4 telas
 * previstas (Turmas, Salas, Presenças, Reembolso de Transporte), porque
 * funções de consulta como getResumoPresenca() são compartilhadas com
 * telas fora desse escopo (Dashboard, Desempenho do Instrutor).
 *
 * Por isso a exceção NUNCA deve tocar clientMiddleware.js. Este helper é
 * chamado individualmente, dentro de cada handler das 4 telas, e devolve o
 * empresaId "efetivo" a usar SÓ NAQUELA chamada — o valor real do tenant
 * para qualquer outro perfil, ou `null` (sem filtro) quando o perfil de
 * quem está logado está na lista de perfis liberados para aquele
 * endpoint específico. req.empresaId em si nunca é modificado.
 */

/**
 * @param {import('express').Request} req
 * @param {{ crossTenantRoles?: string[] }} opts
 * @returns {{ empresaId: number|null, crossTenant: boolean }}
 */
function tenantScopeFor(req, { crossTenantRoles = [] } = {}) {
  const perfil = String(req.user?.perfil || "").toLowerCase().trim();
  const permitido = crossTenantRoles.map((r) => String(r).toLowerCase().trim());
  const crossTenant = permitido.length > 0 && permitido.includes(perfil);

  return {
    empresaId: crossTenant ? null : req.empresaId,
    crossTenant,
  };
}

module.exports = { tenantScopeFor };
