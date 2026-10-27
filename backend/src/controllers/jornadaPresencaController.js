/**
 * jornadaPresencaController.js — Encontros e presença por pessoa nas Jornadas
 * de Desenvolvimento (Fase 1, 13/10/2026).
 *
 * Pedido do Ramon: "registrar as presenças e o desenvolvimento de cada pessoa
 * registrada nas jornadas e nas trilhas". Proposta e decisões A–E em
 * claude/proposta-presenca-desenvolvimento-jornadas-trilhas-2026-10-13.md.
 *
 * Regras aprovadas:
 *  - Presença é por ENCONTRO, com data. Situações: presente / justificado /
 *    ausente. Sem linha = ainda não lançado (nunca vira falta sozinho).
 *  - A (justificada): não soma horas e fica FORA do cálculo do %.
 *      % de presença = presentes ÷ (presentes + ausentes) dos encontros já lançados.
 *      Horas realizadas = soma da carga horária dos encontros em que esteve presente.
 *  - B: presença mínima configurável por jornada (padrão 75%) → farol.
 *  - D: só a Metodologia lança (rota montada com authorizeRoles("metodologia"),
 *      que deixa o super_admin passar — ver index.js).
 *  - E: meta de horas (ex.: NR-17 Anexo II) e periodicidade da reciclagem em
 *      meses são CONFIGURÁVEIS por jornada — o sistema não crava um número
 *      legal; quem define é a Metodologia conforme o TAC de cada cliente.
 *
 * Segurança: toda consulta passa pela jornada (empresa_id); registro de outro
 * ambiente responde 404 igual a inexistente. CPF nunca sai nas respostas desta
 * tela (só é aceito como chave na importação). Datas: DATE_FORMAT no SQL e
 * "hoje" no fuso de Salvador (o servidor roda em UTC).
 */
const XLSX = require("xlsx");
const db = require("../lib/db");
const { novoWorkbook, estilizarCabecalho, paraDate, FORMATO_DATA } = require("../lib/excelExport");

const SITUACOES = ["presente", "justificado", "ausente"];
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ITENS_PREVIA = 500;

// ───────────────────────── utilitários ─────────────────────────

function hojeBahia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
}

function dataValida(v) {
  if (!DATA_ISO.test(String(v || ""))) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function formatarDataBR(iso) {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function somarMeses(iso, meses) {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

function diasEntre(isoA, isoB) {
  return Math.round((new Date(`${isoB}T00:00:00Z`) - new Date(`${isoA}T00:00:00Z`)) / 86400000);
}

function normalizarTexto(v) {
  return String(v == null ? "" : v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function chaveCabecalho(v) {
  return normalizarTexto(v).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function soDigitos(v) {
  return String(v == null ? "" : v).replace(/\D/g, "");
}

function numero(v, padrao = null) {
  if (v === null || v === undefined || v === "") return padrao;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : padrao;
}

function arredondar(v, casas = 2) {
  if (v === null || v === undefined) return null;
  const f = 10 ** casas;
  return Math.round(Number(v) * f) / f;
}

function erro(res, status, message) {
  return res.status(status).json({ ok: false, message, error: message });
}

function falha(res, contexto, e) {
  console.error(`[jornadaPresenca] ${contexto}:`, e.message || e);
  return res.status(500).json({ ok: false, message: `Erro ao ${contexto}.`, error: `Erro ao ${contexto}.` });
}

// ───────────────────────── acesso a dados ─────────────────────────

async function buscarJornada(req, id) {
  const jornadaId = Number(id);
  if (!jornadaId) return null;
  const tenant = req.empresaId ? " AND empresa_id = ?" : "";
  const params = req.empresaId ? [jornadaId, req.empresaId] : [jornadaId];
  const [rows] = await db.query(
    `SELECT id, nome, cliente, empresa_id, presenca_minima_pct, meta_horas, periodicidade_meses
     FROM jornadas_desenvolvimento WHERE id = ?${tenant} LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function buscarEncontro(req, id) {
  const encontroId = Number(id);
  if (!encontroId) return null;
  const tenant = req.empresaId ? " AND e.empresa_id = ?" : "";
  const params = req.empresaId ? [encontroId, req.empresaId] : [encontroId];
  const [rows] = await db.query(
    `SELECT e.id, e.empresa_id, e.jornada_id, e.etapa_id, e.trilha_id, e.trilha_etapa_id, e.titulo, DATE_FORMAT(e.data, '%Y-%m-%d') AS data,
            e.hora_inicio, e.carga_horaria, e.responsavel, e.observacao
     FROM jornada_encontros e WHERE e.id = ?${tenant} LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function carregarEncontros(jornadaId) {
  const [rows] = await db.query(
    `SELECT e.id, e.jornada_id, e.etapa_id, e.trilha_id, e.trilha_etapa_id, e.titulo, DATE_FORMAT(e.data, '%Y-%m-%d') AS data,
            e.hora_inicio, e.carga_horaria, e.responsavel, e.observacao, je.nome AS etapa_nome, ta.titulo AS trilha_titulo,
            te.titulo AS trilha_etapa_titulo, te.ordem AS trilha_etapa_ordem
     FROM jornada_encontros e
     LEFT JOIN jornadas_etapas je ON je.id = e.etapa_id
     LEFT JOIN trilhas_aprendizagem ta ON ta.id = e.trilha_id
     LEFT JOIN trilha_etapas te ON te.id = e.trilha_etapa_id
     WHERE e.jornada_id = ?
     ORDER BY e.data ASC, e.hora_inicio ASC, e.id ASC`,
    [jornadaId]
  );
  return rows.map((e) => ({ ...e, carga_horaria: Number(e.carga_horaria) }));
}

// Trilhas vinculadas à jornada (tabela jornada_trilhas), com o título vindo do catálogo.
async function carregarTrilhasDaJornada(jornadaId) {
  const [rows] = await db.query(
    `SELECT t.id, t.titulo, t.cliente, t.status
     FROM jornada_trilhas jt
     JOIN trilhas_aprendizagem t ON t.id = jt.trilha_id
     WHERE jt.jornada_id = ?
     ORDER BY jt.ordem ASC, t.titulo ASC, t.id ASC`,
    [jornadaId]
  );
  if (!rows.length) return rows;
  // Etapas de cada trilha (as "etapas da trilha", onde a presença também é acompanhada).
  const [etapas] = await db.query(
    `SELECT id, trilha_id, titulo, ordem FROM trilha_etapas WHERE trilha_id IN (?) ORDER BY trilha_id ASC, ordem ASC, id ASC`,
    [rows.map((t) => t.id)]
  );
  return rows.map((t) => ({ ...t, etapas: etapas.filter((e) => e.trilha_id === t.id).map((e) => ({ id: e.id, titulo: e.titulo, ordem: Number(e.ordem) })) }));
}

// Encontro cuja trilha (ou etapa da trilha) já não vale para esta jornada volta a "sem trilha" / "sem etapa".
function normalizarTrilhas(encontros, trilhasVinculadas) {
  const porId = new Map(trilhasVinculadas.map((t) => [String(t.id), t]));
  return encontros.map((e) => {
    if (!e.trilha_id) return e.trilha_etapa_id ? { ...e, trilha_etapa_id: null, trilha_etapa_titulo: null, trilha_etapa_ordem: null } : e;
    const t = porId.get(String(e.trilha_id));
    if (!t) return { ...e, trilha_id: null, trilha_titulo: null, trilha_etapa_id: null, trilha_etapa_titulo: null, trilha_etapa_ordem: null };
    if (e.trilha_etapa_id && !(t.etapas || []).some((x) => x.id === e.trilha_etapa_id)) {
      return { ...e, trilha_etapa_id: null, trilha_etapa_titulo: null, trilha_etapa_ordem: null };
    }
    return e;
  });
}

async function carregarParticipantes(jornadaId) {
  const [rows] = await db.query(
    `SELECT id, nome, matricula, turma, cargo, supervisor, status_jornada, pessoa_id
     FROM jornada_participantes WHERE jornada_id = ? ORDER BY nome ASC, id ASC`,
    [jornadaId]
  );
  return rows;
}

async function carregarPresencas(jornadaId) {
  const [rows] = await db.query(
    `SELECT p.encontro_id, p.participante_id, p.situacao
     FROM jornada_presencas p
     JOIN jornada_encontros e ON e.id = p.encontro_id
     WHERE e.jornada_id = ?`,
    [jornadaId]
  );
  return rows;
}

// ───────────────────────── cálculo ─────────────────────────

function configDaJornada(j) {
  return {
    presenca_minima_pct: Number(j.presenca_minima_pct ?? 75),
    meta_horas: j.meta_horas === null || j.meta_horas === undefined ? null : Number(j.meta_horas),
    periodicidade_meses: j.periodicidade_meses === null || j.periodicidade_meses === undefined ? null : Number(j.periodicidade_meses),
  };
}

/**
 * Totais de UMA pessoa. `situacaoPorEncontro` = Map(encontro_id → situacao).
 * `encontros` deve vir ordenado por data (carregarEncontros já ordena).
 */
function totaisDaPessoa(encontros, situacaoPorEncontro, config, hoje) {
  let presentes = 0;
  let justificados = 0;
  let ausentes = 0;
  let pendentes = 0; // encontros já realizados (data <= hoje) ainda sem lançamento
  let horas = 0;
  let ultimaPresenca = null;
  let dataMeta = null;

  for (const e of encontros) {
    const sit = situacaoPorEncontro.get(e.id);
    if (sit === "presente") {
      presentes += 1;
      horas += e.carga_horaria;
      ultimaPresenca = e.data;
      if (config.meta_horas !== null && dataMeta === null && horas >= config.meta_horas) dataMeta = e.data;
    } else if (sit === "justificado") {
      justificados += 1;
    } else if (sit === "ausente") {
      ausentes += 1;
    } else if (e.data <= hoje) {
      pendentes += 1;
    }
  }

  const base = presentes + ausentes;
  const pct = base > 0 ? (presentes / base) * 100 : null;
  let farol = "cinza";
  if (pct !== null) farol = pct >= config.presenca_minima_pct ? "verde" : "vermelho";

  const metaPct = config.meta_horas ? (horas / config.meta_horas) * 100 : null;

  // Reciclagem: referência = data em que atingiu a meta de horas (se houver
  // meta) ou a última presença. Estimativa de apoio — a decisão é da Metodologia.
  let reciclagem = null;
  if (config.periodicidade_meses) {
    const referencia = config.meta_horas !== null ? dataMeta : ultimaPresenca;
    if (!referencia) {
      reciclagem = { status: config.meta_horas !== null && presentes > 0 ? "incompleto" : "sem_registro", ate: null, dias: null };
    } else {
      const ate = somarMeses(referencia, config.periodicidade_meses);
      const dias = diasEntre(hoje, ate);
      reciclagem = { status: dias < 0 ? "vencida" : dias <= 30 ? "vence_em_breve" : "em_dia", ate, dias };
    }
  }

  return {
    presentes,
    justificados,
    ausentes,
    pendentes,
    horas: arredondar(horas),
    pct_presenca: pct === null ? null : arredondar(pct, 1),
    farol,
    meta_pct: metaPct === null ? null : arredondar(metaPct, 1),
    atingiu_meta: config.meta_horas !== null ? horas >= config.meta_horas : null,
    ultima_presenca: ultimaPresenca,
    reciclagem,
  };
}

// Totais da pessoa por trilha e, dentro de cada trilha, por etapa da trilha
// (sem meta/reciclagem) — extrato, impressão e exportação. `nivel`: "trilha"
// (total da trilha) ou "etapa" (uma linha por etapa que tem encontro).
function totaisPorTrilha(encontros, trilhasVinculadas, situacaoPorEncontro, config, hoje) {
  const cfg = { ...config, meta_horas: null, periodicidade_meses: null };
  const linha = (nivel, trilha, etapa, lista) => {
    const t = totaisDaPessoa(lista, situacaoPorEncontro, cfg, hoje);
    return {
      nivel,
      trilha_id: trilha ? trilha.id : null,
      trilha_etapa_id: etapa ? etapa.id : null,
      titulo: etapa ? etapa.titulo : trilha ? trilha.titulo : "Sem trilha",
      trilha_titulo: trilha ? trilha.titulo : "Sem trilha",
      encontros: lista.length,
      horas: t.horas,
      presentes: t.presentes,
      justificados: t.justificados,
      ausentes: t.ausentes,
      pendentes: t.pendentes,
      pct_presenca: t.pct_presenca,
      farol: t.farol,
    };
  };
  const saida = [];
  for (const t of trilhasVinculadas) {
    const lista = encontros.filter((e) => e.trilha_id === t.id);
    if (!lista.length) continue;
    saida.push(linha("trilha", t, null, lista));
    for (const et of t.etapas || []) {
      const le = lista.filter((e) => e.trilha_etapa_id === et.id);
      if (le.length) saida.push(linha("etapa", t, et, le));
    }
    const sem = lista.filter((e) => !e.trilha_etapa_id);
    if (sem.length && sem.length !== lista.length) saida.push(linha("etapa", t, { id: 0, titulo: "Sem etapa definida" }, sem));
  }
  const semTrilha = encontros.filter((e) => !e.trilha_id);
  if (semTrilha.length) saida.push(linha("trilha", null, null, semTrilha));
  return saida;
}

async function montarGrade(jornada) {
  const hoje = hojeBahia();
  const config = configDaJornada(jornada);
  const [encontrosBrutos, participantes, presencas, [etapas], trilhasVinculadas] = await Promise.all([
    carregarEncontros(jornada.id),
    carregarParticipantes(jornada.id),
    carregarPresencas(jornada.id),
    db.query(
      `SELECT id, nome, ordem, trilha_id FROM jornadas_etapas WHERE jornada_id = ? ORDER BY ordem ASC, id ASC`,
      [jornada.id]
    ),
    carregarTrilhasDaJornada(jornada.id),
  ]);

  // Encontro cuja trilha já não pertence à jornada (ou saiu do catálogo) volta a "sem trilha".
  const encontros = normalizarTrilhas(encontrosBrutos, trilhasVinculadas);

  const porPessoa = new Map();
  const celulas = {};
  for (const p of presencas) {
    if (!porPessoa.has(p.participante_id)) porPessoa.set(p.participante_id, new Map());
    porPessoa.get(p.participante_id).set(p.encontro_id, p.situacao);
    celulas[`${p.encontro_id}:${p.participante_id}`] = p.situacao;
  }

  // Encontros agrupados por trilha ("0" = encontros sem trilha). Os totais por
  // trilha usam a mesma regra dos totais da jornada, sem meta nem reciclagem
  // (essas são da jornada inteira).
  const configTrilha = { ...config, meta_horas: null, periodicidade_meses: null };
  const grupos = new Map();
  // Por etapa da trilha: chave "trilhaId:etapaId" ("trilhaId:0" = encontros da trilha sem etapa escolhida).
  const gruposEtapa = new Map();
  for (const e of encontros) {
    const k = e.trilha_id ? String(e.trilha_id) : "0";
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(e);
    if (e.trilha_id) {
      const ke = `${e.trilha_id}:${e.trilha_etapa_id || 0}`;
      if (!gruposEtapa.has(ke)) gruposEtapa.set(ke, []);
      gruposEtapa.get(ke).push(e);
    }
  }
  const resumirTotais = (t) => ({ horas: t.horas, presentes: t.presentes, justificados: t.justificados, ausentes: t.ausentes, pendentes: t.pendentes, pct_presenca: t.pct_presenca, farol: t.farol });

  const linhas = participantes.map((p) => {
    const sits = porPessoa.get(p.id) || new Map();
    const totaisTrilha = {};
    for (const [k, lista] of grupos) totaisTrilha[k] = resumirTotais(totaisDaPessoa(lista, sits, configTrilha, hoje));
    const totaisEtapa = {};
    for (const [k, lista] of gruposEtapa) totaisEtapa[k] = resumirTotais(totaisDaPessoa(lista, sits, configTrilha, hoje));
    return {
      ...p,
      vinculado: Boolean(p.pessoa_id),
      totais: totaisDaPessoa(encontros, sits, config, hoje),
      totais_trilha: totaisTrilha,
      totais_etapa: totaisEtapa,
    };
  });

  // Resumo por trilha (cartões acima da grade). Inclui trilhas vinculadas sem
  // encontro e, se houver, o grupo "Sem trilha".
  const resumirGrupo = (lista, chaveTotais, mapaTotais) => {
    const pcts = linhas.map((l) => mapaTotais(l)[chaveTotais]?.pct_presenca).filter((v) => v !== null && v !== undefined);
    return {
      encontros: lista.length,
      encontros_realizados: lista.filter((e) => e.data <= hoje).length,
      horas_cadastradas: arredondar(lista.reduce((sm, e) => sm + e.carga_horaria, 0)),
      pct_medio: pcts.length ? arredondar(pcts.reduce((x, y) => x + y, 0) / pcts.length, 1) : null,
      abaixo_do_minimo: linhas.filter((l) => mapaTotais(l)[chaveTotais]?.farol === "vermelho").length,
    };
  };
  const resumoTrilhas = trilhasVinculadas.map((t) => {
    const etapasResumo = (t.etapas || []).map((et) => ({ ...et, ...resumirGrupo(gruposEtapa.get(`${t.id}:${et.id}`) || [], `${t.id}:${et.id}`, (l) => l.totais_etapa) }));
    const semEtapa = gruposEtapa.get(`${t.id}:0`) || [];
    return {
      id: t.id,
      titulo: t.titulo,
      cliente: t.cliente,
      status: t.status,
      ...resumirGrupo(grupos.get(String(t.id)) || [], String(t.id), (l) => l.totais_trilha),
      etapas: etapasResumo,
      sem_etapa: { encontros: semEtapa.length, horas_cadastradas: arredondar(semEtapa.reduce((sm, e) => sm + e.carga_horaria, 0)) },
    };
  });

  const porEncontro = encontros.map((e) => {
    let presentes = 0;
    let justificados = 0;
    let ausentes = 0;
    for (const p of participantes) {
      const sit = celulas[`${e.id}:${p.id}`];
      if (sit === "presente") presentes += 1;
      else if (sit === "justificado") justificados += 1;
      else if (sit === "ausente") ausentes += 1;
    }
    return {
      encontro_id: e.id,
      presentes,
      justificados,
      ausentes,
      nao_lancados: participantes.length - presentes - justificados - ausentes,
      realizado: e.data <= hoje,
    };
  });

  const comPct = linhas.filter((l) => l.totais.pct_presenca !== null);
  const resumo = {
    participantes: linhas.length,
    encontros: encontros.length,
    encontros_realizados: encontros.filter((e) => e.data <= hoje).length,
    horas_encontros: arredondar(encontros.reduce((s, e) => s + e.carga_horaria, 0)),
    abaixo_do_minimo: linhas.filter((l) => l.totais.farol === "vermelho").length,
    sem_lancamento: linhas.filter((l) => l.totais.pendentes > 0).length,
    atingiram_meta: config.meta_horas !== null ? linhas.filter((l) => l.totais.atingiu_meta).length : null,
    pct_medio: comPct.length ? arredondar(comPct.reduce((s, l) => s + l.totais.pct_presenca, 0) / comPct.length, 1) : null,
    reciclagem_vencida: config.periodicidade_meses ? linhas.filter((l) => l.totais.reciclagem?.status === "vencida").length : null,
  };

  return {
    jornada: { id: jornada.id, nome: jornada.nome, cliente: jornada.cliente, ...config },
    hoje,
    etapas,
    trilhas: resumoTrilhas,
    sem_trilha: {
      encontros: (grupos.get("0") || []).length,
      horas_cadastradas: arredondar((grupos.get("0") || []).reduce((sm, e) => sm + e.carga_horaria, 0)),
    },
    encontros,
    participantes: linhas,
    presencas: celulas,
    por_encontro: porEncontro,
    resumo,
  };
}

// ───────────────────────── endpoints: grade e configuração ─────────────────────────

// GET /jornadas/:jornadaId/grade
async function grade(req, res) {
  try {
    const jornada = await buscarJornada(req, req.params.jornadaId);
    if (!jornada) return erro(res, 404, "Jornada não encontrada.");
    return res.json({ ok: true, ...(await montarGrade(jornada)) });
  } catch (e) {
    return falha(res, "carregar a grade de presença", e);
  }
}

// PUT /jornadas/:jornadaId/config { presenca_minima_pct, meta_horas, periodicidade_meses }
async function salvarConfig(req, res) {
  try {
    const jornada = await buscarJornada(req, req.params.jornadaId);
    if (!jornada) return erro(res, 404, "Jornada não encontrada.");

    const minima = numero(req.body?.presenca_minima_pct, null);
    if (minima === null || minima < 0 || minima > 100) {
      return erro(res, 400, "Presença mínima deve estar entre 0 e 100%.");
    }
    const metaBruta = req.body?.meta_horas;
    const meta = metaBruta === "" || metaBruta === null || metaBruta === undefined ? null : numero(metaBruta, NaN);
    if (meta !== null && (!Number.isFinite(meta) || meta <= 0 || meta > 10000)) {
      return erro(res, 400, "Meta de horas inválida — informe um número maior que zero ou deixe em branco.");
    }
    const perBruta = req.body?.periodicidade_meses;
    const per = perBruta === "" || perBruta === null || perBruta === undefined ? null : numero(perBruta, NaN);
    if (per !== null && (!Number.isInteger(per) || per < 1 || per > 120)) {
      return erro(res, 400, "Periodicidade da reciclagem deve ser um número inteiro de meses (1 a 120) ou ficar em branco.");
    }

    await db.query(
      `UPDATE jornadas_desenvolvimento SET presenca_minima_pct = ?, meta_horas = ?, periodicidade_meses = ? WHERE id = ?`,
      [minima, meta, per, jornada.id]
    );
    return res.json({ ok: true, message: "Configuração de presença salva." });
  } catch (e) {
    return falha(res, "salvar a configuração", e);
  }
}

// ───────────────────────── endpoints: trilhas da jornada ─────────────────────────

// Catálogo de trilhas que podem ser vinculadas à jornada: todas as do mesmo
// ambiente (empresa). Não restringe por cliente de propósito — a mesma trilha
// pode servir a várias jornadas, inclusive de clientes diferentes.
async function catalogoParaJornada(req, jornada) {
  const where = [];
  const params = [];
  if (jornada.empresa_id !== null && jornada.empresa_id !== undefined) {
    where.push("t.empresa_id = ?");
    params.push(jornada.empresa_id);
  }
  const [rows] = await db.query(
    `SELECT t.id, t.titulo, t.cliente, t.status,
            (SELECT COUNT(*) FROM trilha_etapas te WHERE te.trilha_id = t.id) AS qtd_etapas
     FROM trilhas_aprendizagem t
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY t.titulo ASC, t.id ASC`,
    params
  );
  return rows.map((t) => ({ ...t, qtd_etapas: Number(t.qtd_etapas) }));
}

// GET /jornadas/:jornadaId/trilhas → { vinculadas, disponiveis }
async function listarTrilhas(req, res) {
  try {
    const jornada = await buscarJornada(req, req.params.jornadaId);
    if (!jornada) return erro(res, 404, "Jornada não encontrada.");
    const [vinculadas, catalogo] = await Promise.all([carregarTrilhasDaJornada(jornada.id), catalogoParaJornada(req, jornada)]);
    const [contagens] = await db.query(
      `SELECT trilha_id, COUNT(*) AS total FROM jornada_encontros WHERE jornada_id = ? AND trilha_id IS NOT NULL GROUP BY trilha_id`,
      [jornada.id]
    );
    const porTrilha = new Map(contagens.map((c) => [Number(c.trilha_id), Number(c.total)]));
    const ids = new Set(vinculadas.map((t) => t.id));
    return res.json({
      ok: true,
      vinculadas: vinculadas.map((t) => ({ ...t, encontros: porTrilha.get(t.id) || 0 })),
      disponiveis: catalogo.filter((t) => !ids.has(t.id)),
    });
  } catch (e) {
    return falha(res, "carregar as trilhas da jornada", e);
  }
}

// PUT /jornadas/:jornadaId/trilhas { trilha_ids: [..] } — define a lista completa.
// Trilha retirada: os encontros que apontavam para ela passam a "sem trilha"
// (a presença deles não é tocada).
async function salvarTrilhas(req, res) {
  try {
    const jornada = await buscarJornada(req, req.params.jornadaId);
    if (!jornada) return erro(res, 404, "Jornada não encontrada.");
    const bruto = req.body?.trilha_ids;
    if (!Array.isArray(bruto)) return erro(res, 400, "Informe a lista de trilhas (trilha_ids).");
    const ids = [...new Set(bruto.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))];

    const catalogo = await catalogoParaJornada(req, jornada);
    const validos = new Set(catalogo.map((t) => t.id));
    const invalida = ids.find((i) => !validos.has(i));
    if (invalida) return erro(res, 404, "Uma das trilhas escolhidas não foi encontrada.");

    const atuais = (await carregarTrilhasDaJornada(jornada.id)).map((t) => t.id);
    const remover = atuais.filter((i) => !ids.includes(i));
    const adicionar = ids.filter((i) => !atuais.includes(i));

    let desvinculados = 0;
    if (remover.length) {
      const [r] = await db.query(`UPDATE jornada_encontros SET trilha_id = NULL, trilha_etapa_id = NULL WHERE jornada_id = ? AND trilha_id IN (?)`, [jornada.id, remover]);
      desvinculados = r.affectedRows || 0;
      await db.query(`DELETE FROM jornada_trilhas WHERE jornada_id = ? AND trilha_id IN (?)`, [jornada.id, remover]);
    }
    for (const id of adicionar) {
      await db.query(`INSERT IGNORE INTO jornada_trilhas (empresa_id, jornada_id, trilha_id, ordem) VALUES (?, ?, ?, ?)`, [jornada.empresa_id ?? null, jornada.id, id, ids.indexOf(id)]);
    }
    // Ordem = ordem escolhida na lista.
    for (let i = 0; i < ids.length; i += 1) {
      await db.query(`UPDATE jornada_trilhas SET ordem = ? WHERE jornada_id = ? AND trilha_id = ?`, [i, jornada.id, ids[i]]);
    }

    return res.json({ ok: true, adicionadas: adicionar.length, removidas: remover.length, encontros_desvinculados: desvinculados, message: "Trilhas da jornada atualizadas." });
  } catch (e) {
    return falha(res, "salvar as trilhas da jornada", e);
  }
}

// ───────────────────────── endpoints: encontros ─────────────────────────

async function validarEncontro(body, jornada) {
  const titulo = String(body?.titulo || "").trim();
  const data = String(body?.data || "").slice(0, 10);
  const carga = numero(body?.carga_horaria, null);
  const hora = String(body?.hora_inicio || "").trim();
  const responsavel = String(body?.responsavel || "").trim() || null;
  const observacao = String(body?.observacao || "").trim() || null;
  const etapaId = body?.etapa_id ? Number(body.etapa_id) : null;
  const trilhaId = body?.trilha_id ? Number(body.trilha_id) : null;
  const trilhaEtapaId = body?.trilha_etapa_id ? Number(body.trilha_etapa_id) : null;

  if (!titulo) return { erro: "Informe o título do encontro." };
  if (titulo.length > 200) return { erro: "Título muito longo (máximo 200 caracteres)." };
  if (!dataValida(data)) return { erro: "Informe uma data válida para o encontro." };
  if (carga === null || carga <= 0 || carga > 24) return { erro: "Carga horária deve ser maior que 0 e no máximo 24 horas." };
  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return { erro: "Horário inválido — use HH:MM." };
  if (responsavel && responsavel.length > 150) return { erro: "Responsável muito longo (máximo 150 caracteres)." };
  if (observacao && observacao.length > 255) return { erro: "Observação muito longa (máximo 255 caracteres)." };

  if (etapaId) {
    const [rows] = await db.query(`SELECT id FROM jornadas_etapas WHERE id = ? AND jornada_id = ? LIMIT 1`, [etapaId, jornada.id]);
    if (!rows.length) return { erro: "A etapa escolhida não pertence a esta jornada." };
  }

  // A trilha do encontro precisa estar vinculada à jornada (vincule antes em "Trilhas da jornada").
  if (trilhaId) {
    const [rows] = await db.query(`SELECT id FROM jornada_trilhas WHERE jornada_id = ? AND trilha_id = ? LIMIT 1`, [jornada.id, trilhaId]);
    if (!rows.length) return { erro: "A trilha escolhida não está vinculada a esta jornada. Vincule-a primeiro em “Trilhas da jornada”." };
  }

  // A etapa da trilha precisa pertencer à trilha escolhida no encontro.
  if (trilhaEtapaId) {
    if (!trilhaId) return { erro: "Escolha a trilha do encontro antes de escolher a etapa da trilha." };
    const [rows] = await db.query(`SELECT id FROM trilha_etapas WHERE id = ? AND trilha_id = ? LIMIT 1`, [trilhaEtapaId, trilhaId]);
    if (!rows.length) return { erro: "A etapa escolhida não pertence à trilha do encontro." };
  }

  return { valores: { titulo, data, carga, hora: hora || null, responsavel, observacao, etapaId, trilhaId, trilhaEtapaId } };
}

// POST /jornadas/:jornadaId/encontros
async function criarEncontro(req, res) {
  try {
    const jornada = await buscarJornada(req, req.params.jornadaId);
    if (!jornada) return erro(res, 404, "Jornada não encontrada.");
    const v = await validarEncontro(req.body, jornada);
    if (v.erro) return erro(res, 400, v.erro);
    const x = v.valores;

    const [r] = await db.query(
      `INSERT INTO jornada_encontros (empresa_id, jornada_id, etapa_id, trilha_id, trilha_etapa_id, titulo, data, hora_inicio, carga_horaria, responsavel, observacao, criado_por_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [jornada.empresa_id ?? null, jornada.id, x.etapaId, x.trilhaId, x.trilhaEtapaId, x.titulo, x.data, x.hora, x.carga, x.responsavel, x.observacao, req.user?.id ?? null]
    );
    return res.status(201).json({ ok: true, id: r.insertId, message: "Encontro criado." });
  } catch (e) {
    return falha(res, "criar o encontro", e);
  }
}

// PUT /encontros/:id
async function atualizarEncontro(req, res) {
  try {
    const encontro = await buscarEncontro(req, req.params.id);
    if (!encontro) return erro(res, 404, "Encontro não encontrado.");
    const jornada = await buscarJornada(req, encontro.jornada_id);
    if (!jornada) return erro(res, 404, "Encontro não encontrado.");
    const v = await validarEncontro(req.body, jornada);
    if (v.erro) return erro(res, 400, v.erro);
    const x = v.valores;

    // Mudar a data para o futuro com presença já lançada deixaria o histórico
    // incoerente (presença em encontro que "ainda não aconteceu").
    if (x.data > hojeBahia()) {
      const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM jornada_presencas WHERE encontro_id = ?`, [encontro.id]);
      if (total > 0) {
        return erro(res, 400, `Este encontro já tem ${total} presença(s) lançada(s) e não pode ser movido para uma data futura.`);
      }
    }

    await db.query(
      `UPDATE jornada_encontros SET etapa_id = ?, trilha_id = ?, trilha_etapa_id = ?, titulo = ?, data = ?, hora_inicio = ?, carga_horaria = ?, responsavel = ?, observacao = ? WHERE id = ?`,
      [x.etapaId, x.trilhaId, x.trilhaEtapaId, x.titulo, x.data, x.hora, x.carga, x.responsavel, x.observacao, encontro.id]
    );
    return res.json({ ok: true, message: "Encontro atualizado." });
  } catch (e) {
    return falha(res, "atualizar o encontro", e);
  }
}

// DELETE /encontros/:id  (a presença cai junto por FK; a tela já confirmou a quantidade)
async function excluirEncontro(req, res) {
  try {
    const encontro = await buscarEncontro(req, req.params.id);
    if (!encontro) return erro(res, 404, "Encontro não encontrado.");
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM jornada_presencas WHERE encontro_id = ?`, [encontro.id]);
    await db.query(`DELETE FROM jornada_encontros WHERE id = ?`, [encontro.id]);
    return res.json({ ok: true, presencas_removidas: Number(total), message: "Encontro excluído." });
  } catch (e) {
    return falha(res, "excluir o encontro", e);
  }
}

// POST /encontros/:id/duplicar { data }
async function duplicarEncontro(req, res) {
  try {
    const encontro = await buscarEncontro(req, req.params.id);
    if (!encontro) return erro(res, 404, "Encontro não encontrado.");
    const data = String(req.body?.data || "").slice(0, 10);
    if (!dataValida(data)) return erro(res, 400, "Informe a data do novo encontro.");
    const [r] = await db.query(
      `INSERT INTO jornada_encontros (empresa_id, jornada_id, etapa_id, trilha_id, trilha_etapa_id, titulo, data, hora_inicio, carga_horaria, responsavel, observacao, criado_por_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [encontro.empresa_id, encontro.jornada_id, encontro.etapa_id, encontro.trilha_id, encontro.trilha_etapa_id, encontro.titulo, data, encontro.hora_inicio, encontro.carga_horaria, encontro.responsavel, encontro.observacao, req.user?.id ?? null]
    );
    return res.status(201).json({ ok: true, id: r.insertId, message: "Encontro duplicado (sem presenças)." });
  } catch (e) {
    return falha(res, "duplicar o encontro", e);
  }
}

// ───────────────────────── endpoints: presença ─────────────────────────

function bloqueioFuturo(encontro) {
  if (encontro.data > hojeBahia()) {
    return `O encontro "${encontro.titulo}" é em ${formatarDataBR(encontro.data)} e ainda não aconteceu — a presença só pode ser lançada a partir da data do encontro.`;
  }
  return null;
}

// PUT /encontros/:id/presenca { participante_id, situacao }  (situacao null = limpar)
async function registrarPresenca(req, res) {
  try {
    const encontro = await buscarEncontro(req, req.params.id);
    if (!encontro) return erro(res, 404, "Encontro não encontrado.");
    const participanteId = Number(req.body?.participante_id);
    const situacao = req.body?.situacao === null || req.body?.situacao === undefined || req.body?.situacao === "" ? null : String(req.body.situacao);
    if (!participanteId) return erro(res, 400, "Informe o participante.");
    if (situacao !== null && !SITUACOES.includes(situacao)) return erro(res, 400, "Situação inválida.");

    const [part] = await db.query(`SELECT id FROM jornada_participantes WHERE id = ? AND jornada_id = ? LIMIT 1`, [participanteId, encontro.jornada_id]);
    if (!part.length) return erro(res, 404, "Participante não encontrado nesta jornada.");

    if (situacao === null) {
      await db.query(`DELETE FROM jornada_presencas WHERE encontro_id = ? AND participante_id = ?`, [encontro.id, participanteId]);
      return res.json({ ok: true, situacao: null });
    }
    const futuro = bloqueioFuturo(encontro);
    if (futuro) return erro(res, 400, futuro);

    await db.query(
      `INSERT INTO jornada_presencas (encontro_id, participante_id, situacao, origem, registrado_por_id)
       VALUES (?, ?, ?, 'manual', ?)
       ON DUPLICATE KEY UPDATE situacao = VALUES(situacao), origem = 'manual', registrado_por_id = VALUES(registrado_por_id)`,
      [encontro.id, participanteId, situacao, req.user?.id ?? null]
    );
    return res.json({ ok: true, situacao });
  } catch (e) {
    return falha(res, "registrar a presença", e);
  }
}

// POST /encontros/:id/presenca-lote { situacao, participante_ids?, somente_nao_lancados? }
// situacao null = limpar as presenças dos participantes indicados (ids obrigatórios).
async function presencaEmLote(req, res) {
  try {
    const encontro = await buscarEncontro(req, req.params.id);
    if (!encontro) return erro(res, 404, "Encontro não encontrado.");
    const situacao = req.body?.situacao === null || req.body?.situacao === undefined || req.body?.situacao === "" ? null : String(req.body.situacao);
    if (situacao !== null && !SITUACOES.includes(situacao)) return erro(res, 400, "Situação inválida.");
    const ids = Array.isArray(req.body?.participante_ids) ? req.body.participante_ids.map(Number).filter(Boolean) : null;
    const somenteNaoLancados = req.body?.somente_nao_lancados !== false;

    let participantes = await carregarParticipantes(encontro.jornada_id);
    if (ids) {
      const permitidos = new Set(ids);
      participantes = participantes.filter((p) => permitidos.has(p.id));
    }

    if (situacao === null) {
      if (!ids || !participantes.length) return erro(res, 400, "Indique quais participantes devem ter a presença limpa.");
      await db.query(`DELETE FROM jornada_presencas WHERE encontro_id = ? AND participante_id IN (?)`, [encontro.id, participantes.map((p) => p.id)]);
      return res.json({ ok: true, alterados: participantes.length });
    }

    const futuro = bloqueioFuturo(encontro);
    if (futuro) return erro(res, 400, futuro);
    if (!participantes.length) return res.json({ ok: true, alterados: 0 });

    let alvo = participantes;
    if (somenteNaoLancados) {
      const [existentes] = await db.query(`SELECT participante_id FROM jornada_presencas WHERE encontro_id = ?`, [encontro.id]);
      const jaLancado = new Set(existentes.map((r) => r.participante_id));
      alvo = participantes.filter((p) => !jaLancado.has(p.id));
    }
    if (!alvo.length) return res.json({ ok: true, alterados: 0 });

    await db.query(
      `INSERT INTO jornada_presencas (encontro_id, participante_id, situacao, origem, registrado_por_id)
       VALUES ?
       ON DUPLICATE KEY UPDATE situacao = VALUES(situacao), origem = 'manual', registrado_por_id = VALUES(registrado_por_id)`,
      [alvo.map((p) => [encontro.id, p.id, situacao, "manual", req.user?.id ?? null])]
    );
    return res.json({ ok: true, alterados: alvo.length });
  } catch (e) {
    return falha(res, "registrar a presença em lote", e);
  }
}

// ───────────────────────── importação de planilha ─────────────────────────

function situacaoDaCelula(valor) {
  const t = normalizarTexto(valor);
  if (t === "") return { vazio: true };
  if (["p", "presente", "presenca", "x", "1", "sim", "s", "ok", "✓", "✔"].includes(t)) return { situacao: "presente" };
  if (["j", "justificado", "justificada", "falta justificada", "atestado"].includes(t)) return { situacao: "justificado" };
  if (["a", "f", "ausente", "ausencia", "falta", "0", "nao", "n"].includes(t)) return { situacao: "ausente" };
  return { invalido: true };
}

function dataDeCelula(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // O xlsx devolve Date com pequenas diferenças de fuso — +12h evita virar o dia.
    return new Date(v.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
  }
  const t = String(v == null ? "" : v).trim();
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) {
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    return dataValida(iso) ? iso : null;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return dataValida(iso) ? iso : null;
  }
  return null;
}

// Cabeçalho de coluna de encontro: "12/10/2026" ou "12/10/2026 — Abertura".
function cabecalhoDeEncontro(v) {
  const data = dataDeCelula(v);
  if (!data) return null;
  let titulo = "";
  if (!(v instanceof Date)) {
    titulo = String(v).trim().replace(/^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\s*[-–—|:]*\s*/, "");
  }
  return { data, titulo };
}

function lerPlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const nomeAba = wb.SheetNames.includes("Presença") ? "Presença" : wb.SheetNames[0];
  const sheet = wb.Sheets[nomeAba];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
}

/**
 * Converte a planilha em registros { linha, nome, matricula, cpf, data, titulo, valor }.
 * Dois formatos: LARGO (uma coluna por encontro, como a exportação) e LONGO
 * (colunas data + situacao [+ encontro]).
 */
function extrairRegistros(matriz) {
  if (!matriz.length) return { erro: "A planilha está vazia." };
  const cab = matriz[0].map((c) => (c instanceof Date ? c : String(c == null ? "" : c)));
  const chaves = cab.map((c) => (c instanceof Date ? "" : chaveCabecalho(c)));

  const idxNome = chaves.findIndex((c) => c === "nome" || c === "participante" || c === "colaborador");
  const idxMat = chaves.findIndex((c) => c === "matricula");
  const idxCpf = chaves.findIndex((c) => c === "cpf");
  if (idxNome < 0 && idxMat < 0 && idxCpf < 0) {
    return { erro: "A planilha precisa de ao menos uma coluna de identificação: Nome, Matrícula ou CPF." };
  }

  const idxData = chaves.findIndex((c) => c === "data");
  const idxSit = chaves.findIndex((c) => c === "situacao" || c === "presenca");
  const idxEnc = chaves.findIndex((c) => c === "encontro" || c === "titulo");

  const registros = [];
  const identidade = (linha) => ({
    nome: idxNome >= 0 ? String(linha[idxNome] ?? "").trim() : "",
    matricula: idxMat >= 0 ? String(linha[idxMat] ?? "").trim() : "",
    cpf: idxCpf >= 0 ? soDigitos(linha[idxCpf]) : "",
  });
  const vazia = (id) => !id.nome && !id.matricula && !id.cpf;

  if (idxData >= 0 && idxSit >= 0) {
    for (let i = 1; i < matriz.length; i += 1) {
      const linha = matriz[i];
      const id = identidade(linha);
      if (vazia(id)) continue;
      registros.push({
        linha: i + 1,
        ...id,
        dataBruta: linha[idxData],
        data: dataDeCelula(linha[idxData]),
        titulo: idxEnc >= 0 ? String(linha[idxEnc] ?? "").trim() : "",
        valor: linha[idxSit],
      });
    }
    return { registros, formato: "longo" };
  }

  const colunasEncontro = [];
  cab.forEach((c, idx) => {
    if ([idxNome, idxMat, idxCpf].includes(idx)) return;
    const h = cabecalhoDeEncontro(c);
    if (h) colunasEncontro.push({ idx, ...h });
  });
  if (!colunasEncontro.length) {
    return {
      erro:
        "Não encontrei colunas de encontros. Use a planilha exportada pelo sistema (uma coluna por data, ex.: \"12/10/2026 — Abertura\") ou o formato com as colunas Data e Situação.",
    };
  }
  for (let i = 1; i < matriz.length; i += 1) {
    const linha = matriz[i];
    const id = identidade(linha);
    if (vazia(id)) continue;
    for (const col of colunasEncontro) {
      registros.push({ linha: i + 1, ...id, dataBruta: col.data, data: col.data, titulo: col.titulo, valor: linha[col.idx] });
    }
  }
  return { registros, formato: "largo" };
}

function indexarParticipantes(participantes, cpfsPorParticipante) {
  const porCpf = new Map();
  const porMat = new Map();
  const porNome = new Map();
  const add = (mapa, chave, p) => {
    if (!chave) return;
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(p);
  };
  for (const p of participantes) {
    add(porCpf, cpfsPorParticipante.get(p.id), p);
    add(porMat, normalizarTexto(p.matricula), p);
    add(porNome, normalizarTexto(p.nome), p);
  }
  return { porCpf, porMat, porNome };
}

function resolverParticipante(reg, idx) {
  if (reg.cpf) {
    const lista = idx.porCpf.get(reg.cpf);
    if (lista?.length === 1) return { p: lista[0] };
    if (lista?.length > 1) return { erro: "CPF repetido na tripulação desta jornada." };
    if (!reg.matricula && !reg.nome) return { erro: "CPF não encontrado na tripulação desta jornada." };
  }
  if (reg.matricula) {
    let lista = idx.porMat.get(normalizarTexto(reg.matricula)) || [];
    if (lista.length > 1 && reg.nome) lista = lista.filter((p) => normalizarTexto(p.nome) === normalizarTexto(reg.nome));
    if (lista.length === 1) return { p: lista[0] };
    if (lista.length > 1) return { erro: "Matrícula repetida — informe também o nome completo." };
    if (!reg.nome) return { erro: "Matrícula não encontrada na tripulação desta jornada." };
  }
  if (reg.nome) {
    const lista = idx.porNome.get(normalizarTexto(reg.nome)) || [];
    if (lista.length === 1) return { p: lista[0] };
    if (lista.length > 1) return { erro: "Há mais de uma pessoa com este nome — use matrícula ou CPF." };
    return { erro: "Pessoa não encontrada na tripulação desta jornada (confira nome/matrícula; a importação não cria participantes)." };
  }
  return { erro: "Linha sem identificação." };
}

function resolverEncontro(reg, porData) {
  if (!reg.data) return { erro: "Data inválida." };
  const lista = porData.get(reg.data) || [];
  if (!lista.length) return { erro: `Não há encontro cadastrado em ${formatarDataBR(reg.data)} — crie o encontro antes de importar.` };
  if (lista.length === 1) return { e: lista[0] };
  if (reg.titulo) {
    const alvo = normalizarTexto(reg.titulo);
    const achados = lista.filter((e) => normalizarTexto(e.titulo) === alvo);
    if (achados.length === 1) return { e: achados[0] };
  }
  return { erro: `Há mais de um encontro em ${formatarDataBR(reg.data)} — informe o título exatamente como está cadastrado.` };
}

// POST /jornadas/:jornadaId/importar   (multipart: arquivo; campo confirmar=1 grava)
async function importar(req, res) {
  try {
    const jornada = await buscarJornada(req, req.params.jornadaId);
    if (!jornada) return erro(res, 404, "Jornada não encontrada.");
    if (!req.file) return erro(res, 400, "Arquivo não enviado.");

    let matriz;
    try {
      matriz = lerPlanilha(req.file.buffer);
    } catch (e) {
      return erro(res, 400, "Não consegui ler o arquivo. Envie uma planilha Excel (.xlsx).");
    }
    const extraido = extrairRegistros(matriz);
    if (extraido.erro) return erro(res, 400, extraido.erro);

    const [participantes, encontros, presencas] = await Promise.all([
      carregarParticipantes(jornada.id),
      carregarEncontros(jornada.id),
      carregarPresencas(jornada.id),
    ]);
    const [cpfRows] = await db.query(`SELECT id, cpf FROM jornada_participantes WHERE jornada_id = ?`, [jornada.id]);
    const cpfs = new Map(cpfRows.map((r) => [r.id, soDigitos(r.cpf) || null]));
    const idx = indexarParticipantes(participantes, cpfs);
    const porData = new Map();
    for (const e of encontros) {
      if (!porData.has(e.data)) porData.set(e.data, []);
      porData.get(e.data).push(e);
    }
    const atual = new Map(presencas.map((p) => [`${p.encontro_id}:${p.participante_id}`, p.situacao]));
    const hoje = hojeBahia();

    const itens = [];
    const aplicar = new Map(); // chave → [encontro_id, participante_id, situacao]
    const resumo = { linhas: 0, novos: 0, alterados: 0, iguais: 0, erros: 0 };

    for (const reg of extraido.registros) {
      const cel = situacaoDaCelula(reg.valor);
      if (cel.vazio) continue; // célula em branco = não mexe
      resumo.linhas += 1;
      const base = { linha: reg.linha, nome: reg.nome || reg.matricula || reg.cpf, data: reg.data, situacao: cel.situacao || String(reg.valor) };
      const falhou = (mensagem) => {
        resumo.erros += 1;
        itens.push({ ...base, resultado: "erro", mensagem });
      };

      if (cel.invalido) {
        falhou("Situação não reconhecida — use P (presente), J (justificado) ou F/A (ausente).");
        continue;
      }
      const pe = resolverParticipante(reg, idx);
      if (pe.erro) { falhou(pe.erro); continue; }
      const en = resolverEncontro(reg, porData);
      if (en.erro) { falhou(en.erro); continue; }
      if (en.e.data > hoje) {
        falhou(`O encontro de ${formatarDataBR(en.e.data)} ainda não aconteceu.`);
        continue;
      }

      const chave = `${en.e.id}:${pe.p.id}`;
      base.nome = pe.p.nome;
      base.encontro = en.e.titulo;
      const anterior = atual.get(chave);
      if (aplicar.has(chave)) {
        falhou("Esta pessoa aparece mais de uma vez para o mesmo encontro na planilha.");
        continue;
      }
      if (anterior === cel.situacao) {
        resumo.iguais += 1;
        itens.push({ ...base, resultado: "igual", mensagem: "Já está assim no sistema." });
        continue;
      }
      aplicar.set(chave, [en.e.id, pe.p.id, cel.situacao, "importacao", req.user?.id ?? null]);
      if (anterior) {
        resumo.alterados += 1;
        itens.push({ ...base, resultado: "alterado", mensagem: `Muda de ${anterior} para ${cel.situacao}.` });
      } else {
        resumo.novos += 1;
        itens.push({ ...base, resultado: "novo", mensagem: "Será lançado." });
      }
    }

    const confirmar = ["1", "true", "sim"].includes(String(req.body?.confirmar || "").toLowerCase());
    let aplicado = false;
    if (confirmar && aplicar.size) {
      if (resumo.erros > 0 && !["1", "true", "sim"].includes(String(req.body?.ignorar_erros || "").toLowerCase())) {
        return erro(res, 400, "A planilha tem linhas com erro. Corrija e envie de novo, ou confirme ignorando as linhas com erro.");
      }
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          `INSERT INTO jornada_presencas (encontro_id, participante_id, situacao, origem, registrado_por_id)
           VALUES ?
           ON DUPLICATE KEY UPDATE situacao = VALUES(situacao), origem = VALUES(origem), registrado_por_id = VALUES(registrado_por_id)`,
          [[...aplicar.values()]]
        );
        await conn.commit();
        aplicado = true;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }

    // Erros primeiro (o que precisa de atenção), depois o que será gravado.
    const ordem = { erro: 0, alterado: 1, novo: 2, igual: 3 };
    itens.sort((a, b) => ordem[a.resultado] - ordem[b.resultado] || a.linha - b.linha);

    return res.json({
      ok: true,
      aplicado,
      formato: extraido.formato,
      resumo,
      itens: itens.slice(0, MAX_ITENS_PREVIA),
      itens_omitidos: Math.max(0, itens.length - MAX_ITENS_PREVIA),
      message: aplicado
        ? `Importação concluída: ${aplicar.size} presença(s) gravada(s)${resumo.erros ? `, ${resumo.erros} linha(s) com erro ignorada(s)` : ""}.`
        : confirmar
        ? "Nada a gravar."
        : "Prévia da importação — nada foi gravado ainda.",
    });
  } catch (e) {
    return falha(res, "importar a planilha de presença", e);
  }
}

// ───────────────────────── exportação ─────────────────────────

const ROTULO_SITUACAO = { presente: "Presente", justificado: "Justificado", ausente: "Ausente" };
const LETRA_SITUACAO = { presente: "P", justificado: "J", ausente: "F" };
const ROTULO_FAROL = { verde: "Dentro do mínimo", vermelho: "Abaixo do mínimo", cinza: "Sem dados" };
const ROTULO_RECICLAGEM = {
  em_dia: "Em dia",
  vence_em_breve: "Vence em até 30 dias",
  vencida: "Vencida",
  sem_registro: "Sem registro",
  incompleto: "Meta de horas não atingida",
};

// GET /jornadas/:jornadaId/exportar
async function exportar(req, res) {
  try {
    const jornada = await buscarJornada(req, req.params.jornadaId);
    if (!jornada) return erro(res, 404, "Jornada não encontrada.");
    const g = await montarGrade(jornada);
    const cfg = g.jornada;

    const [registradores] = await db.query(
      `SELECT p.encontro_id, p.participante_id, p.situacao, p.origem, p.updated_at, u.nome AS registrado_por
       FROM jornada_presencas p
       JOIN jornada_encontros e ON e.id = p.encontro_id
       LEFT JOIN usuarios u ON u.id = p.registrado_por_id
       WHERE e.jornada_id = ?`,
      [jornada.id]
    );
    const infoRegistro = new Map(registradores.map((r) => [`${r.encontro_id}:${r.participante_id}`, r]));

    const wb = novoWorkbook();

    // Aba 1 — grade (formato também aceito pela importação).
    const ws = wb.addWorksheet("Presença");
    const fixas = ["Nome", "Matrícula", "Turma", "Cargo", "Supervisor"];
    const cabecalho = [
      ...fixas,
      ...g.encontros.map((e) => `${formatarDataBR(e.data)} — ${e.titulo}`),
      "Horas realizadas",
      "Presentes",
      "Justificadas",
      "Ausências",
      "% Presença",
      "Situação da presença",
    ];
    if (cfg.meta_horas) cabecalho.push(`% da meta (${cfg.meta_horas}h)`);
    if (cfg.periodicidade_meses) cabecalho.push("Reciclagem");
    cabecalho.forEach((c, i) => { ws.getCell(1, i + 1).value = c; });
    estilizarCabecalho(ws, 1, cabecalho.length);
    ws.getRow(1).height = 34;
    g.participantes.forEach((p, r) => {
      const linha = r + 2;
      const valores = [p.nome, p.matricula || "", p.turma || "", p.cargo || "", p.supervisor || ""];
      g.encontros.forEach((e) => {
        const sit = g.presencas[`${e.id}:${p.id}`];
        valores.push(sit ? LETRA_SITUACAO[sit] : "");
      });
      valores.push(p.totais.horas, p.totais.presentes, p.totais.justificados, p.totais.ausentes);
      valores.push(p.totais.pct_presenca === null ? "" : p.totais.pct_presenca / 100);
      valores.push(ROTULO_FAROL[p.totais.farol] + ` (mín. ${cfg.presenca_minima_pct}%)`);
      if (cfg.meta_horas) valores.push(p.totais.meta_pct === null ? "" : p.totais.meta_pct / 100);
      if (cfg.periodicidade_meses) {
        const rc = p.totais.reciclagem;
        valores.push(rc ? `${ROTULO_RECICLAGEM[rc.status]}${rc.ate ? ` — até ${formatarDataBR(rc.ate)}` : ""}` : "");
      }
      valores.forEach((v, i) => {
        const cell = ws.getCell(linha, i + 1);
        cell.value = v;
        const col = i + 1;
        const base = fixas.length + g.encontros.length;
        if (col > fixas.length && col <= base) cell.alignment = { horizontal: "center" };
        if (col === base + 5) cell.numFmt = "0.0%";
        if (cfg.meta_horas && col === base + 7) cell.numFmt = "0.0%";
      });
    });
    ws.columns = cabecalho.map((_, i) => ({ width: i === 0 ? 34 : i < fixas.length ? 16 : i < fixas.length + g.encontros.length ? 14 : 16 }));
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cabecalho.length } };

    // Aba 2 — encontros.
    const we = wb.addWorksheet("Encontros");
    const colsE = ["Data", "Título", "Trilha", "Etapa da trilha", "Etapa", "Horário", "Carga horária (h)", "Responsável", "Presentes", "Justificados", "Ausentes", "Não lançados"];
    colsE.forEach((c, i) => { we.getCell(1, i + 1).value = c; });
    estilizarCabecalho(we, 1, colsE.length);
    g.encontros.forEach((e, r) => {
      const t = g.por_encontro[r];
      const linha = r + 2;
      const d = paraDate(e.data);
      we.getCell(linha, 1).value = d;
      we.getCell(linha, 1).numFmt = FORMATO_DATA;
      [e.titulo, e.trilha_titulo || "", e.trilha_etapa_titulo || "", e.etapa_nome || "", e.hora_inicio || "", e.carga_horaria, e.responsavel || "", t.presentes, t.justificados, t.ausentes, t.nao_lancados].forEach((v, i) => {
        we.getCell(linha, i + 2).value = v;
      });
    });
    we.columns = [12, 36, 30, 30, 26, 10, 16, 24, 11, 13, 10, 13].map((width) => ({ width }));
    we.views = [{ state: "frozen", ySplit: 1 }];

    // Aba 3 — registro individual (evidência por pessoa × encontro).
    const wr = wb.addWorksheet("Registro (evidência)");
    const colsR = ["Nome", "Matrícula", "Data", "Encontro", "Trilha", "Etapa da trilha", "Etapa", "Carga horária (h)", "Situação", "Horas creditadas", "Registrado por", "Origem", "Atualizado em"];
    colsR.forEach((c, i) => { wr.getCell(1, i + 1).value = c; });
    estilizarCabecalho(wr, 1, colsR.length);
    let rr = 2;
    for (const p of g.participantes) {
      for (const e of g.encontros) {
        const sit = g.presencas[`${e.id}:${p.id}`];
        if (!sit) continue;
        const info = infoRegistro.get(`${e.id}:${p.id}`);
        const vals = [
          p.nome,
          p.matricula || "",
          paraDate(e.data),
          e.titulo,
          e.trilha_titulo || "",
          e.trilha_etapa_titulo || "",
          e.etapa_nome || "",
          e.carga_horaria,
          ROTULO_SITUACAO[sit],
          sit === "presente" ? e.carga_horaria : 0,
          info?.registrado_por || "",
          info?.origem === "importacao" ? "Importação" : "Lançamento manual",
          info?.updated_at ? new Date(info.updated_at).toLocaleString("pt-BR", { timeZone: "America/Bahia" }) : "",
        ];
        vals.forEach((v, i) => { wr.getCell(rr, i + 1).value = v; });
        wr.getCell(rr, 3).numFmt = FORMATO_DATA;
        rr += 1;
      }
    }
    wr.columns = [34, 14, 12, 34, 30, 30, 26, 16, 14, 16, 26, 18, 20].map((width) => ({ width }));
    wr.views = [{ state: "frozen", ySplit: 1 }];
    wr.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colsR.length } };

    // Aba 4 — por trilha (horas e presença da pessoa em cada trilha da jornada).
    const wt = wb.addWorksheet("Por trilha");
    const colsT = ["Nome", "Matrícula", "Trilha", "Etapa da trilha", "Encontros", "Horas realizadas", "Presentes", "Justificadas", "Ausências", "% Presença", "Situação da presença"];
    colsT.forEach((c, i) => { wt.getCell(1, i + 1).value = c; });
    estilizarCabecalho(wt, 1, colsT.length);
    let rt = 2;
    const trilhasVinc = g.trilhas.map((t) => ({ id: t.id, titulo: t.titulo, etapas: t.etapas.map((x) => ({ id: x.id, titulo: x.titulo })) }));
    for (const p of g.participantes) {
      const mapa = new Map();
      for (const e of g.encontros) {
        const sit = g.presencas[`${e.id}:${p.id}`];
        if (sit) mapa.set(e.id, sit);
      }
      const blocos = totaisPorTrilha(g.encontros, trilhasVinc, mapa, cfg, g.hoje);
      for (const b of blocos) {
        const vals = [p.nome, p.matricula || "", b.trilha_titulo, b.nivel === "trilha" ? "Total da trilha" : b.titulo, b.encontros, b.horas, b.presentes, b.justificados, b.ausentes, b.pct_presenca === null ? "" : b.pct_presenca / 100, ROTULO_FAROL[b.farol] + ` (mín. ${cfg.presenca_minima_pct}%)`];
        vals.forEach((v, i) => { wt.getCell(rt, i + 1).value = v; });
        if (b.nivel === "trilha") wt.getRow(rt).font = { bold: true };
        wt.getCell(rt, 10).numFmt = "0.0%";
        rt += 1;
      }
    }
    wt.columns = [34, 14, 36, 34, 11, 16, 11, 13, 11, 12, 28].map((width) => ({ width }));
    wt.views = [{ state: "frozen", ySplit: 1 }];
    wt.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colsT.length } };

    // Abas 5–7 — desenvolvimento por etapa, avaliação e evolução (Fase 3, 16/10/2026).
    // Rota só da Metodologia (e super_admin): avaliação, nota, observação e evolução
    // entram aqui como no Perfil 360 desse público. Se o cálculo falhar, a exportação
    // segue sem essas abas (a presença nunca deixa de sair).
    let dev = null;
    try {
      const { calcularDesenvolvimento } = require("../lib/jornadaDesenvolvimento");
      dev = await calcularDesenvolvimento(
        { id: jornada.id, presenca_minima_pct: cfg.presenca_minima_pct, meta_horas: cfg.meta_horas, periodicidade_meses: cfg.periodicidade_meses },
        { incluirAvaliacao: true, incluirEvolucao: true }
      );
    } catch (e) {
      console.error("[jornadaPresenca] exportar — desenvolvimento:", e.message || e);
    }
    if (dev) {
      const ROT_STATUS = { nao_iniciada: "Não iniciada", em_andamento: "Em andamento", concluida: "Concluída" };
      const ROT_AVAL = { atingiu: "Atingiu", parcial: "Parcial", nao_atingiu: "Não atingiu" };
      const ROT_TIPO = { ponto_forte: "Ponto forte", dificuldade: "Dificuldade", plano_acao: "Plano de ação", geral: "Geral" };

      const wd = wb.addWorksheet("Desenvolvimento");
      const colsD = ["Nome", "Matrícula", "Turma", "Horas realizadas", "Carga prevista (h)", "% da jornada", "Base do %", "Etapas concluídas", "Total de etapas", "% Presença", "Situação da presença"];
      colsD.forEach((c, i) => { wd.getCell(1, i + 1).value = c; });
      estilizarCabecalho(wd, 1, colsD.length);
      dev.participantes.forEach((p, r) => {
        const linha = r + 2;
        [p.nome, p.matricula || "", p.turma || "", p.horas, dev.carga_prevista || "", p.pct_jornada === null ? "" : p.pct_jornada / 100, p.base_pct_jornada === "horas" ? "Horas ÷ carga prevista" : p.base_pct_jornada === "etapas" ? "Etapas concluídas ÷ etapas" : "", p.concluidas, p.total_etapas, p.pct_presenca === null ? "" : p.pct_presenca / 100, ROTULO_FAROL[p.farol] + ` (mín. ${cfg.presenca_minima_pct}%)`].forEach((v, i) => {
          wd.getCell(linha, i + 1).value = v;
        });
        wd.getCell(linha, 6).numFmt = "0.0%";
        wd.getCell(linha, 10).numFmt = "0.0%";
      });
      wd.columns = [34, 14, 18, 16, 16, 13, 26, 16, 14, 12, 28].map((width) => ({ width }));
      wd.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
      wd.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colsD.length } };

      const we2 = wb.addWorksheet("Etapas (status e avaliação)");
      const colsE2 = ["Nome", "Matrícula", "Etapa", "Status", "Data de conclusão", "Encontros", "Horas na etapa", "% Presença na etapa", "Avaliação", "Nota", "Observação"];
      colsE2.forEach((c, i) => { we2.getCell(1, i + 1).value = c; });
      estilizarCabecalho(we2, 1, colsE2.length);
      let re = 2;
      for (const p of dev.participantes) {
        for (const et of dev.etapas) {
          const c = p.etapas[et.id];
          const vals = [p.nome, p.matricula || "", et.nome, ROT_STATUS[c.status] || c.status, c.data_conclusao ? paraDate(c.data_conclusao) : "", c.encontros, c.horas, c.pct_presenca === null ? "" : c.pct_presenca / 100, c.avaliacao ? ROT_AVAL[c.avaliacao] : "", c.nota === null ? "" : c.nota, c.observacao || ""];
          vals.forEach((v, i) => { we2.getCell(re, i + 1).value = v; });
          if (c.data_conclusao) we2.getCell(re, 5).numFmt = FORMATO_DATA;
          we2.getCell(re, 8).numFmt = "0.0%";
          re += 1;
        }
      }
      we2.columns = [34, 14, 34, 16, 16, 11, 14, 16, 14, 8, 50].map((width) => ({ width }));
      we2.views = [{ state: "frozen", ySplit: 1 }];
      we2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colsE2.length } };

      const wv = wb.addWorksheet("Evolução (anotações)");
      const colsV = ["Nome", "Matrícula", "Data", "Tipo", "Anotação", "Registrado por"];
      colsV.forEach((c, i) => { wv.getCell(1, i + 1).value = c; });
      estilizarCabecalho(wv, 1, colsV.length);
      let rv = 2;
      for (const p of dev.participantes) {
        for (const n of p.evolucao || []) {
          [p.nome, p.matricula || "", paraDate(n.data), ROT_TIPO[n.tipo] || n.tipo, n.texto, n.criado_por_nome || ""].forEach((v, i) => { wv.getCell(rv, i + 1).value = v; });
          wv.getCell(rv, 3).numFmt = FORMATO_DATA;
          rv += 1;
        }
      }
      wv.columns = [34, 14, 12, 16, 80, 26].map((width) => ({ width }));
      wv.views = [{ state: "frozen", ySplit: 1 }];
    }

    // Aba 5 — resumo e critérios.
    const wm = wb.addWorksheet("Resumo");
    const linhasResumo = [
      ["Jornada", cfg.nome],
      ["Cliente", cfg.cliente || ""],
      ["Gerado em", new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" })],
      ["Participantes", g.resumo.participantes],
      ["Encontros cadastrados / já realizados", `${g.resumo.encontros} / ${g.resumo.encontros_realizados}`],
      ["Carga horária total dos encontros (h)", g.resumo.horas_encontros],
      ["Presença mínima exigida", `${cfg.presenca_minima_pct}%`],
      ["Meta de horas por pessoa", cfg.meta_horas ? `${cfg.meta_horas} h` : "não definida"],
      ["Periodicidade da reciclagem", cfg.periodicidade_meses ? `${cfg.periodicidade_meses} meses` : "não definida"],
      ["Pessoas abaixo da presença mínima", g.resumo.abaixo_do_minimo],
      ["Pessoas com encontro realizado sem lançamento", g.resumo.sem_lancamento],
      ["Presença média", g.resumo.pct_medio === null ? "—" : `${g.resumo.pct_medio}%`],
      ["Trilhas vinculadas", g.trilhas.length ? g.trilhas.map((t) => t.titulo).join("; ") : "nenhuma"],
      [],
      ["Como os números são calculados"],
      ["Horas realizadas = soma da carga horária dos encontros em que a pessoa esteve presente."],
      ["% de presença = presentes ÷ (presentes + ausentes) nos encontros já lançados. Falta justificada não soma horas e fica fora do cálculo."],
      ["Encontro sem lançamento não é contado como falta."],
      ["Legenda da grade: P = presente · J = justificado · F = ausente · vazio = não lançado."],
      ["As abas Desenvolvimento, Etapas (status e avaliação) e Evolução (anotações) trazem dado de acompanhamento da Metodologia — avalie antes de compartilhar o arquivo fora do time."],
    ];
    linhasResumo.forEach((l, i) => {
      l.forEach((v, c) => { wm.getCell(i + 1, c + 1).value = v; });
      if (l.length === 2) wm.getCell(i + 1, 1).font = { bold: true };
    });
    wm.getCell(linhasResumo.findIndex((l) => l[0] === "Como os números são calculados") + 1, 1).font = { bold: true };
    wm.columns = [{ width: 46 }, { width: 50 }];

    const nomeArquivo = `presenca-${String(cfg.nome).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "jornada"}-${hojeBahia()}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    await wb.xlsx.write(res);
    return res.end();
  } catch (e) {
    console.error("[jornadaPresenca] exportar:", e.message || e);
    if (!res.headersSent) return res.status(500).json({ ok: false, message: "Erro ao exportar a presença.", error: "Erro ao exportar a presença." });
    return res.end();
  }
}

// GET /participantes/:id/presenca — extrato individual (base do relatório por
// pessoa e, na Fase 2, do bloco no Perfil 360).
async function extratoParticipante(req, res) {
  try {
    const participanteId = Number(req.params.id);
    if (!participanteId) return erro(res, 400, "Participante inválido.");
    const [rows] = await db.query(
      `SELECT id, jornada_id, nome, matricula, turma, cargo, supervisor, status_jornada, pessoa_id FROM jornada_participantes WHERE id = ? LIMIT 1`,
      [participanteId]
    );
    const participante = rows[0];
    if (!participante) return erro(res, 404, "Participante não encontrado.");
    const jornada = await buscarJornada(req, participante.jornada_id);
    if (!jornada) return erro(res, 404, "Participante não encontrado.");

    const config = configDaJornada(jornada);
    const hoje = hojeBahia();
    const trilhasVinculadas = await carregarTrilhasDaJornada(jornada.id);
    const encontros = normalizarTrilhas(await carregarEncontros(jornada.id), trilhasVinculadas);
    const [pres] = await db.query(
      `SELECT p.encontro_id, p.situacao FROM jornada_presencas p WHERE p.participante_id = ?`,
      [participanteId]
    );
    const mapa = new Map(pres.map((p) => [p.encontro_id, p.situacao]));
    return res.json({
      ok: true,
      hoje,
      jornada: { id: jornada.id, nome: jornada.nome, cliente: jornada.cliente, ...config },
      participante: { id: participante.id, nome: participante.nome, matricula: participante.matricula, turma: participante.turma, cargo: participante.cargo, supervisor: participante.supervisor },
      encontros: encontros.map((e) => ({ ...e, situacao: mapa.get(e.id) || null, realizado: e.data <= hoje })),
      totais: totaisDaPessoa(encontros, mapa, config, hoje),
      por_trilha: totaisPorTrilha(encontros, trilhasVinculadas, mapa, config, hoje),
    });
  } catch (e) {
    return falha(res, "carregar o extrato do participante", e);
  }
}

module.exports = {
  grade,
  salvarConfig,
  criarEncontro,
  atualizarEncontro,
  excluirEncontro,
  duplicarEncontro,
  registrarPresenca,
  presencaEmLote,
  importar,
  exportar,
  extratoParticipante,
  listarTrilhas,
  salvarTrilhas,
  // exportados para testes
  _totaisDaPessoa: totaisDaPessoa,
  _somarMeses: somarMeses,
  _montarGrade: montarGrade, // usado pelo Radar (vencimentos de reciclagem)
};
