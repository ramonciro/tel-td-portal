export async function getTreinamentoById(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        id,
        tema,
        cliente,
        instrutor,
        carga_horaria,
        participantes,
        publico,
        status,
        descricao,
        data
      FROM treinamentos
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Treinamento não encontrado",
      });
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao buscar treinamento",
      error: error.message,
    });
  }
}
