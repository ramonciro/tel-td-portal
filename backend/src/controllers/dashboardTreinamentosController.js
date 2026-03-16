const pool = require("../lib/db");

async function getDashboardTreinamentos(req, res) {
  try {
    const [[treinamentos]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamentos
    `);

    const [[participantesImportados]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
    `);

    const [[participantesPrevistos]] = await pool.query(`
      SELECT COALESCE(SUM(t.participantes), 0) AS total
      FROM treinamentos t
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
      SELECT COALESCE(ROUND(AVG(x.total_participantes), 1), 0) AS total
      FROM (
        SELECT
          t.id,
          COUNT(tp.id) AS total_participantes
        FROM treinamentos t
        LEFT JOIN treinamento_participantes tp
          ON tp.treinamento_id = t.id
        GROUP BY t.id
      ) x
    `);

    const [[horasTreinadas]] = await pool.query(`
      SELECT COALESCE(SUM(base.horas_treinadas), 0) AS total
      FROM (
        SELECT
          t.id,
          (
            CASE
              WHEN t.carga_horaria IS NULL OR t.carga_horaria = '' THEN 0
              ELSE CAST(
                REPLACE(
                  REPLACE(
                    REPLACE(LOWER(t.carga_horaria), 'h', ''),
                    ',', '.'
                  ),
                  ' ',
                  ''
                ) AS DECIMAL(10,2)
              )
            END
          ) *
          SUM(
            CASE
              WHEN tp.status_presenca = 'presente' THEN 1
              ELSE 0
            END
          ) AS horas_treinadas
        FROM treinamentos t
        LEFT JOIN treinamento_participantes tp
          ON tp.treinamento_id = t.id
        GROUP BY t.id, t.carga_horaria
      ) base
    `);

    const [[clientesAtivos]] = await pool.query(`
      SELECT COUNT(DISTINCT cliente) AS total
      FROM treinamentos
      WHERE cliente IS NOT NULL
        AND cliente <> ''
    `);

    const [presencaPorCliente] = await pool.query(`
      SELECT
        t.cliente,
        COUNT(tp.id) AS total_participantes,
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
      ORDER BY total_participantes DESC, presentes DESC
      LIMIT 10
    `);

    const [rankingInstrutores] = await pool.query(`
      SELECT
        t.instrutor,
        COUNT(DISTINCT t.id) AS total_turmas,
        COUNT(tp.id) AS total_participantes,
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
        COUNT(tp.id) AS importados,
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
    const totalImportados = Number(participantesImportados.total || 0);
    const totalPrevistos = Number(participantesPrevistos.total || 0);
    const totalPresentes = Number(presentes.total || 0);
    const totalAusentes = Number(ausentes.total || 0);
    const totalJustificados = Number(justificados.total || 0);
    const totalPendentes = Number(pendentes.total || 0);
    const mediaPorTurma = Number(mediaParticipantesPorTurma.total || 0);
    const totalHorasTreinadas = Number(horasTreinadas.total || 0);
    const totalClientesAtivos = Number(clientesAtivos.total || 0);

    const taxaPresenca =
      totalImportados > 0
        ? Math.round((totalPresentes / totalImportados) * 100)
        : 0;

    const taxaConclusaoChamada =
      totalImportados > 0
        ? Math.round(((totalImportados - totalPendentes) / totalImportados) * 100)
        : 0;

    return res.json({
      ok: true,
      kpis: {
        treinamentos: totalTreinamentos,
        participantes_importados: totalImportados,
        participantes_previstos: totalPrevistos,
        presentes: totalPresentes,
        ausentes: totalAusentes,
        justificados: totalJustificados,
        pendentes: totalPendentes,
        taxa_presenca: taxaPresenca,
        taxa_conclusao_chamada: taxaConclusaoChamada,
        media_participantes_por_turma: mediaPorTurma,
        horas_treinadas: totalHorasTreinadas,
        clientes_ativos: totalClientesAtivos,
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
