const pool = require("../lib/db");

function parseLocalDate(dateValue) {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    return new Date(
      dateValue.getFullYear(),
      dateValue.getMonth(),
      dateValue.getDate()
    );
  }

  const text = String(dateValue).trim().slice(0, 10);
  const parts = text.split("-");

  if (parts.length !== 3) return null;

  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function isSunday(dateValue) {
  const d = parseLocalDate(dateValue);
  if (!d || Number.isNaN(d.getTime())) return false;
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

    const itens = rows.map((item) => {
      const diasRegistrados = Number(item.dias_registrados || 0);
      const presentes = Number(item.presentes || 0);
      const ausentes = Number(item.ausentes || 0);
      const justificados = Number(item.justificados || 0);
      const pendentes = Number(item.pendentes || 0);

      const primeira = item.primeira_chamada;
      const ultima = item.ultima_chamada;

      const sundayCount = [primeira, ultima].filter(
        (d, idx, arr) => d && isSunday(d) && arr.indexOf(d) === idx
      ).length;

      const diasValidos = Math.max(diasRegistrados - sundayCount, 0);

      const frequenciaPercentual =
        diasValidos > 0 ? Number(((presentes / diasValidos) * 100).toFixed(1)) : 0;

      return {
        ...item,
        dias_registrados: diasValidos,
        presentes,
        ausentes,
        justificados,
        pendentes,
        frequencia_percentual: frequenciaPercentual,
      };
    });

    const itensSemDomingo = itens.filter((item) => {
      const primeira = item.primeira_chamada;
      const ultima = item.ultima_chamada;
      const apenasDomingo =
        item.dias_registrados === 0 &&
        ((primeira && isSunday(primeira)) || (ultima && isSunday(ultima)));

      return !apenasDomingo;
    });

    const totalTreinandos = itensSemDomingo.length;

    const mediaFrequencia = totalTreinandos
      ? Number(
          (
            itensSemDomingo.reduce(
              (acc, item) => acc + Number(item.frequencia_percentual || 0),
              0
            ) / totalTreinandos
          ).toFixed(1)
        )
      : 0;

    const criticos = itensSemDomingo.filter(
      (item) => Number(item.frequencia_percentual || 0) < 75
    ).length;

    const atencao = itensSemDomingo.filter((item) => {
      const freq = Number(item.frequencia_percentual || 0);
      return freq >= 75 && freq < 90;
    }).length;

    const estaveis = itensSemDomingo.filter(
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
      itens: itensSemDomingo,
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
