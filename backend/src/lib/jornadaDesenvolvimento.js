/**
 * jornadaDesenvolvimento.js — cálculo do desenvolvimento de cada pessoa nas
 * Jornadas (Fase 2, 16/10/2026): status e avaliação por etapa, horas por
 * etapa, % da jornada e anotações de evolução.
 *
 * Reaproveita as regras de presença da Fase 1 (totaisDaPessoa do
 * jornadaPresencaController): justificado não soma horas e fica fora do %,
 * % = presentes ÷ (presentes + ausentes), farol contra o mínimo da jornada,
 * horas = soma da carga dos encontros em que a pessoa esteve presente. Não há
 * ajuste manual de horas (decisão do Ramon, 16/10/2026): as horas vêm só da
 * presença, iguais em grade, KPIs, MPT e Perfil 360.
 *
 * Usado pelo jornadaDesenvolvimentoController (matriz e painel da pessoa) e
 * pelo Perfil 360 (pessoasController). Isolamento: sempre parte da jornada
 * (empresa_id é conferido por quem chama).
 */
const db = require("./db");
const { _totaisDaPessoa: totaisDaPessoa } = require("../controllers/jornadaPresencaController");

const STATUS_ETAPA = ["nao_iniciada", "em_andamento", "concluida"];
const AVALIACOES = ["atingiu", "parcial", "nao_atingiu"];
const TIPOS_EVOLUCAO = ["ponto_forte", "dificuldade", "plano_acao", "geral"];

function hojeBahia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
}

function arred(v, casas = 1) {
  if (v === null || v === undefined) return null;
  const f = 10 ** casas;
  return Math.round(Number(v) * f) / f;
}

function etapaCancelada(status) {
  return ["cancelada", "cancelado"].includes(String(status || "").trim().toLowerCase());
}

function normalizarNome(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Acha a etapa da jornada pelo nome (igual ou contido), a partir de textos do
// encontro. Devolve o id só quando há exatamente UMA etapa candidata.
function etapaPeloNome(etapas, textos) {
  const achadas = new Set();
  for (const bruto of textos) {
    const t = normalizarNome(bruto);
    if (t.length < 4) continue;
    for (const et of etapas) {
      const n = normalizarNome(et.nome);
      if (n.length < 4) continue;
      if (n === t || n.includes(t) || t.includes(n)) achadas.add(et.id);
    }
  }
  return achadas.size === 1 ? Array.from(achadas)[0] : null;
}

// Sugestão de status da etapa para UMA pessoa, a partir da presença nos
// encontros dessa etapa: concluída quando todos os encontros já aconteceram,
// todos foram lançados e a presença atinge o mínimo; em andamento quando há
// algum lançamento; sem sugestão caso contrário. A decisão final é da Metodologia.
function sugerirStatus(encontrosDaEtapa, totais, minimo, hoje) {
  if (!encontrosDaEtapa.length) return null;
  const lancados = totais.presentes + totais.ausentes + totais.justificados;
  const todosRealizados = encontrosDaEtapa.every((e) => e.data <= hoje);
  if (todosRealizados && totais.pendentes === 0 && totais.pct_presenca !== null && totais.pct_presenca >= minimo) {
    return "concluida";
  }
  if (lancados > 0) return "em_andamento";
  return null;
}

/**
 * @param {object} jornada  { id, presenca_minima_pct, meta_horas, periodicidade_meses }
 * @param {object} [opcoes]
 * @param {number} [opcoes.participanteId] limita a um participante
 * @param {boolean} [opcoes.incluirAvaliacao=true] false → nota/avaliação/observação saem como null
 * @param {boolean} [opcoes.incluirEvolucao=true]  false → sem anotações de evolução
 */
async function calcularDesenvolvimento(jornada, opcoes = {}) {
  const { participanteId = null, incluirAvaliacao = true, incluirEvolucao = true } = opcoes;
  const hoje = hojeBahia();
  const config = {
    presenca_minima_pct: Number(jornada.presenca_minima_pct ?? 75),
    meta_horas: jornada.meta_horas === null || jornada.meta_horas === undefined ? null : Number(jornada.meta_horas),
    periodicidade_meses: jornada.periodicidade_meses === null || jornada.periodicidade_meses === undefined ? null : Number(jornada.periodicidade_meses),
  };

  const filtroPart = participanteId ? " AND jp.id = ?" : "";
  const paramsPart = participanteId ? [jornada.id, participanteId] : [jornada.id];

  const [[etapasBrutas], [encontrosBrutos], [participantes]] = await Promise.all([
    db.query(
      `SELECT id, nome, ordem, status, carga_horaria_prevista
       FROM jornadas_etapas WHERE jornada_id = ? ORDER BY ordem ASC, id ASC`,
      [jornada.id]
    ),
    db.query(
      `SELECT je.id, je.etapa_id, je.titulo, DATE_FORMAT(je.data, '%Y-%m-%d') AS data, je.carga_horaria,
              te.titulo AS trilha_etapa_titulo
       FROM jornada_encontros je
       LEFT JOIN trilha_etapas te ON te.id = je.trilha_etapa_id
       WHERE je.jornada_id = ? ORDER BY je.data ASC, je.hora_inicio ASC, je.id ASC`,
      [jornada.id]
    ),
    db.query(
      `SELECT jp.id, jp.nome, jp.matricula, jp.turma, jp.cargo, jp.supervisor, jp.status_jornada, jp.pessoa_id
       FROM jornada_participantes jp WHERE jp.jornada_id = ?${filtroPart} ORDER BY jp.nome ASC, jp.id ASC`,
      paramsPart
    ),
  ]);

  const etapas = etapasBrutas
    .filter((e) => !etapaCancelada(e.status))
    .map((e) => ({
      id: e.id,
      nome: e.nome,
      ordem: e.ordem,
      carga_horaria_prevista: Number(e.carga_horaria_prevista || 0),
    }));
  const idsEtapas = new Set(etapas.map((e) => e.id));
  const encontros = encontrosBrutos.map((e) => ({ ...e, carga_horaria: Number(e.carga_horaria) }));
  const encontrosPorEtapa = new Map();
  const encontrosSemEtapa = [];
  const todasIdsEtapas = new Set(etapasBrutas.map((x) => x.id));
  for (const e of encontros) {
    let etapaId = e.etapa_id && idsEtapas.has(e.etapa_id) ? e.etapa_id : null;
    let vinculo = etapaId ? "direto" : null;
    // Encontro sem a "etapa (porto) da jornada" (campo vazio ou apontando para uma etapa
    // que não existe mais nesta jornada): tenta achar pelo nome da etapa da trilha / título
    // do encontro. Só vale quando há UMA etapa candidata. Etapa cancelada não é remapeada.
    const etapaCanceladaDoEncontro = e.etapa_id && todasIdsEtapas.has(e.etapa_id) && !idsEtapas.has(e.etapa_id);
    if (!etapaId && !etapaCanceladaDoEncontro) {
      const candidata = etapaPeloNome(etapas, [e.trilha_etapa_titulo, e.titulo]);
      if (candidata) {
        etapaId = candidata;
        vinculo = "inferido";
      }
    }
    e.vinculo_etapa = vinculo;
    if (etapaId) {
      if (!encontrosPorEtapa.has(etapaId)) encontrosPorEtapa.set(etapaId, []);
      encontrosPorEtapa.get(etapaId).push(e);
    }
    if (vinculo !== "direto") {
      encontrosSemEtapa.push({
        id: e.id,
        titulo: e.titulo,
        data: e.data,
        carga_horaria: e.carga_horaria,
        trilha_etapa_titulo: e.trilha_etapa_titulo || null,
        motivo: !e.etapa_id ? "sem_etapa" : etapaCanceladaDoEncontro ? "etapa_cancelada" : "etapa_inexistente",
        etapa_inferida_id: vinculo === "inferido" ? etapaId : null,
        etapa_inferida_nome: vinculo === "inferido" ? (etapas.find((x) => x.id === etapaId) || {}).nome || null : null,
      });
    }
  }

  const ids = participantes.map((p) => p.id);
  let presencas = [];
  let linhasEtapa = [];
  let notas = [];
  if (ids.length) {
    [[presencas], [linhasEtapa], [notas]] = await Promise.all([
      db.query(
        `SELECT p.encontro_id, p.participante_id, p.situacao
         FROM jornada_presencas p JOIN jornada_encontros e ON e.id = p.encontro_id
         WHERE e.jornada_id = ? AND p.participante_id IN (?)`,
        [jornada.id, ids]
      ),
      db.query(
        `SELECT participante_id, etapa_id, status, DATE_FORMAT(data_conclusao, '%Y-%m-%d') AS data_conclusao,
                avaliacao, nota, observacao, updated_at
         FROM jornada_participante_etapas WHERE participante_id IN (?)`,
        [ids]
      ),
      incluirEvolucao
        ? db.query(
            `SELECT id, participante_id, DATE_FORMAT(data, '%Y-%m-%d') AS data, tipo, texto, criado_por_nome, created_at
             FROM jornada_evolucao_notas WHERE participante_id IN (?) ORDER BY data DESC, id DESC`,
            [ids]
          )
        : Promise.resolve([[]]),
    ]);
  }

  const situacaoPorPessoa = new Map();
  for (const p of presencas) {
    if (!situacaoPorPessoa.has(p.participante_id)) situacaoPorPessoa.set(p.participante_id, new Map());
    situacaoPorPessoa.get(p.participante_id).set(p.encontro_id, p.situacao);
  }
  const linhaPorPar = new Map();
  for (const l of linhasEtapa) {
    if (idsEtapas.has(l.etapa_id)) linhaPorPar.set(`${l.participante_id}:${l.etapa_id}`, l);
  }
  const notasPorPessoa = new Map();
  for (const n of notas) {
    if (!notasPorPessoa.has(n.participante_id)) notasPorPessoa.set(n.participante_id, []);
    notasPorPessoa.get(n.participante_id).push(n);
  }

  const cargaPrevista = etapas.reduce((a, e) => a + e.carga_horaria_prevista, 0);
  const configEtapa = { ...config, meta_horas: null, periodicidade_meses: null };

  const resultado = participantes.map((p) => {
    const mapa = situacaoPorPessoa.get(p.id) || new Map();
    const t = totaisDaPessoa(encontros, mapa, config, hoje);

    const porEtapa = {};
    let concluidas = 0;
    for (const et of etapas) {
      const lista = encontrosPorEtapa.get(et.id) || [];
      const te = totaisDaPessoa(lista, mapa, configEtapa, hoje);
      const linha = linhaPorPar.get(`${p.id}:${et.id}`) || null;
      const status = linha ? linha.status : "nao_iniciada";
      if (status === "concluida") concluidas += 1;
      porEtapa[et.id] = {
        lancado: !!linha,
        status,
        data_conclusao: linha ? linha.data_conclusao : null,
        avaliacao: incluirAvaliacao && linha ? linha.avaliacao : null,
        nota: incluirAvaliacao && linha && linha.nota !== null ? Number(linha.nota) : null,
        observacao: incluirAvaliacao && linha ? linha.observacao : null,
        atualizado_em: linha ? linha.updated_at : null,
        encontros: lista.length,
        horas: te.horas,
        presentes: te.presentes,
        justificados: te.justificados,
        ausentes: te.ausentes,
        pendentes: te.pendentes,
        pct_presenca: te.pct_presenca,
        farol: te.farol,
        sugestao: sugerirStatus(lista, te, config.presenca_minima_pct, hoje),
      };
    }

    const pctHoras = cargaPrevista > 0 ? Math.min(100, arred((t.horas / cargaPrevista) * 100, 1)) : null;
    const pctEtapas = etapas.length ? arred((concluidas / etapas.length) * 100, 1) : null;
    const lista = notasPorPessoa.get(p.id) || [];

    return {
      id: p.id,
      pessoa_id: p.pessoa_id,
      nome: p.nome,
      matricula: p.matricula,
      turma: p.turma,
      cargo: p.cargo,
      supervisor: p.supervisor,
      status_jornada: p.status_jornada,
      horas: t.horas,
      presentes: t.presentes,
      justificados: t.justificados,
      ausentes: t.ausentes,
      pendentes: t.pendentes,
      pct_presenca: t.pct_presenca,
      farol: t.farol,
      meta_pct: t.meta_pct,
      atingiu_meta: t.atingiu_meta,
      etapas: porEtapa,
      concluidas,
      total_etapas: etapas.length,
      pct_etapas: pctEtapas,
      pct_horas: pctHoras,
      // % da jornada: horas realizadas ÷ carga prevista das etapas; sem carga
      // prevista cadastrada, usa etapas concluídas ÷ etapas.
      pct_jornada: pctHoras !== null ? pctHoras : pctEtapas,
      base_pct_jornada: pctHoras !== null ? "horas" : pctEtapas !== null ? "etapas" : null,
      evolucao_total: lista.length,
      ultima_evolucao: lista.length ? lista[0].data : null,
      evolucao: incluirEvolucao ? lista : undefined,
    };
  });

  return { config, hoje, carga_prevista: cargaPrevista, etapas, participantes: resultado, encontros_sem_etapa: encontrosSemEtapa };
}

module.exports = {
  STATUS_ETAPA,
  AVALIACOES,
  TIPOS_EVOLUCAO,
  calcularDesenvolvimento,
  hojeBahia,
  etapaCancelada,
};
