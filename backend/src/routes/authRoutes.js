const express = require("express")
const router = express.Router()
const db = require("../database")

router.post("/login", (req, res) => {
  const { email, senha } = req.body

  if (!email || !senha) {
    return res.status(400).json({ message: "Informe e-mail e senha" })
  }

  db.query(
    "SELECT * FROM usuarios WHERE email = ? LIMIT 1",
    [email],
    (err, result) => {
      if (err) {
        console.error("Erro no login:", err)
        return res.status(500).json({ message: "Erro interno no login" })
      }

      if (!result || result.length === 0) {
        return res.status(401).json({ message: "Usuário não encontrado" })
      }

      const usuario = result[0]

      if (String(usuario.senha) !== String(senha)) {
        return res.status(401).json({ message: "Senha incorreta" })
      }

      return res.json({
        token: "login-simples-temporario",
        user: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          perfil: usuario.perfil || "admin",
          cliente: usuario.cliente || "",
          troca_senha_obrigatoria: false
        }
      })
    }
  )
})

module.exports = router
``
