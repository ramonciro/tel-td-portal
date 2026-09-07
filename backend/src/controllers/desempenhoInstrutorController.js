/**
 * desempenhoInstrutorController.js
 *
 * GET /api/desempenho-instrutor?periodo=mensal&ano=2026&mes=9[&instrutor=Fulano]
 * GET /api/desempenho-instrutor?periodo=trimestral&ano=2026&trimestre=3[&instrutor=Fulano]
 *
 * Scorecard de instrutor (CH, frequência, avaliação, NPS) — ver
 * desempenhoInstrutorResolver.js para o cálculo e as ressalvas sobre
 * cobertura de avaliação e o índice geral.
 *
 * Perfil "instrutor" só pode ver o próprio scorecard — o parâmetro
 * `instrutor` da query é ignorado nesse caso e substituído pelo nome do
 * usuário logado (mesmo padrão de auto-escopo já usado em
 * avaliacoesTreinandosController.listAvaliacoesTreinandos para o perfil
 * treinando). Coordenador/supervisor/superintendente podem filtrar por
 * qualquer instrutor, ou ver todos de uma vez (sem o parâmetro).
 */

const { getScorecardInstrutor } = require("../services/desempenhoInstrutorResolver");

async function getDesempenho(req, res) {
  try {
    const perfil = String(req.user?.perfil || "").toLowerCase();
    const nomeUsuario = String(req.user?.nome || "").trim();
    const q = req.query || {};

    let instrutor = q.instrutor || undefined;
    if (perfil === "instrutor") {
      if (!nomeUsuario) {
        return res.status(400).json({ ok: false, message: "Usuário não identificado" });
      }
      instrutor = nomeUsuario;
    }

    const resultado = await getScorecardInstrutor({
      instrutor,
      periodo: q.periodo === "trimestral" ? "trimestral" : "mensal",
      ano: q.ano ? Number(q.ano) : undefined,
      mes: q.mes ? Number(q.mes) : undefined,
      trimestre: q.trimestre ? Number(q.trimestre) : undefined,
      empresaId: req.empresaId,
    });

    return res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("[desempenho-instrutor] getDesempenho:", error);
    return res.status(400).json({ ok: false, message: error.message || "Erro ao calcular desempenho do instrutor." });
  }
}

module.exports = { getDesempenho };
