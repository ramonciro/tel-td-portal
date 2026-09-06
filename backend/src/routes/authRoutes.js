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
const { signToken, authRequired } = require("../middlewares/auth");

/* ─── RATE LIMITING (login) ─────────────────────────────────────────────── */
// Melhoria: antes não havia nenhum limite de tentativas — dava pra tentar
// adivinhar a senha de um e-mail conhecido indefinidamente. Bloqueio simples
// em memória por e-mail (não substitui um rate-limit por IP/infra, mas cobre
// o caso mais comum). Limitação conhecida: reseta a cada deploy/restart e
// não é compartilhado entre múltiplas instâncias — aceitável pro volume
// deste portal; se isso crescer, migrar pra Redis ou uma tabela no banco.
const tentativasLogin = new Map(); // email normalizado -> { count, bloqueadoAte }
const LOGIN_MAX_TENTATIVAS = 5;
const LOGIN_BLOQUEIO_MS = 15 * 60 * 1000; // 15 minutos

function minutosBloqueioRestantes(emailNorm) {
  const registro = tentativasLogin.get(emailNorm);
  if (registro?.bloqueadoAte && registro.bloqueadoAte > Date.now()) {
    return Math.ceil((registro.bloqueadoAte - Date.now()) / 60000);
  }
  return 0;
}

function registrarTentativaFalha(emailNorm) {
  const registro = tentativasLogin.get(emailNorm) || { count: 0, bloqueadoAte: 0 };
  registro.count += 1;
  if (registro.count >= LOGIN_MAX_TENTATIVAS) {
    registro.bloqueadoAte = Date.now() + LOGIN_BLOQUEIO_MS;
    registro.count = 0;
  }
  tentativasLogin.set(emailNorm, registro);
}

function limparTentativas(emailNorm) {
  tentativasLogin.delete(emailNorm);
}

/* ─── LOGIN ─────────────────────────────────────────────────────────────── */
router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body || {};

    if (!email || !senha) {
      return res.status(400).json({ message: "Informe e-mail e senha" });
    }

    const emailNorm = String(email).trim().toLowerCase();

    const bloqueioRestante = minutosBloqueioRestantes(emailNorm);
    if (bloqueioRestante > 0) {
      return res.status(429).json({
        message: `Muitas tentativas de login. Tente novamente em ${bloqueioRestante} minuto(s).`,
      });
    }

    // SELECT * — resiliente a migrations pendentes (empresa_id, super_admin
    // serão undefined se as colunas ainda não existirem; tratados com ??)
    // Bugfix: era "WHERE email = ?" (sensível a maiúsculas/minúsculas) — um
    // e-mail cadastrado com uma letra maiúscula diferente da digitada dava
    // "Usuário não encontrado" mesmo com senha certa. "esqueci-senha" logo
    // abaixo já usa LOWER(email) — login ficou de fora até agora.
    const [rows] = await pool.query(
      "SELECT * FROM usuarios WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [emailNorm]
    );

    // Melhoria: mensagem unificada pra "usuário não encontrado" e "senha
    // incorreta" — antes eram mensagens distintas, o que ajuda quem tenta
    // adivinhar e-mails cadastrados por tentativa e erro.
    if (!rows.length) {
      registrarTentativaFalha(emailNorm);
      return res.status(401).json({ message: "E-mail ou senha inválidos" });
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
      registrarTentativaFalha(emailNorm);
      return res.status(401).json({ message: "E-mail ou senha inválidos" });
    }

    limparTentativas(emailNorm);

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

/* ─── ALTERAR SENHA (primeiro acesso / forçada / configurações) ─────────── */
// Fix de segurança: antes esta rota era pública e aceitava qualquer e-mail
// no body, permitindo que qualquer pessoa trocasse a senha de qualquer
// usuário sem autenticação (account takeover). Agora exige token válido
// (authRequired) e nunca confia no e-mail vindo do body — o alvo é sempre
// o próprio usuário autenticado (req.user.id).
//
// Duas situações são aceitas:
//   1) Usuário informa "senhaAtual" (tela "Alterar senha" nas configurações)
//      → validada via bcrypt antes de trocar.
//   2) Usuário está em troca_senha_obrigatoria = 1 (primeiro acesso) e não
//      informa "senhaAtual" → permitido, pois ele já provou a senha
//      temporária ao fazer login (é isso que gerou o token usado aqui).
router.post("/alterar-senha", authRequired, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body || {};
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }
    if (!novaSenha || String(novaSenha).length < 6) {
      return res.status(400).json({ message: "Informe uma nova senha com pelo menos 6 caracteres." });
    }

    const [rows] = await pool.query("SELECT * FROM usuarios WHERE id = ? LIMIT 1", [userId]);
    if (!rows.length) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }
    const user = rows[0];
    const precisaTrocarSenha = Number(user.troca_senha_obrigatoria || 0) === 1;

    if (senhaAtual) {
      let senhaValida = false;
      try {
        senhaValida = await bcrypt.compare(senhaAtual, user.senha);
      } catch (_) {
        senhaValida = false;
      }
      // Fallback: senha em texto plano (legado)
      if (!senhaValida && String(user.senha) === String(senhaAtual)) {
        senhaValida = true;
      }
      if (!senhaValida) {
        return res.status(401).json({ message: "Senha atual incorreta." });
      }
    } else if (!precisaTrocarSenha) {
      return res.status(400).json({ message: "Informe a senha atual para alterá-la." });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    await pool.query(
      "UPDATE usuarios SET senha = ?, troca_senha_obrigatoria = 0 WHERE id = ?",
      [senhaHash, userId]
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
