// ─────────────────────────────────────────────────────────────────────────────
// PATCH: backend/src/index.js
//
// 1. Adicionar imports (junto com os outros requires do topo):
// ─────────────────────────────────────────────────────────────────────────────

const rsController                    = require('./controllers/rsController');
const { rsAccessRequired, bloquearRS } = require('./middleware/rsMiddleware');

// ─────────────────────────────────────────────────────────────────────────────
// 2. Proteger rotas sensíveis do T&D com bloquearRS
//    (adicionar o middleware ENTRE authRequired e o controller)
//
//    Localizar cada uma das rotas abaixo e adicionar bloquearRS:
// ─────────────────────────────────────────────────────────────────────────────

// Exemplos — adaptar aos nomes reais das suas rotas:
//
// app.get('/api/turmas',        authRequired, bloquearRS, turmasController.listar);
// app.get('/api/treinamentos',  authRequired, bloquearRS, treinamentosController.listar);
// app.get('/api/presencas',     authRequired, bloquearRS, presencasController.listar);
// app.get('/api/avaliacoes',    authRequired, bloquearRS, avaliacoesController.listar);
// app.get('/api/usuarios',      authRequired, bloquearRS, usuariosController.listar);
// app.get('/api/necessidades',  authRequired, bloquearRS, necessidadesController.listar);
// app.get('/api/trilhas',       authRequired, bloquearRS, trilhasController.listar);
//
// Regra geral: adicionar bloquearRS em TODAS as rotas que retornam
// dados de T&D (turmas, presenças, avaliações, usuários, treinamentos).
// Rotas de /api/auth (login, logout, me) NÃO precisam de bloquearRS.

// ─────────────────────────────────────────────────────────────────────────────
// 3. Registrar rotas do módulo R&S
//    (adicionar em bloco, antes do app.listen)
// ─────────────────────────────────────────────────────────────────────────────

// ── R&S ─────────────────────────────────────────────────────────────────────
app.get   ('/api/rs/sites',    authRequired, rsAccessRequired, rsController.getSites);
app.get   ('/api/rs/produtos', authRequired, rsAccessRequired, rsController.getProdutos);
app.get   ('/api/rs/rps',      authRequired, rsAccessRequired, rsController.listar);
app.post  ('/api/rs/rps',      authRequired, rsAccessRequired, rsController.criar);
app.get   ('/api/rs/rps/:id',  authRequired, rsAccessRequired, rsController.detalhe);
app.put   ('/api/rs/rps/:id',  authRequired, rsAccessRequired, rsController.editar);
app.delete('/api/rs/rps/:id',  authRequired, rsAccessRequired, rsController.excluir);
// ─────────────────────────────────────────────────────────────────────────────
