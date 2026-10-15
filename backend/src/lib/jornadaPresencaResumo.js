/**
 * jornadaPresencaResumo.js — resumo de encontros e presença POR JORNADA, para
 * alimentar o Mapa de Desenvolvimento (cards das jornadas) e os KPIs da
 * Metodologia (16/10/2026, pedido do Ramon: "as jornadas não estão refletindo
 * no dashboard de metodologia").
 *
 * Até aqui os cards e os KPIs só liam Ações, Coaching e Etapas com prazo; os
 * Encontros e a presença (Fase 1, 13/10/2026) ficavam de fora, então uma
 * jornada com 10 participantes e chamadas lançadas aparecia com 0 horas e 0%.
 *
 * As regras de cálculo NÃO são reescritas aqui: reaproveita totaisDaPessoa do
 * jornadaPresencaController (justificado não soma horas e fica fora do %,
 * % = presentes ÷ (presentes + ausentes), farol contra o mínimo da jornada,
 * horas = soma da carga dos encontros em que esteve presente).
 *
 * Isolamento: tudo parte de jornadas_desenvolvimento.empresa_id (a tabela de
 * encontros/participantes é alcançada pela jornada, nunca pelo empresa_id
 * delas, que historicamente nem sempre foi gravado).
 */
const db = require("./db");
const { _totaisDaPessoa: totaisDaPessoa } = require("../controllers/jornadaPresencaController");

function hojeBahia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
}

function arredondar(v, casas = 1) {
  const f = 10 ** casas;
  return Math.round(Number(v) * f) / f;
}

function statusCancelado(valor) {
  return ["cancelada", "cancelado"].includes(String(valor || "").trim().toLowerCase());
}

/**
 * @param {number|null} empresaId  ambiente (null = sem filtro, só super_admin)
 * @returns {Promise<Array>} um item por jornada (inclui jornadas sem encontros)
 */
async function resumoPorJornada(empresaId) {
  const hoje = hojeBahia();
  const tenant = empresaId ? "WHERE jd.empresa_id = ?" : "";
  const params = empresaId ? [empresaId] : [];

  const [jornadas] = await db.query(
    `SELECT jd.id, jd.nome, jd.cliente, jd.status, jd.presenca_minima_pct, jd.meta_horas, jd.periodicidade_meses
     FROM jornadas_desenvolvimento jd ${tenant}
     ORDER BY jd.cliente ASC, jd.nome ASC, jd.id ASC`,
    params
  );
  if (!jornadas.length) return [];

  const [encontros] = await db.query(
    `SELECT e.id, e.jornada_id, e.titulo, DATE_FORMAT(e.data, '%Y-%m-%d') AS data, e.carga_horaria
     FROM jornada_encontros e
     JOIN jornadas_desenvolvimento jd ON jd.id = e.jornada_id
     ${tenant}
     ORDER BY e.data ASC, e.hora_inicio ASC, e.id ASC`,
    params
  );
  const [participantes] = await db.query(
    `SELECT jp.id, jp.jornada_id
     FROM jornada_participantes jp
     JOIN jornadas_desenvolvimento jd ON jd.id = jp.jornada_id
     ${tenant}`,
    params
  );
  const [presencas] = await db.query(
    `SELECT p.encontro_id, p.participante_id, p.situacao
     FROM jornada_presencas p
     JOIN jornada_encontros e ON e.id = p.encontro_id
     JOIN jornadas_desenvolvimento jd ON jd.id = e.jornada_id
     ${tenant}`,
    params
  );

  const encontrosPorJornada = new Map();
  for (const e of encontros) {
    if (!encontrosPorJornada.has(e.jornada_id)) encontrosPorJornada.set(e.jornada_id, []);
    encontrosPorJornada.get(e.jornada_id).push({ ...e, carga_horaria: Number(e.carga_horaria) });
  }
  const participantesPorJornada = new Map();
  for (const p of participantes) {
    if (!participantesPorJornada.has(p.jornada_id)) participantesPorJornada.set(p.jornada_id, []);
    participantesPorJornada.get(p.jornada_id).push(p.id);
  }
  const situacaoPorParticipante = new Map(); // participante_id → Map(encontro_id → situacao)
  const encontrosComChamada = new Set();
  for (const p of presencas) {
    if (!situacaoPorParticipante.has(p.participante_id)) situacaoPorParticipante.set(p.participante_id, new Map());
    situacaoPorParticipante.get(p.participante_id).set(p.encontro_id, p.situacao);
    encontrosComChamada.add(p.encontro_id);
  }

  return jornadas.map((j) => {
    const lista = encontrosPorJornada.get(j.id) || [];
    const ids = participantesPorJornada.get(j.id) || [];
    const config = {
      presenca_minima_pct: Number(j.presenca_minima_pct ?? 75),
      meta_horas: j.meta_horas === null || j.meta_horas === undefined ? null : Number(j.meta_horas),
      periodicidade_meses: j.periodicidade_meses === null || j.periodicidade_meses === undefined ? null : Number(j.periodicidade_meses),
    };

    let presentes = 0;
    let ausentes = 0;
    let justificados = 0;
    let horas = 0;
    let abaixoDoMinimo = 0;
    let atingiramMeta = 0;
    let somaMetaPct = 0;
    for (const id of ids) {
      const t = totaisDaPessoa(lista, situacaoPorParticipante.get(id) || new Map(), config, hoje);
      presentes += t.presentes;
      ausentes += t.ausentes;
      justificados += t.justificados;
      horas += t.horas || 0;
      if (t.farol === "vermelho") abaixoDoMinimo += 1;
      if (config.meta_horas) {
        if (t.atingiu_meta) atingiramMeta += 1;
        somaMetaPct += Math.min(100, t.meta_pct || 0);
      }
    }

    const realizados = lista.filter((e) => e.data <= hoje);
    const comChamada = realizados.filter((e) => encontrosComChamada.has(e.id)).length;
    const base = presentes + ausentes;
    const pct = base > 0 ? (presentes / base) * 100 : null;
    let farol = "cinza";
    if (pct !== null) farol = pct >= config.presenca_minima_pct ? "verde" : "vermelho";
    const proximo = lista.find((e) => e.data > hoje) || null;

    return {
      jornada_id: j.id,
      nome: j.nome,
      cliente: j.cliente || "",
      status: j.status,
      participantes: ids.length,
      encontros_total: lista.length,
      encontros_realizados: realizados.length,
      encontros_com_chamada: comChamada,
      chamadas_pendentes: realizados.length - comChamada,
      horas_presenca: arredondar(horas, 2),
      presentes,
      ausentes,
      justificados,
      pct_presenca: pct === null ? null : arredondar(pct, 1),
      presenca_minima_pct: config.presenca_minima_pct,
      farol,
      abaixo_do_minimo: abaixoDoMinimo,
      meta_horas: config.meta_horas,
      atingiram_meta: config.meta_horas ? atingiramMeta : null,
      abaixo_da_meta: config.meta_horas ? ids.length - atingiramMeta : null,
      // progresso pela meta de horas: média, entre os participantes, de
      // (horas ÷ meta) limitada a 100% — só existe quando há meta e gente.
      progresso_meta_pct: config.meta_horas && ids.length ? Math.round(somaMetaPct / ids.length) : null,
      proximo_encontro: proximo ? { titulo: proximo.titulo, data: proximo.data } : null,
      cancelada: statusCancelado(j.status),
    };
  });
}

module.exports = { resumoPorJornada };
