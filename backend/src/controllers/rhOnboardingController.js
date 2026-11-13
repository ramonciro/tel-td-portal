/**
 * rhOnboardingController.js — Acompanhamento do onboarding dos novatos (Pacote 8, 13/11/2026)
 *
 * coordenador_rh e analista_rh: veem e marcam as etapas de cada novato | coordenador_rh: também cria, ajusta e desativa etapas |
 * gestor_rh: só totais e percentuais de grupos com o mínimo de novatos. Perfil cliente não entra aqui.
 * CommonJS — nunca usar import/export.
 */
const R = require("../lib/rhBase");
const xl = require("../lib/excelExport");
const S = require("../services/rhOnboardingService");
const { registrarAuditoria } = require("../services/auditoria");

const auditar = (req, acao, entidade, id, resumo, antes, depois) =>
  registrarAuditoria({ usuario: req.user, acao, entidade, entidadeId: id, resumo, dadosAntes: antes, dadosDepois: depois, ip: req.ip });
const ehOperacao = (c) => R.PERFIS_OPERACAO.includes(c.perfil);
const falha = (res, e, rotulo, msg) => {
  if (e && e.status) return res.status(e.status).json({ ok: false, message: e.message, error: e.message });
  console.error(`[rh.onboarding.${rotulo}]`, e);
  return R.erro(res, 500, msg);
};
const idParam = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : null; };

async function painel(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const out = await S.painel(c.empresaId, req.query, { ocultar: !ehOperacao(c) });
    if (out.novatos_lista) await R.registrarLeitura(req, c.empresaId, "onboarding_painel", null, "Abriu o onboarding com a lista nominal de novatos");
    return res.json({ ...out, pode_marcar: ehOperacao(c), pode_configurar: c.perfil === R.PERFIL_COORD });
  } catch (e) { return falha(res, e, "painel", "Erro ao carregar o onboarding"); }
}
async function opcoes(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try { return res.json({ ok: true, ...(await S.opcoes(c.empresaId)) }); } catch (e) { return falha(res, e, "opcoes", "Erro ao carregar os filtros"); }
}
async function marcar(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const r = await S.marcar(c.empresaId, req.user, req.body || {});
    auditar(req, "marcar", "rh_onboarding", null, `Marcou a etapa “${r.etapa}” como ${r.status === "feito" ? "feita" : r.status === "na" ? "não se aplica" : "pendente"} para ${r.novatos} novato(s)`, null, r);
    return res.json({ ok: true, ...r });
  } catch (e) { return falha(res, e, "marcar", "Erro ao marcar a etapa"); }
}
async function etapas(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try { return res.json({ ok: true, etapas: await S.listarEtapas(c.empresaId, { incluirInativas: c.perfil === R.PERFIL_COORD }), max_ativas: S.MAX_ETAPAS_ATIVAS }); }
  catch (e) { return falha(res, e, "etapas", "Erro ao carregar as etapas"); }
}
async function criarEtapa(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  try {
    const e = await S.criarEtapa(c.empresaId, req.body || {});
    auditar(req, "criar", "rh_onboarding_etapa", e.id, `Criou a etapa de onboarding “${e.nome}” (${e.prazo_dias} dias)`, null, e);
    return res.status(201).json({ ok: true, etapa: e });
  } catch (e) { return falha(res, e, "criar_etapa", "Erro ao criar a etapa"); }
}
async function atualizarEtapa(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  try {
    const id = idParam(req); if (!id) return R.erro(res, 404, "Etapa não encontrada");
    const r = await S.atualizarEtapa(c.empresaId, id, req.body || {});
    auditar(req, "atualizar", "rh_onboarding_etapa", id, `Ajustou a etapa de onboarding “${r.depois.nome}”`, r.antes, r.depois);
    return res.json({ ok: true, etapa: { id, ...r.depois } });
  } catch (e) { return falha(res, e, "atualizar_etapa", "Erro ao ajustar a etapa"); }
}
async function exportar(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const op = ehOperacao(c);
    const p = await S.painel(c.empresaId, req.query, { ocultar: !op });
    const wb = xl.novoWorkbook();
    if (p.poucos) xl.adicionarTabela(wb, { nomeAba: "Resumo", colunas: [{ titulo: "Aviso", chave: "a", largura: 90 }], linhas: [{ a: p.mensagem }] });
    else {
      const g = p.geral;
      xl.adicionarTabela(wb, { nomeAba: "Resumo", colunas: [{ titulo: "Indicador", chave: "i", largura: 40 }, { titulo: "Valor", chave: "v", largura: 20 }], linhas: [
        { i: "Admissões de", v: `${p.periodo.de} a ${p.periodo.ate}` }, { i: "Novatos", v: g.novatos }, { i: "Etapas que se aplicam", v: g.etapas_aplicaveis }, { i: "Etapas feitas", v: g.feitas }, { i: "% concluído", v: g.pct_concluido ?? "" },
        { i: "Etapas atrasadas", v: g.atrasadas }, { i: "Novatos com algum atraso", v: g.com_atraso }, { i: "% feito no prazo", v: g.pct_no_prazo ?? "" }] });
      xl.adicionarTabela(wb, { nomeAba: "Por etapa", colunas: [{ titulo: "Etapa", chave: "nome", largura: 40 }, { titulo: "Prazo (dias)", chave: "prazo_dias", largura: 12 }, { titulo: "Feitas", chave: "feitas", largura: 10 }, { titulo: "Aplicáveis", chave: "aplicaveis", largura: 12 }, { titulo: "% feitas", chave: "pct_feitas", largura: 10 }, { titulo: "Atrasadas", chave: "atrasadas", largura: 10 }, { titulo: "% no prazo", chave: "pct_no_prazo", largura: 12 }], linhas: p.por_etapa.map((e) => ({ ...e, pct_feitas: e.pct_feitas ?? "", pct_no_prazo: e.pct_no_prazo ?? "" })) });
      const cols = [{ titulo: "Grupo", chave: "rotulo", largura: 32 }, { titulo: "Novatos", chave: "novatos", largura: 10 }, { titulo: "% concluído", chave: "pct_concluido", largura: 12 }, { titulo: "Atrasadas", chave: "atrasadas", largura: 10 }, { titulo: "% no prazo", chave: "pct_no_prazo", largura: 12 }];
      const sn = (x) => ({ ...x, pct_concluido: x.pct_concluido ?? "", pct_no_prazo: x.pct_no_prazo ?? "" });
      xl.adicionarTabela(wb, { nomeAba: "Por serviço", colunas: cols, linhas: p.por_servico.linhas.map(sn) });
      xl.adicionarTabela(wb, { nomeAba: "Por site", colunas: cols, linhas: p.por_site.linhas.map(sn) });
      if (op && p.novatos_lista) {
        await R.registrarLeitura(req, c.empresaId, "onboarding_exportacao_nominal", null, "Exportou o onboarding com a lista nominal de novatos");
        const rot = { feito: "Feito", na: "Não se aplica", pendente: "Pendente" };
        xl.adicionarTabela(wb, { nomeAba: "Novatos", colunas: [{ titulo: "Matrícula", chave: "matricula", largura: 12 }, { titulo: "Nome", chave: "nome", largura: 34 }, { titulo: "Serviço", chave: "servico", largura: 22 }, { titulo: "Admissão", chave: "data_admissao", largura: 12 }, { titulo: "% concluído", chave: "pct", largura: 12 }, { titulo: "Atrasadas", chave: "atrasadas", largura: 10 },
          ...p.etapas.map((e) => ({ titulo: `${e.nome} (D+${e.prazo_dias})`, chave: `e${e.id}`, largura: 22 }))],
          linhas: p.novatos_lista.map((n) => ({ ...n, nome: n.nome || "", servico: n.servico || "", pct: n.pct ?? "", ...Object.fromEntries(n.cels.map((x) => [`e${x.etapa_id}`, x.status === "feito" ? `Feito em ${x.feito_em}` : x.atrasada ? "ATRASADA" : rot[x.status]])) })) });
      }
    }
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="onboarding.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (e) { return falha(res, e, "exportar", "Erro ao exportar o onboarding"); }
}

module.exports = { painel, opcoes, marcar, etapas, criarEtapa, atualizarEtapa, exportar };
