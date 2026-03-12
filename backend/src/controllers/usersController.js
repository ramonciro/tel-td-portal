import pool from "../db.js";

export async function listUsers(req, res) {
  try {
    const [rows] = await pool.query("SELECT id, nome, email, perfil, cliente, ativo FROM usuarios ORDER BY id DESC");
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao listar usuários", error: error.message });
  }
}

export async function createUser(req, res) {
  try {
    const { nome, email, senha, perfil, cliente, ativo } = req.body || {};
    if (!nome || !email || !senha || !perfil || !cliente) {
      return res.status(400).json({ ok: false, message: "Preencha todos os campos obrigatórios" });
    }

    const [exists] = await pool.query("SELECT id FROM usuarios WHERE email = ? LIMIT 1", [email]);
    if (exists.length > 0) return res.status(400).json({ ok: false, message: "Já existe usuário com esse e-mail" });

    const [result] = await pool.query(
      "INSERT INTO usuarios (nome, email, senha, perfil, cliente, ativo) VALUES (?, ?, ?, ?, ?, ?)",
      [nome, email, senha, perfil, cliente, ativo ?? true]
    );

    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao criar usuário", error: error.message });
  }
}
