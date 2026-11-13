/**
 * rhOnboardingService.js — Acompanhamento do onboarding dos novatos (Pacote 8, 13/11/2026)
 *
 * A população é a do Canguru (rh_canguru_novatos, com data de admissão). O coordenador define as etapas (nome + prazo em dias a
 * partir da admissão); a equipe do RH marca cada etapa como feita (com a data), "não se aplica" ou deixa pendente.
 * Etapa pendente cujo prazo já passou aparece como atrasada. gestor_rh vê só totais e percentuais de grupos com o mínimo de novatos.
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const R = require("../lib/rhBase");
const Canguru = require("./rhCangaruService");

const erroHttp = (status, message) => { const e = new Error(message); e.status = status; return e; };
const arred1 = (v) => Math.round(v * 10) / 10;
const pct = (a, b) => (b ? arred1((a / b) * 100) : null);
const MAX_ETAPAS_ATIVAS = 20;
const STATUS = ["feito", "na", "pendente"];
const ETAPAS_PADRAO = [
  { nome: "Acessos e equipamentos entregues", prazo_dias: 1 },
  { nome: "Documentação admissional completa", prazo_dias: 2 },
  { nome: "Apresentação à equipe", prazo_dias: 2 },
  { nome: "Conversa de boas-vindas (1ª semana)", prazo_dias: 7 },
  { nome: "Treinamento inicial concluído", prazo_dias: 15 },
  { nome: "Feedback do supervisor", prazo_dias: 30 },
];

const dataIso = (v) => (!v ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const somaDias = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const dataValida = (v) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))) return false; const d = new Date(`${v}T00:00:00Z`); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; };

// ── Etapas ────────────────────────────────────────────────────────────
async function garantirEtapas(empresaId) {
  const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM rh_onboarding_etapas WHERE empresa_id = ?`, [empresaId]);
  if (Number(n) > 0) return;
  let i = 1;
  for (const e of ETAPAS_PADRAO) await pool.query(`INSERT INTO rh_onboarding_etapas (empresa_id, nome, prazo_dias, ordem, ativa) VALUES (?,?,?,?,1)`, [empresaId, e.nome, e.prazo_dias, i++]);
}
async function listarEtapas(empresaId, { incluirInativas = false } = {}) {
  await garantirEtapas(empresaId);
  const [rows] = await pool.query(`SELECT id, nome, prazo_dias, ordem, ativa FROM rh_onboarding_etapas WHERE empresa_id = ? ${incluirInativas ? "" : "AND ativa = 1"} ORDER BY ativa DESC, prazo_dias, ordem, id`, [empresaId]);
  return rows.map((r) => ({ id: r.id, nome: r.nome, prazo_dias: Number(r.prazo_dias), ordem: Number(r.ordem), ativa: Number(r.ativa) === 1 }));
}
function validarEtapa(b, parcial = false) {
  const out = {};
  if (!parcial || b.nome !== undefined) {
    const nome = String(b.nome ?? "").replace(/\s+/g, " ").trim();
    if (!nome) throw erroHttp(400, "Dê um nome para a etapa.");
    if (nome.length > 120) throw erroHttp(400, "O nome da etapa pode ter no máximo 120 caracteres.");
    out.nome = nome;
  }
  if (!parcial || b.prazo_dias !== undefined) {
    const n = Number(b.prazo_dias);
    if (!Number.isInteger(n) || n < 0 || n > 365) throw erroHttp(400, "O prazo deve ser um número inteiro de dias, de 0 a 365 (contado a partir da admissão).");
    out.prazo_dias = n;
  }
  if (b.ativa !== undefined) out.ativa = b.ativa === true || b.ativa === 1 || b.ativa === "1" ? 1 : 0;
  return out;
}
async function criarEtapa(empresaId, b) {
  await garantirEtapas(empresaId);
  const v = validarEtapa(b);
  const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM rh_onboarding_etapas WHERE empresa_id = ? AND ativa = 1`, [empresaId]);
  if (Number(n) >= MAX_ETAPAS_ATIVAS) throw erroHttp(409, `Já existem ${MAX_ETAPAS_ATIVAS} etapas ativas. Desative alguma antes de criar outra.`);
  const [dup] = await pool.query(`SELECT id FROM rh_onboarding_etapas WHERE empresa_id = ? AND ativa = 1 AND LOWER(nome) = LOWER(?)`, [empresaId, v.nome]);
  if (dup.length) throw erroHttp(409, "Já existe uma etapa ativa com esse nome.");
  const [[{ m }]] = await pool.query(`SELECT COALESCE(MAX(ordem),0) AS m FROM rh_onboarding_etapas WHERE empresa_id = ?`, [empresaId]);
  const [r] = await pool.query(`INSERT INTO rh_onboarding_etapas (empresa_id, nome, prazo_dias, ordem, ativa) VALUES (?,?,?,?,1)`, [empresaId, v.nome, v.prazo_dias, Number(m) + 1]);
  return { id: r.insertId, ...v, ativa: true };
}
async function atualizarEtapa(empresaId, id, b) {
  const [[e]] = await pool.query(`SELECT * FROM rh_onboarding_etapas WHERE id = ? AND empresa_id = ?`, [id, empresaId]);
  if (!e) throw erroHttp(404, "Etapa não encontrada");
  const v = validarEtapa(b, true);
  if (!Object.keys(v).length) throw erroHttp(400, "Nada para alterar.");
  if (v.ativa === 1 && Number(e.ativa) === 0) {
    const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM rh_onboarding_etapas WHERE empresa_id = ? AND ativa = 1`, [empresaId]);
    if (Number(n) >= MAX_ETAPAS_ATIVAS) throw erroHttp(409, `Já existem ${MAX_ETAPAS_ATIVAS} etapas ativas. Desative alguma antes.`);
  }
  const nomeFinal = v.nome ?? e.nome;
  if ((v.ativa ?? Number(e.ativa)) === 1) {
    const [dup] = await pool.query(`SELECT id FROM rh_onboarding_etapas WHERE empresa_id = ? AND ativa = 1 AND LOWER(nome) = LOWER(?) AND id <> ?`, [empresaId, nomeFinal, id]);
    if (dup.length) throw erroHttp(409, "Já existe uma etapa ativa com esse nome.");
  }
  const sets = Object.keys(v).map((k) => `${k} = ?`).join(", ");
  await pool.query(`UPDATE rh_onboarding_etapas SET ${sets} WHERE id = ? AND empresa_id = ?`, [...Object.values(v), id, empresaId]);
  return { antes: { nome: e.nome, prazo_dias: Number(e.prazo_dias), ativa: Number(e.ativa) === 1 }, depois: { nome: nomeFinal, prazo_dias: v.prazo_dias ?? Number(e.prazo_dias), ativa: (v.ativa ?? Number(e.ativa)) === 1 } };
}

// ── Painel ────────────────────────────────────────────────────────────
function janela(f) {
  const ok = (v) => (dataValida(v) ? v : null);
  const hoje = R.hojeISO();
  const ate = ok(f.ate) || hoje;
  const de = ok(f.de) || somaDias(ate, -59);
  if (de > ate) throw erroHttp(400, "A data inicial não pode ser depois da final.");
  if (diasEntre(de, ate) > 366) throw erroHttp(400, "O período pode ter no máximo 1 ano.");
  return { de, ate, hoje };
}

async function carregar(empresaId, f) {
  const { de, ate, hoje } = janela(f);
  const etapas = await listarEtapas(empresaId);
  const params = [empresaId, de, ate]; let where = "n.empresa_id = ? AND n.data_admissao BETWEEN ? AND ? AND NOT EXISTS (SELECT 1 FROM rh_desligamentos d WHERE d.empresa_id = n.empresa_id AND d.novato_id = n.id)";
  const servico = f.servico ? String(f.servico).trim() : null, site = f.site ? String(f.site).trim() : null;
  if (servico) { where += " AND n.servico = ?"; params.push(servico); }
  if (site) { where += " AND n.site = ?"; params.push(site); }
  const [novatos] = await pool.query(
    `SELECT n.id, n.matricula, n.site, n.servico, n.funcao, n.supervisor, n.coordenador, n.data_admissao, p.nome
       FROM rh_canguru_novatos n LEFT JOIN pessoas p ON p.id = n.pessoa_id AND p.empresa_id = n.empresa_id
      WHERE ${where} ORDER BY n.data_admissao DESC, n.id DESC LIMIT 3000`, params);
  const ids = novatos.map((n) => n.id);
  const mapa = new Map();
  if (ids.length) {
    const [st] = await pool.query(`SELECT novato_id, etapa_id, status, feito_em FROM rh_onboarding_status WHERE empresa_id = ? AND novato_id IN (?)`, [empresaId, ids]);
    for (const s of st) mapa.set(`${s.novato_id}|${s.etapa_id}`, s);
  }
  const lista = novatos.map((n) => {
    const adm = dataIso(n.data_admissao);
    const cels = etapas.map((e) => {
      const s = mapa.get(`${n.id}|${e.id}`);
      const prazo = somaDias(adm, e.prazo_dias);
      const status = s && STATUS.includes(s.status) ? s.status : "pendente";
      const feitoEm = s?.feito_em ? dataIso(s.feito_em) : null;
      const atrasada = status === "pendente" && prazo < hoje;
      const noPrazo = status === "feito" ? (feitoEm ? feitoEm <= prazo : null) : null;
      return { etapa_id: e.id, status, feito_em: feitoEm, prazo, atrasada, no_prazo: noPrazo, devida: prazo <= hoje };
    });
    const aplicaveis = cels.filter((c) => c.status !== "na");
    const feitas = cels.filter((c) => c.status === "feito").length;
    return { id: n.id, nome: n.nome, matricula: n.matricula, servico: n.servico, site: n.site, funcao: n.funcao, supervisor: n.supervisor, coordenador: n.coordenador, data_admissao: adm, dia: diasEntre(adm, hoje), cels,
      feitas, aplicaveis: aplicaveis.length, pct: pct(feitas, aplicaveis.length), atrasadas: cels.filter((c) => c.atrasada).length };
  });
  return { janela: { de, ate, hoje }, etapas, lista, filtros: { servico, site } };
}

const resumirGrupo = (ls) => {
  const cels = ls.flatMap((l) => l.cels).filter((c) => c.status !== "na");
  const feitas = cels.filter((c) => c.status === "feito");
  const devidas = cels.filter((c) => c.devida);
  const devidasFeitas = devidas.filter((c) => c.status === "feito").length;
  const comPrazo = feitas.filter((c) => c.no_prazo !== null);
  return { novatos: ls.length, etapas_aplicaveis: cels.length, feitas: feitas.length, pct_concluido: pct(feitas.length, cels.length), atrasadas: cels.filter((c) => c.atrasada).length,
    pct_devidas_feitas: pct(devidasFeitas, devidas.length), pct_no_prazo: pct(comPrazo.filter((c) => c.no_prazo).length, comPrazo.length), com_atraso: ls.filter((l) => l.atrasadas > 0).length };
};

async function painel(empresaId, filtros, { ocultar }) {
  const cfg = await Canguru.carregarConfig(empresaId);
  const { janela: j, etapas, lista, filtros: ff } = await carregar(empresaId, filtros);
  const base = { ok: true, periodo: { de: j.de, ate: j.ate }, filtros_aplicados: ff, min_grupo: cfg.min_grupo };
  if (ocultar && lista.length < cfg.min_grupo) return { ...base, poucos: true, novatos: lista.length, etapas: etapas.map((e) => ({ id: e.id, nome: e.nome, prazo_dias: e.prazo_dias })), mensagem: `Há poucos novatos no período (menos de ${cfg.min_grupo}) para mostrar o resultado sem identificar ninguém.` };
  const geral = resumirGrupo(lista);
  const porEtapa = etapas.map((e) => {
    const cels = lista.map((l) => l.cels.find((c) => c.etapa_id === e.id)).filter((c) => c && c.status !== "na");
    const feitas = cels.filter((c) => c.status === "feito"); const devidas = cels.filter((c) => c.devida);
    const comPrazo = feitas.filter((c) => c.no_prazo !== null);
    return { id: e.id, nome: e.nome, prazo_dias: e.prazo_dias, aplicaveis: cels.length, feitas: feitas.length, pct_feitas: pct(feitas.length, cels.length), atrasadas: cels.filter((c) => c.atrasada).length, pct_no_prazo: pct(comPrazo.filter((c) => c.no_prazo).length, comPrazo.length), devidas: devidas.length };
  });
  const dim = (campo) => {
    const g = new Map(); for (const l of lista) { const k = l[campo] || null; if (!g.has(k)) g.set(k, []); g.get(k).push(l); }
    const out = [...g.entries()].map(([k, ls]) => ({ rotulo: campo === "site" ? Canguru.rotuloSite(k) : (k || "Sem serviço"), valor: k, ...resumirGrupo(ls), poucos: ls.length < cfg.min_grupo })).sort((a, b) => b.novatos - a.novatos);
    const vis = ocultar ? out.filter((x) => !x.poucos) : out;
    return { linhas: vis.slice(0, 60), ocultos: ocultar ? out.length - vis.length : 0 };
  };
  const avisos = [];
  if (lista.length && !geral.feitas) avisos.push("Nenhuma etapa foi marcada ainda: por isso tudo com prazo vencido aparece como atrasado. Marque as etapas já cumpridas (dá para marcar vários novatos de uma vez).");
  if (!lista.length) avisos.push("Nenhum novato com data de admissão nesse período. A população vem do Projeto Canguru: importe as avaliações ou as admissões lá.");
  avisos.push("Quem já foi desligado (lançado em Turnover) não entra na conta. Percentual concluído = etapas feitas ÷ etapas que se aplicam (as marcadas “não se aplica” saem da conta). Atrasada = pendente com o prazo (admissão + dias da etapa) já vencido.");
  if (ocultar) avisos.push(`Grupos com menos de ${cfg.min_grupo} novatos não aparecem por serviço/site.`);
  const out = { ...base, etapas: etapas.map((e) => ({ id: e.id, nome: e.nome, prazo_dias: e.prazo_dias })), geral, por_etapa: porEtapa, por_servico: dim("servico"), por_site: dim("site"), avisos };
  if (!ocultar) out.novatos_lista = lista.map((l) => ({ id: l.id, nome: l.nome, matricula: l.matricula, servico: l.servico, site: l.site ? Canguru.rotuloSite(l.site) : null, funcao: l.funcao, supervisor: l.supervisor, coordenador: l.coordenador,
    data_admissao: l.data_admissao, dia: l.dia, pct: l.pct, feitas: l.feitas, aplicaveis: l.aplicaveis, atrasadas: l.atrasadas, cels: l.cels.map((c) => ({ etapa_id: c.etapa_id, status: c.status, feito_em: c.feito_em, prazo: c.prazo, atrasada: c.atrasada, no_prazo: c.no_prazo })) }));
  return out;
}

async function opcoes(empresaId) {
  const [s] = await pool.query(`SELECT servico AS v FROM rh_canguru_novatos WHERE empresa_id = ? AND servico IS NOT NULL AND servico <> '' GROUP BY servico ORDER BY servico`, [empresaId]);
  const [t] = await pool.query(`SELECT site AS v FROM rh_canguru_novatos WHERE empresa_id = ? AND site IS NOT NULL AND site <> '' GROUP BY site ORDER BY site`, [empresaId]);
  return { servicos: s.map((x) => x.v), sites: t.map((x) => ({ valor: x.v, rotulo: Canguru.rotuloSite(x.v) })) };
}

// ── Marcação ──────────────────────────────────────────────────────────
async function marcar(empresaId, usuario, b) {
  const status = String(b.status || "").toLowerCase();
  if (!STATUS.includes(status)) throw erroHttp(400, "Escolha o status: feito, não se aplica ou pendente.");
  const etapaId = Number(b.etapa_id); if (!Number.isInteger(etapaId) || etapaId <= 0) throw erroHttp(400, "Escolha a etapa.");
  let ids = Array.isArray(b.novato_ids) ? b.novato_ids : b.novato_id !== undefined ? [b.novato_id] : [];
  ids = [...new Set(ids.map(Number))];
  if (!ids.length || ids.some((x) => !Number.isInteger(x) || x <= 0)) throw erroHttp(400, "Escolha ao menos um novato.");
  if (ids.length > 500) throw erroHttp(400, "Marque no máximo 500 novatos de uma vez.");
  const [[et]] = await pool.query(`SELECT id, nome FROM rh_onboarding_etapas WHERE id = ? AND empresa_id = ?`, [etapaId, empresaId]);
  if (!et) throw erroHttp(404, "Etapa não encontrada");
  const [nov] = await pool.query(`SELECT id, data_admissao FROM rh_canguru_novatos WHERE empresa_id = ? AND id IN (?)`, [empresaId, ids]);
  if (nov.length !== ids.length) throw erroHttp(404, "Algum novato não foi encontrado.");
  const hoje = R.hojeISO();
  let feitoEm = null;
  if (status === "feito") {
    feitoEm = b.feito_em ? String(b.feito_em).slice(0, 10) : hoje;
    if (!dataValida(feitoEm)) throw erroHttp(400, "Data inválida.");
    if (feitoEm > hoje) throw erroHttp(400, "A data de conclusão não pode ser no futuro.");
    const antes = nov.find((n) => n.data_admissao && dataIso(n.data_admissao) > feitoEm);
    if (antes) throw erroHttp(400, "A data de conclusão não pode ser anterior à admissão do novato.");
  }
  await comTransacao(async (conn) => {
    for (const id of ids) {
      if (status === "pendente") { await conn.query(`DELETE FROM rh_onboarding_status WHERE empresa_id = ? AND novato_id = ? AND etapa_id = ?`, [empresaId, id, etapaId]); continue; }
      await conn.query(
        `INSERT INTO rh_onboarding_status (empresa_id, novato_id, etapa_id, status, feito_em, marcado_por, marcado_por_nome) VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), feito_em = VALUES(feito_em), marcado_por = VALUES(marcado_por), marcado_por_nome = VALUES(marcado_por_nome)`,
        [empresaId, id, etapaId, status, feitoEm, usuario?.id ?? null, String(usuario?.nome || "").slice(0, 150) || null]);
    }
  });
  return { etapa: et.nome, status, feito_em: feitoEm, novatos: ids.length };
}

module.exports = { STATUS, ETAPAS_PADRAO, MAX_ETAPAS_ATIVAS, listarEtapas, criarEtapa, atualizarEtapa, painel, opcoes, marcar, carregar };
