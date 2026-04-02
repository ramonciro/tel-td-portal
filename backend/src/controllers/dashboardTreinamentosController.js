const pool = require("../lib/db");

function parseHorasTexto(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;

  const texto = String(valor).toLowerCase().replace(",", ".").trim();
  const match = texto.match(/(\d+(\.\d+)?)/);

  return match ? Number(match[1]) || 0 : 0;
}

function buildClienteFilter(cliente) {
  const valor = String(cliente || "").trim();
  if (!valor) {
    return {
      whereTreinamentos: "",
      paramsTreinamentos: [],
      whereAliasT: "",
      paramsAliasT: [],
    };
  }

  return {
    whereTreinamentos: "WHERE cliente = ?",
    paramsTreinamentos: [valor],
    whereAliasT: "WHERE t.cliente = ?",
    paramsAliasT: [valor],
  };
}

async function getDashboardTreinamentos(req, res) {
  try {
    const clienteFiltro = String(req.query?.cliente || "").trim();
    const filter = buildClienteFilter(clienteFiltro);

    const [[treinamentos]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamentos
      ${filter.whereTreinamentos}
    `,
      filter.paramsTreinamentos
    );

    const [[clientesCarteira]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM clientes
    `);

    const [[clientesComTreinamento]] = await pool.query(
      `
      SELECT COUNT(DISTINCT cliente) AS total
      FROM treinamentos
      WHERE cliente IS NOT NULL
        AND cliente <> ''
        ${clienteFiltro ? "AND cliente = ?" : ""}
    `,
      clienteFiltro ? [clienteFiltro] : []
    );

    const [[participantesPrevistos]] = await pool.query(
      `
      SELECT COALESCE(SUM(participantes), 0) AS total
      FROM treinamentos
      ${filter.whereTreinamentos}
    `,
      filter.paramsTreinamentos
    );

    const [[treinadosImportados]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${filter.whereAliasT}
    `,
      filter.paramsAliasT
    );

    const [[presentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${filter.whereAliasT ? `${filter.whereAliasT} AND` : "WHERE"} tp.status_presenca = 'presente'
    `,
      filter.paramsAliasT
    );

    const [[ausentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${filter.whereAliasT ? `${filter.whereAliasT} AND` : "WHERE"} tp.status_presenca = 'ausente'
    `,
      filter.paramsAliasT
    );

    const [[justificados]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${filter.whereAliasT ? `${filter.whereAliasT} AND` : "WHERE"} tp.status_presenca = 'justificado'
    `,
      filter.paramsAliasT
    );

    const [[pendentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${filter.whereAliasT ? `${filter.whereAliasT} AND` : "WHERE"}
      (
        tp.status_presenca IS NULL
        OR tp.status_presenca = ''
        OR tp.status_presenca = 'pendente'
      )
    `,
      filter.paramsAliasT
    );

    const [[mediaParticipantesPorTurma]] = await pool.query(
      `
      SELECT COALESCE(ROUND(AVG(participantes), 1), 0) AS total
      FROM treinamentos
      ${filter.whereTreinamentos}
    `,
      filter.paramsTreinamentos
    );

    const [cargas] = await pool.query(
      `
      SELECT carga_horaria
      FROM treinamentos
      ${filter.whereTreinamentos ? `${filter.whereTreinamentos} AND` : "WHERE"}
      carga_horaria IS NOT NULL
      AND carga_horaria <> ''
    `,
      filter.paramsTreinamentos
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
        SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) AS presentes,
        COUNT(tp.id) AS registros_total
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      ${filter.whereAliasT}
      GROUP BY t.id, t.carga_horaria
    `,
      filter.paramsAliasT
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
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      WHERE t.cliente IS NOT NULL
        AND t.cliente <> ''
        ${clienteFiltro ? "AND t.cliente = ?" : ""}
      GROUP BY t.cliente
      ORDER BY total_turmas DESC, previstos DESC
      LIMIT 12
    `,
      clienteFiltro ? [clienteFiltro] : []
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
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      WHERE t.instrutor IS NOT NULL
        AND t.instrutor <> ''
        ${clienteFiltro ? "AND t.cliente = ?" : ""}
      GROUP BY t.instrutor
      ORDER BY total_turmas DESC, treinandos_previstos DESC
      LIMIT 12
    `,
      clienteFiltro ? [clienteFiltro] : []
    );

    const [ultimasTurmas] = await pool.query(
      `
      SELECT
        t.id,
        t.tema,
        t.cliente,
        t.instrutor,
        t.data,
        t.data_inicio,
        t.data_fim,
        t.carga_horaria,
        t.participantes,
        COUNT(tp.id) AS treinados,
        SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) AS presentes,
        SUM(CASE WHEN tp.status_presenca = 'ausente' THEN 1 ELSE 0 END) AS ausentes,
        SUM(CASE WHEN tp.status_presenca = 'justificado' THEN 1 ELSE 0 END) AS justificados,
        SUM(
          CASE
            WHEN tp.status_presenca IS NULL
              OR tp.status_presenca = ''
              OR tp.status_presenca = 'pendente'
            THEN 1
            ELSE 0
          END
        ) AS pendentes
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      ${filter.whereAliasT}
      GROUP BY
        t.id,
        t.tema,
        t.cliente,
        t.instrutor,
        t.data,
        t.data_inicio,
        t.data_fim,
        t.carga_horaria,
        t.participantes
      ORDER BY t.id DESC
      LIMIT 8
    `,
      filter.paramsAliasT
    );

    const [clientesDisponiveis] = await pool.query(`
      SELECT DISTINCT cliente
      FROM treinamentos
      WHERE cliente IS NOT NULL
        AND cliente <> ''
      ORDER BY cliente ASC
    `);

    const totalTreinamentos = Number(treinamentos.total || 0);
    const totalTreinados = Number(treinadosImportados.total || 0);
    const totalPrevistos = Number(participantesPrevistos.total || 0);
    const totalPresentes = Number(presentes.total || 0);
    const totalAusentes = Number(ausentes.total || 0);
    const totalJustificados = Number(justificados.total || 0);
    const totalPendentes = Number(pendentes.total || 0);

    const taxaPresenca =
      totalTreinados > 0
        ? Math.round((totalPresentes / totalTreinados) * 100)
        : 0;

    const taxaConclusaoChamada =
      totalTreinados > 0
        ? Math.round(((totalTreinados - totalPendentes) / totalTreinados) * 100)
        : 0;

    return res.json({
      ok: true,
      filtro_aplicado: {
        cliente: clienteFiltro || "",
      },
      clientes_disponiveis: clientesDisponiveis.map((item) => item.cliente),
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
        previstos_no_dia: 0,
        presentes_no_dia: 0,
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
      ultimas_turmas: ultimasTurmas.map((item) => ({
        ...item,
        base_ativa: Number(item.treinados || 0) > 0 ? Number(item.treinados || 0) : Number(item.participantes || 0),
      })),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar dashboard blindado de treinamentos",
      error: error.message,
    });
  }
}

module.exports = {
  getDashboardTreinamentos,
};
