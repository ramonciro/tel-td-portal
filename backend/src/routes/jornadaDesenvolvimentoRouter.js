const express = require("express");
const router = express.Router();
const controller = require("../controllers/jornadaDesenvolvimentoController");

// authRequired + authorizeRoles("metodologia") já são aplicados no app.use()
// de index.js (só a Metodologia lança; super_admin passa).
router.get("/jornadas/:jornadaId/matriz", controller.matriz);
router.post("/jornadas/:jornadaId/aplicar-sugestoes", controller.aplicarSugestoes);
router.put("/participantes/:participanteId/etapas/:etapaId", controller.salvarEtapa);
router.get("/participantes/:participanteId/painel", controller.painel);
router.post("/participantes/:participanteId/evolucao", controller.criarEvolucao);
router.put("/evolucao/:id", controller.atualizarEvolucao);
router.delete("/evolucao/:id", controller.excluirEvolucao);

module.exports = router;
