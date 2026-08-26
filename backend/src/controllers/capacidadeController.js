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
  getCapacidadeVsRealizado,
} = require("../services/capacidadeResolver");

async function getCapacidade(req, res) {
  try {
    const { ano, mes, instrutor, data_inicio, data_fim } = req.query || {};
    const resultado = await getCapacidadeVsRealizado({
      ano: ano ? Number(ano) : undefined,
      mes: mes ? Number(mes) : undefined,
      instrutor: instrutor || undefined,
      dataInicio: data_inicio || undefined,
      dataFim: data_fim || undefined,
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
    const instrutores = await listarInstrutoresConhecidos();
    return res.json({ ok: true, instrutores });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao listar instrutores.", error: error.message });
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
};
