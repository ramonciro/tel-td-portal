const express = require("express");
const router = express.Router();
const controller = require("../controllers/metodologiaKpisController");

router.get("/", controller.obterKpis);

module.exports = router;
