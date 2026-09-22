const express = require("express");
const router = express.Router();
const controller = require("../controllers/pessoasController");

// authRequired já é aplicado no mount (index.js), igual ao padrão de
// jornadaParticipantesRoutes.js — sem authorizeRoles aqui porque a busca
// precisa ficar disponível pra qualquer tela de cadastro do portal
// (Turmas, Mapa de Desenvolvimento, Tripulação, Usuários, RS), não só um
// perfil.
router.get("/", controller.buscar);

module.exports = router;
