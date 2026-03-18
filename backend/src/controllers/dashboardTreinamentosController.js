import pool from "../db.js";

function parseHorasTexto(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;

  const texto = String(valor).toLowerCase().replace(",", ".").trim();
  const match = texto.match(/(\d+(\.\d+)?)/);

  return match ? Number(match[1]) || 0 : 0;
}

function buildWhere(alias = "t", query = {}) {
  const where = [];
  const params = [];

  if (query.cliente) {
    where.push(`${alias}.cliente = ?`);
    params.push(query.cliente);
  }

  if (query.inicio) {
    where.push(`DATE(COALESCE(${alias}.data_fim, ${alias}.data_inicio, ${alias}.data)) >= ?`);
    params.push(query.inicio);
  }

  if (query.fim) {
    where.push(`DATE(COALESCE(${alias}.data_inicio, ${alias}.data)) <= ?`);
    params.push(query.fim);
  }

  return {
    clause: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}

function getDiasPeriodo(item) {
  const inicio = item.data_inicio || item.data;
  const fim = item.data_fim || item.data_inicio || item.data;

  if (!inicio || !fim) return 1;

  const d1 = new Date(inicio);
  const d2 = new Date(fim);

  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 1;

  const diffMs = d2.setHours(0, 0, 0, 0) - d1.setHours(0, 0, 0, 0);
  const dias = Math.floor(diffMs / 86400000) + 1;

  return dias > 0 ? dias : 1;
}

export async function getDashboardTreinamentos(req, res) {
  try {
    const { clause, params } = buildWhere("t", req.query || {});

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
      ${
        clause
          ? `${clause} AND t.cliente IS NOT NULL AND t.cliente <> ''`
          : "WHERE t.cliente IS NOT NULL AND t.cliente <> ''"
      }
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

    const [[registrosChamada]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM presencas p
      INNER JOIN treinamentos t ON t.id = p.treinamento_id
      ${clause}
      `,
      params
    );

    const [[presentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM presencas p
      INNER JOIN treinamentos t ON t.id = p.treinamento_id
      ${
        clause
          ? `${clause} AND p.status = 'presente'`
          : "WHERE p.status = 'presente'"
      }
      `,
      params
    );

    const [[ausentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM presencas p
      INNER JOIN treinamentos t ON t.id = p.treinamento_id
      ${
        clause
          ? `${clause} AND p.status = 'ausente'`
          : "WHERE p.status = 'ausente'"
      }
      `,
      params
    );

    const [[justificados]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM presencas p
      INNER JOIN treinamentos t ON t.id = p.treinamento_id
      ${
        clause
          ? `${clause} AND p.status = 'justificado'`
          : "WHERE p.status = 'justificado'"
      }
      `,
      params
    );

    const [[pendentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM presencas p
      INNER JOIN treinamentos t ON t.id = p.treinamento_id
      ${
        clause
          ? `${clause} AND (p.status IS NULL OR p.status = '' OR p.status = 'pendente')`
          : "WHERE p.status IS NULL OR p.status = '' OR p.status = 'pendente'"
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
        t.data,
        t.data_inicio,
        t.data_fim,
        p.data_chamada,
        SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) AS presentes_dia
      FROM treinamentos t
      LEFT JOIN presencas p
        ON p.treinamento_id = t.id
      ${clause}
      GROUP BY
        t.id,
        t.carga_horaria,
        t.data,
        t.data_inicio,
        t.data_fim,
        p.data_chamada
      `,
      params
    );

    const horasTreinadas = horasTreinadasBase.reduce((acc, item) => {
      const horasTotais = parseHorasTexto(item.carga_horaria);
      const diasPeriodo = getDiasPeriodo(item);
      const cargaDia = diasPeriodo > 0 ? horasTotais / diasPeriodo : horasTotais;
      const presentesDia = Number(item.presentes_dia || 0);

      return acc + cargaDia * presentesDia;
    }, 0);

    const [presencaPorCliente] = await pool.query(
      `
      SELECT
        t.cliente,
        COUNT(DISTINCT t.id) AS total_turmas,
        COUNT(p.id) AS total_chamada,
        SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) AS presentes,
        SUM(CASE WHEN p.status = 'ausente' THEN 1 ELSE 0 END) AS ausentes,
        SUM(CASE WHEN p.status = 'justificado' THEN 1 ELSE 0 END) AS justificados,
        SUM(
          CASE
            WHEN p.status IS NULL OR p.status = '' OR p.status = 'pendente'
            THEN 1
            ELSE 0
          END
        ) AS pendentes,
        COALESCE(
          ROUND(
            (
              SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) /
              NULLIF(COUNT(p.id), 0)
            ) * 100,
            0
          ),
          0
        ) AS taxa_presenca
      FROM treinamentos t
      INNER JOIN presencas p
        ON p.treinamento_id = t.id
      ${
        clause
          ? `${clause} AND t.cliente IS NOT NULL AND t.cliente <> ''`
          : "WHERE t.cliente IS NOT NULL AND t.cliente <> ''"
      }
      GROUP BY t.cliente
      ORDER BY total_turmas DESC, total_chamada DESC
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
        COUNT(p.id) AS treinandos_vinculados,
        SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) AS presentes,
        COALESCE(
          ROUND(
            (
              SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) /
              NULLIF(COUNT(p.id), 0)
            ) * 100,
            0
          ),
          0
        ) AS taxa_presenca
      FROM treinamentos t
      LEFT JOIN presencas p
        ON p.treinamento_id = t.id
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
        COALESCE(MAX(p.data_chamada), t.data_fim, t.data_inicio, t.data) AS data,
        t.carga_horaria,
        t.participantes,
        COUNT(p.id) AS treinados,
        SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) AS presentes,
        SUM(CASE WHEN p.status = 'ausente' THEN 1 ELSE 0 END) AS ausentes,
        SUM(CASE WHEN p.status = 'justificado' THEN 1 ELSE 0 END) AS justificados,
        SUM(
          CASE
            WHEN p.status IS NULL OR p.status = '' OR p.status = 'pendente'
            THEN 1
            ELSE 0
          END
        ) AS pendentes
      FROM treinamentos t
      LEFT JOIN presencas p
        ON p.treinamento_id = t.id
      ${clause}
      GROUP BY
        t.id,
        t.tema,
        t.cliente,
        t.instrutor,
        t.carga_horaria,
        t.participantes
      ORDER BY data DESC, t.id DESC
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
    const totalTreinados = Number(registrosChamada.total || 0);
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
        total_treinados: Number(item.total_chamada || 0),
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
