const pool = require("../lib/db");

function parseHorasTexto(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;

  const texto = String(valor).toLowerCase().replace(",", ".").trim();
  const match = texto.match(/(\d+(\.\d+)?)/);

  return match ? Number(match[1]) || 0 : 0;
}

async function getDashboardTreinamentos(req, res) {
  try {
    const [[treinamentos]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamentos
    `);

    const [[clientesCarteira]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM clientes
    `);

    const [[clientesComTreinamento]] = await pool.query(`
      SELECT COUNT(DISTINCT cliente) AS total
      FROM treinamentos
      WHERE cliente IS NOT NULL
        AND cliente <> ''
    `);

    const [[participantesPrevistos]] = await pool.query(`
      SELECT COALESCE(SUM(participantes), 0) AS total
      FROM treinamentos
    `);

    const [[participantesTreinados]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
    `);

    const [[presentes]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.status_presenca = 'presente'
    `);

    const [[ausentes]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.status_presenca = 'ausente'
    `);

    const [[justificados]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.status_presenca = 'justificado'
    `);

    const [[pendentes]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.status_presenca IS NULL
         OR tp.status_presenca = ''
         OR tp.status_presenca = 'pendente'
    `);

    const [[mediaParticipantesPorTurma]] = await pool.query(`
      SELECT COALESCE(ROUND(AVG(participantes), 1), 0) AS total
      FROM treinamentos
    `);

    const [cargas] = await pool.query(`
      SELECT carga_horaria
      FROM treinamentos
      WHERE carga_horaria IS NOT NULL
        AND carga_horaria <> ''
    `);

    const cargaHorariaTotal = cargas.reduce(
      (acc, item) => acc + parseHorasTexto(item.carga_horaria),
      0
    );

    const [horasTreinadasBase] = await pool.query(`
      SELECT
        t.id,
        t.carga_horaria,
        SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) AS presentes
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      GROUP BY t.id, t.carga_horaria
    `);

    const horasTreinadas = horasTreinadasBase.reduce((acc, item) => {
      const horas = parseHorasTexto(item.carga_horaria);
      const presentesTurma = Number(item.presentes || 0);
      return acc + horas * presentesTurma;
    }, 0);

    const [presencaPorCliente] = await pool.query(`
      SELECT
        t.cliente,
        COUNT(tp.id) AS total_treinados,
        SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) AS presentes,
        SUM(CASE WHEN tp.status_presenca = 'ausente' THEN 1 ELSE 0 END) AS ausentes,
        SUM(CASE WHEN tp.status_presenca = 'justificado' THEN 1 ELSE 0 END) AS justificados,
        ROUND(
          (
            SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) /
            NULLIF(COUNT(tp.id), 0)
          ) * 100,
          0
        ) AS taxa_presenca
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      WHERE t.cliente IS NOT NULL
        AND t.cliente <> ''
      GROUP BY t.cliente
      ORDER BY total_treinados DESC, presentes DESC
      LIMIT 10
    `);

    const [rankingInstrutores] = await pool.query(`
      SELECT
        t.instrutor,
        COUNT(DISTINCT t.id) AS total_turmas,
        COUNT(tp.id) AS total_treinados,
        SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) AS presentes,
        ROUND(
          (
            SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) /
            NULLIF(COUNT(tp.id), 0)
          ) * 100,
          0
        ) AS taxa_presenca
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      WHERE t.instrutor IS NOT NULL
        AND t.instrutor <> ''
      GROUP BY t.instrutor
      ORDER BY total_turmas DESC, presentes DESC
      LIMIT 10
    `);

    const [ultimasTurmas] = await pool.query(`
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
    `);

    const totalTreinamentos = Number(treinamentos.total || 0);
    const totalTreinados = Number(participantesTreinados.total || 0);
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
      },
      presenca_por_cliente: presencaPorCliente,
      ranking_instrutores: rankingInstrutores,
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

module.exports = {
  getDashboardTreinamentos,
};
