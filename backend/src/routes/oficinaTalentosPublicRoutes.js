const express = require("express");
const router = express.Router();
const controller = require("../controllers/oficinaTalentosPublicController");
const { criarLimitador } = require("../lib/rateLimit");
const { normalizarCpf } = require("../services/pessoasService");

// Rotas SEM login (link público de inscrição da Oficina de Talentos). Montadas
// em /api/public/oficina, fora de authRequired. Ver comentário de segurança em
// oficinaTalentosPublicController.js.
const JANELA = 15 * 60 * 1000;

const limiteLeitura = criarLimitador({ janelaMs: JANELA, max: 120 });

// Por IP: 40 envios / 15 min (uma sala de aula inteira pode sair do mesmo IP).
const limiteEnvioPorIp = criarLimitador({ janelaMs: JANELA, max: 40 });

// Por turma + CPF: 6 tentativas / 15 min — freia quem fica testando combinações.
const limiteEnvioPorCpf = criarLimitador({
  janelaMs: JANELA,
  max: 6,
  chave: (req) => `${req.params.token}:${normalizarCpf(req.body?.cpf) || "sem-cpf"}`,
  mensagem: "Muitas tentativas com este CPF. Aguarde alguns minutos e tente novamente.",
});

router.get("/:token", limiteLeitura, controller.obterTurmaPublica);
router.post("/:token/inscricoes", limiteEnvioPorIp, limiteEnvioPorCpf, controller.inscrever);

module.exports = router;
