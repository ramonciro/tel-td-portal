import pool from "../db.js";

export async function listPresencas(req, res) {
  const [rows] = await pool.query(
    "SELECT id, treinamento_id, treinando_nome, presente FROM presencas ORDER BY id DESC"
  );
  res.json(rows);
}

export async function createPresenca(req, res) {
  const { treinamento_id, treinando_nome, presente } = req.body;

  const [result] = await pool.query(
    "INSERT INTO presencas (treinamento_id, treinando_nome, presente) VALUES (?,?,?)",
    [treinamento_id, treinando_nome, presente]
  );

  res.json({ ok: true, id: result.insertId });
}
