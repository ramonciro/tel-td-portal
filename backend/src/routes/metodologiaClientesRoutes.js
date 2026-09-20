const express = require("express");
const router = express.Router();
const controller = require("../controllers/metodologiaClientesController");

// authRequired + authorizeRoles("metodologia") já são aplicados no app.use()
// de index.js — mesmo padrão de perfilComportamentalRoutes.js.
router.get("/", controller.listar);
router.post("/", controller.criar);
router.put("/:id", controller.atualizar);
router.delete("/:id", controller.remover);

module.exports = router;
