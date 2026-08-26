/**
 * horasResolver.js
 *
 * Fonte única de verdade para as métricas que o coordenador de T&D
 * precisa: horas previstas, horas realizadas, dias praticados, HC
 * previsto e HC realizado — por turma, e agregável por cliente,
 * instrutor e mês.
 *
 * Por que este módulo existe:
 * Antes desta correção, "horas" era um valor fixo por turma
 * (treinamentos.carga_horaria) sem distinção entre planejado e
 * realizado, e não existia nenhum agrupamento por mês. A fonte real
 * de granularidade diária (turma_aulas.carga_horaria_planejada /
 * carga_horaria_real, por dia) existia no banco mas nunca era somada
 * fora da tela de cronograma de uma única turma.
 *
 * Prioridade de fonte por turma (do mais preciso ao mais genérico):
 *   1) CRONOGRAMA (turma_aulas) — quando a turma tem aulas cadastradas,
 *      horas e dias vêm da soma dessas aulas (dado real, dia a dia).
 *   2) FALLBACK (treinamentos.carga_horaria) — quando a turma não tem
 *      cronograma detalhado, usamos o valor único cadastrado na turma;
 *      nesse caso "dias praticados" fica marcado como indisponível
 *      (null) em vez de forjar um número, e horas_realizadas só é
 *      contada se o status da turma for concluído.
 *
 * HC (headcount) previsto/realizado:
 *   - HC previsto: contagem do roster (treinamento_participantes), com
 *     fallback para treinamentos.participantes_previstos/participantes.
 *   - HC realizado: participantes classificados como "presente" pelo
 *     critério já usado no sistema (>=75% de presença), com prioridade
 *     presenca_aulas > presencas (legado) > participantes_presentes.
 */

const pool = require("../lib/db");
const { classificarParticipante } = require("./presencaResolver");

function n(v) {
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function round1(v) {
  return Math.round(n(v) * 10) / 10;
}

function pct(num, den) {
  if (!den) return null;
  return round1((num / den) * 100);
}

function ymKey(ano, mes) {
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/**
 * Classifica participantes com base em registros REGISTRO-level
 * (presente/ausente/justificado por linha), agregando por nome antes
 * de aplicar o critério de classificação por pessoa (mesma lógica do
 * presencaResolver, reaproveitada para consistência).
 */
function contarPresentesPorPessoa(registros) {
  const porPessoa = new Map();
  for (const r of registros) {
    const nome = r.nome;
    if (!porPessoa.has(nome)) {
      porPessoa.set(nome, { presente: 0, ausente: 0, justificado: 0 });
    }
    const acc = porPessoa.get(nome);
    if (r.status === "presente") acc.presente += 1;
    else if (r.status === "ausente") acc.ausente += 1;
    else if (r.status === "justificado") acc.justificado += 1;
  }

  let presentes = 0;
  for (const acc of porPessoa.values()) {
    if (classificarParticipante(acc) === "presente") presentes += 1;
  }
  return { totalPessoas: porPessoa.size, presentes };
}

/**
 * Resumo de horas/dias/HC de uma lista de treinamentos (ou de todos,
 * se nenhum filtro de id for passado). Retorna um array — um item por
 * turma — com todas as métricas já calculadas, prontas para agregação
 * (por cliente, instrutor, mês) na camada de dashboard/capacidade.
 */
async function getResumoHoras({ treinamentoId } = {}) {
  const whereTreino = treinamentoId ? "WHERE id = ?" : "";
  const paramsTreino = treinamentoId ? [treinamentoId] : [];

  const [treinamentos] = await pool.query(
    `SELECT id, tema, cliente, instrutor, carga_horaria, status,
            data_inicio, data_fim, data,
            participantes, participantes_previstos, participantes_presentes
     FROM treinamentos ${whereTreino}`,
    paramsTreino
  );

  if (!treinamentos.length) return [];

  const ids = treinamentos.map((t) => t.id);
  const placeholders = ids.map(() => "?").join(",");

  // 1) Cronograma (turma_aulas) — fonte primária de horas/dias.
  const [aulas] = await pool.query(
    `SELECT treinamento_id, id, dia_numero, data_aula, status_execucao,
            carga_horaria_planejada, carga_horaria_real, instrutor_responsavel
     FROM turma_aulas
     WHERE treinamento_id IN (${placeholders})`,
    ids
  );
  const aulasPorTreino = new Map();
  for (const a of aulas) {
    if (!aulasPorTreino.has(a.treinamento_id)) aulasPorTreino.set(a.treinamento_id, []);
    aulasPorTreino.get(a.treinamento_id).push(a);
  }

  // 2) Roster (HC previsto).
  const [roster] = await pool.query(
    `SELECT treinamento_id, COUNT(*) AS total
     FROM treinamento_participantes
     WHERE treinamento_id IN (${placeholders})
     GROUP BY treinamento_id`,
    ids
  );
  const rosterPorTreino = new Map(roster.map((r) => [r.treinamento_id, n(r.total)]));

  // 3) Presença por aula (HC realizado — fonte primária, granular).
  const [presencaAulas] = await pool.query(
    `SELECT treinamento_id, treinando_nome AS nome, status
     FROM presenca_aulas
     WHERE treinamento_id IN (${placeholders})`,
    ids
  );
  const presencaAulasPorTreino = new Map();
  for (const p of presencaAulas) {
    if (!presencaAulasPorTreino.has(p.treinamento_id)) presencaAulasPorTreino.set(p.treinamento_id, []);
    presencaAulasPorTreino.get(p.treinamento_id).push(p);
  }

  // 4) Presença legado (fallback quando não há presenca_aulas).
  //    Segue o mesmo critério do presencaResolver.js: só a coluna
  //    `status` é confiável entre ambientes (a coluna `presente` é
  //    opcional/nem sempre existe, dependendo de quando a linha foi
  //    inserida).
  const [presencasLegado] = await pool.query(
    `SELECT treinamento_id, treinando_nome AS nome, COALESCE(status, 'pendente') AS status
     FROM presencas
     WHERE treinamento_id IN (${placeholders})`,
    ids
  );
  const presencasLegadoPorTreino = new Map();
  for (const p of presencasLegado) {
    if (!presencasLegadoPorTreino.has(p.treinamento_id)) presencasLegadoPorTreino.set(p.treinamento_id, []);
    presencasLegadoPorTreino.get(p.treinamento_id).push(p);
  }

  const resultado = [];

  for (const t of treinamentos) {
    const aulasDaTurma = (aulasPorTreino.get(t.id) || []).slice().sort((a, b) => a.dia_numero - b.dia_numero);
    const usaCronograma = aulasDaTurma.length > 0;

    let horasPrevistas, horasRealizadas, diasPrevistos, diasPraticados, aulasDetalhe;

    if (usaCronograma) {
      horasPrevistas = round1(aulasDaTurma.reduce((acc, a) => acc + n(a.carga_horaria_planejada), 0));
      const praticadas = aulasDaTurma.filter((a) =>
        ["ministrada", "parcial"].includes(String(a.status_execucao || "").toLowerCase())
      );
      horasRealizadas = round1(praticadas.reduce((acc, a) => acc + n(a.carga_horaria_real), 0));
      diasPrevistos = aulasDaTurma.length;
      diasPraticados = praticadas.length;
      aulasDetalhe = aulasDaTurma.map((a) => ({
        data_aula: a.data_aula,
        status_execucao: a.status_execucao,
        carga_horaria_planejada: n(a.carga_horaria_planejada),
        carga_horaria_real: a.carga_horaria_real != null ? n(a.carga_horaria_real) : null,
        instrutor_responsavel: a.instrutor_responsavel || t.instrutor,
      }));
    } else {
      // Fallback: turma sem cronograma detalhado. Usa o valor único
      // cadastrado na turma. Realizado só conta se a turma estiver
      // concluída (senão ficaria igual ao previsto mesmo sem terminar).
      const statusNorm = String(t.status || "").toLowerCase();
      const concluida = ["concluido", "concluído", "concluida", "concluída", "encerrado"].includes(statusNorm);
      horasPrevistas = round1(n(t.carga_horaria));
      horasRealizadas = concluida ? horasPrevistas : 0;
      diasPrevistos = null; // sem cronograma, não há como contar dias com precisão
      diasPraticados = null;
      aulasDetalhe = [];
    }

    // HC previsto: roster explícito > participantes_previstos > participantes.
    const hcPrevisto = rosterPorTreino.has(t.id)
      ? rosterPorTreino.get(t.id)
      : n(t.participantes_previstos) || n(t.participantes) || 0;

    // HC realizado: presenca_aulas (granular) > presencas (legado) > participantes_presentes.
    let hcRealizado;
    let origemHc;
    if (presencaAulasPorTreino.has(t.id)) {
      const { presentes } = contarPresentesPorPessoa(presencaAulasPorTreino.get(t.id));
      hcRealizado = presentes;
      origemHc = "cronograma";
    } else if (presencasLegadoPorTreino.has(t.id)) {
      const { presentes } = contarPresentesPorPessoa(presencasLegadoPorTreino.get(t.id));
      hcRealizado = presentes;
      origemHc = "legado";
    } else {
      hcRealizado = n(t.participantes_presentes);
      origemHc = "snapshot";
    }

    resultado.push({
      id: t.id,
      tema: t.tema,
      cliente: t.cliente,
      instrutor: t.instrutor,
      status: t.status,
      data_inicio: t.data_inicio,
      data_fim: t.data_fim,
      usa_cronograma: usaCronograma,
      origem_hc: origemHc,
      horas_previstas: horasPrevistas,
      horas_realizadas: horasRealizadas,
      desvio_horas: round1(horasRealizadas - horasPrevistas),
      aderencia_horas: pct(horasRealizadas, horasPrevistas),
      dias_previstos: diasPrevistos,
      dias_praticados: diasPraticados,
      hc_previsto: hcPrevisto,
      hc_realizado: hcRealizado,
      gap_hc: hcPrevisto - hcRealizado,
      taxa_hc: pct(hcRealizado, hcPrevisto),
      aulas: aulasDetalhe,
    });
  }

  return resultado;
}

/**
 * Agrega o resultado de getResumoHoras() por MÊS (ano-mes) e por
 * instrutor, usando a data de cada AULA (não a data da turma) como
 * granularidade — isso é o que permite "realizado instrutor x mês" ser
 * fiel mesmo quando uma turma atravessa dois meses.
 *
 * Turmas sem cronograma (fallback) são atribuídas ao mês de
 * data_fim (ou data_inicio/data como último recurso), marcadas com
 * `estimado: true` para deixar claro que não é granularidade diária real.
 */
async function getHorasPorInstrutorMes({ dataInicio, dataFim } = {}) {
  const resumo = await getResumoHoras();

  const porChave = new Map(); // chave: `${instrutor}::${ano}-${mes}`

  function addPonto(instrutor, ano, mes, { horasPrevistas, horasRealizadas, diaPraticado, diaPrevisto, estimado }) {
    if (!instrutor || !ano || !mes) return;
    const chave = `${instrutor}::${ymKey(ano, mes)}`;
    if (!porChave.has(chave)) {
      porChave.set(chave, {
        instrutor,
        ano,
        mes,
        chave_mes: ymKey(ano, mes),
        horas_previstas: 0,
        horas_realizadas: 0,
        dias_praticados: 0,
        dias_previstos: 0,
        estimado: false,
      });
    }
    const acc = porChave.get(chave);
    acc.horas_previstas = round1(acc.horas_previstas + horasPrevistas);
    acc.horas_realizadas = round1(acc.horas_realizadas + horasRealizadas);
    if (diaPraticado) acc.dias_praticados += 1;
    if (diaPrevisto) acc.dias_previstos += 1;
    if (estimado) acc.estimado = true;
  }

  for (const turma of resumo) {
    if (turma.usa_cronograma) {
      for (const aula of turma.aulas) {
        if (!aula.data_aula) continue;
        const d = new Date(aula.data_aula);
        if (dataInicio && d < new Date(dataInicio)) continue;
        if (dataFim && d > new Date(dataFim)) continue;
        const ano = d.getFullYear();
        const mes = d.getMonth() + 1;
        const praticada = ["ministrada", "parcial"].includes(String(aula.status_execucao || "").toLowerCase());
        addPonto(aula.instrutor_responsavel || turma.instrutor, ano, mes, {
          horasPrevistas: n(aula.carga_horaria_planejada),
          horasRealizadas: praticada ? n(aula.carga_horaria_real) : 0,
          diaPraticado: praticada,
          diaPrevisto: true,
          estimado: false,
        });
      }
    } else {
      const dataRef = turma.data_fim || turma.data_inicio;
      if (!dataRef) continue;
      const d = new Date(dataRef);
      if (dataInicio && d < new Date(dataInicio)) continue;
      if (dataFim && d > new Date(dataFim)) continue;
      addPonto(turma.instrutor, d.getFullYear(), d.getMonth() + 1, {
        horasPrevistas: turma.horas_previstas,
        horasRealizadas: turma.horas_realizadas,
        diaPraticado: turma.horas_realizadas > 0,
        diaPrevisto: true,
        estimado: true,
      });
    }
  }

  return Array.from(porChave.values()).sort((a, b) =>
    a.chave_mes < b.chave_mes ? -1 : a.chave_mes > b.chave_mes ? 1 : a.instrutor > b.instrutor ? 1 : -1
  );
}

module.exports = {
  getResumoHoras,
  getHorasPorInstrutorMes,
};
