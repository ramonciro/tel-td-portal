/**
 * rotinaAderencia.js — Fase 3 da Rotina do instrutor (16/10/2026)
 *
 * Painel de aderência (coordenação), pendências para o e-mail diário e a
 * Auditoria, e visão mensal de atividades por operação.
 *
 * Não cria regra nova de negócio: lê o que as fases 1 e 2 já gravam
 * (checklist, responsabilidades com prazo, diário de bordo, revisão do plano,
 * avaliação individual registrada) e a importação de provas em papel.
 * Os prazos usam as mesmas funções de lib/rotina.js (prazoDaTarefa,
 * situacaoDaTarefa), para o painel nunca divergir da tela da turma.
 *
 * Aderência por turma = (itens do checklist respondidos + responsabilidades
 * feitas) ÷ (itens do checklist + responsabilidades feitas + responsabilidades
 * vencidas e não feitas) — a mesma fórmula já usada no Desempenho do instrutor.
 */
const pool = require("./db");
const R = require("./rotina");
const { nomesAvaliacaoTecnica } = require("./subtipos");

const chave = (s) => String(s || "").trim().toLowerCase();
const semAcento = (s) => chave(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
const arred1 = (n) => Math.round((Number(n) + Number.EPSILON) * 10) / 10;

const DIAS_RASCUNHO_PAPEL = 3; // importação de prova em papel parada em rascunho
const DIAS_AVALIACAO_VERMELHO = 2; // avaliação individual não registrada após o fim da turma
const DIARIO_AMARELO = 1; // dias sem diário (antes de hoje)
const DIARIO_VERMELHO = 3;
const NAO_INICIADA_VERMELHO = 2; // dias desde o início da turma sem abrir a rotina

const ROTULO_RITMO = { "vídeo": "Vídeo", "card (feed do lorni)": "Card (feed do Lorni)" };
const SEV = { vermelho: 2, amarelo: 1 };

function mesParaIntervalo(mes) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes || ""));
  const hoje = R.hojeBR();
  const ym = m ? `${m[1]}-${m[2]}` : hoje.slice(0, 7);
  const ano = Number(ym.slice(0, 4));
  const mm = Number(ym.slice(5, 7));
  const ultimo = new Date(Date.UTC(ano, mm, 0)).getUTCDate();
  return { mes: ym, de: `${ym}-01`, ate: `${ym}-${String(ultimo).padStart(2, "0")}` };
}

const placeholders = (arr) => arr.map(() => "?").join(",");

function diasUteisEntre(ini, fim, limite = 120) {
  const dias = [];
  if (!ini || !fim) return dias;
  let d = ini;
  while (d <= fim && dias.length < limite) {
    const dow = new Date(d + "T12:00:00Z").getUTCDay();
    if (dow !== 0 && dow !== 6) dias.push(d);
    d = R.somarDias(d, 1);
  }
  return dias;
}

/**
 * Turmas do recorte com os indicadores da rotina.
 * @param {{empresaId:number|null, de:string, ate:string, cliente?:string, instrutor?:string, podeVer?:(t:object)=>boolean}} opt
 */
async function calcularTurmas({ empresaId, de, ate, cliente, instrutor, podeVer }) {
  const hoje = R.hojeBR();
  const { nomes: nomesAvTec } = await nomesAvaliacaoTecnica();
  const chavesAvTec = new Set(nomesAvTec.map(semAcento));

  const where = [
    "COALESCE(DATE(t.data_inicio), t.data) <= ?",
    "COALESCE(DATE(t.data_fim), DATE(t.data_inicio), t.data) >= ?",
    "LOWER(COALESCE(t.status,'')) NOT LIKE 'cancel%'",
  ];
  const params = [ate, de];
  if (empresaId) { where.push("t.empresa_id = ?"); params.push(empresaId); }
  if (cliente) { where.push("t.cliente = ?"); params.push(cliente); }
  const [turmasBrutas] = await pool.query(
    `SELECT t.id, t.tema, t.cliente, t.instrutor, t.subtipo, t.status, t.data, t.data_inicio, t.data_fim, t.empresa_id
       FROM treinamentos t WHERE ${where.join(" AND ")} ORDER BY COALESCE(t.data_inicio, t.data), t.id`,
    params
  );
  let turmas = turmasBrutas;
  if (instrutor) turmas = turmas.filter((t) => chave(t.instrutor) === chave(instrutor));
  if (podeVer) turmas = turmas.filter((t) => podeVer(t));
  if (!turmas.length) return [];

  const ids = turmas.map((t) => t.id);
  const inIds = placeholders(ids);
  const consulta = async (sql, extra = []) => {
    try {
      const [rows] = await pool.query(sql, [...ids, ...extra]);
      return rows;
    } catch (e) {
      if (e && e.code === "ER_NO_SUCH_TABLE") return [];
      throw e;
    }
  };

  const [aulas, chk, tarefas, diario, marcas, registros, avaliacoes, papel, parts] = await Promise.all([
    consulta(`SELECT treinamento_id, data_aula FROM turma_aulas WHERE treinamento_id IN (${inIds})`),
    consulta(`SELECT treinamento_id, COUNT(*) AS total, SUM(resposta IS NOT NULL) AS resp
                FROM rotina_checklist WHERE treinamento_id IN (${inIds}) GROUP BY treinamento_id`),
    consulta(`SELECT * FROM rotina_tarefas WHERE treinamento_id IN (${inIds})`),
    consulta(`SELECT treinamento_id, data_dia, texto FROM rotina_diario WHERE treinamento_id IN (${inIds})`),
    consulta(`SELECT x.treinamento_id, x.catalogo_id
                FROM rotina_turma_atividades x
               WHERE x.treinamento_id IN (${inIds})`),
    consulta(`SELECT r.treinamento_id, r.catalogo_id FROM rotina_atividades_registros r WHERE r.treinamento_id IN (${inIds})`),
    consulta(`SELECT treinamento_id FROM rotina_avaliacao_registro WHERE treinamento_id IN (${inIds})`),
    consulta(`SELECT treinamento_id, DATEDIFF(CURDATE(), DATE(criado_em)) AS dias
                FROM prova_papel_lotes WHERE treinamento_id IN (${inIds}) AND status = 'rascunho'`),
    consulta(`SELECT treinamento_id, COUNT(*) AS n FROM treinamento_participantes WHERE treinamento_id IN (${inIds}) GROUP BY treinamento_id`),
  ]);

  // catálogo: quais atividades têm prazo ao concluir a turma (revisão do plano)
  const catIds = [...new Set(marcas.map((m) => Number(m.catalogo_id)).filter((x) => x > 0))];
  let revisaoIds = new Set();
  if (catIds.length) {
    try {
      const [cat] = await pool.query(
        `SELECT id FROM rotina_atividades_catalogo WHERE id IN (${placeholders(catIds)}) AND tem_prazo_fim_turma = 1`,
        catIds
      );
      revisaoIds = new Set(cat.map((c) => Number(c.id)));
    } catch (e) {
      if (!(e && e.code === "ER_NO_SUCH_TABLE")) throw e;
    }
  }

  const porTurma = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const k = Number(r.treinamento_id);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  };
  const aulasP = porTurma(aulas);
  const chkP = new Map(chk.map((c) => [Number(c.treinamento_id), c]));
  const tarP = porTurma(tarefas);
  const diaP = porTurma(diario);
  const marcaP = porTurma(marcas);
  const regP = porTurma(registros);
  const avalSet = new Set(avaliacoes.map((a) => Number(a.treinamento_id)));
  const papelP = porTurma(papel);
  const partP = new Map(parts.map((p) => [Number(p.treinamento_id), Number(p.n)]));

  const linhas = [];
  for (const t of turmas) {
    const avTec = chavesAvTec.has(semAcento(t.subtipo));
    const aulasT = aulasP.get(t.id) || [];
    const iniT = R.isoDia(t.data_inicio) || R.isoDia(t.data);
    const fimT = R.isoDia(t.data_fim) || iniT;
    const inicio = (aulasT.length && aulasT.map((a) => R.isoDia(a.data_aula)).sort()[0]) || iniT;
    const fimAula = aulasT.length ? aulasT.map((a) => R.isoDia(a.data_aula)).sort().slice(-1)[0] : fimT;
    const fim = fimAula && inicio && fimAula < inicio ? inicio : fimAula;
    const datas = { inicio, fim };

    const pend = [];
    const add = (tipo, sev, texto, dias = 0) => pend.push({ tipo, severidade: sev, texto, dias_atraso: dias });

    const c = chkP.get(t.id);
    const checkTotal = c ? Number(c.total) : 0;
    const checkResp = c ? Number(c.resp || 0) : 0;
    const tarT = tarP.get(t.id) || [];
    const rotinaAberta = checkTotal > 0 || tarT.length > 0;

    let tarFeitas = 0;
    let vencidasNaoFeitas = 0;
    const atrasadas = [];
    const vencendo = [];
    for (const x of tarT) {
      const feito = Number(x.feito) === 1;
      if (feito) { tarFeitas += 1; continue; }
      const prazo = R.prazoDaTarefa(x, datas);
      const s = R.situacaoDaTarefa({ ...x, feito }, prazo, hoje);
      if (s.situacao === "atrasada") { vencidasNaoFeitas += 1; atrasadas.push({ item: x.item, prazo, dias_atraso: s.dias_atraso }); }
      else if (s.situacao === "vence_hoje" || s.situacao === "vence_amanha") vencendo.push({ item: x.item, prazo, situacao: s.situacao });
    }

    const num = checkResp + tarFeitas;
    const den = checkTotal + tarFeitas + vencidasNaoFeitas;
    let aderencia = den > 0 ? arred1((num / den) * 100) : null;
    let naoIniciada = false;

    if (avTec) {
      if (!rotinaAberta && inicio && hoje > inicio) {
        const dias = R.diffDias(hoje, inicio);
        add("rotina_nao_iniciada", dias >= NAO_INICIADA_VERMELHO ? "vermelho" : "amarelo",
          "A rotina da turma ainda não foi aberta (checklist e responsabilidades sem preenchimento).", dias);
        aderencia = 0;
        naoIniciada = true;
      }
      if (atrasadas.length) {
        const max = Math.max(...atrasadas.map((a) => a.dias_atraso));
        add("tarefa_atrasada", "vermelho",
          `${atrasadas.length} responsabilidade(s) atrasada(s): ${atrasadas.slice(0, 3).map((a) => a.item).join(", ")}${atrasadas.length > 3 ? " e mais " + (atrasadas.length - 3) : ""}.`, max);
      }
      if (vencendo.length) {
        add("tarefa_vencendo", "amarelo",
          `Vence hoje ou amanhã: ${vencendo.slice(0, 3).map((a) => a.item).join(", ")}${vencendo.length > 3 ? " e mais " + (vencendo.length - 3) : ""}.`);
      }
      if (rotinaAberta && inicio && hoje >= inicio && checkTotal > 0 && checkResp === 0 && hoje > R.somarDias(inicio, 1)) {
        add("checklist_vazio", "amarelo", "Nenhum item do checklist foi respondido.", R.diffDias(hoje, inicio));
      }
    }

    // diário de bordo (Av. Técnica): dias da turma já passados sem texto
    let diarioInfo = null;
    if (avTec && inicio) {
      const dias = aulasT.length
        ? [...new Set(aulasT.map((a) => R.isoDia(a.data_aula)))].sort()
        : diasUteisEntre(inicio, fim);
      const passados = dias.filter((d) => d < hoje);
      const comTexto = new Set((diaP.get(t.id) || []).filter((d) => String(d.texto || "").trim()).map((d) => R.isoDia(d.data_dia)));
      const registrados = passados.filter((d) => comTexto.has(d)).length;
      const faltando = passados.length - registrados;
      diarioInfo = { passados: passados.length, registrados, faltando };
      if (faltando >= DIARIO_AMARELO) {
        add("diario_faltando", faltando >= DIARIO_VERMELHO ? "vermelho" : "amarelo",
          `Diário de bordo sem registro em ${faltando} dia(s) já passado(s).`, faltando);
      }
    }

    // revisão do plano de aula (qualquer modelo, quando marcada na turma)
    let revisao = null;
    const marcasT = marcaP.get(t.id) || [];
    const catRev = marcasT.map((m) => Number(m.catalogo_id)).find((id) => revisaoIds.has(id));
    if (catRev) {
      const feita = (regP.get(t.id) || []).some((r) => Number(r.catalogo_id) === catRev);
      const prazo = fim ? R.somarDias(fim, R.REVISAO_PRAZO_DIAS, true) : null;
      const dias = prazo ? R.diffDias(hoje, prazo) : null;
      let farol = "neutro";
      if (feita) farol = "verde";
      else if (prazo && fim && hoje >= fim) farol = dias > 0 ? "vermelho" : "amarelo";
      revisao = { feita, prazo, farol, dias_atraso: dias > 0 && !feita ? dias : 0 };
      if (farol === "vermelho") add("revisao_plano", "vermelho", "Revisão do plano de aula atrasada.", dias);
      else if (farol === "amarelo") add("revisao_plano", "amarelo", "Revisão do plano de aula a fazer (prazo no fim da turma).", 0);
    }

    // avaliação individual (Av. Técnica) após o fim da turma
    let avaliacao = null;
    if (avTec) {
      const registrada = avalSet.has(t.id);
      const temCandidatos = (partP.get(t.id) || 0) > 0;
      const encerrada = !!fim && hoje > fim;
      avaliacao = { registrada, pendente: !registrada && temCandidatos && encerrada };
      if (avaliacao.pendente) {
        const dias = R.diffDias(hoje, fim);
        add("avaliacao_pendente", dias >= DIAS_AVALIACAO_VERMELHO ? "vermelho" : "amarelo",
          "Avaliação individual dos candidatos ainda não registrada.", dias);
      }
    }

    // provas em papel paradas em rascunho
    const rasc = (papelP.get(t.id) || []).filter((p) => Number(p.dias) >= DIAS_RASCUNHO_PAPEL);
    if (rasc.length) {
      const maxD = Math.max(...rasc.map((p) => Number(p.dias)));
      add("prova_papel_rascunho", "amarelo",
        `${rasc.length} importação(ões) de prova em papel parada(s) em rascunho há ${maxD} dia(s).`, maxD);
    }

    pend.sort((a, b) => SEV[b.severidade] - SEV[a.severidade] || b.dias_atraso - a.dias_atraso);
    let farol = "verde";
    if (pend.some((p) => p.severidade === "vermelho")) farol = "vermelho";
    else if (pend.length) farol = "amarelo";
    if (!pend.length && inicio && inicio > hoje) farol = "cinza";

    linhas.push({
      id: t.id, tema: t.tema, cliente: t.cliente, instrutor: t.instrutor || null, subtipo: t.subtipo || null,
      modo: avTec ? "avaliacao_tecnica" : "formacao_continuada", status: t.status || null,
      inicio, fim, farol,
      rotina_aberta: rotinaAberta,
      checklist: { respondidos: checkResp, total: checkTotal },
      tarefas: { feitas: tarFeitas, total: tarT.length, atrasadas: atrasadas.length, vencendo: vencendo.length },
      diario: diarioInfo, revisao, avaliacao,
      provas_papel_rascunho: rasc.length,
      aderencia_pct: aderencia,
      pendencias: pend,
      // Rotina nunca aberta conta como 0% no resumo do instrutor (peso de 1 item, já que ainda não há itens).
      _num: avTec ? num : 0,
      _den: avTec ? (naoIniciada ? Math.max(den, 1) : den) : 0,
    });
  }
  return linhas;
}

function resumirInstrutores(turmas) {
  const mapa = new Map();
  for (const t of turmas) {
    const nome = String(t.instrutor || "").trim() || "Sem instrutor";
    const a = mapa.get(nome) || { instrutor: nome, turmas: 0, num: 0, den: 0, vermelhas: 0, amarelas: 0, verdes: 0, pendencias: 0 };
    a.turmas += 1;
    a.num += t._num;
    a.den += t._den;
    if (t.farol === "vermelho") a.vermelhas += 1;
    else if (t.farol === "amarelo") a.amarelas += 1;
    else if (t.farol === "verde") a.verdes += 1;
    a.pendencias += t.pendencias.length;
    mapa.set(nome, a);
  }
  return [...mapa.values()]
    .map((a) => ({
      instrutor: a.instrutor, turmas: a.turmas, vermelhas: a.vermelhas, amarelas: a.amarelas, verdes: a.verdes,
      pendencias: a.pendencias, aderencia_pct: a.den > 0 ? arred1((a.num / a.den) * 100) : null,
    }))
    .sort((x, y) => y.vermelhas - x.vermelhas || y.pendencias - x.pendencias || x.instrutor.localeCompare(y.instrutor, "pt-BR"));
}

/** Atividades do mês por operação (cliente), com a referência de ritmo (não é meta). */
async function atividadesPorOperacao({ empresaId, de, ate, cliente, instrutor, clientesComTurma = [] }) {
  const where = ["r.data_atividade BETWEEN ? AND ?"];
  const params = [de, ate];
  if (empresaId) { where.push("r.empresa_id = ?"); params.push(empresaId); }
  if (cliente) { where.push("r.cliente = ?"); params.push(cliente); }
  if (instrutor) { where.push("TRIM(r.instrutor) = ?"); params.push(String(instrutor).trim()); }
  let rows = [];
  try {
    [rows] = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(r.cliente),''), 'Sem operação') AS cliente, r.tipo_nome, COUNT(*) AS qtd, SUM(r.minutos) AS minutos
         FROM rotina_atividades_registros r WHERE ${where.join(" AND ")}
        GROUP BY COALESCE(NULLIF(TRIM(r.cliente),''), 'Sem operação'), r.tipo_nome`,
      params
    );
  } catch (e) {
    if (!(e && e.code === "ER_NO_SUCH_TABLE")) throw e;
  }
  const porCli = new Map();
  const garantir = (nome) => {
    if (!porCli.has(nome)) porCli.set(nome, { cliente: nome, horas: 0, atividades_qtd: 0, por_tipo: [] });
    return porCli.get(nome);
  };
  for (const r of rows) {
    const o = garantir(r.cliente);
    const h = Number(r.minutos || 0) / 60;
    o.horas += h;
    o.atividades_qtd += Number(r.qtd);
    o.por_tipo.push({ tipo: r.tipo_nome, qtd: Number(r.qtd), horas: Number(h.toFixed(2)) });
  }
  if (!instrutor) clientesComTurma.forEach((c) => c && garantir(c));
  const lista = [...porCli.values()].map((o) => {
    o.horas = Number(o.horas.toFixed(2));
    o.por_tipo.sort((a, b) => b.horas - a.horas);
    o.ritmo = Object.entries(R.RITMO_REFERENCIA).map(([tipoChave, ref]) => {
      const qtd = o.por_tipo.filter((p) => chave(p.tipo) === tipoChave).reduce((s, p) => s + p.qtd, 0);
      return { tipo: ROTULO_RITMO[tipoChave] || tipoChave, referencia: ref.texto, qtd, abaixo: qtd < ref.qtd };
    });
    return o;
  });
  return lista.sort((a, b) => b.horas - a.horas || a.cliente.localeCompare(b.cliente, "pt-BR"));
}

/** Pendências abertas da rotina (turmas dos últimos 45 dias até hoje). Usado no e-mail diário e na Auditoria. */
async function getPendenciasRotina({ empresaId, podeVer, instrutor } = {}) {
  const hoje = R.hojeBR();
  const turmas = await calcularTurmas({ empresaId, de: R.somarDias(hoje, -45), ate: hoje, podeVer, instrutor });
  const itens = [];
  for (const t of turmas) {
    for (const p of t.pendencias) {
      itens.push({
        turma_id: t.id, tema: t.tema, cliente: t.cliente, instrutor: t.instrutor,
        tipo: p.tipo, severidade: p.severidade, texto: p.texto, dias_atraso: p.dias_atraso,
      });
    }
  }
  itens.sort((a, b) => SEV[b.severidade] - SEV[a.severidade] || b.dias_atraso - a.dias_atraso);
  return {
    total: itens.length,
    vermelhas: itens.filter((i) => i.severidade === "vermelho").length,
    amarelas: itens.filter((i) => i.severidade === "amarelo").length,
    itens,
  };
}

module.exports = {
  mesParaIntervalo, calcularTurmas, resumirInstrutores, atividadesPorOperacao, getPendenciasRotina,
  DIAS_RASCUNHO_PAPEL,
};
