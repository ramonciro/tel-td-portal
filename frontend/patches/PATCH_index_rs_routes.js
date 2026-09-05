// ─────────────────────────────────────────────────────────────────────────────
// PATCH: backend/src/index.js
//
// Adicionar este bloco completo ANTES de iniciarAplicacao()
// (ou seja, antes da linha: async function iniciarAplicacao() { ... })
//
// NÃO é necessário criar rsMiddleware.js — o authorizeRoles existente já
// bloqueia perfis não listados. coordenador_rs e gestor_rs são bloqueados
// automaticamente em todas as rotas T&D.
// ─────────────────────────────────────────────────────────────────────────────

// Adicionar este import junto com os outros no TOPO do index.js:
const {
  listar:        listarRPs,
  criar:         criarRP,
  detalhe:       detalheRP,
  editar:        editarRP,
  excluir:       excluirRP,
  getSites:      getRSSites,
  getProdutos:   getRSProdutos,
  getDashboard:  getRSDashboard,
  getRelatorio:  getRSRelatorio,
  exportar:      exportarRS,
} = require("./controllers/rsController");

// ── R&S — rotas protegidas por authorizeRoles ─────────────────────────────────
// coordenador_rs: lê, cria, edita, exclui, exporta
// gestor_rs:      somente lê e exporta
// super_admin:    acesso total (via authorizeRoles)

app.get   ("/api/rs/sites",     authRequired, authorizeRoles("coordenador_rs", "gestor_rs"), getRSSites);
app.get   ("/api/rs/produtos",  authRequired, authorizeRoles("coordenador_rs", "gestor_rs"), getRSProdutos);
app.get   ("/api/rs/dashboard", authRequired, authorizeRoles("coordenador_rs", "gestor_rs"), getRSDashboard);
app.get   ("/api/rs/relatorio", authRequired, authorizeRoles("coordenador_rs", "gestor_rs"), getRSRelatorio);
app.get   ("/api/rs/exportar",  authRequired, authorizeRoles("coordenador_rs", "gestor_rs"), exportarRS);
app.get   ("/api/rs/rps",       authRequired, authorizeRoles("coordenador_rs", "gestor_rs"), listarRPs);
app.post  ("/api/rs/rps",       authRequired, authorizeRoles("coordenador_rs"),              criarRP);
app.get   ("/api/rs/rps/:id",   authRequired, authorizeRoles("coordenador_rs", "gestor_rs"), detalheRP);
app.put   ("/api/rs/rps/:id",   authRequired, authorizeRoles("coordenador_rs"),              editarRP);
app.delete("/api/rs/rps/:id",   authRequired, authorizeRoles("coordenador_rs"),              excluirRP);
// ─────────────────────────────────────────────────────────────────────────────
