import jwt from "jsonwebtoken";

export function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return res.status(401).json({ ok: false, message: "Token ausente" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "teltd-secret");
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "Token inválido" });
  }
}
