/**
 * rotas.js — lista as rotas registradas num app Express 4 (inclusive as de sub-routers montados com app.use).
 */
function prefixoDe(layer) {
  if (layer.path) return layer.path;
  const src = layer.regexp && layer.regexp.source;
  if (!src || layer.regexp.fast_slash) return "";
  const m = src
    .replace("^\\/", "/")
    .replace("\\/?(?=\\/|$)", "")
    .replace(/\\\//g, "/")
    .replace(/\$$/, "");
  return m === "^" ? "" : m;
}

function listar(app) {
  const saida = [];
  const andar = (stack, prefixo) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const metodo of Object.keys(layer.route.methods)) {
          saida.push({ metodo: metodo.toUpperCase(), caminho: prefixo + layer.route.path });
        }
      } else if (layer.name === "router" && layer.handle && layer.handle.stack) {
        andar(layer.handle.stack, prefixo + prefixoDe(layer));
      }
    }
  };
  andar(app._router.stack, "");
  return saida;
}

module.exports = { listar };
