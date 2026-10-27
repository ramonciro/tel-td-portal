/**
 * preventivoQualidadeService.js — Radar preventivo, Pacote 4 (27/10/2026)
 *
 * 1) TENDÊNCIA DE QUALIDADE: olha NPS e presença das turmas já realizadas e avisa quando um
 *    instrutor, um tema ou um cliente vem PIORANDO turma após turma, antes de a média cair.
 *    Regra simples e explicável (nada de modelo estatístico):
 *      - série = turmas encerradas dos últimos 240 dias, da mais antiga para a mais nova;
 *      - NPS da turma só conta com pelo menos 3 respostas; presença só com pelo menos 3 pessoas
 *        com chamada lançada (presentes + ausentes);
 *      - "em queda" = nas 3 últimas turmas o valor caiu a cada turma (estritamente) e a queda
 *        total passou do limite (NPS: 15 pontos; presença: 8 pontos percentuais);
 *      - gravidade alta quando a queda é grande (NPS 30 pontos / presença 15 pp) ou quando o
 *        último valor já está abaixo do piso (NPS abaixo de 0 / presença abaixo de 75%);
 *        senão, atenção (media).
 *    Os grupos são sempre DENTRO de um cliente (instrutor no cliente, tema no cliente, o cliente),
 *    o que mantém o acesso por cliente correto e deixa a ação concreta.
 *    Comentários de detratores (nota 0 a 6) das 3 últimas turmas vêm junto, para a conversa com
 *    o instrutor partir do que as pessoas disseram.
 *    O prazo do alerta é a próxima turma do mesmo grupo nos próximos 30 dias (se houver).
 *
 * 2) VENCIMENTOS (sem depender da meta de horas por jornada):
 *      - necessidade de treinamento com prazo nos próximos 14 dias (ou vencida há até 30 dias) que
 *        ainda não tem turmas suficientes;
 *      - reciclagem de jornada (periodicidade em meses) vencida ou que vence em 30 dias.
 *
 * Só leitura, sem lançamento novo e sem IA externa.
 */
const pool = require("../lib/db");
const P = require("./preventivoService");
const { turmasPorInstrutorSql } = require("../lib/instrutoresTurma");
const { getResumoPresenca } = require("./presencaResolver");

const { hojeBahia, somarDias, diasEntre } = P;

const JANELA_DIAS = 240;
const N_SERIE = 3;
const MIN_RESP_NPS = 3;
const MIN_PESSOAS_PRES = 3;
const LIMITES = {
  nps: { queda: 15, queda_alta: 30, piso: 0, unidade: "pontos", rotulo: "NPS" },
  presenca: { queda: 8, queda_alta: 15, piso: 75, unidade: "pp", rotulo: "Presença" },
};
const DIM_ROTULO = { instrutor: "Instrutor", tema: "Tema", cliente: "Cliente" };

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const corta = (s, n) => (String(s || "").length > n ? String(s).slice(0, n - 1) + "…" : String(s || ""));
const fmt = (d) => { if (!d) return ""; const [a, m, dia] = String(d).slice(0, 10).split("-"); return `${dia}/${m}/${a.slice(2)}`; };
const dataStr = (v) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);
const classe = (nota) => (Number(nota) >= 9 ? "promotor" : Number(nota) >= 7 ? "neutro" : "detrator");

/* ───────────────────────── 1) Tendência de qualidade ───────────────────────── */

/** Avalia uma série (já em ordem cronológica). Devolve null se não houver 3 pontos. */
function avaliarSerie(valores, metrica) {
  const L = LIMITES[metrica];
  if (valores.length < N_SERIE) return null;
  const ult = valores.slice(-N_SERIE);
  const queda = ult[0] - ult[N_SERIE - 1];
  const caindo = ult.every((v, i) => i === 0 || v < ult[i - 1]);
  const subindo = ult.every((v, i) => i === 0 || v > ult[i - 1]);
  const ultimo = ult[N_SERIE - 1];
  if (caindo && queda >= L.queda) {
    const alta = queda >= L.queda_alta || ultimo < L.piso;
    return { status: "em_queda", variacao: -queda, gravidade: alta ? "alta" : "media" };
  }
  if (subindo && -queda >= L.queda) return { status: "melhorando", variacao: -queda, gravidade: null };
  return { status: "estavel", variacao: -queda, gravidade: null };
}

async function carregarTurmasEncerradas(empresaId, hoje) {
  const view = await turmasPorInstrutorSql();
  const ini = somarDias(hoje, -JANELA_DIAS);
  const where = [
    "COALESCE(DATE(t.data_fim), DATE(t.data_inicio), t.data) BETWEEN ? AND ?",
    "(t.status IS NULL OR LOWER(TRIM(t.status)) NOT LIKE '%cancel%')",
  ];
  const params = [ini, hoje];
  if (empresaId) { where.push("t.empresa_id = ?"); params.push(empresaId); }
  const [rows] = await pool.query(
    `SELECT t.id, t.empresa_id, t.tema, t.cliente, t.supervisor, t.instrutor_ref,
            DATE_FORMAT(COALESCE(DATE(t.data_fim), DATE(t.data_inicio), t.data), '%Y-%m-%d') AS fim
       FROM ${view} t WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(DATE(t.data_fim), DATE(t.data_inicio), t.data), t.id`,
    params
  );
  return rows;
}

async function carregarProximas(empresaId, hoje) {
  const view = await turmasPorInstrutorSql();
  const where = [
    "COALESCE(DATE(t.data_inicio), t.data) BETWEEN ? AND ?",
    "(t.status IS NULL OR (LOWER(TRIM(t.status)) NOT LIKE '%cancel%' AND LOWER(TRIM(t.status)) NOT LIKE 'conclu%'))",
  ];
  const params = [hoje, somarDias(hoje, 30)];
  if (empresaId) { where.push("t.empresa_id = ?"); params.push(empresaId); }
  const [rows] = await pool.query(
    `SELECT t.cliente, t.tema, t.instrutor_ref, DATE_FORMAT(COALESCE(DATE(t.data_inicio), t.data), '%Y-%m-%d') AS inicio
       FROM ${view} t WHERE ${where.join(" AND ")}`,
    params
  );
  return rows;
}

async function carregarNps(ids) {
  const mapa = new Map();
  if (!ids.length) return mapa;
  const [rows] = await pool.query(
    `SELECT treinamento_id, nota_nps, comentario FROM avaliacoes_treinandos
      WHERE nota_nps IS NOT NULL AND treinamento_id IN (${ids.map(() => "?").join(",")})`,
    ids
  );
  for (const r of rows) {
    const k = Number(r.treinamento_id);
    if (!mapa.has(k)) mapa.set(k, { n: 0, prom: 0, detr: 0, comentarios: [] });
    const a = mapa.get(k);
    const c = classe(r.nota_nps);
    a.n += 1;
    if (c === "promotor") a.prom += 1;
    if (c === "detrator") {
      a.detr += 1;
      const txt = String(r.comentario || "").trim();
      if (txt.length >= 8) a.comentarios.push({ texto: txt, nota: Number(r.nota_nps) });
    }
  }
  return mapa;
}

/**
 * Calcula todas as séries e os alertas. Devolve:
 *  { hoje, grupos[], itens[], resumo }
 * `grupos` traz toda série com 3+ turmas (inclusive estável/melhorando) para a aba Qualidade.
 * `itens` são só os alertas (em queda), agrupados por (dimensão, cliente, nome) — um item por grupo,
 * com NPS e presença juntos quando os dois caem.
 */
async function calcularTendencias({ empresaId } = {}) {
  const hoje = hojeBahia();
  const turmas = await carregarTurmasEncerradas(empresaId, hoje);
  const unicas = new Map();
  for (const t of turmas) if (!unicas.has(t.id)) unicas.set(t.id, t);
  const ids = [...unicas.keys()];
  const [npsMapa, resumoPres, proximas] = await Promise.all([
    carregarNps(ids),
    getResumoPresenca({ empresaId }).catch((e) => { console.error("[qualidade] presença:", e.message || e); return []; }),
    carregarProximas(empresaId, hoje),
  ]);
  const presMapa = new Map();
  for (const p of resumoPres) {
    const base = Number(p.presentes_pessoas || 0) + Number(p.ausentes_pessoas || 0);
    if (base >= MIN_PESSOAS_PRES) presMapa.set(Number(p.id), Number(p.taxa_presenca_pessoas));
  }

  // Valor de cada turma por métrica.
  const valorDe = (t, metrica) => {
    if (metrica === "nps") {
      const a = npsMapa.get(Number(t.id));
      if (!a || a.n < MIN_RESP_NPS) return null;
      return Math.round(((a.prom - a.detr) / a.n) * 100);
    }
    const v = presMapa.get(Number(t.id));
    return v === undefined ? null : v;
  };

  const chaveGrupo = (dim, t) => {
    if (dim === "instrutor") return t.instrutor_ref ? `${semAcento(t.instrutor_ref)}|${semAcento(t.cliente)}` : null;
    if (dim === "tema") return t.tema ? `${semAcento(t.tema)}|${semAcento(t.cliente)}` : null;
    return t.cliente ? semAcento(t.cliente) : null;
  };
  const nomeGrupo = (dim, t) => (dim === "instrutor" ? t.instrutor_ref : dim === "tema" ? t.tema : t.cliente);

  // Próxima turma por grupo (primeira data).
  const proxima = (dim, t) => {
    const k = chaveGrupo(dim, t);
    let melhor = null;
    for (const p of proximas) {
      const pk = chaveGrupo(dim, { ...p, instrutor_ref: p.instrutor_ref });
      if (pk === k && (!melhor || p.inicio < melhor)) melhor = p.inicio;
    }
    return melhor;
  };

  let grupos = [];
  for (const dim of ["instrutor", "tema", "cliente"]) {
    const base = dim === "instrutor" ? turmas : [...unicas.values()];
    const porGrupo = new Map();
    for (const t of base) {
      const k = chaveGrupo(dim, t);
      if (!k) continue;
      if (!porGrupo.has(k)) porGrupo.set(k, { amostra: t, turmas: [] });
      const g = porGrupo.get(k);
      if (!g.turmas.some((x) => x.id === t.id)) g.turmas.push(t);
    }
    for (const g of porGrupo.values()) {
      for (const metrica of ["nps", "presenca"]) {
        const serie = g.turmas
          .map((t) => ({ t, valor: valorDe(t, metrica) }))
          .filter((x) => x.valor !== null)
          .sort((a, b) => a.t.fim.localeCompare(b.t.fim) || a.t.id - b.t.id);
        const ava = avaliarSerie(serie.map((x) => x.valor), metrica);
        if (!ava) continue;
        const ult = serie.slice(-N_SERIE);
        const comentarios = [];
        if (metrica === "nps" && ava.status === "em_queda") {
          // até 3 comentários distintos, um por turma por rodada (da mais recente para a mais antiga)
          const filas = [...ult].reverse().map((x) => {
            const vistos = new Set();
            return (npsMapa.get(Number(x.t.id))?.comentarios || [])
              .filter((c) => { const k = semAcento(c.texto); if (vistos.has(k)) return false; vistos.add(k); return true; })
              .map((c) => ({ texto: corta(c.texto, 160), nota: c.nota, turma: x.t.tema, fim: x.t.fim }));
          });
          for (let rodada = 0; comentarios.length < 3 && rodada < 3; rodada++) {
            for (const fila of filas) if (fila[rodada] && comentarios.length < 3) comentarios.push(fila[rodada]);
          }
        }
        grupos.push({
          dimensao: dim, dimensao_rotulo: DIM_ROTULO[dim], nome: nomeGrupo(dim, g.amostra), cliente: g.amostra.cliente || null,
          empresa_id: g.amostra.empresa_id, supervisor: g.amostra.supervisor || null, metrica, metrica_rotulo: LIMITES[metrica].rotulo,
          serie: serie.slice(-4).map((x) => ({ turma_id: x.t.id, tema: x.t.tema, fim: x.t.fim, valor: x.valor })),
          ultimas_ids: ult.map((x) => x.t.id), total_turmas: serie.length,
          status: ava.status, variacao: ava.variacao, gravidade: ava.gravidade, comentarios,
          proxima_turma: ava.status === "em_queda" ? proxima(dim, g.amostra) : null,
        });
      }
    }
  }

  // Alertas: um item por (dimensão, cliente, nome), juntando NPS e presença. A dimensão mais
  // específica vence: se instrutor e cliente/tema caem pelas MESMAS 3 turmas, só o instrutor aparece.
  const emQueda = grupos.filter((g) => g.status === "em_queda");
  const porItem = new Map();
  for (const g of emQueda) {
    const k = `${g.dimensao}|${semAcento(g.cliente)}|${semAcento(g.nome)}`;
    if (!porItem.has(k)) porItem.set(k, { dimensao: g.dimensao, nome: g.nome, cliente: g.cliente, empresa_id: g.empresa_id, supervisor: g.supervisor, metricas: [] });
    porItem.get(k).metricas.push(g);
  }
  const ordemDim = { instrutor: 0, tema: 1, cliente: 2 };
  const candidatos = [...porItem.values()].sort((a, b) => ordemDim[a.dimensao] - ordemDim[b.dimensao]);
  const chaveCobertura = (m) => `${m.metrica}|${semAcento(m.cliente)}|${[...m.ultimas_ids].sort((x, y) => x - y).join(",")}`;
  const coberto = new Set(); // turmas já explicadas por uma dimensão mais específica
  const itens = [];
  for (const dim of ["instrutor", "tema", "cliente"]) {
    const novos = [];
    for (const it of candidatos.filter((c) => c.dimensao === dim)) {
      const metricas = it.metricas.filter((m) => !coberto.has(chaveCobertura(m)));
      if (!metricas.length) continue;
      novos.push(...metricas.map(chaveCobertura));
      const grav = metricas.some((m) => m.gravidade === "alta") ? "alta" : "media";
      itens.push({ ...it, metricas, gravidade: grav, proxima_turma: metricas.map((m) => m.proxima_turma).filter(Boolean).sort()[0] || null });
    }
    novos.forEach((k) => coberto.add(k));
  }

  // Queda já explicada por uma dimensão mais específica (mesmas turmas) não se repete na lista.
  const incluidos = new Set(itens.flatMap((i) => i.metricas.map((m) => `${m.dimensao}|${semAcento(m.cliente)}|${semAcento(m.nome)}|${m.metrica}`)));
  grupos = grupos.filter((g) => g.status !== "em_queda" || incluidos.has(`${g.dimensao}|${semAcento(g.cliente)}|${semAcento(g.nome)}|${g.metrica}`));

  grupos.sort((a, b) => (a.status === "em_queda" ? 0 : a.status === "estavel" ? 1 : 2) - (b.status === "em_queda" ? 0 : b.status === "estavel" ? 1 : 2) || a.variacao - b.variacao);
  return {
    hoje, grupos, itens,
    resumo: {
      em_queda: itens.length,
      grupos_avaliados: new Set(grupos.map((g) => `${g.dimensao}|${semAcento(g.cliente)}|${semAcento(g.nome)}`)).size,
      melhorando: grupos.filter((g) => g.status === "melhorando").length,
      regra: { turmas_seguidas: N_SERIE, min_respostas_nps: MIN_RESP_NPS, min_pessoas_presenca: MIN_PESSOAS_PRES, queda_nps: LIMITES.nps.queda, queda_presenca: LIMITES.presenca.queda },
    },
  };
}

/* ───────────────────────── 2) Vencimentos ───────────────────────── */

/** Necessidades de treinamento que vencem (ou venceram há pouco) sem turmas suficientes. */
async function calcularNecessidadesVencendo({ empresaId } = {}) {
  const hoje = hojeBahia();
  const { listarNecessidades } = require("./necessidadesResolver");
  const todas = await listarNecessidades({ empresaId });
  const out = [];
  for (const nec of todas) {
    if (!["aberta", "em_atendimento", "atrasada"].includes(nec.status_calculado)) continue;
    const prazo = dataStr(nec.prazo);
    if (!prazo) continue;
    const dias = diasEntre(hoje, prazo);
    if (dias > 14 || dias < -30) continue;
    const faltam = Math.max(0, Number(nec.horas_necessarias || 0) - Number(nec.horas_atendidas || 0));
    const semTurma = Number(nec.turmas_vinculadas || 0) === 0;
    let nivel = dias <= 3 ? 3 : dias <= 7 ? 2 : 1; // dias < 0 cai em 3
    if (!semTurma) nivel -= 1;
    if (nivel < 1) nivel = 1;
    out.push({
      id: nec.id, empresa_id: nec.empresa_id ?? empresaId ?? null, cliente: nec.cliente, tema: nec.tema, prazo, dias_para_prazo: dias,
      horas_necessarias: Number(nec.horas_necessarias || 0), horas_atendidas: Number(nec.horas_atendidas || 0), horas_faltantes: faltam,
      turmas_vinculadas: Number(nec.turmas_vinculadas || 0), sem_turma: semTurma,
      solicitante: nec.solicitante_nome || null, prioridade: nec.prioridade || null,
      gravidade: nivel >= 3 ? "critica" : nivel === 2 ? "alta" : "media",
    });
  }
  return out.sort((a, b) => a.dias_para_prazo - b.dias_para_prazo || a.id - b.id);
}

/** Jornadas com reciclagem (periodicidade_meses) vencida ou vencendo em 30 dias. */
async function calcularReciclagens({ empresaId } = {}) {
  const hoje = hojeBahia();
  const where = ["periodicidade_meses IS NOT NULL", "periodicidade_meses > 0", "LOWER(COALESCE(status,'')) NOT IN ('cancelada','concluida')"];
  const params = [];
  if (empresaId) { where.push("empresa_id = ?"); params.push(empresaId); }
  let jornadas = [];
  try {
    [jornadas] = await pool.query(
      `SELECT id, nome, cliente, empresa_id, presenca_minima_pct, meta_horas, periodicidade_meses
         FROM jornadas_desenvolvimento WHERE ${where.join(" AND ")} ORDER BY id`,
      params
    );
  } catch (e) {
    console.error("[vencimentos] jornadas:", e.message || e);
    return [];
  }
  const { _montarGrade } = require("../controllers/jornadaPresencaController");
  const out = [];
  for (const j of jornadas) {
    const grade = await _montarGrade(j);
    let vencidas = 0, breve = 0, menor = null;
    for (const p of grade.participantes || []) {
      const r = p.totais?.reciclagem;
      if (!r) continue;
      if (r.status === "vencida") vencidas += 1;
      else if (r.status === "vence_em_breve") {
        breve += 1;
        if (menor === null || r.dias < menor) menor = r.dias;
      }
    }
    if (!vencidas && !breve) continue;
    const prazo = menor !== null ? somarDias(hoje, menor) : hoje;
    const gravidade = vencidas > 0 || (menor !== null && menor <= 7) ? "alta" : "media";
    out.push({
      jornada_id: j.id, nome: j.nome, cliente: j.cliente || null, empresa_id: j.empresa_id, periodicidade_meses: Number(j.periodicidade_meses),
      vencidas, vencem_em_breve: breve, prazo, gravidade, participantes: (grade.participantes || []).length,
    });
  }
  return out;
}

module.exports = { calcularTendencias, calcularNecessidadesVencendo, calcularReciclagens, avaliarSerie, LIMITES, N_SERIE };
