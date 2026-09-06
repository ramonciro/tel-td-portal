const express = require("express");
const multer = require("multer");
const router = express.Router();
const controller = require("../controllers/jornadaParticipantesController");

const upload = multer({ storage: multer.memoryStorage() });

// Bugfix (limpeza): authRequired + authorizeRoles("coordenador",
// "superintendente") eram repetidos em cada rota aqui, mas o router inteiro
// já é montado em index.js com `authRequired, authorizeOceanAccess` — que já
// exige exatamente esses dois perfis (ver middlewares/auth.js ->
// hasOceanAccess), além da flag pode_acessar_oceano_desenvolvimento. A
// checagem por rota era 100% redundante e nunca teria efeito prático —
// removida para bater com o padrão já usado em acoesDesenvolvimentoRoutes.js
// e coachingPlanosRoutes.js, sem afrouxar o controle de acesso.
router.get("/", controller.list);
router.post("/", controller.create);
router.post("/importar", upload.single("arquivo"), controller.importExcel);
router.delete("/:id", controller.remove);

module.exports = router;
