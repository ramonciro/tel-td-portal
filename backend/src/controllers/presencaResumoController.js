const { getResumoPresenca } = require("../services/presencaResolver");
const { tenantScopeFor } = require("../lib/tenantScope");

// Decisão 12 (Pacote Salas/Assistente/CPF/Horas/Farol MPT, 15/09/2026): a
// Assistente de Treinamento enxerga o resumo de presença de qualquer tenant
// nesta tela (Presenças) — decidido aqui, por chamada, nunca no
// clientMiddleware. Importante: getResumoPresenca() também é usada por
// dashboardTreinamentosController.js e desempenhoInstrutorController.js,
// que continuam chamando com req.empresaId diretamente (sem passar por
// tenantScopeFor) — se a exceção tivesse sido posta dentro de
// getResumoPresenca(), ela vazaria pra essas telas de forma implícita. Ver
// claude/auditoria-riscos-cruzados-pacote-salas-2026-09.md.
//
// Pacote Superintendente (24/09/2026): a superintendente também precisa ver
// o resumo de presença de todos os tenants (tela Gestão de Turmas). Como o
// Dashboard TAMBÉM está no escopo cross-tenant dela (diferente da
// Assistente), foi adicionado o mesmo tenantScopeFor com "superintendente"
// diretamente em dashboardTreinamentosController.js (que não importa este
// arquivo — ele chama getResumoPresenca diretamente), então não há
// duplicidade nem vazamento cruzado entre os dois pacotes.
const CROSS_TENANT_ROLES = ["assistente_treinamento", "superintendente"];

// Sprint 1 fix: passa req.empresaId para filtrar por tenant automaticamente.
// Sem req.empresaId (super_admin ou migration pendente) → retorna tudo.
async function listarResumoGeral(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const dados = await getResumoPresenca({ empresaId });
    return res.json({ ok: true, itens: dados });
  } catch (error) {
    console.error("[presencaResumoController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao montar o resumo de presença"});
  }
}

async function obterResumoPorTreinamento(req, res) {
  try {
    const { treinamento_id } = req.params;
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const dados = await getResumoPresenca({
      treinamentoId: Number(treinamento_id),
      empresaId,
    });
    if (!dados.length) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }
    return res.json({ ok: true, item: dados[0] });
  } catch (error) {
    console.error("[presencaResumoController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao montar o resumo de presença"});
  }
}

module.exports = { listarResumoGeral, obterResumoPorTreinamento };
