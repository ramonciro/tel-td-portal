/**
 * rhRetencaoController.js — Turnover e pesquisa de desligamento do RH (Pacote 8, 13/11/2026)
 *
 * coordenador_rh e analista_rh: importam as planilhas, veem a lista nominal e os comentários | gestor_rh: só totais e percentuais de grupos
 * com o mínimo de pessoas | coordenador_rh: também apaga um desligamento lançado errado. Perfil cliente não entra aqui.
 * CommonJS — nunca usar import/export.
 */
const R = require("../lib/rhBase");
const xl = require("../lib/excelExport");
const S = require("../services/rhRetencaoService");
const { registrarAuditoria } = require("../services/auditoria");

const auditar = (req, acao, entidade, id, resumo, antes, depois) =>
  registrarAuditoria({ usuario: req.user, acao, entidade, entidadeId: id, resumo, dadosAntes: antes, dadosDepois: depois, ip: req.ip });
const ehOperacao = (c) => R.PERFIS_OPERACAO.includes(c.perfil);
const falha = (res, e, rotulo, msg) => {
  if (e && e.status) return res.status(e.status).json({ ok: false, message: e.message, error: e.message });
  console.error(`[rh.retencao.${rotulo}]`, e);
  return R.erro(res, 500, msg);
};
const idParam = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : null; };
const enviarXlsx = async (res, wb, nome) => {
  const buf = await wb.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  return res.send(Buffer.from(buf));
};
const arquivoDe = (req) => {
  const f = (req.files || [])[0];
  return f ? { buffer: f.buffer, nome: Buffer.from(f.originalname || "planilha.xlsx", "latin1").toString("utf8") } : null;
};
const simularDe = (req) => String(req.body?.simular ?? "1") !== "0";

// ── Importações (equipe do RH) ────────────────────────────────────────
async function importarDesligamentos(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const simular = simularDe(req);
    const rel = await S.importarDesligamentos({ empresaId: c.empresaId, usuario: req.user, arquivo: arquivoDe(req), simular });
    if (!simular) auditar(req, "importar", "rh_desligamentos", null, `Importou desligamentos: ${rel.resultado.novas} novo(s), ${rel.resultado.atualizadas} atualizado(s)`, null, { arquivo: rel.arquivo, resultado: rel.resultado, problemas: rel.problemas.length });
    return res.json({ ok: true, ...rel });
  } catch (e) { return falha(res, e, "importar_desligamentos", "Erro ao importar os desligamentos"); }
}
async function importarQuadro(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const simular = simularDe(req);
    const rel = await S.importarQuadro({ empresaId: c.empresaId, usuario: req.user, arquivo: arquivoDe(req), simular });
    if (!simular) auditar(req, "importar", "rh_quadro", null, `Importou o quadro mensal: ${rel.resultado.novas} novo(s), ${rel.resultado.atualizadas} atualizado(s)`, null, { arquivo: rel.arquivo, resultado: rel.resultado, problemas: rel.problemas.length });
    return res.json({ ok: true, ...rel });
  } catch (e) { return falha(res, e, "importar_quadro", "Erro ao importar o quadro mensal"); }
}
async function importarPesquisa(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const simular = simularDe(req);
    const rel = await S.importarPesquisa({ empresaId: c.empresaId, usuario: req.user, arquivo: arquivoDe(req), simular });
    if (!simular) auditar(req, "importar", "rh_desl_pesquisa", null, `Importou a pesquisa de desligamento: ${rel.resultado.novas} nova(s), ${rel.resultado.atualizadas} atualizada(s)`, null, { arquivo: rel.arquivo, resultado: rel.resultado, problemas: rel.problemas.length });
    return res.json({ ok: true, ...rel });
  } catch (e) { return falha(res, e, "importar_pesquisa", "Erro ao importar a pesquisa de desligamento"); }
}

const MODELOS = {
  desligamentos: { arquivo: "modelo_desligamentos.xlsx", aba: "Desligamentos", colunas: [["Matrícula", 14], ["Nome", 36], ["Cargo", 24], ["Serviço", 24], ["Site", 22], ["Coordenador", 26], ["Supervisor", 26], ["Data de admissão", 18], ["Data do desligamento", 20], ["Tipo (pedido de demissão / iniciativa da empresa)", 30], ["Motivo", 32], ["Recontratável (sim/não)", 18]],
    exemplo: ["12345", "Exemplo (apague esta linha)", "Operador", "Atendimento", "Site Centro", "Coordenador Exemplo", "Supervisor Exemplo", "01/08/2026", "15/10/2026", "Pedido de demissão", "Proposta de outro emprego", "sim"] },
  quadro: { arquivo: "modelo_quadro_mensal.xlsx", aba: "Quadro", colunas: [["Competência (mês/ano)", 22], ["Headcount", 14], ["Serviço (opcional)", 26], ["Site (opcional)", 24]], exemplo: ["10/2026", 120, "Atendimento", ""] },
  pesquisa: { arquivo: "modelo_pesquisa_desligamento.xlsx", aba: "Pesquisa", colunas: [["Matrícula", 14], ["Data da resposta", 18], ["Motivo principal", 32], ["Nota liderança (1 a 5)", 18], ["Nota remuneração (1 a 5)", 20], ["Nota ambiente (1 a 5)", 18], ["Nota carreira (1 a 5)", 18], ["Nota atividades (1 a 5)", 20], ["Nota condições de trabalho (1 a 5)", 22], ["Recomendaria a empresa (sim/não)", 24], ["Voltaria a trabalhar aqui (sim/não)", 24], ["Comentário", 48]],
    exemplo: ["12345", "20/10/2026", "Remuneração", 3, 2, 4, 3, 4, 4, "sim", "não", "Exemplo (apague esta linha)"] },
};
async function modelo(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const m = MODELOS[String(req.query.tipo || "")];
    if (!m) return R.erro(res, 400, "Escolha o modelo: desligamentos, quadro ou pesquisa.");
    const wb = xl.novoWorkbook();
    xl.adicionarTabela(wb, { nomeAba: m.aba, colunas: m.colunas.map(([titulo, largura], i) => ({ titulo, chave: `c${i}`, largura })), linhas: [Object.fromEntries(m.exemplo.map((v, i) => [`c${i}`, v]))] });
    return await enviarXlsx(res, wb, m.arquivo);
  } catch (e) { return falha(res, e, "modelo", "Erro ao gerar o modelo"); }
}

// ── Turnover ──────────────────────────────────────────────────────────
async function turnover(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try { return res.json({ ...(await S.turnover(c.empresaId, req.query, { ocultar: !ehOperacao(c) })), pode_importar: ehOperacao(c), pode_apagar: c.perfil === R.PERFIL_COORD }); }
  catch (e) { return falha(res, e, "turnover", "Erro ao carregar o turnover"); }
}
async function opcoesTurnover(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try { return res.json({ ok: true, ...(await S.opcoesTurnover(c.empresaId)) }); }
  catch (e) { return falha(res, e, "opcoes", "Erro ao carregar os filtros"); }
}
async function lista(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const linhas = await S.listaDesligamentos(c.empresaId, req.query);
    await R.registrarLeitura(req, c.empresaId, "desligamentos_lista", null, "Abriu a lista nominal de desligamentos");
    return res.json({ ok: true, desligamentos: linhas, tipos: S.TIPOS });
  } catch (e) { return falha(res, e, "lista", "Erro ao carregar a lista de desligamentos"); }
}
async function remover(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  try {
    const id = idParam(req); if (!id) return R.erro(res, 404, "Desligamento não encontrado");
    const d = await S.removerDesligamento(c.empresaId, id);
    auditar(req, "excluir", "rh_desligamentos", id, `Apagou um desligamento lançado (matrícula ${d.matricula_chave})`, { matricula: d.matricula_chave }, null);
    return res.json({ ok: true });
  } catch (e) { return falha(res, e, "remover", "Erro ao apagar o desligamento"); }
}
async function exportarTurnover(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const op = ehOperacao(c);
    const t = await S.turnover(c.empresaId, req.query, { ocultar: !op });
    const wb = xl.novoWorkbook();
    if (t.poucos) { xl.adicionarTabela(wb, { nomeAba: "Resumo", colunas: [{ titulo: "Aviso", chave: "a", largura: 90 }], linhas: [{ a: t.mensagem }] }); return await enviarXlsx(res, wb, "turnover.xlsx"); }
    const g = t.geral;
    xl.adicionarTabela(wb, { nomeAba: "Resumo", colunas: [{ titulo: "Indicador", chave: "i", largura: 40 }, { titulo: "Valor", chave: "v", largura: 22 }], linhas: [
      { i: "Período", v: `${t.periodo.de} a ${t.periodo.ate}` }, { i: "Desligamentos", v: g.desligamentos }, { i: "Pedidos de demissão", v: g.voluntarios }, { i: "Iniciativa da empresa", v: g.involuntarios }, { i: "Tipo não informado", v: g.nao_informado },
      { i: "Saída precoce (até 90 dias)", v: g.saida_precoce }, { i: "% saída precoce (entre os com admissão)", v: g.saida_precoce_pct ?? "" }, { i: "Headcount médio", v: g.headcount_medio ?? "" }, { i: "Taxa do período (%)", v: g.taxa_periodo ?? "" }, { i: "Taxa mensal média (%)", v: g.taxa_mensal_media ?? "" }] });
    xl.adicionarTabela(wb, { nomeAba: "Por mês", colunas: [{ titulo: "Mês", chave: "mes", largura: 12 }, { titulo: "Desligamentos", chave: "desligamentos", largura: 16 }, { titulo: "Pedidos de demissão", chave: "voluntarios", largura: 20 }, { titulo: "Iniciativa da empresa", chave: "involuntarios", largura: 22 }, { titulo: "Headcount", chave: "headcount", largura: 12 }, { titulo: "Taxa (%)", chave: "taxa", largura: 10 }], linhas: t.mensal.map((m) => ({ ...m, headcount: m.headcount ?? "", taxa: m.taxa ?? "" })) });
    xl.adicionarTabela(wb, { nomeAba: "Tempo de casa", colunas: [{ titulo: "Faixa", chave: "rotulo", largura: 20 }, { titulo: "Saídas", chave: "n", largura: 10 }, { titulo: "%", chave: "pct", largura: 10 }], linhas: t.faixas_tempo.map((f) => ({ ...f, pct: f.pct ?? "" })) });
    xl.adicionarTabela(wb, { nomeAba: "Motivos", colunas: [{ titulo: "Motivo", chave: "rotulo", largura: 40 }, { titulo: "Saídas", chave: "n", largura: 10 }, { titulo: "%", chave: "pct", largura: 10 }], linhas: t.motivos.map((m) => ({ ...m, pct: m.pct ?? "" })) });
    const colsDim = [{ titulo: "Grupo", chave: "rotulo", largura: 32 }, { titulo: "Saídas", chave: "desligamentos", largura: 10 }, { titulo: "Pedidos de demissão", chave: "voluntarios", largura: 20 }, { titulo: "Saída precoce", chave: "saida_precoce", largura: 14 }, { titulo: "Headcount médio", chave: "headcount_medio", largura: 16 }, { titulo: "Taxa do período (%)", chave: "taxa_periodo", largura: 18 }];
    const semNulo = (x) => ({ ...x, headcount_medio: x.headcount_medio ?? "", taxa_periodo: x.taxa_periodo ?? "" });
    xl.adicionarTabela(wb, { nomeAba: "Por serviço", colunas: colsDim, linhas: t.por_servico.linhas.map(semNulo) });
    xl.adicionarTabela(wb, { nomeAba: "Por site", colunas: colsDim, linhas: t.por_site.linhas.map(semNulo) });
    if (op) {
      const l = await S.listaDesligamentos(c.empresaId, req.query, 2000);
      await R.registrarLeitura(req, c.empresaId, "desligamentos_exportacao_nominal", null, "Exportou o turnover com a lista nominal de desligamentos");
      xl.adicionarTabela(wb, { nomeAba: "Lista nominal", colunas: [{ titulo: "Matrícula", chave: "matricula", largura: 12 }, { titulo: "Nome", chave: "nome", largura: 34 }, { titulo: "Serviço", chave: "servico", largura: 22 }, { titulo: "Site", chave: "site", largura: 20 }, { titulo: "Admissão", chave: "data_admissao", largura: 12 }, { titulo: "Desligamento", chave: "data_desligamento", largura: 14 }, { titulo: "Dias de casa", chave: "dias_de_casa", largura: 12 }, { titulo: "Tipo", chave: "tipo_rotulo", largura: 20 }, { titulo: "Motivo", chave: "motivo", largura: 30 }], linhas: l.map((x) => ({ ...x, dias_de_casa: x.dias_de_casa ?? "" })) });
    }
    return await enviarXlsx(res, wb, "turnover.xlsx");
  } catch (e) { return falha(res, e, "exportar_turnover", "Erro ao exportar o turnover"); }
}

// ── Pesquisa de desligamento ──────────────────────────────────────────
async function pesquisa(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const out = await S.resultadoPesquisa(c.empresaId, req.query, { ocultar: !ehOperacao(c) });
    if (ehOperacao(c) && out.comentarios?.length) await R.registrarLeitura(req, c.empresaId, "desligamento_comentarios", null, "Abriu os comentários da pesquisa de desligamento");
    return res.json({ ...out, pode_importar: ehOperacao(c) });
  } catch (e) { return falha(res, e, "pesquisa", "Erro ao carregar a pesquisa de desligamento"); }
}
async function exportarPesquisa(req, res) {
  const c = R.contexto(req, res); if (!c) return;
  try {
    const op = ehOperacao(c);
    const p = await S.resultadoPesquisa(c.empresaId, req.query, { ocultar: !op });
    const wb = xl.novoWorkbook();
    if (p.poucos) {
      xl.adicionarTabela(wb, { nomeAba: "Resumo", colunas: [{ titulo: "Aviso", chave: "a", largura: 90 }], linhas: [{ a: p.mensagem }] });
    } else {
      xl.adicionarTabela(wb, { nomeAba: "Resumo", colunas: [{ titulo: "Indicador", chave: "i", largura: 40 }, { titulo: "Valor", chave: "v", largura: 18 }], linhas: [
        { i: "Período", v: `${p.periodo.de} a ${p.periodo.ate}` }, { i: "Respostas", v: p.respostas }, { i: "Desligamentos no período", v: p.desligamentos_no_periodo }, { i: "Cobertura (%)", v: p.cobertura_pct ?? "" },
        { i: "Recomendaria a empresa (%)", v: p.recomendaria.pct ?? "" }, { i: "Voltaria a trabalhar aqui (%)", v: p.voltaria.pct ?? "" }] });
      xl.adicionarTabela(wb, { nomeAba: "Notas", colunas: [{ titulo: "Dimensão", chave: "nome", largura: 32 }, { titulo: "Média (1 a 5)", chave: "media", largura: 14 }, { titulo: "Respostas", chave: "n", largura: 12 }], linhas: p.notas.map((n) => ({ ...n, media: n.media ?? "" })) });
      xl.adicionarTabela(wb, { nomeAba: "Motivos", colunas: [{ titulo: "Motivo principal", chave: "rotulo", largura: 40 }, { titulo: "Respostas", chave: "n", largura: 12 }, { titulo: "%", chave: "pct", largura: 10 }], linhas: p.motivos.map((m) => ({ ...m, pct: m.pct ?? "" })) });
      const cols = [{ titulo: "Grupo", chave: "rotulo", largura: 30 }, { titulo: "Respostas", chave: "respostas", largura: 12 }, { titulo: "Nota média", chave: "nota_media", largura: 12 }, { titulo: "Recomendaria (%)", chave: "recomendaria_pct", largura: 18 }, { titulo: "Motivo mais citado", chave: "motivo_principal", largura: 32 }];
      const sn = (x) => ({ ...x, nota_media: x.nota_media ?? "", recomendaria_pct: x.recomendaria_pct ?? "", motivo_principal: x.motivo_principal ?? "" });
      xl.adicionarTabela(wb, { nomeAba: "Por serviço", colunas: cols, linhas: p.por_servico.linhas.map(sn) });
      xl.adicionarTabela(wb, { nomeAba: "Por site", colunas: cols, linhas: p.por_site.linhas.map(sn) });
      if (op && p.comentarios) {
        await R.registrarLeitura(req, c.empresaId, "desligamento_comentarios_exportacao", null, "Exportou a pesquisa de desligamento com comentários");
        xl.adicionarTabela(wb, { nomeAba: "Comentários", colunas: [{ titulo: "Data", chave: "data", largura: 12 }, { titulo: "Serviço", chave: "servico", largura: 22 }, { titulo: "Site", chave: "site", largura: 20 }, { titulo: "Motivo", chave: "motivo", largura: 28 }, { titulo: "Prioritário", chave: "prio", largura: 12 }, { titulo: "Comentário", chave: "texto", largura: 80 }], linhas: p.comentarios.map((x) => ({ ...x, servico: x.servico || "", site: x.site || "", motivo: x.motivo || "", prio: x.prioritario ? "sim" : "" })) });
      }
    }
    return await enviarXlsx(res, wb, "pesquisa_desligamento.xlsx");
  } catch (e) { return falha(res, e, "exportar_pesquisa", "Erro ao exportar a pesquisa de desligamento"); }
}

module.exports = { importarDesligamentos, importarQuadro, importarPesquisa, modelo, turnover, opcoesTurnover, lista, remover, exportarTurnover, pesquisa, exportarPesquisa };
