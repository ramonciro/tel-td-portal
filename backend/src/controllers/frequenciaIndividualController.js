const pool = require("../lib/db");

async function getFrequenciaIndividual(req, res) {
  try {
    const { cliente, treinamento_id, inicio, fim } = req.query || {};

    const where = ["DAYOFWEEK(p.data_chamada) <> 1"];
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
        -- frequência = presentes / (presentes + ausentes).
        -- "justificado" (falta aprovada) e "pendente" (chamada ainda não feita)
        -- não entram no denominador: antes contavam contra o participante,
        -- fazendo treinamentos em andamento ou com atestados aprovados
        -- mostrarem frequência artificialmente baixa.
        ROUND(
          (
            SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) /
            NULLIF(
              SUM(CASE WHEN p.status IN ('presente', 'ausente') THEN 1 ELSE 0 END),
              0
            )
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

    const itens = rows.map((item) => ({
      ...item,
      dias_registrados: Number(item.dias_registrados || 0),
      presentes: Number(item.presentes || 0),
      ausentes: Number(item.ausentes || 0),
      justificados: Number(item.justificados || 0),
      pendentes: Number(item.pendentes || 0),
      frequencia_percentual: Number(item.frequencia_percentual || 0),
    }));

    const totalTreinandos = itens.length;

    const mediaFrequencia = totalTreinandos
      ? Number(
          (
            itens.reduce(
              (acc, item) => acc + Number(item.frequencia_percentual || 0),
              0
            ) / totalTreinandos
          ).toFixed(1)
        )
      : 0;

    const criticos = itens.filter(
      (item) => Number(item.frequencia_percentual || 0) < 75
    ).length;

    const atencao = itens.filter((item) => {
      const freq = Number(item.frequencia_percentual || 0);
      return freq >= 75 && freq < 90;
    }).length;

    const estaveis = itens.filter(
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
      itens,
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
