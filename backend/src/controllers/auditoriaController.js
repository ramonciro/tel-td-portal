const { listarAuditoria, contarAuditoriaPorAcao } = require("../services/auditoria");

async function listarAuditoriaHandler(req, res) {
  try {
    const { usuario_id, acao, entidade, data_inicio, data_fim, limite } = req.query;
    const filtroBase = {
      usuarioId: usuario_id ? Number(usuario_id) : undefined,
      acao: acao || undefined,
      entidade: entidade || undefined,
      dataInicio: data_inicio || undefined,
      dataFim: data_fim || undefined,
      empresaId: req.empresaId,
    };

    const [itens, totais] = await Promise.all([
      listarAuditoria({ ...filtroBase, limite: limite ? Number(limite) : undefined }),
      contarAuditoriaPorAcao(filtroBase),
    ]);

    return res.json({ ok: true, itens, totais });
  } catch (error) {
    const tabelaAusente = /doesn't exist/i.test(error.message);
    return res.status(500).json({
      ok: false,
      message: tabelaAusente
        ? "A tabela auditoria_log ainda não existe neste banco. Rode a migration database/migrations/2026-07-16_auditoria_log.sql no banco de produção e recarregue esta página."
        : `Erro ao listar auditoria: ${error.message}`,
      error: error.message,
    });
  }
}

module.exports = { listarAuditoriaHandler };
