const express = require("express");
const cors = require("cors");
const multer = require("multer");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const createCrudRouter = require("./routes/entityCrud");
const pool = require("./lib/db");
const importDashboardExcel = require("./scripts/importDashboardExcel");
const { getDashboardTreinamentos, } = require("./controllers/dashboardTreinamentosController");
const {
  getParticipantesByTreinamento,
  importarParticipantesExcel,
  salvarChamadaParticipantes,
} = require("./controllers/treinamentoParticipantesController");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/dashboad/treinamentos",getDashboardTreinamentos);
app.get("/api", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "API Tel T&D online" });
  } catch (error) {
    res.status(500).json({
      status: "API online sem conexão com banco",
      error: error.message
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use(
  "/api/clientes",
  createCrudRouter({
    table: "clientes",
    fields: ["nome", "segmento", "status", "gestor", "descricao"],
    orderBy: "nome ASC"
  })
);

app.use(
  "/api/usuarios",
  createCrudRouter({
    table: "usuarios",
    fields: ["nome", "email", "senha", "perfil", "cliente", "ativo", "troca_senha_obrigatoria"]
  })
);

app.use(
  "/api/treinamentos",
  createCrudRouter({
    table: "treinamentos",
    fields: [
      "tema",
      "cliente",
      "instrutor",
      "carga_horaria",
      "participantes",
      "participantes_previstos",
      "participantes_presentes",
      "concluidos",
      "publico",
      "status",
      "descricao",
      "data",
      "turma",
      "supervisor"
    ],
    orderBy: "id DESC"
  })
);

/* DETALHE DO TREINAMENTO */
app.get("/api/treinamentos/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        id,
        tema,
        cliente,
        instrutor,
        carga_horaria,
        participantes,
        participantes_previstos,
        participantes_presentes,
        concluidos,
        publico,
        status,
        descricao,
        data,
        turma,
        supervisor
      FROM treinamentos
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Treinamento não encontrado"
      });
    }

    return res.json(rows[0]);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao buscar treinamento",
      error: error.message
    });
  }
});

/* PARTICIPANTES DO TREINAMENTO */
app.get(
  "/api/treinamentos/:id/participantes",
  getParticipantesByTreinamento
);

app.post(
  "/api/treinamentos/importar-participantes",
  upload.single("arquivo"),
  importarParticipantesExcel
);

app.post(
  "/api/treinamentos/salvar-chamada",
  salvarChamadaParticipantes
);

app.use(
  "/api/presencas",
  createCrudRouter({
    table: "presencas",
    fields: ["treinamento_id", "treinando_nome", "presente", "status", "justificativa"],
    orderBy: "id DESC"
  })
);

app.use(
  "/api/avaliacoes",
  createCrudRouter({
    table: "avaliacoes",
    fields: ["treinamento_id", "titulo", "nota_nps", "nota_qualidade", "nota_prova", "observacoes", "comentario"],
    orderBy: "id DESC"
  })
);

app.use(
  "/api/biblioteca",
  createCrudRouter({
    table: "biblioteca_conteudos",
    fields: ["titulo", "tipo", "cliente", "link_arquivo", "descricao"],
    orderBy: "id DESC"
  })
);

app.use(
  "/api/trilhas",
  createCrudRouter({
    table: "trilhas_aprendizagem",
    fields: ["cliente", "titulo", "descricao", "etapas"],
    orderBy: "id DESC"
  })
);

app.get("/api/zerar-dashboard", async (req, res) => {
  try {
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");

    await pool.query("TRUNCATE TABLE avaliacoes");
    await pool.query("TRUNCATE TABLE presencas");
    await pool.query("TRUNCATE TABLE treinamentos");
    await pool.query("TRUNCATE TABLE usuarios");
    await pool.query("TRUNCATE TABLE clientes");

    await pool.query("SET FOREIGN_KEY_CHECKS = 1");

    res.json({
      ok: true,
      message: "Base zerada com sucesso."
    });
  } catch (error) {
    try {
      await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    } catch (_) {}

    console.error("Erro ao zerar base:", error);
    res.status(500).json({
      ok: false,
      message: "Erro ao zerar base.",
      error: error.message
    });
  }
});

app.get("/api/importar-dashboard", async (req, res) => {
  try {
    const truncate =
      req.query.truncate === "1" ||
      req.query.truncate === "true" ||
      req.query.truncate === "sim";

    if (truncate) {
      await pool.query("SET FOREIGN_KEY_CHECKS = 0");
      await pool.query("TRUNCATE TABLE avaliacoes");
      await pool.query("TRUNCATE TABLE presencas");
      await pool.query("TRUNCATE TABLE treinamentos");
      await pool.query("TRUNCATE TABLE usuarios");
      await pool.query("TRUNCATE TABLE clientes");
      await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    }

    const resultado = await importDashboardExcel();

    res.json({
      ok: true,
      message: "Importação do dashboard concluída com sucesso.",
      resumo: resultado
    });
  } catch (error) {
    try {
      await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    } catch (_) {}

    console.error("Erro ao importar dashboard:", error);
    res.status(500).json({
      ok: false,
      message: "Erro ao importar dashboard.",
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
