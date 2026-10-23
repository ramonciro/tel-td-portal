const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const createCrudRouter = require("./routes/entityCrud");
const pool = require("./lib/db");
const { runMigrations } = require("./database/migrate");
const { authRequired, authorizeRoles, requireSuperAdmin } = require("./middlewares/auth");
const { filtroClientesSQL, usuarioTemAcessoAoCliente } = require("./lib/acessoCliente");
const { escopoPerfilFor } = require("./lib/perfilScope");
const { resolverPessoa, pessoaIdDoUsuario } = require("./services/pessoasService");
const { condicaoIdentidade } = require("./lib/identidadeTreinando");

// Fase 2 (roadmap de competitividade): automações por e-mail — resumo diário
// de pendências para coordenadores e lembrete de aula do dia seguinte para
// instrutores. Ver backend/src/jobs/.
const { iniciarAgendamentos } = require("./jobs/scheduler");
const {
  erroDeConexao,
  iniciarMonitoramento,
  marcarMigracoesOk,
  registrarTentativaMigracao,
  protecaoIndisponibilidade,
  snapshot: snapshotSaude,
  sondarBanco,
} = require("./lib/saudeBanco");
const { rodarBackup, statusBackup } = require("./services/backupService");
const { rodarDigestPendencias, montarResumoEmpresa } = require("./jobs/pendenciasDigest");
const { rodarLembretesAula } = require("./jobs/lembretesAula");
const { rodarCalculoConquistas } = require("./jobs/conquistasJob");
const { rodarCertificadosAutomaticos } = require("./jobs/certificadosAutomaticos");
const { gerarTextoResumo, getResumoCacheadoDoDia } = require("./services/resumoExecutivoService");
const instrutoresTurmaCtrl = require("./controllers/instrutoresTurmaController");
const { condicaoInstrutor } = require("./lib/instrutoresTurma");
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

// Cadastro único de pessoas — Fase 0 (22/09/2026)
const pessoasRoutes = require("./routes/pessoasRoutes");

// Coaching individual + KPIs do Ambiente Metodologia (20/09/2026)
const coachingIndividualRoutes = require("./routes/coachingIndividualRoutes");
const metodologiaKpisRoutes = require("./routes/metodologiaKpisRoutes");
// Perfil comportamental (Lobo/Gato/Tubarão/Águia + DISC) — mesmo pacote, pedido do Ramon
const perfilComportamentalRoutes = require("./routes/perfilComportamentalRoutes");
// Lista de clientes exclusiva da Metodologia (20/09/2026, pedido do Ramon) —
// nunca vinculada à tabela `clientes` da Treinamento, ver migrate.js passo 42.
const metodologiaClientesRoutes = require("./routes/metodologiaClientesRoutes");
const oficinaTalentosRoutes = require("./routes/oficinaTalentosRoutes");
const oficinaTalentosPublicRoutes = require("./routes/oficinaTalentosPublicRoutes");
const jornadaPresencaRoutes = require("./routes/jornadaPresencaRoutes");
const jornadaDesenvolvimentoRoutes = require("./routes/jornadaDesenvolvimentoRoutes");
const trilhaPessoasRoutes = require("./routes/trilhaPessoasRoutes");
const turmaPresencaGradeRoutes = require("./routes/turmaPresencaGradeRoutes");
const capacidadeRoutes = require("./routes/capacidadeRoutes");
const acessoInicialRoutes = require("./routes/acessoInicialRoutes");
const avisosRoutes = require("./routes/avisosRoutes");
const fechamentoCtrl = require("./controllers/fechamentoMensalController");
const instrutoresCtrl = require("./controllers/instrutoresController");
const celulaBabyCtrl = require("./controllers/celulaBabyController");
const conteudoCtrl = require("./controllers/conteudoController");
const conteudoIndCtrl = require("./controllers/conteudoIndicadoresController");
const conteudoTbtCtrl = require("./controllers/conteudoTbtController");
const rotinaCtrl = require("./controllers/rotinaController");
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
  exportarRelatorioPresenca,
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
  baixarModeloImportacaoParticipantes,
  exportarPrimeiraAula,
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
const { lancarAvaliacaoParaTurma } = require("./controllers/avaliacoesLoteController");
const { CRITERIOS: NPS_CRITERIOS } = require("./lib/npsQuestionario");

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
  gerarCronogramaAutomatico,
  duplicarPlanoAulas,
  getResumoTurmaAulas,
} = require("./controllers/turmaAulasController");

// Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026)
const {
  listarSalas,
  criarSala,
  atualizarSala,
  desativarSala,
  disponibilidadeSalas,
} = require("./controllers/salasController");
const {
  listarTurmasElegiveis: listarTurmasAvaliacaoTecnica,
  obterListaNominal,
  exportarListaNominal,
  salvarDadosBancarios,
} = require("./controllers/reembolsoTransporteController");
const { buscarConflitosSala, turmaEhRetroativa } = require("./services/salaConflitoService");
const { normalizeSubtipo } = require("./lib/subtipos");
const {
  listar: listarSubtipos,
  criar: criarSubtipo,
  atualizar: atualizarSubtipo,
  desativar: desativarSubtipo,
} = require("./controllers/subtiposController");
const { tenantScopeFor } = require("./lib/tenantScope");

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
  arquivoUrlBiblioteca,
} = require("./controllers/bibliotecaController");
const { pastaUploads, exigirAssinatura } = require("./lib/uploadAssinado");

const app = express();

// Varredura 20/10/2026: o portal roda atrás do proxy do Railway. Sem isto o
// Express enxerga o IP do proxy em req.ip, então o IP gravado na Auditoria era
// o mesmo para todo mundo e não dava para limitar tentativas por IP.
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Cabeçalhos de segurança básicos (sem dependência nova). A API só devolve JSON
// e arquivos para download; nada aqui precisa ser embutido em outra página.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  next();
});
// Pacote 2 (débito técnico, 2026-09): esta instância genérica (planilhas de
// importação — participantes, R&S) não tinha nenhum limite de tamanho — um
// arquivo enorme enviado por qualquer usuário autenticado consumia memória
// do processo inteiro (multer.memoryStorage carrega tudo em RAM) antes de
// qualquer validação de conteúdo. 15MB é folgado para uma planilha real.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Pacote 2: wrapper único para transformar erro de multer (tipo/tamanho) em
// JSON 400 — sem isso, o erro cai no handler padrão do Express (HTML) em
// qualquer rota de upload. Usado nas rotas de planilha; a Biblioteca já tinha
// o próprio wrapper inline desde o Pacote 1.
function comUploadTratado(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        const tamanho = err.code === "LIMIT_FILE_SIZE";
        return res.status(400).json({
          ok: false,
          message: tamanho ? "Arquivo maior que o limite permitido (15MB)." : (err.message || "Falha no upload do arquivo"),
        });
      }
      return next();
    });
  };
}

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

// Resiliência (21/10/2026): com o banco fora (ou as migrações ainda rodando) as
// rotas /api respondem 503 na hora, com mensagem clara — em vez de o navegador
// esperar minutos. Fica logo depois do CORS para o 503 chegar legível ao
// frontend. Só /api/health* continua respondendo. Ver lib/saudeBanco.js.
app.use(protecaoIndisponibilidade);

// Verificações de saúde — sem login, sem tocar nos dados.
//  /api/health        → o processo está de pé (SEMPRE 200; use no healthcheck
//                        da hospedagem, para ela não reiniciar o servidor só
//                        porque o banco caiu).
//  /api/health/banco  → 200 se o banco responde, 503 se não (use no monitor
//                        externo de disponibilidade, ex.: UptimeRobot).
//  /api/health/backup → 503 se o último backup externo tem mais de 36 h.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", ...snapshotSaude() });
});
app.get("/api/health/banco", async (req, res) => {
  const ok = await sondarBanco();
  res.status(ok ? 200 : 503).json({ status: ok ? "ok" : "fora", ...snapshotSaude() });
});
app.get("/api/health/backup", (req, res) => {
  const st = statusBackup();
  if (!st.configurado) return res.json({ status: "desligado" });
  const horas = st.horas_desde_ultimo_ok;
  if (horas !== null && horas > 36) {
    return res.status(503).json({ status: "atrasado", horas_desde_ultimo_ok: horas });
  }
  return res.json({
    status: horas === null ? "sem_registro" : "ok",
    horas_desde_ultimo_ok: horas,
    ultimo_ok: st.ultimo ? st.ultimo.ok : null,
  });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Arquivos enviados (Biblioteca) são PRIVADOS (16/10/2026). Antes, qualquer
// pessoa com o endereço abria o arquivo, sem login. Agora o /uploads só
// responde com um link assinado e de curta duração (5 min), gerado pela rota
// autenticada GET /api/biblioteca/:id/arquivo-url — que confere empresa,
// cliente e perfil de quem pede. Sem assinatura (ou vencida): 403.
// A pasta fica em UPLOADS_DIR ou ./uploads; no Railway, monte um volume em
// /app/uploads para os arquivos sobreviverem aos deploys.
app.use(
  "/uploads",
  (req, res, next) => {
    // Arquivos enviados nunca são interpretados pelo navegador como página
    // (HTML/script): sempre tratados como o tipo declarado, sem "adivinhar".
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    // 21/10/2026: o portal (Vercel) mostra a folha da prova/PDF dentro de um
    // <iframe> apontando para este endereço (Railway). O "X-Frame-Options:
    // DENY" global (varredura de 20/10) bloqueava isso — o navegador mostrava
    // "A conexão com ...railway.app foi recusada". Aqui, e só aqui, liberamos
    // a incorporação pelas páginas do próprio portal. O arquivo continua
    // exigindo o link assinado de 5 min (exigirAssinatura, logo abaixo).
    // FRAME_ANCESTORS (opcional, separado por espaço) troca a lista padrão —
    // útil se o portal ganhar domínio próprio.
    const ancestrais = (process.env.FRAME_ANCESTORS || "https://*.vercel.app").trim();
    res.removeHeader("X-Frame-Options");
    res.setHeader("Content-Security-Policy", `frame-ancestors 'self' ${ancestrais}`);
    next();
  },
  exigirAssinatura,
  express.static(pastaUploads(), { index: false, dotfiles: "deny" })
);
// Sprint 1: clientMiddleware aplicado globalmente — popula req.empresaId
// via empresa_id do JWT para todas as rotas protegidas
app.use(clientMiddleware);

app.get(
  "/api/dashboard/treinamentos",
  authRequired,
  // Pacote Superintendente (24/09/2026): adicionado "superintendente" — ela
  // vê o Dashboard de todos os tenants (getDashboardTreinamentos já usa
  // tenantScopeFor). Sem isso ela recebia 403 antes mesmo de chegar ao
  // controller.
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  getDashboardTreinamentos
);

app.get(
  "/api/dashboard/treinamentos/exportar",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  exportarTreinamentos
);

// Fonte única de presença + status de turma (cronograma > legado > snapshot),
// usada pelas páginas Presenças e Treinamentos.
app.get(
  "/api/presenca-resumo",
  authRequired,
  // Pacote Superintendente: ela vê a Gestão de Turmas de todos os tenants
  // (presencaResumoController.js já tem "superintendente" no
  // CROSS_TENANT_ROLES, junto com assistente_treinamento).
  // 23/10/2026: o analista de conteúdo só LÊ a lista de turmas (precisa saber o que foi realizado para criar o material).
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando", "assistente_treinamento", "superintendente", "analista_conteudo"),
  listarResumoGeral
);
app.get(
  "/api/presenca-resumo/:treinamento_id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "superintendente", "analista_conteudo"),
  obterResumoPorTreinamento
);

// Pedido do Ramon (29/09/2026): relatório da tela Gestão de Turmas
// (Presenças) "melhor estruturado" — recebe as linhas já filtradas/calculadas
// pelo front (mesma lógica de sempre) e devolve um .xlsx com cabeçalho
// agrupado, tipos de verdade e cor por status/faixa de presença.
app.post(
  "/api/presenca-resumo/exportar-relatorio",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo", "superintendente"),
  exportarRelatorioPresenca
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
  authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo", "treinando"),
  obterMural
);
app.post(
  "/api/turma-mural/:treinamento_id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo"),
  criarPublicacaoHandler
);
app.put(
  "/api/turma-mural/publicacao/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo"),
  editarPublicacaoHandler
);
app.delete(
  "/api/turma-mural/publicacao/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo"),
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
    res.json({ status: "API Portal T&D online" });
  } catch (error) {
    console.error("[index]", error.message || error);
    res.status(500).json({
      status: "API online sem conexão com banco"});
  }
});

app.use("/api/auth", authRoutes);

// ATENÇÃO: este app.use(prefixo) roda para QUALQUER rota que comece com
// /api/dashboard, incluindo /api/dashboard/resumo-executivo (definida mais
// abaixo, linha ~1944) — não só a rota "/" de dashboardRoutes. Achado no
// Pacote Superintendente (24/09/2026): "superintendente" faltava aqui, então
// ela recebia 403 nesse gate antes mesmo de chegar na rota de
// resumo-executivo (que já autorizava "superintendente" há mais tempo, mas
// nunca era alcançada por causa deste gate anterior).
app.use(
  "/api/dashboard",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  dashboardRoutes
);

app.use(
  "/api/clientes",
  createCrudRouter({
    table: "clientes",
    fields: ["nome", "segmento", "status", "gestor", "descricao"],
    orderBy: "nome ASC",
    multiTenant: true, // Sprint 1
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo")],
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
/**
 * Fase 1 (padronização de gestão de usuários, 22/09/2026): "coordenadores
 * de módulo" (hoje coordenador_rs para R&S, metodologia para o módulo de
 * Metodologia — ver lib/perfilScope.js) ganharam acesso a esta mesma rota
 * pela Gestão de Usuários, no lugar de atalhos isolados (ex.:
 * rsController.criarUsuarioRS) que inseriam direto na tabela sem passar
 * por essas mesmas validações. Acesso "à mesma tela" não pode virar acesso
 * a usuário de fora do próprio módulo — por isso, quando o ator tem um
 * escopo de perfil definido, barramos aqui: criar fora do escopo, editar
 * um usuário que hoje está fora do escopo, ou mudar o perfil de alguém
 * para fora do escopo. A listagem (quem aparece) é filtrada à parte, no
 * `listFiltro` da rota — este hook só cobre escrita.
 */
function validarEscopoPerfil(dados, req, ctx) {
  const escopo = escopoPerfilFor(req);
  if (!escopo) return; // ator sem escopo (coordenador/supervisor/superintendente) — sem restrição

  const perfilAtualDoAlvo = ctx.antes ? String(ctx.antes.perfil || "").toLowerCase() : null;

  if (ctx.operation === "update" && perfilAtualDoAlvo && !escopo.includes(perfilAtualDoAlvo)) {
    const erro = new Error("Você não tem permissão para editar este usuário.");
    erro.status = 403;
    throw erro;
  }

  if ("perfil" in dados) {
    const perfilNovo = String(dados.perfil || "").toLowerCase();
    if (!escopo.includes(perfilNovo)) {
      const erro = new Error("Você só pode atribuir perfis do seu próprio módulo.");
      erro.status = 403;
      throw erro;
    }
  } else if (ctx.operation === "create") {
    // Criar sem perfil nenhum ficaria sem dono de escopo — exige explícito.
    const erro = new Error("Selecione o perfil do usuário.");
    erro.status = 400;
    throw erro;
  }
}

async function sanitizarEscritaUsuario(data, req, ctx) {
  const dados = { ...data };
  const perfilAtor = String(req.user?.perfil || "").toLowerCase();
  const atorEhSuperAdmin = perfilAtor === "super_admin";

  // `pessoa_id` só pode ser escrito por este próprio hook (ver mais abaixo,
  // a partir do CPF) — nunca aceito direto do corpo da requisição, senão
  // qualquer chamada à API conseguiria ligar a conta a qualquer pessoa de
  // qualquer empresa só informando o id.
  delete dados.pessoa_id;

  if ("perfil" in dados) {
    const perfilNovo = String(dados.perfil || "").toLowerCase();
    if (perfilNovo === "super_admin" && !atorEhSuperAdmin) {
      const erro = new Error("Você não tem permissão para atribuir o perfil super_admin.");
      erro.status = 403;
      throw erro;
    }
  }

  validarEscopoPerfil(dados, req, ctx);

  if (ctx.operation === "update" && "empresa_id" in dados && !atorEhSuperAdmin) {
    // Só o super_admin pode mover um usuário entre empresas por esta rota.
    delete dados.empresa_id;
  }

  if ("senha" in dados && dados.senha) {
    dados.senha = await bcrypt.hash(String(dados.senha), 10);
  }

  // Cadastro único de pessoas (Fase 2, item 2 — 28/09/2026): campo opcional
  // de CPF na Gestão de Usuários (qualquer perfil — decisão do Ramon).
  // `cpf` nunca é coluna de `usuarios` (por isso não está em `fields`,
  // logo nunca vai pro INSERT/UPDATE sozinho) — serve só, de passagem,
  // pra resolver/ligar a pessoa correspondente via `resolverPessoa()`,
  // o mesmo mecanismo já usado no resto do Cadastro Único. Sem CPF
  // informado, nada muda: conta continua sem pessoa_id, login por e-mail,
  // exatamente como sempre foi.
  const cpfInformado = dados.cpf != null ? String(dados.cpf).replace(/\D/g, "") : "";
  if (cpfInformado) {
    const nomeParaResolver = ("nome" in dados ? dados.nome : ctx.antes?.nome) || null;
    if (nomeParaResolver && req.empresaId) {
      try {
        const { pessoa } = await resolverPessoa(
          {
            empresaId: req.empresaId,
            nome: nomeParaResolver,
            cpf: cpfInformado,
            cliente: "cliente" in dados ? dados.cliente : ctx.antes?.cliente,
          },
          pool
        );
        dados.pessoa_id = pessoa.id;
      } catch (erroPessoa) {
        console.error("[usuarios] resolverPessoa falhou:", erroPessoa.message || erroPessoa);
      }
    }
  }
  delete dados.cpf;

  return dados;
}

/**
 * Fase 1 (22/09/2026) — mesma régua de escopo, agora para exclusão (não
 * passa por beforeWrite). Ver validarEscopoPerfil acima.
 */
function bloquearExclusaoForaDoEscopo(antes, req) {
  const escopo = escopoPerfilFor(req);
  if (!escopo) return;
  const perfilAlvo = String(antes?.perfil || "").toLowerCase();
  if (!escopo.includes(perfilAlvo)) {
    const erro = new Error("Você não tem permissão para excluir este usuário.");
    erro.status = 403;
    throw erro;
  }
}

// Gestão de Usuários — exportação em Excel (restaurada em 14/10/2026: a rota
// existia desde o redesign de 16/09 e foi perdida num upload de index.js
// mais antigo em 19/09). Registrada ANTES do mount genérico abaixo, senão o
// router de CRUD trataria "exportar" como um :id. Respeita o mesmo recorte da
// listagem: tenant do ator e, para coordenador_rs/metodologia, só os perfis do
// próprio módulo.
const PERFIL_LABEL_EXPORT = {
  coordenador: "Coordenador",
  supervisor: "Supervisor",
  instrutor: "Instrutor",
  treinando: "Treinando",
  superintendente: "Superintendente",
  coaching: "Coaching",
  metodologia: "Metodologia",
  assistente_treinamento: "Assistente de Treinamento",
  analista_conteudo: "Analista de Conteúdo",
  coordenador_rs: "Coordenador R&S",
  gestor_rs: "Gestor R&S",
  super_admin: "Super Admin",
};

app.get(
  "/api/usuarios/exportar",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "superintendente", "coaching", "metodologia", "coordenador_rs"),
  async (req, res) => {
    try {
      const { empresaId } = tenantScopeFor(req, {});
      const ids = String(req.query.ids || "")
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isInteger(v) && v > 0);

      const condicoes = [];
      const params = [];
      if (empresaId !== null && empresaId !== undefined) {
        condicoes.push("empresa_id = ?");
        params.push(empresaId);
      }
      const escopo = escopoPerfilFor(req);
      if (escopo && escopo.length) {
        condicoes.push(`perfil IN (${escopo.map(() => "?").join(",")})`);
        params.push(...escopo);
      }
      if (ids.length) {
        condicoes.push(`id IN (${ids.map(() => "?").join(",")})`);
        params.push(...ids);
      }
      const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";

      const [linhas] = await pool.query(
        `SELECT nome, email, perfil, cliente, ativo, criado_em
         FROM usuarios ${where}
         ORDER BY nome`,
        params
      );

      const { novoWorkbook, adicionarTabela } = require("./lib/excelExport");
      const wb = novoWorkbook();
      adicionarTabela(wb, {
        nomeAba: "Usuários",
        colunas: [
          { titulo: "Nome", chave: "nome" },
          { titulo: "E-mail", chave: "email" },
          { titulo: "Perfil", chave: "perfil" },
          { titulo: "Operações vinculadas", chave: "operacoes" },
          { titulo: "Status", chave: "status" },
          { titulo: "Criado em", chave: "criado_em", formato: "data" },
        ],
        linhas: linhas.map((u) => ({
          nome: u.nome,
          email: u.email || "-",
          perfil: PERFIL_LABEL_EXPORT[String(u.perfil || "").toLowerCase()] || u.perfil || "-",
          operacoes: u.cliente || "-",
          status: u.ativo ? "Ativo" : "Inativo",
          criado_em: u.criado_em,
        })),
      });

      const buf = await wb.xlsx.writeBuffer();
      registrarAuditoria({
        usuario: req.user,
        acao: "exportar",
        entidade: "usuario",
        entidadeId: ids.length === 1 ? ids[0] : null,
        resumo: `${req.user?.nome || "Alguém"} exportou ${linhas.length} usuário(s) em Gestão de Usuários${ids.length ? ` (ids: ${ids.join(",")})` : ""}`,
        ip: req.ip,
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="usuarios.xlsx"');
      return res.send(Buffer.from(buf));
    } catch (error) {
      console.error("[usuarios] exportar:", error.message);
      return res.status(500).json({ ok: false, message: "Erro ao exportar usuários" });
    }
  }
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
      "pode_acessar_oceano_desenvolvimento",
      "empresa_id",
      // Cadastro único de pessoas (Fase 2, item 2 — 28/09/2026): ligação
      // com `pessoas`, resolvida em sanitizarEscritaUsuario() a partir do
      // CPF opcional do formulário — nunca vem direto do corpo da
      // requisição (não seria seguro deixar o front escolher o pessoa_id
      // de qualquer jeito), só o próprio beforeWrite escreve aqui.
      "pessoa_id",
    ],
    multiTenant: true, // Sprint 1
    beforeWrite: sanitizarEscritaUsuario, // Fase 4 (+ escopo por perfil, Fase 1 22/09/2026)
    beforeDelete: bloquearExclusaoForaDoEscopo, // Fase 1 (22/09/2026)
    // Fase 1 (22/09/2026): coordenador_rs e metodologia só listam usuários
    // do próprio módulo por esta rota — ver lib/perfilScope.js. Quem não
    // tem escopo definido (coordenador, supervisor, instrutor,
    // superintendente, coaching) continua vendo a lista inteira do tenant,
    // sem nenhuma mudança de comportamento.
    listFiltro: (req) => {
      const escopo = escopoPerfilFor(req);
      if (!escopo || !escopo.length) return null;
      return { sql: `perfil IN (${escopo.map(() => "?").join(",")})`, params: escopo };
    },
    hideFields: ["senha"], // Fase 4 — hash da senha nunca sai na listagem
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor", "superintendente", "coaching", "metodologia", "coordenador_rs")],
    createMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "superintendente", "coordenador_rs", "metodologia")],
    updateMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "superintendente", "coordenador_rs", "metodologia")],
    deleteMiddlewares: [authRequired, authorizeRoles("coordenador", "superintendente", "coordenador_rs", "metodologia")],
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
    // Pacote 2 (débito técnico, 2026-09): as 7 exclusões abaixo rodavam como
    // queries soltas no pool, sem transação — se a conexão caísse no meio
    // (ex.: entre apagar turma_aulas e apagar treinamentos), sobrava dado
    // órfão sem chance de rollback. Envolvido numa única transação, no mesmo
    // padrão já usado em createEmpresa/deleteEmpresa (adminController.js).
    const conn = await pool.getConnection();
    try {
      const { id } = req.params;

      // Isolamento por tenant: um coordenador de uma empresa não pode
      // excluir um treinamento de outra empresa mesmo sabendo o id (esta
      // rota é escrita à mão, fora do entityCrud.js, então precisa do mesmo
      // guard manualmente). req.empresaId nulo (ex.: super_admin, ou dado
      // legado sem empresa atribuída) mantém o comportamento antigo.
      const tenantCheck = req.empresaId ? ` AND empresa_id = ${pool.escape(req.empresaId)}` : "";
      const [linhas] = await conn.query(`SELECT * FROM treinamentos WHERE id = ?${tenantCheck}`, [id]);
      const antes = linhas[0] || null;
      if (!antes) {
        conn.release();
        return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
      }

      await conn.beginTransaction();
      await conn.query(`DELETE FROM presenca_aulas WHERE treinamento_id = ?`, [id]);
      await conn.query(`DELETE FROM turma_aulas WHERE treinamento_id = ?`, [id]);
      await conn.query(`DELETE FROM treinamento_participantes WHERE treinamento_id = ?`, [id]);
      await conn.query(`DELETE FROM presencas WHERE treinamento_id = ?`, [id]);
      await conn.query(`DELETE FROM avaliacoes WHERE treinamento_id = ?`, [id]);
      await conn.query(`DELETE FROM materiais_avaliativos WHERE treinamento_id = ?`, [id]);
      await conn.query(`DELETE FROM treinamentos WHERE id = ?`, [id]);
      await conn.commit();
      conn.release();

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
      try { await conn.rollback(); } catch (_) {}
      conn.release();
      console.error("[treinamentos] excluir:", error.message);
      return res.status(500).json({
        ok: false,
        message: "Erro ao excluir treinamento",
      });
    }
  }
);

// Correção de 29/09/2026 (achado ao investigar o pedido do Ramon sobre CH):
// "Carga horária" é um campo de texto livre no formulário ("Ex.: 20h"), e o
// banco guarda em uma coluna DECIMAL. Sem normalizar, um valor digitado no
// formato brasileiro (vírgula decimal, ex.: "0,4") ou com a unidade junto
// ("20h") quebra o UPDATE inteiro da turma com "Incorrect decimal value" —
// erro que Ramon bateu ao tentar salvar uma edição (turma #232, carga_horaria
// = "0,4"). Converte vírgula em ponto e descarta sufixos como "h" antes de
// gravar; se não achar nenhum número no texto, deixa como veio (o UPDATE
// então falha do mesmo jeito, mas por um valor realmente inválido, não por
// formatação regional).
function normalizarCargaHoraria(valor) {
  if (valor === null || valor === undefined) return valor;
  const texto = String(valor).trim().replace(",", ".");
  // Campo vazio: o formulário manda "" e o MySQL de produção (modo estrito)
  // recusa texto vazio em coluna DECIMAL — erro 500 ao criar/editar turma sem
  // carga horária (20/10/2026, turma "Treinamento X Prova SAC"). Vazio = sem CH.
  if (texto === "") return null;
  const match = texto.match(/-?\d+(\.\d+)?/);
  if (!match) {
    const erro = new Error("Carga horária inválida — use só números (ex.: 8 ou 1,5).");
    erro.status = 400;
    throw erro;
  }
  const numero = Number(match[0]);
  if (!Number.isFinite(numero)) {
    const erro = new Error("Carga horária inválida — use só números (ex.: 8 ou 1,5).");
    erro.status = 400;
    throw erro;
  }
  return numero;
}

// Outros campos numéricos opcionais da turma: texto vazio vira "sem valor".
function vazioParaNulo(dados, campos) {
  for (const c of campos) {
    if (c in dados && typeof dados[c] === "string" && dados[c].trim() === "") dados[c] = null;
  }
}

/**
 * Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026) — beforeWrite de
 * /api/treinamentos:
 *   1. Valida subtipo contra a lista fixa (decisão 20 — mesmo padrão de
 *      acoes_desenvolvimento.subtipo, agora com a validação que faltava).
 *   2. Valida hora_inicio/hora_fim (decisão 5) quando informados.
 *   3. Checagem de conflito de sala (decisões 1, 7, 8, 9): bloqueia só
 *      quando a turma não é retroativa — turma já concluída (data_fim no
 *      passado) recebe o cadastro normalmente, sem bloqueio, porque o
 *      conflito nesse caso é só um dado histórico, não um problema real de
 *      agenda (a mesma regra que o painel de disponibilidade usa, ver
 *      salaConflitoService.js).
 *   4. Normaliza carga_horaria (vírgula/unidade) antes de gravar — achado de
 *      29/09/2026, ver normalizarCargaHoraria acima.
 */
async function sanitizarEscritaTreinamento(data, req, ctx) {
  const dados = { ...data };

  // TBT (22/10/2026): um instrutor ADICIONAL também edita a turma. A tela do
  // instrutor manda o próprio nome em "instrutor" — sem esta trava, o co-instrutor
  // ao salvar viraria o instrutor principal. Instrutor nunca troca o principal.
  if (String(req?.user?.perfil || "").toLowerCase().trim() === "instrutor" && ctx?.antes?.id) {
    dados.instrutor = ctx.antes.instrutor;
  }

  if ("subtipo" in dados) {
    dados.subtipo = await normalizeSubtipo(dados.subtipo, ctx?.antes?.subtipo);
  }

  if ("carga_horaria" in dados) {
    dados.carga_horaria = normalizarCargaHoraria(dados.carga_horaria);
  }
  vazioParaNulo(dados, ["valor_passagem_vt", "presenca_minima_pct", "necessidade_id", "sala_id"]);

  const horaInicio = dados.hora_inicio ?? ctx.antes?.hora_inicio ?? null;
  const horaFim = dados.hora_fim ?? ctx.antes?.hora_fim ?? null;
  if ((dados.hora_inicio !== undefined || dados.hora_fim !== undefined) && horaInicio && horaFim) {
    const padraoHora = /^\d{2}:\d{2}(:\d{2})?$/;
    if (!padraoHora.test(String(horaInicio)) || !padraoHora.test(String(horaFim))) {
      const erro = new Error("Horário de início/fim inválido — use o formato HH:MM.");
      erro.status = 400;
      throw erro;
    }
    if (String(horaFim) <= String(horaInicio)) {
      const erro = new Error("O horário de fim precisa ser depois do horário de início.");
      erro.status = 400;
      throw erro;
    }
  }

  const salaId = dados.sala_id !== undefined ? dados.sala_id : ctx.antes?.sala_id;
  const dataInicio = dados.data_inicio ?? dados.data ?? ctx.antes?.data_inicio ?? ctx.antes?.data;
  const dataFim = dados.data_fim ?? ctx.antes?.data_fim;

  if (salaId && dataInicio && dataFim && horaInicio && horaFim) {
    if (!turmaEhRetroativa(dataFim)) {
      const conflitos = await buscarConflitosSala({
        salaId,
        dataInicio,
        dataFim,
        horaInicio,
        horaFim,
        excluirTreinamentoId: ctx.antes?.id || null,
      });
      if (conflitos.length) {
        const c = conflitos[0];
        const erro = new Error(
          `Sala já reservada nesse horário pela turma "${c.tema}" (${c.cliente}), de ${c.hora_inicio} às ${c.hora_fim}.`
        );
        erro.status = 409;
        throw erro;
      }
    }
  }

  return dados;
}

// GET /api/treinamentos/exportar-selecionadas?ids=1,2,3 — Pacote 3 (redesign,
// 16/09/2026): a seleção múltipla de Gestão de Turmas usa esta rota pra
// exportar só as turmas marcadas, no mesmo padrão formatado dos outros
// exports (ver lib/excelExport.js). Precisa ficar ANTES do mount de
// createCrudRouter (linha abaixo) — senão a rota genérica de :id do CRUD
// capturaria "exportar-selecionadas" como se fosse um id.
app.get("/api/treinamentos/exportar-selecionadas", authRequired,
  // Varredura 20/10/2026: antes bastava estar logado (inclusive treinando) e
  // não havia recorte por cliente.
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo", "superintendente"),
  async (req, res) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isInteger(v) && v > 0);
    if (!ids.length) {
      return res.status(400).json({ ok: false, message: "Informe ao menos um id em ?ids=" });
    }

    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: ["assistente_treinamento"] });
    const tenantCheck = empresaId ? " AND empresa_id = ?" : "";
    const placeholders = ids.map(() => "?").join(",");
    const params = empresaId ? [...ids, empresaId] : ids;

    const [linhasTodas] = await pool.query(
      `SELECT id, tema, cliente, instrutor, supervisor, publico, subtipo, status,
              data_inicio, data, data_fim, carga_horaria, participantes, sala_id, sala_outro_local
       FROM treinamentos WHERE id IN (${placeholders})${tenantCheck}
       ORDER BY COALESCE(data_inicio, data) DESC`,
      params
    );
    // Instrutor/supervisor ligados a um cliente só exportam turmas dele (a
    // Assistente, como na listagem, enxerga qualquer cliente).
    const ehAssistente = String(req.user?.perfil || "").toLowerCase() === "assistente_treinamento";
    const linhas = ehAssistente ? linhasTodas : linhasTodas.filter((l) => usuarioTemAcessoAoCliente(req, l.cliente));

    const salaIds = [...new Set(linhas.map((l) => l.sala_id).filter(Boolean))];
    const salaNomePorId = new Map();
    if (salaIds.length) {
      const [salas] = await pool.query(
        `SELECT id, nome FROM salas WHERE id IN (${salaIds.map(() => "?").join(",")})`,
        salaIds
      );
      salas.forEach((s) => salaNomePorId.set(s.id, s.nome));
    }

    const { novoWorkbook, adicionarTabela } = require("./lib/excelExport");
    const wb = novoWorkbook();
    adicionarTabela(wb, {
      nomeAba: "Turmas selecionadas",
      colunas: [
        { titulo: "Turma", chave: "tema", largura: 30 },
        { titulo: "Cliente", chave: "cliente", largura: 20 },
        { titulo: "Instrutor", chave: "instrutor", largura: 22 },
        { titulo: "Supervisor", chave: "supervisor", largura: 22 },
        { titulo: "Público", chave: "publico", largura: 18 },
        { titulo: "Subtipo", chave: "subtipo", largura: 20 },
        { titulo: "Status", chave: "status", largura: 16 },
        { titulo: "Sala", chave: "sala", largura: 18 },
        { titulo: "Data início", chave: "data_inicio", largura: 13, formato: "data" },
        { titulo: "Data fim", chave: "data_fim", largura: 13, formato: "data" },
        { titulo: "Carga horária", chave: "carga_horaria", largura: 13, formato: "decimal1" },
        { titulo: "Participantes previstos", chave: "participantes", largura: 16, formato: "inteiro" },
      ],
      linhas: linhas.map((l) => ({
        tema: l.tema || "-",
        cliente: l.cliente || "-",
        instrutor: l.instrutor || "-",
        supervisor: l.supervisor || "-",
        publico: l.publico || "-",
        subtipo: l.subtipo || "-",
        status: l.status || "-",
        sala: l.sala_outro_local || salaNomePorId.get(l.sala_id) || "-",
        data_inicio: l.data_inicio || l.data || null,
        data_fim: l.data_fim || null,
        carga_horaria: Number(l.carga_horaria || 0),
        participantes: Number(l.participantes || 0),
      })),
    });

    const buf = await wb.xlsx.writeBuffer();
    registrarAuditoria({
      usuario: req.user,
      acao: "exportar",
      entidade: "treinamento",
      // entidade_id no banco é int único — com várias turmas selecionadas
      // não há um id único pra gravar ali, então deixamos null e colocamos
      // a lista completa de ids no resumo (texto) pra manter a rastreabilidade.
      entidadeId: ids.length === 1 ? ids[0] : null,
      resumo: `${req.user?.nome || "Alguém"} exportou ${linhas.length} turma(s) selecionada(s) em Gestão de Turmas (ids: ${ids.join(",")})`,
      ip: req.ip,
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="turmas-selecionadas.xlsx"');
    return res.send(Buffer.from(buf));
  } catch (error) {
    console.error("[treinamentos] exportarSelecionadas:", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao exportar as turmas selecionadas" });
  }
});

app.use(
  "/api/treinamentos",
  createCrudRouter({
    multiTenant: true, // Sprint 1
    // Decisão 12 — Assistente de Treinamento enxerga/edita turmas de
    // qualquer tenant nesta tela (ver entityCrud.js, empresaIdEfetivo, e
    // lib/tenantScope.js para a razão de isso não estar no clientMiddleware).
    crossTenantRoles: ["assistente_treinamento"],
    beforeWrite: sanitizarEscritaTreinamento,
    afterWrite: ({ id, data }) => gerarCronogramaAutomatico({ id, data }), // decisão 21
    table: "treinamentos",
    // Pacote 3 (acesso restrito por cliente, generalizar): até aqui, o
    // recorte por cliente da listagem de turmas era feito só no frontend
    // (a tela escondia as turmas de outro cliente, mas a API sempre
    // devolvia todas as turmas do tenant para qualquer perfil autorizado a
    // listar, inclusive treinando) — "filtro de conveniência", não controle
    // de acesso real. Agora o próprio backend recorta: gestor (coordenador/
    // supervisor/superintendente) continua vendo tudo; instrutor/treinando
    // só veem turmas do(s) próprio(s) cliente(s), ou sem essa restrição
    // quando o usuário não tem cliente vinculado (comportamento anterior
    // preservado para essas contas).
    // Decisão 12: o recorte por cliente abaixo é para instrutor/treinando
    // (isGestor()==false) verem só as turmas do(s) próprio(s) cliente(s) —
    // não pode se aplicar à Assistente de Treinamento, cujo objetivo nesta
    // tela é justamente enxergar turmas de qualquer cliente/tenant. Ela não
    // é gestora (isGestor()==false também pra ela), então sem esta exceção
    // explícita cairia no mesmo filtro por padrão SE algum dia seu cadastro
    // ganhar um valor em `cliente` (hoje fica sem restrição só porque o
    // campo está vazio — não é seguro depender disso). Resolvido aqui, não
    // em filtroClientesSQL/isGestor, para não afetar outras telas que usam
    // as mesmas funções (mesma razão de tenantScopeFor nunca entrar no
    // clientMiddleware — ver lib/tenantScope.js).
    listFiltro: (req) =>
      ["assistente_treinamento", "analista_conteudo"].includes(String(req.user?.perfil || "").toLowerCase())
        ? null
        : filtroClientesSQL(req, "cliente"),
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
      // Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026): campos
      // novos do agendamento de sala e do cronograma automático (decisões
      // 1, 17, 20). Sem isso o beforeWrite (sanitizarEscritaTreinamento)
      // recebe os valores em `dados`, mas o createCrudRouter genérico só
      // grava colunas que estão listadas aqui.
      "hora_inicio",
      "hora_fim",
      "sala_id",
      "sala_outro_local",
      "subtipo",
    ],
    orderBy: "id DESC",
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor", "treinando", "assistente_treinamento", "analista_conteudo")],
    createMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor")],
    updateMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo")],
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
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "treinando", "analista_conteudo"),
  async (req, res) => {
    try {
      const { id } = req.params;

      // 19/10/2026: o treinando vê o treinamento e o cliente da turma em que PARTICIPA (cabeçalho
      // das abas Avaliações/NPS), só com os campos de identificação — nada de gestão
      // (participantes previstos, supervisor, sala, status etc.). Turma em que ele não está = 404.
      if (String(req.user?.perfil || "").toLowerCase() === "treinando") {
        const nomeUsuario = String(req.user?.nome || "").trim();
        const pessoaId = await pessoaIdDoUsuario(req.user?.id);
        const condTp = condicaoIdentidade("tp", "nome", pessoaId, nomeUsuario);
        const [minha] = await pool.query(
          `SELECT t.id, t.tema, t.cliente, t.instrutor, t.carga_horaria, t.data, t.data_inicio, t.data_fim
             FROM treinamentos t
             INNER JOIN treinamento_participantes tp ON tp.treinamento_id = t.id AND ${condTp.sql}
            WHERE t.id = ?${req.empresaId ? " AND t.empresa_id = ?" : ""}
            LIMIT 1`,
          [...condTp.params, id, ...(req.empresaId ? [req.empresaId] : [])]
        );
        if (!minha.length) return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
        return res.json(minha[0]);
      }

      // Fase 4 (isolamento multi-tenant): esta rota era a única do CRUD de
      // treinamentos sem checagem de empresa_id — qualquer coordenador/
      // supervisor/instrutor conseguia ler o detalhe de um treinamento de
      // outra empresa só sabendo o id. Corrigido para exigir o mesmo tenant,
      // igual ao DELETE /api/treinamentos/:id logo abaixo.
      // Decisão 12: Assistente de Treinamento enxerga o detalhe de qualquer
      // tenant (mesma exceção usada no restante das telas dela).
      const { empresaId: empresaIdEfetivo } = tenantScopeFor(req, {
        crossTenantRoles: ["assistente_treinamento"],
      });
      const tenantCheck = empresaIdEfetivo ? " AND empresa_id = ?" : "";
      const params = empresaIdEfetivo ? [id, empresaIdEfetivo] : [id];

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
          necessidade_id,
          hora_inicio,
          hora_fim,
          sala_id,
          sala_outro_local,
          subtipo
        FROM treinamentos
        WHERE id = ?${tenantCheck}
        LIMIT 1
        `,
        params
      );

      // Acesso restrito por cliente (varredura 16/10/2026): o detalhe também respeita o cliente do usuário.
      if (!rows.length || !usuarioTemAcessoAoCliente(req, rows[0].cliente)) {
        return res.status(404).json({
          ok: false,
          message: "Treinamento não encontrado",
        });
      }

      return res.json(rows[0]);
    } catch (error) {
      console.error("[index]", error.message || error);
      return res.status(500).json({
        ok: false,
        message: "Erro ao buscar treinamento"});
    }
  }
);

app.get(
  "/api/treinamentos/:id/participantes",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando", "assistente_treinamento", "analista_conteudo"),
  getParticipantesByTreinamento
);

// Instrutores adicionais da turma (TBT, 22/10/2026) — ver controllers/instrutoresTurmaController.js
app.get(
  "/api/treinamentos-instrutores",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  instrutoresTurmaCtrl.mapa
);
app.get(
  "/api/treinamentos/:id/instrutores",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  instrutoresTurmaCtrl.obter
);
app.put(
  "/api/treinamentos/:id/instrutores",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  instrutoresTurmaCtrl.salvar
);

// FIX: rota POST que o frontend chama ao adicionar participante manualmente.
// A função createParticipanteTreinamento existia no controller e no module.exports,
// mas nunca havia sido importada nem registrada — causando Erro 404 na tela de participantes.
app.post(
  "/api/treinamentos/:id/participantes",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  createParticipanteTreinamento
);

app.post(
  "/api/treinamentos/importar-participantes",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  comUploadTratado(upload.single("arquivo")),
  importarParticipantesExcel
);

// Pedido do Ramon (29/09/2026): "Excel base para importação dos treinandos
// nas turmas" — modelo pronto pra baixar, já com Cliente/Turma/Supervisor
// desta turma preenchidos (ver baixarModeloImportacaoParticipantes).
app.get(
  "/api/treinamentos/:id/modelo-importacao-participantes",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  baixarModeloImportacaoParticipantes
);

app.get(
  "/api/treinamentos/:id/exportar-primeira-aula",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  exportarPrimeiraAula
);

app.post(
  "/api/treinamentos/salvar-chamada",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  salvarChamadaParticipantes
);

app.delete(
  "/api/treinamentos/participantes/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  deleteParticipanteTreinamento
);

app.post(
  "/api/treinamentos/participantes/excluir-lote",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  deleteParticipantesTreinamentoBulk
);

app.get(
  "/api/turma-aulas",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  listTurmaAulas
);

app.get(
  "/api/turma-aulas/resumo/:treinamento_id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  getResumoTurmaAulas
);

app.get(
  "/api/turma-aulas/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  getTurmaAulaById
);

app.post(
  "/api/turma-aulas",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  createTurmaAula
);

app.put(
  "/api/turma-aulas/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  updateTurmaAula
);

app.delete(
  "/api/turma-aulas/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  deleteTurmaAula
);

app.post(
  "/api/turma-aulas/gerar-cronograma",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  gerarCronogramaTurma
);

app.post(
  "/api/turma-aulas/duplicar",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  duplicarPlanoAulas
);

app.get(
  "/api/presenca-aulas",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  listarPresencaAula
);

app.post(
  "/api/presenca-aulas/inicializar",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  inicializarPresencaAula
);

app.post(
  "/api/presenca-aulas/salvar",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  salvarPresencaAula
);

app.get(
  "/api/presenca-aulas/resumo/:turma_aula_id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  resumoPresencaAula
);

// Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026) — decisões 1-9 e
// 13. Catálogo de salas é global (sem empresa_id, por design — ver
// salasController.js/salaConflitoService.js): qualquer perfil autorizado
// enxerga a mesma lista de salas de todos os tenants, e a checagem de
// conflito de horário também é sempre cross-tenant. Decisão 13: cadastro/
// edição/desativação de sala é só Super Admin (bypass automático do
// authorizeRoles) e a Assistente de Treinamento — coordenador (e os demais
// perfis que criam/editam turma) só CONSULTA o catálogo, pra escolher sala
// no formulário; não administra.
app.get(
  "/api/salas",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  listarSalas
);

app.get(
  "/api/salas/disponibilidade",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  disponibilidadeSalas
);

// Decisão 13 revista (ajuste pós-entrega, 15/09/2026): originalmente só a
// Assistente de Treinamento administrava o catálogo de salas; Ramon (que
// usa o sistema como Coordenador) relatou não conseguir editar o nome de
// uma sala — o Coordenador estava mesmo travado, propositalmente, mas na
// prática é ele quem cadastra/ajusta o catálogo no dia a dia. Liberado
// também para Coordenador, mesmo padrão adotado para Subtipos logo abaixo.
app.post(
  "/api/salas",
  authRequired,
  authorizeRoles("coordenador", "assistente_treinamento"),
  criarSala
);

app.put(
  "/api/salas/:id",
  authRequired,
  authorizeRoles("coordenador", "assistente_treinamento"),
  atualizarSala
);

app.delete(
  "/api/salas/:id",
  authRequired,
  authorizeRoles("coordenador", "assistente_treinamento"),
  desativarSala
);

// Ajuste pós-entrega do Pacote Salas (15/09/2026): catálogo de subtipo/
// subdivisão, editável por quem usa (Ramon pediu — antes era lista fixa no
// código). Leitura liberada pra todo mundo que preenche subtipo em algum
// formulário (Treinamentos, Ações de Desenvolvimento); administração
// (criar/editar/desativar) fica com Coordenador e Assistente de Treinamento
// (Super Admin sempre passa pelo bypass automático do authorizeRoles) —
// mesmo padrão de Salas depois da revisão da decisão 13 acima.
app.get(
  "/api/subtipos",
  authRequired,
  // "metodologia" lê o catálogo para o formulário de Ações do Mapa de
  // Desenvolvimento (antes esse formulário usava uma lista fixa no código).
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo", "metodologia"),
  listarSubtipos
);

app.post(
  "/api/subtipos",
  authRequired,
  authorizeRoles("coordenador", "assistente_treinamento"),
  criarSubtipo
);

app.put(
  "/api/subtipos/:id",
  authRequired,
  authorizeRoles("coordenador", "assistente_treinamento"),
  atualizarSubtipo
);

app.delete(
  "/api/subtipos/:id",
  authRequired,
  authorizeRoles("coordenador", "assistente_treinamento"),
  desativarSubtipo
);

// Decisões 14/16/19: Presença Nominal / Reembolso de Transporte — restrito a
// quem pode ver CPF (coordenador e a Assistente; super_admin sempre passa
// pelo bypass do authorizeRoles). O controller filtra por tenant salvo para
// a Assistente (crossTenantRoles interno), e audita toda visualização/
// exportação via registrarAuditoria.
app.get(
  "/api/reembolso-transporte/turmas",
  authRequired,
  authorizeRoles("coordenador", "assistente_treinamento"),
  listarTurmasAvaliacaoTecnica
);

app.get(
  "/api/reembolso-transporte/:treinamento_id",
  authRequired,
  authorizeRoles("coordenador", "assistente_treinamento"),
  obterListaNominal
);

app.get(
  "/api/reembolso-transporte/:treinamento_id/exportar",
  authRequired,
  authorizeRoles("coordenador", "assistente_treinamento"),
  exportarListaNominal
);

// Ajuste 15/09/2026 (tarde): dados bancários/PIX por CPF, usados na
// planilha de VT no modelo do financeiro — ver reembolsoTransporteController.js.
app.put(
  "/api/reembolso-transporte/:treinamento_id/dados-bancarios",
  authRequired,
  authorizeRoles("coordenador", "assistente_treinamento"),
  salvarDadosBancarios
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

// 19/10/2026: lança a avaliação (nota em branco) para todos os participantes da turma.
// Fica ANTES do CRUD de /api/avaliacoes para não ser engolida pela rota /:id.
app.post(
  "/api/avaliacoes-lote",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo"),
  lancarAvaliacaoParaTurma
);

// Perguntas do questionário de NPS (mantidas no servidor para a tela e a validação não divergirem).
app.get("/api/nps-questionario", authRequired, (req, res) => res.json({ criterios: NPS_CRITERIOS }));

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
    listMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo")],
    createMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo")],
    updateMiddlewares: [authRequired, authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo")],
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
  // Pacote Superintendente (24/09/2026): adicionado "superintendente" — ela
  // clica numa turma a partir do Dashboard (que já é cross-tenant pra ela) e
  // esta rota, sem essa liberação, respondia 403 para turmas de outro
  // tenant. Ver tenantScopeFor em frequenciaIndividualController.js para o
  // isolamento de dados correspondente.
  authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo", "superintendente", "treinando"),
  getFrequenciaIndividual
);

// "Meu histórico" do treinando: as notas das avaliações dele. /api/avaliacoes
// (CRUD) é só da equipe; aqui o servidor devolve apenas as linhas da própria
// pessoa (pelo nome da conta, dentro da empresa).
app.get("/api/minhas-avaliacoes", authRequired, async (req, res) => {
  try {
    const nome = String(req.user?.nome || "").trim();
    if (!nome) return res.json([]);
    const empresaId = req.empresaId ?? null;
    const turmaFiltro = Number(req.query?.treinamento_id);
    const filtrarTurma = Number.isInteger(turmaFiltro) && turmaFiltro > 0;
    const [rows] = await pool.query(
      `SELECT id, treinamento_id, titulo, nota_nps, nota_qualidade, nota_prova, treinando_nome
         FROM avaliacoes
        WHERE LOWER(TRIM(treinando_nome)) = LOWER(TRIM(?))
          ${empresaId ? "AND empresa_id = ?" : ""}
          ${filtrarTurma ? "AND treinamento_id = ?" : ""}
        ORDER BY id DESC`,
      [nome, ...(empresaId ? [empresaId] : []), ...(filtrarTurma ? [turmaFiltro] : [])]
    );
    return res.json(rows);
  } catch (error) {
    console.error("[minhas-avaliacoes]", error.message);
    return res.status(500).json({ ok: false, message: "Erro ao buscar avaliações" });
  }
});

app.get(
  "/api/avaliacoes-treinandos",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo", "treinando"),
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
  authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo"),
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
  authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo"),
  createMaterialAvaliativo
);

app.put(
  "/api/materiais-avaliativos/:id",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "analista_conteudo"),
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

app.get(
  "/api/biblioteca/:id/arquivo-url",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "treinando"),
  arquivoUrlBiblioteca
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
        const tamanho = err.code === "LIMIT_FILE_SIZE";
        return res.status(400).json({
          ok: false,
          message: tamanho ? "Arquivo maior que o limite permitido (25MB)." : (err.message || "Falha no upload do arquivo"),
        });
      }
      return next();
    });
  },
  uploadBibliotecaArquivo
);

// Sprint 3: Trilhas relacionais — rotas dedicadas (substituem entityCrud)
// Etapas agora são registros em trilha_etapas, não mais JSON em trilhas_aprendizagem.etapas
//
// Módulo Metodologia e Desenvolvimento (16/09/2026): Trilhas saiu do escopo
// de Treinamento e virou, junto com o Mapa de Desenvolvimento, um módulo à
// parte — "módulo fica só pra gestão" (Ramon): treinando e instrutor
// perderam o acesso (inclusive a marcar etapa concluída/ver progresso), e
// coordenador/supervisor só acessam através do novo perfil dedicado
// "metodologia" (mesmo padrão do R&S — perfil próprio, não reaproveita os
// perfis de Treinamento).
app.get(
  "/api/trilhas",
  authRequired,
  authorizeRoles("metodologia"),
  listTrilhas
);
// Precisa vir ANTES de "/api/trilhas/:id" — senão "progresso" seria
// interpretado como o :id.
app.get(
  "/api/trilhas/progresso",
  authRequired,
  authorizeRoles("metodologia"),
  getProgressoBulk
);
app.get(
  "/api/trilhas/:id",
  authRequired,
  authorizeRoles("metodologia"),
  getTrilha
);
app.post(
  "/api/trilhas",
  authRequired,
  authorizeRoles("metodologia"),
  createTrilha
);
app.put(
  "/api/trilhas/:id",
  authRequired,
  authorizeRoles("metodologia"),
  updateTrilha
);
app.delete(
  "/api/trilhas/:id",
  authRequired,
  authorizeRoles("metodologia"),
  deleteTrilha
);
app.get(
  "/api/trilhas/:id/progresso",
  authRequired,
  authorizeRoles("metodologia"),
  getProgresso
);
app.get(
  "/api/trilhas/:id/progresso/exportar",
  authRequired,
  authorizeRoles("metodologia"),
  exportarProgresso
);
app.post(
  "/api/trilhas/:id/etapas/:etapaId/concluir",
  authRequired,
  authorizeRoles("metodologia"),
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
      // 19/10/2026 (decisão do Ramon): trava de confirmação — a ação apaga TUDO
      // (inclusive usuários) e só roda se o corpo trouxer confirmacao: "ZERAR".
      if (String(req.body?.confirmacao || "").trim() !== "ZERAR") {
        return res.status(400).json({
          ok: false,
          message: 'Confirmação obrigatória: envie confirmacao = "ZERAR" para apagar toda a base.',
        });
      }
      registrarAuditoria({
        usuario: req.user, acao: "excluir", entidade: "base", entidadeId: null,
        resumo: `${req.user?.nome || "Alguém"} zerou a base inteira (zerar-dashboard)`, ip: req.ip,
      });
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
        message: "Erro ao zerar base."});
    }
  }
);

// /api/importar-dashboard (importação antiga do Excel do Dashboard) removida em 19/10/2026,
// por decisão do Ramon: estava quebrada e sem uso. A importação de notas por planilha/prova em papel a substitui.

// Certificado da Oficina de Talentos — o treinando baixa SÓ o dele (ver
// meusCertificados). Registrado antes de qualquer rota /api/certificados/:x.
app.get(
  "/api/certificados/oficina/meus",
  authRequired,
  authorizeRoles("treinando", "coordenador", "supervisor", "instrutor"),
  require("./controllers/oficinaCertificadosController").meusCertificados
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
             WHERE ${condicaoInstrutor("t")}
               ${empresaId ? "AND t.empresa_id = ?" : ""}
             GROUP BY t.id
             ORDER BY t.id DESC`,
            empresaId
              ? [String(userName || "").trim().toLowerCase(), String(userName || "").trim().toLowerCase(), empresaId]
              : [String(userName || "").trim().toLowerCase(), String(userName || "").trim().toLowerCase()]
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
      return res.status(500).json({ ok: false, message: "Erro ao buscar turmas"});
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
//
// Módulo Metodologia e Desenvolvimento (16/09/2026): authorizeOceanAccess
// (perfil coordenador/superintendente + flag pode_acessar_oceano_desenvolvimento)
// foi substituído por authorizeRoles("metodologia") — perfil dedicado, sem
// flag, mesmo padrão do módulo R&S.
app.use("/api/jornadas-etapas", authRequired, authorizeRoles("metodologia"), jornadasEtapasRoutes);
app.use("/api/jornadas-desenvolvimento", authRequired, authorizeRoles("metodologia"), jornadasDesenvolvimentoRoutes);
app.use("/api/acoes-desenvolvimento", authRequired, authorizeRoles("metodologia"), acoesDesenvolvimentoRoutes);
app.use("/api/coaching-planos", authRequired, authorizeRoles("metodologia"), coachingPlanosRoutes);

// FIX 1: rota de jornada-participantes registrada junto com as rotas do Oceano
app.use("/api/jornada-participantes", authRequired, authorizeRoles("metodologia"), jornadaParticipantesRoutes);

// Cadastro único de pessoas — Fase 0 (22/09/2026): só a busca por enquanto,
// preparação pra Fase 2 (nenhuma tela chama isto ainda). Sem
// authorizeRoles porque precisa ficar disponível pra qualquer tela de
// cadastro do portal (Turmas, Mapa de Desenvolvimento, Tripulação,
// Usuários, RS) — o filtro por empresa vem do clientMiddleware
// (req.empresaId, aplicado globalmente acima) e o CPF já sai mascarado
// para quem não tem perfil autorizado (ver pessoasController.js).
app.use("/api/pessoas", authRequired, pessoasRoutes);

// Códigos de primeiro acesso dos treinandos (21/10/2026) — troca a senha única
// por um código individual; a coordenação gera, renova e baixa a lista.
// Sino de avisos (21/10/2026) — qualquer perfil logado; só vê os próprios avisos.
app.use("/api/avisos", authRequired, avisosRoutes);
// Sequência de chamadas em dia (21/10/2026) — só o instrutor, só os próprios dados.
app.get("/api/minha-sequencia", authRequired, authorizeRoles("instrutor"), require("./controllers/sequenciaController").minhaSequencia);

// Fechamento mensal por cliente (21/10/2026). Ler/exportar: coordenação e superintendência;
// fechar/reabrir: só coordenador e supervisor.
const FECH_LER = authorizeRoles("coordenador", "supervisor", "superintendente");
const FECH_ESCREVER = authorizeRoles("coordenador", "supervisor");
app.get("/api/fechamento-mensal/panorama", authRequired, FECH_LER, fechamentoCtrl.panorama);
app.get("/api/fechamento-mensal/exportar", authRequired, FECH_LER, fechamentoCtrl.exportar);
app.get("/api/fechamento-mensal", authRequired, FECH_LER, fechamentoCtrl.obter);
app.post("/api/fechamento-mensal", authRequired, FECH_ESCREVER, fechamentoCtrl.fechar);
app.delete("/api/fechamento-mensal", authRequired, FECH_ESCREVER, fechamentoCtrl.reabrir);
app.use("/api/acesso-inicial", authRequired, authorizeRoles("coordenador", "supervisor", "assistente_treinamento"), acessoInicialRoutes);

// Coaching individual + KPIs do Ambiente Metodologia (20/09/2026, pedido do
// Ramon) — trilha à parte, pessoa a pessoa, e o endpoint de agregação dos
// faróis (adesão ao cronograma, cobertura por cliente, coaching, MPT
// provisório). Mesmo padrão de acesso do resto do módulo.
app.use("/api/coaching-individual", authRequired, authorizeRoles("metodologia"), coachingIndividualRoutes);
app.use("/api/metodologia-kpis", authRequired, authorizeRoles("metodologia"), metodologiaKpisRoutes);
app.use("/api/perfis-comportamentais", authRequired, authorizeRoles("metodologia"), perfilComportamentalRoutes);
app.use("/api/metodologia-clientes", authRequired, authorizeRoles("metodologia"), metodologiaClientesRoutes);

// Oficina de Talentos (13/10/2026, pedido do Ramon) — turmas e inscrições da
// Metodologia. A gestão exige login (perfil metodologia); o link de inscrição
// é PÚBLICO e fica em /api/public/oficina, com limite de tentativas próprio.
app.use("/api/oficina-talentos", authRequired, authorizeRoles("metodologia"), oficinaTalentosRoutes);
app.use("/api/public/oficina", oficinaTalentosPublicRoutes);

// Jornadas — encontros e presença por pessoa (Fase 1, 13/10/2026). Só a
// Metodologia lança a chamada (decisão D do Ramon); super_admin passa pelo
// authorizeRoles. Isolamento por empresa dentro do controller (via jornada).
app.use("/api/jornada-presenca", authRequired, authorizeRoles("metodologia"), jornadaPresencaRoutes);
// Jornadas — desenvolvimento por etapa e evolução (Fase 2, 16/10/2026). Só a Metodologia lança;
// o Perfil 360 lê o resumo pelo pessoasController. Isolamento por empresa dentro do controller.
app.use("/api/jornada-desenvolvimento", authRequired, authorizeRoles("metodologia"), jornadaDesenvolvimentoRoutes);
// Trilhas por pessoa (Fase 3, 16/10/2026) — participantes e progresso lançados pela Metodologia.
app.use("/api/trilha-pessoas", authRequired, authorizeRoles("metodologia"), trilhaPessoasRoutes);

// Treinamentos — grade de presença da turma (pessoas × aulas), PDF e Excel
// (13/10/2026). Mesmos perfis da chamada por aula; super_admin passa.
// Isolamento por ambiente dentro do controller (via turma).
app.use(
  "/api/turma-presenca",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo"),
  turmaPresencaGradeRoutes
);

// Capacidade x Realizado (CH por instrutor / CH efetiva do time) — o
// controller e a migration já existiam, mas nunca tinham sido conectados:
// faltava tanto o serviço (backend/src/services/capacidadeResolver.js, agora
// criado) quanto este app.use(). Calculado 100% a partir do que já é
// registrado no fluxo normal (turma criada + cronograma/chamada) — não exige
// nenhum lançamento manual adicional do instrutor ou da coordenação.
// Varredura 20/10/2026: supervisor e superintendente só LEEM a capacidade; quem
// altera a regra padrão e as metas por instrutor é a coordenação (antes, o
// supervisor também conseguia gravar e apagar metas).
app.use(
  "/api/capacidade",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    return authorizeRoles("coordenador")(req, res, next);
  },
  capacidadeRoutes
);

// Produção de conteúdo (22/10/2026, pedido do Ramon) — pedidos de material dos
// analistas de conteúdo, com Iniciar/Concluir e validação por cliente ou
// coordenação. Ver controllers/conteudoController.js. O analista vê tudo e só
// edita os próprios pedidos (checado no controller); superintendente só lê.
const CONTEUDO_LER = ["coordenador", "supervisor", "assistente_treinamento", "analista_conteudo", "superintendente"];
const CONTEUDO_ESCREVER = ["coordenador", "supervisor", "assistente_treinamento", "analista_conteudo"];
const CONTEUDO_GESTAO = ["coordenador", "supervisor", "assistente_treinamento"];
app.get("/api/conteudo/resumo", authRequired, authorizeRoles(...CONTEUDO_LER), conteudoCtrl.resumo);
// Pacote 2 (23/10/2026): indicadores e Excel. O analista vê a equipe somada e só a própria linha.
app.get("/api/conteudo/indicadores", authRequired, authorizeRoles(...CONTEUDO_LER), conteudoIndCtrl.indicadores);
app.get("/api/conteudo/exportar", authRequired, authorizeRoles("coordenador", "supervisor", "assistente_treinamento", "superintendente"), conteudoIndCtrl.exportar);
// Pacote 3 (23/10/2026): #TBT e séries. A turma realizada é o gatilho do material.
app.get("/api/conteudo/tbt/pendentes", authRequired, authorizeRoles(...CONTEUDO_LER), conteudoTbtCtrl.pendentes);
app.get("/api/conteudo/tbt/dispensadas", authRequired, authorizeRoles(...CONTEUDO_LER), conteudoTbtCtrl.listarDispensadas);
app.post("/api/conteudo/tbt/:id/dispensar", authRequired, authorizeRoles(...CONTEUDO_ESCREVER), conteudoTbtCtrl.dispensar);
app.delete("/api/conteudo/tbt/:id/dispensar", authRequired, authorizeRoles(...CONTEUDO_ESCREVER), conteudoTbtCtrl.desfazerDispensa);
app.get("/api/conteudo/turmas", authRequired, authorizeRoles(...CONTEUDO_ESCREVER), conteudoTbtCtrl.buscarTurmas);
app.get("/api/conteudo/turmas/:id/pedidos", authRequired, authorizeRoles(...CONTEUDO_LER, "instrutor"), conteudoTbtCtrl.pedidosDaTurma);
app.get("/api/conteudo/series", authRequired, authorizeRoles(...CONTEUDO_LER), conteudoTbtCtrl.listarSeries);
app.post("/api/conteudo/series", authRequired, authorizeRoles("coordenador"), conteudoTbtCtrl.salvarSerie);
app.put("/api/conteudo/series/:id", authRequired, authorizeRoles("coordenador"), conteudoTbtCtrl.salvarSerie);
app.get("/api/conteudo/tipos", authRequired, authorizeRoles(...CONTEUDO_LER), conteudoCtrl.listarTipos);
app.post("/api/conteudo/tipos", authRequired, authorizeRoles("coordenador"), conteudoCtrl.salvarTipo);
app.put("/api/conteudo/tipos/:id", authRequired, authorizeRoles("coordenador"), conteudoCtrl.salvarTipo);
app.get("/api/conteudo/analistas", authRequired, authorizeRoles(...CONTEUDO_LER), conteudoCtrl.listarAnalistas);
app.get("/api/conteudo/clientes", authRequired, authorizeRoles(...CONTEUDO_LER), conteudoCtrl.listarClientes);
app.get("/api/conteudo/expediente", authRequired, authorizeRoles(...CONTEUDO_LER), conteudoCtrl.lerExpediente);
app.put("/api/conteudo/expediente", authRequired, authorizeRoles("coordenador"), conteudoCtrl.salvarExpediente);
app.post("/api/conteudo/importar-historico", authRequired, authorizeRoles("coordenador"), conteudoCtrl.importarHistorico);
app.get("/api/conteudo/pedidos", authRequired, authorizeRoles(...CONTEUDO_LER), conteudoCtrl.listarPedidos);
app.post("/api/conteudo/pedidos", authRequired, authorizeRoles(...CONTEUDO_ESCREVER), conteudoCtrl.criarPedido);
app.get("/api/conteudo/pedidos/:id", authRequired, authorizeRoles(...CONTEUDO_LER), conteudoCtrl.detalharPedido);
app.put("/api/conteudo/pedidos/:id", authRequired, authorizeRoles(...CONTEUDO_ESCREVER), conteudoCtrl.atualizarPedido);
app.delete("/api/conteudo/pedidos/:id", authRequired, authorizeRoles("coordenador", "analista_conteudo"), conteudoCtrl.excluirPedido);
app.post("/api/conteudo/pedidos/:id/acao", authRequired, authorizeRoles(...CONTEUDO_ESCREVER), conteudoCtrl.executarAcao);
app.put("/api/conteudo/pedidos/:id/revisao", authRequired, authorizeRoles(...CONTEUDO_GESTAO), conteudoCtrl.definirRevisao);
app.put("/api/conteudo/etapas/:id", authRequired, authorizeRoles(...CONTEUDO_GESTAO), conteudoCtrl.corrigirEtapa);

// Célula baby (16/10/2026) — acompanhamento da curva de aprendizagem feito pelo
// instrutor nos 7 primeiros dias de operação. Ver controllers/celulaBabyController.js.
// Instrutor só enxerga/edita as próprias turmas (checado no controller).
const CELULA_LER = ["coordenador", "assistente_treinamento", "instrutor", "supervisor", "superintendente"];
const CELULA_ESCREVER = ["coordenador", "assistente_treinamento", "instrutor"];
app.get("/api/celulas-baby", authRequired, authorizeRoles(...CELULA_LER), celulaBabyCtrl.listar);
app.get("/api/celulas-baby/:id", authRequired, authorizeRoles(...CELULA_LER), celulaBabyCtrl.detalhar);
app.get("/api/celulas-baby/:id/exportar", authRequired, authorizeRoles(...CELULA_LER), celulaBabyCtrl.exportar);
app.put("/api/celulas-baby/:id", authRequired, authorizeRoles(...CELULA_ESCREVER), celulaBabyCtrl.atualizar);
app.put("/api/celulas-baby/:id/pessoas/:pessoaId", authRequired, authorizeRoles(...CELULA_ESCREVER), celulaBabyCtrl.atualizarPessoa);
app.post("/api/celulas-baby/:id/indicadores", authRequired, authorizeRoles(...CELULA_ESCREVER), celulaBabyCtrl.criarIndicador);
app.post("/api/celulas-baby/:id/indicadores/copiar", authRequired, authorizeRoles(...CELULA_ESCREVER), celulaBabyCtrl.copiarIndicadores);
app.put("/api/celulas-baby/:id/indicadores/:indicadorId", authRequired, authorizeRoles(...CELULA_ESCREVER), celulaBabyCtrl.editarIndicador);
app.delete("/api/celulas-baby/:id/indicadores/:indicadorId", authRequired, authorizeRoles(...CELULA_ESCREVER), celulaBabyCtrl.excluirIndicador);
app.put("/api/celulas-baby/:id/lancamentos", authRequired, authorizeRoles(...CELULA_ESCREVER), celulaBabyCtrl.salvarLancamentos);
app.post("/api/celulas-baby/:id/iniciar", authRequired, authorizeRoles(...CELULA_ESCREVER), celulaBabyCtrl.iniciar);
app.post("/api/celulas-baby/:id/encerrar", authRequired, authorizeRoles(...CELULA_ESCREVER), celulaBabyCtrl.encerrar);
app.post("/api/celulas-baby/:id/reabrir", authRequired, authorizeRoles("coordenador", "assistente_treinamento"), celulaBabyCtrl.reabrir);

// Rotina do instrutor (16/10/2026) — checklist/responsabilidades/diário da Avaliação
// Técnica e atividades do instrutor (somam na CH). Ver controllers/rotinaController.js.
// Instrutor só edita as próprias turmas e atividades (checado no controller).
const ROTINA_LER = ["coordenador", "assistente_treinamento", "instrutor", "supervisor", "superintendente"];
const ROTINA_ESCREVER = ["coordenador", "assistente_treinamento", "instrutor"];
const ROTINA_GESTAO = ["coordenador", "assistente_treinamento"];
// Provas no papel: o analista de conteúdo também importa e lança (Gestão de Turmas completa, 23/10/2026).
const PROVAS_LER = [...ROTINA_LER, "analista_conteudo"];
const PROVAS_ESCREVER = [...ROTINA_ESCREVER, "analista_conteudo"];
// Painel de aderência (Fase 3): leitura; o instrutor vê só as próprias turmas (checado no controller).
const rotinaAderenciaCtrl = require("./controllers/rotinaAderenciaController");
app.get("/api/rotina/aderencia", authRequired, authorizeRoles(...ROTINA_LER), rotinaAderenciaCtrl.painel);
app.get("/api/rotina/aderencia/pendencias", authRequired, authorizeRoles(...ROTINA_LER), rotinaAderenciaCtrl.pendencias);
app.get("/api/rotina/aderencia/exportar", authRequired, authorizeRoles(...ROTINA_LER), rotinaAderenciaCtrl.exportar);
app.get("/api/rotina/turmas/:id", authRequired, authorizeRoles(...ROTINA_LER), rotinaCtrl.estadoDaTurma);
app.put("/api/rotina/turmas/:id/checklist/:itemId", authRequired, authorizeRoles(...ROTINA_ESCREVER), rotinaCtrl.responderChecklist);
app.put("/api/rotina/turmas/:id/tarefas/:tarefaId", authRequired, authorizeRoles(...ROTINA_ESCREVER), rotinaCtrl.marcarTarefa);
app.put("/api/rotina/turmas/:id/diario/:data", authRequired, authorizeRoles(...ROTINA_ESCREVER), rotinaCtrl.salvarDiario);
app.put("/api/rotina/turmas/:id/atividades", authRequired, authorizeRoles(...ROTINA_ESCREVER), rotinaCtrl.escolherAtividades);
app.get("/api/rotina/turmas/:id/avaliacao", authRequired, authorizeRoles(...ROTINA_LER), rotinaCtrl.obterAvaliacao);
app.put("/api/rotina/turmas/:id/avaliacao", authRequired, authorizeRoles(...ROTINA_ESCREVER), rotinaCtrl.salvarAvaliacao);
app.post("/api/rotina/turmas/:id/avaliacao/reabrir", authRequired, authorizeRoles(...ROTINA_GESTAO), rotinaCtrl.reabrirAvaliacao);
app.get("/api/rotina/turmas/:id/avaliacao/exportar", authRequired, authorizeRoles(...ROTINA_LER), rotinaCtrl.exportarAvaliacao);

// Importação de provas feitas no papel (16/10/2026): foto/PDF + lançamento assistido.
// Só a confirmação grava notas; desfazer é da coordenação.
const provasPapelCtrl = require("./controllers/provasPapelController");
app.get   ("/api/provas-papel/turmas/:id", authRequired, authorizeRoles(...PROVAS_LER), provasPapelCtrl.listarDaTurma);
app.post  ("/api/provas-papel/turmas/:id/lotes", authRequired, authorizeRoles(...PROVAS_ESCREVER), provasPapelCtrl.criarLote);
app.get   ("/api/provas-papel/lotes/:id", authRequired, authorizeRoles(...PROVAS_LER), provasPapelCtrl.obterLote);
app.put   ("/api/provas-papel/lotes/:id", authRequired, authorizeRoles(...PROVAS_ESCREVER), provasPapelCtrl.salvarLote);
app.delete("/api/provas-papel/lotes/:id", authRequired, authorizeRoles(...PROVAS_ESCREVER), provasPapelCtrl.excluirLote);
app.post  ("/api/provas-papel/lotes/:id/confirmar", authRequired, authorizeRoles(...PROVAS_ESCREVER), provasPapelCtrl.confirmarLote);
app.post  ("/api/provas-papel/lotes/:id/desfazer", authRequired, authorizeRoles(...ROTINA_GESTAO), provasPapelCtrl.desfazerLote);
app.get   ("/api/provas-papel/lotes/:id/exportar", authRequired, authorizeRoles(...PROVAS_LER), provasPapelCtrl.exportarLote);
app.get   ("/api/provas-papel/lotes/:id/modelo", authRequired, authorizeRoles(...PROVAS_ESCREVER), provasPapelCtrl.modeloPlanilha);
app.post  ("/api/provas-papel/lotes/:id/planilha", authRequired, authorizeRoles(...PROVAS_ESCREVER), comUploadTratado(upload.single("arquivo")), provasPapelCtrl.lerPlanilha);
app.post  ("/api/provas-papel/lotes/:id/arquivos", authRequired, authorizeRoles(...PROVAS_ESCREVER), comUploadTratado(upload.single("arquivo")), provasPapelCtrl.anexarArquivo);
app.delete("/api/provas-papel/lotes/:id/arquivos/:arquivoId", authRequired, authorizeRoles(...PROVAS_ESCREVER), provasPapelCtrl.removerArquivo);
app.get   ("/api/provas-papel/lotes/:id/arquivos/:arquivoId/url", authRequired, authorizeRoles(...PROVAS_LER), provasPapelCtrl.urlArquivo);
app.post("/api/rotina/registros", authRequired, authorizeRoles(...ROTINA_ESCREVER), rotinaCtrl.criarRegistro);
app.put("/api/rotina/registros/:id", authRequired, authorizeRoles(...ROTINA_ESCREVER), rotinaCtrl.editarRegistro);
app.delete("/api/rotina/registros/:id", authRequired, authorizeRoles(...ROTINA_ESCREVER), rotinaCtrl.excluirRegistro);
app.get("/api/rotina/minhas-atividades", authRequired, authorizeRoles(...ROTINA_ESCREVER), rotinaCtrl.listarMinhas);
app.get("/api/rotina/minhas-atividades/exportar", authRequired, authorizeRoles(...ROTINA_ESCREVER), rotinaCtrl.exportarRegistros);
app.get("/api/rotina/catalogo", authRequired, authorizeRoles(...ROTINA_LER), rotinaCtrl.listarCatalogo);
app.post("/api/rotina/catalogo", authRequired, authorizeRoles(...ROTINA_ESCREVER), rotinaCtrl.criarCatalogo);
app.put("/api/rotina/catalogo/:id", authRequired, authorizeRoles(...ROTINA_GESTAO), rotinaCtrl.editarCatalogo);
app.get("/api/rotina/modelos", authRequired, authorizeRoles(...ROTINA_GESTAO), rotinaCtrl.obterModelos);
app.put("/api/rotina/modelos", authRequired, authorizeRoles(...ROTINA_GESTAO), rotinaCtrl.salvarModelos);

// Cadastro de instrutores (14/10/2026) — ver controllers/instrutoresController.js.
// Leitura: coordenador, supervisor, superintendente. Escrita: coordenador e
// superintendente. /opcoes (lista de ativos para os formulários) é aberta aos
// perfis que montam turma/cronograma.
app.get("/api/instrutores/opcoes", authRequired,
  authorizeRoles("coordenador", "supervisor", "instrutor", "assistente_treinamento", "analista_conteudo", "superintendente"),
  instrutoresCtrl.opcoes);
app.get("/api/instrutores/a-classificar", authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"), instrutoresCtrl.aClassificar);
app.get("/api/instrutores", authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"), instrutoresCtrl.listar);
app.post("/api/instrutores/classificar", authRequired,
  authorizeRoles("coordenador", "superintendente"), instrutoresCtrl.classificar);
app.post("/api/instrutores/cadastrar-todos", authRequired,
  authorizeRoles("coordenador", "superintendente"), instrutoresCtrl.cadastrarTodos);
app.delete("/api/instrutores/apelidos/:id", authRequired,
  authorizeRoles("coordenador", "superintendente"), instrutoresCtrl.removerApelido);
app.post("/api/instrutores", authRequired,
  authorizeRoles("coordenador", "superintendente"), instrutoresCtrl.criar);
app.put("/api/instrutores/:id", authRequired,
  authorizeRoles("coordenador", "superintendente"), instrutoresCtrl.atualizar);

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
  listarComentarios: listarComentariosRP,
  criarComentario:   criarComentarioRP,
  excluirComentario: excluirComentarioRP,
  getSites:         getRSSites,
  getProdutos:      getRSProdutos,
  getDashboard:     getRSDashboard,
  getRelatorio:     getRSRelatorio,
  exportar:         exportarRS,
  exportarLista:    exportarListaRPs,
  importarPlanilha: importarRSPlanilha,
  listarConvocacoes: listarConvocacoesRP,
  convocarBerco:     convocarBercoRP,
  estornarConvocacao: estornarConvocacaoRP,
} = require("./controllers/rsController");
const {
  listarSitesGestao: listarRSSitesGestao,
  criarSite:         criarRSSite,
  editarSite:        editarRSSite,
  previaPadronizacao: previaRSPadronizacao,
  aplicarPadronizacao: aplicarRSPadronizacao,
  listarLixeira:     listarRSLixeira,
  restaurarRP:       restaurarRSRP,
} = require("./controllers/rsGestaoController");

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
// Berço (21/10/2026): convocar quem ficou na reserva, ver o histórico e estornar.
app.get   ("/api/rs/rps/:id/convocacoes",     authRequired, authorizeRoles("coordenador_rs","gestor_rs"), listarConvocacoesRP);
app.post  ("/api/rs/rps/:id/convocacoes",     authRequired, authorizeRoles("coordenador_rs"),              convocarBercoRP);
app.delete("/api/rs/rps/:id/convocacoes/:cid", authRequired, authorizeRoles("coordenador_rs"),             estornarConvocacaoRP);
// Comentários da RP (19/10/2026): coordenador_rs e gestor_rs leem e comentam.
app.get   ("/api/rs/rps/:id/comentarios", authRequired, authorizeRoles("coordenador_rs","gestor_rs"), listarComentariosRP);
app.post  ("/api/rs/rps/:id/comentarios", authRequired, authorizeRoles("coordenador_rs","gestor_rs"), criarComentarioRP);
app.delete("/api/rs/rps/:id/comentarios/:comentarioId", authRequired, authorizeRoles("coordenador_rs","gestor_rs"), excluirComentarioRP);
// Exportar a lista de RPs com os filtros da tela (20/10/2026). Caminho próprio para não colidir com /rps/:id.
app.get   ("/api/rs/rps-exportar", authRequired, authorizeRoles("coordenador_rs","gestor_rs"), exportarListaRPs);
// Cadastro de sites, padronização de nomes e lixeira (20/10/2026): só coordenador_rs.
app.get   ("/api/rs/sites-gestao",      authRequired, authorizeRoles("coordenador_rs"), listarRSSitesGestao);
app.post  ("/api/rs/sites-gestao",      authRequired, authorizeRoles("coordenador_rs"), criarRSSite);
app.put   ("/api/rs/sites-gestao/:id",  authRequired, authorizeRoles("coordenador_rs"), editarRSSite);
app.get   ("/api/rs/padronizacao",      authRequired, authorizeRoles("coordenador_rs"), previaRSPadronizacao);
app.post  ("/api/rs/padronizacao",      authRequired, authorizeRoles("coordenador_rs"), aplicarRSPadronizacao);
app.get   ("/api/rs/lixeira",           authRequired, authorizeRoles("coordenador_rs"), listarRSLixeira);
app.post  ("/api/rs/lixeira/:id/restaurar", authRequired, authorizeRoles("coordenador_rs"), restaurarRSRP);
// Importação de planilha histórica (xlsx do Google Sheets)
app.post  ("/api/rs/importar",  authRequired, authorizeRoles("coordenador_rs"), comUploadTratado(upload.single("arquivo")), importarRSPlanilha);
// Usuários do R&S: gerenciados em /api/usuarios (Gestão de Usuários) — os atalhos
// /api/rs/usuarios foram removidos em 14/10/2026.
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
      return res.status(500).json({ ok: false, message: "Erro ao rodar o resumo de pendências."});
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
      return res.status(500).json({ ok: false, message: "Erro ao rodar os lembretes de aula."});
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
      return res.status(500).json({ ok: false, message: "Erro ao calcular conquistas."});
    }
  }
);

// Pacote 3 — certificado automático ao concluir a turma (além do
// agendamento automático em jobs/scheduler.js, 05h diário).
app.post(
  "/api/admin/jobs/rodar-certificados-automaticos",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  async (req, res) => {
    try {
      const resultado = await rodarCertificadosAutomaticos();
      return res.json({ ok: true, resultado });
    } catch (error) {
      console.error("Erro ao rodar certificados automáticos:", error);
      return res.status(500).json({ ok: false, message: "Erro ao rodar certificados automáticos."});
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
      // Pacote Superintendente (24/09/2026): montarResumoEmpresa(null) já
      // agrega todos os tenants corretamente (delega para getAlertas/
      // getResumoExecutivo/getResumoPresenca, os mesmos resolvers usados nas
      // outras 3 telas, todos cientes de empresaId=null). O cache diário
      // (resumos_executivos_diarios) já tinha uma linha própria pra
      // empresa_id NULL (mesma usada por super_admin) — a superintendente
      // agora reaproveita essa mesma linha global.
      const { empresaId } = tenantScopeFor(req, { crossTenantRoles: ["superintendente"] });
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

// Backup externo (21/10/2026) — roda sozinho todo dia às 02h30 (jobs/scheduler.js);
// aqui dá para disparar na hora e consultar o estado. O disparo responde 202
// e segue em segundo plano (pode levar minutos); o resultado aparece em
// GET /api/admin/backup/status e nos registros do servidor.
app.post(
  "/api/admin/jobs/rodar-backup",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  async (req, res) => {
    const st = statusBackup();
    if (!st.configurado) {
      return res.status(409).json({ ok: false, message: "Backup externo não está configurado (variáveis BACKUP_S3_*)." });
    }
    if (st.em_execucao) {
      return res.status(409).json({ ok: false, message: "Já existe um backup em andamento." });
    }
    rodarBackup({ origem: `manual:${req.user?.nome || req.user?.id || "?"}` })
      .then((r) => console.log("[backup] Manual concluído:", JSON.stringify(r)))
      .catch((e) => console.error("[backup] Manual falhou:", e.message));
    return res.status(202).json({ ok: true, message: "Backup iniciado. Acompanhe em /api/admin/backup/status." });
  }
);

app.get(
  "/api/admin/backup/status",
  authRequired,
  authorizeRoles("coordenador", "supervisor", "superintendente"),
  (req, res) => res.json({ ok: true, ...statusBackup() })
);

const PORT = process.env.PORT || 3000;

// Migrações com nova tentativa: se o banco estiver inalcançável (falha de rede
// ou do provedor), espera e tenta de novo (5 s, 10 s... até 60 s) em vez de
// encerrar o processo e entrar em loop de reinício. Erro de SQL/código (não de
// conexão) continua derrubando o processo, como antes, para não esconder defeito.
async function aplicarMigracoesComTentativas() {
  let espera = 5000;
  for (;;) {
    registrarTentativaMigracao();
    try {
      await runMigrations();
      return;
    } catch (error) {
      if (!erroDeConexao(error)) throw error;
      console.error(`[boot] Banco indisponível (${error.code || error.message}). Nova tentativa das migrações em ${espera / 1000}s.`);
      await new Promise((r) => setTimeout(r, espera));
      espera = Math.min(espera * 2, 60000);
    }
  }
}

// Erros soltos de conexão (ex.: o banco derruba uma conexão ociosa) não podem
// matar o servidor; qualquer outro erro inesperado continua encerrando o
// processo, que a hospedagem reinicia limpo.
process.on("unhandledRejection", (motivo) => {
  console.error("[boot] Promessa rejeitada sem tratamento:", motivo);
});
process.on("uncaughtException", (error) => {
  console.error("[boot] Exceção não tratada:", error);
  if (!erroDeConexao(error)) process.exit(1);
});

async function iniciarAplicacao() {
  iniciarMonitoramento();

  // Abre a porta ANTES das migrações: assim /api/health responde e o restante
  // da API devolve 503 claro enquanto o banco não está pronto.
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });

  try {
    await aplicarMigracoesComTentativas();
    marcarMigracoesOk();
    iniciarAgendamentos();
  } catch (error) {
    console.error("Erro crítico ao iniciar o servidor:", error);
    process.exit(1);
  }
}

iniciarAplicacao();
