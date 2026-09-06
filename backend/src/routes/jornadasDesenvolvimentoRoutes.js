const express = require("express");
const router = express.Router();
const controller = require("../controllers/jornadasDesenvolvimentoController");

// Bugfix (limpeza): authorizeRoles("coordenador", "superintendente") era
// repetido em cada rota aqui, mas o router inteiro já é montado em
// index.js com `authRequired, authorizeOceanAccess` — e authorizeOceanAccess
// (ver middlewares/auth.js -> hasOceanAccess) já exige exatamente esses
// dois perfis, além da flag pode_acessar_oceano_desenvolvimento. A checagem
// por rota era 100% redundante (mesmos dois perfis) e nunca teria efeito
// prático — removida para bater com o padrão já usado em
// acoesDesenvolvimentoRoutes.js e coachingPlanosRoutes.js, sem afrouxar o
// controle de acesso.
router.get("/", controller.listar);
router.get("/:id", controller.buscarPorId);
router.post("/", controller.criar);
router.put("/:id", controller.atualizar);
router.delete("/:id", controller.remover);

module.exports = router;
