const express = require("express");
const router = express.Router();
const controller = require("../controllers/pessoasController");

// authRequired já é aplicado no mount (index.js), igual ao padrão de
// jornadaParticipantesRoutes.js — sem authorizeRoles aqui porque a busca
// precisa ficar disponível pra qualquer tela de cadastro do portal
// (Turmas, Mapa de Desenvolvimento, Tripulação, Usuários, RS), não só um
// perfil.
router.get("/", controller.buscar);

// GET /api/pessoas/:id — Perfil da Pessoa (28/09/2026). Mesmo raciocínio de
// acesso aberto da busca: qualquer tela que já mostra a pessoa (Turmas,
// Tripulação, Mapa de Desenvolvimento, Gestão de Usuários) pode linkar pra
// cá; a parte sensível (dados bancários) é filtrada dentro do controller
// pela régua de CPF, não por authorizeRoles na rota.
router.get("/:id", controller.perfil);

module.exports = router;
