const express  = require('express');
const router   = express.Router();
const pool     = require('../lib/db');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const { signToken } = require('../middlewares/auth');

/* ─── LOGIN ─────────────────────────────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body || {};

    if (!email || !senha) {
      return res.status(400).json({ message: 'Informe e-mail e senha' });
    }

    const [rows] = await pool.query(
      `SELECT id, nome, email, senha, perfil, cliente, ativo,
              troca_senha_obrigatoria, pode_acessar_oceano_desenvolvimento,
              empresa_id
       FROM usuarios WHERE email = ? LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ message: 'Usuário não encontrado' });
    }

    const user = rows[0];

    if (Number(user.ativo) === 0) {
      return res.status(403).json({ message: 'Usuário inativo' });
    }

    let senhaValida = false;

    try {
      senhaValida = await bcrypt.compare(senha, user.senha);
    } catch (_) {
      senhaValida = false;
    }

    // Fallback: senha em texto plano (migração antiga) → converte para hash
    if (!senhaValida && String(user.senha) === String(senha)) {
      senhaValida = true;
      const novoHash = await bcrypt.hash(senha, 10);
      await pool.query('UPDATE usuarios SET senha = ? WHERE id = ?', [novoHash, user.id]);
    }

    if (!senhaValida) {
      return res.status(401).json({ message: 'Senha incorreta' });
    }

    const token = signToken({
      id:      user.id,
      nome:    user.nome,
      email:   user.email,
      perfil:  user.perfil || 'instrutor',
      cliente: user.cliente || '',
      empresa_id: user.empresa_id ?? null,
      pode_acessar_oceano_desenvolvimento: Number(user.pode_acessar_oceano_desenvolvimento || 0),
    });

    return res.json({
      token,
      user: {
        id:      user.id,
        nome:    user.nome,
        email:   user.email,
        perfil:  user.perfil || 'instrutor',
        cliente: user.cliente || '',
        empresa_id: user.empresa_id ?? null,
        troca_senha_obrigatoria:             !!user.troca_senha_obrigatoria,
        pode_acessar_oceano_desenvolvimento: Number(user.pode_acessar_oceano_desenvolvimento || 0),
      },
    });
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ message: 'Erro ao realizar login', error: error.message });
  }
});

/* ─── ALTERAR SENHA (primeiro acesso / forçada) ─────────────────────────────── */
router.post('/alterar-senha', async (req, res) => {
  try {
    const { email, novaSenha } = req.body || {};

    if (!email || !novaSenha) {
      return res.status(400).json({ message: 'Informe e-mail e nova senha' });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    await pool.query(
      'UPDATE usuarios SET senha = ?, troca_senha_obrigatoria = 0 WHERE email = ?',
      [senhaHash, email]
    );

    return res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return res.status(500).json({ message: 'Erro ao alterar senha', error: error.message });
  }
});

/* ─── ESQUECI MINHA SENHA ───────────────────────────────────────────────────── */
// Sprint 3: gera token com validade de 1h.
// Por enquanto retorna o token na resposta (ambiente interno / sem SMTP).
// Sprint 4: substituir pelo envio via nodemailer quando SMTP estiver configurado.
router.post('/esqueci-senha', async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ ok: false, message: 'Informe o e-mail cadastrado.' });
    }

    const [rows] = await pool.query(
      "SELECT id, nome FROM usuarios WHERE LOWER(email) = LOWER(?) AND ativo = 1 LIMIT 1",
      [email.trim()]
    );

    // Responde OK mesmo se não encontrar (evita enumeração de e-mails)
    if (!rows.length) {
      return res.json({
        ok: true,
        message: 'Se o e-mail existir no sistema, um token de redefinição será gerado.',
      });
    }

    const user  = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    // Invalida tokens anteriores não utilizados
    await pool.query(
      "UPDATE password_reset_tokens SET usado = 1 WHERE usuario_id = ? AND usado = 0",
      [user.id]
    );

    await pool.query(
      "INSERT INTO password_reset_tokens (usuario_id, token, expira_em) VALUES (?, ?, ?)",
      [user.id, token, expira]
    );

    // TODO Sprint 4: enviar link por email via nodemailer
    // const link = `${process.env.FRONTEND_URL}/redefinir-senha?token=${token}`;
    // await sendMail({ to: email, subject: 'Redefinição de senha', html: `<a href="${link}">Clique aqui</a>` });

    return res.json({
      ok:         true,
      message:    'Token gerado. Use-o para redefinir sua senha.',
      token,                          // ← remover quando email estiver configurado
      expira_em:  expira.toISOString(),
    });
  } catch (error) {
    console.error('Erro em esqueci-senha:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao gerar token de redefinição.' });
  }
});

/* ─── REDEFINIR SENHA (via token) ───────────────────────────────────────────── */
router.post('/redefinir-senha', async (req, res) => {
  try {
    const { token, nova_senha } = req.body || {};

    if (!token || !nova_senha) {
      return res.status(400).json({ ok: false, message: 'Token e nova senha são obrigatórios.' });
    }

    if (nova_senha.length < 6) {
      return res.status(400).json({ ok: false, message: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }

    const [rows] = await pool.query(
      `SELECT prt.id, prt.usuario_id, u.email
       FROM password_reset_tokens prt
       JOIN usuarios u ON u.id = prt.usuario_id
       WHERE prt.token = ? AND prt.usado = 0 AND prt.expira_em > NOW()
       LIMIT 1`,
      [token]
    );

    if (!rows.length) {
      return res.status(400).json({ ok: false, message: 'Token inválido ou expirado. Solicite um novo.' });
    }

    const record    = rows[0];
    const novoHash  = await bcrypt.hash(nova_senha, 10);

    await pool.query(
      'UPDATE usuarios SET senha = ?, troca_senha_obrigatoria = 0 WHERE id = ?',
      [novoHash, record.usuario_id]
    );

    // Marca token como usado (não pode ser reutilizado)
    await pool.query(
      'UPDATE password_reset_tokens SET usado = 1 WHERE id = ?',
      [record.id]
    );

    return res.json({ ok: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
  } catch (error) {
    console.error('Erro em redefinir-senha:', error);
    return res.status(500).json({ ok: false, message: 'Erro ao redefinir senha.' });
  }
});

module.exports = router;
