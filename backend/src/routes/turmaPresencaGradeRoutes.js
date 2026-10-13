const express = require("express");
const router = express.Router();
const controller = require("../controllers/turmaPresencaGradeController");
const { authorizeRoles } = require("../middlewares/auth");

// authRequired + authorizeRoles(coordenador, supervisor, instrutor,
// assistente_treinamento) — os mesmos perfis da chamada por aula — já são
// aplicados no app.use() de index.js (super_admin passa). Isolamento por
// ambiente dentro do controller (via turma).
router.get("/turmas/:id/grade", controller.grade);
router.get("/turmas/:id/exportar", controller.exportar);
router.get("/turmas/:id/participantes/:pid/extrato", controller.extratoParticipante);

// Mudar a presença mínima da turma: só quem gere turmas.
router.put("/turmas/:id/config", authorizeRoles("coordenador", "assistente_treinamento"), controller.salvarConfig);

router.put("/aulas/:id/presenca", controller.registrarPresenca);
router.post("/aulas/:id/presenca-lote", controller.presencaEmLote);

module.exports = router;
