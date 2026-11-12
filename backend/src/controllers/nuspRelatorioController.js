/**
 * nuspRelatorioController.js — Relatório mensal do Núcleo (Pacote 4, 12/11/2026)
 *
 * Gerado na hora, quando alguém pede (sem e-mail automático). É AGREGADO: não traz nome nem matrícula
 * de ninguém, então os três perfis do Núcleo (coordenador, analista e gestor) podem ler.
 * Os números de acolhimento passam pela mesma supressão de células pequenas (mínimo de 5) da tela de indicadores.
 * Saída em JSON (página imprimível, que o navegador salva em PDF) e em Excel.
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const B = require("../lib/nuspBase");
const xl = require("../lib/excelExport");
const acolh = require("./nuspAcolhimentoController");
const dem = require("./nuspDemandasController");

const n = (v) => Number(v || 0);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function intervaloDoMes(mes) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ""));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  const ano = Number(m[1]), mm = Number(m[2]);
  if (ano < 2000 || ano > 2100) return null;
  const ultimo = new Date(Date.UTC(ano, mm, 0)).getUTCDate();
  const p = (x) => String(x).padStart(2, "0");
  return { mes: `${ano}-${p(mm)}`, de: `${ano}-${p(mm)}-01`, ate: `${ano}-${p(mm)}-${p(ultimo)}`, rotulo: `${MESES[mm - 1]} de ${ano}`, ano, mm };
}
function mesAnterior(iv) {
  const d = new Date(Date.UTC(iv.ano, iv.mm - 2, 1));
  return intervaloDoMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
}

async function numerosDoMes(empresaId, de, ate) {
  const W = "a.empresa_id = ? AND a.status <> 'cancelada' AND a.data_inicio BETWEEN ? AND ?";
  const P = [empresaId, de, ate];
  const [[tot]] = await pool.query(
    `SELECT COUNT(*) atividades, SUM(a.status = 'concluida') concluidas, SUM(a.status IN ('planejada','em_andamento')) em_aberto, COALESCE(SUM(a.horas), 0) horas,
            SUM(a.status = 'concluida' AND EXISTS (SELECT 1 FROM nusp_evidencias e WHERE e.empresa_id = a.empresa_id AND e.entidade = 'atividade' AND e.entidade_id = a.id)) com_evidencia
       FROM nusp_atividades a WHERE ${W}`, P);
  const [[pes]] = await pool.query(
    `SELECT COUNT(DISTINCT pa.pessoa_id) pessoas, COUNT(*) participacoes
       FROM nusp_participacoes pa JOIN nusp_atividades a ON a.id = pa.atividade_id
      WHERE ${W} AND pa.presenca = 'presente'`, P);
  const [[leg]] = await pool.query(
    `SELECT COALESCE(SUM(a.pessoas_legado), 0) sem_lista FROM nusp_atividades a
      WHERE ${W} AND a.pessoas_legado IS NOT NULL AND NOT EXISTS (SELECT 1 FROM nusp_participacoes pa WHERE pa.atividade_id = a.id)`, P);
  return {
    atividades: n(tot.atividades), concluidas: n(tot.concluidas), em_aberto: n(tot.em_aberto),
    horas: Math.round(n(tot.horas) * 100) / 100,
    pessoas_unicas: n(pes.pessoas), participacoes: n(pes.participacoes), pessoas_sem_lista: n(leg.sem_lista),
    concluidas_com_evidencia: n(tot.com_evidencia),
    concluidas_sem_evidencia: n(tot.concluidas) - n(tot.com_evidencia),
  };
}

// Agrupa as atividades do mês por uma dimensão (horas fora do JOIN com participações, para não multiplicar).
async function agrupar(empresaId, de, ate, campoNome, joinSql, chave) {
  const W = "a.empresa_id = ? AND a.status <> 'cancelada' AND a.data_inicio BETWEEN ? AND ?";
  const P = [empresaId, de, ate];
  const [rows] = await pool.query(
    `SELECT COALESCE(${campoNome}, 'Não informado') AS nome, COUNT(DISTINCT a.id) AS atividades,
            COUNT(DISTINCT CASE WHEN pa.presenca = 'presente' THEN pa.pessoa_id END) AS pessoas
       FROM nusp_atividades a ${joinSql} LEFT JOIN nusp_participacoes pa ON pa.atividade_id = a.id
      WHERE ${W} GROUP BY ${chave} ORDER BY atividades DESC, nome`, P);
  const [h] = await pool.query(
    `SELECT COALESCE(${campoNome}, 'Não informado') AS nome, COALESCE(SUM(a.horas), 0) AS horas FROM nusp_atividades a ${joinSql} WHERE ${W} GROUP BY ${chave}`, P);
  const horas = new Map(h.map((r) => [r.nome, n(r.horas)]));
  return rows.map((r) => ({ nome: r.nome, atividades: n(r.atividades), horas: horas.get(r.nome) || 0, pessoas: n(r.pessoas) }));
}

async function montar(c, iv) {
  const e = c.empresaId; const hoje = B.hojeISO();
  await B.garantirBase(e);
  const atual = await numerosDoMes(e, iv.de, iv.ate);
  const ant = mesAnterior(iv);
  const anterior = await numerosDoMes(e, ant.de, ant.ate);

  const [programa, unidade, dimensao] = await Promise.all([
    agrupar(e, iv.de, iv.ate, "p.nome", "LEFT JOIN nusp_programas p ON p.id = a.programa_id", "a.programa_id, p.nome"),
    agrupar(e, iv.de, iv.ate, "u.nome", "LEFT JOIN nusp_unidades u ON u.id = a.unidade_id", "a.unidade_id, u.nome"),
    agrupar(e, iv.de, iv.ate, "d.nome", "LEFT JOIN nusp_dimensoes d ON d.id = a.dimensao_id", "a.dimensao_id, d.nome"),
  ]);
  const [tipoRows] = await pool.query(
    `SELECT a.tipo, COUNT(*) atividades, COALESCE(SUM(a.horas), 0) horas FROM nusp_atividades a
      WHERE a.empresa_id = ? AND a.status <> 'cancelada' AND a.data_inicio BETWEEN ? AND ? GROUP BY a.tipo ORDER BY atividades DESC`, [e, iv.de, iv.ate]);
  const rotuloTipo = Object.fromEntries(B.TIPOS_ATIVIDADE.map((t) => [t.value, t.label]));
  const tipo = tipoRows.map((r) => ({ nome: rotuloTipo[r.tipo] || r.tipo, atividades: n(r.atividades), horas: n(r.horas) }));

  // Planos de ação: o que aconteceu no mês + a posição de hoje (não existe retrato do passado).
  const [[pl]] = await pool.query(
    `SELECT SUM(data_identificacao BETWEEN ? AND ? AND status <> 'cancelada') criados,
            SUM(status = 'concluida' AND concluido_em BETWEEN ? AND ?) concluidos,
            SUM(status IN ('pendente','em_andamento')) abertos,
            SUM(status IN ('pendente','em_andamento') AND prazo < ?) atrasados,
            SUM(status IN ('pendente','em_andamento') AND prazo BETWEEN ? AND ?) vencem_no_mes
       FROM nusp_planos_acao WHERE empresa_id = ?`, [iv.de, iv.ate, iv.de, iv.ate, hoje, iv.de, iv.ate, e]);

  // Acolhimentos: só agregado e com supressão (mesma função da tela de indicadores).
  const acolhimentos = await acolh.calcularIndicadores(c, { de: iv.de, ate: iv.ate });

  // Pesquisa de riscos: o ciclo mais recente até o fim do mês, resultado nacional (já com supressão).
  let pesquisa = null;
  const [pq] = await pool.query(
    `SELECT id, nome, ciclo, DATE_FORMAT(data_referencia, '%Y-%m-%d') AS data_referencia, total_respostas FROM nusp_pesquisas
      WHERE empresa_id = ? AND status = 'ativa' AND (data_referencia IS NULL OR data_referencia <= ?) ORDER BY data_referencia DESC, id DESC LIMIT 1`, [e, iv.ate]);
  if (pq[0]) {
    const [dims] = await pool.query(
      `SELECT d.nome, r.pct_exposicao, r.classificacao FROM nusp_pesquisa_resultados r JOIN nusp_dimensoes d ON d.id = r.dimensao_id
        WHERE r.empresa_id = ? AND r.pesquisa_id = ? AND r.recorte = 'nacional' AND r.suprimido = 0 ORDER BY d.ordem, d.id`, [e, pq[0].id]);
    pesquisa = {
      nome: pq[0].nome, ciclo: pq[0].ciclo, data_referencia: pq[0].data_referencia, total_respostas: n(pq[0].total_respostas),
      dimensoes: dims.map((r) => ({ nome: r.nome, pct: r.pct_exposicao === null ? null : Number(r.pct_exposicao), classificacao: r.classificacao })),
    };
  }

  const faleComigo = await dem.calcularIndicadores(e, iv.de, iv.ate);

  return {
    ok: true, mes: iv.mes, rotulo: iv.rotulo, periodo: { de: iv.de, ate: iv.ate },
    mes_anterior: { mes: ant.mes, rotulo: ant.rotulo }, gerado_em: new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" }),
    minimo_celula: B.MINIMO_CELULA,
    atividades: atual, anterior,
    por_programa: programa, por_tipo: tipo, por_unidade: unidade, por_dimensao: dimensao,
    planos: { criados: n(pl.criados), concluidos: n(pl.concluidos), abertos: n(pl.abertos), atrasados: n(pl.atrasados), vencem_no_mes: n(pl.vencem_no_mes) },
    acolhimentos, pesquisa, fale_comigo: faleComigo,
  };
}

function mesDoPedido(q) {
  if (q.mes) return intervaloDoMes(q.mes);
  const hoje = B.hojeISO();
  return intervaloDoMes(hoje.slice(0, 7));
}

async function relatorio(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  const iv = mesDoPedido(req.query);
  if (!iv) return B.erro(res, 400, "Escolha o mês no formato AAAA-MM, por exemplo 2026-11.");
  try {
    return res.json(await montar(c, iv));
  } catch (e) {
    console.error("[nusp.relatorio]", e);
    return B.erro(res, 500, "Erro ao montar o relatório mensal");
  }
}

async function exportar(req, res) {
  const c = B.contexto(req, res); if (!c) return;
  const iv = mesDoPedido(req.query);
  if (!iv) return B.erro(res, 400, "Escolha o mês no formato AAAA-MM, por exemplo 2026-11.");
  try {
    const r = await montar(c, iv);
    const wb = xl.novoWorkbook();
    const pct = (v) => (v === null || v === undefined ? "—" : `${String(v).replace(".", ",")}%`);
    const dec = (v) => (v === null || v === undefined ? "—" : String(v).replace(".", ","));
    const a = r.atividades, an = r.anterior, ac = r.acolhimentos, fc = r.fale_comigo, pl = r.planos;
    const resumo = [
      { bloco: "Atividades", indicador: "Atividades realizadas e em andamento no mês", valor: a.atividades, comparativo: an.atividades },
      { bloco: "Atividades", indicador: "Concluídas", valor: a.concluidas, comparativo: an.concluidas },
      { bloco: "Atividades", indicador: "Ainda planejadas ou em andamento", valor: a.em_aberto, comparativo: an.em_aberto },
      { bloco: "Atividades", indicador: "Horas", valor: dec(a.horas), comparativo: dec(an.horas) },
      { bloco: "Atividades", indicador: "Pessoas diferentes que participaram", valor: a.pessoas_unicas, comparativo: an.pessoas_unicas },
      { bloco: "Atividades", indicador: "Participações (presenças)", valor: a.participacoes, comparativo: an.participacoes },
      { bloco: "Atividades", indicador: "Pessoas em atividades sem lista nominal", valor: a.pessoas_sem_lista, comparativo: an.pessoas_sem_lista },
      { bloco: "Atividades", indicador: "Concluídas sem evidência", valor: a.concluidas_sem_evidencia, comparativo: an.concluidas_sem_evidencia },
      { bloco: "Planos de ação", indicador: "Criados no mês", valor: pl.criados, comparativo: "" },
      { bloco: "Planos de ação", indicador: "Concluídos no mês", valor: pl.concluidos, comparativo: "" },
      { bloco: "Planos de ação", indicador: "Em aberto hoje", valor: pl.abertos, comparativo: "" },
      { bloco: "Planos de ação", indicador: "Atrasados hoje", valor: pl.atrasados, comparativo: "" },
      { bloco: "Fale Comigo", indicador: "Demandas recebidas no mês", valor: fc.recebidas, comparativo: "" },
      { bloco: "Fale Comigo", indicador: "Respondidas", valor: fc.respondidas, comparativo: "" },
      { bloco: "Fale Comigo", indicador: "Em aberto hoje", valor: fc.em_aberto, comparativo: "" },
      { bloco: "Fale Comigo", indicador: "Atrasadas hoje", valor: fc.atrasadas, comparativo: "" },
      { bloco: "Fale Comigo", indicador: "Tempo médio de resposta (dias úteis)", valor: dec(fc.tempo_medio_dias_uteis), comparativo: "" },
      { bloco: "Fale Comigo", indicador: "Respondidas dentro do prazo", valor: pct(fc.pct_no_prazo), comparativo: "" },
      { bloco: "Acolhimentos", indicador: "Atendimentos no mês", valor: ac.insuficiente ? `Menos de ${B.MINIMO_CELULA} (não divulgado)` : ac.total, comparativo: "" },
    ];
    xl.adicionarTabela(wb, {
      nomeAba: "Resumo",
      colunas: [
        { titulo: "Bloco", chave: "bloco", largura: 18 }, { titulo: "Indicador", chave: "indicador", largura: 52 },
        { titulo: r.rotulo, chave: "valor", largura: 22 }, { titulo: `Mês anterior (${r.mes_anterior.rotulo})`, chave: "comparativo", largura: 26 },
      ],
      linhas: resumo,
    });
    const colAtv = [
      { titulo: "Nome", chave: "nome", largura: 44 }, { titulo: "Atividades", chave: "atividades", formato: "inteiro", largura: 14 },
      { titulo: "Horas", chave: "horas", formato: "decimal1", largura: 12 }, { titulo: "Pessoas", chave: "pessoas", formato: "inteiro", largura: 12 },
    ];
    xl.adicionarTabela(wb, { nomeAba: "Por programa", colunas: colAtv, linhas: r.por_programa });
    xl.adicionarTabela(wb, { nomeAba: "Por tipo", colunas: colAtv.slice(0, 3), linhas: r.por_tipo });
    xl.adicionarTabela(wb, { nomeAba: "Por unidade", colunas: colAtv, linhas: r.por_unidade });
    xl.adicionarTabela(wb, { nomeAba: "Por dimensão", colunas: colAtv, linhas: r.por_dimensao });
    if (!ac.insuficiente) {
      const linhasAc = [];
      for (const [titulo, g] of [["Unidade", ac.por_unidade], ["Programa", ac.por_programa], ["Motivo", ac.por_motivo], ["Canal", ac.por_canal], ["Encaminhamento", ac.por_encaminhamento]]) {
        if (!g) continue;
        if (g.oculto) { linhasAc.push({ grupo: titulo, nome: `Números pequenos demais para divulgar (menos de ${B.MINIMO_CELULA} por linha)`, n: "" }); continue; }
        for (const l of g.linhas) linhasAc.push({ grupo: titulo, nome: l.nome, n: l.n });
        if (g.demais) linhasAc.push({ grupo: titulo, nome: g.demais.nome, n: g.demais.n });
      }
      xl.adicionarTabela(wb, {
        nomeAba: "Acolhimentos (agregado)",
        colunas: [{ titulo: "Quebra", chave: "grupo", largura: 18 }, { titulo: "Item", chave: "nome", largura: 60 }, { titulo: "Atendimentos", chave: "n", formato: "inteiro", largura: 14 }],
        linhas: linhasAc,
      });
    }
    if (r.pesquisa) {
      const rot = { baixo: "Baixo", moderado: "Moderado", alto: "Alto" };
      xl.adicionarTabela(wb, {
        nomeAba: "Pesquisa de riscos",
        colunas: [{ titulo: "Dimensão", chave: "nome", largura: 52 }, { titulo: "% de exposição", chave: "pct", formato: "decimal1", largura: 16 }, { titulo: "Classificação", chave: "classificacao", largura: 16 }],
        linhas: r.pesquisa.dimensoes.map((d) => ({ ...d, classificacao: rot[d.classificacao] || "—" })),
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="nucleo_relatorio_mensal_${r.mes}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (e) {
    console.error("[nusp.relatorio.exportar]", e);
    return B.erro(res, 500, "Erro ao gerar a planilha do relatório mensal");
  }
}

module.exports = { relatorio, exportar, intervaloDoMes };
