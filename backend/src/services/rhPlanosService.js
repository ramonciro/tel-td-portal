/**
 * rhPlanosService.js — Planos de ação do RH (Pacote 5, 13/11/2026)
 *
 * Transforma o que a pesquisa de clima e o Canguru mostram em ação com dono e prazo. O plano fala de TEMA, SITE, SERVIÇO ou CLIENTE,
 * nunca de uma pessoa: o texto é do RH e não recebe dado individual do Canguru.
 *  - coordenador_rh e analista_rh criam e andam os planos; gestor_rh só lê;
 *  - o plano só aparece para o cliente se o coordenador marcar "visível para o cliente" (e o cliente tiver o ciclo liberado);
 *  - toda mudança de situação, prazo ou responsável vai para o histórico do plano.
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const { comTransacao } = require("../lib/tx");
const R = require("../lib/rhBase");
const Clima = require("./rhClimaService");
const Canguru = require("./rhCangaruService");

const erroHttp = (status, message) => { const e = new Error(message); e.status = status; return e; };
const ORIGENS = ["clima", "canguru", "livre"];
const STATUS = ["aberto", "andamento", "concluido", "cancelado"];
const PRIORIDADES = ["alta", "media", "baixa"];
const ABERTOS = ["aberto", "andamento"];
const ROTULO_STATUS = { aberto: "Aberto", andamento: "Em andamento", concluido: "Concluído", cancelado: "Cancelado" };
const um = (v) => String(Math.round(Number(v) * 10) / 10).replace(".", ",");
const iso = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
const somaDias = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);
const dataValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const limpa = (t, max) => { const x = String(t ?? "").replace(/\s+/g, " ").trim(); return x ? x.slice(0, max) : null; };
const limpaLivre = (t, max) => { const x = String(t ?? "").replace(/\r/g, "").trim(); return x ? x.slice(0, max) : null; };

function situacao(p, hoje) {
  if (!ABERTOS.includes(p.status)) return p.status;
  const prazo = iso(p.prazo);
  if (prazo < hoje) return "atrasado";
  if (prazo <= somaDias(hoje, 7)) return "vence_em_breve";
  return "no_prazo";
}

function montar(p, hoje) {
  return {
    id: p.id, origem: p.origem, ciclo_id: p.ciclo_id, ciclo_nome: p.ciclo_nome || null, tema: p.tema, cliente: p.cliente, titulo: p.titulo, acao: p.acao,
    responsavel_id: p.responsavel_id, responsavel: p.resp_nome || p.responsavel_nome || null, responsavel_externo: !p.responsavel_id && !!p.responsavel_nome,
    prazo: iso(p.prazo), prioridade: p.prioridade, status: p.status, status_rotulo: ROTULO_STATUS[p.status], situacao: situacao(p, hoje),
    resultado: p.resultado, visivel_cliente: !!p.visivel_cliente, concluido_em: p.concluido_em ? new Date(p.concluido_em).toISOString() : null,
    criado_em: p.created_at ? new Date(p.created_at).toISOString() : null,
  };
}

const SELECT = `SELECT p.*, u.nome AS resp_nome, c.nome AS ciclo_nome
  FROM rh_planos p LEFT JOIN usuarios u ON u.id = p.responsavel_id AND u.empresa_id = p.empresa_id LEFT JOIN rh_clima_ciclos c ON c.id = p.ciclo_id AND c.empresa_id = p.empresa_id`;

async function listar(empresaId, f = {}) {
  const hoje = R.hojeISO();
  const where = ["p.empresa_id = ?"]; const params = [empresaId];
  if (STATUS.includes(f.status)) { where.push("p.status = ?"); params.push(f.status); }
  else if (f.status === "abertos") where.push("p.status IN ('aberto','andamento')");
  if (ORIGENS.includes(f.origem)) { where.push("p.origem = ?"); params.push(f.origem); }
  if (Number(f.responsavel) > 0) { where.push("p.responsavel_id = ?"); params.push(Number(f.responsavel)); }
  if (Number(f.ciclo) > 0) { where.push("p.ciclo_id = ?"); params.push(Number(f.ciclo)); }
  if (f.cliente) { where.push("p.cliente = ?"); params.push(String(f.cliente).slice(0, 100)); }
  if (f.q) { where.push("(p.titulo LIKE ? OR p.tema LIKE ? OR p.acao LIKE ?)"); const q = `%${String(f.q).slice(0, 60).replace(/[%_]/g, "")}%`; params.push(q, q, q); }
  if (f.situacao === "atrasado") { where.push("p.status IN ('aberto','andamento') AND p.prazo < ?"); params.push(hoje); }
  if (f.situacao === "vence_em_breve") { where.push("p.status IN ('aberto','andamento') AND p.prazo >= ? AND p.prazo <= ?"); params.push(hoje, somaDias(hoje, 7)); }
  const [rows] = await pool.query(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY FIELD(p.status,'aberto','andamento','concluido','cancelado'), p.prazo ASC, p.id DESC LIMIT 500`, params);
  const [tot] = await pool.query(`SELECT status, prazo FROM rh_planos WHERE empresa_id = ?`, [empresaId]);
  const cont = { total: tot.length, abertos: 0, andamento: 0, concluidos: 0, cancelados: 0, atrasados: 0, vencendo: 0 };
  for (const t of tot) {
    if (t.status === "aberto") cont.abertos += 1; else if (t.status === "andamento") cont.andamento += 1; else if (t.status === "concluido") cont.concluidos += 1; else cont.cancelados += 1;
    if (ABERTOS.includes(t.status)) { const pz = iso(t.prazo); if (pz < hoje) cont.atrasados += 1; else if (pz <= somaDias(hoje, 7)) cont.vencendo += 1; }
  }
  const concluiveis = cont.concluidos + cont.abertos + cont.andamento;
  cont.conclusao_pct = concluiveis ? Math.round((cont.concluidos / concluiveis) * 1000) / 10 : null;
  const [clientes] = await pool.query(`SELECT DISTINCT cliente FROM rh_planos WHERE empresa_id = ? AND cliente IS NOT NULL ORDER BY cliente`, [empresaId]);
  return { planos: rows.map((p) => montar(p, hoje)), contagem: cont, filtros: { clientes: clientes.map((c) => c.cliente), equipe: await Canguru.equipe(empresaId) } };
}

async function obter(empresaId, id) {
  const [[p]] = await pool.query(`${SELECT} WHERE p.empresa_id = ? AND p.id = ?`, [empresaId, id]);
  if (!p) return null;
  const [hist] = await pool.query(`SELECT id, usuario_nome, evento, de_valor, para_valor, nota, created_at FROM rh_planos_hist WHERE empresa_id = ? AND plano_id = ? ORDER BY id DESC`, [empresaId, id]);
  return { ...montar(p, R.hojeISO()), historico: hist.map((h) => ({ ...h, created_at: new Date(h.created_at).toISOString() })) };
}

async function validarResponsavel(empresaId, id) {
  if (id === null || id === undefined || id === "") return null;
  const n = Number(id);
  const [[u]] = Number.isInteger(n) && n > 0 ? await pool.query(`SELECT id FROM usuarios WHERE id = ? AND empresa_id = ? AND perfil IN ('coordenador_rh','analista_rh') AND (ativo IS NULL OR ativo = 1)`, [n, empresaId]) : [[null]];
  if (!u) throw erroHttp(400, "O responsável precisa ser alguém da equipe do RH desta empresa.");
  return u.id;
}

async function validarCiclo(empresaId, id) {
  if (id === null || id === undefined || id === "") return null;
  const c = await Clima.carregarCiclo(empresaId, Number(id));
  if (!c) throw erroHttp(400, "Pesquisa de clima não encontrada.");
  return c.id;
}

const hist = (conn, empresaId, planoId, usuario, evento, de, para, nota) =>
  conn.query(`INSERT INTO rh_planos_hist (empresa_id, plano_id, usuario_id, usuario_nome, evento, de_valor, para_valor, nota) VALUES (?,?,?,?,?,?,?,?)`,
    [empresaId, planoId, usuario?.id ?? null, usuario?.nome ?? null, evento, de ? String(de).slice(0, 200) : null, para ? String(para).slice(0, 200) : null, nota || null]);

async function criar(empresaId, usuario, perfil, b = {}) {
  const origem = ORIGENS.includes(b.origem) ? b.origem : "livre";
  const titulo = limpa(b.titulo, 160); if (!titulo || titulo.length < 3) throw erroHttp(400, "Dê um título ao plano (pelo menos 3 letras).");
  const acao = limpaLivre(b.acao, 2000); if (!acao || acao.length < 5) throw erroHttp(400, "Descreva o que será feito.");
  if (!dataValida(b.prazo)) throw erroHttp(400, "Informe o prazo (AAAA-MM-DD).");
  if (b.prazo < R.hojeISO()) throw erroHttp(400, "O prazo não pode ser uma data que já passou.");
  const prioridade = PRIORIDADES.includes(b.prioridade) ? b.prioridade : "media";
  const respId = await validarResponsavel(empresaId, b.responsavel_id);
  const respNome = respId ? null : limpa(b.responsavel_nome, 120);
  if (!respId && !respNome) throw erroHttp(400, "Escolha quem é o responsável (alguém do RH ou o nome de quem vai tocar a ação).");
  const ciclo = await validarCiclo(empresaId, b.ciclo_id);
  const visivel = b.visivel_cliente ? 1 : 0;
  if (visivel && perfil !== R.PERFIL_COORD) throw erroHttp(403, "Só o coordenador do RH pode mostrar um plano ao cliente.");
  const id = await comTransacao(async (conn) => {
    const [ins] = await conn.query(
      `INSERT INTO rh_planos (empresa_id, origem, ciclo_id, tema, cliente, titulo, acao, responsavel_id, responsavel_nome, prazo, prioridade, status, visivel_cliente, criado_por)
       VALUES (?,?,?,?,?,?,?,?,?,?,?, 'aberto', ?, ?)`,
      [empresaId, origem, ciclo, limpa(b.tema, 150), limpa(b.cliente, 100), titulo, acao, respId, respNome, b.prazo, prioridade, visivel, usuario?.id ?? null]);
    await hist(conn, empresaId, ins.insertId, usuario, "criado", null, "Aberto", null);
    return ins.insertId;
  });
  return obter(empresaId, id);
}

async function atualizar(empresaId, usuario, perfil, id, b = {}) {
  const [[atual]] = await pool.query(`SELECT * FROM rh_planos WHERE empresa_id = ? AND id = ?`, [empresaId, id]);
  if (!atual) throw erroHttp(404, "Plano não encontrado.");
  const set = {}; const eventos = [];
  if (b.titulo !== undefined) { const t = limpa(b.titulo, 160); if (!t || t.length < 3) throw erroHttp(400, "Dê um título ao plano (pelo menos 3 letras)."); if (t !== atual.titulo) set.titulo = t; }
  if (b.acao !== undefined) { const a = limpaLivre(b.acao, 2000); if (!a || a.length < 5) throw erroHttp(400, "Descreva o que será feito."); if (a !== atual.acao) set.acao = a; }
  if (b.tema !== undefined) set.tema = limpa(b.tema, 150);
  if (b.cliente !== undefined) set.cliente = limpa(b.cliente, 100);
  if (b.prioridade !== undefined) { if (!PRIORIDADES.includes(b.prioridade)) throw erroHttp(400, "Prioridade inválida."); set.prioridade = b.prioridade; }
  if (b.prazo !== undefined && b.prazo !== iso(atual.prazo)) {
    if (!dataValida(b.prazo)) throw erroHttp(400, "Informe o prazo (AAAA-MM-DD).");
    if (b.prazo < R.hojeISO() && ABERTOS.includes(atual.status)) throw erroHttp(400, "O novo prazo não pode ser uma data que já passou.");
    set.prazo = b.prazo; eventos.push(["prazo", iso(atual.prazo), b.prazo, limpaLivre(b.nota_prazo, 500)]);
  }
  if (b.responsavel_id !== undefined || b.responsavel_nome !== undefined) {
    const respId = await validarResponsavel(empresaId, b.responsavel_id);
    const respNome = respId ? null : limpa(b.responsavel_nome, 120);
    if (!respId && !respNome) throw erroHttp(400, "Escolha quem é o responsável.");
    if (respId !== atual.responsavel_id || respNome !== atual.responsavel_nome) { set.responsavel_id = respId; set.responsavel_nome = respNome; eventos.push(["responsavel", null, respNome || `usuário ${respId}`, null]); }
  }
  if (b.visivel_cliente !== undefined) {
    const v = b.visivel_cliente ? 1 : 0;
    if (v !== (atual.visivel_cliente ? 1 : 0)) {
      if (perfil !== R.PERFIL_COORD) throw erroHttp(403, "Só o coordenador do RH pode mostrar ou esconder um plano do cliente.");
      set.visivel_cliente = v; eventos.push(["visibilidade", atual.visivel_cliente ? "Visível" : "Interno", v ? "Visível ao cliente" : "Interno", null]);
    }
  }
  if (b.ciclo_id !== undefined) set.ciclo_id = await validarCiclo(empresaId, b.ciclo_id);
  if (b.status !== undefined && b.status !== atual.status) {
    if (!STATUS.includes(b.status)) throw erroHttp(400, "Situação inválida.");
    const resultado = limpaLivre(b.resultado ?? atual.resultado, 2000);
    if (b.status === "concluido" && (!resultado || resultado.length < 5)) throw erroHttp(400, "Para concluir, conte o que foi feito e o resultado (pelo menos uma frase).");
    if (b.status === "cancelado" && !limpaLivre(b.nota_status, 500)) throw erroHttp(400, "Informe o motivo do cancelamento.");
    if (["concluido", "cancelado"].includes(atual.status) && perfil !== R.PERFIL_COORD) throw erroHttp(403, "Só o coordenador do RH reabre um plano concluído ou cancelado.");
    set.status = b.status;
    if (b.status === "concluido") { set.resultado = resultado; set.concluido_em = new Date(); } else { set.concluido_em = null; if (b.resultado !== undefined) set.resultado = resultado; }
    eventos.push(["situacao", ROTULO_STATUS[atual.status], ROTULO_STATUS[b.status], limpaLivre(b.nota_status, 500) || (b.status === "concluido" ? resultado : null)]);
  } else if (b.resultado !== undefined && atual.status === "concluido") set.resultado = limpaLivre(b.resultado, 2000);
  if (!Object.keys(set).length) return obter(empresaId, id);
  await comTransacao(async (conn) => {
    const cols = Object.keys(set);
    await conn.query(`UPDATE rh_planos SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ? AND empresa_id = ?`, [...cols.map((c) => set[c]), id, empresaId]);
    if (set.titulo !== undefined || set.acao !== undefined || set.prioridade !== undefined || set.tema !== undefined || set.cliente !== undefined) eventos.push(["edicao", null, null, null]);
    for (const [ev, de, para, nota] of eventos) await hist(conn, empresaId, id, usuario, ev, de, para, nota);
  });
  return obter(empresaId, id);
}

async function anotar(empresaId, usuario, id, nota) {
  const t = limpaLivre(nota, 1000); if (!t) throw erroHttp(400, "Escreva a anotação.");
  const [[p]] = await pool.query(`SELECT id FROM rh_planos WHERE empresa_id = ? AND id = ?`, [empresaId, id]);
  if (!p) throw erroHttp(404, "Plano não encontrado.");
  await comTransacao(async (conn) => { await hist(conn, empresaId, id, usuario, "nota", null, null, t); });
  return obter(empresaId, id);
}

/** Sugestões feitas a partir do que já foi importado: temas em vermelho/amarelo do clima e sites/serviços em risco alto no Canguru. Só agregado. */
async function sugestoes(empresaId) {
  const out = { clima: [], canguru: [] };
  const [abertos] = await pool.query(`SELECT origem, ciclo_id, tema FROM rh_planos WHERE empresa_id = ? AND status IN ('aberto','andamento','concluido')`, [empresaId]);
  const temPlano = (origem, cicloId, tema) => abertos.some((p) => p.origem === origem && (origem === "clima" ? Number(p.ciclo_id) === Number(cicloId) : true) && String(p.tema || "").toLowerCase() === String(tema).toLowerCase());
  const ciclos = await Clima.listarCiclos(empresaId);
  if (ciclos.length) {
    const r = await Clima.resultadoGeral(empresaId, ciclos[0]);
    if (r) {
      const temas = r.temas.filter((t) => t.pos_pct !== null && (t.farol === "vermelho" || t.farol === "amarelo")).sort((a, b) => a.pos_pct - b.pos_pct);
      for (const t of temas) {
        if (temPlano("clima", ciclos[0].id, t.nome)) continue;
        out.clima.push({ ciclo_id: ciclos[0].id, ciclo_nome: ciclos[0].nome, cliente: ciclos[0].cliente || null, tema: t.nome, farol: t.farol, pos_pct: Math.round(t.pos_pct * 10) / 10, neg_pct: t.neg_pct === null ? null : Math.round(t.neg_pct * 10) / 10,
          titulo: `Melhorar: ${t.nome}`, motivo: `${t.nome} teve ${um(t.pos_pct)}% de respostas positivas na pesquisa “${ciclos[0].nome}”.`, prioridade: t.farol === "vermelho" ? "alta" : "media" });
      }
    }
  }
  try {
    const r = await Canguru.resultado(empresaId, {}, false);
    for (const [rotuloGrupo, grupo] of [["site", r.por_site], ["serviço", r.por_servico]]) {
      for (const g of grupo.linhas) {
        if (g.risco !== "alto" || g.poucos) continue;
        const tema = `Canguru · ${rotuloGrupo === "site" ? "site" : "serviço"} ${g.rotulo}`;
        if (temPlano("canguru", null, tema)) continue;
        out.canguru.push({ tema, cliente: null, grupo: rotuloGrupo, rotulo: g.rotulo, novatos: g.novatos, com_sinal_pct: g.com_sinal_pct, titulo: `Cuidar dos novatos: ${g.rotulo}`,
          motivo: `${um(g.com_sinal_pct)}% das avaliações dos novatos de ${g.rotulo} têm sinal de atenção (risco alto, ${g.novatos} novatos).`, prioridade: "alta" });
      }
    }
  } catch (e) { console.error("[rh.planos.sugestoes.canguru]", e.message); }
  return out;
}

/** Números para o painel do RH. */
async function resumoPainel(empresaId) {
  const hoje = R.hojeISO();
  const [rows] = await pool.query(`SELECT status, prazo FROM rh_planos WHERE empresa_id = ?`, [empresaId]);
  const abertos = rows.filter((p) => ABERTOS.includes(p.status));
  return { total: rows.length, abertos: abertos.length, atrasados: abertos.filter((p) => iso(p.prazo) < hoje).length, vencendo: abertos.filter((p) => iso(p.prazo) >= hoje && iso(p.prazo) <= somaDias(hoje, 7)).length, concluidos: rows.filter((p) => p.status === "concluido").length };
}

module.exports = { ORIGENS, STATUS, PRIORIDADES, ROTULO_STATUS, listar, obter, criar, atualizar, anotar, sugestoes, resumoPainel, situacao };
