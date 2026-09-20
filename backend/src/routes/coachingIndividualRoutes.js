const express = require("express");
const router = express.Router();
const controller = require("../controllers/coachingIndividualController");

// authRequired + authorizeRoles("metodologia") já são aplicados no
// app.use() de index.js — mesmo padrão de coachingPlanosRoutes.js e
// jornadaParticipantesRoutes.js, sem checagem redundante por rota.
router.get("/", controller.listar);
router.get("/:id", controller.buscarPorId);
router.post("/", controller.criar);
router.put("/:id", controller.atualizar);
router.delete("/:id", controller.remover);

router.get("/:id/encontros", controller.listarEncontros);
router.post("/:id/encontros", controller.criarEncontro);
router.delete("/:id/encontros/:encontroId", controller.removerEncontro);

module.exports = router;
