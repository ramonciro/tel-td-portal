const express = require("express");
const router = express.Router();
const controller = require("../controllers/capacidadeController");
 
// Tudo calculado a partir do que já está registrado (turmas + cronograma) —
// nenhum endpoint aqui depende de lançamento manual adicional do time.
 
// Visões agregadas (painel executivo, capacity x consumido, ranking,
// aderência por tema, distribuição por operação, alertas)
router.get("/painel", controller.getPainel);
router.get("/capacity-consumido", controller.getCapacity);
router.get("/ranking", controller.getRankingHandler);
router.get("/aderencia-por-tema", controller.getAderencia);
router.get("/distribuicao-por-operacao", controller.getDistribuicao);
router.get("/alertas", controller.getAlertasHandler);
 
// Listas auxiliares (selects de filtro no frontend)
router.get("/instrutores", controller.getInstrutores);
router.get("/operacoes", controller.getOperacoes);
 
// Overrides manuais de capacidade (config opcional da coordenação — não é
// trabalho para o time, só ajusta a meta de um instrutor num mês específico)
router.get("/overrides", controller.getOverrides);
router.post("/overrides", controller.postOverride);
router.delete("/overrides/:id", controller.deleteOverride);
 
// Regra automática padrão
router.get("/regra", controller.getRegra);
router.put("/regra", controller.putRegra);
 
// Capacidade x realizado (detalhe por instrutor/mês, filtros: ano, mes, instrutor, cliente, data_inicio, data_fim)
router.get("/", controller.getCapacidade);
 
module.exports = router;
