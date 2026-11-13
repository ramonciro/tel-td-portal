/**
 * rhPlanosController.js — Planos de ação do RH (Pacote 5, 13/11/2026)
 *
 * coordenador_rh e analista_rh: criam, andam, anotam e pedem sugestões | gestor_rh: só lê a lista, o plano e o Excel.
 * O coordenador também mostra/esconde o plano do cliente e reabre plano concluído ou cancelado.
 * CommonJS — nunca usar import/export.
 */
const R = require("../lib/rhBase");
const xl = require("../lib/excelExport");
const S = require("../services/rhPlanosService");
const { registrarAuditoria } = require("../services/auditoria");

const auditar = (req, acao, id, resumo, antes, depois) =>
  registrarAuditoria({ usuario: req.user, acao, entidade: "rh_plano", entidadeId: id, resumo, dadosAntes: antes, dadosDepois: depois, ip: req.ip });
const falha = (res, e, rotulo, msg) => {
  if (e && e.status) return res.status(e.status).json({ ok: false, message: e.message, error: e.message });
  console.error(`[rh.planos.${rotulo}]`, e);
  return R.erro(res, 500, msg);
};
const idParam = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : null; };

async function listar(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try { return res.json({ ok: true, ...(await S.listar(c.empresaId, req.query)), pode_editar: R.PERFIS_OPERACAO.includes(c.perfil), pode_cliente: c.perfil === R.PERFIL_COORD }); }
  catch (e) { return falha(res, e, "listar", "Erro ao carregar os planos de ação"); }
}

async function obter(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const id = idParam(req); if (!id) return R.erro(res, 404, "Plano não encontrado");
    const p = await S.obter(c.empresaId, id);
    if (!p) return R.erro(res, 404, "Plano não encontrado");
    return res.json({ ok: true, plano: p });
  } catch (e) { return falha(res, e, "obter", "Erro ao abrir o plano"); }
}

async function sugestoes(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try { return res.json({ ok: true, ...(await S.sugestoes(c.empresaId)) }); }
  catch (e) { return falha(res, e, "sugestoes", "Erro ao montar as sugestões"); }
}

async function criar(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const p = await S.criar(c.empresaId, req.user, c.perfil, req.body || {});
    auditar(req, "criar", p.id, `Abriu o plano de ação “${p.titulo}”`, null, { origem: p.origem, tema: p.tema, prazo: p.prazo, responsavel: p.responsavel });
    return res.status(201).json({ ok: true, plano: p, message: "Plano criado" });
  } catch (e) { return falha(res, e, "criar", "Erro ao criar o plano"); }
}

async function atualizar(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const id = idParam(req); if (!id) return R.erro(res, 404, "Plano não encontrado");
    const antes = await S.obter(c.empresaId, id);
    const p = await S.atualizar(c.empresaId, req.user, c.perfil, id, req.body || {});
    auditar(req, "editar", id, `Atualizou o plano de ação “${p.titulo}”`, { status: antes?.status, prazo: antes?.prazo, responsavel: antes?.responsavel }, { status: p.status, prazo: p.prazo, responsavel: p.responsavel });
    return res.json({ ok: true, plano: p, message: "Plano atualizado" });
  } catch (e) { return falha(res, e, "atualizar", "Erro ao atualizar o plano"); }
}

async function anotar(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const id = idParam(req); if (!id) return R.erro(res, 404, "Plano não encontrado");
    return res.json({ ok: true, plano: await S.anotar(c.empresaId, req.user, id, req.body?.nota) });
  } catch (e) { return falha(res, e, "anotar", "Erro ao anotar"); }
}

async function exportar(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const { planos, contagem } = await S.listar(c.empresaId, req.query);
    const ORIG = { clima: "Clima", canguru: "Canguru", livre: "Livre" };
    const SIT = { atrasado: "Atrasado", vence_em_breve: "Vence em até 7 dias", no_prazo: "No prazo", concluido: "Concluído", cancelado: "Cancelado" };
    const wb = xl.novoWorkbook();
    xl.adicionarTabela(wb, {
      nomeAba: "Planos de ação",
      colunas: [{ titulo: "Plano", chave: "titulo", largura: 40 }, { titulo: "Origem", chave: "origem", largura: 11 }, { titulo: "Tema / grupo", chave: "tema", largura: 34 }, { titulo: "Cliente", chave: "cliente", largura: 18 }, { titulo: "Pesquisa", chave: "ciclo", largura: 26 }, { titulo: "O que será feito", chave: "acao", largura: 60 }, { titulo: "Responsável", chave: "resp", largura: 24 }, { titulo: "Prazo", chave: "prazo", formato: "data", largura: 12 }, { titulo: "Prioridade", chave: "prio", largura: 11 }, { titulo: "Situação", chave: "status", largura: 14 }, { titulo: "Prazo", chave: "sit", largura: 20 }, { titulo: "Resultado", chave: "resultado", largura: 50 }, { titulo: "Visível ao cliente", chave: "vis", largura: 16 }],
      linhas: planos.map((p) => ({ titulo: p.titulo, origem: ORIG[p.origem], tema: p.tema || "", cliente: p.cliente || "", ciclo: p.ciclo_nome || "", acao: p.acao, resp: p.responsavel || "", prazo: p.prazo, prio: { alta: "Alta", media: "Média", baixa: "Baixa" }[p.prioridade], status: p.status_rotulo, sit: SIT[p.situacao] || "", resultado: p.resultado || "", vis: p.visivel_cliente ? "Sim" : "Não" })),
    });
    xl.adicionarTabela(wb, {
      nomeAba: "Resumo",
      colunas: [{ titulo: "Indicador", chave: "k", largura: 36 }, { titulo: "Valor", chave: "v", largura: 14 }],
      linhas: [{ k: "Planos no total", v: contagem.total }, { k: "Abertos", v: contagem.abertos }, { k: "Em andamento", v: contagem.andamento }, { k: "Concluídos", v: contagem.concluidos }, { k: "Cancelados", v: contagem.cancelados }, { k: "Atrasados", v: contagem.atrasados }, { k: "Vencem em até 7 dias", v: contagem.vencendo }, { k: "Conclusão (concluídos ÷ não cancelados, %)", v: contagem.conclusao_pct ?? "" }],
    });
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="planos_de_acao_rh_${R.hojeISO()}.xlsx"`);
    auditar(req, "exportar", null, "Exportou os planos de ação do RH", null, { filtros: req.query });
    return res.send(Buffer.from(buf));
  } catch (e) { return falha(res, e, "exportar", "Erro ao exportar os planos"); }
}

module.exports = { listar, obter, sugestoes, criar, atualizar, anotar, exportar };
