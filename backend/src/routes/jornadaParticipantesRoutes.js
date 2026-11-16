const express = require("express");
const multer = require("multer");
const router = express.Router();
const controller = require("../controllers/jornadaParticipantesController");

// Varredura 13/11/2026: limite de 10 MB por arquivo (antes sem limite — um upload grande derrubava a memória do processo).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

// Bugfix (limpeza): authRequired + authorizeRoles("coordenador",
// "superintendente") eram repetidos em cada rota aqui, mas o router inteiro
// já é montado em index.js com `authRequired, authorizeRoles(...)` — que já
// garante o controle de acesso ao módulo (hoje: perfil dedicado
// "metodologia", ver index.js). A checagem por rota era 100% redundante e
// nunca teria efeito prático — removida para bater com o padrão já usado em
// acoesDesenvolvimentoRoutes.js e coachingPlanosRoutes.js, sem afrouxar o
// controle de acesso.
router.get("/", controller.list);
router.post("/", controller.create);
router.post(
  "/importar",
  (req, res, next) => upload.single("arquivo")(req, res, (err) => {
    if (!err) return next();
    const grande = err.code === "LIMIT_FILE_SIZE";
    return res.status(grande ? 413 : 400).json({
      ok: false,
      message: grande ? "Arquivo maior que o limite de 10MB." : (err.message || "Falha no upload do arquivo"),
    });
  }),
  controller.importExcel
);
router.delete("/:id", controller.remove);

module.exports = router;
