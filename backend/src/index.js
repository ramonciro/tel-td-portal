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
 * Limpa as tabelas na ordem correta, reseta AUTO_INCREMENT
 * e devolve a contagem final para validação.
 */
app.get("/api/zerar-dashboard", async (req, res) => {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    // Limpa tabelas filhas primeiro
    await conn.query("DELETE FROM avaliacoes");
    await conn.query("DELETE FROM presencas");
    await conn.query("DELETE FROM treinamentos");
    await conn.query("DELETE FROM usuarios");
    await conn.query("DELETE FROM clientes");

    // Reseta AUTO_INCREMENT
    await conn.query("ALTER TABLE avaliacoes AUTO_INCREMENT = 1");
    await conn.query("ALTER TABLE presencas AUTO_INCREMENT = 1");
    await conn.query("ALTER TABLE treinamentos AUTO_INCREMENT = 1");
    await conn.query("ALTER TABLE usuarios AUTO_INCREMENT = 1");
    await conn.query("ALTER TABLE clientes AUTO_INCREMENT = 1");

    await conn.query("SET FOREIGN_KEY_CHECKS = 1");

    await conn.commit();

    const [[treinamentosCount]] = await conn.query("SELECT COUNT(*) AS total FROM treinamentos");
    const [[presencasCount]] = await conn.query("SELECT COUNT(*) AS total FROM presencas");
    const [[avaliacoesCount]] = await conn.query("SELECT COUNT(*) AS total FROM avaliacoes");
    const [[usuariosCount]] = await conn.query("SELECT COUNT(*) AS total FROM usuarios");
    const [[clientesCount]] = await conn.query("SELECT COUNT(*) AS total FROM clientes");

    res.json({
      ok: true,
      message: "Base zerada com sucesso.",
      contagem: {
        clientes: clientesCount.total,
        usuarios: usuariosCount.total,
        treinamentos: treinamentosCount.total,
        presencas: presencasCount.total,
        avaliacoes: avaliacoesCount.total,
      },
    });
  } catch (error) {
    await conn.rollback();

    try {
      await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    } catch {}

    console.error("Erro ao zerar base:", error);

    res.status(500).json({
      ok: false,
      message: "Erro ao zerar base.",
      error: error.message,
    });
  } finally {
    conn.release();
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
