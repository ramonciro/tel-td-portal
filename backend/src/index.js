const express = require("express")
const cors = require("cors")
const mysql = require("mysql2")

const app = express()

app.use(cors())
app.use(express.json())

/*
CONEXÃO COM MYSQL (RAILWAY)
Railway cria automaticamente estas variáveis:
MYSQLHOST
MYSQLUSER
MYSQLPASSWORD
MYSQLDATABASE
MYSQLPORT
*/

const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
})

db.connect((err) => {

  if (err) {
    console.error("Erro ao conectar no banco:", err)
  } else {
    console.log("Banco conectado com sucesso")
  }

})

/* ---------------------------
ROTA DE TESTE DA API
--------------------------- */

app.get("/api", (req, res) => {

  res.json({
    status: "API Tel T&D online"
  })

})

/* ---------------------------
DASHBOARD EXECUTIVO
--------------------------- */

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

    console.error("Erro dashboard:", error)

    res.status(500).json({
      erro: "Erro ao carregar dashboard"
    })

  }

})

/* ---------------------------
FUNÇÃO AUXILIAR MYSQL
--------------------------- */

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

/* ---------------------------
PORTA DO SERVIDOR
--------------------------- */

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {

  console.log(`Servidor rodando na porta ${PORT}`)

})
