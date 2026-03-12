import pool from "../db.js";

export async function listPresencas(req, res) {
  try {
    const [rows] = await pool.query("SELECT id, treinamento_id, treinando_nome, presente FROM presencas ORDER BY id DESC");
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao listar presenças", error: error.message });
  }
}

export async function createPresenca(req, res) {
  try {
    const { treinamento_id, treinando_nome, presente } = req.body || {};
    if (!treinamento_id || !treinando_nome || typeof presente !== "boolean") {
      return res.status(400).json({ ok: false, message: "Preencha treinamento, nome do treinando e presença" });
    }

    const [result] = await pool.query(
      "INSERT INTO presencas (treinamento_id, treinando_nome, presente) VALUES (?, ?, ?)",
      [treinamento_id, treinando_nome, presente]
    );

    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao registrar presença", error: error.message });
  }
}
