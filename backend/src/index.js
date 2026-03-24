const express = require("express");
const cors = require("cors");
const multer = require("multer");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const createCrudRouter = require("./routes/entityCrud");
const pool = require("./lib/db");
const importDashboardExcel = require("./scripts/importDashboardExcel");
const { authRequired, authorizeRoles } = require("./middlewares/auth");

const {
  getDashboardTreinamentos,
} = require("./controllers/dashboardTreinamentosController");

const {
  getParticipantesByTreinamento,
  importarParticipantesExcel,
  salvarChamadaParticipantes,
  deleteParticipanteTreinamento,
  deleteParticipantesTreinamentoBulk,
} = require("./controllers/treinamentoParticipantesController");

const {
  getFrequenciaIndividual,
} = require("./controllers/frequenciaIndividualController");

const {
  listMateriaisAvaliativos,
  createMaterialAvaliativo,
  updateMaterialAvaliativo,
  deleteMaterialAvaliativo,
} = require("./controllers/materiaisAvaliativosController");

const {
  listAvaliacoesTreinandos,
  listNpsDisponivel,
  createAvaliacaoTreinando,
} = require("./controllers/avaliacoesTreinandosController");

const {
  listRespostasAvaliativas,
  createRespostaAvaliativa,
  updateRespostaAvaliativa,
  deleteRespostaAvaliativa,
} = require("./controllers/respostasAvaliativasController");

const {
  listTurmaAulas,
  getTurmaAulaById,
  createTurmaAula,
  updateTurmaAula,
  deleteTurmaAula,
  gerarCronogramaTurma,
  duplicarPlanoAulas,
  getResumoTurmaAulas,
} = require("./controllers/turmaAulasController");

const {
  listarPresencaAula,
  inicializarPresencaAula,
  salvarPresencaAula,
  resumoPresencaAula,
} = require("./controllers/presencaAulasController");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get(
  "/api/dashboard/treinamentos",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  getDashboardTreinamentos
);

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

app.use(
  "/api/dashboard",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  dashboardRoutes
);

app.use(
  "/api/clientes",
  createCrudRouter({
    table: "clientes",
    fields: ["nome", "segmento", "status", "gestor", "descricao"],
    orderBy: "nome ASC",
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    createMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor")],
    updateMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor")],
    deleteMiddlewares: [authRequired, authorizeRoles("coordenador")],
  })
);

app.use(
  "/api/usuarios",
  createCrudRouter({
    table: "usuarios",
    fields: [
      "nome",
      "email",
      "senha",
      "perfil",
      "cliente",
      "ativo",
      "troca_senha_obrigatoria",
    ],
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    createMiddlewares: [authRequired, authorizeRoles("coordenador")],
    updateMiddlewares: [authRequired, authorizeRoles("coordenador")],
    deleteMiddlewares: [authRequired, authorizeRoles("coordenador")],
  })
);

app.delete(
  "/api/treinamentos/:id",
  authRequired,
  authorizeRoles("coordenador"),
  async (req, res) => {
    try {
      const { id } = req.params;

      await pool.query(
        `DELETE FROM treinamento_participantes WHERE treinamento_id = ?`,
        [id]
      );

      await pool.query(`DELETE FROM presenca_aulas WHERE treinamento_id = ?`, [id]);
      await pool.query(`DELETE FROM turma_aulas WHERE treinamento_id = ?`, [id]);
      await pool.query(`DELETE FROM presencas WHERE treinamento_id = ?`, [id]);
      await pool.query(`DELETE FROM avaliacoes WHERE treinamento_id = ?`, [id]);
      await pool.query(`DELETE FROM materiais_avaliativos WHERE treinamento_id = ?`, [id]);
      await pool.query(`DELETE FROM treinamentos WHERE id = ?`, [id]);

      return res.json({
        ok: true,
        message: "Treinamento e dados relacionados excluídos com sucesso",
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Erro ao excluir treinamento",
        error: error.message,
      });
    }
  }
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
      "data_inicio",
      "data_fim",
      "turma",
      "supervisor",
    ],
    orderBy: "id DESC",
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    createMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    updateMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    deleteMiddlewares: [authRequired, authorizeRoles("coordenador")],
  })
);

app.get(
  "/api/treinamentos/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  async (req, res) => {
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
          data_inicio,
          data_fim,
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
          message: "Treinamento não encontrado",
        });
      }

      return res.json(rows[0]);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: "Erro ao buscar treinamento",
        error: error.message,
      });
    }
  }
);

app.get(
  "/api/treinamentos/:id/participantes",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  getParticipantesByTreinamento
);

app.post(
  "/api/treinamentos/importar-participantes",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  upload.single("arquivo"),
  importarParticipantesExcel
);

app.post(
  "/api/treinamentos/salvar-chamada",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  salvarChamadaParticipantes
);

app.delete(
  "/api/treinamentos/participantes/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  deleteParticipanteTreinamento
);

app.post(
  "/api/treinamentos/participantes/excluir-lote",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  deleteParticipantesTreinamentoBulk
);

app.get(
  "/api/turma-aulas",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  listTurmaAulas
);

app.get(
  "/api/turma-aulas/resumo/:treinamento_id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  getResumoTurmaAulas
);

app.get(
  "/api/turma-aulas/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  getTurmaAulaById
);

app.post(
  "/api/turma-aulas",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  createTurmaAula
);

app.put(
  "/api/turma-aulas/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  updateTurmaAula
);

app.delete(
  "/api/turma-aulas/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  deleteTurmaAula
);

app.post(
  "/api/turma-aulas/gerar-cronograma",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  gerarCronogramaTurma
);

app.post(
  "/api/turma-aulas/duplicar",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  duplicarPlanoAulas
);

app.get(
  "/api/presenca-aulas",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  listarPresencaAula
);

app.post(
  "/api/presenca-aulas/inicializar",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  inicializarPresencaAula
);

app.post(
  "/api/presenca-aulas/salvar",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  salvarPresencaAula
);

app.get(
  "/api/presenca-aulas/resumo/:turma_aula_id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  resumoPresencaAula
);

app.use(
  "/api/presencas",
  createCrudRouter({
    table: "presencas",
    fields: [
      "treinamento_id",
      "data_chamada",
      "treinando_nome",
      "presente",
      "status",
      "justificativa",
    ],
    orderBy: "id DESC",
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    createMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    updateMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    deleteMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor")],
  })
);

app.use(
  "/api/avaliacoes",
  createCrudRouter({
    table: "avaliacoes",
    fields: [
      "treinamento_id",
      "titulo",
      "nota_nps",
      "nota_qualidade",
      "nota_prova",
      "observacoes",
      "comentario",
      "treinando_nome",
    ],
    orderBy: "id DESC",
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    createMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    updateMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    deleteMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor")],
  })
);

app.get(
  "/api/frequencia-individual",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  getFrequenciaIndividual
);

app.get(
  "/api/avaliacoes-treinandos",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  listAvaliacoesTreinandos
);

app.get(
  "/api/nps-disponivel",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  listNpsDisponivel
);

app.post(
  "/api/avaliacoes-treinandos",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  createAvaliacaoTreinando
);

app.get(
  "/api/materiais-avaliativos",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  listMateriaisAvaliativos
);

app.post(
  "/api/materiais-avaliativos",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  createMaterialAvaliativo
);

app.put(
  "/api/materiais-avaliativos/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  updateMaterialAvaliativo
);

app.delete(
  "/api/materiais-avaliativos/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  deleteMaterialAvaliativo
);

app.get(
  "/api/respostas-avaliativas",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  listRespostasAvaliativas
);

app.post(
  "/api/respostas-avaliativas",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  createRespostaAvaliativa
);

app.put(
  "/api/respostas-avaliativas/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  updateRespostaAvaliativa
);

app.delete(
  "/api/respostas-avaliativas/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  deleteRespostaAvaliativa
);

app.use(
  "/api/biblioteca",
  createCrudRouter({
    table: "biblioteca_conteudos",
    fields: ["titulo", "tipo", "cliente", "link_arquivo", "descricao"],
    orderBy: "id DESC",
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor", "treinando")],
    createMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor")],
    updateMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor")],
    deleteMiddlewares: [authRequired, authorizeRoles("coordenador")],
  })
);

app.use(
  "/api/trilhas",
  createCrudRouter({
    table: "trilhas_aprendizagem",
    fields: ["cliente", "titulo", "descricao", "etapas"],
    orderBy: "id DESC",
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor", "treinando")],
    createMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor")],
    updateMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor")],
    deleteMiddlewares: [authRequired, authorizeRoles("coordenador")],
  })
);

app.get(
  "/api/zerar-dashboard",
  authRequired,
  authorizeRoles("coordenador"),
  async (req, res) => {
    try {
      await pool.query("SET FOREIGN_KEY_CHECKS = 0");

      await pool.query("TRUNCATE TABLE avaliacoes");
      await pool.query("TRUNCATE TABLE presenca_aulas");
      await pool.query("TRUNCATE TABLE presencas");
      await pool.query("TRUNCATE TABLE treinamento_participantes");
      await pool.query("TRUNCATE TABLE turma_aulas");
      await pool.query("TRUNCATE TABLE treinamentos");
      await pool.query("TRUNCATE TABLE usuarios");
      await pool.query("TRUNCATE TABLE clientes");

      await pool.query("SET FOREIGN_KEY_CHECKS = 1");

      res.json({
        ok: true,
        message: "Base zerada com sucesso.",
      });
    } catch (error) {
      try {
        await pool.query("SET FOREIGN_KEY_CHECKS = 1");
      } catch (_) {}

      console.error("Erro ao zerar base:", error);
      res.status(500).json({
        ok: false,
        message: "Erro ao zerar base.",
        error: error.message,
      });
    }
  }
);

app.get(
  "/api/importar-dashboard",
  authRequired,
  authorizeRoles("coordenador"),
  async (req, res) => {
    try {
      const truncate =
        req.query.truncate === "1" ||
        req.query.truncate === "true" ||
        req.query.truncate === "sim";

      if (truncate) {
        await pool.query("SET FOREIGN_KEY_CHECKS = 0");
        await pool.query("TRUNCATE TABLE avaliacoes");
        await pool.query("TRUNCATE TABLE presenca_aulas");
        await pool.query("TRUNCATE TABLE presencas");
        await pool.query("TRUNCATE TABLE treinamento_participantes");
        await pool.query("TRUNCATE TABLE turma_aulas");
        await pool.query("TRUNCATE TABLE treinamentos");
        await pool.query("TRUNCATE TABLE usuarios");
        await pool.query("TRUNCATE TABLE clientes");
        await pool.query("SET FOREIGN_KEY_CHECKS = 1");
      }

      const resultado = await importDashboardExcel();

      res.json({
        ok: true,
        message: "Importação do dashboard concluída com sucesso.",
        resumo: resultado,
      });
    } catch (error) {
      try {
        await pool.query("SET FOREIGN_KEY_CHECKS = 1");
      } catch (_) {}

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

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
