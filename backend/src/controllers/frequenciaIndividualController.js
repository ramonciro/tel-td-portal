const { getFrequenciaPorParticipante } = require("../services/presencaResolver");

async function getFrequenciaIndividual(req, res) {
  try {
    const { cliente, treinamento_id, inicio, fim } = req.query || {};

    const itens = await getFrequenciaPorParticipante({
      cliente: cliente || undefined,
      treinamentoId: treinamento_id ? Number(treinamento_id) : undefined,
      inicio: inicio || undefined,
      fim: fim || undefined,
    });

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
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar frequência individual",
      error: error.message,
    });
  }
}

module.exports = { getFrequenciaIndividual };
