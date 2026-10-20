const express = require("express");
const router = express.Router();
const controller = require("../controllers/oficinaTalentosPublicController");
const certificados = require("../controllers/oficinaCertificadosController");
const reacoes = require("../controllers/oficinaReacoesPublicController");
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

// Avaliação dos módulos: só as tentativas que ERRAM contam (6 / 15 min por CPF e 60 por IP).
// Quem acerta CPF e matrícula pode consultar e avaliar todos os módulos sem ser barrado.
const limiteReacaoPorIp = criarLimitador({ janelaMs: JANELA, max: 60, apenasFalhas: true });
const limiteReacaoPorCpf = criarLimitador({
  janelaMs: JANELA,
  max: 6,
  apenasFalhas: true,
  chave: (req) => `reacao:${req.params.token}:${normalizarCpf(req.body?.cpf) || "sem-cpf"}`,
  mensagem: "Muitas tentativas com este CPF. Aguarde alguns minutos e tente novamente.",
});

// Validação pública de certificado (Fase 2) — declarada antes de "/:token".
const limiteValidacao = criarLimitador({ janelaMs: JANELA, max: 60 });
router.get("/certificado/:codigo", limiteValidacao, certificados.validarCertificadoPublico);

router.get("/:token", limiteLeitura, controller.obterTurmaPublica);
// Avaliação dos módulos pelo participante (21/10/2026) — mesmos limites da inscrição.
router.post("/:token/reacoes/consultar", limiteReacaoPorIp, limiteReacaoPorCpf, reacoes.consultar);
router.post("/:token/reacoes", limiteReacaoPorIp, limiteReacaoPorCpf, reacoes.enviar);
router.post("/:token/inscricoes", limiteEnvioPorIp, limiteEnvioPorCpf, controller.inscrever);

module.exports = router;
