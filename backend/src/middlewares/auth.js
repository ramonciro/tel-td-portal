import jwt from "jsonwebtoken";

export function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");

  if (!token) {
    return res.status(401).send("Token ausente");
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "teltd_secret");
    next();
  } catch {
    return res.status(401).send("Token inválido");
  }
}
