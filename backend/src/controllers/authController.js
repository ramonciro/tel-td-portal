const bcrypt = require("bcryptjs");
const pool = require("../lib/db");
const { signToken } = require("../middlewares/auth");

async function login(req, res) {
  try {
    const { email, senha } = req.body || {};

    if (!email || !senha) {
      return res.status(400).json({ ok: false, message: "Informe e-mail e senha" });
    }

    const [rows] = await pool.query(
      `SELECT id, nome, email, senha, perfil, cliente, ativo, troca_senha_obrigatoria,
              pode_acessar_oceano_desenvolvimento
       FROM usuarios WHERE email = ? LIMIT 1`,
      [email]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ ok: false, message: "Usuário ou senha inválidos" });
    }

    if (Number(user.ativo) === 0) {
      return res.status(403).json({ ok: false, message: "Usuário inativo" });
    }

    // Suporta senha em hash (bcrypt) ou texto puro (legado — admin inicial)
    let senhaOk = false;
    if (String(user.senha).startsWith("$2")) {
      senhaOk = await bcrypt.compare(senha, user.senha);
    } else {
      senhaOk = String(user.senha) === String(senha);
    }

    if (!senhaOk) {
      return res.status(401).json({ ok: false, message: "Usuário ou senha inválidos" });
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
      ok: true,
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        perfil: user.perfil || "instrutor",
        cliente: user.cliente || "",
        ativo: !!user.ativo,
        troca_senha_obrigatoria: !!user.troca_senha_obrigatoria,
        pode_acessar_oceano_desenvolvimento: Number(user.pode_acessar_oceano_desenvolvimento || 0),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao realizar login", error: error.message });
  }
}

async function alterarSenhaPrimeiroAcesso(req, res) {
  try {
    const { email, senha_atual, nova_senha } = req.body || {};

    if (!email || !senha_atual || !nova_senha) {
      return res.status(400).json({ ok: false, message: "Preencha e-mail, senha atual e nova senha" });
    }

    if (String(nova_senha).length < 6) {
      return res.status(400).json({ ok: false, message: "A nova senha deve ter pelo menos 6 caracteres" });
    }

    const [rows] = await pool.query(
      `SELECT id, email, senha, troca_senha_obrigatoria FROM usuarios WHERE email = ? LIMIT 1`,
      [email]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({ ok: false, message: "Usuário não encontrado" });
    }

    let senhaOk = false;
    if (String(user.senha).startsWith("$2")) {
      senhaOk = await bcrypt.compare(senha_atual, user.senha);
    } else {
      senhaOk = String(user.senha) === String(senha_atual);
    }

    if (!senhaOk) {
      return res.status(401).json({ ok: false, message: "Senha atual inválida" });
    }

    const novaHash = await bcrypt.hash(nova_senha, 10);

    await pool.query(
      `UPDATE usuarios SET senha = ?, troca_senha_obrigatoria = 0 WHERE id = ?`,
      [novaHash, user.id]
    );

    return res.json({ ok: true, message: "Senha alterada com sucesso" });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao alterar senha", error: error.message });
  }
}

module.exports = { login, alterarSenhaPrimeiroAcesso };
