/**
 * rhCangaruController.js — Projeto Canguru do RH (Pacotes 3 e 4, 12/11/2026)
 *
 * coordenador_rh: tudo (inclusive regras/configuração) | analista_rh: importa, acompanha, abre e trata pontos de atenção |
 * gestor_rh: só o resultado agregado (grupos com o mínimo de novatos, sem dado individual nem relatos prioritários).
 * Dado individual (acompanhamento, ficha, fila de atenção, textos livres, Excel nominal) é só da equipe do RH e registra o acesso.
 * CommonJS — nunca usar import/export.
 */
const R = require("../lib/rhBase");
const LOTES = require("../services/rhCangaruLotes");
const xl = require("../lib/excelExport");
const S = require("../services/rhCangaruService");
const SUP = require("../services/rhCangaruSupervisorService");
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

// Respostas do supervisor (Pacote 9): mesmo fluxo de simular e gravar, outro formato de planilha
async function importarSupervisor(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const arquivos = (req.files || []).map((f) => ({ buffer: f.buffer, nome: Buffer.from(f.originalname || "planilha.xlsx", "latin1").toString("utf8") }));
    const simular = String(req.body?.simular ?? "1") !== "0";
    const rel = await SUP.importarSupervisor({ empresaId: c.empresaId, usuario: req.user, arquivos, simular, incluirNovos: String(req.body?.incluir_novos) === "1" });
    if (!simular) auditar(req, "importar", "rh_canguru_supervisor", null, `Importou ${rel.avaliacoes.importadas + rel.avaliacoes.atualizadas} avaliações de supervisor do Canguru (${rel.novatos.distintos} novatos)`, null, { arquivos: rel.arquivos, avaliacoes: rel.avaliacoes, novatos: rel.novatos });
    return res.json({ ok: true, ...rel });
  } catch (e) { return falha(res, e, "importar_supervisor", "Erro ao importar as avaliações do supervisor"); }
}

async function importarAdmissoes(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const f = (req.files || [])[0];
    const arquivo = f ? { buffer: f.buffer, nome: Buffer.from(f.originalname || "planilha.xlsx", "latin1").toString("utf8") } : null;
    const simular = String(req.body?.simular ?? "1") !== "0";
    const rel = await S.importarAdmissoes({ empresaId: c.empresaId, usuario: req.user, arquivo, simular });
    if (!simular) auditar(req, "importar", "rh_canguru_admissoes", null, `Atualizou a data de admissão de ${rel.resultado.gravadas} novato(s) do Canguru por planilha`, null, { arquivo: rel.arquivo, resultado: rel.resultado, problemas: rel.problemas.length });
    return res.json({ ok: true, ...rel });
  } catch (e) { return falha(res, e, "admissoes", "Erro ao importar as admissões"); }
}

// ── Histórico de importações e desfazer (Pacote 9c) ───────────────────
async function importacoes(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try { return res.json({ ok: true, ...(await LOTES.listar(c.empresaId)), pode_desfazer: c.perfil === R.PERFIL_COORD }); }
  catch (e) { return falha(res, e, "importacoes", "Erro ao listar as importações"); }
}
async function desfazerImportacao(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  const id = idParam(req); if (!id) return R.erro(res, 400, "Importação inválida.");
  if (req.body?.confirmar !== true) return R.erro(res, 400, "Confirme para desfazer a importação.");
  try {
    const r = await LOTES.desfazer({ empresaId: c.empresaId, loteId: id, usuario: req.user });
    auditar(req, "desfazer", "rh_canguru_importacao", id, `Desfez a importação ${id} do Canguru (${r.lote.origem})`, null, r);
    return res.json({ ok: true, ...r });
  } catch (e) { return falha(res, e, "desfazer_importacao", "Erro ao desfazer a importação"); }
}
async function excluirImportacaoAnterior(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  const b = req.body || {};
  if (b.confirmar !== true) return R.erro(res, 400, "Confirme para excluir.");
  try {
    const r = await LOTES.excluirAnterior({ empresaId: c.empresaId, origem: String(b.origem || ""), arquivo: String(b.arquivo ?? ""), dia: String(b.dia || ""), removerNovatos: b.remover_novatos === true });
    auditar(req, "excluir", "rh_canguru_importacao_anterior", null, `Excluiu ${r.avaliacoes_apagadas} avaliações (${b.origem}) importadas antes do histórico por lote`, { origem: b.origem, arquivo: b.arquivo, dia: b.dia }, r);
    return res.json({ ok: true, ...r });
  } catch (e) { return falha(res, e, "excluir_importacao", "Erro ao excluir a importação"); }
}

async function novatosAdmissao(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try { return res.json({ ok: true, novatos: await S.novatosParaAdmissao(c.empresaId), hoje: R.hojeISO() }); }
  catch (e) { return falha(res, e, "novatos_admissao", "Erro ao listar os novatos"); }
}

// Modelo de planilha já com os novatos que ainda estão sem data de admissão
async function modeloAdmissoes(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const lista = await S.modeloAdmissoes(c.empresaId);
    const wb = xl.novoWorkbook();
    xl.adicionarTabela(wb, { nomeAba: "Admissões", colunas: [{ titulo: "Matrícula", chave: "m", largura: 14 }, { titulo: "Nome", chave: "n", largura: 40 }, { titulo: "Data de admissão", chave: "d", largura: 18 }], linhas: lista.length ? lista.map((l) => ({ m: l.matricula || "", n: l.nome || "", d: "" })) : [{ m: "12345", n: "Exemplo (apague esta linha)", d: "" }] });
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="modelo_admissoes_canguru.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (e) { return falha(res, e, "modelo_admissoes", "Erro ao gerar o modelo"); }
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
    const r = await S.filaAtencao(c.empresaId, { site: q.site, servico: q.servico, busca: q.busca, ponto: q.ponto, so_prioritarios: q.so_prioritarios === "1", so_recorrentes: q.so_recorrentes === "1", visao: q.visao, limite: q.limite, deslocamento: q.deslocamento });
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
  try { return res.json({ ok: true, ...(req.query.visao === "supervisor" ? await SUP.resultadoSupervisor(c.empresaId, filtros(req.query), ehOperacao(c)) : await S.resultado(c.empresaId, filtros(req.query), ehOperacao(c))) }); }
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
    const r = req.query.visao === "supervisor" ? await SUP.resultadoSupervisor(c.empresaId, filtros(req.query), publico === "rh") : await S.resultado(c.empresaId, filtros(req.query), publico === "rh");
    return res.json({ ok: true, publico, publico_rotulo: PUBLICOS[publico], publicos: Object.entries(PUBLICOS).filter(([k]) => k !== "rh" || ehOperacao(c)).map(([valor, rotulo]) => ({ valor, rotulo })), ...r });
  } catch (e) { return falha(res, e, "relatorio", "Erro ao montar o relatório"); }
}

const num = (v) => (v === null || v === undefined ? null : Number(v));
const RISCO = { baixo: "Baixo", moderado: "Moderado", alto: "Alto" };
const SIT = { pede_acao: "Pede ação", atencao: "Atenção", em_dia: "Em dia", concluido: "Concluído", sem_admissao: "Sem admissão" };
const ETAPA_ST = { respondida: "Respondida", vencendo: "Vencendo", sem_resposta: "Sem resposta", futura: "A vencer", anterior: "Anterior ao projeto", sem_admissao: "Sem admissão" };

/** Monta a planilha do relatório do Canguru. `lista` (só RH interno) é a lista nominal de novatos. */
async function excelDoCanguru(r, publico, lista) {
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
      xl.adicionarTabela(wb, {
        nomeAba: "Novatos (só RH)",
        colunas: [{ titulo: "Nome", chave: "nome", largura: 38 }, { titulo: "Matrícula", chave: "mat", largura: 12 }, { titulo: "Site", chave: "site", largura: 20 }, { titulo: "Serviço", chave: "servico", largura: 26 }, { titulo: "Supervisor", chave: "sup", largura: 28 }, { titulo: "Coordenador", chave: "coord", largura: 28 }, { titulo: "Admissão", chave: "adm", largura: 12 }, { titulo: "Dia", chave: "dia", largura: 7 }, { titulo: "Situação", chave: "sit", largura: 14 }, { titulo: "Avaliação 30", chave: "e30", largura: 18 }, { titulo: "Avaliação 60", chave: "e60", largura: 18 }, { titulo: "Avaliação 90", chave: "e90", largura: 18 }, { titulo: "Sinais", chave: "sinais", largura: 8 }, { titulo: "Recorrente", chave: "rec", largura: 11 }, { titulo: "Prioritário", chave: "pri", largura: 11 }, { titulo: "Ponto aberto", chave: "ponto", largura: 12 }],
        linhas: lista.map((n) => { const e = (t) => { const x = n.etapas.find((y) => y.tipo === t); return x ? `${ETAPA_ST[x.status]}${x.sinais ? ` · ${x.sinais} sinal(is)` : ""}` : ""; }; return { nome: n.nome, mat: n.matricula, site: n.site_rotulo, servico: n.servico, sup: n.supervisor, coord: n.coordenador, adm: n.data_admissao, dia: n.dia, sit: SIT[n.situacao], e30: e(30), e60: e(60), e90: e(90), sinais: n.sinais_total, rec: n.recorrente ? "Sim" : "", pri: n.prioritario ? "Sim" : "", ponto: n.ponto_aberto ? "Sim" : "" }; }),
      });
    }
    return wb.xlsx.writeBuffer();
}

async function exportar(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const publico = publicoDe(c, req, res); if (!publico) return;
    const sup = req.query.visao === "supervisor";
    const r = sup ? await SUP.resultadoSupervisor(c.empresaId, filtros(req.query), publico === "rh") : await S.resultado(c.empresaId, filtros(req.query), publico === "rh");
    const lista = publico === "rh" ? await S.listaNominal(c.empresaId, sup ? "supervisor" : "operador") : null;
    if (publico === "rh") await R.registrarLeitura(req, c.empresaId, "canguru_exportacao_nominal", null, sup ? "Exportou a lista nominal de novatos (visão do supervisor)" : "Exportou a lista nominal de novatos");
    const buf = sup ? await excelDoSupervisor(r, publico, lista) : await excelDoCanguru(r, publico, lista);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="canguru_${publico}_${R.hojeISO()}.xlsx"`);
    auditar(req, "exportar", "rh_canguru", null, `Exportou o relatório do Canguru para ${PUBLICOS[publico]}`, null, { publico, filtros: r.filtros_aplicados });
    return res.send(Buffer.from(buf));
  } catch (e) { return falha(res, e, "exportar", "Erro ao exportar o relatório"); }
}


// ── Comparativo entre períodos (Pacote 7, 13/11/2026) ────────────────
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const somaDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function periodos(q) {
  const hoje = R.hojeISO();
  const ok = (v) => (ISO.test(String(v || "")) ? String(v) : null);
  let [bDe, bAte, aDe, aAte] = [ok(q.b_de), ok(q.b_ate), ok(q.a_de), ok(q.a_ate)];
  if (!bAte) bAte = hoje;
  if (!bDe) bDe = somaDias(bAte, -29);
  if (!aAte) aAte = somaDias(bDe, -1);
  if (!aDe) aDe = somaDias(aAte, -29);
  if (aDe > aAte || bDe > bAte) { const e = new Error("A data inicial não pode ser depois da final."); e.status = 400; throw e; }
  if (aAte >= bDe) { const e = new Error("Os dois períodos não podem se sobrepor: o anterior termina antes de o atual começar."); e.status = 400; throw e; }
  return { a: { de: aDe, ate: aAte }, b: { de: bDe, ate: bAte } };
}
async function comparativo(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const p = periodos(req.query);
    const sup = req.query.visao === "supervisor";
    const base = { site: req.query.site || null, servico: req.query.servico || null };
    const r = sup ? await SUP.compararSupervisor(c.empresaId, base, p.a, p.b) : await S.compararPeriodos(c.empresaId, base, p.a, p.b);
    const op = sup ? await SUP.opcoesEscopoSupervisor(c.empresaId) : await S.opcoesEscopo(c.empresaId);
    return res.json({ ok: true, ...r, filtros: { sites: op.sites, servicos: op.servicos.map((x) => (typeof x === "string" ? x : x.valor)) } });
  } catch (e) { return falha(res, e, "comparativo", "Erro ao comparar os períodos"); }
}

const TEND = { melhorou: "Melhorou", piorou: "Piorou", estavel: "Estável" };
async function excelDoComparativoCanguru(r) {
  const wb = xl.novoWorkbook();
  const pa = `${r.periodo_a.de} a ${r.periodo_a.ate}`, pb = `${r.periodo_b.de} a ${r.periodo_b.ate}`;
  xl.adicionarTabela(wb, { nomeAba: "Resumo", colunas: [{ titulo: "Item", chave: "k", largura: 34 }, { titulo: "Valor", chave: "v", largura: 100 }], linhas: [
    { k: "Período anterior", v: pa }, { k: "Período atual", v: pb },
    { k: "Novatos (anterior → atual)", v: `${r.geral.a.novatos} → ${r.geral.b.novatos}` }, { k: "Com sinal de atenção % (anterior → atual)", v: `${r.geral.a.com_sinal_pct ?? "—"} → ${r.geral.b.com_sinal_pct ?? "—"}` },
    { k: "Leitura", v: r.resumo }, { k: "Como ler", v: r.avisos.join(" ") }] });
  const um = (x) => ({ a: num(x.a), b: num(x.b), d: num(x.delta), t: TEND[x.tendencia] || "" });
  xl.adicionarTabela(wb, { nomeAba: "Por avaliação", colunas: [{ titulo: "Avaliação", chave: "e", largura: 18 }, { titulo: "Respostas (ant.)", chave: "ra", largura: 16 }, { titulo: "Respostas (atual)", chave: "rb", largura: 16 }, { titulo: "Indicador", chave: "i", largura: 30 }, { titulo: "Anterior", chave: "a", formato: "decimal1", largura: 12 }, { titulo: "Atual", chave: "b", formato: "decimal1", largura: 12 }, { titulo: "Variação", chave: "d", formato: "decimal1", largura: 12 }, { titulo: "Leitura", chave: "t", largura: 12 }],
    linhas: r.etapas.flatMap((e) => [["Expectativas atendidas (%)", e.expectativas], ["Acolhidos (%)", e.acolhimento], ["Líder bom gestor (%)", e.lideranca], ["Com sinal de atenção (%)", e.com_sinal], ["Nota de atividades", e.nota_atividades], ["Nota de áreas de apoio", e.nota_apoio], ["Nota de clima com os colegas", e.nota_clima]].map(([i, x]) => ({ e: `${e.tipo} dias`, ra: e.a_respostas, rb: e.b_respostas, i, ...um(x) }))) });
  for (const [nomeAba, grupos, titulo] of [["Por site", r.por_site, "Site"], ["Por serviço", r.por_servico, "Serviço"]]) {
    xl.adicionarTabela(wb, { nomeAba, colunas: [{ titulo, chave: "g", largura: 36 }, { titulo: "Novatos (ant.)", chave: "na", largura: 14 }, { titulo: "Novatos (atual)", chave: "nb", largura: 14 }, { titulo: "Com sinal ant. (%)", chave: "a", formato: "decimal1", largura: 16 }, { titulo: "Com sinal atual (%)", chave: "b", formato: "decimal1", largura: 16 }, { titulo: "Variação (p.p.)", chave: "d", formato: "decimal1", largura: 14 }, { titulo: "Leitura", chave: "t", largura: 12 }],
      linhas: grupos.map((g) => ({ g: g.rotulo, na: g.a_novatos, nb: g.b_novatos, a: num(g.a_sinal_pct), b: num(g.b_sinal_pct), d: num(g.delta), t: TEND[g.tendencia] || "" })) });
  }
  return wb.xlsx.writeBuffer();
}
async function exportarComparativo(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const p = periodos(req.query);
    const base = { site: req.query.site || null, servico: req.query.servico || null };
    const r = req.query.visao === "supervisor" ? await SUP.compararSupervisor(c.empresaId, base, p.a, p.b) : await S.compararPeriodos(c.empresaId, base, p.a, p.b);
    const buf = r.visao === "supervisor" ? await excelDoComparativoSupervisor(r) : await excelDoComparativoCanguru(r);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="canguru_comparativo_${R.hojeISO()}.xlsx"`);
    auditar(req, "exportar", "rh_canguru_comparativo", null, `Exportou o comparativo do Canguru (${r.periodo_a.de} a ${r.periodo_a.ate} → ${r.periodo_b.de} a ${r.periodo_b.ate})`, null, { a: r.periodo_a, b: r.periodo_b });
    return res.send(Buffer.from(buf));
  } catch (e) { return falha(res, e, "comparativo.exportar", "Erro ao exportar o comparativo"); }
}

// ── Excel da visão do supervisor (Pacote 9) ───────────────────────────
async function excelDoSupervisor(r, publico, lista) {
  const wb = xl.novoWorkbook();
  const fa = r.filtros_aplicados; const REQ = SUP.REQ_ROTULO;
  xl.adicionarTabela(wb, {
    nomeAba: "Resumo", colunas: [{ titulo: "Item", chave: "item", largura: 36 }, { titulo: "Valor", chave: "valor", largura: 80 }],
    linhas: [
      { item: "Projeto", valor: "Canguru: avaliação do supervisor (30, 60 e 85 dias)" }, { item: "Relatório para", valor: PUBLICOS[publico] },
      { item: "Filtros", valor: [fa.site ? `Site: ${S.rotuloSite(fa.site)}` : null, fa.servico ? `Serviço: ${fa.servico}` : null, fa.de ? `De: ${fa.de}` : null, fa.ate ? `Até: ${fa.ate}` : null].filter(Boolean).join(" · ") || "Todos" },
      { item: "Novatos avaliados", valor: r.geral.novatos }, { item: "Avaliações", valor: r.geral.avaliacoes }, { item: "Nota média (0 a 5)", valor: r.geral.media ?? "—" },
      { item: "Novatos com sinal de atenção", valor: `${r.geral.novatos_com_sinal} (${r.geral.novatos_com_sinal_pct ?? 0}%)` }, { item: "Com sinal em duas ou mais avaliações", valor: r.geral.recorrentes },
      { item: "Com avaliação zerada (abandono ou falta)", valor: r.geral.zeradas },
      ...(publico === "rh" ? [{ item: "Com relato prioritário", valor: r.geral.prioritarios }] : []),
      { item: "Leitura", valor: r.leitura },
      { item: "Como ler", valor: `Sinal de atenção = nota ${r.config.nota_sinal_max} ou menos em algum requisito. Avaliações com todas as notas zeradas ficam fora das médias. Grupos com menos de ${r.config.min_grupo} novatos não aparecem fora do RH.` },
    ],
  });
  xl.adicionarTabela(wb, {
    nomeAba: "Por avaliação",
    colunas: [{ titulo: "Avaliação", chave: "e", largura: 22 }, { titulo: "Respostas", chave: "n", largura: 12 }, { titulo: "Nota média", chave: "m", formato: "decimal1", largura: 12 }, ...Object.keys(REQ).map((k) => ({ titulo: REQ[k], chave: k, formato: "decimal1", largura: 16 })), { titulo: "% com sinal", chave: "s", formato: "decimal1", largura: 12 }, { titulo: "Zeradas", chave: "z", largura: 10 }],
    linhas: r.etapas.map((e) => ({ e: `Avaliação ${e.tipo === 90 ? 85 : e.tipo} dias`, n: e.respostas, m: num(e.media), ...Object.fromEntries(Object.keys(REQ).map((k) => [k, num(e.por_requisito[k])])), s: num(e.com_sinal_pct), z: e.zeradas })),
  });
  xl.adicionarTabela(wb, { nomeAba: "Por requisito", colunas: [{ titulo: "Requisito", chave: "r", largura: 30 }, { titulo: "Avaliações", chave: "n", largura: 12 }, { titulo: "Nota média", chave: "m", formato: "decimal1", largura: 12 }, { titulo: "% com nota baixa", chave: "b", formato: "decimal1", largura: 16 }], linhas: r.requisitos.map((x) => ({ r: x.rotulo, n: x.respostas, m: num(x.media), b: num(x.baixa_pct) })) });
  xl.adicionarTabela(wb, { nomeAba: "Motivos", colunas: [{ titulo: "Motivo citado nas notas baixas", chave: "m", largura: 70 }, { titulo: "Avaliações", chave: "n", largura: 12 }, { titulo: "% das avaliações com motivo", chave: "p", formato: "decimal1", largura: 26 }], linhas: r.motivos.map((x) => ({ m: x.motivo, n: x.n, p: num(x.pct) })) });
  const grupoCols = (titulo) => [{ titulo, chave: "g", largura: 36 }, { titulo: "Novatos", chave: "novatos", largura: 10 }, { titulo: "Avaliações", chave: "respostas", largura: 12 }, { titulo: "Nota média", chave: "media", formato: "decimal1", largura: 12 }, { titulo: "Com sinal", chave: "sinal", largura: 10 }, { titulo: "% com sinal", chave: "pct", formato: "decimal1", largura: 12 }, { titulo: "Risco", chave: "risco", largura: 12 }, { titulo: "Observação", chave: "obs", largura: 28 }];
  const grupoLinhas = (g) => [...g.linhas, ...(g.demais ? [g.demais] : [])].map((x) => ({ g: x.rotulo, novatos: x.novatos, respostas: x.respostas, media: num(x.media), sinal: x.com_sinal, pct: num(x.com_sinal_pct), risco: RISCO[x.risco] || "—", obs: x.poucos ? `Menos de ${r.config.min_grupo} novatos` : "" }));
  xl.adicionarTabela(wb, { nomeAba: "Por site", colunas: grupoCols("Site"), linhas: grupoLinhas(r.por_site) });
  xl.adicionarTabela(wb, { nomeAba: "Por serviço", colunas: grupoCols("Serviço"), linhas: grupoLinhas(r.por_servico) });
  if (publico === "rh" && r.por_supervisor) xl.adicionarTabela(wb, { nomeAba: "Por supervisor (só RH)", colunas: grupoCols("Supervisor"), linhas: grupoLinhas(r.por_supervisor) });
  if (publico === "rh" && lista) {
    xl.adicionarTabela(wb, {
      nomeAba: "Novatos (só RH)",
      colunas: [{ titulo: "Nome", chave: "nome", largura: 38 }, { titulo: "Matrícula", chave: "mat", largura: 12 }, { titulo: "Site", chave: "site", largura: 20 }, { titulo: "Serviço", chave: "servico", largura: 26 }, { titulo: "Admissão", chave: "adm", largura: 12 }, { titulo: "Dia", chave: "dia", largura: 8 }, { titulo: "Situação", chave: "sit", largura: 14 }, { titulo: "Avaliação 30 dias", chave: "e30", largura: 22 }, { titulo: "Avaliação 60 dias", chave: "e60", largura: 22 }, { titulo: "Avaliação 85 dias", chave: "e90", largura: 22 }, { titulo: "Sinais", chave: "sinais", largura: 8 }, { titulo: "Prioritário", chave: "prio", largura: 12 }],
      linhas: lista.map((n) => { const e = (t) => { const x = n.etapas.find((y) => y.tipo === t); return x ? `${ETAPA_ST[x.status]}${x.sinais ? ` · ${x.sinais} sinal(is)` : ""}` : ""; }; return { nome: n.nome, mat: n.matricula, site: n.site_rotulo, servico: n.servico, adm: n.data_admissao, dia: n.dia, sit: SIT[n.situacao], e30: e(30), e60: e(60), e90: e(90), sinais: n.sinais_total, prio: n.prioritario ? "Sim" : "" }; }),
    });
  }
  return wb.xlsx.writeBuffer();
}

async function excelDoComparativoSupervisor(r) {
  const wb = xl.novoWorkbook();
  const pa = `${r.periodo_a.de} a ${r.periodo_a.ate}`, pb = `${r.periodo_b.de} a ${r.periodo_b.ate}`;
  xl.adicionarTabela(wb, { nomeAba: "Resumo", colunas: [{ titulo: "Item", chave: "k", largura: 34 }, { titulo: "Valor", chave: "v", largura: 100 }], linhas: [
    { k: "Visão", v: "Supervisor" }, { k: "Período anterior", v: pa }, { k: "Período atual", v: pb },
    { k: "Novatos (anterior → atual)", v: `${r.geral.a.novatos} → ${r.geral.b.novatos}` }, { k: "Nota média (anterior → atual)", v: `${r.geral.a.media ?? "—"} → ${r.geral.b.media ?? "—"}` },
    { k: "Com sinal de atenção % (anterior → atual)", v: `${r.geral.a.com_sinal_pct ?? "—"} → ${r.geral.b.com_sinal_pct ?? "—"}` }, { k: "Leitura", v: r.resumo }, { k: "Como ler", v: r.avisos.join(" ") }] });
  xl.adicionarTabela(wb, { nomeAba: "Por requisito", colunas: [{ titulo: "Requisito", chave: "r", largura: 30 }, { titulo: "Anterior", chave: "a", formato: "decimal1", largura: 12 }, { titulo: "Atual", chave: "b", formato: "decimal1", largura: 12 }, { titulo: "Variação", chave: "d", formato: "decimal1", largura: 12 }, { titulo: "Tendência", chave: "t", largura: 14 }], linhas: r.requisitos.map((x) => ({ r: x.rotulo, a: num(x.a), b: num(x.b), d: num(x.delta), t: TEND[x.tendencia] || "" })) });
  xl.adicionarTabela(wb, { nomeAba: "Por avaliação", colunas: [{ titulo: "Avaliação", chave: "e", largura: 18 }, { titulo: "Respostas (ant.)", chave: "ra", largura: 16 }, { titulo: "Respostas (atual)", chave: "rb", largura: 16 }, { titulo: "Indicador", chave: "i", largura: 24 }, { titulo: "Anterior", chave: "a", formato: "decimal1", largura: 12 }, { titulo: "Atual", chave: "b", formato: "decimal1", largura: 12 }, { titulo: "Variação", chave: "d", formato: "decimal1", largura: 12 }, { titulo: "Tendência", chave: "t", largura: 14 }],
    linhas: r.etapas.flatMap((e) => [["Nota média", e.media], ["% com sinal", e.com_sinal]].map(([i, x]) => ({ e: `${e.tipo === 90 ? 85 : e.tipo} dias`, ra: e.a_respostas, rb: e.b_respostas, i, a: num(x.a), b: num(x.b), d: num(x.delta), t: e.poucos ? "Poucos novatos" : TEND[x.tendencia] || "" }))) });
  for (const [nomeAba, grupos, titulo] of [["Por site", r.por_site, "Site"], ["Por serviço", r.por_servico, "Serviço"]]) {
    xl.adicionarTabela(wb, { nomeAba, colunas: [{ titulo, chave: "g", largura: 36 }, { titulo: "Novatos (ant.)", chave: "na", largura: 14 }, { titulo: "Novatos (atual)", chave: "nb", largura: 14 }, { titulo: "Média ant.", chave: "ma", formato: "decimal1", largura: 12 }, { titulo: "Média atual", chave: "mb", formato: "decimal1", largura: 12 }, { titulo: "Variação da média", chave: "dm", formato: "decimal1", largura: 16 }, { titulo: "Com sinal ant. (%)", chave: "sa", formato: "decimal1", largura: 16 }, { titulo: "Com sinal atual (%)", chave: "sb", formato: "decimal1", largura: 16 }, { titulo: "Variação do sinal (p.p.)", chave: "ds", formato: "decimal1", largura: 20 }],
      linhas: grupos.map((g) => ({ g: g.rotulo, na: g.a_novatos, nb: g.b_novatos, ma: num(g.a_media), mb: num(g.b_media), dm: num(g.delta_media), sa: num(g.a_sinal_pct), sb: num(g.b_sinal_pct), ds: num(g.delta_sinal) })) });
  }
  return wb.xlsx.writeBuffer();
}

module.exports = { importacoes, desfazerImportacao, excluirImportacaoAnterior, importarSupervisor, excelDoSupervisor, excelDoComparativoSupervisor, comparativo, exportarComparativo, periodos, somaDias, excelDoComparativoCanguru, excelDoCanguru, PUBLICOS, importar, importarAdmissoes, modeloAdmissoes, novatosAdmissao, acompanhamento, ficha, admissao, atencao, pontos, abrirPonto, atualizarPonto, obterConfig, salvarConfig, resultado, relatorio, exportar };
