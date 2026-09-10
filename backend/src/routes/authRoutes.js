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
const { sendMail } = require("../services/mailer");

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

/* ─── AMBIENTES (seleção de empresa no login) ────────────────────────────── */
// Fase "arquitetura multi-ambiente" (10/09/2026): endpoint público (sem
// autenticação — roda ANTES do login) que alimenta o seletor de empresa na
// tela de entrada. Devolve só o que é seguro expor sem sessão: identidade
// visual (nome, código, logo, cor). Nunca inclui contato/observações/
// limites — esses só aparecem no painel admin, autenticado como super_admin.
router.get("/ambientes", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nome, codigo, logo_url, cor_primaria
       FROM empresas
       WHERE ativo = 1
       ORDER BY nome ASC`
    );
    return res.json(
      rows.map((e) => ({
        codigo: e.codigo || `empresa-${e.id}`,
        nome: e.nome,
        logo_url: e.logo_url || null,
        cor_primaria: e.cor_primaria || null,
      }))
    );
  } catch (error) {
    // Resiliente: se a tabela/coluna ainda não existir neste ambiente
    // (migration pendente), o seletor simplesmente fica vazio — o login por
    // e-mail/senha direto continua funcionando normalmente.
    console.warn("[auth] não foi possível listar ambientes:", error.message);
    return res.json([]);
  }
});

/* ─── LOGIN ─────────────────────────────────────────────────────────────── */
router.post("/login", async (req, res) => {
  try {
    const { email, senha, empresa_codigo } = req.body || {};

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

    // Fase "arquitetura multi-ambiente" (10/09/2026): se a tela de login
    // enviou uma empresa selecionada (empresa_codigo), confere que a conta
    // realmente pertence a ela — evita a confusão de "entrei errado no
    // ambiente da outra empresa" (o e-mail já é globalmente único, então
    // isso não é uma segunda camada de isolamento de dado, é clareza de UX:
    // erro específico em vez de um dashboard vazio/errado depois de logar).
    // Super admin nunca é bloqueado por isso (ele não pertence a uma
    // empresa específica, por design). Um código de empresa desconhecido ou
    // uma tabela/coluna ainda sem a migration aplicada nunca bloqueia login
    // — a checagem é só feita quando dá pra fazer com segurança.
    if (empresa_codigo && !isSuperAdmin) {
      try {
        const [empRows] = await pool.query(
          "SELECT id, nome FROM empresas WHERE codigo = ? LIMIT 1",
          [String(empresa_codigo).trim().toLowerCase()]
        );
        const empresaSelecionada = empRows[0];
        if (empresaSelecionada) {
          const empresaIdUsuario = user.empresa_id ?? null;
          if (empresaIdUsuario == null) {
            return res.status(403).json({
              message: "Sua conta ainda não está vinculada a nenhuma empresa. Contate o coordenador do seu ambiente.",
            });
          }
          if (Number(empresaIdUsuario) !== Number(empresaSelecionada.id)) {
            registrarTentativaFalha(emailNorm);
            return res.status(403).json({
              message: `Este e-mail não pertence ao ambiente "${empresaSelecionada.nome}". Verifique se selecionou a empresa certa.`,
            });
          }
        }
      } catch (error) {
        console.warn("[auth] checagem de empresa_codigo ignorada:", error.message);
      }
    }

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

    // Fase "arquitetura multi-ambiente" (10/09/2026, parte 2): a marca da
    // empresa (nome, cor, logo) volta junto do login pra o PortalShell
    // aplicar no resto do portal — antes só a tela de login usava isso (via
    // /auth/ambientes), então o menu/cabeçalho continuavam sempre com a
    // identidade padrão do Tel T&D, não importa de qual empresa a pessoa
    // era. Fica só na resposta do login (guardado junto do resto de "user"
    // no localStorage do front) — nunca no JWT, que não precisa carregar
    // dado de apresentação em toda requisição autenticada. Super admin não
    // pertence a uma empresa específica, então nunca tem branding próprio.
    let empresaBranding = null;
    if (!isSuperAdmin && user.empresa_id) {
      try {
        const [empRows] = await pool.query(
          "SELECT nome, cor_primaria, logo_url FROM empresas WHERE id = ? LIMIT 1",
          [user.empresa_id]
        );
        if (empRows[0]) {
          empresaBranding = {
            nome: empRows[0].nome || null,
            cor_primaria: empRows[0].cor_primaria || null,
            logo_url: empRows[0].logo_url || null,
          };
        }
      } catch (error) {
        // Resiliente a migration pendente (empresas.cor_primaria/logo_url) —
        // sem branding, o portal só usa a identidade padrão, como sempre fez.
        console.warn("[auth] não foi possível carregar marca da empresa:", error.message);
      }
    }

    return res.json({
      token,
      user: {
        id:         user.id,
        nome:       user.nome,
        email:      user.email,
        perfil:     perfilFinal,
        cliente:    user.cliente || "",
        empresa_id: isSuperAdmin ? null : (user.empresa_id ?? null),
        empresa:    empresaBranding,
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
// Sprint 3: gerava token de 1h e devolvia direto na resposta (só porque não
// havia SMTP ainda) — isso permitia qualquer um redefinir a senha de
// qualquer e-mail cadastrado sem nunca ter acesso à caixa de entrada dele
// (falha de segurança). Fase 2 (Sprint 4, pós-SMTP): o token agora só viaja
// por e-mail (via services/mailer.js) e NUNCA mais volta na resposta HTTP —
// nem mesmo em modo dev (SMTP não configurado), onde o mailer só loga no
// console do servidor.
router.post("/esqueci-senha", async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ ok: false, message: "Informe o e-mail cadastrado." });
    }

    // Resposta sempre genérica — evita enumeração de e-mails cadastrados,
    // esteja o e-mail cadastrado ou não.
    const respostaGenerica = {
      ok: true,
      message: "Se o e-mail informado estiver cadastrado, enviaremos um link de redefinição de senha.",
    };

    const [rows] = await pool.query(
      "SELECT id, nome, email FROM usuarios WHERE LOWER(email) = LOWER(?) AND ativo = 1 LIMIT 1",
      [email.trim()]
    );

    if (!rows.length) {
      return res.json(respostaGenerica);
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

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3001").replace(/\/$/, "");
    const link = `${frontendUrl}/redefinir-senha?token=${token}`;

    await sendMail({
      to: user.email,
      subject: "Redefinição de senha — Portal T&D",
      text:
        `Olá, ${user.nome}.\n\n` +
        `Recebemos uma solicitação para redefinir sua senha no Portal T&D.\n\n` +
        `Acesse o link abaixo para criar uma nova senha (válido por 1 hora):\n${link}\n\n` +
        `Se você não solicitou isso, ignore este e-mail — sua senha permanece a mesma.`,
      html: `
        <p>Olá, ${user.nome}.</p>
        <p>Recebemos uma solicitação para redefinir sua senha no <strong>Portal T&amp;D</strong>.</p>
        <p>
          <a href="${link}" style="background:#D97706;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">
            Redefinir minha senha
          </a>
        </p>
        <p>Ou copie e cole este link no navegador (válido por 1 hora):<br>${link}</p>
        <p style="color:#64748b;font-size:13px;">Se você não solicitou isso, ignore este e-mail — sua senha permanece a mesma.</p>
      `,
    });

    return res.json(respostaGenerica);
  } catch (error) {
    console.error("Erro em esqueci-senha:", error);
    return res.status(500).json({ ok: false, message: "Erro ao processar solicitação." });
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
