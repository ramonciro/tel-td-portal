const express = require("express")
const cors = require("cors")
const mysql = require("mysql2")
require("dotenv").config()

const app = express()

app.use(cors())
app.use(express.json())

// conexão com banco
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
})

db.connect((err) => {
  if (err) {
    console.error("Erro ao conectar no banco:", err)
  } else {
    console.log("Banco de dados conectado")
  }
})


// rota teste
app.get("/api", (req, res) => {
  res.json({
    status: "API Tel T&D online"
  })
})


// DASHBOARD EXECUTIVO
app.get("/api/dashboard", async (req, res) => {

  try {

    const clientes = await query("SELECT COUNT(*) as total FROM clientes")
    const usuarios = await query("SELECT COUNT(*) as total FROM usuarios")
    const treinamentos = await query("SELECT COUNT(*) as total FROM treinamentos")
    const participantes = await query("SELECT COUNT(*) as total FROM presencas")

    res.json({
      clientes: clientes[0].total,
      usuarios: usuarios[0].total,
      treinamentos: treinamentos[0].total,
      participantes: participantes[0].total
    })

  } catch (error) {

    console.error(error)

    res.status(500).json({
      error: "Erro ao carregar dashboard"
    })

  }

})


// função auxiliar para queries
function query(sql) {
  return new Promise((resolve, reject) => {

    db.query(sql, (error, results) => {

      if (error) {
        reject(error)
      } else {
        resolve(results)
      }

    })

  })
}


// porta do railway
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {

  console.log(`Servidor rodando na porta ${PORT}`)

})
