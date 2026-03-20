const pool = require("../lib/db");

function isSunday(dateValue) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;
  return d.getDay() === 0;
}

async function getFrequenciaIndividual(req, res) {
  try {
    const { cliente, treinamento_id, inicio, fim } = req.query || {};

    const where = [];
    const params = [];

    if (cliente) {
      where.push("t.cliente = ?");
      params.push(cliente);
    }

    if (treinamento_id) {
      where.push("t.id = ?");
      params.push(treinamento_id);
    }

    if (inicio) {
      where.push("DATE(p.data_chamada) >= ?");
      params.push(inicio);
    }

    if (fim) {
      where.push("DATE(p.data_chamada) <= ?");
      params.push(fim);
    }

    where.push("DAYOFWEEK(p.data_chamada) <> 1");

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `
      SELECT
        p.treinando_nome,
        t.id AS treinamento_id,
        t.tema,
        t.cliente,
        t.instrutor,
        COUNT(*) AS dias_registrados,
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
        ROUND(
          (
            SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) /
            NULLIF(COUNT(*), 0)
          ) * 100,
          1
        ) AS frequencia_percentual,
        MIN(p.data_chamada) AS primeira_chamada,
        MAX(p.data_chamada) AS ultima_chamada
      FROM presencas p
      INNER JOIN treinamentos t ON t.id = p.treinamento_id
      ${whereClause}
      GROUP BY
        p.treinando_nome,
        t.id,
        t.tema,
        t.cliente,
        t.instrutor
      ORDER BY frequencia_percentual ASC, p.treinando_nome ASC
      `,
      params
    );

    const totalTreinandos = rows.length;
    const mediaFrequencia = totalTreinandos
      ? Number(
          (
            rows.reduce(
              (acc, item) => acc + Number(item.frequencia_percentual || 0),
              0
            ) / totalTreinandos
          ).toFixed(1)
        )
      : 0;

    const criticos = rows.filter(
      (item) => Number(item.frequencia_percentual || 0) < 75
    ).length;

    const atencao = rows.filter((item) => {
      const freq = Number(item.frequencia_percentual || 0);
      return freq >= 75 && freq < 90;
    }).length;

    const estaveis = rows.filter(
      (item) => Number(item.frequencia_percentual || 0) >= 90
    ).length;

    return res.json({
      ok: true,
      kpis: {
        treinandos: totalTreinandos,
        media_frequencia: mediaFrequencia,
        criticos,
        atencao,
        estaveis,
      },
      itens: rows,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar frequência individual",
      error: error.message,
    });
  }
}

module.exports = {
  getFrequenciaIndividual,
};
