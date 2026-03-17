import pool from "../db.js";

function parseHorasTexto(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;

  const texto = String(valor).toLowerCase().replace(",", ".").trim();
  const match = texto.match(/(\d+(\.\d+)?)/);

  return match ? Number(match[1]) || 0 : 0;
}

function buildTreinamentosWhere(req) {
  const where = [];
  const params = [];

  if (req.query?.cliente) {
    where.push("t.cliente = ?");
    params.push(req.query.cliente);
  }

  if (req.query?.inicio) {
    where.push("DATE(t.data) >= ?");
    params.push(req.query.inicio);
  }

  if (req.query?.fim) {
    where.push("DATE(t.data) <= ?");
    params.push(req.query.fim);
  }

  return {
    clause: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

export async function getDashboardTreinamentos(req, res) {
  try {
    const { clause, params } = buildTreinamentosWhere(req);

    const [[treinamentos]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamentos t
      ${clause}
      `,
      params
    );

    const [[clientesCarteira]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM clientes
    `);

    const [[clientesComTreinamento]] = await pool.query(
      `
      SELECT COUNT(DISTINCT t.cliente) AS total
      FROM treinamentos t
      ${clause ? `${clause} AND t.cliente IS NOT NULL AND t.cliente <> ''` : "WHERE t.cliente IS NOT NULL AND t.cliente <> ''"}
      `,
      params
    );

    const [[participantesPrevistos]] = await pool.query(
      `
      SELECT COALESCE(SUM(t.participantes), 0) AS total
      FROM treinamentos t
      ${clause}
      `,
      params
    );

    const [[treinadosImportados]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${clause}
      `,
      params
    );

    const [[presentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${clause ? `${clause} AND tp.status_presenca = 'presente'` : "WHERE tp.status_presenca = 'presente'"}
      `,
      params
    );

    const [[ausentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${clause ? `${clause} AND tp.status_presenca = 'ausente'` : "WHERE tp.status_presenca = 'ausente'"}
      `,
      params
    );

    const [[justificados]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${clause ? `${clause} AND tp.status_presenca = 'justificado'` : "WHERE tp.status_presenca = 'justificado'"}
      `,
      params
    );

    const [[pendentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${
        clause
          ? `${clause} AND (tp.status_presenca IS NULL OR tp.status_presenca = '' OR tp.status_presenca = 'pendente')`
          : "WHERE tp.status_presenca IS NULL OR tp.status_presenca = '' OR tp.status_presenca = 'pendente'"
      }
      `,
      params
    );

    const [[mediaParticipantesPorTurma]] = await pool.query(
      `
      SELECT COALESCE(ROUND(AVG(t.participantes), 1), 0) AS total
      FROM treinamentos t
      ${clause}
      `,
      params
    );

    const [cargas] = await pool.query(
      `
      SELECT t.carga_horaria
      FROM treinamentos t
      ${
        clause
          ? `${clause} AND t.carga_horaria IS NOT NULL AND t.carga_horaria <> ''`
          : "WHERE t.carga_horaria IS NOT NULL AND t.carga_horaria <> ''"
      }
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
        SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) AS presentes
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      ${clause}
      GROUP BY t.id, t.carga_horaria
      `,
      params
    );

    const horasTreinadas = horasTreinadasBase.reduce((acc, item) => {
      const horas = parseHorasTexto(item.carga_horaria);
      const presentesTurma = Number(item.presentes || 0);
      return acc + horas * presentesTurma;
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
        COALESCE(
          ROUND(
            (
              COALESCE(SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END), 0) /
              NULLIF(COALESCE(SUM(CASE WHEN tp.id IS NOT NULL THEN 1 ELSE 0 END), 0), 0)
            ) * 100,
            0
          ),
          0
        ) AS taxa_presenca
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      ${
        clause
          ? `${clause} AND t.cliente IS NOT NULL AND t.cliente <> ''`
          : "WHERE t.cliente IS NOT NULL AND t.cliente <> ''"
      }
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
        COALESCE(
          ROUND(
            (
              COALESCE(SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END), 0) /
              NULLIF(COALESCE(SUM(CASE WHEN tp.id IS NOT NULL THEN 1 ELSE 0 END), 0), 0)
            ) * 100,
            0
          ),
          0
        ) AS taxa_presenca
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      ${
        clause
          ? `${clause} AND t.instrutor IS NOT NULL AND t.instrutor <> ''`
          : "WHERE t.instrutor IS NOT NULL AND t.instrutor <> ''"
      }
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
        t.data,
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
      ${clause}
      GROUP BY
        t.id,
        t.tema,
        t.cliente,
        t.instrutor,
        t.data,
        t.carga_horaria,
        t.participantes
      ORDER BY t.id DESC
      LIMIT 8
      `,
      params
    );

    const [npsRows] = await pool.query(
      `
      SELECT
        at.nota_nps,
        t.cliente
      FROM avaliacoes_treinandos at
      INNER JOIN treinamentos t ON t.id = at.treinamento_id
      ${clause}
      `,
      params
    );

    const totalNps = npsRows.length;
    const promotores = npsRows.filter((n) => Number(n.nota_nps) >= 9).length;
    const detratores = npsRows.filter((n) => Number(n.nota_nps) <= 6).length;

    const nps =
      totalNps > 0
        ? Math.round((promotores / totalNps) * 100 - (detratores / totalNps) * 100)
        : 0;

    const [avaliacoes] = await pool.query(
      `
      SELECT
        a.nota_qualidade,
        a.nota_prova
      FROM avaliacoes a
      INNER JOIN treinamentos t ON t.id = a.treinamento_id
      ${clause}
      `,
      params
    );

    const mediaQualidade =
      avaliacoes.length > 0
        ? Number(
            (
              avaliacoes.reduce(
                (acc, a) => acc + Number(a.nota_qualidade || 0),
                0
              ) / avaliacoes.length
            ).toFixed(1)
          )
        : 0;

    const [rankingNps] = await pool.query(
      `
      SELECT
        t.cliente,
        COUNT(*) AS respostas,
        COALESCE(
          ROUND(
            (
              (
                SUM(CASE WHEN at.nota_nps >= 9 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)
              ) * 100
            ) -
            (
              (
                SUM(CASE WHEN at.nota_nps <= 6 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)
              ) * 100
            ),
            0
          ),
          0
        ) AS nps
      FROM avaliacoes_treinandos at
      INNER JOIN treinamentos t ON t.id = at.treinamento_id
      ${
        clause
          ? `${clause} AND t.cliente IS NOT NULL AND t.cliente <> ''`
          : "WHERE t.cliente IS NOT NULL AND t.cliente <> ''"
      }
      GROUP BY t.cliente
      ORDER BY nps DESC, respostas DESC
      LIMIT 10
      `,
      params
    );

    const totalTreinamentos = Number(treinamentos.total || 0);
    const totalTreinados = Number(treinadosImportados.total || 0);
    const totalPrevistos = Number(participantesPrevistos.total || 0);
    const totalPresentes = Number(presentes.total || 0);
    const totalAusentes = Number(ausentes.total || 0);
    const totalJustificados = Number(justificados.total || 0);
    const totalPendentes = Number(pendentes.total || 0);

    const taxaPresenca =
      totalTreinados > 0 ? Math.round((totalPresentes / totalTreinados) * 100) : 0;

    const taxaConclusaoChamada =
      totalTreinados > 0
        ? Math.round(((totalTreinados - totalPendentes) / totalTreinados) * 100)
        : 0;

    return res.json({
      ok: true,
      filtros: {
        cliente: req.query?.cliente || "",
        inicio: req.query?.inicio || "",
        fim: req.query?.fim || "",
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
        carga_horaria_total: Number(cargaHorariaTotal || 0),
        clientes_ativos: Number(clientesCarteira.total || 0),
        clientes_com_treinamento: Number(clientesComTreinamento.total || 0),
        nps: Number(nps || 0),
        media_qualidade: Number(mediaQualidade || 0),
        respostas_nps: Number(totalNps || 0),
        promotores: Number(promotores || 0),
        detratores: Number(detratores || 0),
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
      ranking_nps: rankingNps,
      ultimas_turmas: ultimasTurmas,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar dashboard blindado de treinamentos",
      error: error.message,
    });
  }
}
