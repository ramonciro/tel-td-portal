/**
 * desempenhoInstrutorResolver.js
 *
 * Motor de cálculo do "scorecard do instrutor" — item 2 da visão de
 * universidade corporativa (ver claude/visao-plataforma-educativa-instrutor-2026-09.md
 * no projeto). Junta, por instrutor e por período (mês ou trimestre), os
 * quatro indicadores que já existem espalhados pelo portal:
 *
 *   - CH programada x realizada (reaproveita capacidadeResolver, sem
 *     recalcular nada — mesma fonte de horas que a tela de Capacidade)
 *   - Frequência das turmas (reaproveita presencaResolver.getResumoPresenca,
 *     mesmo número "taxa_presenca_pessoas" que o Dashboard já mostra)
 *   - Avaliação (nota_prova/nota_qualidade da tabela `avaliacoes`)
 *   - NPS (tabela `avaliacoes_treinandos`, já com o filtro de segurança por
 *     turma/participante corrigido nesta mesma rodada)
 *
 * Nenhuma tabela nova, nenhum lançamento manual novo — é tudo composição do
 * que o portal já registra no uso normal.
 *
 * DUAS RESSALVAS IMPORTANTES, confirmadas com o Ramon em 07/09/2026:
 *
 *   1) O lançamento de avaliação de turma (nota_prova/nota_qualidade) NÃO é
 *      obrigatório hoje — acontece na prática, mas nem todo instrutor
 *      registra. Por isso todo indicador de avaliação vem sempre acompanhado
 *      de uma contagem de cobertura (quantas turmas do instrutor no período
 *      têm avaliação lançada, de quantas turmas ele deu) — quem lança menos
 *      não pode parecer "pior instrutor" só por isso.
 *
 *   2) A tabela `avaliacoes` não tem uma escala fixa para nota_prova/
 *      nota_qualidade — o campo "Nota máx." de cada material avaliativo é
 *      livre (materiais_avaliativos.nota_maxima), e não existe nenhum vínculo
 *      no banco entre uma linha de `avaliacoes` e o material que gerou a
 *      nota. Ou seja, hoje não dá pra normalizar essa nota numa escala
 *      confiável (0–10, 0–100 etc.) pra combinar com frequência (%) e NPS
 *      (-100 a 100) num índice único sem arriscar comparar coisas
 *      diferentes. Por isso o "índice geral" abaixo usa só frequência e NPS
 *      (que têm escala bem definida); a nota de avaliação aparece no
 *      scorecard como indicador informativo à parte, não entra na conta.
 *      Se um dia existir uma escala padronizada (ex.: sempre 0–10, ou nota
 *      sempre normalizada pelo nota_maxima do material), dá pra incluir.
 */

const pool = require("../lib/db");
const {
  listarInstrutoresConhecidos,
  getCapacidadeVsRealizado,
  statusOcupacao,
} = require("./capacidadeResolver");
const { getResumoPresenca } = require("./presencaResolver");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function arredonda(valor, casas = 1) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return null;
  const f = 10 ** casas;
  return Math.round(Number(valor) * f) / f;
}

// Mesma classificação usada no frontend (turma/[id]/nps/page.js e nps/page.js):
// nota >= 9 promotor, >= 7 neutro, senão detrator.
function classificarNps(nota) {
  const n = Number(nota || 0);
  if (n >= 9) return "promotor";
  if (n >= 7) return "neutro";
  return "detrator";
}

function mesesDoTrimestre(ano, trimestre) {
  const mesInicio = (Number(trimestre) - 1) * 3 + 1;
  return [0, 1, 2].map((i) => ({ ano: Number(ano), mes: mesInicio + i }));
}

// Resolve a lista de {ano, mes} do período pedido. periodo "mensal" pede
// ano+mes; "trimestral" pede ano+trimestre (1 a 4). Sem período informado,
// assume o mês/trimestre corrente.
function resolverMesesPeriodo({ periodo, ano, mes, trimestre } = {}) {
  const hoje = new Date();
  const anoRef = ano ? Number(ano) : hoje.getUTCFullYear();

  if (periodo === "trimestral") {
    const trimestreRef = trimestre ? Number(trimestre) : Math.floor(hoje.getUTCMonth() / 3) + 1;
    if (trimestreRef < 1 || trimestreRef > 4) {
      throw new Error("Trimestre inválido (use 1 a 4).");
    }
    return { tipo: "trimestral", ano: anoRef, trimestre: trimestreRef, meses: mesesDoTrimestre(anoRef, trimestreRef) };
  }

  const mesRef = mes ? Number(mes) : hoje.getUTCMonth() + 1;
  if (mesRef < 1 || mesRef > 12) {
    throw new Error("Mês inválido (use 1 a 12).");
  }
  return { tipo: "mensal", ano: anoRef, mes: mesRef, meses: [{ ano: anoRef, mes: mesRef }] };
}

function tenantWhereTreinamentos(empresaId, alias = "t") {
  return empresaId ? ` AND ${alias}.empresa_id = ?` : "";
}

// --- CH (programada x realizada) — soma os meses do período, por instrutor,
//     reaproveitando exatamente o mesmo cálculo da tela de Capacidade. ---
async function getChPorInstrutor({ instrutores, meses, empresaId }) {
  const acumulado = new Map(instrutores.map((nome) => [nome, { horas_realizadas: 0, capacidade_horas: 0 }]));
  for (const { ano, mes } of meses) {
    const itens = await getCapacidadeVsRealizado({ ano, mes, empresaId });
    for (const item of itens) {
      const acc = acumulado.get(item.instrutor);
      if (!acc) continue;
      acc.horas_realizadas += item.horas_realizadas;
      acc.capacidade_horas += item.capacidade_horas;
    }
  }
  const mapa = new Map();
  for (const [instrutor, acc] of acumulado) {
    const horasRealizadas = arredonda(acc.horas_realizadas, 2);
    const capacidadeHoras = arredonda(acc.capacidade_horas, 2);
    const ocupacaoPct = capacidadeHoras > 0 ? arredonda((horasRealizadas / capacidadeHoras) * 100) : null;
    mapa.set(instrutor, {
      horas_realizadas: horasRealizadas,
      capacidade_horas: capacidadeHoras,
      ocupacao_pct: ocupacaoPct,
      ...statusOcupacao(ocupacaoPct),
    });
  }
  return mapa;
}

// --- Avaliação (nota_prova/nota_qualidade) — por instrutor, com cobertura.
//     Cada linha de `avaliacoes` é por treinando (não por turma), então a
//     média é sobre os lançamentos individuais; "cobertura" é sobre turmas
//     (a turma conta como "avaliada" se tiver pelo menos um lançamento). ---
async function getAvaliacaoPorInstrutor({ instrutores, meses, empresaId }) {
  if (!instrutores.length) return new Map();
  const placeholdersInstrutores = instrutores.map(() => "?").join(",");
  const placeholdersMeses = meses.map(() => "(?, ?)").join(",");
  const mesesParams = meses.flatMap((m) => [m.ano, m.mes]);

  const [rows] = await pool.query(
    `
    SELECT
      TRIM(t.instrutor) AS instrutor,
      COUNT(DISTINCT t.id) AS turmas_no_periodo,
      COUNT(DISTINCT a.treinamento_id) AS turmas_com_avaliacao,
      COUNT(a.id) AS lancamentos,
      AVG(a.nota_prova) AS nota_prova_media,
      AVG(a.nota_qualidade) AS nota_qualidade_media
    FROM treinamentos t
    LEFT JOIN avaliacoes a ON a.treinamento_id = t.id
    WHERE TRIM(t.instrutor) IN (${placeholdersInstrutores})
      AND COALESCE(t.data_inicio, t.data) IS NOT NULL
      AND (YEAR(COALESCE(t.data_inicio, t.data)), MONTH(COALESCE(t.data_inicio, t.data))) IN (${placeholdersMeses})
      ${tenantWhereTreinamentos(empresaId)}
    GROUP BY TRIM(t.instrutor)
    `,
    [...instrutores, ...mesesParams, ...(empresaId ? [empresaId] : [])]
  );

  const mapa = new Map();
  for (const r of rows) {
    const turmasNoPeriodo = Number(r.turmas_no_periodo);
    const turmasComAvaliacao = Number(r.turmas_com_avaliacao);
    mapa.set(r.instrutor, {
      turmas_no_periodo: turmasNoPeriodo,
      turmas_com_avaliacao: turmasComAvaliacao,
      cobertura_pct: turmasNoPeriodo > 0 ? arredonda((turmasComAvaliacao / turmasNoPeriodo) * 100) : null,
      lancamentos: Number(r.lancamentos),
      nota_prova_media: r.nota_prova_media != null ? arredonda(r.nota_prova_media, 2) : null,
      nota_qualidade_media: r.nota_qualidade_media != null ? arredonda(r.nota_qualidade_media, 2) : null,
    });
  }
  return mapa;
}

// --- NPS — por instrutor, via avaliacoes_treinandos + treinamentos. ---
async function getNpsPorInstrutor({ instrutores, meses, empresaId }) {
  if (!instrutores.length) return new Map();
  const placeholdersInstrutores = instrutores.map(() => "?").join(",");
  const placeholdersMeses = meses.map(() => "(?, ?)").join(",");
  const mesesParams = meses.flatMap((m) => [m.ano, m.mes]);

  const [rows] = await pool.query(
    `
    SELECT
      TRIM(t.instrutor) AS instrutor,
      at.nota_nps AS nota_nps
    FROM avaliacoes_treinandos at
    JOIN treinamentos t ON t.id = at.treinamento_id
    WHERE TRIM(t.instrutor) IN (${placeholdersInstrutores})
      AND at.nota_nps IS NOT NULL
      AND COALESCE(t.data_inicio, t.data) IS NOT NULL
      AND (YEAR(COALESCE(t.data_inicio, t.data)), MONTH(COALESCE(t.data_inicio, t.data))) IN (${placeholdersMeses})
      ${tenantWhereTreinamentos(empresaId)}
    `,
    [...instrutores, ...mesesParams, ...(empresaId ? [empresaId] : [])]
  );

  const acumulado = new Map(instrutores.map((nome) => [nome, { total: 0, soma: 0, promotores: 0, neutros: 0, detratores: 0 }]));
  for (const r of rows) {
    const acc = acumulado.get(r.instrutor);
    if (!acc) continue;
    const nota = Number(r.nota_nps);
    acc.total += 1;
    acc.soma += nota;
    const classe = classificarNps(nota);
    if (classe === "promotor") acc.promotores += 1;
    else if (classe === "neutro") acc.neutros += 1;
    else acc.detratores += 1;
  }

  const mapa = new Map();
  for (const [instrutor, acc] of acumulado) {
    const npsScore = acc.total > 0
      ? arredonda(((acc.promotores / acc.total) * 100) - ((acc.detratores / acc.total) * 100))
      : null;
    mapa.set(instrutor, {
      total_respostas: acc.total,
      nota_media: acc.total > 0 ? arredonda(acc.soma / acc.total, 2) : null,
      promotores: acc.promotores,
      neutros: acc.neutros,
      detratores: acc.detratores,
      nps_score: npsScore,
    });
  }
  return mapa;
}

// --- Frequência — reaproveita presencaResolver.getResumoPresenca (mesma
//     fonte que o Dashboard), filtra pro período e agrega por instrutor,
//     ponderando pelo tamanho da turma (treinandos confirmados) em vez de
//     média simples entre turmas — turma maior pesa mais no indicador,
//     evitando que uma turma de 2 pessoas valha o mesmo que uma de 40. ---
async function getFrequenciaPorInstrutor({ instrutores, meses, empresaId }) {
  const resumo = await getResumoPresenca({ empresaId });
  const chaveMes = new Set(meses.map((m) => `${m.ano}-${pad2(m.mes)}`));
  const setInstrutores = new Set(instrutores);

  const acumulado = new Map(instrutores.map((nome) => [nome, { somaPonderada: 0, pesoTotal: 0, turmas: 0 }]));

  for (const t of resumo) {
    const nomeInstrutor = String(t.instrutor || "").trim();
    if (!setInstrutores.has(nomeInstrutor)) continue;
    const dataRef = t.data_inicio || t.data;
    if (!dataRef) continue;
    const d = new Date(dataRef);
    if (Number.isNaN(d.getTime())) continue;
    const chave = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
    if (!chaveMes.has(chave)) continue;
    // Só conta turma com chamada de fato lançada (total_realizado > 0) — uma
    // turma "sem_dados" ou com roster importado mas chamada ainda pendente
    // (origem "snapshot", tudo pendente) tem taxa_presenca_pessoas = 0, e
    // contar isso como "0% de frequência" penalizaria o instrutor por uma
    // chamada que a coordenação ainda nem abriu, não por falta dele.
    if (Number(t.total_realizado) <= 0) continue;

    const peso = Math.max(Number(t.treinandos_confirmados) || 0, 1);
    const acc = acumulado.get(nomeInstrutor);
    acc.somaPonderada += Number(t.taxa_presenca_pessoas || 0) * peso;
    acc.pesoTotal += peso;
    acc.turmas += 1;
  }

  const mapa = new Map();
  for (const [instrutor, acc] of acumulado) {
    mapa.set(instrutor, {
      media_pct: acc.pesoTotal > 0 ? arredonda(acc.somaPonderada / acc.pesoTotal) : null,
      turmas_consideradas: acc.turmas,
    });
  }
  return mapa;
}

// Pesos do índice geral — ver ressalva (2) no topo do arquivo sobre por que
// avaliação fica de fora da conta. Ajustado com o Ramon em 07/09/2026 (o
// índice geral ainda não é muito usado por enquanto, então frequência pesa
// bem mais que NPS). Ajustável aqui caso a proporção mude — não é
// lançamento de dado, é constante do código, igual às faixas de ocupação em
// capacidadeResolver.
const PESO_FREQUENCIA = 0.9;
const PESO_NPS = 0.1;

function calcularIndiceGeral({ frequenciaPct, npsScore }) {
  const partes = [];
  if (frequenciaPct !== null && frequenciaPct !== undefined) {
    partes.push({ peso: PESO_FREQUENCIA, valor: frequenciaPct });
  }
  if (npsScore !== null && npsScore !== undefined) {
    // NPS vai de -100 a 100; normaliza pra 0-100 pra ficar na mesma escala da frequência.
    partes.push({ peso: PESO_NPS, valor: (npsScore + 100) / 2 });
  }
  if (!partes.length) return null;
  const pesoTotal = partes.reduce((acc, p) => acc + p.peso, 0);
  const soma = partes.reduce((acc, p) => acc + p.peso * p.valor, 0);
  return arredonda(soma / pesoTotal);
}

async function getScorecardInstrutor({ instrutor, periodo, ano, mes, trimestre, empresaId } = {}) {
  const periodoResolvido = resolverMesesPeriodo({ periodo, ano, mes, trimestre });
  const { meses } = periodoResolvido;

  const instrutores = instrutor ? [instrutor] : await listarInstrutoresConhecidos(empresaId);
  if (!instrutores.length) {
    return { periodo: periodoResolvido, itens: [], medias_time: null };
  }

  const [chMap, avaliacaoMap, npsMap, frequenciaMap] = await Promise.all([
    getChPorInstrutor({ instrutores, meses, empresaId }),
    getAvaliacaoPorInstrutor({ instrutores, meses, empresaId }),
    getNpsPorInstrutor({ instrutores, meses, empresaId }),
    getFrequenciaPorInstrutor({ instrutores, meses, empresaId }),
  ]);

  const itens = instrutores.map((nome) => {
    const ch = chMap.get(nome) || { horas_realizadas: 0, capacidade_horas: 0, ocupacao_pct: null, status: "sem_capacidade", emoji: "—" };
    const avaliacao = avaliacaoMap.get(nome) || { turmas_no_periodo: 0, turmas_com_avaliacao: 0, cobertura_pct: null, lancamentos: 0, nota_prova_media: null, nota_qualidade_media: null };
    const nps = npsMap.get(nome) || { total_respostas: 0, nota_media: null, promotores: 0, neutros: 0, detratores: 0, nps_score: null };
    const frequencia = frequenciaMap.get(nome) || { media_pct: null, turmas_consideradas: 0 };

    return {
      instrutor: nome,
      ch: {
        horas_realizadas: ch.horas_realizadas,
        capacidade_horas: ch.capacidade_horas,
        ocupacao_pct: ch.ocupacao_pct,
        status_ocupacao: ch.status,
        status_emoji: ch.emoji,
      },
      frequencia,
      avaliacao,
      nps,
      indice_geral: calcularIndiceGeral({ frequenciaPct: frequencia.media_pct, npsScore: nps.nps_score }),
    };
  });

  // Só entra no ranking/médias do time quem teve algum dado no período
  // (turma dando aula, presença lançada ou NPS respondido) — instrutor sem
  // nenhuma atividade no período não deveria "zerar" a média do time.
  const comAtividade = itens.filter((i) =>
    i.ch.horas_realizadas > 0 || i.frequencia.turmas_consideradas > 0 || i.nps.total_respostas > 0 || i.avaliacao.turmas_no_periodo > 0
  );

  const ranking = comAtividade
    .filter((i) => i.indice_geral !== null)
    .sort((a, b) => b.indice_geral - a.indice_geral)
    .map((i, idx) => ({ posicao: idx + 1, instrutor: i.instrutor, indice_geral: i.indice_geral }));

  const mapaPosicao = new Map(ranking.map((r) => [r.instrutor, r.posicao]));
  for (const item of itens) {
    item.posicao_no_time = mapaPosicao.get(item.instrutor) || null;
    item.total_no_ranking = ranking.length;
  }

  function media(campo, obterValor) {
    const valores = comAtividade.map(obterValor).filter((v) => v !== null && v !== undefined);
    if (!valores.length) return null;
    return arredonda(valores.reduce((acc, v) => acc + v, 0) / valores.length);
  }

  const mediasTime = comAtividade.length
    ? {
        ocupacao_pct: media("ocupacao_pct", (i) => i.ch.ocupacao_pct),
        frequencia_pct: media("frequencia_pct", (i) => i.frequencia.media_pct),
        nps_score: media("nps_score", (i) => i.nps.nps_score),
        indice_geral: media("indice_geral", (i) => i.indice_geral),
        instrutores_considerados: comAtividade.length,
      }
    : null;

  return { periodo: periodoResolvido, itens, ranking, medias_time: mediasTime };
}

module.exports = {
  getScorecardInstrutor,
  classificarNps,
  resolverMesesPeriodo,
};
