import pool from "../db.js";

export async function listAvaliacoes(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT id, treinamento_id, nota_nps, nota_qualidade, comentario FROM avaliacoes ORDER BY id DESC"
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao listar avaliações"
    });
  }
}

export async function createAvaliacao(req, res) {
  try {
    const { treinamento_id, nota_nps, nota_qualidade, comentario } = req.body;

    const [result] = await pool.query(
      "INSERT INTO avaliacoes (treinamento_id, nota_nps, nota_qualidade, comentario) VALUES (?,?,?,?)",
      [treinamento_id, nota_nps, nota_qualidade, comentario]
    );

    res.json({
      ok: true,
      id: result.insertId
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao registrar avaliação"
    });
  }
}
