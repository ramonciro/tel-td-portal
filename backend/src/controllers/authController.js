import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("🚨 ALERTA CRÍTICO: JWT_SECRET não configurado.");
    throw new Error("Erro interno de configuração.");
  }
  return secret;
};

export async function login(req, res) {
  try {
    const { email, senha, ambiente } = req.body || {};

    if (!email || !senha) {
      return res.status(400).json({ ok: false, message: "Informe e-mail e senha" });
    }

    // Ambiente padrão caso venha vazio
    const clienteSelecionado = ambiente || "Comércio";

    const [rows] = await pool.query(
      `SELECT id, nome, email, senha, perfil, cliente, ativo, troca_senha_obrigatoria
       FROM usuarios
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ ok: false, message: "Usuário ou senha inválidos" });
    }

    if (Number(user.ativo) === 0) {
      return res.status(403).json({ ok: false, message: "Usuário inativo" });
    }

    const senhaOk = await bcrypt.compare(senha, user.senha || "");
    if (!senhaOk) {
      return res.status(401).json({ ok: false, message: "Usuário ou senha inválidos" });
    }

    // Gerando o token JWT incluindo o tenant/cliente selecionado
    const secret = getJwtSecret();
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        perfil: user.perfil, 
        cliente: clienteSelecionado 
      },
      secret,
      { expiresIn: "8h" }
    );

    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        perfil: user.perfil,
        cliente: clienteSelecionado,
        troca_senha_obrigatoria: user.troca_senha_obrigatoria
      }
    });

  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({ ok: false, message: "Erro ao realizar login", error: error.message });
  }
}
