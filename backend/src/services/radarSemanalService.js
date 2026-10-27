/**
 * radarSemanalService.js — Radar semanal (Pacote 3, 26/10/2026)
 *
 * Reúne as quatro leituras preventivas (prontidão, risco de certificação, carga futura e
 * demanda do R&S) em ITENS de risco guardados em `radar_itens`. Cada item é uma unidade de
 * ação: tem dono sugerido, ação, decisão sugerida e prazo. Guardar os itens permite:
 *   - comparar com a semana anterior (novos, resolvidos, persistentes, tendência dos faróis);
 *   - "resolvido" e "ignorar com motivo" (calibra o que serve e o que é ruído);
 *   - medir a prevenção do próprio portal: alertas tratados antes do prazo ÷ total.
 *
 * Escopo (`empresa_id`): itens de turma/RP/instrutor pertencem à empresa de origem; as salas são
 * compartilhadas entre ambientes e ficam em empresa_id = 0 (visíveis a todos).
 *
 * Regras de estado:
 *   aberto    → continua aberto enquanto o problema for detectado.
 *   resolvido → sumiu da detecção (por_sistema; a_tempo = sumiu até 1 dia depois do prazo) ou foi
 *               marcado à mão (por_usuario). Resolvido à mão reabre se ainda for detectado 2+ dias depois.
 *   ignorado  → motivo obrigatório + "até" (7, 14 ou 30 dias). Volta sozinho quando vence ou se a gravidade piora.
 */
const pool = require("../lib/db");
const P = require("./preventivoService");
const C = require("./preventivoCargaService");
const Q = require("./preventivoQualidadeService");
const { registrarAuditoria } = require("./auditoria");

const { hojeBahia, somarDias, diasEntre } = P;
const GRAV_PESO = { critica: 100, alta: 60, media: 30 };
const GRAV_ORDEM = { media: 1, alta: 2, critica: 3 };
const JANELA_PRONTIDAO = 14;
const MAX_TOP = 5;
const MAX_POR_ORIGEM = 3;
const SYNC_MIN_MS = 3 * 60 * 1000;
const syncRecente = new Map();

const ORIGENS = {
  prontidao: { nome: "Prontidão de turma", farol: "Turmas começando com pendência" },
  certificacao: { nome: "Risco de certificação", farol: "Turmas com gente em risco de não certificar" },
  carga: { nome: "Carga de instrutores", farol: "Instrutores fora da faixa saudável" },
  sala: { nome: "Salas", farol: "Salas saturadas" },
  "rs-av": { nome: "R&S → T&D (avaliação)", farol: "Avaliações Técnicas sem turma" },
  "rs-berco": { nome: "R&S → T&D (berço)", farol: "RPs com berço parado" },
  qualidade: { nome: "Qualidade em queda", farol: "Qualidade em queda (NPS e presença)" },
  necessidade: { nome: "Necessidade vencendo", farol: "Necessidades vencendo sem turma" },
  reciclagem: { nome: "Reciclagem de jornada", farol: "Reciclagens vencidas ou a vencer" },
};

const fmt = (d) => { if (!d) return ""; const [a, m, dia] = String(d).slice(0, 10).split("-"); return `${dia}/${m}/${a.slice(2)}`; };
const quando = (n) => (n === 0 ? "hoje" : n === 1 ? "amanhã" : n < 0 ? `há ${-n} dia(s)` : `em ${n} dias`);
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const corta = (s, n) => (String(s || "").length > n ? String(s).slice(0, n - 1) + "…" : String(s || ""));

function segundaDe(dataStr) {
  const dow = new Date(`${dataStr}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return somarDias(dataStr, -((dow + 6) % 7));
}

/* ───────────────────────── Coleta: calculadores → itens ───────────────────────── */

function itensProntidao(r) {
  return (r.turmas || []).map((t) => {
    const pend = t.itens.map((i) => i.titulo.toLowerCase());
    return {
      empresa_id: t.empresa_id, chave: `prontidao:${t.id}`, origem: "prontidao", gravidade: t.gravidade,
      titulo: `${corta(t.tema, 70)}${t.cliente ? ` (${t.cliente})` : ""} começa ${quando(t.dias_para_inicio)} com ${plural(t.itens.length, "pendência", "pendências")}`,
      detalhe: t.itens.map((i) => `${i.titulo}: ${i.detalhe}`).join(" · "),
      acao: t.itens[0].acao,
      decisao: `Resolver até ${fmt(t.data_inicio)}: ${pend.join(", ")}.`,
      dono: t.supervisor || t.instrutor || "Coordenação", cliente: t.cliente || null,
      link: `/turma/${t.id}`, prazo: t.data_inicio,
    };
  });
}

function itensCertificacao(r) {
  const out = [];
  for (const t of r.turmas || []) {
    if (t.gravidade === "media") continue; // só quem já perdeu ou está no limite entra no Radar semanal
    const partes = [];
    if (t.perderam) partes.push(`${t.perderam} já não alcança(m) o mínimo`);
    if (t.no_limite) partes.push(`${t.no_limite} no limite de faltas`);
    const nomes = t.participantes_em_risco.filter((p) => p.gravidade !== "media").slice(0, 4).map((p) => p.nome);
    out.push({
      empresa_id: t.empresa_id, chave: `certificacao:${t.id}`, origem: "certificacao", gravidade: t.gravidade,
      titulo: `${corta(t.tema, 70)}${t.cliente ? ` (${t.cliente})` : ""}: ${partes.join(" e ")}`,
      detalhe: `${nomes.join(", ")}${t.perderam + t.no_limite > nomes.length ? " e outros" : ""}. Presença média ${t.pct_medio ?? "—"}%, mínimo ${t.presenca_minima_pct}%, ${t.aulas_restantes} aula(s) a realizar.`,
      acao: "Contato e reposição",
      decisao: `Falar com ${nomes.slice(0, 3).join(", ")} e combinar reposição enquanto restam ${t.aulas_restantes} aula(s)${t.instrutor ? ` (instrutor: ${t.instrutor})` : ""}.`,
      dono: t.instrutor || t.supervisor || "Coordenação", cliente: t.cliente || null,
      link: `/presenca-turma?turma=${t.id}`, prazo: t.data_fim || null,
    });
  }
  return out;
}

function proximoPrazoCarga(i, hoje) {
  const datas = [];
  for (const s of i.semanas_pico || []) datas.push(s.inicio);
  for (const m of i.meses || []) {
    if (["sobrecarga", "atencao"].includes(m.status)) datas.push(`${m.ano}-${String(m.mes).padStart(2, "0")}-01`);
  }
  const futuras = datas.filter(Boolean).sort();
  const d = futuras.find((x) => x >= hoje) || futuras[futuras.length - 1] || null;
  return d && d < hoje ? hoje : d;
}

function itensCarga(r, empresaId) {
  const hoje = r.hoje;
  const out = [];
  for (const i of r.instrutores || []) {
    if (!i.gravidade) continue;
    const prazo = proximoPrazoCarga(i, hoje);
    let decisao;
    if (i.fora_do_time) decisao = `Trocar o instrutor das aulas marcadas de ${i.instrutor}, que não está mais na lista de ativos.`;
    else if (i.meses.some((m) => m.status === "sobrecarga" || m.status === "atencao") || (i.semanas_pico || []).length) {
      decisao = `Redistribuir parte da carga de ${i.instrutor} (${i.motivos[0]}) ou pedir apoio de outro instrutor${prazo ? ` antes de ${fmt(prazo)}` : ""}.`;
    } else decisao = `Avaliar alocar mais turmas para ${i.instrutor} (${i.motivos[0]}).`;
    out.push({
      empresa_id: empresaId, chave: `carga:${i.instrutor}`, origem: "carga", gravidade: i.gravidade,
      titulo: `${i.instrutor}: ${i.motivos[0]}`, detalhe: i.motivos.join(" · "),
      acao: i.fora_do_time ? "Trocar instrutor" : "Redistribuir carga", decisao,
      dono: "Coordenação", cliente: null, link: "/radar?aba=carga", prazo,
    });
  }
  const h = r.resumo?.horas_sem_instrutor || 0;
  if (h > 0) {
    out.push({
      empresa_id: empresaId, chave: "carga:sem-instrutor", origem: "carga", gravidade: "alta",
      titulo: `${h}h de aula sem instrutor em ${plural(r.resumo.turmas_sem_instrutor, "turma", "turmas")}`,
      detalhe: "Aulas no cronograma de turmas sem instrutor definido.",
      acao: "Definir instrutor", decisao: "Definir o instrutor das turmas sem responsável e conferir a carga dele antes de confirmar.",
      dono: "Coordenação", cliente: null, link: "/gestao-turmas", prazo: null,
    });
  }
  return out;
}

function itensSalas(salas) {
  const out = [];
  for (const s of salas || []) {
    const j = (s.janelas || []).find((x) => x.dias === 30);
    if (!j || j.status !== "saturada") continue;
    out.push({
      empresa_id: 0, chave: `sala:${s.id}`, origem: "sala", gravidade: j.ocupacao_pct >= 100 ? "alta" : "media",
      titulo: `${s.nome} saturada nos próximos 30 dias (${Math.round(j.ocupacao_pct)}%)`,
      detalhe: `${j.dias_com_uso} de ${j.dias_uteis} dias úteis com aula, ${j.turmas} turma(s).`,
      acao: "Realocar turmas", decisao: `Mover turmas de ${s.nome} para outra sala livre ou mudar a modalidade para online.`,
      dono: "Coordenação", cliente: null, link: "/radar?aba=carga", prazo: null,
    });
  }
  return out;
}

function itensRS(r) {
  const out = [];
  for (const a of r.avaliacoes || []) {
    if (a.situacao !== "sem_turma") continue;
    out.push({
      empresa_id: a.empresa_id, chave: `rs-av:${a.rp_id}`, origem: "rs-av", gravidade: a.gravidade || "media",
      titulo: `Avaliação Técnica de ${a.produto} (${a.site}) sem turma, ${a.em_curso ? "já em curso" : `começa ${quando(a.dias_para_inicio)}`}`,
      detalhe: `${a.candidatos_esperados} candidato(s) esperado(s)${a.chamado ? ` · chamado ${a.chamado}` : ""}.`,
      acao: "Criar a turma de Avaliação Técnica",
      decisao: `Criar a turma de Avaliação Técnica de ${a.produto} (${a.site}) para ${fmt(a.inicio)} e avisar o instrutor (${a.candidatos_esperados} candidatos).`,
      dono: "Coordenação", cliente: null, link: "/radar?aba=rs", prazo: a.inicio,
    });
  }
  for (const b of r.berco || []) {
    if (!b.gravidade) continue;
    const op = b.oportunidades?.[0];
    out.push({
      empresa_id: b.empresa_id, chave: `rs-berco:${b.rp_id}`, origem: "rs-berco", gravidade: b.gravidade === "alta" ? "alta" : "media",
      titulo: `Berço de ${b.produto} (${b.site}) parado há ${b.dias_parado} dias, ${plural(b.saldo_berco, "pessoa", "pessoas")}`,
      detalhe: op ? `Vaga aberta do mesmo cargo: ${op.produto} (${op.site}), ${op.vagas_abertas} vaga(s).` : "Sem vaga aberta do mesmo cargo.",
      acao: "Reaproveitar o berço",
      decisao: op
        ? `Combinar com o R&S o reaproveitamento de ${b.saldo_berco} pessoa(s) do berço de ${b.produto} na vaga de ${op.produto}${op.chamado ? ` (chamado ${op.chamado})` : ""}.`
        : `Combinar com o R&S o destino de ${b.saldo_berco} pessoa(s) no berço de ${b.produto}, parado há ${b.dias_parado} dias.`,
      dono: "Coordenação", cliente: null, link: "/radar?aba=rs", prazo: null,
    });
  }
  return out;
}

const slug = (s, n = 40) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, n);

function itensQualidade(r, empresaId) {
  const acaoPorDim = { instrutor: "Conversar com o instrutor", tema: "Revisar o conteúdo", cliente: "Revisar a operação com o cliente" };
  return (r.itens || []).map((it) => {
    const partes = it.metricas.map((m) => {
      const v = m.serie.slice(-3).map((x) => (m.metrica === "presenca" ? `${x.valor}%` : x.valor));
      return `${m.metrica_rotulo} ${v.join(" → ")}`;
    });
    const turmas = (it.metricas[0]?.serie || []).slice(-3).map((x) => `${corta(x.tema, 40)} (${fmt(x.fim)})`);
    const coment = it.metricas.flatMap((m) => m.comentarios || []).slice(0, 3).map((c) => `“${c.texto}”`);
    const prox = it.proxima_turma;
    const decisao = it.dimensao === "instrutor"
      ? `Conversar com ${it.nome} sobre as 3 últimas turmas e combinar um ajuste${prox ? ` antes da próxima turma (${fmt(prox)})` : ""}.`
      : it.dimensao === "tema"
        ? `Rever conteúdo, material e instrutor do tema ${corta(it.nome, 60)}${prox ? ` antes da próxima turma (${fmt(prox)})` : ""}.`
        : `Alinhar com o cliente ${it.nome} o que mudou nas últimas turmas${prox ? ` antes da próxima (${fmt(prox)})` : ""}.`;
    return {
      empresa_id: it.empresa_id ?? empresaId, chave: `qualidade:${it.dimensao}:${slug(it.cliente, 30)}:${slug(it.nome, 40)}`, origem: "qualidade", gravidade: it.gravidade,
      titulo: `${it.dimensao === "instrutor" ? "Instrutor " : it.dimensao === "tema" ? "Tema " : "Cliente "}${corta(it.nome, 60)}${it.dimensao !== "cliente" && it.cliente ? ` (${it.cliente})` : ""}: ${partes.join(" · ")} nas 3 últimas turmas`,
      detalhe: `Turmas: ${turmas.join(", ")}.${coment.length ? ` Detratores disseram: ${coment.join(" ")}` : ""}`,
      acao: acaoPorDim[it.dimensao], decisao,
      dono: it.supervisor || "Coordenação", cliente: it.cliente || null, link: "/radar?aba=qualidade", prazo: prox || null,
    };
  });
}

function itensNecessidades(lista, empresaId) {
  return (lista || []).map((n) => ({
    empresa_id: n.empresa_id ?? empresaId, chave: `necessidade:${n.id}`, origem: "necessidade", gravidade: n.gravidade,
    titulo: `Necessidade de ${corta(n.tema, 70)} (${n.cliente}) ${n.dias_para_prazo < 0 ? `venceu há ${-n.dias_para_prazo} dia(s)` : `vence ${quando(n.dias_para_prazo)}`}, ${n.sem_turma ? "sem turma" : `faltam ${n.horas_faltantes}h`}`,
    detalhe: `${n.horas_necessarias}h necessárias, ${n.horas_atendidas}h atendidas, ${plural(n.turmas_vinculadas, "turma vinculada", "turmas vinculadas")}${n.solicitante ? ` · solicitante ${n.solicitante}` : ""}.`,
    acao: "Criar a turma", decisao: `Criar ${n.sem_turma ? "a turma" : "as turmas que faltam"} de ${corta(n.tema, 60)} para ${n.cliente} (${n.horas_faltantes || n.horas_necessarias}h) antes de ${fmt(n.prazo)}.`,
    dono: n.solicitante || "Coordenação", cliente: n.cliente || null, link: "/necessidades", prazo: n.prazo,
  }));
}

function itensReciclagem(lista, empresaId) {
  return (lista || []).map((j) => {
    const partes = [];
    if (j.vencidas) partes.push(plural(j.vencidas, "reciclagem vencida", "reciclagens vencidas"));
    if (j.vencem_em_breve) partes.push(`${plural(j.vencem_em_breve, "vence", "vencem")} em até 30 dias`);
    return {
      empresa_id: j.empresa_id ?? empresaId, chave: `reciclagem:${j.jornada_id}`, origem: "reciclagem", gravidade: j.gravidade,
      titulo: `${corta(j.nome, 70)}${j.cliente ? ` (${j.cliente})` : ""}: ${partes.join(" e ")}`,
      detalhe: `Reciclagem a cada ${j.periodicidade_meses} meses · ${j.participantes} participante(s) na jornada.`,
      acao: "Agendar a reciclagem", decisao: `Agendar a reciclagem de ${corta(j.nome, 60)} para quem está vencido ou vence em até 30 dias${j.vencem_em_breve ? ` (próximo vencimento ${fmt(j.prazo)})` : ""}.`,
      dono: "Metodologia", cliente: j.cliente || null, link: `/mapa-desenvolvimento/presenca?jornada=${j.jornada_id}`, prazo: j.prazo,
    };
  });
}

/** Roda os calculadores e devolve { itens, origensOk }. Calculador que falha não derruba os demais. */
async function coletar(empresaIds, { comSalas }) {
  const itens = [];
  const origensOk = new Set();
  const falhou = [];
  const tenta = async (nome, origens, fn) => {
    try { itens.push(...(await fn())); origens.forEach((o) => origensOk.add(o)); }
    catch (e) { falhou.push(nome); console.error(`[radar-semanal] ${nome}:`, e.message || e); }
  };
  for (const E of empresaIds) {
    const ok = new Set();
    await tenta(`prontidão ${E}`, [], async () => { const r = await P.calcularProntidao({ empresaId: E, dias: JANELA_PRONTIDAO }); ok.add("prontidao"); return itensProntidao(r); });
    await tenta(`certificação ${E}`, [], async () => { const r = await P.calcularRiscoCertificacao({ empresaId: E }); ok.add("certificacao"); return itensCertificacao(r); });
    await tenta(`carga ${E}`, [], async () => { const r = await C.calcularCargaFutura({ empresaId: E }); ok.add("carga"); return itensCarga(r, E); });
    await tenta(`R&S ${E}`, [], async () => { const r = await C.calcularDemandaRS({ empresaId: E }); ok.add("rs-av"); ok.add("rs-berco"); return itensRS(r); });
    await tenta(`qualidade ${E}`, [], async () => { const r = await Q.calcularTendencias({ empresaId: E }); ok.add("qualidade"); return itensQualidade(r, E); });
    await tenta(`necessidades ${E}`, [], async () => { const r = await Q.calcularNecessidadesVencendo({ empresaId: E }); ok.add("necessidade"); return itensNecessidades(r, E); });
    await tenta(`reciclagem ${E}`, [], async () => { const r = await Q.calcularReciclagens({ empresaId: E }); ok.add("reciclagem"); return itensReciclagem(r, E); });
    for (const o of ok) origensOk.add(`${E}|${o}`);
  }
  if (comSalas) {
    await tenta("salas", [], async () => { const s = await C.calcularSalas({ hoje: hojeBahia() }); origensOk.add("0|sala"); return itensSalas(s); });
  }
  return { itens, origensOk, falhou };
}

/* ───────────────────────── Sincronização com o banco ───────────────────────── */

async function empresasAtivas() {
  const [rows] = await pool.query("SELECT id FROM empresas WHERE ativo = 1 ORDER BY id").catch(() => [[]]);
  return rows.map((r) => Number(r.id));
}

const dataStr = (v) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);

/**
 * Atualiza radar_itens para as empresas pedidas (null = todas). Com throttle de 3 min por escopo,
 * salvo `forcar`. Devolve { sincronizado, novos, resolvidos, reabertos }.
 */
async function sincronizar({ empresaId = null, forcar = false } = {}) {
  const escopo = empresaId ? String(empresaId) : "todas";
  const ult = syncRecente.get(escopo);
  if (!forcar && ult && Date.now() - ult < SYNC_MIN_MS) return { sincronizado: false };
  syncRecente.set(escopo, Date.now());

  const hoje = hojeBahia();
  const ids = empresaId ? [Number(empresaId)] : await empresasAtivas();
  const { itens, origensOk, falhou } = await coletar(ids, { comSalas: true });
  let novos = 0, resolvidos = 0, reabertos = 0;

  const donos = new Set([...ids, 0]);
  const [existentes] = await pool.query(
    `SELECT * FROM radar_itens WHERE empresa_id IN (${[...donos].map(() => "?").join(",")}) AND (estado <> 'resolvido' OR resolvido_em >= ?)`,
    [...donos, somarDias(hoje, -45)]
  );
  const porChave = new Map(existentes.map((x) => [`${x.empresa_id}|${x.chave}`, x]));
  const vistas = new Set();

  for (const it of itens) {
    const k = `${it.empresa_id}|${it.chave}`;
    vistas.add(k);
    const ex = porChave.get(k);
    const campos = [it.origem, it.gravidade, it.titulo, it.detalhe, it.acao, it.decisao, it.dono, it.cliente, it.link, it.prazo || null];
    if (!ex) {
      await pool.query(
        `INSERT INTO radar_itens (empresa_id, chave, origem, gravidade, titulo, detalhe, acao, decisao, dono, cliente, link, prazo, estado, primeira_vez, ultima_vez)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberto', ?, ?)`,
        [it.empresa_id, it.chave, ...campos, hoje, hoje]
      );
      novos += 1;
      continue;
    }
    let estado = ex.estado;
    let reabre = false;
    if (ex.estado === "resolvido") {
      const recente = ex.resolvido_por === "usuario" && dataStr(ex.resolvido_em) > somarDias(hoje, -2);
      if (!recente) reabre = true;
    } else if (ex.estado === "ignorado") {
      const venceu = dataStr(ex.ignorado_ate) < hoje;
      const piorou = (GRAV_ORDEM[it.gravidade] || 0) > (GRAV_ORDEM[ex.gravidade_ignorada] || 0);
      if (venceu || piorou) reabre = true;
    }
    if (reabre) { estado = "aberto"; reabertos += 1; }
    await pool.query(
      `UPDATE radar_itens SET origem=?, gravidade=?, titulo=?, detalhe=?, acao=?, decisao=?, dono=?, cliente=?, link=?, prazo=?, ultima_vez=?, estado=?
         ${reabre ? ", resolvido_em=NULL, resolvido_por=NULL, a_tempo=NULL, reabertos=reabertos+1" : ""} WHERE id=?`,
      [...campos, hoje, estado, ex.id]
    );
  }

  // O que sumiu da detecção (só nas origens que rodaram sem falha).
  for (const ex of existentes) {
    const k = `${ex.empresa_id}|${ex.chave}`;
    if (vistas.has(k) || ex.estado === "resolvido") continue;
    if (!origensOk.has(`${ex.empresa_id}|${ex.origem}`)) continue;
    const prazo = dataStr(ex.prazo);
    const aTempo = ex.estado === "ignorado" || !prazo ? null : hoje <= somarDias(prazo, 1) ? 1 : 0;
    await pool.query(
      "UPDATE radar_itens SET estado='resolvido', resolvido_em=?, resolvido_por='sistema', a_tempo=? WHERE id=?",
      [hoje, aTempo, ex.id]
    );
    resolvidos += 1;
  }
  return { sincronizado: true, novos, resolvidos, reabertos, falhou };
}

/* ───────────────────────── Leitura e ranking ───────────────────────── */

function escopoIds(empresaId) {
  return empresaId ? [Number(empresaId), 0] : null; // null = todas
}

async function carregarItens({ empresaId, desde }) {
  const ids = escopoIds(empresaId);
  const where = [];
  const params = [];
  if (ids) { where.push(`empresa_id IN (${ids.map(() => "?").join(",")})`); params.push(...ids); }
  where.push("(estado <> 'resolvido' OR resolvido_em >= ?)");
  params.push(desde);
  const [rows] = await pool.query(`SELECT * FROM radar_itens WHERE ${where.join(" AND ")}`, params);
  return rows.map((r) => ({
    ...r,
    prazo: dataStr(r.prazo), primeira_vez: dataStr(r.primeira_vez), ultima_vez: dataStr(r.ultima_vez),
    resolvido_em: dataStr(r.resolvido_em), ignorado_ate: dataStr(r.ignorado_ate),
  }));
}

function pontuar(it, hoje, semanaIni) {
  let p = GRAV_PESO[it.gravidade] || 0;
  if (it.prazo) {
    const d = diasEntre(hoje, it.prazo);
    if (d <= 3) p += 30; else if (d <= 7) p += 20; else if (d <= 14) p += 10;
  }
  if (it.primeira_vez >= semanaIni) p += 5;
  if (it.reabertos > 0) p += 3;
  return p;
}

function visivel(it, podeVer) { return !podeVer || !it.cliente || podeVer(it.cliente); }

function aparar(it, hoje, semanaIni) {
  return {
    id: it.id, empresa_id: it.empresa_id, origem: it.origem, origem_nome: ORIGENS[it.origem]?.nome, gravidade: it.gravidade,
    titulo: it.titulo, detalhe: it.detalhe, acao: it.acao, decisao: it.decisao, dono: it.dono, cliente: it.cliente, link: it.link,
    prazo: it.prazo, dias_para_prazo: it.prazo ? diasEntre(hoje, it.prazo) : null,
    novo: it.primeira_vez >= semanaIni, dias_aberto: Math.max(0, diasEntre(it.primeira_vez, hoje)), reabertos: it.reabertos || 0,
  };
}

function abertoEm(it, t) {
  // Estava aberto em t: detectado desde antes de t e ainda não resolvido naquela data.
  if (it.primeira_vez > t) return false;
  return !(it.estado === "resolvido" && it.resolvido_em && it.resolvido_em <= t);
}

function farois(itens, hoje, antes) {
  const lista = [];
  for (const [origem, meta] of Object.entries(ORIGENS)) {
    const atuais = itens.filter((i) => i.origem === origem && i.estado === "aberto");
    const passados = itens.filter((i) => i.origem === origem && i.estado !== "ignorado" && abertoEm(i, antes));
    const valor = atuais.length;
    const ant = temHistorico(itens, antes) ? passados.length : null;
    const crit = atuais.some((i) => i.gravidade === "critica");
    const alta = atuais.some((i) => i.gravidade === "alta");
    const prazos = atuais.map((i) => (i.prazo ? diasEntre(hoje, i.prazo) : null)).filter((d) => d !== null && d >= 0);
    lista.push({
      id: origem, nome: meta.farol, valor, anterior: ant,
      tendencia: ant === null ? "novo" : valor < ant ? "melhorou" : valor > ant ? "piorou" : "igual",
      cor: !valor ? "verde" : crit ? "vermelho" : alta ? "laranja" : "amarelo",
      criticos: atuais.filter((i) => i.gravidade === "critica").length,
      proximo_prazo_dias: prazos.length ? Math.min(...prazos) : null,
    });
  }
  return lista;
}

/** Só há "antes" para comparar se o Radar já existia naquela data (algum item visto até lá). */
function temHistorico(itens, antes) { return itens.some((i) => i.primeira_vez <= antes); }

function prevencao(itens, hoje) {
  const ini = somarDias(hoje, -30);
  let aTempo = 0, perdidos = 0;
  for (const i of itens) {
    if (i.estado === "resolvido" && i.a_tempo !== null && i.resolvido_em >= ini) { if (i.a_tempo === 1) aTempo += 1; else perdidos += 1; }
    else if (i.estado === "aberto" && i.prazo && i.prazo < hoje && i.prazo >= ini) perdidos += 1;
  }
  const total = aTempo + perdidos;
  return { periodo_dias: 30, a_tempo: aTempo, perdidos, total, percentual: total ? Math.round((aTempo / total) * 100) : null };
}

/**
 * Monta o Radar da semana para o escopo/usuário. `podeVer(cliente)` filtra por cliente.
 * Sincroniza antes (com throttle) para refletir o que o portal sabe agora.
 */
async function radarDaSemana({ empresaId = null, podeVer, sincronizarAntes = true } = {}) {
  if (sincronizarAntes) {
    try { await sincronizar({ empresaId }); } catch (e) { console.error("[radar-semanal] sincronizar:", e.message || e); }
  }
  const hoje = hojeBahia();
  const semanaIni = segundaDe(hoje);
  const antes = somarDias(hoje, -7);
  const todos = (await carregarItens({ empresaId, desde: somarDias(hoje, -60) })).filter((i) => visivel(i, podeVer));
  const abertos = todos.filter((i) => i.estado === "aberto");
  const ignorados = todos.filter((i) => i.estado === "ignorado");

  // Top 5: maior pontuação, no máximo 3 por origem.
  const ordenados = [...abertos].sort((a, b) => pontuar(b, hoje, semanaIni) - pontuar(a, hoje, semanaIni) || (a.prazo || "9999").localeCompare(b.prazo || "9999") || a.id - b.id);
  const porOrigem = {};
  const top = [];
  for (const i of ordenados) {
    if ((porOrigem[i.origem] || 0) >= MAX_POR_ORIGEM) continue;
    porOrigem[i.origem] = (porOrigem[i.origem] || 0) + 1;
    top.push(i);
    if (top.length >= MAX_TOP) break;
  }

  const abertosAntes = todos.filter((i) => i.estado !== "ignorado" && abertoEm(i, antes));
  const historico = temHistorico(todos, antes);
  const resolvidosSemana = todos.filter((i) => i.estado === "resolvido" && i.resolvido_em && i.resolvido_em > antes);
  const novosSemana = abertos.filter((i) => i.primeira_vez > antes);
  const persistentes = abertos.filter((i) => i.primeira_vez <= antes);
  const mudancas = {
    tem_historico: historico,
    abertos_agora: abertos.length, abertos_antes: historico ? abertosAntes.length : null,
    criticos_agora: abertos.filter((i) => i.gravidade === "critica").length,
    criticos_antes: historico ? abertosAntes.filter((i) => i.gravidade === "critica").length : null,
    novos: novosSemana.length, novos_criticos: novosSemana.filter((i) => i.gravidade === "critica").length,
    resolvidos: resolvidosSemana.length, resolvidos_a_tempo: resolvidosSemana.filter((i) => i.a_tempo === 1).length,
    persistentes: persistentes.length,
    persistentes_criticos: persistentes.filter((i) => i.gravidade === "critica").length,
    lista_novos: novosSemana.sort((a, b) => (GRAV_ORDEM[b.gravidade] - GRAV_ORDEM[a.gravidade])).slice(0, 5).map((i) => ({ id: i.id, titulo: i.titulo, gravidade: i.gravidade })),
    lista_resolvidos: resolvidosSemana.slice(0, 5).map((i) => ({ id: i.id, titulo: i.titulo, a_tempo: i.a_tempo })),
  };

  // Calibragem: por que as pessoas ignoram (últimos 60 dias).
  const calib = {};
  for (const i of todos.filter((x) => x.ignorado_motivo)) {
    const k = `${i.origem}|${i.ignorado_motivo}`;
    calib[k] = (calib[k] || 0) + 1;
  }
  const calibragem = Object.entries(calib).map(([k, qtd]) => { const [origem, motivo] = k.split("|"); return { origem, origem_nome: ORIGENS[origem]?.nome, motivo, qtd }; })
    .sort((a, b) => b.qtd - a.qtd).slice(0, 8);

  const snap = await ultimoSnapshot(empresaId);
  return {
    hoje, semana_inicio: semanaIni, semana_anterior: antes,
    gerado_em: snap && snap.semana_inicio === semanaIni ? snap.gerado_em : null,
    top5: top.map((i) => aparar(i, hoje, semanaIni)),
    abertos: abertos.length,
    por_gravidade: { critica: abertos.filter((i) => i.gravidade === "critica").length, alta: abertos.filter((i) => i.gravidade === "alta").length, media: abertos.filter((i) => i.gravidade === "media").length },
    mudancas, farois: farois(todos, hoje, antes), prevencao: prevencao(todos, hoje),
    itens: ordenados.map((i) => aparar(i, hoje, semanaIni)),
    ignorados: ignorados.map((i) => ({ id: i.id, titulo: i.titulo, origem_nome: ORIGENS[i.origem]?.nome, motivo: i.ignorado_motivo, ate: i.ignorado_ate, por: i.usuario_nome })),
    calibragem,
  };
}

/* ───────────────────────── Ações do usuário ───────────────────────── */

const MOTIVOS_PADRAO = ["Já tratado fora do portal", "Não se aplica a esta turma", "Exceção combinada com o cliente", "Dado incorreto no portal", "Outro"];

async function buscarItem(id) {
  const [[it]] = await pool.query("SELECT * FROM radar_itens WHERE id = ?", [id]);
  return it || null;
}

function ctxAuditoria(req, it, acao, resumo) {
  return registrarAuditoria({
    usuario: req.user, acao, entidade: "radar_item", entidadeId: it.id,
    resumo: `${req.user?.nome || "Alguém"} ${resumo} no Radar: ${corta(it.titulo, 120)}`, ip: req.ip,
  });
}

async function resolverItem(req, id, observacao) {
  const it = await buscarItem(id);
  if (!it) return { erro: 404, msg: "Item do Radar não encontrado." };
  const hoje = hojeBahia();
  const prazo = dataStr(it.prazo);
  const aTempo = prazo ? (hoje <= somarDias(prazo, 1) ? 1 : 0) : null;
  await pool.query(
    "UPDATE radar_itens SET estado='resolvido', resolvido_em=?, resolvido_por='usuario', a_tempo=?, observacao=?, usuario_id=?, usuario_nome=? WHERE id=?",
    [hoje, aTempo, String(observacao || "").slice(0, 255) || null, req.user?.id || null, req.user?.nome || null, id]
  );
  await ctxAuditoria(req, it, "radar_resolver", "marcou como resolvido");
  return { ok: true, empresa_id: it.empresa_id };
}

async function ignorarItem(req, id, motivo, dias) {
  const m = String(motivo || "").trim();
  if (m.length < 3) return { erro: 400, msg: "Informe o motivo para ignorar." };
  const it = await buscarItem(id);
  if (!it) return { erro: 404, msg: "Item do Radar não encontrado." };
  const d = [7, 14, 30].includes(Number(dias)) ? Number(dias) : 14;
  await pool.query(
    "UPDATE radar_itens SET estado='ignorado', ignorado_motivo=?, ignorado_ate=?, gravidade_ignorada=?, usuario_id=?, usuario_nome=? WHERE id=?",
    [m.slice(0, 255), somarDias(hojeBahia(), d), it.gravidade, req.user?.id || null, req.user?.nome || null, id]
  );
  await ctxAuditoria(req, it, "radar_ignorar", `ignorou por ${d} dias (${corta(m, 60)})`);
  return { ok: true, empresa_id: it.empresa_id };
}

async function reabrirItem(req, id) {
  const it = await buscarItem(id);
  if (!it) return { erro: 404, msg: "Item do Radar não encontrado." };
  await pool.query(
    "UPDATE radar_itens SET estado='aberto', resolvido_em=NULL, resolvido_por=NULL, a_tempo=NULL, ignorado_ate=NULL, reabertos=reabertos+1 WHERE id=?", [id]
  );
  await ctxAuditoria(req, it, "radar_reabrir", "reabriu um item");
  return { ok: true, empresa_id: it.empresa_id };
}

/* ───────────────────────── Snapshot semanal e aviso ───────────────────────── */

async function ultimoSnapshot(empresaId) {
  try {
    const [[r]] = await pool.query("SELECT semana_inicio, gerado_em, dados FROM radar_semanal WHERE escopo = ? ORDER BY semana_inicio DESC LIMIT 1", [empresaId ? Number(empresaId) : 0]);
    if (!r) return null;
    return { semana_inicio: dataStr(r.semana_inicio), gerado_em: r.gerado_em, dados: r.dados ? JSON.parse(r.dados) : null };
  } catch (_) { return null; }
}

/** Job de segunda 07h: sincroniza tudo e guarda o retrato da semana (por empresa e geral). */
async function gerarSemana({ forcar = true } = {}) {
  const hoje = hojeBahia();
  const semana = segundaDe(hoje);
  const sync = await sincronizar({ forcar });
  const escopos = [null, ...(await empresasAtivas())];
  const resumo = [];
  for (const E of escopos) {
    const r = await radarDaSemana({ empresaId: E, sincronizarAntes: false });
    const dados = {
      abertos: r.abertos, por_gravidade: r.por_gravidade, mudancas: { ...r.mudancas, lista_novos: undefined, lista_resolvidos: undefined },
      top5: r.top5.map((i) => ({ id: i.id, titulo: i.titulo, gravidade: i.gravidade })),
      farois: r.farois.map((f) => ({ id: f.id, valor: f.valor })), prevencao: r.prevencao,
    };
    await pool.query(
      `INSERT INTO radar_semanal (escopo, semana_inicio, dados) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE dados = VALUES(dados), gerado_em = CURRENT_TIMESTAMP`,
      [E ? Number(E) : 0, semana, JSON.stringify(dados)]
    );
    resumo.push({ escopo: E || "todas", abertos: r.abertos, criticos: r.por_gravidade.critica });
  }
  return { semana, sync, resumo };
}

/** Aviso do sino: leve (só lê radar_itens, sem recalcular). */
async function avisoDoSino(user, empresaId) {
  const { usuarioTemAcessoAoCliente } = require("../lib/acessoCliente");
  try { await sincronizar({ empresaId }); } catch (_) { /* aviso segue com o que já existe */ }
  const hoje = hojeBahia();
  const semanaIni = segundaDe(hoje);
  const itens = (await carregarItens({ empresaId, desde: hoje })).filter((i) => i.estado === "aberto" && (!i.cliente || usuarioTemAcessoAoCliente({ user }, i.cliente)));
  if (!itens.length) return [];
  const crit = itens.filter((i) => i.gravidade === "critica").length;
  const novos = itens.filter((i) => i.primeira_vez >= semanaIni).length;
  const top = [...itens].sort((a, b) => pontuar(b, hoje, semanaIni) - pontuar(a, hoje, semanaIni)).slice(0, 2);
  return [{
    chave: "radar-semana", tipo: "radar", gravidade: crit ? "critico" : "atencao", valor: itens.length,
    titulo: `Radar da semana: ${plural(itens.length, "risco aberto", "riscos abertos")}${crit ? ` (${crit} crítico${crit > 1 ? "s" : ""})` : ""}`,
    mensagem: `${top.map((i) => corta(i.titulo, 80)).join(" · ")}${novos ? ` · ${novos} novo(s) desde segunda` : ""}`,
    link: "/radar",
  }];
}

module.exports = {
  sincronizar, radarDaSemana, resolverItem, ignorarItem, reabrirItem, gerarSemana, avisoDoSino,
  segundaDe, MOTIVOS_PADRAO, ORIGENS,
};
