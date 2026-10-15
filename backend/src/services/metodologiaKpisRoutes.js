const express = require("express");
const router = express.Router();
const controller = require("../controllers/metodologiaKpisController");

router.get("/", controller.obterKpis);
// Encontros e presença resumidos por jornada (cards do Mapa de Desenvolvimento).
router.get("/jornadas", controller.resumoJornadas);

module.exports = router;
