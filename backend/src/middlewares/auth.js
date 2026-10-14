const jwt = require("jsonwebtoken");

// 1. Função auxiliar para buscar o Segredo de forma rigorosa
const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("🚨 ALERTA CRÍTICO: Variável JWT_SECRET não definida no ambiente!");
    throw new Error("Erro interno de configuração de segurança. Acesso bloqueado.");
  }
  return secret;
};

// 2. Assinatura usando a biblioteca oficial
function signToken(payload, expiresInSeconds = 60 * 60 * 12) {
  const secret = getSecret();
  // jsonwebtoken aceita o tempo em segundos passando um número
  return jwt.sign(payload, secret, { expiresIn: expiresInSeconds });
}

// Conta inativada passa a valer na hora: o token dura 12h e antes continuava
// funcionando até expirar mesmo depois de a conta ser desativada. Consulta o
// campo `ativo` com cache curto (30s por usuário) para não pesar em cada
// requisição; se a consulta falhar, NÃO bloqueia (mantém o comportamento
// anterior) — só barra quando a conta existe e está explicitamente inativa.
const CACHE_ATIVO_MS = 30 * 1000;
const cacheAtivo = new Map(); // id -> { ativo, expira }

async function contaEstaInativa(userId) {
  if (!userId) return false;
  const agora = Date.now();
  const c = cacheAtivo.get(userId);
  if (c && c.expira > agora) return c.inativa;
  try {
    const pool = require("../lib/db");
    const [rows] = await pool.query("SELECT ativo FROM usuarios WHERE id = ? LIMIT 1", [userId]);
    const inativa = rows.length > 0 && rows[0].ativo !== null && Number(rows[0].ativo) === 0;
    cacheAtivo.set(userId, { inativa, expira: agora + CACHE_ATIVO_MS });
    if (cacheAtivo.size > 5000) cacheAtivo.clear();
    return inativa;
  } catch (e) {
    return false;
  }
}

// 3. Middleware de proteção das rotas
async function authRequired(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({
        ok: false,
        message: "Token ausente",
      });
    }

    const secret = getSecret();
    // jwt.verify já verifica assinatura e expiração automaticamente
    const decoded = jwt.verify(token, secret);
    req.user = decoded;

    if (await contaEstaInativa(decoded?.id)) {
      return res.status(401).json({
        ok: false,
        message: "Conta inativa. Procure a coordenação.",
      });
    }

    return next();
  } catch (error) {
    console.error("[auth]", error.message || error);
    return res.status(401).json({
      ok: false,
      message: "Token inválido ou expirado"});
  }
}

// Módulo Metodologia e Desenvolvimento (16/09/2026): Mapa de Desenvolvimento
// e Trilhas viraram um módulo à parte, fora do escopo de Treinamento, com
// perfil dedicado — mesmo padrão do módulo R&S (ver "coordenador_rs"/
// "gestor_rs" em index.js). O controle antigo (hasOceanAccess/
// authorizeOceanAccess: perfil coordenador/superintendente + flag
// pode_acessar_oceano_desenvolvimento) foi substituído por
// authorizeRoles("metodologia") direto nas rotas — sem flag, sem perfis
// emprestados de Treinamento. A coluna pode_acessar_oceano_desenvolvimento
// continua existindo no banco (inofensiva, não é mais lida em lugar nenhum).

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    try {
      const perfil = String(req.user?.perfil || "").toLowerCase();

      if (!perfil) {
        return res.status(401).json({
          ok: false,
          message: "Perfil não identificado",
        });
      }

      // Sprint 4: super_admin tem acesso irrestrito a qualquer rota
      if (perfil === "super_admin") {
        return next();
      }

      const normalizedAllowed = allowedRoles.map((r) =>
        String(r).toLowerCase()
      );

      if (!normalizedAllowed.includes(perfil)) {
        return res.status(403).json({
          ok: false,
          message: "Acesso não autorizado para este perfil",
        });
      }

      return next();
    } catch (error) {
      console.error("[auth]", error.message || error);
      return res.status(500).json({
        ok: false,
        message: "Erro ao validar permissões"});
    }
  };
}

// Sprint 4: middleware exclusivo para rotas de super-admin
function requireSuperAdmin(req, res, next) {
  const perfil = String(req.user?.perfil || "").toLowerCase();
  if (perfil !== "super_admin") {
    return res.status(403).json({ ok: false, message: "Acesso restrito ao super-administrador." });
  }
  return next();
}

module.exports = {
  signToken,
  authRequired,
  authorizeRoles,
  requireSuperAdmin,
};
