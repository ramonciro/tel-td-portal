import pool from "../db.js";

export async function listAvaliacoes(req, res) {
  try {
    const [rows] = await pool.query("SELECT id, treinamento_id, nota_nps, nota_qualidade, comentario FROM avaliacoes ORDER BY id DESC");
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao listar avaliações", error: error.message });
  }
}

export async function createAvaliacao(req, res) {
  try {
    const { treinamento_id, nota_nps, nota_qualidade, comentario } = req.body || {};
    if (!treinamento_id || nota_nps === undefined || nota_qualidade === undefined) {
      return res.status(400).json({ ok: false, message: "Preencha treinamento, NPS e qualidade" });
    }

    const [result] = await pool.query(
      "INSERT INTO avaliacoes (treinamento_id, nota_nps, nota_qualidade, comentario) VALUES (?, ?, ?, ?)",
      [treinamento_id, nota_nps, nota_qualidade, comentario || null]
    );

    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao registrar avaliação", error: error.message });
  }
}
