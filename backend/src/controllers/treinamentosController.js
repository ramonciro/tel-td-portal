const pool = require("../lib/db");

async function getTreinamentoById(req, res) {
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
        participantes_previstos,
        participantes_presentes,
        concluidos,
        publico,
        status,
        descricao,
        data,
        data_inicio,
        data_fim,
        turma,
        supervisor
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

    return res.json(rows[0]);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao buscar treinamento",
      error: error.message,
    });
  }
}

module.exports = { getTreinamentoById };
