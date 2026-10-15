/**
 * presencaLegadaParaCronograma.js (15/10/2026) — "chamada sem cronograma".
 *
 * Turma antiga que só tem chamada na tabela legada `presencas` (nome livre +
 * data) passa a poder ganhar cronograma e continuar a chamada pelo cronograma.
 * O problema: no momento em que a primeira chamada do cronograma é lançada, o
 * presencaResolver passa a usar SÓ o cronograma para aquela turma (ver
 * "cronograma > legado") — e a chamada antiga sumiria das taxas. Para isso não
 * acontecer, ao gerar o cronograma encaixamos cada registro legado no dia
 * correspondente de presenca_aulas (mesma data + mesmo participante da turma).
 *
 * Nada do legado é apagado: `presencas` continua intacta. O que não encaixa
 * (data fora dos dias gerados, nome que não bate com a lista da turma) é
 * contado e devolvido para a tela avisar o usuário, nunca descartado em
 * silêncio. Encaixar nunca sobrescreve uma presença que já exista no dia.
 */

function normalizarNome(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function statusLegado(linha) {
  const texto = String(linha.status || "").toLowerCase();
  if (texto.includes("justif")) return "justificado";
  if (texto.includes("ausente") || texto.includes("falta")) return "ausente";
  if (texto.includes("pendente")) return null; // nada a registrar
  if (texto.includes("presente")) return "presente";
  return Number(linha.presente) ? "presente" : "ausente";
}

/**
 * @param db            pool/conexão com .query
 * @param treinamentoId id da turma
 * @param datasAulas    Set de datas ("YYYY-MM-DD") que existem (ou existirão) no cronograma
 * @returns {{total, encaixaveis:[{data,nome,status,justificativa}], sem_dia, sem_participante, pendentes}}
 */
async function planejarImportacao(db, treinamentoId, datasAulas) {
  const [legado] = await db.query(
    `SELECT id, DATE_FORMAT(data_chamada, '%Y-%m-%d') AS data, treinando_nome, presente, status, justificativa
     FROM presencas WHERE treinamento_id = ? ORDER BY id ASC`,
    [treinamentoId]
  );
  const [participantes] = await db.query(
    `SELECT nome FROM treinamento_participantes WHERE treinamento_id = ?`,
    [treinamentoId]
  );
  const nomesOficiais = new Map();
  for (const p of participantes) nomesOficiais.set(normalizarNome(p.nome), p.nome);

  const porChave = new Map(); // data|nome -> registro (o último lançamento vence)
  let semDia = 0;
  let semParticipante = 0;
  let pendentes = 0;

  for (const linha of legado) {
    if (!datasAulas.has(linha.data)) { semDia += 1; continue; }
    const oficial = nomesOficiais.get(normalizarNome(linha.treinando_nome));
    if (!oficial) { semParticipante += 1; continue; }
    const status = statusLegado(linha);
    if (!status) { pendentes += 1; continue; }
    porChave.set(`${linha.data}|${normalizarNome(oficial)}`, {
      data: linha.data,
      nome: oficial,
      status,
      justificativa: status === "justificado" ? (linha.justificativa || "Justificativa não registrada (chamada antiga)") : null,
    });
  }

  return {
    total: legado.length,
    encaixaveis: Array.from(porChave.values()),
    sem_dia: semDia,
    sem_participante: semParticipante,
    pendentes,
  };
}

// Grava de uma vez só (um INSERT multi-linha: ou entra tudo ou nada).
async function gravarImportacao(db, treinamento, mapaDataAulaId, encaixaveis) {
  const valores = encaixaveis
    .filter((e) => mapaDataAulaId.has(e.data))
    .map((e) => [
      mapaDataAulaId.get(e.data),
      treinamento.id,
      e.data,
      e.nome,
      e.status,
      e.justificativa,
      treinamento.empresa_id || null,
    ]);
  if (!valores.length) return 0;
  await db.query(
    `INSERT INTO presenca_aulas (turma_aula_id, treinamento_id, data_aula, treinando_nome, status, justificativa, empresa_id)
     VALUES ?
     ON DUPLICATE KEY UPDATE id = id`,
    [valores]
  );
  return valores.length;
}

module.exports = { planejarImportacao, gravarImportacao, normalizarNome };
