/**
 * mptController.js — Comprovação MPT por subdivisão (04/11/2026).
 *
 *  GET    /api/mpt/resumo?ano=            agregado por subdivisão e operação (sem nomes). Metodologia,
 *                                         coordenação, supervisão e superintendência (esta vê todos os ambientes).
 *  GET    /api/mpt/pessoas?subtipo=&ano=  pessoas, horas e evidência linha a linha. SÓ Metodologia.
 *  GET    /api/mpt/metas                  metas internas do ambiente.
 *  PUT    /api/mpt/metas                  { subtipo, horas_meta } grava/atualiza. SÓ Metodologia.
 *  DELETE /api/mpt/metas?subtipo=         remove a meta (a subdivisão volta a "meta não definida"). SÓ Metodologia.
 *
 * Meta interna de gestão: nunca citada como exigência legal (decisão de 20/09/2026). CPF nunca sai.
 */
const { tenantScopeFor } = require("../lib/tenantScope");
const { normalizeSubtipo } = require("../lib/subtipos");
const { registrarAuditoria } = require("../services/auditoria");
const svc = require("../services/mptComprovacaoService");

function falha(res, contexto, e) {
  console.error(`[mpt] ${contexto}:`, e.message || e);
  return res.status(500).json({ ok: false, message: `Erro ao ${contexto}.` });
}

function anoDe(req) {
  const a = Number(req.query?.ano);
  return Number.isInteger(a) ? a : undefined;
}

async function resumo(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: ["superintendente"] });
    const r = await svc.calcularComprovacao({ empresaId, ano: anoDe(req) });
    return res.json({ ok: true, ano: r.ano, subdivisoes: r.subdivisoes, avisos: r.avisos, metas: r.metas });
  } catch (e) {
    return falha(res, "carregar a Comprovação MPT", e);
  }
}

async function pessoas(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req);
    const subtipo = String(req.query?.subtipo || "").trim();
    const r = await svc.calcularComprovacao({ empresaId, ano: anoDe(req) });
    let linhas = r.linhas;
    if (subtipo) linhas = linhas.filter((l) => l.subtipo === subtipo);
    const situacao = String(req.query?.situacao || "").trim();
    if (["atingiu", "abaixo", "sem_hora", "sem_meta"].includes(situacao)) linhas = linhas.filter((l) => l.situacao === situacao);
    const cliente = String(req.query?.cliente || "").trim();
    if (cliente) linhas = linhas.filter((l) => l.cliente === cliente);
    const ordem = { sem_hora: 0, abaixo: 1, sem_meta: 2, atingiu: 3 };
    linhas = [...linhas].sort((a, b) => (ordem[a.situacao] - ordem[b.situacao]) || a.nome.localeCompare(b.nome, "pt-BR"));
    return res.json({
      ok: true,
      ano: r.ano,
      total: linhas.length,
      pessoas: linhas.map((l) => ({
        chave: l.chave,
        nome: l.nome,
        matricula: l.matricula,
        cliente: l.cliente,
        vinculada: l.vinculada,
        subtipo: l.subtipo,
        horas: l.horas,
        meta: l.meta,
        situacao: l.situacao,
        evidencias: l.evidencias,
      })),
    });
  } catch (e) {
    return falha(res, "listar as pessoas da Comprovação MPT", e);
  }
}

async function listarMetas(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: ["superintendente"] });
    return res.json({ ok: true, metas: await svc.listarMetas(empresaId) });
  } catch (e) {
    return falha(res, "carregar as metas", e);
  }
}

async function salvarMeta(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req);
    if (!empresaId) return res.status(400).json({ ok: false, message: "Escolha o ambiente antes de definir a meta." });
    const subtipo = await normalizeSubtipo(req.body?.subtipo);
    if (!subtipo) return res.status(400).json({ ok: false, message: "Escolha uma subdivisão do catálogo." });
    const horas = Number(String(req.body?.horas_meta ?? "").replace(",", "."));
    if (!Number.isFinite(horas) || horas <= 0 || horas > 1000) {
      return res.status(400).json({ ok: false, message: "Informe a meta em horas por pessoa (maior que 0 e até 1000)." });
    }
    await svc.salvarMeta({ empresaId, subtipo, horas: Math.round(horas * 100) / 100, usuarioId: req.user?.id });
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "mpt_meta", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} definiu a meta interna de ${horas}h por pessoa para "${subtipo}" (Comprovação MPT)`,
      ip: req.ip,
    });
    return res.json({ ok: true, message: "Meta salva." });
  } catch (e) {
    return falha(res, "salvar a meta", e);
  }
}

async function removerMeta(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req);
    if (!empresaId) return res.status(400).json({ ok: false, message: "Escolha o ambiente." });
    const subtipo = String(req.query?.subtipo || req.body?.subtipo || "").trim();
    if (!subtipo) return res.status(400).json({ ok: false, message: "Informe a subdivisão." });
    const n = await svc.removerMeta({ empresaId, subtipo });
    if (!n) return res.status(404).json({ ok: false, message: "Meta não encontrada." });
    registrarAuditoria({
      usuario: req.user, acao: "excluir", entidade: "mpt_meta", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} removeu a meta interna de "${subtipo}" (Comprovação MPT)`,
      ip: req.ip,
    });
    return res.json({ ok: true, message: "Meta removida." });
  } catch (e) {
    return falha(res, "remover a meta", e);
  }
}

module.exports = { resumo, pessoas, listarMetas, salvarMeta, removerMeta };
