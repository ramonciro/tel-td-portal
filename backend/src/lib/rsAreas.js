/**
 * rsAreas.js — Áreas/produtos do R&S que NÃO são cliente do T&D (Staff, Administrativo...).
 * Cadastro próprio do R&S (tabela rs_areas): nunca entra na lista de clientes nem nas telas do T&D.
 * CommonJS — nunca usar import/export.
 */
const db = require("./db");

const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Nomes (normalizados) de todas as áreas cadastradas do ambiente, ativas ou não. Tabela ausente = vazio. */
async function chavesDeAreas(empresaId) {
  try {
    const [rows] = await db.query("SELECT nome FROM rs_areas WHERE empresa_id = ?", [empresaId]);
    return new Set(rows.map((r) => semAcento(r.nome)).filter(Boolean));
  } catch (_) { return new Set(); }
}

module.exports = { semAcento, chavesDeAreas };
