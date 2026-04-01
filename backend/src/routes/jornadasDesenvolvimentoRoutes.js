const express = require("express");
const router = express.Router();
const controller = require("../controllers/jornadasDesenvolvimentoController");
const { authRequired, authorizeRoles } = require("../middlewares/auth");

router.get(
  "/",
  authRequired,
  authorizeRoles("coordenador", "superintendente"),
  controller.listar
);

router.get(
  "/:id",
  authRequired,
  authorizeRoles("coordenador", "superintendente"),
  controller.buscarPorId
);

router.post(
  "/",
  authRequired,
  authorizeRoles("coordenador", "superintendente"),
  controller.criar
);

router.put(
  "/:id",
  authRequired,
  authorizeRoles("coordenador", "superintendente"),
  controller.atualizar
);

router.delete(
  "/:id",
  authRequired,
  authorizeRoles("coordenador", "superintendente"),
  controller.remover
);

module.exports = router;
