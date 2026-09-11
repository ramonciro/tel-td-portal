const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const createCrudRouter = require("./routes/entityCrud");
const pool = require("./lib/db");
const importDashboardExcel = require("./scripts/importDashboardExcel");
const { runMigrations } = require("./database/migrate");
const { authRequired, authorizeRoles, authorizeOceanAccess, requireSuperAdmin } = require("./middlewares/auth");

// Fase 2 (roadmap de competitividade): automações por e-mail — resumo diário
// de pendências para coordenadores e lembrete de aula do dia seguinte para
// instrutores. Ver backend/src/jobs/.
const { iniciarAgendamentos } = require("./jobs/scheduler");
const { rodarDigestPendencias, montarResumoEmpresa } = require("./jobs/pendenciasDigest");
const { rodarLembretesAula } = require("./jobs/lembretesAula");
const { rodarCalculoConquistas } = require("./jobs/conquistasJob");
const { gerarTextoResumo, getResumoCacheadoDoDia } = require("./services/resumoExecutivoService");
const { listarConquistas } = require("./services/gamificacaoService");
const { getAnaliseComentarios } = require("./services/analiseComentariosService");

// Sprint 5: Analytics
const {
  getResumo, getHoras, getNps, getEfetividade, getRoi, exportarIndicadores,
} = require("./controllers/analyticsController");

// Sprint 4: Admin (super_admin)
const {
  getGlobalStats,
  listEmpresas,
  getEmpresa,
  createEmpresa,
  updateEmpresa,
  toggleAtivo,
  deleteEmpresa,
  listPlanos,
} = require("./controllers/adminController");
// Sprint 1: middleware de isolamento multi-tenant
// Sprint 1: middleware de isolamento multi-tenant (import único)
const { clientMiddleware } = require("./middlewares/clientMiddleware");

const jornadasEtapasRoutes = require("./routes/jornadasEtapasRoutes");
const jornadasDesenvolvimentoRoutes = require("./routes/jornadasDesenvolvimentoRoutes");
const acoesDesenvolvimentoRoutes = require("./routes/acoesDesenvolvimentoRoutes");
const coachingPlanosRoutes = require("./routes/coachingPlanosRoutes");

// FIX 1: importar a rota de jornada-participantes (estava faltando)
const jornadaParticipantesRoutes = require("./routes/jornadaParticipantesRoutes");
const capacidadeRoutes = require("./routes/capacidadeRoutes");
const {
  getDesempenho: getDesempenhoInstrutor,
  getDesempenhoExportar,
  getResumoExecutivo: getResumoExecutivoDesempenho,
} = require("./controllers/desempenhoInstrutorController");

// Sprint 3: Trilhas relacionais, Certificados
const {
  listTrilhas,
  getTrilha,
  createTrilha,
  updateTrilha,
  deleteTrilha,
  getProgresso,
  getProgressoBulk,
  exportarProgresso,
  marcarEtapaConcluida,
} = require("./controllers/trilhasRelacionaisController");

const {
  listCertificados,
  emitirCertificado,
  verificarCertificado,
  previewCertificado,
} = require("./controllers/certificadosController");

const {
  getDashboardTreinamentos,
  exportarTreinamentos,
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

const {
  listarHandler: listarNecessidadesHandler,
  criarHandler: criarNecessidadeHandler,
  editarHandler: editarNecessidadeHandler,
  excluirHandler: excluirNecessidadeHandler,
} = require("./controllers/necessidadesController");

const {
  getParticipantesByTreinamento,
  importarParticipantesExcel,
  salvarChamadaParticipantes,
  createParticipanteTreinamento,   // FIX: estava exportada no controller mas nunca importada
  deleteParticipanteTreinamento,
  deleteParticipantesTreinamentoBulk,
} = require("./controllers/treinamentoParticipantesController");

const {
  getFrequenciaIndividual,
} = require("./controllers/frequenciaIndividualController");

const {
  listMateriaisAvaliativos,
  listMateriaisAvaliativosDisponiveis,
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

// FIX 2 + 3: importar o controller dedicado da biblioteca
// (resolve o upload e os campos categoria/publico/status que o createCrudRouter ignorava)
const {
  listBiblioteca,
  createBiblioteca,
  updateBiblioteca,
  deleteBiblioteca,
  uploadBibliotecaArquivo,
} = require("./controllers/bibliotecaController");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Pacote 1 (correções críticas, 2026-09): upload da Biblioteca com allowlist
// de extensão + limite de tamanho. Antes usava o `upload` genérico acima —
// que também serve os importadores de planilha (.xlsx/.xls/.csv) — sem
// nenhuma checagem de tipo, então qualquer arquivo (incluindo executáveis)
// podia ser salvo em disco e servido de volta publicamente. Instância própria
// para não afetar as rotas de importação de planilha.
const EXTENSOES_BIBLIOTECA_PERMITIDAS = [
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv",
  ".jpg", ".jpeg", ".png", ".gif", ".mp4", ".zip",
];
const uploadBiblioteca = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    const ext = require("path").extname(file.originalname || "").toLowerCase();
    if (!EXTENSOES_BIBLIOTECA_PERMITIDAS.includes(ext)) {
      return cb(new Error(`Tipo de arquivo não permitido: ${ext || "(sem extensão)"}`));
    }
    return cb(null, true);
  },
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Pacote 1 (correções críticas, 2026-09): a Biblioteca gravava os arquivos
// enviados em uploads/biblioteca/ e devolvia um link "<host>/uploads/
// biblioteca/<arquivo>", mas nada aqui servia essa pasta estaticamente —
// todo link gerado respondia 404, tornando o recurso de anexar arquivo
// inutilizável de ponta a ponta. Serve publicamente (mesmo padrão de link
// direto já usado por esses arquivos); no Railway o disco não é persistente
// entre deploys — isso é uma limitação arquitetural separada, já registrada
// no roadmap, e não é resolvida por esta correção pontual.
app.use("/uploads", express.static(require("path").join(process.cwd(), "uploads")));
// Sprint 1: clientMiddleware aplicado globalmente — popula req.empresaId
// via empresa_id do JWT para todas as rotas protegidas
app.use(clientMiddleware);

app.get(
  "/api/dashboard/treinamentos",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  getDashboardTreinamentos
);

app.get(
  "/api/dashboard/treinamentos/exportar",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  exportarTreinamentos
);

// Fonte única de presença + status de turma (cronograma > legado > snapshot),
// usada pelas páginas Presenças e Treinamentos.
app.get(
  "/api/presenca-resumo",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  listarResumoGeral
);
app.get(
  "/api/presenca-resumo/:treinamento_id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  obterResumoPorTreinamento
);

app.get(
  "/api/auditoria",
  authRequired,
  authorizeRoles("coordenador", "superintendente"),
  listarAuditoriaHandler
);

// Mural da turma: publicações manuais + eventos derivados (avaliação
// publicada, material adicionado, chamada concluída). Ver
// backend/src/services/muralResolver.js.
app.get(
  "/api/turma-mural/:treinamento_id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  obterMural
);
app.post(
  "/api/turma-mural/:treinamento_id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  criarPublicacaoHandler
);
app.put(
  "/api/turma-mural/publicacao/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  editarPublicacaoHandler
);
app.delete(
  "/api/turma-mural/publicacao/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  excluirPublicacaoHandler
);

// Fase 1 do ciclo ISO 10015: necessidade de treinamento (antes de a turma
// existir). Ver backend/src/services/necessidadesResolver.js.
app.get(
  "/api/necessidades",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  listarNecessidadesHandler
);
app.post(
  "/api/necessidades",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  criarNecessidadeHandler
);
app.put(
  "/api/necessidades/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  editarNecessidadeHandler
);
app.delete(
  "/api/necessidades/:id",
  authRequired,
  authorizeRoles("coordenador", "superintendente"),
  excluirNecessidadeHandler
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
    multiTenant: true, // Sprint 1
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    createMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor")],
    updateMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor")],
    deleteMiddlewares: [authRequired, authorizeRoles("coordenador")],
  })
);

/**
 * Fase 4 (isolamento multi-tenant) — descoberto na auditoria de 08/09/2026:
 * o CRUD genérico de /api/usuarios aceitava "perfil" e "empresa_id" sem
 * nenhuma restrição de valor. Um coordenador/supervisor/superintendente
 * comum (os únicos perfis liberados para editar usuário) conseguia:
 *   1. Se auto-promover (ou promover qualquer usuário da própria empresa) a
 *      "super_admin" via PUT/POST — e super_admin tem acesso irrestrito a
 *      TUDO no sistema, inclusive a outras empresas.
 *   2. Editar o "empresa_id" de um usuário livremente via PUT, movendo a
 *      conta para outra empresa.
 * Este hook barra os dois casos para quem não é já super_admin, e de
 * quebra fecha uma lacuna separada: a senha enviada por este endpoint nunca
 * era hasheada (só era hasheada nos fluxos de login/troca de senha
 * dedicados) — ficava em texto plano no banco entre a edição e o próximo
 * login (que faz o "upgrade" automático do hash). Agora já sai hasheada.
 */
async function sanitizarEscritaUsuario(data, req, ctx) {
  const dados = { ...data };
  const perfilAtor = String(req.user?.perfil || "").toLowerCase();
  const atorEhSuperAdmin = perfilAtor === "super_admin";

  if ("perfil" in dados) {
    const perfilNovo = String(dados.perfil || "").toLowerCase();
    if (perfilNovo === "super_admin" && !atorEhSuperAdmin) {
      const erro = new Error("Você não tem permissão para atribuir o perfil super_admin.");
      erro.status = 403;
      throw erro;
    }
  }

  if (ctx.operation === "update" && "empresa_id" in dados && !atorEhSuperAdmin) {
    // Só o super_admin pode mover um usuário entre empresas por esta rota.
    delete dados.empresa_id;
  }

  if ("senha" in dados && dados.senha) {
    dados.senha = await bcrypt.hash(String(dados.senha), 10);
  }

  return dados;
}

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
      "pode_acessar_oceano_desenvolvimento",
      "empresa_id",
    ],
    multiTenant: true, // Sprint 1
    beforeWrite: sanitizarEscritaUsuario, // Fase 4
    hideFields: ["senha"], // Fase 4 — hash da senha nunca sai na listagem
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor", "superintendente", "coaching", "metodologia")],
    createMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "superintendente")],
    updateMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "superintendente")],
    deleteMiddlewares: [authRequired, authorizeRoles("coordenador", "superintendente")],
    auditoria: {
      entidade: "usuario",
      resumoCriar: (dados) => `Criou o usuário "${dados.nome || "?"}" (${dados.perfil || "sem perfil"})`,
      resumoEditar: (antes, depois) => {
        const alvo = antes?.nome || `#${antes?.id}`;
        if ("senha" in depois) return `Alterou a senha do usuário "${alvo}"`;
        if (depois.perfil && depois.perfil !== antes?.perfil) {
          return `Mudou o perfil de "${alvo}" de "${antes?.perfil}" para "${depois.perfil}"`;
        }
        if ("ativo" in depois && String(depois.ativo) !== String(antes?.ativo)) {
          return `${String(depois.ativo) === "1" ? "Reativou" : "Desativou"} o usuário "${alvo}"`;
        }
        return `Editou o usuário "${alvo}"`;
      },
      resumoExcluir: (antes) => `Excluiu o usuário "${antes?.nome || "?"}" (${antes?.perfil || "sem perfil"})`,
    },
  })
);

app.delete(
  "/api/treinamentos/:id",
  authRequired,
  authorizeRoles("coordenador"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Isolamento por tenant: um coordenador de uma empresa não pode
      // excluir um treinamento de outra empresa mesmo sabendo o id (esta
      // rota é escrita à mão, fora do entityCrud.js, então precisa do mesmo
      // guard manualmente). req.empresaId nulo (ex.: super_admin, ou dado
      // legado sem empresa atribuída) mantém o comportamento antigo.
      const tenantCheck = req.empresaId ? ` AND empresa_id = ${pool.escape(req.empresaId)}` : "";
      const [linhas] = await pool.query(`SELECT * FROM treinamentos WHERE id = ?${tenantCheck}`, [id]);
      const antes = linhas[0] || null;
      if (!antes) {
        return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
      }

      await pool.query(`DELETE FROM presenca_aulas WHERE treinamento_id = ?`, [id]);
      await pool.query(`DELETE FROM turma_aulas WHERE treinamento_id = ?`, [id]);
      await pool.query(`DELETE FROM treinamento_participantes WHERE treinamento_id = ?`, [id]);
      await pool.query(`DELETE FROM presencas WHERE treinamento_id = ?`, [id]);
      await pool.query(`DELETE FROM avaliacoes WHERE treinamento_id = ?`, [id]);
      await pool.query(`DELETE FROM materiais_avaliativos WHERE treinamento_id = ?`, [id]);
      await pool.query(`DELETE FROM treinamentos WHERE id = ?`, [id]);

      registrarAuditoria({
        usuario: req.user,
        acao: "excluir",
        entidade: "treinamento",
        entidadeId: id,
        resumo: `${req.user?.nome || "Alguém"} excluiu o treinamento "${antes?.tema || "?"}" (${antes?.cliente || "?"}) e todos os dados relacionados (presenças, aulas, avaliações, participantes)`,
        dadosAntes: antes,
        ip: req.ip,
      });

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
    multiTenant: true, // Sprint 1
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
      "necessidade_id",
    ],
    orderBy: "id DESC",
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor", "treinando")],
    createMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    updateMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    deleteMiddlewares: [authRequired, authorizeRoles("coordenador")],
    auditoria: {
      entidade: "treinamento",
      resumoCriar: (dados) => `Criou o treinamento "${dados.tema || "?"}" (${dados.cliente || "?"})`,
      resumoEditar: (antes, depois) => `Editou o treinamento "${antes?.tema || "?"}" (${antes?.cliente || "?"})`,
    },
  })
);

app.get(
  "/api/treinamentos/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Fase 4 (isolamento multi-tenant): esta rota era a única do CRUD de
      // treinamentos sem checagem de empresa_id — qualquer coordenador/
      // supervisor/instrutor conseguia ler o detalhe de um treinamento de
      // outra empresa só sabendo o id. Corrigido para exigir o mesmo tenant,
      // igual ao DELETE /api/treinamentos/:id logo abaixo.
      const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
      const params = req.empresaId ? [id, req.empresaId] : [id];

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
          supervisor,
          necessidade_id
        FROM treinamentos
        WHERE id = ?${tenantCheck}
        LIMIT 1
        `,
        params
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
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  getParticipantesByTreinamento
);

// FIX: rota POST que o frontend chama ao adicionar participante manualmente.
// A função createParticipanteTreinamento existia no controller e no module.exports,
// mas nunca havia sido importada nem registrada — causando Erro 404 na tela de participantes.
app.post(
  "/api/treinamentos/:id/participantes",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  createParticipanteTreinamento
);

app.post(
  "/api/treinamentos/importar-participantes",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
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
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  deleteParticipanteTreinamento
);

app.post(
  "/api/treinamentos/participantes/excluir-lote",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
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
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  deleteTurmaAula
);

app.post(
  "/api/turma-aulas/gerar-cronograma",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
  gerarCronogramaTurma
);

app.post(
  "/api/turma-aulas/duplicar",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor"),
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
    multiTenant: true, // antes sem isolamento — presenças de tenants diferentes ficavam misturadas
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
    auditoria: {
      entidade: "presenca",
      resumoEditar: (antes, depois) =>
        `Editou retroativamente a chamada de "${antes?.treinando_nome || "?"}" em ${antes?.data_chamada || "?"} (de "${antes?.status || "?"}" para "${depois.status || antes?.status || "?"}")`,
      resumoExcluir: (antes) => `Excluiu o registro de chamada de "${antes?.treinando_nome || "?"}" em ${antes?.data_chamada || "?"}`,
    },
  })
);

/**
 * Fase 4 (isolamento multi-tenant, 08/09/2026): o CRUD de /api/avaliacoes já
 * é multiTenant (empresa_id da própria linha é validado certinho), mas
 * nunca conferia se o `treinamento_id` enviado pertence à mesma empresa —
 * um coordenador conseguia criar/editar uma avaliação com empresa_id=A
 * (a sua) mas treinamento_id apontando pra uma turma de outra empresa. A
 * própria linha continuava "invisível" pro dashboard de quem criou (que
 * filtra por avaliacoes.empresa_id), mas o analyticsController (NPS,
 * efetividade, resumo) junta avaliacoes com treinamentos e filtra pelo
 * empresa_id de TREINAMENTOS — essa nota fabricada acabava contaminando
 * o NPS/efetividade da OUTRA empresa.
 */
async function validarTreinamentoDaAvaliacao(data, req) {
  if (data.treinamento_id && req.empresaId) {
    const [rows] = await pool.query(
      `SELECT id FROM treinamentos WHERE id = ? AND empresa_id = ? LIMIT 1`,
      [data.treinamento_id, req.empresaId]
    );
    if (!rows.length) {
      const erro = new Error("O treinamento informado não pertence à sua empresa.");
      erro.status = 400;
      throw erro;
    }
  }
  return data;
}

app.use(
  "/api/avaliacoes",
  createCrudRouter({
    table: "avaliacoes",
    multiTenant: true, // antes sem isolamento — notas de tenants diferentes ficavam misturadas
    beforeWrite: validarTreinamentoDaAvaliacao, // Fase 4
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
    auditoria: {
      entidade: "avaliacao",
      resumoCriar: (dados) => `Lançou avaliação "${dados.titulo || "?"}" para "${dados.treinando_nome || "?"}"`,
      resumoEditar: (antes, depois) => {
        const mudouNota =
          ("nota_prova" in depois && String(depois.nota_prova) !== String(antes?.nota_prova)) ||
          ("nota_qualidade" in depois && String(depois.nota_qualidade) !== String(antes?.nota_qualidade));
        const alvo = antes?.treinando_nome || `#${antes?.id}`;
        return mudouNota
          ? `Corrigiu/alterou a nota da avaliação "${antes?.titulo || "?"}" de "${alvo}"`
          : `Editou a avaliação "${antes?.titulo || "?"}" de "${alvo}"`;
      },
      resumoExcluir: (antes) => `Excluiu a avaliação "${antes?.titulo || "?"}" de "${antes?.treinando_nome || "?"}"`,
    },
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

// Usada pela página do treinando (/responder-avaliacao). Antes o treinando
// batia direto em /api/materiais-avaliativos (403, role não autorizada) e a
// página ficava com a lista de provas sempre vazia — bug real, não só visual.
app.get(
  "/api/materiais-avaliativos-disponiveis",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  listMateriaisAvaliativosDisponiveis
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

// FIX 2 + 3: rotas explícitas da biblioteca usando o controller dedicado.
// Resolve o upload (que era 404) e os campos categoria/publico/status
// que o createCrudRouter anterior ignorava silenciosamente.
app.get(
  "/api/biblioteca",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  listBiblioteca
);

app.post(
  "/api/biblioteca",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  createBiblioteca
);

app.put(
  "/api/biblioteca/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  updateBiblioteca
);

app.delete(
  "/api/biblioteca/:id",
  authRequired,
  authorizeRoles("coordenador"),
  deleteBiblioteca
);

app.post(
  "/api/biblioteca/upload",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  (req, res, next) => {
    uploadBiblioteca.single("arquivo")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ ok: false, message: err.message || "Falha no upload do arquivo" });
      }
      return next();
    });
  },
  uploadBibliotecaArquivo
);

// Sprint 3: Trilhas relacionais — rotas dedicadas (substituem entityCrud)
// Etapas agora são registros em trilha_etapas, não mais JSON em trilhas_aprendizagem.etapas
app.get(
  "/api/trilhas",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  listTrilhas
);
// Precisa vir ANTES de "/api/trilhas/:id" — senão "progresso" seria
// interpretado como o :id.
app.get(
  "/api/trilhas/progresso",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  getProgressoBulk
);
app.get(
  "/api/trilhas/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  getTrilha
);
app.post(
  "/api/trilhas",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  createTrilha
);
app.put(
  "/api/trilhas/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  updateTrilha
);
app.delete(
  "/api/trilhas/:id",
  authRequired,
  authorizeRoles("coordenador"),
  deleteTrilha
);
app.get(
  "/api/trilhas/:id/progresso",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  getProgresso
);
app.get(
  "/api/trilhas/:id/progresso/exportar",
  authRequired,
  authorizeRoles("coordenador", "supervisor"),
  exportarProgresso
);
app.post(
  "/api/trilhas/:id/etapas/:etapaId/concluir",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  marcarEtapaConcluida
);

// Sprint 1: convertido de GET para POST — TRUNCATE nunca pode ser GET
// Fase 4 (isolamento multi-tenant): TRUNCATE esvazia a tabela inteira — não
// existe "TRUNCATE só da minha empresa". Com authorizeRoles("coordenador"),
// qualquer coordenador de qualquer empresa apagava os dados de TODAS as
// empresas de uma vez. Restrito a super_admin (não há nenhum botão no
// frontend que chame esta rota hoje — confirmado por busca no código —
// então essa restrição não tira nenhuma funcionalidade em uso).
app.post(
  "/api/zerar-dashboard",
  authRequired,
  requireSuperAdmin,
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

// Sprint 1: convertido de GET para POST
// Fase 4 (isolamento multi-tenant): mesmo motivo do /api/zerar-dashboard —
// o `?truncate=1` também esvazia as tabelas centrais por inteiro, de todas
// as empresas. Restrito a super_admin.
app.post(
  "/api/importar-dashboard",
  authRequired,
  requireSuperAdmin,
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

// Sprint 3: Certificados
app.get(
  "/api/certificados",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  listCertificados
);
app.get(
  "/api/certificados/verificar",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  verificarCertificado
);
// Preview: calcula frequência/nota sem gravar, para o coordenador conferir
// antes de emitir de fato.
app.get(
  "/api/certificados/preview",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  previewCertificado
);
app.post(
  "/api/certificados/emitir",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  emitirCertificado
);

// Sprint 3: Minhas Turmas — self-service do treinando
// Retorna treinamentos em que o usuário logado está inscrito (match por email)
app.get(
  "/api/minhas-turmas",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  async (req, res) => {
    try {
      const userEmail = req.user?.email;
      const userName  = req.user?.nome;
      const perfil    = String(req.user?.perfil || "").toLowerCase().trim();
      const empresaId = req.empresaId ?? null;

      let rows;

      if (["coordenador", "supervisor"].includes(perfil)) {
        // Gestores veem todas as turmas do tenant
        const tenantWhere = empresaId ? "WHERE t.empresa_id = ?" : "";
        const params = empresaId ? [empresaId] : [];
        [rows] = await pool.query(
          `SELECT t.*, COUNT(tp.id) AS total_participantes
           FROM treinamentos t
           LEFT JOIN treinamento_participantes tp ON tp.treinamento_id = t.id
           ${tenantWhere}
           GROUP BY t.id
           ORDER BY t.id DESC`,
          params
        );
      } else {
        // Instrutores: turmas onde são instrutores
        // Treinandos: turmas onde estão inscritos como participantes
        if (perfil === "instrutor") {
          [rows] = await pool.query(
            `SELECT t.*, COUNT(tp.id) AS total_participantes
             FROM treinamentos t
             LEFT JOIN treinamento_participantes tp ON tp.treinamento_id = t.id
             WHERE LOWER(t.instrutor) = LOWER(?)
               ${empresaId ? "AND t.empresa_id = ?" : ""}
             GROUP BY t.id
             ORDER BY t.id DESC`,
            empresaId ? [userName, empresaId] : [userName]
          );
        } else {
          // Treinando: por nome — treinamento_participantes não tem coluna
          // de e-mail (nem nunca teve: a query anterior referenciava
          // "tp.email" e "tp.status", nenhuma das duas existente no schema
          // real — DESCRIBE treinamento_participantes só tem
          // "status_presenca" — o que fazia essa rota quebrar com 500 pra
          // QUALQUER treinando que a acessasse. Corrigido junto da Fase 3
          // ao testar "Minhas Turmas"/"Minhas Conquistas" ponta a ponta.
          [rows] = await pool.query(
            `SELECT DISTINCT t.*, tp.status_presenca AS status_participante
             FROM treinamentos t
             JOIN treinamento_participantes tp ON tp.treinamento_id = t.id
             WHERE LOWER(tp.nome) = LOWER(?)
             ${empresaId ? "AND t.empresa_id = ?" : ""}
             ORDER BY t.id DESC`,
            empresaId ? [userName, empresaId] : [userName]
          );
        }
      }

      return res.json(rows || []);
    } catch (error) {
      console.error("[minhas-turmas]", error.message);
      return res.status(500).json({ ok: false, message: "Erro ao buscar turmas", error: error.message });
    }
  }
);

// ─── Sprint 5: Analytics & KPIs ─────────────────────────────────────────────
// Acessível a coordenadores, supervisores e super_admin.
// req.empresaId filtrado pelo clientMiddleware — super_admin recebe dados globais.

app.get("/api/analytics/resumo",      authRequired, authorizeRoles("coordenador","supervisor","superintendente"), getResumo);
app.get("/api/analytics/horas",       authRequired, authorizeRoles("coordenador","supervisor","superintendente"), getHoras);
app.get("/api/analytics/nps",         authRequired, authorizeRoles("coordenador","supervisor","superintendente"), getNps);
app.get("/api/analytics/efetividade", authRequired, authorizeRoles("coordenador","supervisor","superintendente"), getEfetividade);
app.get("/api/analytics/roi",         authRequired, authorizeRoles("coordenador","supervisor","superintendente"), getRoi);
app.get("/api/analytics/exportar",    authRequired, authorizeRoles("coordenador","supervisor","superintendente"), exportarIndicadores);

// ─────────────────────────────────────────────────────────────────────────────

// ─── Sprint 4: Admin / Super-Admin ───────────────────────────────────────────
// Todas as rotas /api/admin/* exigem autenticação + perfil super_admin.
// requireSuperAdmin retorna 403 imediatamente para qualquer outro perfil.

app.get(  "/api/admin/stats",                  authRequired, requireSuperAdmin, getGlobalStats);
app.get(  "/api/admin/planos",                 authRequired, requireSuperAdmin, listPlanos);
app.get(  "/api/admin/empresas",               authRequired, requireSuperAdmin, listEmpresas);
app.get(  "/api/admin/empresas/:id",           authRequired, requireSuperAdmin, getEmpresa);
app.post( "/api/admin/empresas",               authRequired, requireSuperAdmin, createEmpresa);
app.put(  "/api/admin/empresas/:id",           authRequired, requireSuperAdmin, updateEmpresa);
app.post( "/api/admin/empresas/:id/toggle-ativo", authRequired, requireSuperAdmin, toggleAtivo);
app.delete("/api/admin/empresas/:id",            authRequired, requireSuperAdmin, deleteEmpresa);

// ─────────────────────────────────────────────────────────────────────────────

// Sprint 1: authRequired adicionado — esta rota estava sem proteção
// Fase 4 (isolamento multi-tenant): faltava authorizeOceanAccess aqui — era
// a única das 4 rotas do Oceano sem essa checagem, então qualquer usuário
// autenticado (mesmo sem o perfil/flag do Oceano) conseguia ler/criar/editar/
// excluir etapas de jornada. O isolamento por empresa continuava valendo
// (não vazava dado de outro tenant), mas o controle de acesso ao módulo
// Oceano em si estava furado para este uma rota.
app.use("/api/jornadas-etapas", authRequired, authorizeOceanAccess, jornadasEtapasRoutes);
app.use("/api/jornadas-desenvolvimento", authRequired, authorizeOceanAccess, jornadasDesenvolvimentoRoutes);
app.use("/api/acoes-desenvolvimento", authRequired, authorizeOceanAccess, acoesDesenvolvimentoRoutes);
app.use("/api/coaching-planos", authRequired, authorizeOceanAccess, coachingPlanosRoutes);

// FIX 1: rota de jornada-participantes registrada junto com as rotas do Oceano
app.use("/api/jornada-participantes", authRequired, authorizeOceanAccess, jornadaParticipantesRoutes);

// Capacidade x Realizado (CH por instrutor / CH efetiva do time) — o
// controller e a migration já existiam, mas nunca tinham sido conectados:
// faltava tanto o serviço (backend/src/services/capacidadeResolver.js, agora
// criado) quanto este app.use(). Calculado 100% a partir do que já é
// registrado no fluxo normal (turma criada + cronograma/chamada) — não exige
// nenhum lançamento manual adicional do instrutor ou da coordenação.
app.use(
  "/api/capacidade",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  capacidadeRoutes
);

// Scorecard de instrutor (CH + frequência + avaliação + NPS, mensal/
// trimestral) — item 2 da visão de universidade corporativa (ver
// claude/visao-plataforma-educativa-instrutor-2026-09.md no projeto).
// Coordenador/supervisor/superintendente veem qualquer instrutor (ou todos);
// o próprio instrutor também acessa, mas só o próprio scorecard — o
// controller ignora um ?instrutor= diferente do usuário logado nesse caso,
// mesmo padrão de auto-escopo já usado para o perfil treinando em
// avaliacoesTreinandosController.
app.get(
  "/api/desempenho-instrutor",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente", "instrutor"),
  getDesempenhoInstrutor
);
app.get(
  "/api/desempenho-instrutor/exportar",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente", "instrutor"),
  getDesempenhoExportar
);

// Resumo executivo do mês corrente (time todo) — item 5: plugar no bloco
// executivo do Dashboard ("Oceano"), do mesmo jeito que a Capacidade já faz
// com /capacidade/alertas. Só quem acessa o Dashboard (coordenador/
// supervisor) e superintendente — não faz sentido pro perfil instrutor,
// que já tem a própria leitura em "Meu Desempenho".
app.get(
  "/api/desempenho-instrutor/resumo-executivo",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  getResumoExecutivoDesempenho
);

// ── Módulo R&S — import do controller ──────────────────────────────────────
const {
  listar:           listarRPs,
  criar:            criarRP,
  detalhe:          detalheRP,
  editar:           editarRP,
  excluir:          excluirRP,
  getSites:         getRSSites,
  getProdutos:      getRSProdutos,
  getDashboard:     getRSDashboard,
  getRelatorio:     getRSRelatorio,
  exportar:         exportarRS,
  importarPlanilha: importarRSPlanilha,
  listarUsuariosRS,
  criarUsuarioRS,
} = require("./controllers/rsController");

// ── R&S — rotas ─────────────────────────────────────────────────────────────
// Leitura: coordenador_rs + gestor_rs | Escrita: coordenador_rs apenas
app.get   ("/api/rs/sites",     authRequired, authorizeRoles("coordenador_rs","gestor_rs"), getRSSites);
app.get   ("/api/rs/produtos",  authRequired, authorizeRoles("coordenador_rs","gestor_rs"), getRSProdutos);
app.get   ("/api/rs/dashboard", authRequired, authorizeRoles("coordenador_rs","gestor_rs"), getRSDashboard);
app.get   ("/api/rs/relatorio", authRequired, authorizeRoles("coordenador_rs","gestor_rs"), getRSRelatorio);
app.get   ("/api/rs/exportar",  authRequired, authorizeRoles("coordenador_rs","gestor_rs"), exportarRS);
app.get   ("/api/rs/rps",       authRequired, authorizeRoles("coordenador_rs","gestor_rs"), listarRPs);
app.post  ("/api/rs/rps",       authRequired, authorizeRoles("coordenador_rs"),              criarRP);
app.get   ("/api/rs/rps/:id",   authRequired, authorizeRoles("coordenador_rs","gestor_rs"), detalheRP);
app.put   ("/api/rs/rps/:id",   authRequired, authorizeRoles("coordenador_rs"),              editarRP);
app.delete("/api/rs/rps/:id",   authRequired, authorizeRoles("coordenador_rs"),              excluirRP);
// Importação de planilha histórica (xlsx do Google Sheets)
app.post  ("/api/rs/importar",  authRequired, authorizeRoles("coordenador_rs"), upload.single("arquivo"), importarRSPlanilha);
// Gestão de usuários R&S (sem precisar do /usuarios do T&D)
app.get   ("/api/rs/usuarios",  authRequired, authorizeRoles("coordenador_rs"), listarUsuariosRS);
app.post  ("/api/rs/usuarios",  authRequired, authorizeRoles("coordenador_rs"), criarUsuarioRS);
// ─────────────────────────────────────────────────────────────────────────────

// Fase 2 — disparo manual dos jobs de e-mail (além do agendamento automático
// em jobs/scheduler.js). Útil para testar sem esperar o horário do cron, e
// para reenviar sob demanda caso um envio automático falhe.
app.post(
  "/api/admin/jobs/rodar-pendencias",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  async (req, res) => {
    try {
      const resultado = await rodarDigestPendencias();
      return res.json({ ok: true, resultado });
    } catch (error) {
      console.error("Erro ao rodar digest de pendências:", error);
      return res.status(500).json({ ok: false, message: "Erro ao rodar o resumo de pendências.", error: error.message });
    }
  }
);

app.post(
  "/api/admin/jobs/rodar-lembretes",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  async (req, res) => {
    try {
      const resultado = await rodarLembretesAula();
      return res.json({ ok: true, resultado });
    } catch (error) {
      console.error("Erro ao rodar lembretes de aula:", error);
      return res.status(500).json({ ok: false, message: "Erro ao rodar os lembretes de aula.", error: error.message });
    }
  }
);

app.post(
  "/api/admin/jobs/rodar-conquistas",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  async (req, res) => {
    try {
      const resultado = await rodarCalculoConquistas();
      return res.json({ ok: true, resultado });
    } catch (error) {
      console.error("Erro ao calcular conquistas:", error);
      return res.status(500).json({ ok: false, message: "Erro ao calcular conquistas.", error: error.message });
    }
  }
);

// Fase 3 — "Minhas Conquistas" (gamificação de treinando E de instrutor,
// sem custo/sem IA — ver services/gamificacaoService.js). Qualquer perfil
// autenticado consulta a própria lista, sob o próprio nome (mesmo
// auto-escopo de "minhas-turmas"/"Meu Desempenho") — o tipo de entidade é
// derivado do próprio perfil logado (instrutor → 'instrutor', qualquer
// outro perfil → 'treinando'). Coordenador/supervisor/superintendente pode
// consultar qualquer pessoa via ?nome=&tipo= (visão gerencial).
app.get("/api/minhas-conquistas", authRequired, async (req, res) => {
  try {
    const perfil = String(req.user?.perfil || "").toLowerCase();
    const podeConsultarOutro = ["coordenador", "supervisor", "superintendente"].includes(perfil);
    const nome = (podeConsultarOutro && req.query.nome) ? req.query.nome : req.user?.nome;
    const tipo = (podeConsultarOutro && req.query.tipo === "instrutor") || perfil === "instrutor"
      ? "instrutor"
      : "treinando";

    if (!nome) {
      return res.status(400).json({ message: "Nome não informado." });
    }

    const conquistas = await listarConquistas(req.empresaId || null, tipo, nome);
    return res.json({ nome, tipo, conquistas });
  } catch (error) {
    console.error("Erro ao buscar conquistas:", error);
    return res.status(500).json({ message: "Erro ao buscar conquistas." });
  }
});

// Fase 3 — "análise de comentários" das respostas de NPS do treinando. Sem
// IA/LLM (decisão do Ramon) — classificação por palavra-chave em português,
// ver services/analiseComentariosService.js. Calculada sob demanda (não é
// cacheada — é uma consulta pontual da coordenação, com filtros livres).
// Instrutor só analisa os próprios comentários (auto-escopo, mesmo padrão
// de "Meu Desempenho"); coordenador/supervisor/superintendente pode
// filtrar por qualquer turma/instrutor/cliente/período.
app.get(
  "/api/analise-comentarios",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente", "instrutor"),
  async (req, res) => {
    try {
      const perfil = String(req.user?.perfil || "").toLowerCase();
      const instrutor = perfil === "instrutor" ? req.user?.nome : (req.query.instrutor || undefined);

      const resultado = await getAnaliseComentarios({
        empresaId: req.empresaId || null,
        treinamentoId: req.query.treinamento_id ? Number(req.query.treinamento_id) : undefined,
        instrutor,
        cliente: req.query.cliente || undefined,
        inicio: req.query.inicio || undefined,
        fim: req.query.fim || undefined,
      });

      return res.json(resultado);
    } catch (error) {
      console.error("Erro na análise de comentários:", error);
      return res.status(500).json({ message: "Erro ao analisar comentários." });
    }
  }
);

// Fase 3 — "resumo executivo automático" do Dashboard (bloco Oceano). Sem
// IA/LLM (decisão do Ramon: "vamos seguir sem custo por enquanto") — texto
// fixo por template, ver services/resumoExecutivoService.js. Normalmente
// serve o resumo já cacheado pelo job das 07h (jobs/pendenciasDigest.js);
// se ainda não houver cache para hoje, gera na hora (sem cachear) para a
// tela nunca ficar vazia. Mesmas roles do Dashboard/resumo de desempenho.
app.get(
  "/api/dashboard/resumo-executivo",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  async (req, res) => {
    try {
      const empresaId = req.empresaId || null;
      const cacheado = await getResumoCacheadoDoDia(empresaId);
      if (cacheado) {
        return res.json({ texto: cacheado.texto, gerado_em: cacheado.gerado_em, cache: true });
      }

      const resumo = await montarResumoEmpresa(empresaId);
      const texto = gerarTextoResumo(resumo);
      return res.json({ texto, gerado_em: new Date().toISOString(), cache: false });
    } catch (error) {
      console.error("Erro ao buscar resumo executivo:", error);
      return res.status(500).json({ message: "Erro ao buscar o resumo executivo." });
    }
  }
);

const PORT = process.env.PORT || 3000;

async function iniciarAplicacao() {
  try {
    await runMigrations();
    iniciarAgendamentos();

    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  } catch (error) {
    console.error("Erro crítico ao iniciar o servidor:", error);
    process.exit(1);
  }
}

iniciarAplicacao();
