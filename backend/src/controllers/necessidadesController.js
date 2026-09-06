const {
  listarNecessidades,
  buscarNecessidade,
  criarNecessidade,
  editarNecessidade,
  excluirNecessidade,
} = require("../services/necessidadesResolver");
const { registrarAuditoria } = require("../services/auditoria");

function mensagemErro(error, acaoDescricao) {
  const tabelaAusente = /doesn't exist/i.test(error.message);
  return tabelaAusente
    ? `A tabela necessidades_treinamento ainda não existe neste banco. Rode a migration database/migrations/2026-07-18_necessidades_treinamento.sql no banco de produção e tente ${acaoDescricao} de novo.`
    : `Erro ao ${acaoDescricao}: ${error.message}`;
}

async function listarHandler(req, res) {
  try {
    const { cliente, status } = req.query || {};
    const itens = await listarNecessidades({
      cliente: cliente || undefined,
      status: status || undefined,
      empresaId: req.empresaId,
    });
    return res.json({ ok: true, itens });
  } catch (error) {
    const tabelaAusente = /doesn't exist/i.test(error.message);
    return res.status(500).json({
      ok: false,
      message: tabelaAusente
        ? "A tabela necessidades_treinamento ainda não existe neste banco. Rode a migration database/migrations/2026-07-18_necessidades_treinamento.sql no banco de produção e recarregue esta página."
        : `Erro ao listar necessidades: ${error.message}`,
      error: error.message,
    });
  }
}

async function criarHandler(req, res) {
  try {
    const dados = req.body || {};
    if (!dados.cliente || !dados.tema) {
      return res.status(400).json({ ok: false, message: "Cliente e tema são obrigatórios" });
    }

    const id = await criarNecessidade({
      ...dados,
      solicitante_id: req.user?.id,
      solicitante_nome: req.user?.nome,
      empresa_id: req.empresaId ?? dados.empresa_id ?? null,
    });

    registrarAuditoria({
      usuario: req.user,
      acao: "criar",
      entidade: "necessidade_treinamento",
      entidadeId: id,
      resumo: `${req.user?.nome || "Alguém"} registrou uma necessidade: "${dados.tema}" para ${dados.cliente}`,
      dadosDepois: dados,
      ip: req.ip,
    });

    return res.status(201).json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, message: mensagemErro(error, "criar a necessidade"), error: error.message });
  }
}

async function editarHandler(req, res) {
  try {
    const { id } = req.params;
    const antes = await buscarNecessidade(id, req.empresaId);
    if (!antes) {
      return res.status(404).json({ ok: false, message: "Necessidade não encontrada" });
    }

    await editarNecessidade(id, req.body || {}, req.empresaId);

    registrarAuditoria({
      usuario: req.user,
      acao: "editar",
      entidade: "necessidade_treinamento",
      entidadeId: id,
      resumo: `${req.user?.nome || "Alguém"} editou a necessidade "${antes.tema}" (${antes.cliente})`,
      dadosAntes: antes,
      dadosDepois: req.body,
      ip: req.ip,
    });

    return res.json({ ok: true, message: "Necessidade atualizada" });
  } catch (error) {
    return res.status(500).json({ ok: false, message: mensagemErro(error, "editar a necessidade"), error: error.message });
  }
}

async function excluirHandler(req, res) {
  try {
    const { id } = req.params;
    const antes = await buscarNecessidade(id, req.empresaId);
    if (!antes) {
      return res.status(404).json({ ok: false, message: "Necessidade não encontrada" });
    }

    await excluirNecessidade(id, req.empresaId);

    registrarAuditoria({
      usuario: req.user,
      acao: "excluir",
      entidade: "necessidade_treinamento",
      entidadeId: id,
      resumo: `${req.user?.nome || "Alguém"} excluiu a necessidade "${antes.tema}" (${antes.cliente})`,
      dadosAntes: antes,
      ip: req.ip,
    });

    return res.json({ ok: true, message: "Necessidade excluída" });
  } catch (error) {
    return res.status(500).json({ ok: false, message: mensagemErro(error, "excluir a necessidade"), error: error.message });
  }
}

module.exports = { listarHandler, criarHandler, editarHandler, excluirHandler };
