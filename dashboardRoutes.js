const express = require("express")
const cors = require("cors")
const authRoutes = require("./routes/authRoutes")
const dashboardRoutes = require("./routes/dashboardRoutes")
const createCrudRouter = require("./routes/entityCrud")
const pool = require("./lib/db")

const app = express()
app.use(cors())
app.use(express.json())

app.get("/api", async (req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "API Tel T&D online" }) }
  catch { res.status(500).json({ status: "API online sem conexão com banco" }) }
})

app.use("/api/auth", authRoutes)
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/clientes", createCrudRouter({ table:"clientes", fields:["nome","segmento","status","gestor","descricao"], orderBy:"nome ASC" }))
app.use("/api/usuarios", createCrudRouter({ table:"usuarios", fields:["nome","email","senha","perfil","cliente","ativo","troca_senha_obrigatoria"], orderBy:"nome ASC" }))
app.use("/api/treinamentos", createCrudRouter({ table:"treinamentos", fields:["tema","cliente","instrutor","carga_horaria","participantes_previstos","participantes_presentes","concluidos","status"] }))
app.use("/api/presencas", createCrudRouter({ table:"presencas", fields:["treinamento_id","treinando_nome","status","justificativa"] }))
app.use("/api/avaliacoes", createCrudRouter({ table:"avaliacoes", fields:["treinamento_id","titulo","nota_nps","nota_qualidade","nota_prova","observacoes"] }))
app.use("/api/biblioteca", createCrudRouter({ table:"biblioteca", fields:["titulo","tipo","cliente","link_arquivo","descricao","categoria","publico","status"] }))
app.use("/api/trilhas", createCrudRouter({ table:"trilhas", fields:["titulo","cliente","descricao","carga_horaria_estimada","publico","status"] }))
app.use("/api/mapa-desenvolvimento", createCrudRouter({ table:"mapa_desenvolvimento", fields:["colaborador","cliente","cargo","objetivo_profissional","trilha_atual","etapa_atual","status","percentual","proximo_passo","mentor","observacoes"] }))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`))
