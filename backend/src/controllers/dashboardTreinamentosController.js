const pool = require("../lib/db");

function parseHorasTexto(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;

  const texto = String(valor).toLowerCase().replace(",", ".").trim();
  const match = texto.match(/(\d+(\.\d+)?)/);

  return match ? Number(match[1]) || 0 : 0;
}

function textParam(value) {
  const text = String(value || "").trim();
  return text ? text : "";
}

function buildTreinamentosFilter(query = {}) {
  const conditions = [];
  const params = [];

  const cliente = textParam(query.cliente);
  const instrutor = textParam(query.instrutor);
  const status = textParam(query.status);
  const modalidade = textParam(query.modalidade).toLowerCase();
  const dataInicio = textParam(query.data_inicio);
  const dataFim = textParam(query.data_fim);

  if (cliente) {
    conditions.push("t.cliente = ?");
    params.push(cliente);
  }

  if (instrutor) {
    conditions.push("t.instrutor = ?");
    params.push(instrutor);
  }

  if (status) {
    conditions.push("LOWER(COALESCE(t.status, '')) = ?");
    params.push(status.toLowerCase());
  }

  if (modalidade) {
    conditions.push("LOWER(COALESCE(t.descricao, '')) LIKE ?");
    params.push(`%[modalidade:${modalidade}]%`);
  }

  if (dataInicio) {
    conditions.push("DATE(COALESCE(t.data, t.data_inicio)) >= ?");
    params.push(dataInicio);
  }

  if (dataFim) {
    conditions.push("DATE(COALESCE(t.data, t.data_fim, t.data_inicio)) <= ?");
    params.push(dataFim);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
    selected: {
      cliente,
      instrutor,
      status,
      modalidade,
      data_inicio: dataInicio,
      data_fim: dataFim,
    },
  };
}

async function getDistinctOptions() {
  const [clientes] = await pool.query(`
    SELECT DISTINCT cliente
    FROM treinamentos
    WHERE cliente IS NOT NULL AND cliente <> ''
    ORDER BY cliente ASC
  `);

  const [instrutores] = await pool.query(`
    SELECT DISTINCT instrutor
    FROM treinamentos
    WHERE instrutor IS NOT NULL AND instrutor <> ''
    ORDER BY instrutor ASC
  `);

  return {
    clientes: clientes.map((item) => item.cliente).filter(Boolean),
    instrutores: instrutores.map((item) => item.instrutor).filter(Boolean),
    status: [
      { value: "planejado", label: "Planejada" },
      { value: "em_andamento", label: "Em andamento" },
      { value: "concluido", label: "Concluída" },
      { value: "cancelado", label: "Cancelada" },
    ],
    modalidades: [
      { value: "online", label: "Online" },
      { value: "presencial", label: "Presencial" },
    ],
  };
}

async function getOceanoResumo() {
  try {
    const [[jornadas]] = await pool.query(`SELECT COUNT(*) AS total FROM jornadas_desenvolvimento`);
    const [[acoes]] = await pool.query(`SELECT COUNT(*) AS total FROM acoes_desenvolvimento`);
    const [[sustentacoes]] = await pool.query(`SELECT COUNT(*) AS total FROM coaching_planos`);
    const [[tripulacao]] = await pool.query(`SELECT COUNT(*) AS total FROM jornada_participantes`);
    const [[emPercurso]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM jornada_participantes
      WHERE status_jornada = 'em_percurso'
    `);
    const [[concluidos]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM jornada_participantes
      WHERE status_jornada = 'concluido'
    `);
    const [[emSustentacao]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM jornada_participantes
      WHERE status_jornada = 'em_sustentacao'
    `);

    return {
      jornadas: Number(jornadas.total || 0),
      acoes: Number(acoes.total || 0),
      sustentacoes: Number(sustentacoes.total || 0),
      tripulacao: Number(tripulacao.total || 0),
      progresso_tripulacao: {
        em_percurso: Number(emPercurso.total || 0),
        concluido: Number(concluidos.total || 0),
        em_sustentacao: Number(emSustentacao.total || 0),
      },
    };
  } catch (error) {
    if (String(error.code || "") === "ER_NO_SUCH_TABLE") {
      return {
        jornadas: 0,
        acoes: 0,
        sustentacoes: 0,
        tripulacao: 0,
        progresso_tripulacao: {
          em_percurso: 0,
          concluido: 0,
          em_sustentacao: 0,
        },
      };
    }

    throw error;
  }
}

async function getDashboardTreinamentos(req, res) {
  try {
    const filter = buildTreinamentosFilter(req.query || {});
    const where = filter.where;
    const params = filter.params;

    const [[treinamentos]] = await pool.query(
      `SELECT COUNT(*) AS total FROM treinamentos t ${where}`,
      params
    );

    const [[clientesCarteira]] = await pool.query(`SELECT COUNT(*) AS total FROM clientes`);

    const [[clientesComTreinamento]] = await pool.query(
      `
      SELECT COUNT(DISTINCT t.cliente) AS total
      FROM treinamentos t
      ${where ? `${where} AND` : "WHERE"} t.cliente IS NOT NULL AND t.cliente <> ''
      `,
      params
    );

    const [[participantesPrevistos]] = await pool.query(
      `
      SELECT COALESCE(SUM(t.participantes), 0) AS total
      FROM treinamentos t
      ${where}
      `,
      params
    );

    const [[treinadosImportados]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${where}
      `,
      params
    );

    const [[presentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${where ? `${where} AND` : "WHERE"} tp.status_presenca = 'presente'
      `,
      params
    );

    const [[ausentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${where ? `${where} AND` : "WHERE"} tp.status_presenca = 'ausente'
      `,
      params
    );

    const [[justificados]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${where ? `${where} AND` : "WHERE"} tp.status_presenca = 'justificado'
      `,
      params
    );

    const [[pendentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${where ? `${where} AND` : "WHERE"}
      (tp.status_presenca IS NULL OR tp.status_presenca = '' OR tp.status_presenca = 'pendente')
      `,
      params
    );

    const [[mediaParticipantesPorTurma]] = await pool.query(
      `
      SELECT COALESCE(ROUND(AVG(t.participantes), 1), 0) AS total
      FROM treinamentos t
      ${where}
      `,
      params
    );

    const [cargas] = await pool.query(
      `
      SELECT t.carga_horaria
      FROM treinamentos t
      ${where ? `${where} AND` : "WHERE"} t.carga_horaria IS NOT NULL AND t.carga_horaria <> ''
      `,
      params
    );

    const cargaHorariaTotal = cargas.reduce(
      (acc, item) => acc + parseHorasTexto(item.carga_horaria),
      0
    );

    const [horasTreinadasBase] = await pool.query(
      `
      SELECT
        t.id,
        t.carga_horaria,
        COUNT(tp.id) AS registros_total,
        SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) AS presentes
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp ON tp.treinamento_id = t.id
      ${where}
      GROUP BY t.id, t.carga_horaria
      `,
      params
    );

    const horasTreinadas = horasTreinadasBase.reduce((acc, item) => {
      const horas = parseHorasTexto(item.carga_horaria);
      const presentesTurma = Number(item.presentes || 0);
      return acc + horas * presentesTurma;
    }, 0);

    const horasMinistradas = horasTreinadasBase.reduce((acc, item) => {
      const horas = parseHorasTexto(item.carga_horaria);
      const registrosTotal = Number(item.registros_total || 0);
      return acc + (registrosTotal > 0 ? horas : 0);
    }, 0);

    const [presencaPorCliente] = await pool.query(
      `
      SELECT
        t.cliente,
        COUNT(DISTINCT t.id) AS total_turmas,
        COALESCE(SUM(CASE WHEN tp.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS treinados_importados,
        COALESCE(SUM(t.participantes), 0) AS previstos,
        COALESCE(SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END), 0) AS presentes,
        COALESCE(SUM(CASE WHEN tp.status_presenca = 'ausente' THEN 1 ELSE 0 END), 0) AS ausentes,
        COALESCE(SUM(CASE WHEN tp.status_presenca = 'justificado' THEN 1 ELSE 0 END), 0) AS justificados,
        COALESCE(SUM(CASE WHEN tp.status_presenca IS NULL OR tp.status_presenca = '' OR tp.status_presenca = 'pendente' THEN 1 ELSE 0 END), 0) AS pendentes,
        ROUND(
          (
            COALESCE(SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END), 0) /
            NULLIF(COALESCE(SUM(CASE WHEN tp.id IS NOT NULL THEN 1 ELSE 0 END), 0), 0)
          ) * 100,
          0
        ) AS taxa_presenca
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp ON tp.treinamento_id = t.id
      ${where ? `${where} AND` : "WHERE"} t.cliente IS NOT NULL AND t.cliente <> ''
      GROUP BY t.cliente
      ORDER BY total_turmas DESC, previstos DESC
      LIMIT 10
      `,
      params
    );

    const [rankingInstrutores] = await pool.query(
      `
      SELECT
        t.instrutor,
        COUNT(DISTINCT t.id) AS total_turmas,
        COALESCE(SUM(t.participantes), 0) AS treinandos_previstos,
        COALESCE(SUM(CASE WHEN tp.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS treinandos_vinculados,
        COALESCE(SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END), 0) AS presentes,
        ROUND(
          (
            COALESCE(SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END), 0) /
            NULLIF(COALESCE(SUM(CASE WHEN tp.id IS NOT NULL THEN 1 ELSE 0 END), 0), 0)
          ) * 100,
          0
        ) AS taxa_presenca
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp ON tp.treinamento_id = t.id
      ${where ? `${where} AND` : "WHERE"} t.instrutor IS NOT NULL AND t.instrutor <> ''
      GROUP BY t.instrutor
      ORDER BY total_turmas DESC, treinandos_previstos DESC
      LIMIT 10
      `,
      params
    );

    const [ultimasTurmas] = await pool.query(
      `
      SELECT
        t.id,
        t.tema,
        t.cliente,
        t.instrutor,
        t.status,
        t.data,
        t.data_inicio,
        t.data_fim,
        t.carga_horaria,
        t.participantes,
        t.descricao,
        COUNT(tp.id) AS treinados,
        SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) AS presentes,
        SUM(CASE WHEN tp.status_presenca = 'ausente' THEN 1 ELSE 0 END) AS ausentes,
        SUM(CASE WHEN tp.status_presenca = 'justificado' THEN 1 ELSE 0 END) AS justificados,
        SUM(CASE WHEN tp.status_presenca IS NULL OR tp.status_presenca = '' OR tp.status_presenca = 'pendente' THEN 1 ELSE 0 END) AS pendentes
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp ON tp.treinamento_id = t.id
      ${where}
      GROUP BY t.id, t.tema, t.cliente, t.instrutor, t.status, t.data, t.data_inicio, t.data_fim, t.carga_horaria, t.participantes, t.descricao
      ORDER BY COALESCE(t.data, t.data_inicio, t.id) DESC, t.id DESC
      LIMIT 8
      `,
      params
    );

    const [[npsBase]] = await pool.query(`
      SELECT
        COALESCE(ROUND(((SUM(CASE WHEN nota >= 9 THEN 1 ELSE 0 END) - SUM(CASE WHEN nota <= 6 THEN 1 ELSE 0 END)) / NULLIF(COUNT(*), 0)) * 100, 0), 0) AS nps,
        COUNT(*) AS respostas
      FROM respostas_avaliativas_nps
    `).catch(() => [[{ nps: 0, respostas: 0 }]]);

    const [[qualidadeBase]] = await pool.query(`
      SELECT COALESCE(ROUND(AVG(nota), 1), 0) AS media
      FROM avaliacoes_treinandos
    `).catch(() => [[{ media: 0 }]]);

    const totalTreinamentos = Number(treinamentos.total || 0);
    const totalTreinados = Number(treinadosImportados.total || 0);
    const totalPrevistos = Number(participantesPrevistos.total || 0);
    const totalPresentes = Number(presentes.total || 0);
    const totalAusentes = Number(ausentes.total || 0);
    const totalJustificados = Number(justificados.total || 0);
    const totalPendentes = Number(pendentes.total || 0);

    const taxaPresenca = totalTreinados > 0 ? Math.round((totalPresentes / totalTreinados) * 100) : 0;
    const taxaConclusaoChamada = totalTreinados > 0 ? Math.round(((totalTreinados - totalPendentes) / totalTreinados) * 100) : 0;
    const taxaExecucao = totalPrevistos > 0 ? Math.round((totalTreinados / totalPrevistos) * 100) : 0;
    const gapDiario = totalPrevistos > totalTreinados ? totalPrevistos - totalTreinados : 0;

    const filtros = await getDistinctOptions();
    const oceano = await getOceanoResumo();

    return res.json({
      ok: true,
      filtros: {
        ...filtros,
        selecionados: filter.selected,
      },
      kpis: {
        treinamentos: totalTreinamentos,
        treinados: totalTreinados,
        participantes_previstos: totalPrevistos,
        presentes: totalPresentes,
        ausentes: totalAusentes,
        justificados: totalJustificados,
        pendentes: totalPendentes,
        taxa_presenca: taxaPresenca,
        taxa_conclusao_chamada: taxaConclusaoChamada,
        media_participantes_por_turma: Number(mediaParticipantesPorTurma.total || 0),
        horas_treinadas: Number(horasTreinadas || 0),
        horas_ministradas: Number(horasMinistradas || 0),
        carga_horaria_total: Number(cargaHorariaTotal || 0),
        clientes_ativos: Number(clientesCarteira.total || 0),
        clientes_com_treinamento: Number(clientesComTreinamento.total || 0),
        nps: Number(npsBase.nps || 0),
        respostas_nps: Number(npsBase.respostas || 0),
        media_qualidade: Number(qualidadeBase.media || 0),
        taxa_execucao_diaria: taxaExecucao,
        capacidade_diaria_prevista: totalPrevistos,
        gap_diario: gapDiario,
        previstos_no_dia: totalPrevistos,
        presentes_no_dia: totalPresentes,
      },
      presenca_por_cliente: presencaPorCliente.map((item) => ({
        ...item,
        total_treinados:
          Number(item.treinados_importados || 0) > 0
            ? Number(item.treinados_importados || 0)
            : Number(item.previstos || 0),
      })),
      ranking_instrutores: rankingInstrutores.map((item) => ({
        ...item,
        total_treinados:
          Number(item.treinandos_vinculados || 0) > 0
            ? Number(item.treinandos_vinculados || 0)
            : Number(item.treinandos_previstos || 0),
      })),
      ultimas_turmas: ultimasTurmas,
      oceano,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar o painel de treinamentos.",
      error: error.message,
    });
  }
}

module.exports = {
  getDashboardTreinamentos,
};
