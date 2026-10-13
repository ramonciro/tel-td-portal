const express = require("express");
const multer = require("multer");
const router = express.Router();
const controller = require("../controllers/jornadaPresencaController");

// authRequired + authorizeRoles("metodologia") já são aplicados no app.use()
// de index.js (decisão D: só a Metodologia lança a chamada; super_admin passa).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get("/jornadas/:jornadaId/grade", controller.grade);
router.put("/jornadas/:jornadaId/config", controller.salvarConfig);
router.get("/jornadas/:jornadaId/trilhas", controller.listarTrilhas);
router.put("/jornadas/:jornadaId/trilhas", controller.salvarTrilhas);
router.post("/jornadas/:jornadaId/encontros", controller.criarEncontro);
router.post("/jornadas/:jornadaId/importar", upload.single("arquivo"), controller.importar);
router.get("/jornadas/:jornadaId/exportar", controller.exportar);

router.put("/encontros/:id", controller.atualizarEncontro);
router.delete("/encontros/:id", controller.excluirEncontro);
router.post("/encontros/:id/duplicar", controller.duplicarEncontro);
router.put("/encontros/:id/presenca", controller.registrarPresenca);
router.post("/encontros/:id/presenca-lote", controller.presencaEmLote);

router.get("/participantes/:id/presenca", controller.extratoParticipante);

module.exports = router;
