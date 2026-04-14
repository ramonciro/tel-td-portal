const bcrypt = require("bcryptjs");
const pool = require("../lib/db");

const SENHA_PADRAO = "Tel@2026";

async function listUsers(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, nome, email, perfil, cliente, ativo, troca_senha_obrigatoria
      FROM usuarios ORDER BY nome ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao listar usuários", error: error.message });
  }
}

async function createUser(req, res) {
  try {
    const { nome, email, perfil, cliente, ativo } = req.body || {};

    if (!nome || !email || !perfil) {
      return res.status(400).json({ ok: false, message: "Preencha nome, e-mail e perfil" });
    }

    const senhaHash = await bcrypt.hash(SENHA_PADRAO, 10);

    const [result] = await pool.query(
      `INSERT INTO usuarios (nome, email, senha, perfil, cliente, ativo, troca_senha_obrigatoria)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [nome, email, senhaHash, perfil, cliente || null, ativo ? 1 : 0]
    );

    res.status(201).json({
      ok: true,
      id: result.insertId,
      senha_padrao: SENHA_PADRAO,
      message: "Usuário criado com senha padrão Tel@2026 e troca obrigatória no primeiro acesso",
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao criar usuário", error: error.message });
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { nome, email, perfil, cliente, ativo } = req.body || {};

    if (!nome || !email || !perfil) {
      return res.status(400).json({ ok: false, message: "Preencha nome, e-mail e perfil" });
    }

    await pool.query(
      `UPDATE usuarios SET nome = ?, email = ?, perfil = ?, cliente = ?, ativo = ? WHERE id = ?`,
      [nome, email, perfil, cliente || null, ativo ? 1 : 0, id]
    );

    res.json({ ok: true, message: "Usuário atualizado com sucesso" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao atualizar usuário", error: error.message });
  }
}

async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    // Proteção: não permite auto-exclusão
    if (String(id) === String(req.user?.id)) {
      return res.status(400).json({ ok: false, message: "Você não pode excluir seu próprio usuário" });
    }

    await pool.query("DELETE FROM usuarios WHERE id = ?", [id]);
    res.json({ ok: true, message: "Usuário excluído com sucesso" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao excluir usuário", error: error.message });
  }
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
