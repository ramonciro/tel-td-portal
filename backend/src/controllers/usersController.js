import pool from "../db.js";

export async function listUsers(req, res) {
  const [rows] = await pool.query(
    "SELECT id, nome, email, perfil, cliente, ativo FROM usuarios ORDER BY id DESC"
  );
  res.json(rows);
}

export async function createUser(req, res) {
  const { nome, email, senha, perfil, cliente, ativo } = req.body;

  const [result] = await pool.query(
    "INSERT INTO usuarios (nome,email,senha,perfil,cliente,ativo) VALUES (?,?,?,?,?,?)",
    [nome, email, senha, perfil, cliente, ativo]
  );

  res.json({ ok: true, id: result.insertId });
}
