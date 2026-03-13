const express = require("express")
const router = express.Router()
const pool = require("../lib/db")

router.get("/", async (req, res) => {
  try {
    const [[clientes]] = await pool.query("SELECT COUNT(*) AS total FROM clientes")
    const [[usuarios]] = await pool.query("SELECT COUNT(*) AS total FROM usuarios")
    const [[treinamentos]] = await pool.query("SELECT COUNT(*) AS total FROM treinamentos")
    const [[presencas]] = await pool.query("SELECT COUNT(*) AS total FROM presencas")
    const [[avaliacoes]] = await pool.query("SELECT COUNT(*) AS total FROM avaliacoes")
    const [[biblioteca]] = await pool.query("SELECT COUNT(*) AS total FROM biblioteca")
    const [[trilhas]] = await pool.query("SELECT COUNT(*) AS total FROM trilhas")
    res.json({
      clientes: clientes.total, usuarios: usuarios.total, treinamentos: treinamentos.total,
      presencas: presencas.total, avaliacoes: avaliacoes.total, biblioteca: biblioteca.total, trilhas: trilhas.total
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Erro ao carregar dashboard executivo" })
  }
})

module.exports = router
