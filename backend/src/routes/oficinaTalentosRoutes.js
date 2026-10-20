const express = require("express");
const router = express.Router();
const controller = require("../controllers/oficinaTalentosController");
const certificados = require("../controllers/oficinaCertificadosController");
const indicadores = require("../controllers/oficinaIndicadoresController");
const pos = require("../controllers/oficinaPosController");

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

// Fase 3 — promoção (marcada pela Metodologia) e funil de indicadores.
router.put("/inscricoes/:id/promocao", indicadores.registrarPromocao);
router.get("/indicadores", indicadores.indicadores);

// Depois do encontro (21/10/2026) — avaliação dos módulos, 30/60/90 dias e banco de talentos.
router.get("/reacoes", pos.reacoes);
router.get("/acompanhamentos", pos.acompanhamentos);
router.put("/acompanhamentos/:id", pos.atualizarAcompanhamento);
router.get("/banco-talentos", pos.bancoTalentos);

module.exports = router;
