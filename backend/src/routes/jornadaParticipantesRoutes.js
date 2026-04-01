const express = require("express");
const multer = require("multer");
const router = express.Router();
const controller = require("../controllers/jornadaParticipantesController");
const { authRequired, authorizeRoles } = require("../middlewares/auth");

const upload = multer({ storage: multer.memoryStorage() });

router.get(
  "/",
  authRequired,
  authorizeRoles("coordenador", "superintendente"),
  controller.list
);

router.post(
  "/",
  authRequired,
  authorizeRoles("coordenador", "superintendente"),
  controller.create
);

router.post(
  "/importar",
  authRequired,
  authorizeRoles("coordenador", "superintendente"),
  upload.single("arquivo"),
  controller.importExcel
);

router.delete(
  "/:id",
  authRequired,
  authorizeRoles("coordenador", "superintendente"),
  controller.remove
);

module.exports = router;
