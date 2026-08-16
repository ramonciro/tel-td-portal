/**
 * authController.js
 *
 * Sprint 1 — Fix:
 *   - Adicionado empresa_id ao SELECT do login
 *   - Adicionado empresa_id ao payload do JWT
 *   - Adicionado empresa_id à resposta do login (usado pelo frontend para
 *     exibir o ambiente e filtrar dados)
 *   - Adicionado pode_acessar_oceano_desenvolvimento ao token
 *     (estava no SELECT mas não era incluído no JWT)
 *   - Adicionado nome ao JWT (necessário para o clientMiddleware e para
 *     rastrear o usuário logado em logs/auditoria)
 *   - Alterado: senha agora é comparada com bcrypt corretamente
 *     (era vulnerável se o hash não existisse — adicionado guard)
 */

import bcrypt from "bcryptjs";
import jwt    from "jsonwebtoken";
import pool   from "../db.js";

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
      return res.status(400).json({ ok: false, message: "Informe e-mail e senha." });
    }

    // Sprint 1: inclui empresa_id e pode_acessar_oceano_desenvolvimento na query
    const [rows] = await pool.query(
      `SELECT
         id, nome, email, senha, perfil, cliente, ativo,
         troca_senha_obrigatoria,
         pode_acessar_oceano_desenvolvimento,
         empresa_id
       FROM usuarios
       WHERE LOWER(email) = LOWER(?)
       LIMIT 1`,
      [email.trim()]
    );

    const user = rows[0];

    if (!user) {
      return res.status(401).json({ ok: false, message: "Usuário ou senha inválidos." });
    }

    if (Number(user.ativo) === 0) {
      return res.status(403).json({ ok: false, message: "Usuário inativo. Fale com o administrador." });
    }

    // Guard: se não há hash cadastrado, bloqueia (não compara string vazia com bcrypt)
    if (!user.senha) {
      return res.status(401).json({ ok: false, message: "Usuário sem senha configurada." });
    }

    const senhaOk = await bcrypt.compare(senha, user.senha);
    if (!senhaOk) {
      return res.status(401).json({ ok: false, message: "Usuário ou senha inválidos." });
    }

    const clienteSelecionado = ambiente || user.cliente || "Geral";
    const secret = getJwtSecret();

    // Sprint 1: JWT inclui empresa_id, nome e pode_acessar_oceano_desenvolvimento
    const token = jwt.sign(
      {
        id:     user.id,
        nome:   user.nome,
        email:  user.email,
        perfil: user.perfil,
        cliente: clienteSelecionado,
        empresa_id: user.empresa_id ?? null,
        pode_acessar_oceano_desenvolvimento: user.pode_acessar_oceano_desenvolvimento ?? 0,
      },
      secret,
      { expiresIn: "8h" }
    );

    return res.json({
      ok: true,
      token,
      user: {
        id:     user.id,
        nome:   user.nome,
        email:  user.email,
        perfil: user.perfil,
        cliente: clienteSelecionado,
        empresa_id: user.empresa_id ?? null,
        troca_senha_obrigatoria:             user.troca_senha_obrigatoria,
        pode_acessar_oceano_desenvolvimento: user.pode_acessar_oceano_desenvolvimento,
      },
    });

  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({ ok: false, message: "Erro ao realizar login.", error: error.message });
  }
}

/**
 * changePassword — troca de senha do próprio usuário (obrigatória no primeiro acesso)
 * Recebe: { senha_atual, nova_senha }
 */
export async function changePassword(req, res) {
  try {
    const { senha_atual, nova_senha } = req.body || {};
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ ok: false, message: "Não autenticado." });
    if (!senha_atual || !nova_senha)
      return res.status(400).json({ ok: false, message: "Informe a senha atual e a nova senha." });
    if (nova_senha.length < 6)
      return res.status(400).json({ ok: false, message: "A nova senha deve ter ao menos 6 caracteres." });

    const [rows] = await pool.query("SELECT senha FROM usuarios WHERE id = ? LIMIT 1", [userId]);
    const user = rows[0];

    if (!user) return res.status(404).json({ ok: false, message: "Usuário não encontrado." });

    const senhaOk = await bcrypt.compare(senha_atual, user.senha || "");
    if (!senhaOk)
      return res.status(401).json({ ok: false, message: "Senha atual incorreta." });

    const novoHash = await bcrypt.hash(nova_senha, 12);
    await pool.query(
      "UPDATE usuarios SET senha = ?, troca_senha_obrigatoria = 0 WHERE id = ?",
      [novoHash, userId]
    );

    return res.json({ ok: true, message: "Senha alterada com sucesso." });
  } catch (error) {
    console.error("Erro ao trocar senha:", error);
    return res.status(500).json({ ok: false, message: "Erro ao trocar senha.", error: error.message });
  }
}
