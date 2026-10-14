const { getFrequenciaPorParticipante } = require("../services/presencaResolver");
const { tenantScopeFor } = require("../lib/tenantScope");

// Pacote Superintendente (24/09/2026): a superintendente chega aqui a partir
// do drill-down de uma turma no Dashboard (que já é cross-tenant pra ela) —
// sem esta liberação ela via a tela vazia (ou 403, ver index.js) ao clicar
// numa turma de outro tenant. ATENÇÃO: este endpoint já teve um vazamento
// cross-tenant real, corrigido na Fase 4 (ver comentário abaixo) — por isso
// o cross-tenant aqui é restrito, deliberadamente, só ao perfil
// superintendente, e nunca solto para todo mundo de novo.
const CROSS_TENANT_ROLES = ["superintendente"];

async function getFrequenciaIndividual(req, res) {
  try {
    const { cliente, treinamento_id, inicio, fim } = req.query || {};
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });

    const itensTodos = await getFrequenciaPorParticipante({
      cliente: cliente || undefined,
      treinamentoId: treinamento_id ? Number(treinamento_id) : undefined,
      inicio: inicio || undefined,
      fim: fim || undefined,
      // Fase 4 (isolamento multi-tenant): faltava esta linha — sem ela, a
      // rota devolvia frequência de participantes de TODAS as empresas.
      // Agora passa por tenantScopeFor (empresaId = null só quando o perfil
      // está em CROSS_TENANT_ROLES, hoje apenas superintendente).
      empresaId: empresaId || undefined,
    });

    // Treinando também consulta esta rota (barra de frequência em Minhas
    // Turmas e tela "Meu histórico"), mas só pode ver a PRÓPRIA linha: o
    // restante da lista é filtrado aqui, no servidor, e nunca sai da API.
    const perfil = String(req.user?.perfil || "").toLowerCase().trim();
    let itens = itensTodos;
    if (perfil === "treinando") {
      const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      const meuNome = norm(req.user?.nome);
      itens = meuNome ? itensTodos.filter((i) => norm(i.treinando_nome) === meuNome) : [];
    }

    const totalTreinandos = itens.length;

    const mediaFrequencia = totalTreinandos
      ? Number(
          (
            itens.reduce((acc, item) => acc + Number(item.frequencia_percentual || 0), 0) / totalTreinandos
          ).toFixed(1)
        )
      : 0;

    const criticos = itens.filter((item) => Number(item.frequencia_percentual || 0) < 75).length;
    const atencao = itens.filter((item) => {
      const freq = Number(item.frequencia_percentual || 0);
      return freq >= 75 && freq < 90;
    }).length;
    const estaveis = itens.filter((item) => Number(item.frequencia_percentual || 0) >= 90).length;

    return res.json({
      ok: true,
      kpis: {
        treinandos: totalTreinandos,
        media_frequencia: mediaFrequencia,
        criticos,
        atencao,
        estaveis,
      },
      itens,
    });
  } catch (error) {
    console.error("[frequenciaIndividualController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar frequência individual"});
  }
}

module.exports = { getFrequenciaIndividual };
