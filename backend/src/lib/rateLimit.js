/**
 * rateLimit.js — limitador de requisições em memória (13/10/2026).
 *
 * Criado para as rotas PÚBLICAS da Oficina de Talentos (link de inscrição sem
 * login) — até então o backend não tinha nenhum limite de tentativas. É
 * propositalmente simples (janela fixa, Map em memória, sem dependência
 * nova): protege contra abuso casual e robôs simples numa instância única do
 * Railway. Se o backend passar a rodar em várias instâncias, cada uma conta
 * separado — aí vale trocar por um limitador com store compartilhado.
 *
 * IP do cliente: o Railway fica na frente do Express e ANEXA o IP real ao
 * final de X-Forwarded-For. Por isso usamos o ÚLTIMO item da lista (o que o
 * cliente escreve no começo do cabeçalho não é confiável). O app não define
 * `trust proxy`, então req.ip não serve.
 */

function ipDoCliente(req) {
  const xff = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (xff.length) return xff[xff.length - 1];
  return req.socket?.remoteAddress || "desconhecido";
}

function criarLimitador({ janelaMs, max, chave, mensagem, apenasFalhas = false }) {
  const acessos = new Map(); // chave -> { inicio, total }

  const limpeza = setInterval(() => {
    const agora = Date.now();
    for (const [k, v] of acessos) {
      if (agora - v.inicio >= janelaMs) acessos.delete(k);
    }
  }, Math.max(janelaMs, 60 * 1000));
  if (limpeza.unref) limpeza.unref();

  return function limitador(req, res, next) {
    const k = chave ? chave(req) : ipDoCliente(req);
    const agora = Date.now();
    let registro = acessos.get(k);

    if (!registro || agora - registro.inicio >= janelaMs) {
      registro = { inicio: agora, total: 0 };
      acessos.set(k, registro);
    }

    // apenasFalhas: só conta respostas de erro (4xx, exceto 429) — quem acerta os dados
    // pode usar a rota à vontade (ex.: avaliar vários módulos); quem fica chutando é freado.
    if (apenasFalhas) {
      res.on("finish", () => {
        if (res.statusCode >= 400 && res.statusCode !== 429) {
          const atual = acessos.get(k);
          if (atual) atual.total += 1;
        }
      });
    } else {
      registro.total += 1;
    }

    if (registro.total > max || (apenasFalhas && registro.total >= max)) {
      const restanteSeg = Math.ceil((registro.inicio + janelaMs - agora) / 1000);
      res.setHeader("Retry-After", String(Math.max(restanteSeg, 1)));
      return res.status(429).json({
        error: mensagem || "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
      });
    }

    next();
  };
}

module.exports = { criarLimitador, ipDoCliente };
