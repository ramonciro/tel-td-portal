/**
 * corsOrigens.js — quais sites podem chamar a API pelo navegador (26/11/2026).
 *
 * Antes: `cors()` sem opções = qualquer site da internet podia fazer o navegador de um usuário logado
 * chamar a API. O token vai no cabeçalho Authorization (não em cookie), então o risco real era baixo,
 * mas não há motivo para deixar aberto.
 *
 * Permitidos:
 *   - FRONTEND_URL (variável do Railway; o endereço do portal);
 *   - CORS_ORIGINS (opcional, lista separada por vírgula — para um domínio novo ou um preview da Vercel);
 *   - https://tel-td-portal.vercel.app (domínio de produção atual);
 *   - localhost / 127.0.0.1 em qualquer porta (desenvolvimento local; não expõe nada, pois o navegador do
 *     atacante teria de estar na máquina do próprio usuário).
 * Requisição sem cabeçalho Origin (curl, servidor-a-servidor, healthcheck do Railway) passa normalmente:
 * CORS só existe para navegadores.
 */
function normalizar(url) {
  const s = String(url || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  try {
    return new URL(s).origin; // tira caminho e barra final
  } catch {
    return s;
  }
}

function montarListaPermitida(env = process.env) {
  const lista = new Set();
  const add = (v) => { const o = normalizar(v); if (o) lista.add(o); };
  add(env.FRONTEND_URL);
  String(env.CORS_ORIGINS || "").split(",").forEach(add);
  add("https://tel-td-portal.vercel.app");
  return lista;
}

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function origemPermitida(origem, env = process.env) {
  if (!origem) return true;
  if (montarListaPermitida(env).has(normalizar(origem))) return true;
  if (LOCAL.test(origem)) return true;
  return false;
}

/** Opções para o middleware `cors`. Origem não permitida: sem cabeçalhos CORS (o navegador bloqueia), sem erro 500. */
function opcoesCors(env = process.env) {
  return {
    origin(origem, cb) {
      cb(null, origemPermitida(origem, env));
    },
    maxAge: 600,
  };
}

module.exports = { montarListaPermitida, origemPermitida, opcoesCors, normalizar };
