const express = require("express");
const router = express.Router();
const controller = require("../controllers/acoesDesenvolvimentoController");

router.get("/", controller.listar);
// Precisam vir antes de "/:id" — senão o Express trataria o texto como id.
router.get("/exportar", controller.exportarEvidencias);
router.get("/turmas-disponiveis", controller.listarTurmasDisponiveis);
router.get("/responsaveis-disponiveis", controller.listarResponsaveisDisponiveis);
router.get("/:id", controller.detalhar);
router.post("/", controller.criar);
router.put("/:id", controller.atualizar);
router.delete("/:id", controller.remover);

module.exports = router;
