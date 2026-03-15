const express = require("express");
const router = express.Router();
const pool = require("../lib/db");

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

    if (String(user.senha) !== String(senha)) {
      return res.status(401).json({ message: "Senha incorreta" });
    }

    return res.json({
      token: "teltd-token-simples",
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        perfil: user.perfil || "instrutor",
        cliente: user.cliente || "",
        troca_senha_obrigatoria: !!user.troca_senha_obrigatoria
      }
    });
  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({
      message: "Erro ao realizar login",
      error: error.message
    });
  }
});

router.post("/alterar-senha", async (req, res) => {
  try {
    const { email, novaSenha } = req.body || {};

    if (!email || !novaSenha) {
      return res.status(400).json({ message: "Informe e-mail e nova senha" });
    }

    await pool.query(
      "UPDATE usuarios SET senha = ?, troca_senha_obrigatoria = 0 WHERE email = ?",
      [novaSenha, email]
    );

    return res.json({ message: "Senha alterada com sucesso" });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    return res.status(500).json({
      message: "Erro ao alterar senha",
      error: error.message
    });
  }
});

module.exports = router;
