/**
 * progressoJornadasService.js — progresso dos participantes das jornadas de
 * desenvolvimento (04/11/2026).
 *
 * Resumo por jornada para o Dashboard e para o Mapa de Desenvolvimento:
 * quantos participantes, em que etapa da jornada estão, quantos estão abaixo
 * da presença mínima, quantos já atingiram a meta de horas, reciclagens
 * vencidas. Reaproveita a MESMA conta da grade de presença
 * (jornadaPresencaController._montarGrade) — nenhum número novo é inventado,
 * então Dashboard, Mapa e Radar nunca divergem.
 *
 * Só números agregados: nome de participante não sai daqui (isso fica na
 * grade da Metodologia).
 */
const pool = require("../lib/db");

const STATUS_PARTICIPANTE = ["nao_iniciado", "em_percurso", "concluido", "em_sustentacao"];

function farolDaJornada(r) {
  if (!r.participantes) return "cinza";
  if (r.abaixo_do_minimo > 0 || (r.reciclagem_vencida || 0) > 0) return "vermelho";
  if (r.sem_lancamento > 0) return "amarelo";
  return "verde";
}

async function calcularProgressoJornadas({ empresaId } = {}) {
  const where = ["LOWER(COALESCE(status,'')) <> 'cancelada'"];
  const params = [];
  if (empresaId) {
    where.push("empresa_id = ?");
    params.push(empresaId);
  }

  let jornadas = [];
  try {
    [jornadas] = await pool.query(
      `SELECT id, nome, cliente, status, empresa_id, presenca_minima_pct, meta_horas, periodicidade_meses
         FROM jornadas_desenvolvimento WHERE ${where.join(" AND ")} ORDER BY cliente, nome, id`,
      params
    );
  } catch (e) {
    console.error("[progresso-jornadas] jornadas:", e.message || e);
    return { jornadas: [], totais: vazioTotais() };
  }
  if (!jornadas.length) return { jornadas: [], totais: vazioTotais() };

  // Distribuição por etapa da jornada (status_jornada de cada participante).
  const ids = jornadas.map((j) => j.id);
  const porStatus = new Map();
  try {
    const [rows] = await pool.query(
      `SELECT jornada_id, LOWER(TRIM(status_jornada)) AS status, COUNT(*) AS total
         FROM jornada_participantes WHERE jornada_id IN (${ids.map(() => "?").join(",")})
        GROUP BY jornada_id, LOWER(TRIM(status_jornada))`,
      ids
    );
    for (const r of rows) {
      const m = porStatus.get(r.jornada_id) || {};
      m[r.status] = Number(r.total);
      porStatus.set(r.jornada_id, m);
    }
  } catch (e) {
    console.error("[progresso-jornadas] status:", e.message || e);
  }

  const { _montarGrade } = require("../controllers/jornadaPresencaController");
  const saida = [];
  for (const j of jornadas) {
    let resumo = {};
    let horasTotal = 0;
    let comHoras = 0;
    try {
      const grade = await _montarGrade(j);
      resumo = grade.resumo || {};
      for (const p of grade.participantes || []) {
        horasTotal += Number(p.totais?.horas || 0);
        comHoras += 1;
      }
    } catch (e) {
      console.error(`[progresso-jornadas] grade da jornada ${j.id}:`, e.message || e);
    }

    const dist = porStatus.get(j.id) || {};
    const etapas = {};
    for (const s of STATUS_PARTICIPANTE) etapas[s] = Number(dist[s] || 0);

    const linha = {
      id: j.id,
      nome: j.nome,
      cliente: j.cliente || null,
      status: j.status || null,
      participantes: Number(resumo.participantes || 0),
      etapas,
      encontros: Number(resumo.encontros || 0),
      encontros_realizados: Number(resumo.encontros_realizados || 0),
      pct_presenca_medio: resumo.pct_medio ?? null,
      presenca_minima_pct: Number(j.presenca_minima_pct ?? 75),
      abaixo_do_minimo: Number(resumo.abaixo_do_minimo || 0),
      sem_lancamento: Number(resumo.sem_lancamento || 0),
      meta_horas: j.meta_horas === null || j.meta_horas === undefined ? null : Number(j.meta_horas),
      atingiram_meta: resumo.atingiram_meta ?? null,
      horas_medias: comHoras ? Math.round((horasTotal / comHoras) * 10) / 10 : null,
      reciclagem_vencida: resumo.reciclagem_vencida ?? null,
    };
    linha.farol = farolDaJornada(linha);
    saida.push(linha);
  }

  const totais = vazioTotais();
  for (const l of saida) {
    totais.jornadas += 1;
    totais.participantes += l.participantes;
    totais.abaixo_do_minimo += l.abaixo_do_minimo;
    totais.sem_lancamento += l.sem_lancamento;
    totais.reciclagem_vencida += l.reciclagem_vencida || 0;
    if (l.atingiram_meta !== null) totais.atingiram_meta += l.atingiram_meta;
    for (const s of STATUS_PARTICIPANTE) totais.etapas[s] += l.etapas[s];
    if (l.farol === "vermelho") totais.jornadas_em_alerta += 1;
  }
  return { jornadas: saida, totais };
}

function vazioTotais() {
  return {
    jornadas: 0,
    jornadas_em_alerta: 0,
    participantes: 0,
    abaixo_do_minimo: 0,
    sem_lancamento: 0,
    atingiram_meta: 0,
    reciclagem_vencida: 0,
    etapas: { nao_iniciado: 0, em_percurso: 0, concluido: 0, em_sustentacao: 0 },
  };
}

module.exports = { calcularProgressoJornadas };
