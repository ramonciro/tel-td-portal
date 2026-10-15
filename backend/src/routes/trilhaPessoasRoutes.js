const express = require("express");
const router = express.Router();
const controller = require("../controllers/trilhaPessoasController");

// authRequired + authorizeRoles("metodologia") já são aplicados no app.use()
router.get("/trilhas/:trilhaId/matriz", controller.matriz);
router.post("/trilhas/:trilhaId/sincronizar", controller.sincronizar);
router.post("/trilhas/:trilhaId/participantes", controller.adicionarParticipante);
router.post("/trilhas/:trilhaId/etapas/:etapaId/marcar-todos", controller.marcarTodos);
router.get("/trilhas/:trilhaId/exportar", controller.exportar);
router.delete("/participantes/:id", controller.removerParticipante);
router.post("/participantes/:id/reativar", controller.reativarParticipante);
router.put("/participantes/:id/etapas/:etapaId", controller.salvarEtapa);

module.exports = router;
