const { getResumoPresenca } = require("../services/presencaResolver");

async function listarResumoGeral(req, res) {
  try {
    const dados = await getResumoPresenca();
    return res.json({ ok: true, itens: dados });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao montar o resumo de presença",
      error: error.message,
    });
  }
}

async function obterResumoPorTreinamento(req, res) {
  try {
    const { treinamento_id } = req.params;
    const dados = await getResumoPresenca({ treinamentoId: Number(treinamento_id) });
    if (!dados.length) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }
    return res.json({ ok: true, item: dados[0] });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao montar o resumo de presença",
      error: error.message,
    });
  }
}

module.exports = { listarResumoGeral, obterResumoPorTreinamento };
