/**
 * authRoutes.js
 *
 * Hotfix (incluído no Sprint 4):
 *   - Login voltou a usar SELECT * (como o original) em vez de listar
 *     colunas explicitamente. A versão do Sprint 3 listava empresa_id
 *     explicitamente — se a migration do Sprint 1 ainda não tiver sido
 *     aplicada, a coluna não existe e o MySQL lança
 *     "Unknown column 'empresa_id'" → 500 "Erro ao realizar login".
 *   - Usando SELECT *, o resultado inclui o que existir no schema real,
 *     e o código acessa empresa_id / super_admin com fallback gracioso.
 *
 * Sprint 3: adicionadas rotas /esqueci-senha e /redefinir-senha
 * Sprint 4: super_admin flag no JWT, perfil forçado para 'super_admin'
 */

const express = require("express");
const router  = express.Router();
const pool    = require("../lib/db");
const bcrypt  = require("bcryptjs");
const crypto  = require("crypto");
const { signToken } = require("../middlewares/auth");

/* ─── LOGIN ─────────────────────────────────────────────────────────────── */
router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body || {};

    if (!email || !senha) {
      return res.status(400).json({ message: "Informe e-mail e senha" });
    }

    // SELECT * — resiliente a migrations pendentes (empresa_id, super_admin
    // serão undefined se as colunas ainda não existirem; tratados com ??)
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

    try {
      senhaValida = await bcrypt.compare(senha, user.senha);
    } catch (_) {
      senhaValida = false;
    }

    // Fallback: senha em texto plano (legado) → converte para hash
    if (!senhaValida && String(user.senha) === String(senha)) {
      senhaValida = true;
      const novoHash = await bcrypt.hash(senha, 10);
      await pool.query("UPDATE usuarios SET senha = ? WHERE id = ?", [novoHash, user.id]);
    }

    if (!senhaValida) {
      return res.status(401).json({ message: "Senha incorreta" });
    }

    // Sprint 4: super_admin flag — se coluna não existir, cai no default 0
    const isSuperAdmin = Number(user.super_admin || 0) === 1;
    const perfilFinal  = isSuperAdmin ? "super_admin" : (user.perfil || "instrutor");

    const token = signToken({
      id:         user.id,
      nome:       user.nome,
      email:      user.email,
      perfil:     perfilFinal,
      cliente:    user.cliente || "",
      empresa_id: isSuperAdmin ? null : (user.empresa_id ?? null),
      super_admin: isSuperAdmin ? 1 : 0,
      pode_acessar_oceano_desenvolvimento: Number(user.pode_acessar_oceano_desenvolvimento || 0),
    });

    return res.json({
      token,
      user: {
        id:         user.id,
        nome:       user.nome,
        email:      user.email,
        perfil:     perfilFinal,
        cliente:    user.cliente || "",
        empresa_id: isSuperAdmin ? null : (user.empresa_id ?? null),
        super_admin: isSuperAdmin ? 1 : 0,
        troca_senha_obrigatoria:             !!user.troca_senha_obrigatoria,
        pode_acessar_oceano_desenvolvimento: Number(user.pode_acessar_oceano_desenvolvimento || 0),
      },
    });
  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({ message: "Erro ao realizar login", error: error.message });
  }
});

/* ─── ALTERAR SENHA (primeiro acesso / forçada) ─────────────────────────── */
router.post("/alterar-senha", async (req, res) => {
  try {
    const { email, novaSenha } = req.body || {};

    if (!email || !novaSenha) {
      return res.status(400).json({ message: "Informe e-mail e nova senha" });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    await pool.query(
      "UPDATE usuarios SET senha = ?, troca_senha_obrigatoria = 0 WHERE email = ?",
      [senhaHash, email]
    );

    return res.json({ message: "Senha alterada com sucesso" });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    return res.status(500).json({ message: "Erro ao alterar senha", error: error.message });
  }
});

/* ─── ESQUECI MINHA SENHA ───────────────────────────────────────────────── */
// Sprint 3: gera token de 1h — retornado na resposta enquanto SMTP não existe.
// Sprint 4 (futuro): substituir por envio via nodemailer quando SMTP configurado.
router.post("/esqueci-senha", async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ ok: false, message: "Informe o e-mail cadastrado." });
    }

    const [rows] = await pool.query(
      "SELECT id, nome FROM usuarios WHERE LOWER(email) = LOWER(?) AND ativo = 1 LIMIT 1",
      [email.trim()]
    );

    // Responde OK mesmo sem encontrar (evita enumeração de e-mails)
    if (!rows.length) {
      return res.json({ ok: true, message: "Se o e-mail existir, um token será gerado." });
    }

    const user   = rows[0];
    const token  = crypto.randomBytes(32).toString("hex");
    const expira = new Date(Date.now() + 60 * 60 * 1000); // 1h

    // Invalida tokens anteriores não utilizados
    await pool.query(
      "UPDATE password_reset_tokens SET usado = 1 WHERE usuario_id = ? AND usado = 0",
      [user.id]
    );
    await pool.query(
      "INSERT INTO password_reset_tokens (usuario_id, token, expira_em) VALUES (?, ?, ?)",
      [user.id, token, expira]
    );

    // TODO Sprint 4 pós-SMTP: enviar link por email e remover token da resposta
    return res.json({
      ok:        true,
      message:   "Token gerado. Use-o para redefinir sua senha.",
      token,
      expira_em: expira.toISOString(),
    });
  } catch (error) {
    console.error("Erro em esqueci-senha:", error);
    return res.status(500).json({ ok: false, message: "Erro ao gerar token." });
  }
});

/* ─── REDEFINIR SENHA (via token) ───────────────────────────────────────── */
router.post("/redefinir-senha", async (req, res) => {
  try {
    const { token, nova_senha } = req.body || {};

    if (!token || !nova_senha) {
      return res.status(400).json({ ok: false, message: "Token e nova senha são obrigatórios." });
    }
    if (nova_senha.length < 6) {
      return res.status(400).json({ ok: false, message: "A senha deve ter pelo menos 6 caracteres." });
    }

    const [rows] = await pool.query(
      `SELECT prt.id, prt.usuario_id
       FROM password_reset_tokens prt
       WHERE prt.token = ? AND prt.usado = 0 AND prt.expira_em > NOW()
       LIMIT 1`,
      [token]
    );

    if (!rows.length) {
      return res.status(400).json({ ok: false, message: "Token inválido ou expirado." });
    }

    const record   = rows[0];
    const novoHash = await bcrypt.hash(nova_senha, 10);

    await pool.query(
      "UPDATE usuarios SET senha = ?, troca_senha_obrigatoria = 0 WHERE id = ?",
      [novoHash, record.usuario_id]
    );
    await pool.query(
      "UPDATE password_reset_tokens SET usado = 1 WHERE id = ?",
      [record.id]
    );

    return res.json({ ok: true, message: "Senha redefinida. Faça login com a nova senha." });
  } catch (error) {
    console.error("Erro em redefinir-senha:", error);
    return res.status(500).json({ ok: false, message: "Erro ao redefinir senha." });
  }
});

module.exports = router;
