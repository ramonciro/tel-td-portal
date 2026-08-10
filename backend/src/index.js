const express = require("express");
const cors = require("cors");
const multer = require("multer");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const createCrudRouter = require("./routes/entityCrud");
const pool = require("./lib/db");
const importDashboardExcel = require("./scripts/importDashboardExcel");
const { runMigrations } = require("./database/migrate");
const { authRequired, authorizeRoles, authorizeOceanAccess } = require("./middlewares/auth");

const jornadasEtapasRoutes = require("./routes/jornadasEtapasRoutes");
const jornadasDesenvolvimentoRoutes = require("./routes/jornadasDesenvolvimentoRoutes");
const acoesDesenvolvimentoRoutes = require("./routes/acoesDesenvolvimentoRoutes");
const coachingPlanosRoutes = require("./routes/coachingPlanosRoutes");
const jornadaParticipantesRoutes = require("./routes/jornadaParticipantesRoutes");

const {
  getDashboardTreinamentos,
} = require("./controllers/dashboardTreinamentosController");

const {
  listarResumoGeral,
  obterResumoPorTreinamento,
} = require("./controllers/presencaResumoController");

const { registrarAuditoria } = require("./services/auditoria");
const { listarAuditoriaHandler } = require("./controllers/auditoriaController");

const {
  obterMural,
  criarPublicacaoHandler,
  editarPublicacaoHandler,
  excluirPublicacaoHandler,
} = require("./controllers/muralController");

const app = express();

// Configurações globais de CORS e JSON
app.use(cors());
app.use(express.json());

// Middleware de Identificação de Cliente / Multi-Tenancy por Header ou Query
app.use((req, res, next) => {
  const clienteHeader = req.headers["x-cliente-ativo"] || req.query.cliente || "comercio";
  req.clienteAtivo = String(clienteHeader).trim().toLowerCase();
  next();
});

// Rota de Health Check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "online", timestamp: new Date() });
});

// Rotas de Autenticação
app.use("/api/auth", authRoutes);

// Rotas de Dashboard e Indicadores
app.use("/api/dashboard", dashboardRoutes);
app.get("/api/dashboard-treinamentos", authRequired, getDashboardTreinamentos);

// Rotas de Presenças e Resumos
app.get("/api/presencas/resumo-geral", authRequired, listarResumoGeral);
app.get("/api/presencas/resumo-treinamento/:id", authRequired, obterResumoPorTreinamento);

// Rotas do Mural de Avisos
app.get("/api/mural", authRequired, obterMural);
app.post("/api/mural", authRequired, criarPublicacaoHandler);
app.put("/api/mural/:id", authRequired, editarPublicacaoHandler);
app.delete("/api/mural/:id", authRequired, excluirPublicacaoHandler);

// Rotas de Auditoria
app.get("/api/auditoria", authRequired, authorizeRoles("coordenador"), listarAuditoriaHandler);

// Rotas do Oceano do Desenvolvimento (Protegidas por permissão de Oceano)
app.use("/api/jornadas-etapas", jornadasEtapasRoutes);
app.use("/api/jornadas-desenvolvimento", authRequired, authorizeOceanAccess, jornadasDesenvolvimentoRoutes);
app.use("/api/acoes-desenvolvimento", authRequired, authorizeOceanAccess, acoesDesenvolvimentoRoutes);
app.use("/api/coaching-planos", authRequired, authorizeOceanAccess, coachingPlanosRoutes);
app.use("/api/jornada-participantes", authRequired, authorizeOceanAccess, jornadaParticipantesRoutes);

// Endpoint de importação do Dashboard (Garante isolamento: se não for o Comércio, inicia zerado para preenchimento independente)
app.post(
  "/api/importar-dashboard",
  authRequired,
  authorizeRoles("coordenador"),
  async (req, res) => {
    try {
      const clienteAtual = req.clienteAtivo;
      
      // Se a importação for chamada em outro ambiente que não o comércio, 
      // podemos opcionalmente isolar ou limpar os dados específicos daquele tenant para que comece zerado.
      if (clienteAtual !== "comercio" && req.body?.zerarOutros) {
        await pool.query("DELETE FROM clientes WHERE nome = ?", [clienteAtual]);
      }

      const resultado = await importDashboardExcel(clienteAtual);

      res.json({
        ok: true,
        message: `Importação do dashboard concluída com sucesso para o ambiente: ${clienteAtual}.`,
        resumo: resultado,
      });
    } catch (error) {
      console.error("Erro ao importar dashboard:", error);
      res.status(500).json({
        ok: false,
        message: "Erro ao importar dashboard.",
        error: error.message,
      });
    }
  }
);

const PORT = process.env.PORT || 3000;

async function iniciarAplicacao() {
  try {
    await runMigrations();

    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  } catch (error) {
    console.error("Erro ao iniciar a aplicação:", error);
  }
}

iniciarAplicacao();
