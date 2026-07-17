const { listarAuditoria } = require("../services/auditoria");

async function listarAuditoriaHandler(req, res) {
  try {
    const { usuario_id, acao, entidade, data_inicio, data_fim, limite } = req.query;
    const itens = await listarAuditoria({
      usuarioId: usuario_id ? Number(usuario_id) : undefined,
      acao: acao || undefined,
      entidade: entidade || undefined,
      dataInicio: data_inicio || undefined,
      dataFim: data_fim || undefined,
      limite: limite ? Number(limite) : undefined,
    });
    return res.json({ ok: true, itens });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar auditoria",
      error: error.message,
    });
  }
}

module.exports = { listarAuditoriaHandler };
