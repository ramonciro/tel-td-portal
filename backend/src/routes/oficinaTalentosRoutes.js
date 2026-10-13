const express = require("express");
const router = express.Router();
const controller = require("../controllers/oficinaTalentosController");

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

module.exports = router;
