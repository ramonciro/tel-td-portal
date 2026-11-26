/**
 * servidor.js — sobe a API real (src/index.js) numa porta aleatória e oferece um cliente HTTP simples.
 * Não roda migrações nem agendamentos: o banco já vem pronto do preparar-banco.js.
 */
require("./ambiente");
const http = require("http");

async function iniciar() {
  const { app } = require("../../src/index");
  require("../../src/lib/saudeBanco").marcarMigracoesOk(); // sem isto a API responde 503 "migrações em andamento"
  const server = http.createServer(app);
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function chamar(metodo, caminho, { token, corpo } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (corpo !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(base + caminho, { method: metodo, headers, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
    const texto = await res.text();
    let json = null;
    try { json = JSON.parse(texto); } catch (_) { /* resposta não-JSON */ }
    return { status: res.status, texto, json };
  }

  return {
    app, base,
    get: (c, o) => chamar("GET", c, o),
    post: (c, corpo, o = {}) => chamar("POST", c, { ...o, corpo }),
    put: (c, corpo, o = {}) => chamar("PUT", c, { ...o, corpo }),
    patch: (c, corpo, o = {}) => chamar("PATCH", c, { ...o, corpo }),
    del: (c, o) => chamar("DELETE", c, o),
    fechar: () => new Promise((ok) => server.close(ok)),
  };
}

module.exports = { iniciar };
