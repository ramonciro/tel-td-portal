// turmaRegras.js
//
// Regras de turma compartilhadas por quem conta presença/participantes
// (presencaResolver, grade de presença, Reembolso de Transporte, relatório da
// turma, dashboard). Duas regras, pedidas pelo Ramon em 11/11/2026:
//
//   1) Turma de Avaliação Técnica: falta JUSTIFICADA conta como FALTA no
//      cálculo de presença (nunca como presente, nunca como dia de VT). A
//      justificativa continua registrada; só não "salva" o candidato. As
//      outras turmas seguem como antes (justificado fica fora do cálculo).
//
//   2) Desistência do candidato: quem desistiu continua listado na turma (com
//      a marca "Desistente", para histórico), mas sai da conta — total da
//      turma, chamada, % de presença, VT e relatórios. É reversível.
//      Gravada em treinamento_participantes.desistencia_em (NULL = ativo).

const { nomesAvaliacaoTecnica, normalizarChave } = require("../lib/subtipos");

// Devolve uma função (subtipo) => boolean, que diz se o subtipo é Avaliação
// Técnica (aceita o nome atual e o nome original, como o resto do sistema).
async function criarMatcherAvaliacaoTecnica() {
  const { nomes } = await nomesAvaliacaoTecnica();
  const chaves = new Set(nomes.map((n) => normalizarChave(n)));
  return (subtipo) => {
    const k = normalizarChave(subtipo);
    return !!k && chaves.has(k);
  };
}

// Fragmento SQL para tabelas de presença (presencas / presenca_aulas), que
// guardam treinamento_id + treinando_nome: deixa de fora as linhas de quem
// desistiu. Se houver outra pessoa ativa com o mesmo nome na turma, a linha
// é mantida (a presença é por nome; não dá para separar homônimos).
//
// 16/11/2026 (auditoria de participantes): a presença de quem FOI EXCLUÍDO da turma também fica de fora. Antes só os
// desistentes saíam; quem era excluído da lista deixava a chamada por aula (presenca_aulas) para trás e continuava
// somando em "confirmados", % de presença e aderência. Regra: a linha de presença só vale se a pessoa está ativa na
// lista da turma. Exceção: turma que nunca teve lista (histórico antigo só com chamada) mantém tudo como antes.
function sqlSemDesistente(alias) {
  const a = alias;
  return `(
    EXISTS (
      SELECT 1 FROM treinamento_participantes ax
      WHERE ax.treinamento_id = ${a}.treinamento_id AND ax.nome = ${a}.treinando_nome AND ax.desistencia_em IS NULL
    )
    OR (
      NOT EXISTS (
        SELECT 1 FROM treinamento_participantes dz
        WHERE dz.treinamento_id = ${a}.treinamento_id AND dz.nome = ${a}.treinando_nome
      )
      AND NOT EXISTS (
        SELECT 1 FROM treinamento_participantes qq WHERE qq.treinamento_id = ${a}.treinamento_id
      )
    )
  )`;
}

// Aplica a regra "justificado = falta" a um trio de contagens.
function aplicarRegraJustificado(ehAvaliacaoTecnica, { presente, ausente, justificado }) {
  if (!ehAvaliacaoTecnica) return { presente, ausente, justificado, faltasJustificadas: 0 };
  return { presente, ausente: ausente + justificado, justificado: 0, faltasJustificadas: justificado };
}

// Quantas pessoas a turma tem de verdade: os participantes ATIVOS da lista (desistente não conta). Turma que ainda não
// tem lista nenhuma usa o número digitado no cadastro da turma (estimativa). `tabela` é o alias/nome de treinamentos
// na consulta externa. Este é o ÚNICO jeito de ler "participantes da turma" — o campo gravado (treinamentos.participantes)
// é só a estimativa inicial e o espelho da lista, e ficava velho quando alguém era excluído.
function sqlParticipantesDaTurma(tabela = "t") {
  return `(CASE WHEN EXISTS (SELECT 1 FROM treinamento_participantes px WHERE px.treinamento_id = ${tabela}.id)
    THEN (SELECT COUNT(*) FROM treinamento_participantes py WHERE py.treinamento_id = ${tabela}.id AND py.desistencia_em IS NULL)
    ELSE COALESCE(${tabela}.participantes, 0) END)`;
}

// Grava em treinamentos.participantes a contagem real (ativos da lista) das turmas informadas. Chamar sempre que alguém
// entra, sai ou é excluído de uma turma. Com { soComLista: true } (usado na correção em lote), turma que não tem lista
// nenhuma não é tocada — ela mantém a estimativa digitada no cadastro.
async function recontarParticipantesDasTurmas(conn, ids, { soComLista = false } = {}) {
  const lista = [...new Set((Array.isArray(ids) ? ids : [ids]).map(Number).filter((v) => Number.isInteger(v) && v > 0))];
  for (const id of lista) {
    const [[c]] = await conn.query(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN desistencia_em IS NULL THEN 1 ELSE 0 END) AS ativos
         FROM treinamento_participantes WHERE treinamento_id = ?`,
      [id]
    );
    if (soComLista && Number(c?.total || 0) === 0) continue;
    await conn.query(`UPDATE treinamentos SET participantes = ? WHERE id = ?`, [Number(c?.ativos || 0), id]);
  }
}

module.exports = {
  criarMatcherAvaliacaoTecnica,
  sqlSemDesistente,
  sqlParticipantesDaTurma,
  recontarParticipantesDasTurmas,
  aplicarRegraJustificado,
};
