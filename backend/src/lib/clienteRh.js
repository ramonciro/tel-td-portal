/**
 * clienteRh.js — Acesso do cliente ao módulo RH (Pacote 5, 13/11/2026)
 *
 * O perfil "cliente_rh" é uma pessoa de FORA da empresa (o cliente) que entra com login próprio e só enxerga as pesquisas de clima
 * que o coordenador do RH liberou para o cliente dela. Como muitas rotas do portal só exigem "estar logado", a regra aqui é NEGAR POR PADRÃO:
 * o middleware de autenticação (middlewares/auth.js) consulta esta lista e barra qualquer rota que não esteja nela.
 *
 * Só passam: leitura (GET) do portal do cliente (/api/rh/cliente/...) e a troca da própria senha. Nada mais, nem leitura de outros módulos.
 * CommonJS — nunca usar import/export.
 */
const PERFIL_CLIENTE_RH = "cliente_rh";

const caminho = (req) => String(req.originalUrl || req.url || "").split("?")[0].replace(/\/+$/, "");

// Cada segmento só aceita letras, números, "_" e "-": "..", "%2e" e afins nunca casam.
const RE_PORTAL = /^\/api\/rh\/cliente(\/[A-Za-z0-9_-]+)*$/;

function rotaPermitidaParaClienteRh(req) {
  const p = caminho(req);
  const m = String(req.method || "").toUpperCase();
  if ((m === "GET" || m === "HEAD") && RE_PORTAL.test(p)) return true;
  if (m === "POST" && p === "/api/auth/alterar-senha") return true;
  return false;
}

const ehClienteRh = (perfil) => String(perfil || "").toLowerCase().trim() === PERFIL_CLIENTE_RH;

module.exports = { PERFIL_CLIENTE_RH, rotaPermitidaParaClienteRh, ehClienteRh };
