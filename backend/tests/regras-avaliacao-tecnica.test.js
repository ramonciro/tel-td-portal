// Regras da Avaliação Técnica: falta justificada = falta, desistente sai das contas e
// 3 faltas ou mais = eliminado do processo seletivo (desistência automática + Reprovado na avaliação individual).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const F = require("./helpers/fabrica");
const regras = require("../src/services/turmaRegras");
const { aplicarEliminacaoPorFaltas, LIMITE_FALTAS, sqlEliminadoPorFaltas } = require("../src/services/eliminacaoFaltasService");

let emp;
before(async () => { emp = await F.criarEmpresa(); });
after(async () => { await F.pool.end(); });

// Turma com N aulas; devolve as aulas.
async function turmaComAulas(subtipo, n = 4) {
  const turma = await F.criarTurma({ empresa_id: emp.id, subtipo });
  const aulas = [];
  for (let i = 1; i <= n; i++) aulas.push(await F.criarAula(turma, `2026-11-${String(i + 1).padStart(2, "0")}`, i));
  return { turma, aulas };
}
const situacao = async (p) => {
  const [[r]] = await F.pool.query("SELECT desistencia_em, desistencia_motivo, desistencia_por FROM treinamento_participantes WHERE id = ?", [p.id]);
  return r;
};

test("limite de faltas é 3", () => assert.equal(LIMITE_FALTAS, 3));

test("aplicarRegraJustificado: na Avaliação Técnica justificado vira falta; nas outras turmas não", () => {
  assert.deepEqual(
    regras.aplicarRegraJustificado(true, { presente: 5, ausente: 1, justificado: 2 }),
    { presente: 5, ausente: 3, justificado: 0, faltasJustificadas: 2 }
  );
  assert.deepEqual(
    regras.aplicarRegraJustificado(false, { presente: 5, ausente: 1, justificado: 2 }),
    { presente: 5, ausente: 1, justificado: 2, faltasJustificadas: 0 }
  );
});

test("o matcher reconhece 'Avaliação Técnica' (sem acento/maiúscula) e rejeita outros subtipos", async () => {
  const eh = await regras.criarMatcherAvaliacaoTecnica();
  assert.equal(eh("Avaliação Técnica"), true);
  assert.equal(eh("avaliacao tecnica"), true);
  assert.equal(eh("Treinamento Técnico"), false);
  assert.equal(eh(null), false);
});

test("3 faltas eliminam; 2 faltas não", async () => {
  const { turma, aulas } = await turmaComAulas("Avaliação Técnica");
  const tres = await F.criarParticipante(turma);
  const duas = await F.criarParticipante(turma);
  for (const a of aulas.slice(0, 3)) await F.lancarPresenca(a, tres, "ausente");
  for (const a of aulas.slice(0, 2)) await F.lancarPresenca(a, duas, "ausente");
  await F.lancarPresenca(aulas[2], duas, "presente");

  const r = await aplicarEliminacaoPorFaltas(turma.id);
  assert.deepEqual(r.eliminados.map((e) => e.id), [tres.id]);
  const s3 = await situacao(tres);
  assert.ok(s3.desistencia_em);
  assert.equal(s3.desistencia_por, "Sistema");
  assert.match(s3.desistencia_motivo, /^Eliminado por faltas \(3 faltas\)$/);
  assert.equal((await situacao(duas)).desistencia_em, null);
});

test("falta justificada conta como falta na eliminação", async () => {
  const { turma, aulas } = await turmaComAulas("Avaliação Técnica");
  const p = await F.criarParticipante(turma);
  await F.lancarPresenca(aulas[0], p, "ausente");
  await F.lancarPresenca(aulas[1], p, "justificado", "Atestado");
  await F.lancarPresenca(aulas[2], p, "justificado", "Consulta");
  const r = await aplicarEliminacaoPorFaltas(turma.id);
  assert.equal(r.eliminados.length, 1);
  assert.equal(r.eliminados[0].faltas, 3);
});

test("turma que não é de Avaliação Técnica não elimina ninguém", async () => {
  const { turma, aulas } = await turmaComAulas("Treinamento Técnico");
  const p = await F.criarParticipante(turma);
  for (const a of aulas.slice(0, 3)) await F.lancarPresenca(a, p, "ausente");
  assert.deepEqual((await aplicarEliminacaoPorFaltas(turma.id)).eliminados, []);
  assert.equal((await situacao(p)).desistencia_em, null);
});

test("aula cancelada não conta como falta", async () => {
  const { turma, aulas } = await turmaComAulas("Avaliação Técnica");
  const p = await F.criarParticipante(turma);
  for (const a of aulas.slice(0, 3)) await F.lancarPresenca(a, p, "ausente");
  await F.pool.query("UPDATE turma_aulas SET status_execucao = 'cancelada' WHERE id = ?", [aulas[2].id]);
  assert.deepEqual((await aplicarEliminacaoPorFaltas(turma.id)).eliminados, [], "só 2 faltas valem");
  assert.equal((await situacao(p)).desistencia_em, null);
});

test("a eliminação é idempotente, reduz o total da turma e marca Reprovado na avaliação individual", async () => {
  const { turma, aulas } = await turmaComAulas("Avaliação Técnica");
  const p = await F.criarParticipante(turma);
  const outro = await F.criarParticipante(turma);
  for (const a of aulas.slice(0, 3)) await F.lancarPresenca(a, p, "ausente");

  await aplicarEliminacaoPorFaltas(turma.id);
  const segunda = await aplicarEliminacaoPorFaltas(turma.id);
  assert.deepEqual(segunda.eliminados, [], "rodar de novo não elimina outra vez");

  const [[t]] = await F.pool.query("SELECT participantes FROM treinamentos WHERE id = ?", [turma.id]);
  assert.equal(Number(t.participantes), 1, "só o outro continua ativo");
  const [[av]] = await F.pool.query("SELECT resultado, observacao, atualizado_por FROM rotina_avaliacao_individual WHERE treinamento_id = ? AND participante_id = ?", [turma.id, p.id]);
  assert.equal(av.resultado, "nao_seguiu");
  assert.match(av.observacao, /Eliminado por faltas/);
  const [[sem]] = await F.pool.query("SELECT COUNT(*) AS n FROM rotina_avaliacao_individual WHERE treinamento_id = ? AND participante_id = ?", [turma.id, outro.id]);
  assert.equal(Number(sem.n), 0);
});

test("quem teve a eliminação desfeita não é eliminado de novo", async () => {
  const { turma, aulas } = await turmaComAulas("Avaliação Técnica");
  const p = await F.criarParticipante(turma);
  for (const a of aulas.slice(0, 3)) await F.lancarPresenca(a, p, "ausente");
  await aplicarEliminacaoPorFaltas(turma.id);
  // o botão "desfazer desistência" limpa a desistência e liga a marca de revertido
  await F.pool.query("UPDATE treinamento_participantes SET desistencia_em = NULL, desistencia_motivo = NULL, desistencia_por = NULL, eliminacao_faltas_revertida = 1 WHERE id = ?", [p.id]);
  assert.deepEqual((await aplicarEliminacaoPorFaltas(turma.id)).eliminados, []);
  assert.equal((await situacao(p)).desistencia_em, null);
});

test("sqlEliminadoPorFaltas separa eliminado por faltas de desistência comum", async () => {
  const { turma } = await turmaComAulas("Avaliação Técnica", 1);
  const elim = await F.criarParticipante(turma);
  const desist = await F.criarParticipante(turma);
  await F.pool.query("UPDATE treinamento_participantes SET desistencia_em = NOW(), desistencia_motivo = 'Eliminado por faltas (3 faltas)' WHERE id = ?", [elim.id]);
  await F.pool.query("UPDATE treinamento_participantes SET desistencia_em = NOW(), desistencia_motivo = 'Mudou de cidade' WHERE id = ?", [desist.id]);
  const [rows] = await F.pool.query(`SELECT p.id FROM treinamento_participantes p WHERE p.treinamento_id = ? AND ${sqlEliminadoPorFaltas("p")}`, [turma.id]);
  assert.deepEqual(rows.map((r) => r.id), [elim.id]);
});

test("desistente sai das contas de presença (sqlSemDesistente)", async () => {
  const { turma, aulas } = await turmaComAulas("Avaliação Técnica", 1);
  const ativo = await F.criarParticipante(turma);
  const desist = await F.criarParticipante(turma);
  await F.lancarPresenca(aulas[0], ativo, "presente");
  await F.lancarPresenca(aulas[0], desist, "ausente");
  await F.pool.query("UPDATE treinamento_participantes SET desistencia_em = NOW() WHERE id = ?", [desist.id]);
  const [rows] = await F.pool.query(`SELECT x.treinando_nome FROM presenca_aulas x WHERE x.treinamento_id = ? AND ${regras.sqlSemDesistente("x")}`, [turma.id]);
  assert.deepEqual(rows.map((r) => r.treinando_nome), [ativo.nome]);
});
