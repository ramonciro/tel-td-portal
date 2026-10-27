/**
 * preventivoController.js — Radar preventivo (Pacote 1, 26/10/2026)
 * Leitura apenas. Coordenação, supervisão, superintendência e assistente veem
 * as turmas (respeitando o cliente do usuário); o instrutor vê só as próprias
 * (principal ou adicional, TBT). A assistente enxerga todos os ambientes.
 */
const { tenantScopeFor } = require("../lib/tenantScope");
const { usuarioTemAcessoAoCliente } = require("../lib/acessoCliente");
const P = require("../services/preventivoService");
const C = require("../services/preventivoCargaService");
const R = require("../services/radarSemanalService");
const Q = require("../services/preventivoQualidadeService");

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

async function cargaFutura(req, res) {
  try {
    const r = recorte(req);
    const dados = await C.calcularCargaFutura({ empresaId: r.empresaId, instrutor: r.instrutor });
    return res.json({ ok: true, ...dados, so_proprias: r.so_proprias });
  } catch (e) {
    console.error("[preventivo.cargaFutura]", e.message || e);
    return erro(res, 500, "Erro ao carregar a carga futura.");
  }
}

// R&S → T&D: só dados de planejamento das RPs (sem nome de candidato). Instrutor não acessa (barrado na rota).
async function demandaRS(req, res) {
  try {
    const r = recorte(req);
    const dados = await C.calcularDemandaRS({ empresaId: r.empresaId });
    return res.json({ ok: true, ...dados });
  } catch (e) {
    console.error("[preventivo.demandaRS]", e.message || e);
    return erro(res, 500, "Erro ao carregar a demanda do R&S.");
  }
}

// Radar semanal (Pacote 3): top 5, decisões sugeridas, comparação, faróis e prevenção.
async function radarSemanal(req, res) {
  try {
    const r = recorte(req);
    const dados = await R.radarDaSemana({ empresaId: r.empresaId, podeVer: (c) => usuarioTemAcessoAoCliente(req, c) });
    return res.json({ ok: true, motivos: R.MOTIVOS_PADRAO, ...dados });
  } catch (e) {
    console.error("[preventivo.radarSemanal]", e.message || e);
    return erro(res, 500, "Erro ao carregar o Radar da semana.");
  }
}

// Tendência de qualidade (Pacote 4): NPS e presença por instrutor, tema e cliente, em janela móvel de 3 turmas.
async function qualidade(req, res) {
  try {
    const r = recorte(req);
    const dados = await Q.calcularTendencias({ empresaId: r.empresaId });
    const grupos = dados.grupos.filter((g) => usuarioTemAcessoAoCliente(req, g.cliente));
    const itens = dados.itens.filter((g) => usuarioTemAcessoAoCliente(req, g.cliente));
    return res.json({
      ok: true, hoje: dados.hoje, grupos,
      resumo: { ...dados.resumo, em_queda: itens.length, melhorando: grupos.filter((g) => g.status === "melhorando").length },
    });
  } catch (e) {
    console.error("[preventivo.qualidade]", e.message || e);
    return erro(res, 500, "Erro ao carregar a tendência de qualidade.");
  }
}

// Só mexe em item do próprio ambiente (ou compartilhado, empresa_id 0) e do cliente a que o usuário tem acesso.
async function _acao(req, res, fn, okMsg) {
  try {
    const id = Number(req.params.id);
    if (!id) return erro(res, 400, "Item inválido.");
    const [[it]] = await require("../lib/db").query("SELECT empresa_id, cliente FROM radar_itens WHERE id = ?", [id]);
    if (!it) return erro(res, 404, "Item do Radar não encontrado.");
    const escopo = tenantScopeFor(req, { crossTenantRoles: ["assistente_treinamento"] }).empresaId;
    if (escopo && it.empresa_id !== 0 && Number(it.empresa_id) !== Number(escopo)) return erro(res, 403, "Item de outro ambiente.");
    if (it.cliente && !usuarioTemAcessoAoCliente(req, it.cliente)) return erro(res, 403, "Sem acesso ao cliente deste item.");
    const r = await fn(id);
    if (r.erro) return erro(res, r.erro, r.msg);
    return res.json({ ok: true, message: okMsg });
  } catch (e) {
    console.error("[preventivo.radarAcao]", e.message || e);
    return erro(res, 500, "Não foi possível atualizar o item do Radar.");
  }
}
const radarResolver = (req, res) => _acao(req, res, (id) => R.resolverItem(req, id, req.body?.observacao), "Marcado como resolvido.");
const radarIgnorar = (req, res) => _acao(req, res, (id) => R.ignorarItem(req, id, req.body?.motivo, req.body?.dias), "Item ignorado.");
const radarReabrir = (req, res) => _acao(req, res, (id) => R.reabrirItem(req, id), "Item reaberto.");

module.exports = { prontidao, riscoCertificacao, cargaFutura, demandaRS, radarSemanal, qualidade, radarResolver, radarIgnorar, radarReabrir };
