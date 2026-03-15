const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const createCrudRouter = require("./routes/entityCrud");
const pool = require("./lib/db");
const importDashboardExcel = require("./scripts/importDashboardExcel");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "API Tel T&D online" });
  } catch (error) {
    res.status(500).json({
      status: "API online sem conexão com banco",
      error: error.message,
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
    orderBy: "nome ASC",
  })
);

app.use(
  "/api/usuarios",
  createCrudRouter({
    table: "usuarios",
    fields: ["nome", "email", "senha", "perfil", "cliente", "ativo"],
    orderBy: "id DESC",
  })
);

app.use(
  "/api/treinamentos",
  createCrudRouter({
    table: "treinamentos",
    fields: ["tema", "cliente", "instrutor", "carga_horaria"],
    orderBy: "id DESC",
  })
);

app.use(
  "/api/presencas",
  createCrudRouter({
    table: "presencas",
    fields: ["treinamento_id", "treinando_nome", "status", "justificativa"],
    orderBy: "id DESC",
  })
);

app.use(
  "/api/avaliacoes",
  createCrudRouter({
    table: "avaliacoes",
    fields: ["treinamento_id", "titulo", "nota_nps", "nota_qualidade", "nota_prova"],
    orderBy: "id DESC",
  })
);

app.use(
  "/api/biblioteca",
  createCrudRouter({
    table: "biblioteca_conteudos",
    fields: ["titulo", "tipo", "cliente", "link_arquivo", "descricao"],
    orderBy: "id DESC",
  })
);

app.use(
  "/api/trilhas",
  createCrudRouter({
    table: "trilhas_aprendizagem",
    fields: ["cliente", "titulo", "descricao", "etapas"],
    orderBy: "id DESC",
  })
);

/**
 * ZERA A BASE RELACIONADA AO DASHBOARD
 * Use antes da importação se quiser começar do zero.
 */
app.get("/api/zerar-dashboard", async (req, res) => {
  try {
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    await pool.query("DELETE FROM avaliacoes");
    await pool.query("DELETE FROM presencas");
    await pool.query("DELETE FROM treinamentos");
    await pool.query("DELETE FROM usuarios");
    await pool.query("DELETE FROM clientes");
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");

    res.json({
      ok: true,
      message: "Base zerada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao zerar base:", error);
    try {
      await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    } catch {}
    res.status(500).json({
      ok: false,
      message: "Erro ao zerar base.",
      error: error.message,
    });
  }
});

/**
 * IMPORTAÇÃO TEMPORÁRIA DO DASHBOARD
 * Exemplos:
 * /api/importar-dashboard
 * /api/importar-dashboard?truncate=1
 */
app.get("/api/importar-dashboard", async (req, res) => {
  try {
    const truncate =
      req.query.truncate === "1" ||
      req.query.truncate === "true" ||
      req.query.truncate === "sim";

    const resultado = await importDashboardExcel({ truncate });

    res.json({
      ok: true,
      message: "Importação do dashboard concluída com sucesso.",
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
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
