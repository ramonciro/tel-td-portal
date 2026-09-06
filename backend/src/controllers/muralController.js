const {
  getMuralTurma,
  criarPublicacao,
  buscarPublicacao,
  editarPublicacao,
  excluirPublicacao,
} = require("../services/muralResolver");
const { registrarAuditoria } = require("../services/auditoria");

function mensagemErro(error, acaoDescricao) {
  const tabelaAusente = /doesn't exist/i.test(error.message);
  return tabelaAusente
    ? `A tabela turma_publicacoes ainda não existe neste banco. Rode a migration database/migrations/2026-07-17_turma_publicacoes.sql no banco de produção e tente ${acaoDescricao} de novo.`
    : `Erro ao ${acaoDescricao}: ${error.message}`;
}

async function obterMural(req, res) {
  try {
    const treinamentoId = Number(req.params.treinamento_id);
    const mural = await getMuralTurma(treinamentoId, req.empresaId);
    if (!mural) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }
    return res.json({ ok: true, ...mural });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao montar o mural", error: error.message });
  }
}

async function criarPublicacaoHandler(req, res) {
  try {
    const treinamentoId = Number(req.params.treinamento_id);
    const { titulo, conteudo, fixado } = req.body || {};

    if (!conteudo || !String(conteudo).trim()) {
      return res.status(400).json({ ok: false, message: "O conteúdo do aviso é obrigatório" });
    }

    const id = await criarPublicacao({
      treinamentoId,
      autor: req.user,
      titulo,
      conteudo,
      fixado,
      empresaId: req.empresaId,
    });

    registrarAuditoria({
      usuario: req.user,
      acao: "criar",
      entidade: "publicacao_mural",
      entidadeId: id,
      resumo: `${req.user?.nome || "Alguém"} publicou um aviso na turma #${treinamentoId}${titulo ? `: "${titulo}"` : ""}`,
      dadosDepois: { treinamento_id: treinamentoId, titulo, conteudo },
      ip: req.ip,
    });

    return res.status(201).json({ ok: true, id });
  } catch (error) {
    if (error.code === "TREINAMENTO_NAO_ENCONTRADO") {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }
    return res.status(500).json({ ok: false, message: mensagemErro(error, "publicar o aviso"), error: error.message });
  }
}

async function editarPublicacaoHandler(req, res) {
  try {
    const { id } = req.params;
    const antes = await buscarPublicacao(id, req.empresaId);
    if (!antes) {
      return res.status(404).json({ ok: false, message: "Publicação não encontrada" });
    }

    await editarPublicacao(id, req.body || {});

    registrarAuditoria({
      usuario: req.user,
      acao: "editar",
      entidade: "publicacao_mural",
      entidadeId: id,
      resumo: `${req.user?.nome || "Alguém"} editou um aviso na turma #${antes.treinamento_id}`,
      dadosAntes: antes,
      dadosDepois: req.body,
      ip: req.ip,
    });

    return res.json({ ok: true, message: "Publicação atualizada" });
  } catch (error) {
    return res.status(500).json({ ok: false, message: mensagemErro(error, "editar o aviso"), error: error.message });
  }
}

async function excluirPublicacaoHandler(req, res) {
  try {
    const { id } = req.params;
    const antes = await buscarPublicacao(id, req.empresaId);
    if (!antes) {
      return res.status(404).json({ ok: false, message: "Publicação não encontrada" });
    }

    await excluirPublicacao(id);

    registrarAuditoria({
      usuario: req.user,
      acao: "excluir",
      entidade: "publicacao_mural",
      entidadeId: id,
      resumo: `${req.user?.nome || "Alguém"} excluiu um aviso da turma #${antes.treinamento_id}`,
      dadosAntes: antes,
      ip: req.ip,
    });

    return res.json({ ok: true, message: "Publicação excluída" });
  } catch (error) {
    return res.status(500).json({ ok: false, message: mensagemErro(error, "excluir o aviso"), error: error.message });
  }
}

module.exports = {
  obterMural,
  criarPublicacaoHandler,
  editarPublicacaoHandler,
  excluirPublicacaoHandler,
};
