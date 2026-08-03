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

// 3. Middleware de proteção das rotas
function authRequired(req, res, next) {
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

    return next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      message: "Token inválido ou expirado",
      error: error.message,
    });
  }
}

// 4. Regras de Negócio (Mantidas Intactas)
function hasOceanAccess(user) {
  const perfil = String(user?.perfil || "").trim().toLowerCase();
  const allowedPerfis = ["coordenador", "superintendente"];
  const flag = Number(user?.pode_acessar_oceano_desenvolvimento || 0) === 1;
  return allowedPerfis.includes(perfil) && flag;
}

function authorizeOceanAccess(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, message: "Usuário não autenticado" });
    }

    if (!hasOceanAccess(req.user)) {
      return res.status(403).json({
        ok: false,
        message: "Acesso restrito ao Oceano do Desenvolvimento",
      });
    }

    return next();
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao validar acesso ao Oceano do Desenvolvimento",
      error: error.message,
    });
  }
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    try {
      const perfil = String(req.user?.perfil || "").toLowerCase();
      const normalizedAllowed = allowedRoles.map((r) =>
        String(r).toLowerCase()
      );

      if (!perfil) {
        return res.status(401).json({
          ok: false,
          message: "Perfil não identificado",
        });
      }

      if (!normalizedAllowed.includes(perfil)) {
        return res.status(403).json({
          ok: false,
          message: "Acesso não autorizado para este perfil",
        });
      }

      return next();
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Erro ao validar permissões",
        error: error.message,
      });
    }
  };
}

module.exports = {
  signToken,
  authRequired,
  authorizeRoles,
  hasOceanAccess,
  authorizeOceanAccess,
};
