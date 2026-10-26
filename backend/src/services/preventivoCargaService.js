/**
 * preventivoCargaService.js — Radar preventivo, Pacote 2 (26/10/2026)
 *
 *  1) CARGA FUTURA — quanto de aula já está marcada para cada instrutor nos
 *     próximos meses (e nas próximas 13 semanas) contra a meta de capacidade
 *     dele, e quanto cada sala está ocupada nos próximos 30, 60 e 90 dias.
 *  2) DEMANDA DO R&S PARA O T&D — RPs em andamento viram previsão de turma:
 *     Avaliações Técnicas que vão começar sem turma agendada e berço parado
 *     (com sugestão de reaproveitar em RP aberta do mesmo cargo).
 *
 * Só LÊ dados que o portal já guarda. Decisões de leitura (ver relatório):
 *  - horas = carga horária PLANEJADA das aulas não canceladas (turma sem
 *    cronograma divide a carga horária da turma pelos dias úteis do período);
 *  - aula sem instrutor_responsavel vale para o instrutor principal da turma;
 *  - instrutor ADICIONAL (TBT) recebe as horas cheias, como em CH por Instrutor;
 *  - meta do mês = a cadastrada para aquele mês; sem ela, a última meta
 *    anterior do mesmo instrutor ("herdada"); sem nenhuma, só mostra o volume
 *    (mesma decisão de 29/09/2026: não existe % contra teto genérico);
 *  - sala é compartilhada entre ambientes: a ocupação conta turmas de todos
 *    os ambientes, mas só devolve contagens (nunca tema ou cliente de outro).
 */
const pool = require("../lib/db");
const { mapaAdicionais } = require("../lib/instrutoresTurma");
const Cap = require("./capacidadeResolver");
const { nomesAvaliacaoTecnica } = require("../lib/subtipos");
const { hojeBahia, somarDias, diasEntre, GRAV_ORDEM } = require("./preventivoService");

const chave = (s) => String(s || "").trim().toLowerCase();
const semAcento = (s) => chave(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
const arred = (n, c = 1) => { const f = 10 ** c; return Math.round((Number(n) + Number.EPSILON) * f) / f; };
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function diaSemana(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 = domingo
}
const ehUtil = (iso) => { const d = diaSemana(iso); return d >= 1 && d <= 5; };
function segundaDe(iso) {
  const d = diaSemana(iso);
  return somarDias(iso, d === 0 ? -6 : 1 - d);
}
function primeiroDoMes(iso, deslocMeses = 0) {
  const [a, m] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1 + deslocMeses, 1));
  return dt.toISOString().slice(0, 10);
}
function ultimoDoMes(iso, deslocMeses = 0) {
  const [a, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m + deslocMeses, 0)).toISOString().slice(0, 10);
}
function diasUteisEntre(deIso, ateIso) {
  let n = 0;
  for (let d = deIso; d <= ateIso; d = somarDias(d, 1)) if (ehUtil(d)) n += 1;
  return n;
}

const NAO_CANCELADA = `(t.status IS NULL OR LOWER(TRIM(t.status)) NOT LIKE '%cancel%')`;

/**
 * Entradas datadas: { tid, data, horas, instrutores[], sala_id } — uma por aula
 * (ou por dia útil, para turma sem cronograma). `soSala` traz só as de sala
 * (usado sem filtro de ambiente, porque a sala é compartilhada).
 */
async function carregarEntradas({ empresaId, de, ate, soSala = false }) {
  const filtroEmp = empresaId ? " AND t.empresa_id = ?" : "";
  const parEmp = empresaId ? [empresaId] : [];
  const filtroSala = soSala ? " AND t.sala_id IS NOT NULL" : "";

  const [aulas] = await pool.query(
    `SELECT ta.treinamento_id AS tid, DATE_FORMAT(ta.data_aula, '%Y-%m-%d') AS data,
            COALESCE(ta.carga_horaria_planejada, 0) AS horas,
            TRIM(COALESCE(ta.instrutor_responsavel, '')) AS resp, TRIM(COALESCE(t.instrutor, '')) AS principal,
            t.sala_id, t.carga_horaria
       FROM turma_aulas ta JOIN treinamentos t ON t.id = ta.treinamento_id
      WHERE ta.data_aula BETWEEN ? AND ? AND LOWER(TRIM(COALESCE(ta.status_execucao, ''))) <> 'cancelada'
        AND ${NAO_CANCELADA}${filtroEmp}${filtroSala}`,
    [de, ate, ...parEmp]
  );

  // Cronograma sem horas por aula: divide a carga horária da turma entre as aulas (mesma estimativa da grade de presença).
  const tidsSemHoras = [...new Set(aulas.filter((a) => Number(a.carga_horaria) > 0).map((a) => a.tid))];
  const estimativa = new Map();
  if (tidsSemHoras.length) {
    const [tot] = await pool.query(
      `SELECT treinamento_id AS tid, COUNT(*) AS n, SUM(COALESCE(carga_horaria_planejada, 0)) AS soma
         FROM turma_aulas WHERE treinamento_id IN (${tidsSemHoras.map(() => "?").join(",")})
          AND LOWER(TRIM(COALESCE(status_execucao, ''))) <> 'cancelada' GROUP BY treinamento_id`,
      tidsSemHoras
    );
    for (const r of tot) if (Number(r.soma) === 0 && Number(r.n) > 0) estimativa.set(r.tid, Number(r.n));
  }

  const adic = soSala ? new Map() : await mapaAdicionais(empresaId);
  const entradas = [];
  for (const a of aulas) {
    let horas = Number(a.horas) || 0;
    if (!horas && estimativa.has(a.tid)) {
      horas = Number(a.carga_horaria) / estimativa.get(a.tid);
    }
    const nomes = [a.resp || a.principal, ...(adic.get(a.tid) || [])].map((n) => String(n || "").trim()).filter(Boolean);
    entradas.push({ tid: a.tid, data: a.data, horas, instrutores: dedup(nomes), sala_id: a.sala_id || null });
  }

  const [semAulas] = await pool.query(
    `SELECT t.id AS tid, TRIM(COALESCE(t.instrutor, '')) AS principal, t.sala_id, t.carga_horaria,
            DATE_FORMAT(COALESCE(t.data_inicio, t.data), '%Y-%m-%d') AS ini,
            DATE_FORMAT(COALESCE(t.data_fim, t.data_inicio, t.data), '%Y-%m-%d') AS fim
       FROM treinamentos t
      WHERE ${NAO_CANCELADA}${filtroEmp}${filtroSala}
        AND NOT EXISTS (SELECT 1 FROM turma_aulas x WHERE x.treinamento_id = t.id)
        AND COALESCE(t.data_inicio, t.data) IS NOT NULL AND COALESCE(t.carga_horaria, 0) > 0
        AND COALESCE(DATE(t.data_inicio), t.data) <= ? AND COALESCE(DATE(t.data_fim), DATE(t.data_inicio), t.data) >= ?`,
    [...parEmp, ate, de]
  );
  for (const t of semAulas) {
    const fim = t.fim < t.ini ? t.ini : t.fim;
    const limite = diasEntre(t.ini, fim) > 366 ? somarDias(t.ini, 366) : fim;
    let dias = [];
    for (let d = t.ini; d <= limite; d = somarDias(d, 1)) if (ehUtil(d)) dias.push(d);
    if (!dias.length) dias = [t.ini];
    const porDia = Number(t.carga_horaria) / dias.length;
    const nomes = [t.principal, ...(adic.get(t.tid) || [])].map((n) => String(n || "").trim()).filter(Boolean);
    for (const d of dias) {
      if (d < de || d > ate) continue;
      entradas.push({ tid: t.tid, data: d, horas: porDia, instrutores: dedup(nomes), sala_id: t.sala_id || null });
    }
  }
  return entradas;
}

function dedup(nomes) {
  const vistos = new Set();
  return nomes.filter((n) => { const k = chave(n); if (vistos.has(k)) return false; vistos.add(k); return true; });
}

// ───────────────────────── 1) CARGA FUTURA ─────────────────────────

const RANK_STATUS = { sobrecarga: 3, atencao: 2, saudavel: 1, ocioso: 0 };

async function calcularCargaFutura({ empresaId, instrutor } = {}) {
  const hoje = hojeBahia();
  const iniMes = primeiroDoMes(hoje);
  const fimJanela = ultimoDoMes(hoje, 3); // mês atual + 3
  const seg0 = segundaDe(hoje);
  const de = seg0 < iniMes ? seg0 : iniMes;
  const entradas = await carregarEntradas({ empresaId, de, ate: fimJanela });

  const regra = await Cap.getRegraPadrao(empresaId);
  const horasDia = Number(regra.horas_dia_padrao) || 6;
  const limiteSemana = horasDia * 5;

  const meses = [0, 1, 2, 3].map((i) => {
    const ini = primeiroDoMes(hoje, i);
    const [a, m] = ini.split("-").map(Number);
    return { idx: i, ano: a, mes: m, ini, fim: ultimoDoMes(hoje, i), rotulo: `${MESES[m - 1]}/${String(a).slice(2)}` };
  });
  const semanas = Array.from({ length: 13 }, (_, i) => somarDias(seg0, i * 7));

  // agrega por instrutor
  const mapa = new Map();
  const timeSemana = new Map(semanas.map((s) => [s, 0]));
  let horasSemInstrutor = 0;
  const tidsSemInstrutor = new Set();
  for (const e of entradas) {
    const seg = segundaDe(e.data);
    if (timeSemana.has(seg)) timeSemana.set(seg, timeSemana.get(seg) + e.horas);
    if (!e.instrutores.length) {
      if (e.data >= hoje) { horasSemInstrutor += e.horas; tidsSemInstrutor.add(e.tid); }
      continue;
    }
    for (const nome of e.instrutores) {
      const k = chave(nome);
      if (!mapa.has(k)) mapa.set(k, { nome, meses: new Map(), semanas: new Map(), tids: new Set() });
      const r = mapa.get(k);
      const ym = e.data.slice(0, 7);
      const mm = r.meses.get(ym) || { horas: 0, tids: new Set() };
      mm.horas += e.horas; mm.tids.add(e.tid); r.meses.set(ym, mm);
      r.semanas.set(seg, (r.semanas.get(seg) || 0) + e.horas);
      if (e.data >= hoje) r.tids.add(e.tid);
    }
  }

  // metas cadastradas (por instrutor/mês) e quem ainda é do time
  const [metasRows] = await pool.query(
    `SELECT LOWER(TRIM(instrutor)) AS k, TRIM(instrutor) AS nome, ano, mes, horas_capacidade FROM capacidade_instrutor_mensal${empresaId ? " WHERE empresa_id = ?" : ""}`,
    empresaId ? [empresaId] : []
  );
  const metasPor = new Map();
  const nomeMeta = new Map();
  for (const r of metasRows) {
    nomeMeta.set(r.k, r.nome);
    if (!metasPor.has(r.k)) metasPor.set(r.k, []);
    metasPor.get(r.k).push({ ym: r.ano * 12 + r.mes, horas: Number(r.horas_capacidade) });
  }
  const metaDe = (k, ano, mes) => {
    const lista = metasPor.get(k);
    if (!lista) return null;
    const alvo = ano * 12 + mes;
    const exata = lista.find((x) => x.ym === alvo);
    if (exata) return { horas: exata.horas, fonte: "mes" };
    const anteriores = lista.filter((x) => x.ym < alvo).sort((a, b) => b.ym - a.ym);
    return anteriores[0] ? { horas: anteriores[0].horas, fonte: "herdada" } : null;
  };
  for (const k of metasPor.keys()) if (!mapa.has(k)) mapa.set(k, { nome: null, meses: new Map(), semanas: new Map(), tids: new Set() });

  let ativos = null;
  try { ativos = new Set((await Cap.listarInstrutoresConhecidos(empresaId, { apenasAtivos: true })).map(chave)); } catch (_) { ativos = null; }

  const itens = [];
  for (const [k, r] of mapa) {
    if (instrutor && k !== chave(instrutor)) continue;
    const nome = r.nome || nomeMeta.get(k) || k;
    const temCargaFutura = [...r.tids].length > 0;
    const foraDoTime = !!(ativos && ativos.size && !ativos.has(k) && temCargaFutura);
    const meta0 = metaDe(k, meses[0].ano, meses[0].mes);
    if (!temCargaFutura && !meta0 && ![...r.meses.keys()].length) continue;
    if (!temCargaFutura && ativos && ativos.size && !ativos.has(k)) continue; // saiu do time e não tem aula marcada

    const porMes = meses.map((m) => {
      const mm = r.meses.get(`${m.ano}-${String(m.mes).padStart(2, "0")}`);
      const horas = arred(mm ? mm.horas : 0, 1);
      const meta = metaDe(k, m.ano, m.mes);
      const pct = meta && meta.horas > 0 ? arred((horas / meta.horas) * 100, 1) : null;
      const st = Cap.statusOcupacao(pct);
      return { ano: m.ano, mes: m.mes, rotulo: m.rotulo, horas_planejadas: horas, turmas: mm ? mm.tids.size : 0,
        meta_horas: meta ? arred(meta.horas, 1) : null, fonte_meta: meta ? meta.fonte : null, ocupacao_pct: pct, status: st.status };
    });
    const picos = semanas
      .map((s) => ({ inicio: s, horas: arred(r.semanas.get(s) || 0, 1) }))
      .filter((s) => s.horas > limiteSemana)
      .map((s) => ({ ...s, limite: limiteSemana }));

    const motivos = [];
    let grav = null;
    const sobe = (g) => { if (!grav || GRAV_ORDEM[g] > GRAV_ORDEM[grav]) grav = g; };
    if (foraDoTime) { motivos.push("Tem aulas marcadas, mas não está mais na lista de instrutores ativos"); sobe("critica"); }
    for (const pm of porMes) {
      const idx = porMes.indexOf(pm);
      if (pm.status === "sobrecarga") { motivos.push(`${pm.rotulo}: ${pm.horas_planejadas}h planejadas para meta de ${pm.meta_horas}h (${pm.ocupacao_pct}%)`); sobe(idx <= 2 ? "critica" : "alta"); }
      else if (pm.status === "atencao") { motivos.push(`${pm.rotulo}: ${pm.ocupacao_pct}% da meta`); sobe("alta"); }
      else if (pm.status === "ocioso" && idx <= 1 && pm.meta_horas) { motivos.push(`${pm.rotulo}: só ${pm.ocupacao_pct}% da meta com aulas marcadas`); sobe("media"); }
    }
    if (picos.length) { motivos.push(`${picos.length} semana(s) acima de ${limiteSemana}h (${picos.slice(0, 3).map((p) => `${p.inicio.slice(8)}/${p.inicio.slice(5, 7)}: ${p.horas}h`).join(", ")})`); sobe(picos.some((p) => p.horas > limiteSemana * 1.2) ? "alta" : "media"); }

    itens.push({ instrutor: nome, meses: porMes, semanas_pico: picos, fora_do_time: foraDoTime, gravidade: grav, motivos });
  }
  itens.sort((a, b) => (GRAV_ORDEM[b.gravidade] || 0) - (GRAV_ORDEM[a.gravidade] || 0) || a.instrutor.localeCompare(b.instrutor, "pt-BR"));

  const salas = instrutor ? null : await calcularSalas({ hoje });
  const resumo = {
    instrutores: itens.length,
    instrutores_sobrecarga: itens.filter((i) => i.meses.some((m) => m.status === "sobrecarga")).length,
    instrutores_atencao: itens.filter((i) => !i.meses.some((m) => m.status === "sobrecarga") && i.meses.some((m) => m.status === "atencao")).length,
    instrutores_ociosos: itens.filter((i) => i.meses.some((m, ix) => ix <= 1 && m.status === "ocioso" && m.meta_horas)).length,
    instrutores_semana_pico: itens.filter((i) => i.semanas_pico.length).length,
    instrutores_fora_do_time: itens.filter((i) => i.fora_do_time).length,
    horas_sem_instrutor: arred(horasSemInstrutor, 1),
    turmas_sem_instrutor: tidsSemInstrutor.size,
    salas_saturadas: salas ? salas.filter((s) => s.janelas.some((j) => j.status === "saturada")).length : 0,
    alertas: itens.filter((i) => i.gravidade && GRAV_ORDEM[i.gravidade] >= GRAV_ORDEM.alta).length
      + (salas ? salas.filter((s) => s.janelas.some((j) => j.status === "saturada")).length : 0),
  };
  return {
    hoje, limite_semana_horas: limiteSemana, horas_dia: horasDia,
    meses: meses.map((m) => ({ ano: m.ano, mes: m.mes, rotulo: m.rotulo })),
    time_semanas: semanas.map((s) => ({ inicio: s, horas: arred(timeSemana.get(s) || 0, 1) })),
    instrutores: itens, salas, resumo,
  };
}

// Ocupação de sala: dias úteis com aula marcada ÷ dias úteis da janela (todos os ambientes).
async function calcularSalas({ hoje }) {
  const ate = somarDias(hoje, 89);
  const [salas] = await pool.query("SELECT id, nome, capacidade, grupo, ativo FROM salas ORDER BY grupo, nome");
  if (!salas.length) return [];
  const entradas = await carregarEntradas({ empresaId: null, de: hoje, ate, soSala: true });
  const porSala = new Map();
  for (const e of entradas) {
    if (!e.sala_id) continue;
    if (!porSala.has(e.sala_id)) porSala.set(e.sala_id, []);
    porSala.get(e.sala_id).push(e);
  }
  const JANELAS = [30, 60, 90];
  const out = salas.filter((s) => s.ativo || (porSala.get(s.id) || []).length).map((s) => {
    const es = porSala.get(s.id) || [];
    const janelas = JANELAS.map((n) => {
      const fim = somarDias(hoje, n - 1);
      const uteis = diasUteisEntre(hoje, fim);
      const dias = new Set(); const tids = new Set(); let horas = 0;
      for (const e of es) {
        if (e.data > fim) continue;
        horas += e.horas; tids.add(e.tid);
        if (ehUtil(e.data)) dias.add(e.data);
      }
      const pct = uteis ? arred((dias.size / uteis) * 100, 1) : 0;
      const status = pct >= 85 ? "saturada" : pct >= 65 ? "alta" : pct < 15 ? "ociosa" : "normal";
      return { dias: n, dias_uteis: uteis, dias_com_uso: dias.size, dias_livres: Math.max(0, uteis - dias.size), horas_uso: arred(horas, 1), turmas: tids.size, ocupacao_pct: pct, status };
    });
    return { id: s.id, nome: s.nome, capacidade: s.capacidade, grupo: s.grupo, ativa: !!s.ativo, janelas };
  });
  out.sort((a, b) => b.janelas[1].ocupacao_pct - a.janelas[1].ocupacao_pct || a.nome.localeCompare(b.nome, "pt-BR"));
  return out;
}

// ───────────────────── 2) DEMANDA DO R&S PARA O T&D ─────────────────────

const DIAS_BERCO_ATENCAO = 15;
const DIAS_BERCO_ALTA = 30;

async function calcularDemandaRS({ empresaId } = {}) {
  const hoje = hojeBahia();
  const filtro = empresaId ? " AND empresa_id = ?" : "";
  let rps = [];
  try {
    [rps] = await pool.query(
      `SELECT id, empresa_id, site, setor, produto, cargo, chamado, status, hcs, hcs_com_to, hcs_aprovados, qtd_entregue,
              hcs_berco, hcs_convocados_berco,
              DATE_FORMAT(inicio_av_tecnica, '%Y-%m-%d') AS inicio_av, DATE_FORMAT(final_av_tecnica, '%Y-%m-%d') AS final_av,
              DATE_FORMAT(data_fechamento_vaga, '%Y-%m-%d') AS fechamento, DATE_FORMAT(created_at, '%Y-%m-%d') AS criado
         FROM rps WHERE excluido_em IS NULL AND status <> 'CANCELADA'${filtro}`,
      empresaId ? [empresaId] : []
    );
  } catch (e) {
    if (!(e && (e.code === "ER_NO_SUCH_TABLE" || e.code === "ER_BAD_FIELD_ERROR"))) throw e;
  }

  // Avaliações Técnicas planejadas pelo R&S × turmas de Avaliação Técnica já agendadas.
  const { nomes } = await nomesAvaliacaoTecnica();
  let turmasAT = [];
  if (nomes.length) {
    [turmasAT] = await pool.query(
      `SELECT t.id, t.tema, t.cliente, t.empresa_id, DATE_FORMAT(COALESCE(t.data_inicio, t.data), '%Y-%m-%d') AS ini
         FROM treinamentos t
        WHERE t.subtipo IN (${nomes.map(() => "?").join(",")}) AND ${NAO_CANCELADA}${empresaId ? " AND t.empresa_id = ?" : ""}
          AND COALESCE(DATE(t.data_inicio), t.data) BETWEEN ? AND ?`,
      [...nomes, ...(empresaId ? [empresaId] : []), somarDias(hoje, -21), somarDias(hoje, 60)]
    );
  }

  const avaliacoes = [];
  for (const r of rps) {
    if (r.setor !== "OPERACIONAL" || r.status !== "EM ANDAMENTO" || !r.inicio_av) continue;
    const dias = diasEntre(hoje, r.inicio_av);
    const emCurso = dias < 0 && r.final_av && r.final_av >= hoje;
    if (!(dias >= 0 && dias <= 30) && !emCurso) continue;
    const candidatas = turmasAT.filter((t) => t.empresa_id === r.empresa_id && Math.abs(diasEntre(r.inicio_av, t.ini)) <= 3);
    const dica = [semAcento(r.produto), semAcento(r.site)].filter((x) => x.length >= 3);
    const parecida = (t) => dica.some((d) => semAcento(t.cliente).includes(d) || semAcento(t.tema).includes(d) || d.includes(semAcento(t.cliente)));
    const par = candidatas.find(parecida) || candidatas[0] || null;
    const semTurma = !par;
    let gravidade = null;
    if (semTurma) gravidade = emCurso || dias <= 3 ? "critica" : dias <= 7 ? "alta" : "media";
    avaliacoes.push({
      rp_id: r.id, site: r.site, produto: r.produto, cargo: r.cargo, chamado: r.chamado,
      inicio: r.inicio_av, final: r.final_av, dias_para_inicio: dias, em_curso: !!emCurso,
      candidatos_esperados: Number(r.hcs_com_to) || Number(r.hcs) || 0,
      situacao: semTurma ? "sem_turma" : "com_turma",
      turma: par ? { id: par.id, tema: par.tema, cliente: par.cliente, data_inicio: par.ini, confere_pelo_nome: parecida(par) } : null,
      gravidade,
    });
  }
  avaliacoes.sort((a, b) => (a.situacao === b.situacao ? a.dias_para_inicio - b.dias_para_inicio : a.situacao === "sem_turma" ? -1 : 1));

  // Berço: gente aprovada que ainda não foi convocada.
  const abertas = rps.filter((r) => r.status === "EM ANDAMENTO" && (Number(r.hcs) - Number(r.qtd_entregue)) > 0);
  const berco = [];
  for (const r of rps) {
    const saldo = (Number(r.hcs_berco) || 0) - (Number(r.hcs_convocados_berco) || 0);
    if (saldo <= 0) continue;
    const ref = r.fechamento || r.criado;
    const parado = Math.max(0, diasEntre(ref, hoje));
    const cargo = semAcento(r.cargo);
    const oportunidades = cargo
      ? abertas.filter((o) => o.id !== r.id && o.empresa_id === r.empresa_id && semAcento(o.cargo) === cargo)
          .sort((a, b) => (a.site === r.site ? -1 : 0) - (b.site === r.site ? -1 : 0))
          .slice(0, 3)
          .map((o) => ({ rp_id: o.id, site: o.site, produto: o.produto, chamado: o.chamado, vagas_abertas: Number(o.hcs) - Number(o.qtd_entregue), mesmo_site: o.site === r.site }))
      : [];
    berco.push({
      rp_id: r.id, site: r.site, produto: r.produto, cargo: r.cargo, chamado: r.chamado, status: r.status,
      saldo_berco: saldo, dias_parado: parado, desde: ref,
      gravidade: parado >= DIAS_BERCO_ALTA ? "alta" : parado >= DIAS_BERCO_ATENCAO ? "media" : null,
      oportunidades,
    });
  }
  berco.sort((a, b) => b.dias_parado - a.dias_parado);

  const resumo = {
    avaliacoes_planejadas: avaliacoes.length,
    avaliacoes_sem_turma: avaliacoes.filter((a) => a.situacao === "sem_turma").length,
    candidatos_sem_turma: avaliacoes.filter((a) => a.situacao === "sem_turma").reduce((s, a) => s + a.candidatos_esperados, 0),
    pessoas_no_berco: berco.reduce((s, b) => s + b.saldo_berco, 0),
    berco_parado: berco.filter((b) => b.gravidade).length,
    berco_com_oportunidade: berco.filter((b) => b.oportunidades.length).length,
  };
  return { hoje, dias_berco_atencao: DIAS_BERCO_ATENCAO, dias_berco_alta: DIAS_BERCO_ALTA, avaliacoes, berco, resumo };
}

module.exports = { calcularCargaFutura, calcularDemandaRS, calcularSalas, carregarEntradas, segundaDe, diasUteisEntre };
