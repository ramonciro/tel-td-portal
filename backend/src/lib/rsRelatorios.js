/**
 * rsRelatorios.js — cálculo único dos relatórios do módulo R&S (20/10/2026).
 *
 * Antes, Dashboard, Relatório Mensal e Excel tinham cada um a sua própria
 * consulta (e só mostravam volume). Agora os três usam as mesmas funções daqui,
 * então tela e planilha nunca divergem.
 *
 * Regras de negócio (decisões do Ramon, 20/10/2026):
 *  - RP CANCELADA continua contando como RP e aparece na distribuição de status,
 *    mas NÃO entra nos totais de HC'S (solicitados, com TO, aprovados, entregues).
 *  - Taxa de aprovação = aprovados ÷ solicitados; taxa de entrega = entregues ÷ solicitados
 *    (em %, com 1 casa; null quando não há HC'S solicitados).
 *  - Pendentes = vagas ainda por entregar das RPs EM ANDAMENTO (solicitados − entregues, nunca negativo).
 *  - Não atendidas = o mesmo cálculo para as RPs NÃO ENTREGUE.
 *  - Prazo (SLA): operacional = recebimento → final da avaliação técnica; estratégico =
 *    recebimento → fechamento da vaga. Só entram RPs que têm as duas datas.
 *  - "Em andamento": RPs EM ANDAMENTO de qualquer mês (não só do período), com os dias desde o
 *    recebimento; atrasada = dias acima do limite escolhido (padrão 15).
 *  - Período: um mês, ou um intervalo de até 36 meses (de/ate, AAAA-MM). Mês de referência da RP.
 *  - Comparativo: período imediatamente anterior, com a mesma quantidade de meses.
 *    Acumulado do ano: de janeiro do ano do último mês escolhido até esse mês.
 */
const db = require("./db");

const MES_RE = /^\d{4}-\d{2}$/;
const MAX_MESES = 36;
const LIMITE_DIAS_PADRAO = 15;

const num = (v) => (v === null || v === undefined ? 0 : Number(v) || 0);
const taxa = (parte, total) => (num(total) > 0 ? Math.round((num(parte) / num(total)) * 1000) / 10 : null);

function mesValido(m) {
  if (!MES_RE.test(String(m || ""))) return false;
  const mm = Number(String(m).slice(5, 7));
  return mm >= 1 && mm <= 12;
}

function somarMeses(mes, n) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function listarMeses(de, ate) {
  const out = [];
  for (let m = de; m <= ate; m = somarMeses(m, 1)) out.push(m);
  return out;
}

/** Lê mes OU de/ate da query. Devolve { periodo:{de,ate,meses} } ou { erro }. */
function lerPeriodo(q, { obrigatorio = true } = {}) {
  const { mes, de, ate } = q || {};
  if (mes) {
    if (!mesValido(mes)) return { erro: "Parâmetro mes inválido (use AAAA-MM)" };
    return { periodo: { de: mes, ate: mes, meses: 1 } };
  }
  if (de || ate) {
    if (!mesValido(de) || !mesValido(ate)) return { erro: "Período inválido: informe de e ate no formato AAAA-MM" };
    if (de > ate) return { erro: "O mês inicial não pode ser depois do mês final" };
    const meses = listarMeses(de, ate).length;
    if (meses > MAX_MESES) return { erro: `Período grande demais (máximo ${MAX_MESES} meses)` };
    return { periodo: { de, ate, meses } };
  }
  if (obrigatorio) return { erro: "Informe o período: mes (AAAA-MM) ou de e ate" };
  return { periodo: null };
}

function lerFiltros(q) {
  const site = String(q?.site || "").trim() || null;
  const s = String(q?.setor || "").trim().toUpperCase();
  const setor = s.includes("ESTRAT") ? "ESTRATÉGICO" : s.includes("OPER") ? "OPERACIONAL" : null;
  const limite = parseInt(q?.limite_dias, 10);
  const limite_dias = Number.isFinite(limite) && limite >= 1 && limite <= 365 ? limite : LIMITE_DIAS_PADRAO;
  return { site, setor, limite_dias };
}

/** WHERE comum. `periodo` pode ser null (sem filtro de mês). */
function montarWhere(empresa_id, periodo, { site, setor } = {}, alias = "") {
  const p = alias ? `${alias}.` : "";
  const conds = [`${p}empresa_id = ?`];
  const params = [empresa_id];
  if (periodo) {
    conds.push(`DATE_FORMAT(${p}mes_referencia, '%Y-%m') BETWEEN ? AND ?`);
    params.push(periodo.de, periodo.ate);
  }
  if (site) { conds.push(`${p}site = ?`); params.push(site); }
  if (setor === "OPERACIONAL") conds.push(`${p}setor = 'OPERACIONAL'`);
  if (setor === "ESTRATÉGICO") conds.push(`${p}setor LIKE 'ESTRAT%'`);
  return { where: conds.join(" AND "), params };
}

const SOMA_ATIVA = (col) => `COALESCE(SUM(CASE WHEN status <> 'CANCELADA' THEN ${col} ELSE 0 END),0)`;

const COLUNAS_SOMA = `
  COUNT(*) AS total_rps,
  ${SOMA_ATIVA("hcs")} AS hcs,
  ${SOMA_ATIVA("hcs_com_to")} AS hcs_com_to,
  ${SOMA_ATIVA("hcs_aprovados")} AS hcs_aprovados,
  ${SOMA_ATIVA("qtd_entregue")} AS qtd_entregue,
  COALESCE(SUM(CASE WHEN status = 'EM ANDAMENTO' THEN GREATEST(hcs - qtd_entregue, 0) ELSE 0 END),0) AS pendentes,
  COALESCE(SUM(CASE WHEN status LIKE 'N_O ENTREGUE' THEN GREATEST(hcs - qtd_entregue, 0) ELSE 0 END),0) AS nao_atendidas`;

function completarKpis(r) {
  const k = {
    total_rps: num(r.total_rps),
    hcs: num(r.hcs),
    hcs_com_to: num(r.hcs_com_to),
    hcs_aprovados: num(r.hcs_aprovados),
    qtd_entregue: num(r.qtd_entregue),
    pendentes: num(r.pendentes),
    nao_atendidas: num(r.nao_atendidas),
  };
  k.taxa_aprovacao = taxa(k.hcs_aprovados, k.hcs);
  k.taxa_entrega = taxa(k.qtd_entregue, k.hcs);
  return k;
}

async function kpis(empresa_id, periodo, filtros) {
  const { where, params } = montarWhere(empresa_id, periodo, filtros);
  const [[r]] = await db.query(`SELECT ${COLUNAS_SOMA} FROM rps WHERE ${where}`, params);
  return completarKpis(r || {});
}

async function porStatus(empresa_id, periodo, filtros) {
  const { where, params } = montarWhere(empresa_id, periodo, filtros);
  const [rows] = await db.query(`SELECT status, COUNT(*) AS total FROM rps WHERE ${where} GROUP BY status`, params);
  const ordem = ["ENTREGUE", "EM ANDAMENTO", "NÃO ENTREGUE", "CANCELADA"];
  const total = rows.reduce((s, r) => s + num(r.total), 0);
  return ordem
    .map((st) => {
      const r = rows.find((x) => String(x.status).normalize("NFC") === st);
      const t = r ? num(r.total) : 0;
      return { status: st, total: t, pct: total ? Math.round((t / total) * 100) : 0 };
    })
    .filter((s, _i, arr) => s.total > 0 || arr.every((x) => x.total === 0));
}

async function agrupado(empresa_id, periodo, filtros, { coluna, extraWhere = "", orderBy = "hcs DESC", limit = null, rotulo = null }) {
  const { where, params } = montarWhere(empresa_id, periodo, filtros);
  const sel = rotulo || coluna;
  const [rows] = await db.query(
    `SELECT ${sel} AS rotulo, ${COLUNAS_SOMA} FROM rps WHERE ${where} ${extraWhere} GROUP BY ${coluna === "cargo" ? "rotulo" : coluna} ORDER BY ${orderBy} ${limit ? `LIMIT ${Number(limit)}` : ""}`,
    params
  );
  return rows.map((r) => ({ rotulo: r.rotulo, ...completarKpis(r) }));
}

async function porMes(empresa_id, periodo, filtros) {
  const { where, params } = montarWhere(empresa_id, periodo, filtros);
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(mes_referencia, '%Y-%m') AS mes, ${COLUNAS_SOMA} FROM rps WHERE ${where} GROUP BY mes ORDER BY mes`,
    params
  );
  const mapa = new Map(rows.map((r) => [r.mes, completarKpis(r)]));
  return listarMeses(periodo.de, periodo.ate).map((m) => ({ mes: m, ...(mapa.get(m) || completarKpis({})) }));
}

async function sla(empresa_id, periodo, filtros) {
  const { where, params } = montarWhere(empresa_id, periodo, filtros);
  const [[r]] = await db.query(
    `SELECT
       AVG(CASE WHEN setor = 'OPERACIONAL' AND final_av_tecnica >= data_recebimento THEN DATEDIFF(final_av_tecnica, data_recebimento) END) AS op_dias,
       COUNT(CASE WHEN setor = 'OPERACIONAL' AND final_av_tecnica >= data_recebimento THEN 1 END) AS op_n,
       AVG(CASE WHEN setor = 'OPERACIONAL' AND inicio_av_tecnica >= data_recebimento THEN DATEDIFF(inicio_av_tecnica, data_recebimento) END) AS op_inicio,
       AVG(CASE WHEN setor LIKE 'ESTRAT%' AND data_fechamento_vaga >= data_recebimento THEN DATEDIFF(data_fechamento_vaga, data_recebimento) END) AS es_dias,
       COUNT(CASE WHEN setor LIKE 'ESTRAT%' AND data_fechamento_vaga >= data_recebimento THEN 1 END) AS es_n
     FROM rps WHERE ${where} AND status <> 'CANCELADA'`,
    params
  );
  const d1 = (v) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);
  return {
    operacional: { dias_medio: d1(r?.op_dias), ate_inicio: d1(r?.op_inicio), n: num(r?.op_n) },
    estrategico: { dias_medio: d1(r?.es_dias), n: num(r?.es_n) },
  };
}

/** RPs EM ANDAMENTO de qualquer mês (site/setor filtram; o mês não). */
async function emAberto(empresa_id, filtros, limite_dias) {
  const { where, params } = montarWhere(empresa_id, null, filtros);
  const [rows] = await db.query(
    `SELECT id, site, setor, produto, cargo, chamado, data_recebimento,
            DATE_FORMAT(mes_referencia, '%Y-%m') AS mes, hcs, hcs_aprovados, qtd_entregue,
            DATEDIFF(CURDATE(), COALESCE(data_recebimento, mes_referencia)) AS dias
       FROM rps WHERE ${where} AND status = 'EM ANDAMENTO'
      ORDER BY dias DESC, id LIMIT 500`,
    params
  );
  const itens = rows.map((r) => ({
    ...r,
    dias: Math.max(num(r.dias), 0),
    atrasada: num(r.dias) > limite_dias,
    pendentes: Math.max(num(r.hcs) - num(r.qtd_entregue), 0),
  }));
  return {
    total: itens.length,
    atrasadas: itens.filter((i) => i.atrasada).length,
    limite_dias,
    itens: itens.slice(0, 30),
    todos: itens,
  };
}

const vazio = () => completarKpis({});

const VOLUMES = ["total_rps", "hcs", "hcs_aprovados", "qtd_entregue", "pendentes"];
function comparar(atual, anterior) {
  const v = {};
  for (const c of VOLUMES) {
    v[c] = num(anterior[c]) > 0 ? Math.round(((num(atual[c]) - num(anterior[c])) / num(anterior[c])) * 1000) / 10 : null;
  }
  // taxas: diferença em pontos percentuais
  for (const c of ["taxa_aprovacao", "taxa_entrega"]) {
    v[c] = atual[c] !== null && anterior[c] !== null ? Math.round((atual[c] - anterior[c]) * 10) / 10 : null;
  }
  return v;
}

function periodoAnterior(periodo) {
  return {
    de: somarMeses(periodo.de, -periodo.meses),
    ate: somarMeses(periodo.de, -1),
    meses: periodo.meses,
  };
}

/** Pacote completo usado por Dashboard, Relatório e Excel. */
async function montarRelatorio(empresa_id, periodo, filtros) {
  const anteriorP = periodoAnterior(periodo);
  const anoP = { de: `${periodo.ate.slice(0, 4)}-01`, ate: periodo.ate };
  const [k, ant, acum, status, site, produto, cargo, mes, prazo, aberto] = await Promise.all([
    kpis(empresa_id, periodo, filtros),
    kpis(empresa_id, anteriorP, filtros),
    kpis(empresa_id, anoP, filtros),
    porStatus(empresa_id, periodo, filtros),
    agrupado(empresa_id, periodo, filtros, { coluna: "site", orderBy: "hcs DESC, total_rps DESC" }),
    agrupado(empresa_id, periodo, filtros, { coluna: "produto", extraWhere: "AND setor = 'OPERACIONAL'", orderBy: "hcs DESC" }),
    agrupado(empresa_id, periodo, filtros, {
      coluna: "cargo", extraWhere: "AND setor LIKE 'ESTRAT%'", orderBy: "hcs DESC",
      rotulo: "COALESCE(NULLIF(cargo,''),'(sem cargo)')",
    }),
    porMes(empresa_id, periodo, filtros),
    sla(empresa_id, periodo, filtros),
    emAberto(empresa_id, filtros, filtros.limite_dias),
  ]);
  return {
    periodo, filtros: { site: filtros.site, setor: filtros.setor, limite_dias: filtros.limite_dias },
    kpis: k, anterior: { periodo: anteriorP, kpis: ant }, variacao: comparar(k, ant),
    acumulado_ano: { periodo: anoP, kpis: acum },
    por_status: status, por_site: site, por_produto: produto, por_cargo: cargo, por_mes: mes,
    sla: prazo, em_aberto: aberto,
  };
}

/** Últimos `n` meses terminando em `ate` (preenchendo com zero), para a tendência do Dashboard. */
async function tendencia(empresa_id, ate, filtros, n = 6) {
  const periodo = { de: somarMeses(ate, -(n - 1)), ate, meses: n };
  return porMes(empresa_id, periodo, filtros);
}

module.exports = {
  lerPeriodo, lerFiltros, montarWhere, kpis, porStatus, agrupado, porMes, sla, emAberto,
  montarRelatorio, tendencia, comparar, periodoAnterior, somarMeses, listarMeses, taxa, num,
  LIMITE_DIAS_PADRAO, vazio,
};
