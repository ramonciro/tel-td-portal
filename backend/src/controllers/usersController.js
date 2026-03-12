import pool from "../db.js";

export async function listUsers(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT id, nome, email, perfil, cliente, ativo FROM usuarios ORDER BY id DESC"
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao listar usuários", error: error.message });
  }
}

export async function createUser(req, res) {
  try {
    const { nome, email, senha, perfil, cliente, ativo } = req.body || {};
    if (!nome || !email || !senha || !perfil || !cliente) {
      return res.status(400).json({ ok: false, message: "Preencha todos os campos obrigatórios" });
    }

    const [exists] = await pool.query("SELECT id FROM usuarios WHERE email = ? LIMIT 1", [email]);
    if (exists.length > 0) {
      return res.status(400).json({ ok: false, message: "Já existe usuário com esse e-mail" });
    }

    const [result] = await pool.query(
      "INSERT INTO usuarios (nome, email, senha, perfil, cliente, ativo) VALUES (?, ?, ?, ?, ?, ?)",
      [nome, email, senha, perfil, cliente, ativo ? 1 : 0]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao criar usuário", error: error.message });
  }
}

export async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { nome, email, senha, perfil, cliente, ativo } = req.body || {};

    if (!nome || !email || !perfil || !cliente) {
      return res.status(400).json({ ok: false, message: "Preencha os campos obrigatórios" });
    }

    if (senha) {
      await pool.query(
        "UPDATE usuarios SET nome = ?, email = ?, senha = ?, perfil = ?, cliente = ?, ativo = ? WHERE id = ?",
        [nome, email, senha, perfil, cliente, ativo ? 1 : 0, id]
      );
    } else {
      await pool.query(
        "UPDATE usuarios SET nome = ?, email = ?, perfil = ?, cliente = ?, ativo = ? WHERE id = ?",
        [nome, email, perfil, cliente, ativo ? 1 : 0, id]
      );
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao atualizar usuário", error: error.message });
  }
}

export async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM usuarios WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao excluir usuário", error: error.message });
  }
}
