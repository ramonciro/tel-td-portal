/**
 * saudeBanco.js — resiliência quando o banco de dados cai (21/10/2026).
 *
 * Contexto: em 21/10/2026 o MySQL ficou inalcançável por horas (falha do
 * provedor). O servidor ficou "de pé" mas todas as rotas com banco esperavam
 * 5 minutos sem responder, e depois de um reinício ele entrava em loop (as
 * migrações falhavam e o processo se encerrava). Este módulo faz três coisas:
 *
 *  1. Mantém o estado da conexão com o banco (sonda "SELECT 1" a cada 10 s,
 *     com limite de 4 s). Duas falhas seguidas = banco fora; um sucesso =
 *     banco de volta.
 *  2. Enquanto o banco está fora (ou as migrações ainda não terminaram), as
 *     rotas /api respondem na hora com 503 e uma mensagem clara, em vez de
 *     travar. Só /api/health* continua respondendo.
 *  3. Limita o tempo de qualquer requisição (REQUEST_TIMEOUT_MS, padrão 120 s)
 *     — se estourar, devolve 503 em vez de deixar o navegador esperando.
 *
 * Nada aqui altera dados nem regras de negócio.
 */
const pool = require("./db");

const INTERVALO_SONDA_MS = 10_000;
const LIMITE_SONDA_MS = 4_000;
const FALHAS_PARA_CAIR = 2;

const estado = {
  iniciouEm: Date.now(),
  migracoesOk: false,        // o servidor só atende quando as migrações terminam
  bancoOk: null,             // null = ainda não sondado
  falhasSeguidas: 0,
  ultimoOkEm: null,
  ultimaFalhaEm: null,
  ultimoErro: null,
  tentativasMigracao: 0,
};

let timer = null;

// Códigos de erro que significam "não consegui falar com o banco" (rede,
// DNS, queda, limite de conexões) — diferentes de erro de SQL/código.
const CODIGOS_CONEXAO = new Set([
  "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH",
  "ENOTFOUND", "EAI_AGAIN", "EPIPE", "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_SEQUENCE_TIMEOUT", "ER_CON_COUNT_ERROR", "ER_SERVER_SHUTDOWN",
  "ER_ACCESS_DENIED_ERROR_RETRY", "POOL_CLOSED",
]);

function erroDeConexao(err) {
  if (!err) return false;
  if (CODIGOS_CONEXAO.has(err.code)) return true;
  if (err.fatal === true && /connect|socket|closed|timeout/i.test(String(err.message))) return true;
  return false;
}

function comLimite(promessa, ms, mensagem) {
  let t;
  const limite = new Promise((_, rej) => {
    t = setTimeout(() => {
      const e = new Error(mensagem);
      e.code = "ETIMEDOUT";
      rej(e);
    }, ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(t));
}

async function sondarBanco() {
  try {
    await comLimite(pool.query("SELECT 1"), LIMITE_SONDA_MS, "Banco não respondeu à sonda");
    if (estado.bancoOk === false) {
      console.log("[saude] Banco de dados voltou a responder.");
    }
    estado.bancoOk = true;
    estado.falhasSeguidas = 0;
    estado.ultimoOkEm = Date.now();
    estado.ultimoErro = null;
  } catch (err) {
    estado.falhasSeguidas += 1;
    estado.ultimaFalhaEm = Date.now();
    estado.ultimoErro = err.code || err.message;
    if (estado.falhasSeguidas >= FALHAS_PARA_CAIR && estado.bancoOk !== false) {
      console.error(`[saude] Banco de dados fora do ar (${estado.ultimoErro}). Rotas /api respondem 503 até voltar.`);
      estado.bancoOk = false;
    } else if (estado.bancoOk === null && estado.falhasSeguidas >= FALHAS_PARA_CAIR) {
      estado.bancoOk = false;
    }
  }
  return estado.bancoOk === true;
}

function iniciarMonitoramento() {
  if (timer) return;
  sondarBanco();
  timer = setInterval(sondarBanco, INTERVALO_SONDA_MS);
  if (typeof timer.unref === "function") timer.unref();
}

function marcarMigracoesOk() {
  estado.migracoesOk = true;
}

function registrarTentativaMigracao() {
  estado.tentativasMigracao += 1;
}

function snapshot() {
  const iso = (v) => (v ? new Date(v).toISOString() : null);
  return {
    banco: estado.bancoOk === null ? "verificando" : estado.bancoOk ? "ok" : "fora",
    migracoes: estado.migracoesOk ? "ok" : "pendentes",
    tentativas_migracao: estado.tentativasMigracao,
    ultimo_ok_em: iso(estado.ultimoOkEm),
    ultima_falha_em: iso(estado.ultimaFalhaEm),
    ultimo_erro: estado.ultimoErro,
    uptime_segundos: Math.round((Date.now() - estado.iniciouEm) / 1000),
  };
}

const MENSAGEM_INDISPONIVEL =
  "O portal está temporariamente indisponível. Seus dados estão preservados — tente novamente em alguns minutos.";

// Rotas liberadas mesmo com o banco fora (monitoramento).
function rotaLivre(req) {
  return req.path === "/api/health" || req.path.startsWith("/api/health/");
}

/**
 * Middleware: responde 503 imediato quando o banco está fora ou as migrações
 * não terminaram, e aplica o limite de tempo por requisição.
 * Pré-flight CORS (OPTIONS) passa sempre — o navegador precisa dele para
 * conseguir ler o 503.
 */
function protecaoIndisponibilidade(req, res, next) {
  if (req.method === "OPTIONS" || !req.path.startsWith("/api") || rotaLivre(req)) return next();

  const fora = estado.bancoOk === false;
  if (!estado.migracoesOk || fora) {
    res.setHeader("Retry-After", "30");
    return res.status(503).json({
      ok: false,
      codigo: "SERVICO_INDISPONIVEL",
      message: MENSAGEM_INDISPONIVEL,
    });
  }

  const limiteMs = Number(process.env.REQUEST_TIMEOUT_MS) || 120_000;
  const t = setTimeout(() => {
    if (res.headersSent) return;
    console.error(`[saude] Requisição estourou ${limiteMs} ms: ${req.method} ${req.originalUrl.split("?")[0]}`);
    res.setHeader("Retry-After", "30");
    res.status(503).json({
      ok: false,
      codigo: "TEMPO_ESGOTADO",
      message: "A resposta demorou mais do que o esperado. Tente novamente em instantes.",
    });
  }, limiteMs);
  const limpar = () => clearTimeout(t);
  res.on("finish", limpar);
  res.on("close", limpar);
  return next();
}

module.exports = {
  erroDeConexao,
  iniciarMonitoramento,
  marcarMigracoesOk,
  registrarTentativaMigracao,
  protecaoIndisponibilidade,
  snapshot,
  sondarBanco,
  estado,
};
