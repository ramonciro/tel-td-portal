import jwt from "jsonwebtoken";

export async function login(req, res) {
  const { email, senha } = req.body || {};

  if (email === "admin@teltd.com" && senha === "Tel@2026") {
    const token = jwt.sign(
      { email, role: "COORDENADOR", nome: "Ramon Ciro" },
      process.env.JWT_SECRET || "teltd_secret",
      { expiresIn: "8h" }
    );

    return res.json({
      token,
      user: {
        nome: "Ramon Ciro",
        email,
        role: "COORDENADOR"
      }
    });
  }

  return res.status(401).send("Credenciais inválidas");
}
