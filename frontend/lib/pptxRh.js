// Arquivo PowerPoint (.pptx) do RH (13/11/2026): monta o mesmo conteúdo dos slides da tela de Apresentação, mas como arquivo
// editável. Parte dos mesmos relatórios já calculados (cliente, diretoria, RH), então os números batem com a tela e com o Excel.
// A biblioteca é carregada só quando a pessoa clica em "Baixar PowerPoint" (não pesa nas outras telas).
import { pct0, pct1, dec1, fmtN, fmtDia, NOME_PERFIL } from "../components/RhUi";

const COR = "BE185D", TINTA = "0F172A", CINZA = "64748B", LINHA = "E2E8F0", VERDE = "16A34A", VERMELHO = "DC2626", AMBAR = "B45309";
const FAROL = { verde: { t: "Verde", c: VERDE }, amarelo: { t: "Amarelo", c: AMBAR }, vermelho: { t: "Vermelho", c: VERMELHO } };
const RISCO = { baixo: { t: "Risco baixo", c: VERDE }, moderado: { t: "Risco moderado", c: AMBAR }, alto: { t: "Risco alto", c: VERMELHO } };
const FONTE = "Calibri";
const slug = (s) => String(s || "apresentacao").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "apresentacao";

async function novo(titulo) {
  // O pacote já declara que no navegador não usa fs/https (campo "browser"), então o import normal funciona.
  const mod = await import("pptxgenjs");
  const Pptx = mod.default || mod;
  const p = new Pptx();
  p.layout = "LAYOUT_WIDE"; // 13,33 x 7,5 polegadas (16:9)
  // Os metadados do arquivo não são escapados pela biblioteca: "&", "<" e aspas deixariam o .pptx inválido (o PowerPoint avisaria "arquivo corrompido").
  p.title = String(titulo || "Apresentação").replace(/[&<>"']/g, " ").replace(/\s+/g, " ").trim(); p.author = "Portal de Treinamento · Relações Humanas"; p.company = "Portal de Treinamento";
  return p;
}

function capa(p, { eyebrow, titulo, sub, linha }) {
  const s = p.addSlide();
  s.background = { color: TINTA };
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: COR }, line: { color: COR } });
  s.addText(String(eyebrow || "").toUpperCase(), { x: 0.9, y: 1.7, w: 11.5, h: 0.4, fontFace: FONTE, fontSize: 16, color: "CBD5E1", charSpacing: 4 });
  s.addText(titulo || "", { x: 0.9, y: 2.2, w: 11.5, h: 1.6, fontFace: FONTE, fontSize: 44, bold: true, color: "FFFFFF", valign: "top" });
  if (sub) s.addText(sub, { x: 0.9, y: 3.9, w: 11.5, h: 0.6, fontFace: FONTE, fontSize: 22, color: "E2E8F0" });
  if (linha) s.addText(linha, { x: 0.9, y: 5.6, w: 11.5, h: 0.8, fontFace: FONTE, fontSize: 15, color: "94A3B8", valign: "top" });
  return s;
}
function slide(p, titulo, sub, rodape) {
  const s = p.addSlide();
  s.background = { color: "FFFFFF" };
  s.addShape(p.ShapeType.rect, { x: 0.5, y: 0.45, w: 0.09, h: sub ? 0.95 : 0.6, fill: { color: COR }, line: { color: COR } });
  s.addText(titulo, { x: 0.75, y: 0.4, w: 12, h: 0.6, fontFace: FONTE, fontSize: 28, bold: true, color: TINTA, valign: "middle" });
  if (sub) s.addText(sub, { x: 0.75, y: 0.98, w: 12, h: 0.4, fontFace: FONTE, fontSize: 14, color: "475569" });
  if (rodape) s.addText(rodape, { x: 0.5, y: 7.05, w: 10.5, h: 0.3, fontFace: FONTE, fontSize: 10, color: "94A3B8" });
  s.slideNumber = { x: 12.2, y: 7.05, w: 0.7, h: 0.3, fontFace: FONTE, fontSize: 10, color: "94A3B8", align: "right" };
  return s;
}
function cartoes(s, itens, y = 3.6) {
  const n = itens.length, gap = 0.2, w = (12.3 - gap * (n - 1)) / n;
  itens.forEach(([k, v, cor], i) => {
    const x = 0.5 + i * (w + gap);
    s.addShape("roundRect", { x, y, w, h: 1.5, fill: { color: "FFFFFF" }, line: { color: LINHA, width: 1 }, rectRadius: 0.1 });
    s.addText(k, { x: x + 0.12, y: y + 0.08, w: w - 0.24, h: 0.5, fontFace: FONTE, fontSize: 11.5, bold: true, color: CINZA, valign: "top" });
    s.addText(String(v), { x: x + 0.12, y: y + 0.6, w: w - 0.24, h: 0.8, fontFace: FONTE, fontSize: 26, bold: true, color: cor || TINTA, valign: "middle", fit: "shrink" });
  });
}
const cab = (t, o = {}) => ({ text: t, options: { bold: true, color: CINZA, fill: { color: "F8FAFC" }, fontSize: 12, align: o.align || "left" } });
const cel = (t, o = {}) => ({ text: String(t ?? "—"), options: { color: o.cor || TINTA, bold: !!o.negrito, fontSize: o.tam || 14, align: o.align || "left" } });
function tabela(s, linhas, colW, y = 1.65, extra = {}) {
  s.addTable(linhas, { x: extra.x ?? 0.5, y, w: colW.reduce((a, b) => a + b, 0), colW, fontFace: FONTE, border: { type: "solid", pt: 0.5, color: LINHA }, valign: "middle", margin: [0.04, 0.08, 0.04, 0.08], rowH: 0.4 });
}
const faroCel = (f) => cel(FAROL[f]?.t || "—", { cor: FAROL[f]?.c || CINZA, negrito: true });

// ── Clima ─────────────────────────────────────────────────────────
export async function gerarPptxClima(r, planos) {
  const p = await novo(`${r.ciclo.nome} · Clima`);
  const rod = `${r.ciclo.nome} · Relatório para ${r.publico_rotulo}`;
  const tema = new Map((r.tema_nomes || []).map((t) => [t.id, t.nome]));
  capa(p, { eyebrow: "Relações Humanas · Clima organizacional", titulo: r.ciclo.nome, sub: r.ciclo.cliente || "", linha: `Respostas de ${fmtDia(r.ciclo.data_ini)} a ${fmtDia(r.ciclo.data_fim)} · ${fmtN(r.ciclo.n_respondentes)} respondentes · Relatório para ${r.publico_rotulo}` });
  if (r.resumo) {
    const s = slide(p, "Em uma frase", null, rod);
    s.addText(r.resumo.texto || "", { x: 0.6, y: 1.4, w: 12.1, h: 1.9, fontFace: FONTE, fontSize: 22, color: TINTA, valign: "top", fit: "shrink" });
    cartoes(s, [["Respondentes", fmtN(r.ciclo.n_respondentes)], ["Respostas positivas", pct1(r.resumo.geral.pos_pct), VERDE], ["Respostas negativas", pct1(r.resumo.geral.neg_pct), VERMELHO], ["Nota média das áreas (0 a 10)", dec1(r.resumo.nota_media)], ["Temas em vermelho", `${r.resumo.temas_vermelhos} de ${r.resumo.total_temas}`, COR]]);
  }
  if (r.temas?.length) {
    const s = slide(p, "Resultado por tema", "Share de respostas positivas, neutras e negativas", rod);
    tabela(s, [[cab("Tema"), cab("Positivas", { align: "right" }), cab("Neutras", { align: "right" }), cab("Negativas", { align: "right" }), cab("Farol")],
      ...r.temas.slice(0, 11).map((x) => [cel(x.nome, { negrito: true }), cel(pct1(x.pos_pct), { align: "right", negrito: true }), cel(pct1(x.neu_pct), { align: "right" }), cel(pct1(x.neg_pct), { align: "right" }), faroCel(x.farol)])], [5.6, 1.7, 1.7, 1.7, 1.6]);
    s.addText(`Farol: verde a partir de ${r.limites.farol_verde_min}% positivas, amarelo a partir de ${r.limites.farol_amarelo_min}%, vermelho abaixo.`, { x: 0.5, y: 6.65, w: 12, h: 0.3, fontFace: FONTE, fontSize: 10.5, color: CINZA });
  }
  if (r.afirmacoes) {
    const s = slide(p, "O que mais e o que menos agrada", "Afirmações com maior e menor percentual de respostas positivas", rod);
    [["Mais bem avaliadas", r.afirmacoes.melhores, VERDE, 0.5], ["Menos bem avaliadas", r.afirmacoes.piores, VERMELHO, 6.85]].forEach(([tit, itens, cor, x]) => {
      s.addText(tit, { x, y: 1.6, w: 6, h: 0.4, fontFace: FONTE, fontSize: 16, bold: true, color: cor });
      tabela(s, (itens || []).map((q) => [cel(`${q.texto}\n${tema.get(q.tema_id) || ""}`, { tam: 12.5 }), cel(pct1(q.pos_pct), { align: "right", negrito: true })]), [5.0, 1.0], 2.05, { x });
    });
  }
  if (r.notas?.length) {
    const s = slide(p, "Nota das áreas de apoio", "Média de 0 a 10 e quem deu nota alta ou baixa", rod);
    tabela(s, [[cab("Área"), cab("Nota média", { align: "right" }), cab("Notas 9 e 10", { align: "right" }), cab("Notas até 6", { align: "right" })],
      ...[...r.notas].sort((a, b) => (b.media ?? -1) - (a.media ?? -1)).map((a) => [cel(a.area, { negrito: true }), cel(dec1(a.media), { align: "right", negrito: true, tam: 14 }), cel(pct0(a.pct_9_10), { align: "right", cor: VERDE }), cel(pct0(a.pct_0_6), { align: "right", cor: VERMELHO })])], [6.0, 2.1, 2.1, 2.1]);
  }
  if (r.perfil) {
    const s = slide(p, "Quem respondeu", null, rod);
    Object.entries(r.perfil).filter(([k]) => ["tempo", "faixa", "genero", "servico", "escolaridade", "cargo"].includes(k)).slice(0, 6).forEach(([k, itens], i) => {
      const x = 0.5 + (i % 3) * 4.15, y = 1.4 + Math.floor(i / 3) * 2.8;
      s.addShape("roundRect", { x, y, w: 3.95, h: 2.65, fill: { color: "FFFFFF" }, line: { color: LINHA, width: 1 }, rectRadius: 0.08 });
      s.addText(NOME_PERFIL[k] || k, { x: x + 0.12, y: y + 0.06, w: 3.7, h: 0.4, fontFace: FONTE, fontSize: 14, bold: true, color: TINTA });
      s.addText(itens.slice(0, 6).map((q) => ({ text: `${q.rotulo}: ${fmtN(q.n)} (${pct0(q.pct)})`, options: { breakLine: true } })), { x: x + 0.12, y: y + 0.5, w: 3.7, h: 2.05, fontFace: FONTE, fontSize: 11.5, color: TINTA, valign: "top", fit: "shrink" });
    });
  }
  (r.recortes || []).forEach((rc) => {
    const s = slide(p, `Por ${rc.nome.toLowerCase()}`, "Respostas positivas por grupo; grupos pequenos não aparecem", rod);
    const extremos = (g) => { const ok = (g.temas || []).filter((x) => x.pos_pct !== null && x.pos_pct !== undefined); if (!ok.length) return ["—", "—"]; const mx = ok.reduce((a, b) => (b.pos_pct > a.pos_pct ? b : a)); const mn = ok.reduce((a, b) => (b.pos_pct < a.pos_pct ? b : a)); return [`${tema.get(mx.id) || ""} (${pct0(mx.pos_pct)})`, `${tema.get(mn.id) || ""} (${pct0(mn.pos_pct)})`]; };
    tabela(s, [[cab(rc.nome), cab("Resp.", { align: "right" }), cab("Positivas", { align: "right" }), cab("Farol"), cab("Ponto mais forte"), cab("Ponto mais fraco")],
      ...[{ rotulo: "Geral", ...rc.geral, _g: true }, ...rc.grupos].slice(0, 9).map((g) => { const [mx, mn] = extremos(g); return [cel(g.rotulo, { negrito: true }), cel(fmtN(g.n), { align: "right" }), cel(pct1(g.pos_pct), { align: "right", negrito: true }), faroCel(g.farol), cel(mx, { tam: 11.5 }), cel(mn, { tam: 11.5 })]; })], [2.6, 0.9, 1.2, 1.2, 3.2, 3.2]);
  });
  if (planos?.length) {
    const s = slide(p, "Plano de ação", "O que o RH assumiu fazer a partir desta pesquisa", rod);
    tabela(s, [[cab("Ação"), cab("Tema"), cab("Prazo"), cab("Situação")],
      ...planos.slice(0, 8).map((x) => [cel(x.titulo, { negrito: true }), cel(x.tema || "—"), cel(fmtDia(x.prazo)), cel(`${x.status_rotulo}${x.situacao === "atrasado" ? " · atrasado" : ""}`)])], [5.6, 2.9, 1.7, 2.1]);
  }
  const s = slide(p, "Como ler os números", null, rod);
  s.addText([
    { text: "Positivo = Concordo + Concordo totalmente. Negativo = Discordo + Discordo totalmente. Neutro inclui “Não sei”.", options: { bullet: true, breakLine: true } },
    { text: `Farol: verde a partir de ${r.limites.farol_verde_min}% positivas, amarelo a partir de ${r.limites.farol_amarelo_min}%, vermelho abaixo.`, options: { bullet: true, breakLine: true } },
    { text: `A pesquisa é anônima: grupos com menos de ${r.limites.min_recorte} pessoas não aparecem e entram em “Demais”.`, options: { bullet: true, breakLine: true } },
    { text: "Nota das áreas de apoio vai de 0 a 10.", options: { bullet: true } },
  ], { x: 0.7, y: 1.5, w: 12, h: 4.2, fontFace: FONTE, fontSize: 20, color: TINTA, valign: "top", paraSpaceAfter: 12 });
  await p.writeFile({ fileName: `clima_${slug(r.ciclo.nome)}_${slug(r.publico_rotulo)}.pptx` });
}

// ── Canguru ───────────────────────────────────────────────────────
export async function gerarPptxCanguru(r) {
  const g = r.geral;
  const p = await novo("Projeto Canguru");
  const rod = `Projeto Canguru · Relatório para ${r.publico_rotulo || ""}`;
  capa(p, { eyebrow: "Relações Humanas · Projeto Canguru", titulo: "Acompanhamento dos novatos", sub: "Avaliações de 30, 60 e 90 dias", linha: `${fmtN(g.novatos)} novatos · ${fmtN(g.avaliacoes)} avaliações respondidas · Relatório para ${r.publico_rotulo || ""}` });
  let s = slide(p, "Em uma frase", null, rod);
  s.addText(r.leitura || "", { x: 0.6, y: 1.4, w: 12.1, h: 1.9, fontFace: FONTE, fontSize: 22, color: TINTA, valign: "top", fit: "shrink" });
  cartoes(s, [["Novatos", fmtN(g.novatos)], ["Avaliações respondidas", fmtN(g.avaliacoes)], ["Com algum sinal de atenção", `${fmtN(g.novatos_com_sinal)} (${pct0(g.novatos_com_sinal_pct)})`, AMBAR], ["Sinal em 2 ou mais avaliações", fmtN(g.recorrentes)], ["Sinal nas 3 avaliações", fmtN(g.nas_tres), VERMELHO]]);
  s = slide(p, "Resultado por avaliação", null, rod);
  tabela(s, [["Avaliação", "Respostas", "Expectativas atendidas", "Acolhidos", "Líder bom gestor", "Nota atividades", "Nota apoio", "Com sinal"].map((h, i) => cab(h, { align: i ? "right" : "left" })),
    ...r.etapas.map((e) => [cel(`${e.tipo} dias`, { negrito: true, tam: 14 }), ...[fmtN(e.respostas), pct1(e.expectativas_pct), pct1(e.acolhimento_pct), pct1(e.lideranca_pct), dec1(e.nota_atividades), dec1(e.nota_apoio)].map((v) => cel(v, { align: "right", tam: 14 })), cel(pct1(e.com_sinal_pct), { align: "right", negrito: true, cor: AMBAR, tam: 14 })])], [1.6, 1.3, 1.9, 1.4, 1.7, 1.5, 1.4, 1.5]);
  s.addText("Sinal de atenção: resposta “Não” em expectativas, acolhimento ou liderança, ou nota baixa em atividades, apoio ou clima com os colegas.", { x: 0.5, y: 6.5, w: 12.3, h: 0.4, fontFace: FONTE, fontSize: 10.5, color: CINZA });
  if (r.evolucao?.novatos_com_duas_ou_mais) {
    s = slide(p, "Evolução entre a primeira e a última avaliação", `${fmtN(r.evolucao.novatos_com_duas_ou_mais)} novatos com duas ou mais avaliações`, rod);
    cartoes(s, [["Saíram do sinal", fmtN(r.evolucao.saiu_do_sinal), VERDE], ["Entraram no sinal", fmtN(r.evolucao.entrou_no_sinal), VERMELHO], ["Mantiveram o sinal", fmtN(r.evolucao.manteve_sinal), AMBAR], ["Sem sinal", fmtN(r.evolucao.sem_sinal)]], 2.2);
  }
  if (r.motivos && [r.motivos.insatisfacao_atividades, r.motivos.lideranca, r.motivos.acolhimento_area].some((l) => l?.length)) {
    s = slide(p, "Motivos mais citados", null, rod);
    [["Insatisfação com as atividades", r.motivos.insatisfacao_atividades], ["Liderança", r.motivos.lideranca], ["Acolhimento: onde faltou", r.motivos.acolhimento_area]].forEach(([tit, itens], i) => {
      const x = 0.5 + i * 4.15;
      s.addShape("roundRect", { x, y: 1.4, w: 3.95, h: 5.2, fill: { color: "FFFFFF" }, line: { color: LINHA, width: 1 }, rectRadius: 0.08 });
      s.addText(tit, { x: x + 0.12, y: 1.46, w: 3.7, h: 0.45, fontFace: FONTE, fontSize: 14, bold: true, color: TINTA });
      s.addText(!itens?.length ? "Sem registros." : itens.slice(0, 8).map((m) => ({ text: `${m.motivo}: ${fmtN(m.n)}`, options: { breakLine: true } })), { x: x + 0.12, y: 2.0, w: 3.7, h: 4.5, fontFace: FONTE, fontSize: 12.5, color: TINTA, valign: "top", fit: "shrink" });
    });
  }
  [["Por site", r.por_site, "Site"], ["Por serviço", r.por_servico, "Serviço"]].forEach(([tit, bloco, col]) => {
    if (!bloco?.linhas?.length) return;
    const sl = slide(p, tit, "Percentual de novatos com sinal de atenção e risco", rod);
    tabela(sl, [[cab(col), cab("Novatos", { align: "right" }), cab("Respostas", { align: "right" }), cab("Com sinal", { align: "right" }), cab("Risco")],
      ...bloco.linhas.slice(0, 10).map((l) => [cel(l.rotulo, { negrito: true }), cel(fmtN(l.novatos), { align: "right" }), cel(fmtN(l.respostas), { align: "right" }), cel(l.poucos ? "—" : pct1(l.com_sinal_pct), { align: "right", negrito: true }), l.poucos ? cel("Poucos dados", { cor: CINZA }) : cel(RISCO[l.risco]?.t || "—", { cor: RISCO[l.risco]?.c, negrito: true })])], [5.4, 1.5, 1.7, 1.8, 1.9]);
    if (bloco.linhas.length > 10) sl.addText(`Mostrando 10 de ${bloco.linhas.length}. O Excel traz a lista completa.`, { x: 0.5, y: 6.65, w: 12, h: 0.3, fontFace: FONTE, fontSize: 10.5, color: CINZA });
  });
  await p.writeFile({ fileName: `canguru_${slug(r.publico_rotulo)}.pptx` });
}
