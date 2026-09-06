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
const {
  getHorasAplicadasTotal,
  getHorasAplicadasPorMes,
  getHorasAplicadasPorCliente,
  getHorasAplicadasPorInstrutor,
} = require('../services/capacidadeResolver');

/* ─── helpers ──────────────────────────────────────────────────────────────── */

// Gera o WHERE clause de tenant dinamicamente
function tenantWhere(empresaId, alias = 't') {
  return empresaId ? `${alias}.empresa_id = ${pool.escape(empresaId)}` : '1=1';
}

// Filtro de recorte (cliente/operação e período), comum a todas as abas de
// Indicadores — pedido do coordenador para poder isolar "NPS do último
// trimestre" ou "efetividade só do cliente X" sem sair da tela. Sempre
// somado ao tenantWhere (nunca substitui o isolamento por tenant) e às
// janelas fixas dos gráficos de tendência (últimos 6/12 meses), que
// continuam valendo por cima deste filtro.
function filtroRecorte(query = {}, alias = 't') {
  const conditions = [];
  const params = [];
  if (query.cliente) {
    conditions.push(`${alias}.cliente = ?`);
    params.push(query.cliente);
  }
  if (query.data_inicio) {
    conditions.push(`DATE(COALESCE(${alias}.data_fim, ${alias}.data_inicio, ${alias}.data)) >= ?`);
    params.push(query.data_inicio);
  }
  if (query.data_fim) {
    conditions.push(`DATE(COALESCE(${alias}.data_fim, ${alias}.data_inicio, ${alias}.data)) <= ?`);
    params.push(query.data_fim);
  }
  return {
    sql: conditions.length ? ` AND ${conditions.join(' AND ')}` : '',
    params,
  };
}

// Custo por hora usado no cálculo de ROI. Antes fixo em R$ 150 para todo
// mundo, com uma nota na tela prometendo uma tela de configuração que não
// existia. Agora lê de empresas.custo_hora_treinamento (configurável em
// Admin → tenant); sem tenant (super_admin) ou sem valor definido, mantém
// os R$ 150 como referência padrão.
const CUSTO_HORA_PADRAO = 150;
async function getCustoPorHora(empresaId) {
  if (!empresaId) return CUSTO_HORA_PADRAO;
  try {
    const [[row]] = await pool.query(
      'SELECT custo_hora_treinamento FROM empresas WHERE id = ? LIMIT 1',
      [empresaId]
    );
    const valor = Number(row?.custo_hora_treinamento);
    return valor > 0 ? valor : CUSTO_HORA_PADRAO;
  } catch (_) {
    return CUSTO_HORA_PADRAO;
  }
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
    const filtro = filtroRecorte(req.query);
    const where = `${tw}${filtro.sql}`;

    // Lista de clientes/operações do tenant, para alimentar o filtro na tela
    // (Indicadores não tinha filtro nenhum antes — nem cliente, nem período).
    let clientes = [];
    try {
      const [clienteRows] = await pool.query(
        `SELECT DISTINCT cliente FROM treinamentos t WHERE ${tw} AND cliente IS NOT NULL AND cliente <> '' ORDER BY cliente`
      );
      clientes = clienteRows.map((r) => r.cliente);
    } catch (_) {}

    // Turmas por status
    const [statusRows] = await pool.query(
      `SELECT status, COUNT(*) AS total FROM treinamentos t WHERE ${where} GROUP BY status`,
      filtro.params
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

    // Horas treinadas (aplicadas) — mesma fonte única da Capacidade: aula a
    // aula quando a turma tem cronograma, senão carga horária nominal de
    // turma que já rodou/está rodando. Antes era um SUM(carga_horaria)
    // simplificado de turmas concluídas, que não batia com a Capacidade.
    const horas_total = await getHorasAplicadasTotal({
      empresaId: eId,
      cliente: req.query.cliente,
      dataInicio: req.query.data_inicio,
      dataFim: req.query.data_fim,
    });

    // Horas previstas (todas as turmas)
    const [[{ horas_previstas }]] = await pool.query(
      `SELECT COALESCE(SUM(carga_horaria), 0) AS horas_previstas
       FROM treinamentos t WHERE ${where}`,
      filtro.params
    );

    // Participantes únicos treinados
    let participantes_unicos = 0;
    try {
      const [[row]] = await pool.query(
        `SELECT COUNT(DISTINCT tp.nome) AS total
         FROM treinamento_participantes tp
         JOIN treinamentos t ON t.id = tp.treinamento_id
         WHERE ${tenantWhere(eId, 't')}${filtro.sql}`,
        filtro.params
      );
      participantes_unicos = asInt(row.total);
    } catch (_) {
      // Fallback: participantes direto em treinamentos
      const [[row]] = await pool.query(
        `SELECT COALESCE(SUM(participantes_presentes), 0) AS total
         FROM treinamentos t WHERE ${where}`,
        filtro.params
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
         WHERE ${tenantWhere(eId, 't')}${filtro.sql} AND av.nota_nps IS NOT NULL`,
        filtro.params
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
         WHERE ${tenantWhere(eId, 't')}${filtro.sql}`,
        filtro.params
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
      clientes,
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
    const cliente = req.query.cliente;
    const dataInicio = req.query.data_inicio;
    const dataFim = req.query.data_fim;

    // Horas aplicadas — mesma fonte única da Capacidade (aula a aula quando
    // a turma tem cronograma, senão carga horária nominal de turma que já
    // rodou/está rodando). Antes cada agregação abaixo somava carga_horaria
    // nominal de turmas concluídas direto na tabela treinamentos, sem olhar
    // aula a aula — o que divergia do que a tela de Capacidade mostrava.
    const [porMes, porCliente, porInstrutor, total] = await Promise.all([
      getHorasAplicadasPorMes({ empresaId: eId, cliente, dataInicio, dataFim }),
      getHorasAplicadasPorCliente({ empresaId: eId, cliente, dataInicio, dataFim, limit: 10 }),
      getHorasAplicadasPorInstrutor({ empresaId: eId, cliente, dataInicio, dataFim, limit: 10 }),
      getHorasAplicadasTotal({ empresaId: eId, cliente, dataInicio, dataFim }),
    ]);

    return res.json({
      total,
      por_mes:       porMes,
      por_cliente:   porCliente,
      por_instrutor: porInstrutor,
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
    const filtro = filtroRecorte(req.query, 't');
    const where = `${tenantWhere(eId, 't')}${filtro.sql}`;

    const [[global]] = await pool.query(
      `SELECT
         COUNT(*)                                                          AS total,
         SUM(CASE WHEN av.nota_nps >= 9 THEN 1 ELSE 0 END)               AS promotores,
         SUM(CASE WHEN av.nota_nps BETWEEN 7 AND 8.9 THEN 1 ELSE 0 END)  AS neutros,
         SUM(CASE WHEN av.nota_nps < 7 THEN 1 ELSE 0 END)                AS detratores,
         ROUND(AVG(av.nota_nps), 1)                                       AS media
       FROM avaliacoes av
       JOIN treinamentos t ON t.id = av.treinamento_id
       WHERE ${where} AND av.nota_nps IS NOT NULL`,
      filtro.params
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
       WHERE ${where} AND av.nota_nps IS NOT NULL
       GROUP BY t.id, t.tema, t.cliente
       HAVING respostas >= 2
       ORDER BY respostas DESC
       LIMIT 10`,
      filtro.params
    );

    // Tendência NPS por mês (últimos 6 meses) — janela fixa de 6 meses
    // continua valendo por cima do filtro de período escolhido na tela.
    const [tendencia] = await pool.query(
      `SELECT
         YEAR(av.criado_em)   AS ano,
         MONTH(av.criado_em)  AS mes,
         COUNT(*)             AS respostas,
         ROUND(AVG(av.nota_nps), 1) AS media
       FROM avaliacoes av
       JOIN treinamentos t ON t.id = av.treinamento_id
       WHERE ${where}
         AND av.nota_nps IS NOT NULL
         AND av.criado_em >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY ano, mes
       ORDER BY ano, mes`,
      filtro.params
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
    const filtro = filtroRecorte(req.query, 't');
    const where = `${tenantWhere(eId, 't')}${filtro.sql}`;

    // Taxa de aprovação global (nota_prova >= 6)
    const [[aprovacao]] = await pool.query(
      `SELECT
         COUNT(*)                                               AS total,
         SUM(CASE WHEN av.nota_prova >= 6 THEN 1 ELSE 0 END)  AS aprovados,
         ROUND(AVG(av.nota_prova), 1)                          AS media_prova
       FROM avaliacoes av
       JOIN treinamentos t ON t.id = av.treinamento_id
       WHERE ${where} AND av.nota_prova IS NOT NULL`,
      filtro.params
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
         WHERE ${where}`,
        filtro.params
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
       WHERE ${where}
       GROUP BY t.cliente
       ORDER BY turmas DESC
       LIMIT 10`,
      filtro.params
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
    const filtro = filtroRecorte(req.query);
    const where = `${tenantWhere(eId)}${filtro.sql}`;
    const custoPorHora = await getCustoPorHora(eId);

    const [dados, horasAplicadas] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)                                         AS turmas_total,
           SUM(CASE WHEN ${STATUS_CONCLUIDO} THEN 1 END)   AS turmas_concluidas,
           COALESCE(SUM(carga_horaria), 0)                  AS horas_total,
           COALESCE(SUM(participantes_presentes), 0)        AS pessoas_impactadas,
           COALESCE(SUM(participantes_previstos), 0)        AS pessoas_previstas
         FROM treinamentos t WHERE ${where}`,
        filtro.params
      ).then(([rows]) => rows[0]),
      // Horas aplicadas — mesma fonte única da Capacidade (aula a aula
      // quando a turma tem cronograma, senão carga horária nominal de
      // turma que já rodou/está rodando). Antes era SUM(carga_horaria)
      // nominal de turmas concluídas, que não batia com a Capacidade.
      getHorasAplicadasTotal({
        empresaId: eId,
        cliente: req.query.cliente,
        dataInicio: req.query.data_inicio,
        dataFim: req.query.data_fim,
      }),
    ]);

    const horas      = horasAplicadas;
    const pessoas    = asInt(dados.pessoas_impactadas);
    // Custo estimado: configurável por empresa (Admin → tenant → "Custo por
    // hora de treinamento"); sem valor definido, usa R$ 150/h como referência
    // (T&D Brasil 2024) — antes esse valor vinha sempre fixo em 150, mesmo
    // com uma nota na tela dizendo que dava pra configurar.
    const custo_est  = horas * pessoas * custoPorHora;

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
      custo_por_hora:      custoPorHora,
    });
  } catch (error) {
    console.error('[analytics] getRoi:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar ROI', error: error.message });
  }
}

/* ─── GET /api/analytics/exportar ──────────────────────────────────────────── */
// Exporta em Excel a aba de Indicadores ativa (?aba=horas|nps|efetividade|roi),
// respeitando o mesmo filtro de cliente/período usado na tela.
async function exportarIndicadores(req, res) {
  try {
    const eId = req.empresaId ?? null;
    const aba = String(req.query.aba || 'horas');
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();

    if (aba === 'horas') {
      // Mesma fonte única de horas aplicadas usada pela tela (getHoras) e
      // pela Capacidade — antes este export somava carga_horaria nominal
      // direto na tabela, divergindo do que a tela mostrava.
      const [porCliente, porInstrutor] = await Promise.all([
        getHorasAplicadasPorCliente({ empresaId: eId, cliente: req.query.cliente, dataInicio: req.query.data_inicio, dataFim: req.query.data_fim, limit: 10 }),
        getHorasAplicadasPorInstrutor({ empresaId: eId, cliente: req.query.cliente, dataInicio: req.query.data_inicio, dataFim: req.query.data_fim, limit: 10 }),
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Cliente/Operação", "Turmas", "Horas"],
        ...porCliente.map((r) => [r.cliente, Number(r.turmas), Number(r.horas)]),
      ]), "Por cliente");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Instrutor", "Turmas", "Horas"],
        ...porInstrutor.map((r) => [r.instrutor, Number(r.turmas), Number(r.horas)]),
      ]), "Por instrutor");
    } else if (aba === 'nps') {
      const filtro = filtroRecorte(req.query, 't');
      const where = `${tenantWhere(eId, 't')}${filtro.sql}`;
      const [porTurma] = await pool.query(
        `SELECT t.tema, t.cliente, COUNT(av.id) AS respostas, ROUND(AVG(av.nota_nps), 1) AS media
         FROM avaliacoes av JOIN treinamentos t ON t.id = av.treinamento_id
         WHERE ${where} AND av.nota_nps IS NOT NULL
         GROUP BY t.id, t.tema, t.cliente ORDER BY respostas DESC`,
        filtro.params
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Turma", "Cliente", "Respostas", "NPS médio"],
        ...porTurma.map((r) => [r.tema, r.cliente, Number(r.respostas), r.media != null ? Number(r.media) : ""]),
      ]), "NPS por turma");
    } else if (aba === 'efetividade') {
      const filtro = filtroRecorte(req.query, 't');
      const where = `${tenantWhere(eId, 't')}${filtro.sql}`;
      const [porCliente] = await pool.query(
        `SELECT
           COALESCE(t.cliente, '(sem cliente)')                  AS cliente,
           COUNT(DISTINCT t.id)                                  AS turmas,
           ROUND(AVG(av.nota_prova), 1)                          AS media_prova,
           COUNT(av.id)                                          AS avaliados,
           SUM(CASE WHEN av.nota_prova >= 6 THEN 1 ELSE 0 END)  AS aprovados
         FROM treinamentos t LEFT JOIN avaliacoes av ON av.treinamento_id = t.id
         WHERE ${where} GROUP BY t.cliente ORDER BY turmas DESC`,
        filtro.params
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Cliente/Operação", "Turmas", "Avaliados", "Nota média", "Aprovados", "% Aprovados"],
        ...porCliente.map((r) => [
          r.cliente, Number(r.turmas), Number(r.avaliados || 0),
          r.media_prova != null ? Number(r.media_prova) : "",
          Number(r.aprovados || 0),
          Number(r.avaliados) > 0 ? Math.round((Number(r.aprovados) / Number(r.avaliados)) * 100) : "",
        ]),
      ]), "Efetividade por cliente");
    } else if (aba === 'roi') {
      const filtro = filtroRecorte(req.query);
      const where = `${tenantWhere(eId)}${filtro.sql}`;
      const custoPorHora = await getCustoPorHora(eId);
      const [dados, horas] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(*)                                         AS turmas_total,
             SUM(CASE WHEN ${STATUS_CONCLUIDO} THEN 1 END)   AS turmas_concluidas,
             COALESCE(SUM(carga_horaria), 0)                  AS horas_total,
             COALESCE(SUM(participantes_presentes), 0)        AS pessoas_impactadas,
             COALESCE(SUM(participantes_previstos), 0)        AS pessoas_previstas
           FROM treinamentos t WHERE ${where}`,
          filtro.params
        ).then(([rows]) => rows[0]),
        // Mesma fonte única de horas aplicadas usada pela tela (getRoi).
        getHorasAplicadasTotal({ empresaId: eId, cliente: req.query.cliente, dataInicio: req.query.data_inicio, dataFim: req.query.data_fim }),
      ]);
      const pessoas = Number(dados.pessoas_impactadas || 0);
      const custo = horas * pessoas * custoPorHora;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Indicador", "Valor"],
        ["Turmas totais", Number(dados.turmas_total || 0)],
        ["Turmas concluídas", Number(dados.turmas_concluidas || 0)],
        ["Horas previstas", Number(dados.horas_total || 0)],
        ["Horas realizadas", horas],
        ["Pessoas impactadas", pessoas],
        ["Pessoas previstas", Number(dados.pessoas_previstas || 0)],
        ["Custo por hora (R$)", custoPorHora],
        ["Custo estimado (R$)", custo],
      ]), "ROI");
    } else {
      return res.status(400).json({ ok: false, message: "Aba inválida." });
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="indicadores_${aba}.xlsx"`);
    return res.send(buf);
  } catch (error) {
    console.error('[analytics] exportarIndicadores:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao exportar indicadores', error: error.message });
  }
}

module.exports = { getResumo, getHoras, getNps, getEfetividade, getRoi, exportarIndicadores };
