const express = require("express")
const cors = require("cors")

const dashboardRoutes = require("./routes/dashboardRoutes")
const usuariosRoutes = require("./routes/usuariosRoutes")
const clientesRoutes = require("./routes/clientesRoutes")

const app = express()

app.use(cors())
app.use(express.json())

app.get("/api", (req,res)=>{
  res.json({status:"API Tel T&D online"})
})

app.use("/api/dashboard", dashboardRoutes)
app.use("/api/usuarios", usuariosRoutes)
app.use("/api/clientes", clientesRoutes)

const PORT = process.env.PORT || 3000

app.listen(PORT, ()=>{
  console.log("Servidor rodando na porta", PORT)
})
