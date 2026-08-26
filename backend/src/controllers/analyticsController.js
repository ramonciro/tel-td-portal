/**
 * analyticsController.js — Sprint 5: Analytics & KPIs
 *
 * Motor de cálculo de todos os indicadores do Portal T&D.
 * Todas as queries são filtradas por empresa_id (req.empresaId).
 * super_admin (empresaId = null) recebe dados globais de todos os tenants.
 *
 * Endpoints:
 *   GET /api/analytics/resumo       → getResumo
 *   GET /api/analytics/horas        → getHoras
 *   GET /api/analytics/nps          → getNps
 *   GET /api/analytics/efetividade  → getEfetividade
 *   GET /api/analytics/roi          → getRoi
 */

const pool = require('../lib/db');

/* ─── helpers ──────────────────────────────────────────────────────────────── */

// Gera o WHERE clause de tenant dinamicamente
function tenantWhere(empresaId, alias = 't') {
  return empresaId ? `${alias}.empresa_id = ${pool.escape(empresaId)}` : '1=1';
}

// Status de turmas concluídas (variações encontradas no banco)
// LIKE evita problemas de charset/acento no MySQL do Railway
const STATUS_CONCLUIDO = "(LOWER(TRIM(status)) LIKE '%conclui%' OR LOWER(TRIM(status)) = 'encerrado')";
const STATUS_ANDAMENTO = "(LOWER(TRIM(status)) LIKE '%andamento%' OR LOWER(TRIM(status)) IN ('ativo','ativa'))";
const STATUS_PLANEJADO = "(LOWER(TRIM(status)) LIKE '%planej%' OR LOWER(TRIM(status)) = 'agendado')";

// Fallback seguro para SUM de inteiros
function asInt(v) { return Number(v || 0); }
function asDec(v) { return v != null ? Number(Number(v).toFixed(1)) : null; }

/* ─── GET /api/analytics/resumo ────────────────────────────────────────────── */
async function getResumo(req, res) {
  try {
    const eId  = req.empresaId ?? null;
    const tw   = tenantWhere(eId);

    // Turmas por status
    const [statusRows] = await pool.query(
      `SELECT status, COUNT(*) AS total FROM treinamentos WHERE ${tw} GROUP BY status`
    );

    const porStatus = {};
    let turmasTotal = 0;
    statusRows.forEach((r) => {
      porStatus[r.status] = asInt(r.total);
      turmasTotal += asInt(r.total);
    });

    // LIKE para evitar problemas de acento — conta linhas com status 'conclui*'
    const concluidas = statusRows
      .filter((r) => String(r.status || '').toLowerCase().trim().includes('conclui'))
      .reduce((s, r) => s + asInt(r.total), 0);

    // Horas treinadas (apenas turmas concluídas)
    const [[{ horas_total }]] = await pool.query(
      `SELECT COALESCE(SUM(carga_horaria), 0) AS horas_total
       FROM treinamentos WHERE ${tw} AND ${STATUS_CONCLUIDO}`
    );

    // Horas previstas (todas as turmas)
    const [[{ horas_previstas }]] = await pool.query(
      `SELECT COALESCE(SUM(carga_horaria), 0) AS horas_previstas
       FROM treinamentos WHERE ${tw}`
    );

    // Participantes únicos treinados
    let participantes_unicos = 0;
    try {
      const [[row]] = await pool.query(
        `SELECT COUNT(DISTINCT tp.nome) AS total
         FROM treinamento_participantes tp
         JOIN treinamentos t ON t.id = tp.treinamento_id
         WHERE ${tenantWhere(eId, 't')}`
      );
      participantes_unicos = asInt(row.total);
    } catch (_) {
      // Fallback: participantes direto em treinamentos
      const [[row]] = await pool.query(
        `SELECT COALESCE(SUM(participantes_presentes), 0) AS total
         FROM treinamentos WHERE ${tw}`
      );
      participantes_unicos = asInt(row.total);
    }

    // NPS médio
    let nps_score = null;
    try {
      const [[nRow]] = await pool.query(
        `SELECT
           COUNT(*)                                                         AS total,
           SUM(CASE WHEN nota_nps >= 9 THEN 1 ELSE 0 END)                  AS promotores,
           SUM(CASE WHEN nota_nps BETWEEN 7 AND 8.9 THEN 1 ELSE 0 END)    AS neutros,
           SUM(CASE WHEN nota_nps < 7 THEN 1 ELSE 0 END)                   AS detratores
         FROM avaliacoes av
         JOIN treinamentos t ON t.id = av.treinamento_id
         WHERE ${tenantWhere(eId, 't')} AND av.nota_nps IS NOT NULL`
      );
      if (asInt(nRow.total) > 0) {
        nps_score = Math.round(
          ((asInt(nRow.promotores) - asInt(nRow.detratores)) / asInt(nRow.total)) * 100
        );
      }
    } catch (_) {}

    // Taxa de presença média
    let taxa_presenca = null;
    try {
      const [[pRow]] = await pool.query(
        `SELECT
           COUNT(*)                                                              AS total,
           SUM(CASE WHEN LOWER(TRIM(p.status)) = 'presente' THEN 1 ELSE 0 END) AS presentes
         FROM presencas p
         JOIN treinamentos t ON t.id = p.treinamento_id
         WHERE ${tenantWhere(eId, 't')}`
      );
      if (asInt(pRow.total) > 0) {
        taxa_presenca = Number(((asInt(pRow.presentes) / asInt(pRow.total)) * 100).toFixed(1));
      }
    } catch (_) {}

    return res.json({
      turmas_total:         turmasTotal,
      turmas_concluidas:    concluidas,
      horas_total:          asInt(horas_total),
      horas_previstas:      asInt(horas_previstas),
      participantes_unicos,
      nps_score,
      taxa_presenca,
      por_status:           porStatus,
    });
  } catch (error) {
    console.error('[analytics] getResumo:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar resumo', error: error.message });
  }
}

/* ─── GET /api/analytics/horas ─────────────────────────────────────────────── */
async function getHoras(req, res) {
  try {
    const eId = req.empresaId ?? null;
    const tw  = tenantWhere(eId);

    // Horas por mês (últimos 12 meses)
    const [porMes] = await pool.query(
      `SELECT
         YEAR(COALESCE(data_fim, data))  AS ano,
         MONTH(COALESCE(data_fim, data)) AS mes,
         COALESCE(SUM(carga_horaria), 0) AS horas,
         COUNT(*)                         AS turmas
       FROM treinamentos
       WHERE ${tw}
         AND ${STATUS_CONCLUIDO}
         AND COALESCE(data_fim, data) >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
       GROUP BY ano, mes
       ORDER BY ano, mes`
    );

    // Horas por cliente (top 10)
    const [porCliente] = await pool.query(
      `SELECT
         COALESCE(cliente, '(sem cliente)') AS cliente,
         COALESCE(SUM(carga_horaria), 0)    AS horas,
         COUNT(*)                            AS turmas
       FROM treinamentos
       WHERE ${tw} AND ${STATUS_CONCLUIDO}
       GROUP BY cliente
       ORDER BY horas DESC
       LIMIT 10`
    );

    // Horas por instrutor (top 10)
    const [porInstrutor] = await pool.query(
      `SELECT
         COALESCE(instrutor, '(sem instrutor)') AS instrutor,
         COALESCE(SUM(carga_horaria), 0)        AS horas,
         COUNT(*)                                AS turmas
       FROM treinamentos
       WHERE ${tw} AND ${STATUS_CONCLUIDO}
       GROUP BY instrutor
       ORDER BY horas DESC
       LIMIT 10`
    );

    // Total geral
    const [[{ total }]] = await pool.query(
      `SELECT COALESCE(SUM(carga_horaria), 0) AS total
       FROM treinamentos WHERE ${tw} AND ${STATUS_CONCLUIDO}`
    );

    return res.json({
      total:         asInt(total),
      por_mes:       porMes.map((r) => ({ ...r, horas: asInt(r.horas), turmas: asInt(r.turmas) })),
      por_cliente:   porCliente.map((r) => ({ ...r, horas: asInt(r.horas), turmas: asInt(r.turmas) })),
      por_instrutor: porInstrutor.map((r) => ({ ...r, horas: asInt(r.horas), turmas: asInt(r.turmas) })),
    });
  } catch (error) {
    console.error('[analytics] getHoras:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar horas', error: error.message });
  }
}

/* ─── GET /api/analytics/nps ───────────────────────────────────────────────── */
async function getNps(req, res) {
  try {
    const eId = req.empresaId ?? null;

    const [[global]] = await pool.query(
      `SELECT
         COUNT(*)                                                          AS total,
         SUM(CASE WHEN av.nota_nps >= 9 THEN 1 ELSE 0 END)               AS promotores,
         SUM(CASE WHEN av.nota_nps BETWEEN 7 AND 8.9 THEN 1 ELSE 0 END)  AS neutros,
         SUM(CASE WHEN av.nota_nps < 7 THEN 1 ELSE 0 END)                AS detratores,
         ROUND(AVG(av.nota_nps), 1)                                       AS media
       FROM avaliacoes av
       JOIN treinamentos t ON t.id = av.treinamento_id
       WHERE ${tenantWhere(eId, 't')} AND av.nota_nps IS NOT NULL`
    );

    const total      = asInt(global.total);
    const promotores = asInt(global.promotores);
    const detratores = asInt(global.detratores);
    const score      = total > 0
      ? Math.round(((promotores - detratores) / total) * 100)
      : null;

    // NPS por turma (top 10 com mais respostas)
    const [porTurma] = await pool.query(
      `SELECT
         t.tema,
         t.cliente,
         COUNT(av.id)                                                         AS respostas,
         ROUND(AVG(av.nota_nps), 1)                                           AS media,
         SUM(CASE WHEN av.nota_nps >= 9 THEN 1 ELSE 0 END)                   AS promotores,
         SUM(CASE WHEN av.nota_nps < 7 THEN 1 ELSE 0 END)                    AS detratores
       FROM avaliacoes av
       JOIN treinamentos t ON t.id = av.treinamento_id
       WHERE ${tenantWhere(eId, 't')} AND av.nota_nps IS NOT NULL
       GROUP BY t.id, t.tema, t.cliente
       HAVING respostas >= 2
       ORDER BY respostas DESC
       LIMIT 10`
    );

    // Tendência NPS por mês (últimos 6 meses)
    const [tendencia] = await pool.query(
      `SELECT
         YEAR(av.criado_em)   AS ano,
         MONTH(av.criado_em)  AS mes,
         COUNT(*)             AS respostas,
         ROUND(AVG(av.nota_nps), 1) AS media
       FROM avaliacoes av
       JOIN treinamentos t ON t.id = av.treinamento_id
       WHERE ${tenantWhere(eId, 't')}
         AND av.nota_nps IS NOT NULL
         AND av.criado_em >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY ano, mes
       ORDER BY ano, mes`
    );

    return res.json({
      score,
      total,
      promotores,
      neutros:     asInt(global.neutros),
      detratores,
      media:       asDec(global.media),
      por_turma:   porTurma,
      tendencia,
    });
  } catch (error) {
    console.error('[analytics] getNps:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar NPS', error: error.message });
  }
}

/* ─── GET /api/analytics/efetividade ───────────────────────────────────────── */
async function getEfetividade(req, res) {
  try {
    const eId = req.empresaId ?? null;
    const tw  = tenantWhere(eId, 't');

    // Taxa de aprovação global (nota_prova >= 6)
    const [[aprovacao]] = await pool.query(
      `SELECT
         COUNT(*)                                               AS total,
         SUM(CASE WHEN av.nota_prova >= 6 THEN 1 ELSE 0 END)  AS aprovados,
         ROUND(AVG(av.nota_prova), 1)                          AS media_prova
       FROM avaliacoes av
       JOIN treinamentos t ON t.id = av.treinamento_id
       WHERE ${tw} AND av.nota_prova IS NOT NULL`
    );

    // Taxa de presença global
    let presenca = { taxa: null, presentes: 0, total: 0 };
    try {
      const [[pRow]] = await pool.query(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN LOWER(TRIM(p.status)) = 'presente' THEN 1 ELSE 0 END) AS presentes
         FROM presencas p
         JOIN treinamentos t ON t.id = p.treinamento_id
         WHERE ${tw}`
      );
      const ptotal = asInt(pRow.total);
      presenca = {
        total:    ptotal,
        presentes: asInt(pRow.presentes),
        taxa:     ptotal > 0
          ? Number(((asInt(pRow.presentes) / ptotal) * 100).toFixed(1))
          : null,
      };
    } catch (_) {}

    // Efetividade por cliente
    const [porCliente] = await pool.query(
      `SELECT
         COALESCE(t.cliente, '(sem cliente)')                   AS cliente,
         COUNT(DISTINCT t.id)                                   AS turmas,
         ROUND(AVG(av.nota_prova), 1)                          AS media_prova,
         ROUND(AVG(av.nota_qualidade), 1)                      AS media_qualidade,
         SUM(CASE WHEN av.nota_prova >= 6 THEN 1 ELSE 0 END)  AS aprovados,
         COUNT(av.id)                                           AS avaliados
       FROM treinamentos t
       LEFT JOIN avaliacoes av ON av.treinamento_id = t.id
       WHERE ${tw}
       GROUP BY t.cliente
       ORDER BY turmas DESC
       LIMIT 10`
    );

    const totalAv    = asInt(aprovacao.total);
    const taxa_aprov = totalAv > 0
      ? Number(((asInt(aprovacao.aprovados) / totalAv) * 100).toFixed(1))
      : null;

    return res.json({
      taxa_aprovacao:    taxa_aprov,
      media_prova:       asDec(aprovacao.media_prova),
      total_avaliados:   totalAv,
      presenca,
      por_cliente:       porCliente,
    });
  } catch (error) {
    console.error('[analytics] getEfetividade:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar efetividade', error: error.message });
  }
}

/* ─── GET /api/analytics/roi ───────────────────────────────────────────────── */
async function getRoi(req, res) {
  try {
    const eId = req.empresaId ?? null;
    const tw  = tenantWhere(eId);

    const [[dados]] = await pool.query(
      `SELECT
         COUNT(*)                                         AS turmas_total,
         SUM(CASE WHEN ${STATUS_CONCLUIDO} THEN 1 END)   AS turmas_concluidas,
         COALESCE(SUM(carga_horaria), 0)                  AS horas_total,
         COALESCE(SUM(CASE WHEN ${STATUS_CONCLUIDO}
           THEN carga_horaria ELSE 0 END), 0)             AS horas_realizadas,
         COALESCE(SUM(participantes_presentes), 0)        AS pessoas_impactadas,
         COALESCE(SUM(participantes_previstos), 0)        AS pessoas_previstas
       FROM treinamentos WHERE ${tw}`
    );

    const horas      = asInt(dados.horas_realizadas);
    const pessoas    = asInt(dados.pessoas_impactadas);
    // Custo estimado: R$ 150/h por participante (referência T&D Brasil 2024)
    const custo_est  = horas * pessoas * 150;

    const turmasTotal    = asInt(dados.turmas_total);
    const turmasConc     = asInt(dados.turmas_concluidas);
    const taxaConclusao  = turmasTotal > 0
      ? Number(((turmasConc / turmasTotal) * 100).toFixed(1))
      : 0;

    const pessoasPrev = asInt(dados.pessoas_previstas);
    const alcance     = pessoasPrev > 0
      ? Number(((pessoas / pessoasPrev) * 100).toFixed(1))
      : null;

    return res.json({
      horas_realizadas:    horas,
      horas_previstas:     asInt(dados.horas_total),
      pessoas_impactadas:  pessoas,
      pessoas_previstas:   pessoasPrev,
      turmas_concluidas:   turmasConc,
      turmas_total:        turmasTotal,
      taxa_conclusao:      taxaConclusao,
      alcance_percentual:  alcance,
      custo_estimado:      custo_est,  // referência indicativa
    });
  } catch (error) {
    console.error('[analytics] getRoi:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar ROI', error: error.message });
  }
}

module.exports = { getResumo, getHoras, getNps, getEfetividade, getRoi };
