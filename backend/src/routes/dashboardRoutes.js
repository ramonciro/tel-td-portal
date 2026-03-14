const express = require("express");
const router = express.Router();
const pool = require("../lib/db");

router.get("/", async (req, res) => {
  try {
    const [[clientes]] = await pool.query("SELECT COUNT(*) AS total FROM clientes");
    const [[usuarios]] = await pool.query("SELECT COUNT(*) AS total FROM usuarios");
    const [[treinamentos]] = await pool.query("SELECT COUNT(*) AS total FROM treinamentos");
    const [[presencas]] = await pool.query("SELECT COUNT(*) AS total FROM presencas");
    const [[avaliacoes]] = await pool.query("SELECT COUNT(*) AS total FROM avaliacoes");
    const [[biblioteca]] = await pool.query("SELECT COUNT(*) AS total FROM biblioteca_conteudos");
    const [[trilhas]] = await pool.query("SELECT COUNT(*) AS total FROM trilhas_aprendizagem");

    return res.json({
      clientes: clientes.total || 0,
      usuarios: usuarios.total || 0,
      treinamentos: treinamentos.total || 0,
      presencas: presencas.total || 0,
      avaliacoes: avaliacoes.total || 0,
      biblioteca: biblioteca.total || 0,
      trilhas: trilhas.total || 0
    });
  } catch (error) {
    console.error("Erro ao carregar dashboard:", error);
    return res.status(500).json({
      message: "Erro ao carregar dashboard executivo",
      error: error.message
    });
  }
});

module.exports = router;
