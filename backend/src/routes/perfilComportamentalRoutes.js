const express = require("express");
const router = express.Router();
const controller = require("../controllers/perfilComportamentalController");

// authRequired + authorizeRoles("metodologia") já são aplicados no
// app.use() de index.js — mesmo padrão de coachingIndividualRoutes.js.
router.get("/", controller.listar);
router.get("/:id", controller.buscarPorId);
router.post("/", controller.criar);
router.put("/:id", controller.atualizar);
router.delete("/:id", controller.remover);

module.exports = router;
