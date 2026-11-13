/**
 * rhCangaruController.js — Projeto Canguru do RH (Pacotes 3 e 4, 12/11/2026)
 *
 * coordenador_rh: tudo (inclusive regras/configuração) | analista_rh: importa, acompanha, abre e trata pontos de atenção |
 * gestor_rh: só o resultado agregado (grupos com o mínimo de novatos, sem dado individual nem relatos prioritários).
 * Dado individual (acompanhamento, ficha, fila de atenção, textos livres, Excel nominal) é só da equipe do RH e registra o acesso.
 * CommonJS — nunca usar import/export.
 */
const R = require("../lib/rhBase");
const xl = require("../lib/excelExport");
const S = require("../services/rhCangaruService");
const { registrarAuditoria } = require("../services/auditoria");

const auditar = (req, acao, entidade, id, resumo, antes, depois) =>
  registrarAuditoria({ usuario: req.user, acao, entidade, entidadeId: id, resumo, dadosAntes: antes, dadosDepois: depois, ip: req.ip });
const ehOperacao = (c) => R.PERFIS_OPERACAO.includes(c.perfil);
const falha = (res, e, rotulo, msg) => {
  if (e && e.status) return res.status(e.status).json({ ok: false, message: e.message, error: e.message, ...(e.ponto_id ? { ponto_id: e.ponto_id } : {}) });
  console.error(`[rh.canguru.${rotulo}]`, e);
  return R.erro(res, 500, msg);
};
const idParam = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : null; };

// ── Importação ────────────────────────────────────────────────────────
async function importar(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const arquivos = (req.files || []).map((f) => ({ buffer: f.buffer, nome: Buffer.from(f.originalname || "planilha.xlsx", "latin1").toString("utf8") }));
    const simular = String(req.body?.simular ?? "1") !== "0";
    let decisoes = {};
    if (req.body?.decisoes) { try { decisoes = JSON.parse(req.body.decisoes); } catch (_) { return R.erro(res, 400, "As decisões da conferência não puderam ser lidas."); } }
    const rel = await S.importarAvaliacoes({ empresaId: c.empresaId, usuario: req.user, arquivos, simular, decisoes, incluirFora: String(req.body?.incluir_fora) === "1" });
    if (!simular) {
      auditar(req, "importar", "rh_canguru", null, `Importou ${rel.avaliacoes.importadas + rel.avaliacoes.atualizadas} avaliações do Canguru (${rel.novatos.distintos} novatos)`, null, { arquivos: rel.arquivos, avaliacoes: rel.avaliacoes, novatos: rel.novatos });
    }
    return res.json({ ok: true, ...rel });
  } catch (e) { return falha(res, e, "importar", "Erro ao importar as avaliações"); }
}

// ── Acompanhamento, ficha e admissão (equipe do RH) ───────────────────
async function acompanhamento(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try { return res.json({ ok: true, ...(await S.acompanhamento(c.empresaId, req.query)) }); }
  catch (e) { return falha(res, e, "acompanhamento", "Erro ao carregar o acompanhamento"); }
}

async function ficha(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const id = idParam(req); if (!id) return R.erro(res, 404, "Novato não encontrado");
    const f = await S.ficha(c.empresaId, id);
    if (!f) return R.erro(res, 404, "Novato não encontrado");
    await R.registrarLeitura(req, c.empresaId, "canguru_ficha", id, "Abriu a ficha do novato");
    return res.json({ ok: true, ...f, equipe: await S.equipe(c.empresaId) });
  } catch (e) { return falha(res, e, "ficha", "Erro ao carregar a ficha"); }
}

async function admissao(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const id = idParam(req); if (!id) return R.erro(res, 404, "Novato não encontrado");
    const r = await S.salvarAdmissao(c.empresaId, id, req.body?.data_admissao);
    auditar(req, "editar", "rh_canguru_novato", id, "Informou a data de admissão do novato", { data_admissao: r.antes }, { data_admissao: r.depois });
    return res.json({ ok: true, message: "Data de admissão salva" });
  } catch (e) { return falha(res, e, "admissao", "Erro ao salvar a data de admissão"); }
}

// ── Pontos de atenção (equipe do RH) ──────────────────────────────────
async function atencao(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const q = req.query;
    const r = await S.filaAtencao(c.empresaId, { site: q.site, servico: q.servico, busca: q.busca, ponto: q.ponto, so_prioritarios: q.so_prioritarios === "1", so_recorrentes: q.so_recorrentes === "1", limite: q.limite, deslocamento: q.deslocamento });
    await R.registrarLeitura(req, c.empresaId, "canguru_fila_atencao", null, "Abriu a fila de pontos de atenção");
    return res.json({ ok: true, ...r });
  } catch (e) { return falha(res, e, "atencao", "Erro ao carregar os pontos de atenção"); }
}

async function pontos(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try { return res.json({ ok: true, pontos: await S.listarPontos(c.empresaId, req.query.status), passos: S.PASSOS, equipe: await S.equipe(c.empresaId) }); }
  catch (e) { return falha(res, e, "pontos", "Erro ao carregar os pontos"); }
}

async function abrirPonto(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const id = await S.abrirPonto(c.empresaId, req.user, req.body || {});
    auditar(req, "criar", "rh_canguru_ponto", id, "Abriu um ponto de atenção do Canguru", null, { novato_id: Number(req.body?.novato_id) });
    return res.status(201).json({ ok: true, id, message: "Ponto de atenção aberto" });
  } catch (e) { return falha(res, e, "ponto.abrir", "Erro ao abrir o ponto de atenção"); }
}

async function atualizarPonto(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const id = idParam(req); if (!id) return R.erro(res, 404, "Ponto de atenção não encontrado");
    const r = await S.atualizarPonto(c.empresaId, req.user, id, req.body || {});
    if (!r.sem_mudanca) auditar(req, "editar", "rh_canguru_ponto", id, "Atualizou um ponto de atenção do Canguru", r.antes, r.depois);
    return res.json({ ok: true, message: r.sem_mudanca ? "Nada a salvar" : "Ponto de atenção salvo" });
  } catch (e) { return falha(res, e, "ponto.atualizar", "Erro ao salvar o ponto de atenção"); }
}

// ── Configuração ──────────────────────────────────────────────────────
async function obterConfig(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const cfg = await S.carregarConfig(c.empresaId);
    const { termos_prioritarios, termos_operacao, ...resto } = cfg;
    return res.json({ ok: true, ...resto, ...(ehOperacao(c) ? { termos_prioritarios, termos_operacao } : {}), minimo_grupo_absoluto: S.MIN_GRUPO_MINIMO });
  } catch (e) { return falha(res, e, "config", "Erro ao carregar as regras do Canguru"); }
}

async function salvarConfig(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  try {
    const r = await S.salvarConfig(c.empresaId, req.body || {});
    auditar(req, "editar", "rh_canguru_config", c.empresaId, "Alterou as regras do Canguru", r.antes, r.depois);
    return res.json({ ok: true, message: "Regras salvas. Valem na hora para o acompanhamento; os sinais das avaliações já importadas são recalculados na próxima importação." });
  } catch (e) { return falha(res, e, "config.salvar", "Erro ao salvar as regras"); }
}

// ── Resultado, relatório e Excel ──────────────────────────────────────
const PUBLICOS = { cliente: "Cliente", diretoria: "Diretoria", rh: "RH interno" };
function filtros(q) { return { site: q.site || null, servico: q.servico || null, de: q.de || null, ate: q.ate || null }; }

async function resultado(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try { return res.json({ ok: true, ...(await S.resultado(c.empresaId, filtros(req.query), ehOperacao(c))) }); }
  catch (e) { return falha(res, e, "resultado", "Erro ao carregar o resultado"); }
}

function publicoDe(c, req, res) {
  const publico = String(req.query.publico || "diretoria");
  if (!PUBLICOS[publico]) { R.erro(res, 400, "Público inválido"); return null; }
  if (publico === "rh" && !ehOperacao(c)) { R.erro(res, 403, "O relatório do RH interno é só da equipe do RH."); return null; }
  return publico;
}

async function relatorio(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const publico = publicoDe(c, req, res); if (!publico) return;
    const r = await S.resultado(c.empresaId, filtros(req.query), publico === "rh");
    return res.json({ ok: true, publico, publico_rotulo: PUBLICOS[publico], publicos: Object.entries(PUBLICOS).filter(([k]) => k !== "rh" || ehOperacao(c)).map(([valor, rotulo]) => ({ valor, rotulo })), ...r });
  } catch (e) { return falha(res, e, "relatorio", "Erro ao montar o relatório"); }
}

const num = (v) => (v === null || v === undefined ? null : Number(v));
const RISCO = { baixo: "Baixo", moderado: "Moderado", alto: "Alto" };
const SIT = { pede_acao: "Pede ação", atencao: "Atenção", em_dia: "Em dia", concluido: "Concluído", sem_admissao: "Sem admissão" };
const ETAPA_ST = { respondida: "Respondida", vencendo: "Vencendo", sem_resposta: "Sem resposta", futura: "A vencer", anterior: "Anterior ao projeto", sem_admissao: "Sem admissão" };

async function exportar(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const publico = publicoDe(c, req, res); if (!publico) return;
    const r = await S.resultado(c.empresaId, filtros(req.query), publico === "rh");
    const wb = xl.novoWorkbook();
    const fa = r.filtros_aplicados;
    xl.adicionarTabela(wb, {
      nomeAba: "Resumo",
      colunas: [{ titulo: "Item", chave: "item", largura: 36 }, { titulo: "Valor", chave: "valor", largura: 80 }],
      linhas: [
        { item: "Projeto", valor: "Canguru: acompanhamento dos novatos até os 90 dias" }, { item: "Relatório para", valor: PUBLICOS[publico] },
        { item: "Filtros", valor: [fa.site ? `Site: ${S.rotuloSite(fa.site)}` : null, fa.servico ? `Serviço: ${fa.servico}` : null, fa.de ? `De: ${fa.de}` : null, fa.ate ? `Até: ${fa.ate}` : null].filter(Boolean).join(" · ") || "Todos" },
        { item: "Novatos com avaliação", valor: r.geral.novatos }, { item: "Avaliações", valor: r.geral.avaliacoes },
        { item: "Novatos com sinal de atenção", valor: `${r.geral.novatos_com_sinal} (${r.geral.novatos_com_sinal_pct ?? 0}%)` }, { item: "Com sinal em duas ou mais avaliações", valor: r.geral.recorrentes },
        ...(publico === "rh" ? [{ item: "Com relato prioritário", valor: r.geral.prioritarios }] : []),
        { item: "Leitura", valor: r.leitura },
        { item: "Como ler", valor: `Sinal de atenção = resposta “Não” em expectativas, acolhimento ou liderança, ou nota ${r.config.nota_sinal_max} ou menos em atividades, áreas de apoio ou clima com os colegas. Risco por site/serviço: baixo abaixo de ${r.config.risco_moderado_min}%, moderado até ${r.config.risco_alto_min}%, alto a partir daí (% de avaliações com sinal). Grupos com menos de ${r.config.min_grupo} novatos não aparecem${publico === "rh" ? " (no relatório do RH interno aparecem marcados)" : ""}.` },
      ],
    });
    xl.adicionarTabela(wb, {
      nomeAba: "Por etapa",
      colunas: [{ titulo: "Avaliação", chave: "etapa", largura: 22 }, { titulo: "Dia da aplicação", chave: "dia", largura: 16 }, { titulo: "Respostas", chave: "respostas", largura: 12 }, { titulo: "Empresa atendeu expectativas (%)", chave: "esp", formato: "decimal1", largura: 22 }, { titulo: "Sentiu-se acolhido (%)", chave: "acol", formato: "decimal1", largura: 22 }, { titulo: "Líder é bom gestor (%)", chave: "lider", formato: "decimal1", largura: 20 }, { titulo: "Nota atividades (0-5)", chave: "ativ", formato: "decimal1", largura: 18 }, { titulo: "Nota áreas de apoio (0-5)", chave: "apoio", formato: "decimal1", largura: 20 }, { titulo: "Nota clima com colegas (0-5)", chave: "clima", formato: "decimal1", largura: 22 }, { titulo: "Com sinal de atenção (%)", chave: "sinal", formato: "decimal1", largura: 20 }],
      linhas: r.etapas.map((e) => ({ etapa: `Avaliação ${e.tipo} dias`, dia: `${e.dia}º dia`, respostas: e.respostas, esp: num(e.expectativas_pct), acol: num(e.acolhimento_pct), lider: num(e.lideranca_pct), ativ: num(e.nota_atividades), apoio: num(e.nota_apoio), clima: num(e.nota_clima), sinal: num(e.com_sinal_pct) })),
    });
    xl.adicionarTabela(wb, {
      nomeAba: "Evolução",
      colunas: [{ titulo: "Indicador", chave: "k", largura: 52 }, { titulo: "Valor", chave: "v", largura: 14 }],
      linhas: [
        { k: "Novatos com duas ou mais avaliações", v: r.evolucao.novatos_com_duas_ou_mais }, { k: "Saíram do sinal de atenção (primeira → última avaliação)", v: r.evolucao.saiu_do_sinal },
        { k: "Entraram no sinal de atenção", v: r.evolucao.entrou_no_sinal }, { k: "Mantiveram sinal de atenção", v: r.evolucao.manteve_sinal }, { k: "Sem sinal nas duas pontas", v: r.evolucao.sem_sinal },
        { k: "Variação média da nota de atividades", v: num(r.evolucao.variacao_nota_atividades) }, { k: "Variação média da nota de áreas de apoio", v: num(r.evolucao.variacao_nota_apoio) }, { k: "Variação média da nota de clima com colegas", v: num(r.evolucao.variacao_nota_clima) },
      ],
    });
    const motivos = [];
    for (const [grupo, itens] of [["Insatisfação com as atividades", r.motivos.insatisfacao_atividades], ["Motivo para não considerar o líder um bom gestor", r.motivos.lideranca], ["Área em que não se sentiu acolhido", r.motivos.acolhimento_area]]) for (const i of itens) motivos.push({ grupo, motivo: i.motivo, n: i.n, pct: num(i.pct) });
    xl.adicionarTabela(wb, { nomeAba: "Motivos", colunas: [{ titulo: "Tema", chave: "grupo", largura: 44 }, { titulo: "Motivo", chave: "motivo", largura: 70 }, { titulo: "Respostas", chave: "n", largura: 12 }, { titulo: "% das respostas negativas", chave: "pct", formato: "decimal1", largura: 24 }], linhas: motivos });
    for (const [nomeAba, grupo, titulo] of [["Por site", r.por_site, "Site"], ["Por serviço", r.por_servico, "Serviço"]]) {
      const linhas = [...grupo.linhas, ...(grupo.demais ? [grupo.demais] : [])].map((g) => ({ g: g.rotulo, novatos: g.novatos, respostas: g.respostas, sinal: g.com_sinal, pct: num(g.com_sinal_pct), risco: RISCO[g.risco] || "—", p30: num(g.por_etapa[30]?.com_sinal_pct), p60: num(g.por_etapa[60]?.com_sinal_pct), p90: num(g.por_etapa[90]?.com_sinal_pct), obs: g.poucos ? `Menos de ${r.config.min_grupo} novatos` : "" }));
      xl.adicionarTabela(wb, { nomeAba, colunas: [{ titulo, chave: "g", largura: 36 }, { titulo: "Novatos", chave: "novatos", largura: 10 }, { titulo: "Avaliações", chave: "respostas", largura: 12 }, { titulo: "Com sinal", chave: "sinal", largura: 10 }, { titulo: "% com sinal", chave: "pct", formato: "decimal1", largura: 12 }, { titulo: "Risco", chave: "risco", largura: 12 }, { titulo: "% sinal 30 dias", chave: "p30", formato: "decimal1", largura: 14 }, { titulo: "% sinal 60 dias", chave: "p60", formato: "decimal1", largura: 14 }, { titulo: "% sinal 90 dias", chave: "p90", formato: "decimal1", largura: 14 }, { titulo: "Observação", chave: "obs", largura: 28 }], linhas });
    }
    if (publico === "rh") {
      const lista = await S.listaNominal(c.empresaId);
      xl.adicionarTabela(wb, {
        nomeAba: "Novatos (só RH)",
        colunas: [{ titulo: "Nome", chave: "nome", largura: 38 }, { titulo: "Matrícula", chave: "mat", largura: 12 }, { titulo: "Site", chave: "site", largura: 20 }, { titulo: "Serviço", chave: "servico", largura: 26 }, { titulo: "Supervisor", chave: "sup", largura: 28 }, { titulo: "Coordenador", chave: "coord", largura: 28 }, { titulo: "Admissão", chave: "adm", largura: 12 }, { titulo: "Dia", chave: "dia", largura: 7 }, { titulo: "Situação", chave: "sit", largura: 14 }, { titulo: "Avaliação 30", chave: "e30", largura: 18 }, { titulo: "Avaliação 60", chave: "e60", largura: 18 }, { titulo: "Avaliação 90", chave: "e90", largura: 18 }, { titulo: "Sinais", chave: "sinais", largura: 8 }, { titulo: "Recorrente", chave: "rec", largura: 11 }, { titulo: "Prioritário", chave: "pri", largura: 11 }, { titulo: "Ponto aberto", chave: "ponto", largura: 12 }],
        linhas: lista.map((n) => { const e = (t) => { const x = n.etapas.find((y) => y.tipo === t); return x ? `${ETAPA_ST[x.status]}${x.sinais ? ` · ${x.sinais} sinal(is)` : ""}` : ""; }; return { nome: n.nome, mat: n.matricula, site: n.site_rotulo, servico: n.servico, sup: n.supervisor, coord: n.coordenador, adm: n.data_admissao, dia: n.dia, sit: SIT[n.situacao], e30: e(30), e60: e(60), e90: e(90), sinais: n.sinais_total, rec: n.recorrente ? "Sim" : "", pri: n.prioritario ? "Sim" : "", ponto: n.ponto_aberto ? "Sim" : "" }; }),
      });
      await R.registrarLeitura(req, c.empresaId, "canguru_exportacao_nominal", null, "Exportou a lista nominal de novatos");
    }
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="canguru_${publico}_${R.hojeISO()}.xlsx"`);
    auditar(req, "exportar", "rh_canguru", null, `Exportou o relatório do Canguru para ${PUBLICOS[publico]}`, null, { publico, filtros: fa });
    return res.send(Buffer.from(buf));
  } catch (e) { return falha(res, e, "exportar", "Erro ao exportar o relatório"); }
}

module.exports = { importar, acompanhamento, ficha, admissao, atencao, pontos, abrirPonto, atualizarPonto, obterConfig, salvarConfig, resultado, relatorio, exportar };
