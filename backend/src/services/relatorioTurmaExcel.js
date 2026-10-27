/**
 * relatorioTurmaExcel.js — Excel do relatório geral da turma (27/10/2026).
 *
 * Duas saídas a partir dos relatórios de relatorioTurmaService:
 *  - uma turma: aba "Resumo" (ficha vertical) + Cronograma, Participantes, NPS, Avaliações;
 *  - várias turmas (lote): aba "Turmas" (uma linha por turma) + abas detalhadas
 *    com as colunas Turma/Cliente para filtrar.
 */
const { novoWorkbook, adicionarTabela, escreverCelula, estilizarCabecalho } = require("../lib/excelExport");

const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "-");
const periodo = (t) => (t.data_inicio ? (t.data_fim && t.data_fim !== t.data_inicio ? `${dataBR(t.data_inicio)} a ${dataBR(t.data_fim)}` : dataBR(t.data_inicio)) : "-");
const nomeArquivoSeguro = (s) =>
  String(s || "turma").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "turma";

const COLS_CRON = [
  { titulo: "Dia", chave: "dia", largura: 6, formato: "inteiro" },
  { titulo: "Data", chave: "data", largura: 12, formato: "data" },
  { titulo: "Aula", chave: "titulo", largura: 32 },
  { titulo: "Situação", chave: "status_rotulo", largura: 14 },
  { titulo: "CH planejada", chave: "ch_planejada", largura: 12, formato: "decimal1" },
  { titulo: "CH real", chave: "ch_real", largura: 10, formato: "decimal1" },
  { titulo: "Instrutor", chave: "instrutor", largura: 22 },
  { titulo: "Conteúdo", chave: "conteudo", largura: 48 },
  { titulo: "Motivo da reprogramação", chave: "motivo_reprogramacao", largura: 32 },
  { titulo: "Observações da aula", chave: "observacoes", largura: 40 },
];
const COLS_PART = [
  { titulo: "Participante", chave: "nome", largura: 30 },
  { titulo: "Matrícula", chave: "matricula", largura: 12 },
  { titulo: "Operação", chave: "operacao", largura: 20 },
  { titulo: "Supervisor", chave: "supervisor", largura: 22 },
  { titulo: "Dias presente", chave: "dias_presentes", largura: 12, formato: "inteiro" },
  { titulo: "Dias ausente", chave: "dias_ausentes", largura: 12, formato: "inteiro" },
  { titulo: "Dias justificado", chave: "dias_justificados", largura: 14, formato: "inteiro" },
  { titulo: "Dias pendente", chave: "dias_pendentes", largura: 13, formato: "inteiro" },
  { titulo: "Frequência", chave: "frequencia_pct", largura: 12, formato: "percentual" },
  { titulo: "Situação", chave: "situacao", largura: 18 },
  { titulo: "Nota da prova", chave: "nota_prova", largura: 12, formato: "decimal1" },
  { titulo: "Certificado emitido em", chave: "certificado", largura: 18, formato: "data" },
];
const COLS_AV = [
  { titulo: "Participante", chave: "participante", largura: 30 },
  { titulo: "Avaliação", chave: "titulo", largura: 32 },
  { titulo: "Nota da prova", chave: "nota_prova", largura: 13, formato: "decimal1" },
  { titulo: "Nota de qualidade", chave: "nota_qualidade", largura: 15, formato: "decimal1" },
];


const dataHoraBR = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("pt-BR", { timeZone: "America/Bahia" });
};
const STATUS_PRES = { ausente: "Ausente", justificado: "Justificado", presente: "Presente", pendente: "Pendente" };

// Quebra de linha nas colunas de texto longo (diário, mural, observações...).
function quebrar(ws, colunas, indices) {
  ws.eachRow((row) => indices.forEach((i) => {
    const c = row.getCell(i);
    c.alignment = { ...(c.alignment || {}), wrapText: true, vertical: "top" };
  }));
}
function aba(wb, nome, colunas, linhas) {
  if (!linhas.length) return null;
  const ws = adicionarTabela(wb, { nomeAba: nome, colunas, linhas });
  const longas = colunas.map((c, i) => (c.largura >= 40 ? i + 1 : 0)).filter(Boolean);
  if (longas.length) quebrar(ws, colunas, longas);
  return ws;
}

/**
 * Abas de registros da turma (diário de bordo, rotina do instrutor, mural,
 * ocorrências de presença). Só cria a aba quando há linhas; seção sem
 * permissão vem null no relatório e some sozinha.
 */
function abasRegistros(wb, relatorios, comTurma) {
  const pref = comTurma ? [{ titulo: "Turma", chave: "turma", largura: 30 }, { titulo: "Cliente", chave: "cliente", largura: 18 }] : [];
  const juntar = (fn) => relatorios.flatMap((r) => (fn(r.registros || {}) || []).map((l) => (comTurma ? { turma: r.turma.tema, cliente: r.turma.cliente || "-", ...l } : l)));

  aba(wb, "Diário de bordo", [...pref,
    { titulo: "Data", chave: "data", largura: 12, formato: "data" },
    { titulo: "Registro do dia", chave: "texto", largura: 90 },
    { titulo: "Atualizado por", chave: "atualizado_por", largura: 22 },
    { titulo: "Atualizado em", chave: "atualizado_em", largura: 18 },
  ], juntar((g) => (g.diario || []).map((d) => ({ ...d, atualizado_em: dataHoraBR(d.atualizado_em) }))));

  aba(wb, "Rotina - Checklist", [...pref,
    { titulo: "Etapa", chave: "etapa", largura: 10 },
    { titulo: "Item", chave: "texto", largura: 56 },
    { titulo: "Resposta", chave: "resposta", largura: 12 },
    { titulo: "Observação", chave: "obs", largura: 40 },
    { titulo: "Respondido por", chave: "respondido_por", largura: 22 },
    { titulo: "Respondido em", chave: "respondido_em", largura: 18 },
  ], juntar((g) => (g.rotina?.checklist || []).map((c) => ({ ...c, respondido_em: dataHoraBR(c.respondido_em) }))));

  aba(wb, "Rotina - Tarefas", [...pref,
    { titulo: "Tarefa", chave: "item", largura: 40 },
    { titulo: "O que fazer", chave: "o_que_fazer", largura: 50 },
    { titulo: "Feita", chave: "feito", largura: 8 },
    { titulo: "Feita em", chave: "feito_em", largura: 18 },
    { titulo: "Feita por", chave: "feito_por", largura: 22 },
  ], juntar((g) => (g.rotina?.tarefas || []).map((t) => ({ ...t, feito: t.feito ? "Sim" : "Não", feito_em: dataHoraBR(t.feito_em) }))));

  aba(wb, "Rotina - Aval. individual", [...pref,
    { titulo: "Participante", chave: "participante", largura: 30 },
    { titulo: "Pontualidade", chave: "pontualidade", largura: 12, formato: "decimal1" },
    { titulo: "Interesse", chave: "interesse", largura: 10, formato: "decimal1" },
    { titulo: "Comportamento", chave: "comportamento", largura: 14, formato: "decimal1" },
    { titulo: "Quiz", chave: "quiz", largura: 8, formato: "decimal1" },
    { titulo: "Avaliação final", chave: "avaliacao_final", largura: 14, formato: "decimal1" },
    { titulo: "Média", chave: "media", largura: 8, formato: "decimal1" },
    { titulo: "Resultado", chave: "resultado", largura: 14 },
    { titulo: "Observação", chave: "observacao", largura: 40 },
  ], juntar((g) => g.rotina?.avaliacao_individual || []));

  aba(wb, "Rotina - Atividades", [...pref,
    { titulo: "Data", chave: "data", largura: 12, formato: "data" },
    { titulo: "Atividade", chave: "tipo", largura: 28 },
    { titulo: "Minutos", chave: "minutos", largura: 9, formato: "inteiro" },
    { titulo: "Instrutor", chave: "instrutor", largura: 22 },
    { titulo: "Pessoa", chave: "pessoa", largura: 24 },
    { titulo: "Tema", chave: "tema", largura: 24 },
    { titulo: "Observação", chave: "observacao", largura: 40 },
  ], juntar((g) => g.rotina?.atividades || []));

  aba(wb, "Mural", [...pref,
    { titulo: "Data", chave: "data", largura: 18 },
    { titulo: "Autor", chave: "autor", largura: 22 },
    { titulo: "Título", chave: "titulo", largura: 30 },
    { titulo: "Aviso", chave: "conteudo", largura: 80 },
    { titulo: "Fixado", chave: "fixado", largura: 8 },
  ], juntar((g) => (g.mural || []).map((m) => ({ ...m, data: dataHoraBR(m.data), fixado: m.fixado ? "Sim" : "" }))));

  aba(wb, "Ocorrências de presença", [...pref,
    { titulo: "Data", chave: "data", largura: 12, formato: "data" },
    { titulo: "Participante", chave: "participante", largura: 30 },
    { titulo: "Situação", chave: "status", largura: 14 },
    { titulo: "Justificativa", chave: "justificativa", largura: 60 },
  ], juntar((g) => (g.ocorrencias_presenca || []).map((o) => ({ ...o, status: STATUS_PRES[o.status] || o.status }))));
}

function situacaoParticipante(p) {
  if (p.frequencia_pct === null) return "Sem chamada";
  return p.abaixo_do_minimo ? "Abaixo do mínimo" : "Dentro do mínimo";
}
const linhasPart = (r) => r.participantes.map((p) => ({ ...p, situacao: situacaoParticipante(p) }));

function fichaResumo(wb, r) {
  const t = r.turma, e = r.execucao, p = r.presenca, n = r.nps;
  const ws = wb.addWorksheet("Resumo");
  ws.columns = [{ width: 34 }, { width: 60 }];
  let linha = 1;
  const titulo = (txt) => {
    ws.mergeCells(linha, 1, linha, 2);
    const c = ws.getCell(linha, 1);
    c.value = txt;
    c.font = { bold: true, size: 12 };
    estilizarCabecalho(ws, linha, 2);
    linha += 1;
  };
  const item = (rotulo, valor, formato) => {
    ws.getCell(linha, 1).value = rotulo;
    ws.getCell(linha, 1).font = { bold: true };
    const c = escreverCelula(ws, linha, 2, valor, formato);
    c.alignment = { horizontal: "left", wrapText: true, vertical: "top" };
    linha += 1;
  };
  ws.mergeCells(linha, 1, linha, 2);
  ws.getCell(linha, 1).value = `Relatório geral da turma — ${t.tema}`;
  ws.getCell(linha, 1).font = { bold: true, size: 14 };
  linha += 1;
  item("Gerado em", dataBR(r.gerado_em.slice(0, 10)));
  linha += 1;

  titulo("Identificação");
  item("Turma", t.tema);
  item("Cliente", t.cliente || "-");
  item("Subtipo", t.subtipo || "-");
  item("Público", t.publico || "-");
  item("Situação da turma", t.status_turma || t.status || "-");
  item("Instrutor(es)", t.instrutores.join(", ") || "-");
  item("Supervisor", t.supervisor || "-");
  item("Sala / local", t.sala || "-");
  item("Período", periodo(t));
  item("Horário", t.hora_inicio ? `${t.hora_inicio}${t.hora_fim ? ` às ${t.hora_fim}` : ""}` : "-");
  linha += 1;

  titulo("Execução");
  item("Carga horária prevista (h)", e.horas_planejadas, "decimal1");
  item("Horas aplicadas (h)", e.horas_aplicadas, "decimal1");
  item("Aderência de horas", e.aderencia_horas_pct, "percentual");
  item("Dias planejados", e.dias_planejados, "inteiro");
  item("Dias concluídos", e.dias_concluidos, "inteiro");
  item("Dias reprogramados", e.dias_reprogramados, "inteiro");
  item("Dias cancelados", e.dias_cancelados, "inteiro");
  linha += 1;

  titulo("Presença");
  item("Participantes previstos", p.previstos, "inteiro");
  item("Participantes na lista", p.confirmados, "inteiro");
  item("Presentes (pessoas)", p.presentes_pessoas, "inteiro");
  item("Ausentes (pessoas)", p.ausentes_pessoas, "inteiro");
  item("Justificados (pessoas)", p.justificados_pessoas, "inteiro");
  item("Taxa de presença", p.taxa_presenca_pessoas, "percentual");
  item("Presença mínima da turma", p.minimo_pct, "percentual");
  item("Abaixo do mínimo", r.participantes.filter((x) => x.abaixo_do_minimo).length, "inteiro");
  linha += 1;

  titulo("Qualidade");
  item("Respostas de NPS", n.respostas, "inteiro");
  item("NPS (promotores − detratores)", n.nps_score, "decimal1");
  item("Nota média (0 a 10)", n.nota_media, "decimal1");
  item("Promotores / neutros / detratores", `${n.promotores} / ${n.neutros} / ${n.detratores}`);
  item("Taxa de resposta", n.taxa_resposta_pct, "percentual");
  item("Média das provas", r.avaliacoes.media_prova, "decimal1");
  item("Certificados emitidos", r.certificados.emitidos, "inteiro");
  const g = r.registros || {};
  if (g.diario || g.mural || (g.ocorrencias_presenca || []).length) {
    linha += 1;
    titulo("Registros da turma");
    if (g.diario) item("Dias com registro no diário de bordo", g.diario.length, "inteiro");
    if (g.rotina) item("Itens de checklist respondidos", g.rotina.checklist.filter((c) => c.resposta).length, "inteiro");
    if (g.rotina) item("Tarefas da rotina feitas", `${g.rotina.tarefas.filter((t) => t.feito).length} de ${g.rotina.tarefas.length}`);
    if (g.mural) item("Avisos no mural", g.mural.length, "inteiro");
    item("Ocorrências de presença com justificativa", (g.ocorrencias_presenca || []).length, "inteiro");
  }
}

function abaNps(wb, r) {
  const n = r.nps;
  const ws = wb.addWorksheet("NPS");
  ws.columns = [{ width: 34 }, { width: 14 }, { width: 80 }];
  let linha = 1;
  ws.getCell(linha, 1).value = "Critério (1 a 5)";
  ws.getCell(linha, 2).value = "Média";
  ws.getCell(linha, 3).value = "Respostas";
  estilizarCabecalho(ws, linha, 3);
  linha += 1;
  if (!n.criterios.length) {
    ws.getCell(linha, 1).value = "Sem respostas de critérios.";
    linha += 1;
  }
  n.criterios.forEach((c) => {
    ws.getCell(linha, 1).value = c.rotulo;
    escreverCelula(ws, linha, 2, c.media, "decimal1");
    ws.getCell(linha, 3).value = c.respostas;
    ws.getCell(linha, 3).alignment = { horizontal: "left" };
    linha += 1;
  });
  linha += 1;
  ws.getCell(linha, 1).value = "Nota";
  ws.getCell(linha, 2).value = "Classe";
  ws.getCell(linha, 3).value = "Comentário (sem identificação)";
  estilizarCabecalho(ws, linha, 3);
  linha += 1;
  if (!n.comentarios.length) {
    ws.getCell(linha, 1).value = "Sem comentários.";
  }
  n.comentarios.forEach((c) => {
    ws.getCell(linha, 1).value = c.nota;
    ws.getCell(linha, 1).alignment = { horizontal: "left" };
    ws.getCell(linha, 2).value = c.classe === "promotor" ? "Promotor" : c.classe === "neutro" ? "Neutro" : "Detrator";
    const cel = ws.getCell(linha, 3);
    cel.value = c.texto;
    cel.alignment = { wrapText: true, vertical: "top" };
    linha += 1;
  });
}

/** Excel de uma turma. Devolve o workbook. */
function excelDaTurma(r) {
  const wb = novoWorkbook();
  fichaResumo(wb, r);
  adicionarTabela(wb, { nomeAba: "Cronograma", colunas: COLS_CRON, linhas: r.cronograma });
  adicionarTabela(wb, { nomeAba: "Participantes", colunas: COLS_PART, linhas: linhasPart(r) });
  abaNps(wb, r);
  adicionarTabela(wb, { nomeAba: "Avaliações", colunas: COLS_AV, linhas: r.avaliacoes.itens });
  abasRegistros(wb, [r], false);
  return wb;
}

/** Excel consolidado de várias turmas. */
function excelDoLote(relatorios) {
  const wb = novoWorkbook();
  const colunasTurma = [
    { titulo: "Turma", chave: "tema", largura: 32 },
    { titulo: "Cliente", chave: "cliente", largura: 20 },
    { titulo: "Instrutor(es)", chave: "instrutores", largura: 26 },
    { titulo: "Supervisor", chave: "supervisor", largura: 22 },
    { titulo: "Situação", chave: "situacao", largura: 16 },
    { titulo: "Data início", chave: "data_inicio", largura: 12, formato: "data" },
    { titulo: "Data fim", chave: "data_fim", largura: 12, formato: "data" },
    { titulo: "CH prevista", chave: "ch_prevista", largura: 11, formato: "decimal1" },
    { titulo: "Horas aplicadas", chave: "ch_aplicada", largura: 14, formato: "decimal1" },
    { titulo: "Participantes", chave: "participantes", largura: 13, formato: "inteiro" },
    { titulo: "Taxa de presença", chave: "presenca", largura: 15, formato: "percentual" },
    { titulo: "Abaixo do mínimo", chave: "abaixo", largura: 15, formato: "inteiro" },
    { titulo: "Respostas NPS", chave: "resp_nps", largura: 13, formato: "inteiro" },
    { titulo: "NPS", chave: "nps", largura: 8, formato: "decimal1" },
    { titulo: "Média das provas", chave: "media_prova", largura: 15, formato: "decimal1" },
    { titulo: "Certificados", chave: "certificados", largura: 12, formato: "inteiro" },
  ];
  adicionarTabela(wb, {
    nomeAba: "Turmas",
    colunas: colunasTurma,
    linhas: relatorios.map((r) => ({
      tema: r.turma.tema,
      cliente: r.turma.cliente || "-",
      instrutores: r.turma.instrutores.join(", ") || "-",
      supervisor: r.turma.supervisor || "-",
      situacao: r.turma.status_turma || r.turma.status || "-",
      data_inicio: r.turma.data_inicio,
      data_fim: r.turma.data_fim,
      ch_prevista: r.execucao.horas_planejadas,
      ch_aplicada: r.execucao.horas_aplicadas,
      participantes: r.presenca.confirmados,
      presenca: r.presenca.taxa_presenca_pessoas,
      abaixo: r.participantes.filter((x) => x.abaixo_do_minimo).length,
      resp_nps: r.nps.respostas,
      nps: r.nps.nps_score,
      media_prova: r.avaliacoes.media_prova,
      certificados: r.certificados.emitidos,
    })),
  });

  const comTurma = (r, l) => ({ turma: r.turma.tema, cliente: r.turma.cliente || "-", ...l });
  const prefixo = [
    { titulo: "Turma", chave: "turma", largura: 30 },
    { titulo: "Cliente", chave: "cliente", largura: 18 },
  ];
  adicionarTabela(wb, {
    nomeAba: "Participantes",
    colunas: [...prefixo, ...COLS_PART],
    linhas: relatorios.flatMap((r) => linhasPart(r).map((l) => comTurma(r, l))),
  });
  adicionarTabela(wb, {
    nomeAba: "Cronograma",
    colunas: [...prefixo, ...COLS_CRON],
    linhas: relatorios.flatMap((r) => r.cronograma.map((l) => comTurma(r, l))),
  });
  adicionarTabela(wb, {
    nomeAba: "Comentários NPS",
    colunas: [...prefixo, { titulo: "Nota", chave: "nota", largura: 8, formato: "inteiro" }, { titulo: "Classe", chave: "classe", largura: 12 }, { titulo: "Comentário (sem identificação)", chave: "texto", largura: 80 }],
    linhas: relatorios.flatMap((r) => r.nps.comentarios.map((c) => comTurma(r, { nota: c.nota, classe: c.classe === "promotor" ? "Promotor" : c.classe === "neutro" ? "Neutro" : "Detrator", texto: c.texto }))),
  });
  adicionarTabela(wb, {
    nomeAba: "Avaliações",
    colunas: [...prefixo, ...COLS_AV],
    linhas: relatorios.flatMap((r) => r.avaliacoes.itens.map((l) => comTurma(r, l))),
  });
  abasRegistros(wb, relatorios, true);
  return wb;
}

module.exports = { excelDaTurma, excelDoLote, nomeArquivoSeguro };
