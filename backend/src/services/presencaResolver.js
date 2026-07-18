// presencaResolver.js
//
// Fonte única de verdade para presença e status de turma, usada tanto pelo
// Dashboard quanto pelo endpoint /api/presenca-resumo (Gestão de Turmas).
//
// Prioridade de fonte de presença, por treinamento:
//   1) Cronograma (turma_aulas + presenca_aulas) — sistema mais novo e granular.
//   2) Legado (presencas) — usado quando não há cronograma, ou quando o
//      cronograma existe mas ainda não tem nenhum lançamento real e o legado
//      tem dados (evita mostrar 0% só porque a chamada não foi aberta ainda).
//   3) Snapshot (treinamento_participantes.status_presenca) — só quando não
//      existe NENHUM histórico (nem cronograma nem legado), como fallback
//      final para turmas com roster importado mas sem nenhuma chamada feita.
//
// Cada fonte multi-registro (cronograma e legado) é resolvida em dois níveis:
//   - por REGISTRO (cada linha de chamada lançada) — usado para "taxa de
//     execução" (quanto da chamada já foi lançado) e para a "taxa de
//     frequência" mostrada na Gestão de Turmas, que já era assim antes desta
//     mudança e continua exatamente igual.
//   - por PARTICIPANTE (classificando cada pessoa como presente/ausente a
//     partir do conjunto de dias dela, com corte de 75%) — usado para os
//     KPIs de cabeça-de-pessoa do Dashboard (comparáveis entre turmas,
//     clientes e instrutores), para não misturar "quantidade de registros"
//     com "quantidade de pessoas" na mesma métrica.

const pool = require("../lib/db");

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function pct(numerador, denominador) {
  if (!denominador) return 0;
  return Math.round((numerador / denominador) * 100);
}

// Classifica UM participante a partir do total de dias/aulas dele numa fonte.
// justificado não conta contra a pessoa; pendente não entra na conta.
function classificarParticipante({ presente, ausente, justificado }) {
  const computaveis = presente + ausente;
  if (computaveis === 0) {
    return justificado > 0 ? "justificado" : "pendente";
  }
  return presente / computaveis >= 0.75 ? "presente" : "ausente";
}

// Agrega uma tabela de presença (presencas OU presenca_aulas) em dois níveis:
// por participante (pra classificação de cabeça-de-pessoa) e por registro
// (pra taxa de execução/frequência real).
async function agregarFontePresenca(tabela) {
  const [linhasPorParticipante] = await pool.query(`
    SELECT
      treinamento_id,
      treinando_nome,
      SUM(CASE WHEN status = 'presente' THEN 1 ELSE 0 END) AS presente,
      SUM(CASE WHEN status = 'ausente' THEN 1 ELSE 0 END) AS ausente,
      SUM(CASE WHEN status = 'justificado' THEN 1 ELSE 0 END) AS justificado,
      SUM(CASE WHEN status IS NULL OR status = '' OR status = 'pendente' THEN 1 ELSE 0 END) AS pendente
    FROM ${tabela}
    GROUP BY treinamento_id, treinando_nome
  `);

  const porTreinamento = new Map();

  for (const linha of linhasPorParticipante) {
    const treinamentoId = Number(linha.treinamento_id);
    if (!porTreinamento.has(treinamentoId)) {
      porTreinamento.set(treinamentoId, {
        participantes: 0,
        presentesPessoas: 0,
        ausentesPessoas: 0,
        justificadosPessoas: 0,
        pendentesPessoas: 0,
        registrosPresentes: 0,
        registrosAusentes: 0,
        registrosJustificados: 0,
        registrosPendentes: 0,
      });
    }

    const acc = porTreinamento.get(treinamentoId);
    const presente = n(linha.presente);
    const ausente = n(linha.ausente);
    const justificado = n(linha.justificado);
    const pendente = n(linha.pendente);

    acc.participantes += 1;
    acc.registrosPresentes += presente;
    acc.registrosAusentes += ausente;
    acc.registrosJustificados += justificado;
    acc.registrosPendentes += pendente;

    const classificacao = classificarParticipante({ presente, ausente, justificado });
    if (classificacao === "presente") acc.presentesPessoas += 1;
    else if (classificacao === "ausente") acc.ausentesPessoas += 1;
    else if (classificacao === "justificado") acc.justificadosPessoas += 1;
    else acc.pendentesPessoas += 1;
  }

  return porTreinamento;
}

// status_execucao/status oficiais + datas: decide Planejada / Em andamento /
// Concluída / Cancelada / Chamada pendente / Sem cronograma / Sem treinandos.
// Converte valor de data vindo do banco para "YYYY-MM-DD". O driver mysql2
// devolve colunas DATE como objetos Date nativos do JS (não como string) —
// `String(dataObj)` produz "Mon Jun 01 2026 00:00:00 GMT..." em vez de
// "2026-06-01", e comparar essa string com um "YYYY-MM-DD" nunca dá certo
// (a comparação de string sempre falha silenciosamente). Esta função trata
// os dois formatos (Date nativo e string) de forma robusta.
function toISODate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0"),
    ].join("-");
  }
  return String(value).slice(0, 10);
}

function resolverStatusTurma({
  statusOficial,
  treinandosPrevistos,
  diasPlanejados,
  presencasLancadas,
  pendentes,
  usaCronograma,
  dataInicio,
  dataFim,
  hoje,
}) {
  const status = String(statusOficial || "").trim().toLowerCase();

  const hojeISO = hoje;
  const fimISO = toISODate(dataFim);
  const fimPassou = fimISO != null && hojeISO > fimISO;

  if (["cancelada", "cancelado"].includes(status)) return "Cancelada";
  if (["concluida", "concluído", "concluido"].includes(status)) return "Concluída";
  if (fimPassou) return "Concluída";

  if (treinandosPrevistos === 0) return "Sem treinandos";
  if (usaCronograma && diasPlanejados === 0) return "Sem cronograma";
  if (presencasLancadas === 0) return "Chamada pendente";

  if (["em_andamento", "em andamento"].includes(status)) return "Em andamento";
  if (["planejada", "planejado"].includes(status)) return "Planejada";

  const inicioISO = toISODate(dataInicio);
  if (inicioISO && hojeISO < inicioISO) return "Planejada";

  if (pendentes > 0) return "Em andamento";
  return "Concluída";
}

function resolverClassificacaoTurma({ taxa, treinandosPrevistos, pendentes, statusTurma }) {
  if (["Sem treinandos", "Sem cronograma", "Cancelada"].includes(statusTurma)) {
    return "Crítico";
  }
  if (statusTurma === "Planejada") return "Atenção";
  if (statusTurma === "Chamada pendente") return "Atenção";
  if (statusTurma === "Em andamento" && pendentes > 0) return "Atenção";
  if (statusTurma === "Concluída") {
    if (treinandosPrevistos > 0 && taxa > 0 && taxa < 75) return "Crítico";
    if (treinandosPrevistos > 0 && taxa > 0 && taxa < 85) return "Atenção";
    return "Estável";
  }
  if (treinandosPrevistos > 0 && taxa < 85) return "Crítico";
  return "Estável";
}

// Função principal: monta o resumo de presença + status de TODOS os
// treinamentos (ou de um único, se treinamentoId for passado).
async function getResumoPresenca({ treinamentoId } = {}) {
  const [treinamentos] = await pool.query(
    `
    SELECT id, tema, cliente, instrutor, supervisor, status, descricao, publico,
           data, data_inicio, data_fim, carga_horaria, participantes
    FROM treinamentos
    ${treinamentoId ? "WHERE id = ?" : ""}
    `,
    treinamentoId ? [treinamentoId] : []
  );

  const [diasPorTreinamento] = await pool.query(`
    SELECT treinamento_id, COUNT(*) AS dias_planejados
    FROM turma_aulas
    GROUP BY treinamento_id
  `);
  const mapaDias = new Map(diasPorTreinamento.map((r) => [Number(r.treinamento_id), n(r.dias_planejados)]));

  const [cronMap, histMap, snapRows] = await Promise.all([
    agregarFontePresenca("presenca_aulas"),
    agregarFontePresenca("presencas"),
    pool.query(`
      SELECT treinamento_id,
             COUNT(*) AS treinados,
             SUM(CASE WHEN status_presenca = 'presente' THEN 1 ELSE 0 END) AS presentes,
             SUM(CASE WHEN status_presenca = 'ausente' THEN 1 ELSE 0 END) AS ausentes,
             SUM(CASE WHEN status_presenca = 'justificado' THEN 1 ELSE 0 END) AS justificados,
             SUM(CASE WHEN status_presenca IS NULL OR status_presenca = '' OR status_presenca = 'pendente' THEN 1 ELSE 0 END) AS pendentes
      FROM treinamento_participantes
      GROUP BY treinamento_id
    `).then(([rows]) => new Map(rows.map((r) => [Number(r.treinamento_id), r]))),
  ]);

  const hoje = new Date();
  const hojeISO = [
    hoje.getFullYear(),
    String(hoje.getMonth() + 1).padStart(2, "0"),
    String(hoje.getDate()).padStart(2, "0"),
  ].join("-");

  return treinamentos.map((t) => {
    const treinamentoIdNum = Number(t.id);
    const treinandosPrevistos = n(t.participantes);
    const diasPlanejados = mapaDias.get(treinamentoIdNum) || 0;
    const usaCronograma = diasPlanejados > 0;

    const cron = cronMap.get(treinamentoIdNum);
    const hist = histMap.get(treinamentoIdNum);
    const snap = snapRows.get(treinamentoIdNum);

    const totalRealCronograma = cron
      ? cron.registrosPresentes + cron.registrosAusentes + cron.registrosJustificados
      : 0;
    const temLegado = !!hist && (hist.registrosPresentes + hist.registrosAusentes + hist.registrosJustificados + hist.registrosPendentes) > 0;

    let origemFrequencia;
    let usarLegado = false;

    if (usaCronograma) {
      if (totalRealCronograma === 0 && temLegado) {
        usarLegado = true;
        origemFrequencia = "legado";
      } else {
        origemFrequencia = "cronograma";
      }
    } else {
      usarLegado = true;
      origemFrequencia = treinandosPrevistos === 0 ? "legado" : "presencas";
    }

    // --- Nível "registro" (execução da chamada / frequência real, como já
    //     era calculado na página Presenças — preservado sem alteração de
    //     fórmula) ---
    let registrosPresentes = 0;
    let registrosAusentes = 0;
    let registrosJustificados = 0;
    let registrosPendentes = 0;
    let baseEsperada = 0;

    // --- Nível "pessoa" (cabeça-de-participante, usado pelos KPIs do
    //     Dashboard — comparável entre turmas/clientes/instrutores) ---
    let presentesPessoas = 0;
    let ausentesPessoas = 0;
    let justificadosPessoas = 0;
    let pendentesPessoas = 0;
    let treinadosConfirmados = 0;

    if (origemFrequencia === "cronograma" && cron) {
      registrosPresentes = cron.registrosPresentes;
      registrosAusentes = cron.registrosAusentes;
      registrosJustificados = cron.registrosJustificados;
      registrosPendentes = cron.registrosPendentes;
      baseEsperada = treinandosPrevistos * diasPlanejados;

      presentesPessoas = cron.presentesPessoas;
      ausentesPessoas = cron.ausentesPessoas;
      justificadosPessoas = cron.justificadosPessoas;
      pendentesPessoas = cron.pendentesPessoas;
      treinadosConfirmados = cron.participantes;
    } else if (usarLegado && hist) {
      registrosPresentes = hist.registrosPresentes;
      registrosAusentes = hist.registrosAusentes;
      registrosJustificados = hist.registrosJustificados;
      registrosPendentes = hist.registrosPendentes;
      const totalLancadoLegado = registrosPresentes + registrosAusentes + registrosJustificados + registrosPendentes;
      baseEsperada = totalLancadoLegado > 0 ? totalLancadoLegado : treinandosPrevistos;

      presentesPessoas = hist.presentesPessoas;
      ausentesPessoas = hist.ausentesPessoas;
      justificadosPessoas = hist.justificadosPessoas;
      pendentesPessoas = hist.pendentesPessoas;
      treinadosConfirmados = hist.participantes;
    } else if (snap && n(snap.treinados) > 0) {
      // Último fallback: só snapshot existe (roster sem nenhuma chamada
      // registrada em cronograma ou legado).
      origemFrequencia = "snapshot";
      registrosPresentes = n(snap.presentes);
      registrosAusentes = n(snap.ausentes);
      registrosJustificados = n(snap.justificados);
      registrosPendentes = n(snap.pendentes);
      baseEsperada = n(snap.treinados);

      presentesPessoas = n(snap.presentes);
      ausentesPessoas = n(snap.ausentes);
      justificadosPessoas = n(snap.justificados);
      pendentesPessoas = n(snap.pendentes);
      treinadosConfirmados = n(snap.treinados);
    } else {
      origemFrequencia = "sem_dados";
    }

    const presencasLancadas = registrosPresentes + registrosAusentes + registrosJustificados + registrosPendentes;
    const totalRealizado = registrosPresentes + registrosAusentes + registrosJustificados;

    const taxaExecucao = pct(totalRealizado, baseEsperada);
    const taxaPresenca = pct(registrosPresentes, totalRealizado); // nível registro (Gestão de Turmas)
    const taxaPresencaPessoas = pct(presentesPessoas, presentesPessoas + ausentesPessoas); // nível pessoa (Dashboard)

    const statusTurma = resolverStatusTurma({
      statusOficial: t.status,
      treinandosPrevistos,
      diasPlanejados,
      presencasLancadas,
      pendentes: registrosPendentes,
      usaCronograma,
      dataInicio: t.data_inicio || t.data,
      dataFim: t.data_fim,
      hoje: hojeISO,
    });

    const classificacao = resolverClassificacaoTurma({
      taxa: taxaPresenca,
      treinandosPrevistos,
      pendentes: registrosPendentes,
      statusTurma,
    });

    return {
      id: treinamentoIdNum,
      tema: t.tema,
      cliente: t.cliente,
      instrutor: t.instrutor,
      supervisor: t.supervisor,
      status: t.status,
      descricao: t.descricao,
      publico: t.publico,
      data: t.data,
      data_inicio: t.data_inicio,
      data_fim: t.data_fim,
      carga_horaria: t.carga_horaria,

      // rótulos explícitos: previsto (cadastro) vs confirmado (chamada)
      treinandos_previstos: treinandosPrevistos,
      treinandos_confirmados: treinadosConfirmados,

      dias_planejados: diasPlanejados,
      usa_cronograma: usaCronograma,
      origem_frequencia: origemFrequencia,

      presentes: registrosPresentes,
      ausentes: registrosAusentes,
      justificados: registrosJustificados,
      pendentes: registrosPendentes,
      base_esperada: baseEsperada,
      total_realizado: totalRealizado,
      taxa_execucao: taxaExecucao,
      taxa_presenca: taxaPresenca,

      presentes_pessoas: presentesPessoas,
      ausentes_pessoas: ausentesPessoas,
      justificados_pessoas: justificadosPessoas,
      pendentes_pessoas: pendentesPessoas,
      taxa_presenca_pessoas: taxaPresencaPessoas,

      status_turma: statusTurma,
      classificacao,
    };
  });
}

// Frequência por participante — mesma decisão cronograma > legado usada em
// getResumoPresenca(), mas aqui expondo o detalhe POR PESSOA (nome, dias
// registrados, presentes, ausentes, % de frequência), para telas de
// drill-down (Dashboard, aba Pessoas da turma). Antes, a Frequência
// Individual só olhava para a tabela `presencas` (legado) — turmas geridas
// por cronograma apareciam como se ninguém tivesse frequência nenhuma.
async function getFrequenciaPorParticipante({ cliente, treinamentoId, inicio, fim } = {}) {
  const resumo = await getResumoPresenca({ treinamentoId });
  const origemPorId = new Map(resumo.map((r) => [r.id, r.origem_frequencia]));

  const whereBase = [];
  const paramsBase = [];
  if (cliente) { whereBase.push("t.cliente = ?"); paramsBase.push(cliente); }
  if (treinamentoId) { whereBase.push("t.id = ?"); paramsBase.push(treinamentoId); }

  // fonte 1: legado (presencas) — usada quando origem_frequencia é
  // 'legado' ou 'presencas' (turmas sem cronograma, ou cronograma vazio)
  const whereLegado = [...whereBase, "DAYOFWEEK(p.data_chamada) <> 1"];
  const paramsLegado = [...paramsBase];
  if (inicio) { whereLegado.push("DATE(p.data_chamada) >= ?"); paramsLegado.push(inicio); }
  if (fim) { whereLegado.push("DATE(p.data_chamada) <= ?"); paramsLegado.push(fim); }

  const [linhasLegado] = await pool.query(
    `
    SELECT
      p.treinando_nome, t.id AS treinamento_id, t.tema, t.cliente, t.instrutor,
      COUNT(*) AS dias_registrados,
      SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) AS presentes,
      SUM(CASE WHEN p.status = 'ausente' THEN 1 ELSE 0 END) AS ausentes,
      SUM(CASE WHEN p.status = 'justificado' THEN 1 ELSE 0 END) AS justificados,
      SUM(CASE WHEN p.status IS NULL OR p.status = '' OR p.status = 'pendente' THEN 1 ELSE 0 END) AS pendentes,
      MIN(p.data_chamada) AS primeira_chamada,
      MAX(p.data_chamada) AS ultima_chamada
    FROM presencas p
    INNER JOIN treinamentos t ON t.id = p.treinamento_id
    ${whereLegado.length ? `WHERE ${whereLegado.join(" AND ")}` : ""}
    GROUP BY p.treinando_nome, t.id, t.tema, t.cliente, t.instrutor
    `,
    paramsLegado
  );

  // fonte 2: cronograma (presenca_aulas) — usada quando origem_frequencia é
  // 'cronograma'
  const whereCron = [...whereBase, "DAYOFWEEK(pa.data_aula) <> 1"];
  const paramsCron = [...paramsBase];
  if (inicio) { whereCron.push("DATE(pa.data_aula) >= ?"); paramsCron.push(inicio); }
  if (fim) { whereCron.push("DATE(pa.data_aula) <= ?"); paramsCron.push(fim); }

  const [linhasCron] = await pool.query(
    `
    SELECT
      pa.treinando_nome, t.id AS treinamento_id, t.tema, t.cliente, t.instrutor,
      COUNT(*) AS dias_registrados,
      SUM(CASE WHEN pa.status = 'presente' THEN 1 ELSE 0 END) AS presentes,
      SUM(CASE WHEN pa.status = 'ausente' THEN 1 ELSE 0 END) AS ausentes,
      SUM(CASE WHEN pa.status = 'justificado' THEN 1 ELSE 0 END) AS justificados,
      SUM(CASE WHEN pa.status IS NULL OR pa.status = '' OR pa.status = 'pendente' THEN 1 ELSE 0 END) AS pendentes,
      MIN(pa.data_aula) AS primeira_chamada,
      MAX(pa.data_aula) AS ultima_chamada
    FROM presenca_aulas pa
    INNER JOIN treinamentos t ON t.id = pa.treinamento_id
    ${whereCron.length ? `WHERE ${whereCron.join(" AND ")}` : ""}
    GROUP BY pa.treinando_nome, t.id, t.tema, t.cliente, t.instrutor
    `,
    paramsCron
  );

  const combinadas = [
    ...linhasLegado.filter((l) => origemPorId.get(Number(l.treinamento_id)) !== "cronograma"),
    ...linhasCron.filter((l) => origemPorId.get(Number(l.treinamento_id)) === "cronograma"),
  ];

  return combinadas
    .map((item) => {
      const presentes = n(item.presentes);
      const ausentes = n(item.ausentes);
      const computaveis = presentes + ausentes;
      return {
        treinando_nome: item.treinando_nome,
        treinamento_id: Number(item.treinamento_id),
        tema: item.tema,
        cliente: item.cliente,
        instrutor: item.instrutor,
        dias_registrados: n(item.dias_registrados),
        presentes,
        ausentes,
        justificados: n(item.justificados),
        pendentes: n(item.pendentes),
        frequencia_percentual: computaveis > 0 ? Math.round((presentes / computaveis) * 1000) / 10 : 0,
        primeira_chamada: item.primeira_chamada,
        ultima_chamada: item.ultima_chamada,
      };
    })
    .sort((a, b) => a.frequencia_percentual - b.frequencia_percentual || a.treinando_nome.localeCompare(b.treinando_nome));
}

module.exports = {
  getResumoPresenca,
  getFrequenciaPorParticipante,
  classificarParticipante,
  resolverStatusTurma,
  resolverClassificacaoTurma,
};
