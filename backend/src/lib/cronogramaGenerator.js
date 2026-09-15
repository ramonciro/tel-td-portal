/**
 * cronogramaGenerator.js — Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026)
 *
 * Lógica de cálculo (sem tocar o banco) compartilhada entre três chamadores:
 *   1. Criação de turma nova (decisão 21 — "cronograma sempre"): gera o
 *      cronograma automaticamente no momento da criação, usando o horário
 *      real da turma (decisão 17) para calcular a carga de cada dia.
 *   2. O botão manual "Gerar cronograma" (turmaAulasController.gerarCronogramaTurma)
 *      — mantido para turmas antigas ou casos em que a geração automática
 *      não rodou.
 *   3. O script de migração retroativa (scripts/migrarCronogramaRetroativo.js)
 *      — turma antiga sem horário real: divide a carga horária nominal
 *      pelos dias úteis, e herda o status de execução da turma-mãe (ver
 *      comentário em `montarLinhasCronograma` sobre por que isso é
 *      necessário, não cosmético).
 *
 * Centralizar aqui evita que os três caminhos calculem carga horária ou
 * decidam status_execucao de formas diferentes, o que já foi identificado
 * como risco na auditoria de riscos cruzados (claude/auditoria-riscos-
 * cruzados-pacote-salas-2026-09.md, item sobre decisão 17 ser pré-requisito
 * da decisão 21).
 */

function parseDateUTC(dateValue) {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    return new Date(
      Date.UTC(dateValue.getUTCFullYear(), dateValue.getUTCMonth(), dateValue.getUTCDate(), 12, 0, 0)
    );
  }

  const text = String(dateValue).trim().slice(0, 10);
  const parts = text.split("-");
  if (parts.length !== 3) return null;

  const [year, month, day] = parts.map(Number);
  if (!year || !month || !day) return null;

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function toDateOnly(value) {
  const d = parseDateUTC(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateValue, days) {
  const d = parseDateUTC(dateValue);
  if (!d || Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}

function isSunday(dateValue) {
  const d = parseDateUTC(dateValue);
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getUTCDay() === 0;
}

function diffDaysInclusive(start, end) {
  const d1 = parseDateUTC(start);
  const d2 = parseDateUTC(end);
  if (!d1 || !d2 || Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 1;
  const diff = Math.floor((d2.getTime() - d1.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 1;
}

/**
 * Lista de datas úteis (pula domingo) entre início e fim, inclusive.
 */
function listarDiasUteis(inicio, fim) {
  const totalDias = diffDaysInclusive(inicio, fim);
  const dias = [];
  for (let i = 0; i < totalDias; i += 1) {
    const data = addDays(inicio, i);
    if (!data) continue;
    if (isSunday(data)) continue;
    dias.push(data);
  }
  return dias;
}

/**
 * Decisão 17: horas planejadas do dia = hora_fim - hora_inicio da turma.
 * Aceita "HH:MM" ou "HH:MM:SS" (formato que o mysql2 devolve pra colunas
 * TIME). Retorna null (não 0) quando não dá pra calcular — null é tratado
 * pelo chamador como "sem horário real", nunca como "zero horas de
 * verdade", justamente para não repetir o problema original (dia nascendo
 * zerado sem ninguém perceber).
 */
function calcularHorasEntreHorarios(horaInicio, horaFim) {
  if (!horaInicio || !horaFim) return null;

  const partes = (valor) => String(valor).split(":").map(Number);
  const [hi, mi] = partes(horaInicio);
  const [hf, mf] = partes(horaFim);
  if ([hi, mi, hf, mf].some((n) => Number.isNaN(n))) return null;

  const diffMinutos = hf * 60 + mf - (hi * 60 + mi);
  if (diffMinutos <= 0) return null;

  return Math.round((diffMinutos / 60) * 100) / 100;
}

// Mesma classificação usada no frontend (frontend/app/treinamentos/page.js,
// normalizeStatus) — repetida aqui de propósito: são bases de dado
// diferentes (uma decide o que o usuário vê, a outra decide o que a
// migração grava), e duplicar 6 linhas é mais seguro do que criar um
// acoplamento cross-stack (backend importando lógica "de exibição" do
// frontend, ou vice-versa) só para evitar a duplicação.
function classificarStatusTurma(status) {
  const key = String(status || "").trim().toLowerCase();
  if (["concluido", "concluída", "concluida", "finalizado", "finalizada"].includes(key)) return "concluido";
  if (["em_andamento", "em andamento", "andamento", "ativo", "ativa"].includes(key)) return "em_andamento";
  if (["cancelada", "cancelado"].includes(key)) return "cancelada";
  return "planejado";
}

/**
 * Monta (sem gravar nada) as linhas de turma_aulas para uma turma.
 *
 * @param {object} turma - precisa de: id (opcional aqui), tema, instrutor,
 *   status, data/data_inicio, data_fim, carga_horaria, hora_inicio, hora_fim
 * @param {string} hojeISO - data de hoje em "YYYY-MM-DD" (injetada pelo
 *   chamador para o script de migração poder rodar de forma determinística
 *   em teste/dry-run sem depender do relógio real).
 *
 * @returns {{ linhas: object[], pulada: boolean, motivoPulo: string|null, cargaDiaria: number|null }}
 *
 * `pulada: true` acontece só quando a turma não tem instrutor definido —
 * achado da auditoria de riscos cruzados: a linha gerada herda
 * `instrutor_responsavel` do cadastro da turma, e a soma de horas de
 * Capacidade (capacidadeResolver.js, FONTE_HORAS_SQL) só conta uma linha de
 * turma_aulas quando `instrutor_responsavel` está preenchido — se a turma
 * não tiver instrutor, gerar cronograma faria essa turma DESAPARECER dos
 * indicadores de Capacidade (hoje ela aparece via o fallback "sem
 * cronograma"), em vez de só zerar. Mais seguro pular e deixar a turma
 * exatamente como está hoje do que "consertar" um cadastro incompleto na
 * hora da migração.
 */
function montarLinhasCronograma({ turma, hojeISO }) {
  const instrutor = String(turma.instrutor || "").trim();
  if (!instrutor) {
    return { linhas: [], pulada: true, motivoPulo: "sem instrutor definido na turma", cargaDiaria: null };
  }

  const inicio = toDateOnly(turma.data_inicio || turma.data);
  const fim = toDateOnly(turma.data_fim || turma.data_inicio || turma.data);
  if (!inicio || !fim) {
    return { linhas: [], pulada: true, motivoPulo: "turma sem data de início/fim válida", cargaDiaria: null };
  }

  const dias = listarDiasUteis(inicio, fim);
  if (!dias.length) {
    return { linhas: [], pulada: true, motivoPulo: "nenhum dia útil no intervalo (só domingo(s))", cargaDiaria: null };
  }

  const horasPorHorario = calcularHorasEntreHorarios(turma.hora_inicio, turma.hora_fim);

  let cargasPorDia;
  if (horasPorHorario != null) {
    // Decisão 17 — turma com horário real: mesma carga em todos os dias.
    cargasPorDia = dias.map(() => horasPorHorario);
  } else {
    // Migração retroativa (decisão 21 + "Migração para cronograma sempre"):
    // sem horário histórico, divide a carga nominal da turma pelos dias
    // úteis, ajustando o último dia para a soma bater exatamente com o
    // nominal (evita que arredondamento por dia faça o total reportado
    // divergir da carga horária que a turma sempre teve).
    const nominal = Number(turma.carga_horaria || 0);
    const base = dias.length ? Math.round((nominal / dias.length) * 100) / 100 : 0;
    cargasPorDia = dias.map(() => base);
    if (dias.length && nominal > 0) {
      const somaParcial = base * (dias.length - 1);
      cargasPorDia[dias.length - 1] = Math.round((nominal - somaParcial) * 100) / 100;
    }
  }

  // Decisão do achado "status_execucao default zera horas de turma já
  // concluída": a linha nasce com status coerente com a turma-mãe, nunca
  // sempre "planejada". Turma concluída → todo dia "concluida" (a soma de
  // carga_horaria_planejada passa a valer como horas_real via o fallback
  // NULLIF(carga_horaria_real,0)->carga_horaria_planejada em
  // capacidadeResolver.js, sem precisar preencher carga_horaria_real).
  // Turma em andamento → dias até hoje "concluida", dias futuros
  // "planejada" (aproximação razoável; ajuste fino continua possível pela
  // tela de Cronograma). Turma cancelada/planejada → tudo "planejada"
  // (mesma leitura de horas_real=0 que o sistema já dá hoje pra elas).
  const statusTurma = classificarStatusTurma(turma.status);

  const linhas = dias.map((data, index) => {
    let statusExecucao = "planejada";
    if (statusTurma === "concluido") statusExecucao = "concluida";
    else if (statusTurma === "em_andamento" && hojeISO && data <= hojeISO) statusExecucao = "concluida";

    return {
      dia_numero: index + 1,
      data_aula: data,
      titulo: `Aula do Dia ${index + 1}`,
      objetivo: `Execução do Dia ${index + 1} da turma ${turma.tema || ""}`.trim(),
      carga_horaria_planejada: cargasPorDia[index],
      instrutor_responsavel: instrutor,
      status_execucao: statusExecucao,
    };
  });

  return { linhas, pulada: false, motivoPulo: null, cargaDiaria: horasPorHorario };
}

module.exports = {
  toDateOnly,
  addDays,
  isSunday,
  diffDaysInclusive,
  listarDiasUteis,
  calcularHorasEntreHorarios,
  classificarStatusTurma,
  montarLinhasCronograma,
};
