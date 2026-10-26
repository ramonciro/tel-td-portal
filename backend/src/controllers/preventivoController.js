/**
 * preventivoController.js — Radar preventivo (Pacote 1, 26/10/2026)
 * Leitura apenas. Coordenação, supervisão, superintendência e assistente veem
 * as turmas (respeitando o cliente do usuário); o instrutor vê só as próprias
 * (principal ou adicional, TBT). A assistente enxerga todos os ambientes.
 */
const { tenantScopeFor } = require("../lib/tenantScope");
const { usuarioTemAcessoAoCliente } = require("../lib/acessoCliente");
const P = require("../services/preventivoService");

const chave = (s) => String(s || "").trim().toLowerCase();
const erro = (res, status, msg) => res.status(status).json({ ok: false, message: msg, error: msg });

function recorte(req) {
  const instrutorLogin = chave(req.user?.perfil) === "instrutor" ? req.user?.nome : null;
  return {
    empresaId: tenantScopeFor(req, { crossTenantRoles: ["assistente_treinamento"] }).empresaId,
    instrutor: instrutorLogin || undefined,
    podeVer: (t) => usuarioTemAcessoAoCliente(req, t.cliente),
    so_proprias: !!instrutorLogin,
  };
}

async function prontidao(req, res) {
  try {
    const r = recorte(req);
    const dados = await P.calcularProntidao({ ...r, dias: req.query.dias });
    return res.json({ ok: true, ...dados, so_proprias: r.so_proprias });
  } catch (e) {
    console.error("[preventivo.prontidao]", e.message || e);
    return erro(res, 500, "Erro ao carregar a prontidão das turmas.");
  }
}

async function riscoCertificacao(req, res) {
  try {
    const r = recorte(req);
    const dados = await P.calcularRiscoCertificacao(r);
    return res.json({ ok: true, ...dados, so_proprias: r.so_proprias });
  } catch (e) {
    console.error("[preventivo.riscoCertificacao]", e.message || e);
    return erro(res, 500, "Erro ao carregar o risco de certificação.");
  }
}

module.exports = { prontidao, riscoCertificacao };
