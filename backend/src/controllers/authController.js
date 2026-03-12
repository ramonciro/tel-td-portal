import jwt from "jsonwebtoken";
import pool from "../db.js";

export async function login(req, res) {
  try {
    const { email, senha } = req.body || {};

    if (!email || !senha) {
      return res.status(400).json({ ok: false, message: "Informe e-mail e senha" });
    }

    const [rows] = await pool.query(
      "SELECT id, nome, email, senha, perfil, cliente, ativo FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );

    const user = rows[0];

    if (!user) return res.status(401).json({ ok: false, message: "Usuário não encontrado" });
    if (!user.ativo) return res.status(401).json({ ok: false, message: "Usuário inativo" });
    if (String(user.senha) !== String(senha)) return res.status(401).json({ ok: false, message: "Senha inválida" });

    const token = jwt.sign(
      { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, cliente: user.cliente },
      process.env.JWT_SECRET || "teltd-secret",
      { expiresIn: "8h" }
    );

    return res.json({
      ok: true,
      token,
      user: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, cliente: user.cliente }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao realizar login", error: error.message });
  }
}
