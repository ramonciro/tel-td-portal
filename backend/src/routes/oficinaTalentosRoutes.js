const express = require("express");
const router = express.Router();
const controller = require("../controllers/oficinaTalentosController");
const certificados = require("../controllers/oficinaCertificadosController");

// authRequired + authorizeRoles("metodologia") já são aplicados no app.use()
// de index.js — mesmo padrão de metodologiaClientesRoutes.js.
router.get("/turmas", controller.listarTurmas);
router.post("/turmas", controller.criarTurma);
router.get("/turmas/:id", controller.detalharTurma);
router.put("/turmas/:id", controller.atualizarTurma);
router.post("/turmas/:id/duplicar", controller.duplicarTurma);
router.delete("/turmas/:id", controller.excluirTurma);

router.get("/turmas/:id/inscricoes", controller.listarInscricoes);
router.get("/turmas/:id/inscricoes/exportar", controller.exportarInscricoes);
router.put("/inscricoes/:id/status", controller.alterarStatusInscricao);

// Fase 2 — presença (credenciamento) por módulo, frequência e certificados.
router.get("/turmas/:id/frequencia", certificados.frequenciaTurma);
router.put("/modulos/:moduloId/presenca", certificados.registrarPresenca);
router.post("/modulos/:moduloId/credenciar-todos", certificados.credenciarTodos);
router.post("/turmas/:id/certificados/emitir", certificados.emitirCertificados);
router.get("/turmas/:id/certificados", certificados.listarCertificados);
router.delete("/certificados/:id", certificados.revogarCertificado);

module.exports = router;
