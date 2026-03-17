const crypto = require("crypto");

const SECRET = process.env.JWT_SECRET || "teltd-access-secret";

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
  return Buffer.from(padded, "base64").toString();
}

function signToken(payload, expiresInSeconds = 60 * 60 * 12) {
  const data = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const encodedPayload = toBase64Url(JSON.stringify(data));
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(encodedPayload)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) {
    throw new Error("Token inválido");
  }

  const [encodedPayload, signature] = token.split(".");

  const expectedSignature = crypto
    .createHmac("sha256", SECRET)
    .update(encodedPayload)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  if (signature !== expectedSignature) {
    throw new Error("Assinatura inválida");
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload));

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expirado");
  }

  return payload;
}

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

    const decoded = verifyToken(token);
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
  verifyToken,
  authRequired,
  authorizeRoles,
};
