const express = require("express");
const router = express.Router();
const pool = require("../lib/db");
const bcrypt = require("bcryptjs");
const { signToken } = require("../middlewares/auth");

router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body || {};

    if (!email || !senha) {
      return res.status(400).json({ message: "Informe e-mail e senha" });
    }

    const [rows] = await pool.query(
      "SELECT * FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Usuário não encontrado" });
    }

    const user = rows[0];

    if (Number(user.ativo) === 0) {
      return res.status(403).json({ message: "Usuário inativo" });
    }

    let senhaValida = false;

    // 1. Tenta validar via bcryptjs (caso a senha já tenha sido convertida em hash)
    try {
      senhaValida = await bcrypt.compare(senha, user.senha);
    } catch (e) {
      senhaValida = false;
    }

    // 2. Fallback de compatibilidade para senhas antigas em texto plano
    if (!senhaValida && String(user.senha) === String(senha)) {
      senhaValida = true;
      const saltRounds = 10;
      const novoHash = await bcrypt.hash(senha, saltRounds);
      await pool.query("UPDATE usuarios SET senha = ? WHERE id = ?", [novoHash, user.id]);
    }

    if (!senhaValida) {
      return res.status(401).json({ message: "Senha incorreta" });
    }

    const token = signToken({
      id: user.id,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil || "instrutor",
      cliente: user.cliente || "",
      pode_acessar_oceano_desenvolvimento: Number(user.pode_acessar_oceano_desenvolvimento || 0),
    });

    return res.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        perfil: user.perfil || "instrutor",
        cliente: user.cliente || "",
        troca_senha_obrigatoria: !!user.troca_senha_obrigatoria,
        pode_acessar_oceano_desenvolvimento: Number(user.pode_acessar_oceano_desenvolvimento || 0),
      },
    });
  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({
      message: "Erro ao realizar login",
      error: error.message,
    });
  }
});

router.post("/alterar-senha", async (req, res) => {
  try {
    const { email, novaSenha } = req.body || {};

    if (!email || !novaSenha) {
      return res.status(400).json({ message: "Informe e-mail e nova senha" });
    }

    const saltRounds = 10;
    const senhaHash = await bcrypt.hash(novaSenha, saltRounds);

    await pool.query(
      "UPDATE usuarios SET senha = ?, troca_senha_obrigatoria = 0 WHERE email = ?",
      [senhaHash, email]
    );

    return res.json({ message: "Senha alterada com sucesso" });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    return res.status(500).json({
      message: "Erro ao alterar senha",
      error: error.message,
    });
  }
});

module.exports = router;
