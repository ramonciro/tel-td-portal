import pool from "../db.js";

function parseHorasTexto(valor) {
  if (!valor) return 0;
  const match = String(valor).match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

export async function getDashboardTreinamentos(req, res) {
  try {
    const { cliente } = req.query;

    const filtroCliente = cliente
      ? `WHERE t.cliente = ?`
      : "";

    const params = cliente ? [cliente] : [];

    // TREINAMENTOS
    const [[treinamentos]] = await pool.query(
      `SELECT COUNT(*) AS total FROM treinamentos t ${filtroCliente}`,
      params
    );

    // TREINADOS
    const [[treinados]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${filtroCliente}
      `,
      params
    );

    // PRESENÇA
    const [[presentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${filtroCliente}
      AND tp.status_presenca = 'presente'
      `,
      params
    );

    const [[ausentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${filtroCliente}
      AND tp.status_presenca = 'ausente'
      `,
      params
    );

    const [[pendentes]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      ${filtroCliente}
      AND (tp.status_presenca IS NULL OR tp.status_presenca = 'pendente')
      `,
      params
    );

    // NPS
    const [npsRows] = await pool.query(
      `
      SELECT nota_nps
      FROM avaliacoes_treinandos at
      INNER JOIN treinamentos t ON t.id = at.treinamento_id
      ${filtroCliente}
      `,
      params
    );

    const totalNps = npsRows.length;
    const promotores = npsRows.filter(n => n.nota_nps >= 9).length;
    const detratores = npsRows.filter(n => n.nota_nps <= 6).length;

    const nps = totalNps
      ? Math.round((promotores / totalNps) * 100 - (detratores / totalNps) * 100)
      : 0;

    // QUALIDADE
    const [avaliacoes] = await pool.query(
      `
      SELECT nota_qualidade
      FROM avaliacoes a
      INNER JOIN treinamentos t ON t.id = a.treinamento_id
      ${filtroCliente}
      `,
      params
    );

    const mediaQualidade = avaliacoes.length
      ? (
          avaliacoes.reduce((acc, a) => acc + Number(a.nota_qualidade || 0), 0) /
          avaliacoes.length
        ).toFixed(1)
      : 0;

    const totalTreinados = Number(treinados.total || 0);
    const totalPresentes = Number(presentes.total || 0);

    const taxaPresenca =
      totalTreinados > 0
        ? Math.round((totalPresentes / totalTreinados) * 100)
        : 0;

    return res.json({
      ok: true,
      kpis: {
        treinamentos: treinamentos.total,
        treinados: treinados.total,
        presentes: presentes.total,
        ausentes: ausentes.total,
        pendentes: pendentes.total,
        taxa_presenca: taxaPresenca,
        nps,
        media_qualidade: Number(mediaQualidade),
      },
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro no dashboard com filtro",
      error: error.message,
    });
  }
}
