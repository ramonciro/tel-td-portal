// Arquivos enviados (Biblioteca) ficam PRIVADOS: o endereço /uploads/... só
// responde quando traz uma assinatura válida e não vencida. A assinatura é
// gerada por uma rota autenticada (que confere empresa, cliente e perfil) e
// vale por poucos minutos — o link que alguém copiar e repassar morre rápido.
const path = require("path");
const crypto = require("crypto");

const VALIDADE_SEGUNDOS = 5 * 60;

// Pasta onde os arquivos ficam. No Railway, monte um volume em /app/uploads
// (ou aponte UPLOADS_DIR para o ponto de montagem) para não perder arquivos
// a cada deploy.
function pastaUploads() {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
}

function segredo() {
  const s = process.env.UPLOAD_SIGN_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error("Segredo de assinatura não configurado.");
  return s;
}

// "/biblioteca/arquivo.pdf" — sempre sem "..", sem barra dupla, sem query.
function caminhoSeguro(caminho) {
  const p = String(caminho || "");
  if (!p.startsWith("/") || p.includes("\0") || p.includes("\\")) return null;
  const partes = p.split("/").filter(Boolean);
  if (!partes.length || partes.some((x) => x === "." || x === ".." )) return null;
  return "/" + partes.join("/");
}

function assinar(caminho, exp) {
  return crypto.createHmac("sha256", segredo()).update(`${caminho}|${exp}`).digest("hex");
}

function gerarQuery(caminho, validadeSegundos = VALIDADE_SEGUNDOS) {
  const seguro = caminhoSeguro(caminho);
  if (!seguro) return null;
  const exp = Math.floor(Date.now() / 1000) + validadeSegundos;
  return `exp=${exp}&sig=${assinar(seguro, exp)}`;
}

function validar(caminho, exp, sig) {
  const seguro = caminhoSeguro(caminho);
  const expN = Number(exp);
  if (!seguro || !Number.isFinite(expN) || !sig) return false;
  if (expN < Math.floor(Date.now() / 1000)) return false;
  const esperado = Buffer.from(assinar(seguro, expN), "hex");
  let recebido;
  try { recebido = Buffer.from(String(sig), "hex"); } catch { return false; }
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

// Middleware do /uploads: sem assinatura válida, nega.
function exigirAssinatura(req, res, next) {
  try {
    if (validar(decodeURIComponent(req.path), req.query.exp, req.query.sig)) return next();
  } catch (_) { /* cai no 403 abaixo */ }
  return res.status(403).json({ ok: false, message: "Link do arquivo inválido ou vencido. Abra o material de novo pela Biblioteca." });
}

module.exports = { pastaUploads, gerarQuery, validar, exigirAssinatura, caminhoSeguro, VALIDADE_SEGUNDOS };
