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
function sqlSemDesistente(alias) {
  const a = alias;
  return `(
    NOT EXISTS (
      SELECT 1 FROM treinamento_participantes dz
      WHERE dz.treinamento_id = ${a}.treinamento_id AND dz.nome = ${a}.treinando_nome AND dz.desistencia_em IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM treinamento_participantes ax
      WHERE ax.treinamento_id = ${a}.treinamento_id AND ax.nome = ${a}.treinando_nome AND ax.desistencia_em IS NULL
    )
  )`;
}

// Aplica a regra "justificado = falta" a um trio de contagens.
function aplicarRegraJustificado(ehAvaliacaoTecnica, { presente, ausente, justificado }) {
  if (!ehAvaliacaoTecnica) return { presente, ausente, justificado, faltasJustificadas: 0 };
  return { presente, ausente: ausente + justificado, justificado: 0, faltasJustificadas: justificado };
}

module.exports = {
  criarMatcherAvaliacaoTecnica,
  sqlSemDesistente,
  aplicarRegraJustificado,
};
