/**
 * capacidadeController.js
 *
 * Endpoints para a visão de Capacidade x Realizado do coordenador:
 *   GET    /api/capacidade                 → capacidade x realizado (filtros: ano, mes, instrutor)
 *   GET    /api/capacidade/regra            → regra automática padrão
 *   PUT    /api/capacidade/regra            → atualizar regra automática padrão
 *   GET    /api/capacidade/overrides        → listar overrides manuais cadastrados
 *   POST   /api/capacidade/overrides        → criar/atualizar override manual (instrutor+mês)
 *   DELETE /api/capacidade/overrides/:id    → remover override manual (volta a usar automático)
 *   GET    /api/capacidade/instrutores      → lista de instrutores conhecidos (p/ preencher select)
 */

const {
  getRegraPadrao,
  atualizarRegraPadrao,
  listarOverrides,
  salvarOverride,
  excluirOverride,
  listarInstrutoresConhecidos,
  listarOperacoesConhecidas,
  getCapacidadeVsRealizado,
  getPainel: resolverGetPainel,
  getCapacityConsumido,
  getRanking,
  getAderenciaPorTema,
  getDistribuicaoPorOperacao,
  getAlertas: resolverGetAlertas,
} = require("../services/capacidadeResolver");

async function getCapacidade(req, res) {
  try {
    const { ano, mes, instrutor, cliente, data_inicio, data_fim } = req.query || {};
    const resultado = await getCapacidadeVsRealizado({
      ano: ano ? Number(ano) : undefined,
      mes: mes ? Number(mes) : undefined,
      instrutor: instrutor || undefined,
      cliente: cliente || undefined,
      dataInicio: data_inicio || undefined,
      dataFim: data_fim || undefined,
      empresaId: req.empresaId,
    });

    const totais = resultado.reduce(
      (acc, r) => {
        acc.horas_realizadas += r.horas_realizadas;
        acc.capacidade_horas += r.capacidade_horas;
        return acc;
      },
      { horas_realizadas: 0, capacidade_horas: 0 }
    );

    return res.json({
      ok: true,
      itens: resultado,
      totais: {
        horas_realizadas: Math.round(totais.horas_realizadas * 10) / 10,
        capacidade_horas: Math.round(totais.capacidade_horas * 10) / 10,
        ocupacao_pct: totais.capacidade_horas
          ? Math.round((totais.horas_realizadas / totais.capacidade_horas) * 1000) / 10
          : null,
      },
    });
  } catch (error) {
    console.error("[capacidade] getCapacidade:", error);
    return res.status(500).json({ ok: false, message: "Erro ao buscar capacidade x realizado.", error: error.message });
  }
}

async function getRegra(req, res) {
  try {
    const regra = await getRegraPadrao();
    return res.json({ ok: true, regra });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao buscar regra padrão.", error: error.message });
  }
}

async function putRegra(req, res) {
  try {
    const { horas_dia_padrao, hc_dia_padrao, considerar_domingo } = req.body || {};
    if (horas_dia_padrao == null || hc_dia_padrao == null) {
      return res.status(400).json({ ok: false, message: "Informe horas_dia_padrao e hc_dia_padrao." });
    }
    const regra = await atualizarRegraPadrao({
      horasDiaPadrao: horas_dia_padrao,
      hcDiaPadrao: hc_dia_padrao,
      considerarDomingo: !!considerar_domingo,
    });
    return res.json({ ok: true, regra, message: "Regra padrão atualizada com sucesso." });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao atualizar regra padrão.", error: error.message });
  }
}

async function getOverrides(req, res) {
  try {
    const { instrutor, ano } = req.query || {};
    const itens = await listarOverrides({ instrutor: instrutor || undefined, ano: ano ? Number(ano) : undefined });
    return res.json({ ok: true, itens });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao listar overrides.", error: error.message });
  }
}

async function postOverride(req, res) {
  try {
    const { instrutor, ano, mes, horas_capacidade, hc_capacidade, observacoes } = req.body || {};
    if (!instrutor || !ano || !mes) {
      return res.status(400).json({ ok: false, message: "Informe instrutor, ano e mês." });
    }
    if (Number(mes) < 1 || Number(mes) > 12) {
      return res.status(400).json({ ok: false, message: "Mês inválido (use 1 a 12)." });
    }
    await salvarOverride({
      instrutor,
      ano,
      mes,
      horasCapacidade: horas_capacidade || 0,
      hcCapacidade: hc_capacidade || 0,
      observacoes,
      criadoPor: req.user?.nome || req.user?.email || null,
    });
    return res.json({ ok: true, message: "Capacidade do instrutor salva com sucesso." });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao salvar override de capacidade.", error: error.message });
  }
}

async function deleteOverride(req, res) {
  try {
    const { id } = req.params;
    await excluirOverride(id);
    return res.json({ ok: true, message: "Override removido — instrutor volta a usar a regra automática." });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao remover override.", error: error.message });
  }
}

async function getInstrutores(req, res) {
  try {
    const instrutores = await listarInstrutoresConhecidos(req.empresaId);
    return res.json({ ok: true, instrutores });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao listar instrutores.", error: error.message });
  }
}

async function getOperacoes(req, res) {
  try {
    const operacoes = await listarOperacoesConhecidas(req.empresaId);
    return res.json({ ok: true, operacoes });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao listar operações.", error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Visões agregadas — painel executivo, capacity x consumido, ranking,
// aderência por tema e distribuição por operação. Tudo calculado a partir do
// que já está registrado (turmas + cronograma); nenhuma delas depende de
// lançamento manual adicional.
// ---------------------------------------------------------------------------

async function getPainel(req, res) {
  try {
    const q = req.query || {};
    const painel = await resolverGetPainel({
      meses: q.meses ? Number(q.meses) : undefined,
      instrutor: q.instrutor || undefined,
      cliente: q.cliente || undefined,
      empresaId: req.empresaId,
    });
    return res.json({ ok: true, ...painel });
  } catch (error) {
    console.error("[capacidade] getPainel:", error);
    return res.status(500).json({ ok: false, message: "Erro ao montar painel de capacidade.", error: error.message });
  }
}

async function getCapacity(req, res) {
  try {
    const q = req.query || {};
    const resultado = await getCapacityConsumido({ meses: q.meses ? Number(q.meses) : undefined, cliente: q.cliente || undefined, empresaId: req.empresaId });
    return res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("[capacidade] getCapacity:", error);
    return res.status(500).json({ ok: false, message: "Erro ao montar capacity x consumido.", error: error.message });
  }
}

async function getRankingHandler(req, res) {
  try {
    const q = req.query || {};
    const itens = await getRanking({ meses: q.meses ? Number(q.meses) : undefined, cliente: q.cliente || undefined, empresaId: req.empresaId });
    return res.json({ ok: true, itens });
  } catch (error) {
    console.error("[capacidade] getRanking:", error);
    return res.status(500).json({ ok: false, message: "Erro ao montar ranking de instrutores.", error: error.message });
  }
}

async function getAderencia(req, res) {
  try {
    const q = req.query || {};
    const itens = await getAderenciaPorTema({
      cliente: q.cliente || undefined,
      ano: q.ano ? Number(q.ano) : undefined,
      mes: q.mes ? Number(q.mes) : undefined,
      dataInicio: q.data_inicio || undefined,
      dataFim: q.data_fim || undefined,
      empresaId: req.empresaId,
    });
    return res.json({ ok: true, itens });
  } catch (error) {
    console.error("[capacidade] getAderencia:", error);
    return res.status(500).json({ ok: false, message: "Erro ao montar aderência por tema.", error: error.message });
  }
}

async function getDistribuicao(req, res) {
  try {
    const q = req.query || {};
    const resultado = await getDistribuicaoPorOperacao({ meses: q.meses ? Number(q.meses) : undefined, empresaId: req.empresaId });
    return res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("[capacidade] getDistribuicao:", error);
    return res.status(500).json({ ok: false, message: "Erro ao montar distribuição por operação.", error: error.message });
  }
}

async function getAlertasHandler(req, res) {
  try {
    const resultado = await resolverGetAlertas(req.empresaId);
    return res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("[capacidade] getAlertas:", error);
    return res.status(500).json({ ok: false, message: "Erro ao montar alertas de ocupação.", error: error.message });
  }
}

module.exports = {
  getCapacidade,
  getRegra,
  putRegra,
  getOverrides,
  postOverride,
  deleteOverride,
  getInstrutores,
  getOperacoes,
  getPainel,
  getCapacity,
  getRankingHandler,
  getAderencia,
  getDistribuicao,
  getAlertasHandler,
};
