import pool from "../db.js";

export async function listTreinamentos(req, res) {
  try {
    const [rows] = await pool.query("SELECT id, tema, cliente, instrutor, data, status FROM treinamentos ORDER BY id DESC");
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao listar treinamentos", error: error.message });
  }
}

export async function createTreinamento(req, res) {
  try {
    const { tema, cliente, instrutor, data, status } = req.body || {};
    if (!tema || !cliente || !instrutor || !data || !status) {
      return res.status(400).json({ ok: false, message: "Preencha todos os campos do treinamento" });
    }

    const [result] = await pool.query(
      "INSERT INTO treinamentos (tema, cliente, instrutor, data, status) VALUES (?, ?, ?, ?, ?)",
      [tema, cliente, instrutor, data, status]
    );

    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao criar treinamento", error: error.message });
  }
}
