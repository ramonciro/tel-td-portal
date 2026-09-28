/**
 * identidadeTreinando.js — 25/09/2026
 *
 * Item "Em seguida" combinado com o Ramon logo depois da entrega de
 * inclusão de usuários (treinandos) do mesmo dia: os controllers de
 * avaliação (NPS em avaliacoesTreinandosController.js, provas/simulados em
 * materiaisAvaliativosController.js e respostasAvaliativasController.js)
 * decidiam "este registro é deste treinando mesmo?" comparando
 * treinando_nome / tp.nome por igualdade de string exata contra
 * req.user.nome — sinalizado como risco de LGPD no relatório de 25/09/2026
 * (dois treinandos com o mesmo nome, no mesmo tenant, colidiam nessa
 * comparação: um via as respostas do outro).
 *
 * condicaoIdentidade() centraliza a troca dessa comparação por pessoa_id,
 * sem quebrar nada que já funcionava:
 *   - Se a conta logada tem pessoa_id (usuarios.pessoa_id — toda conta
 *     gerada em lote a partir de 25/09/2026 nasce com ele, ver
 *     provisionamentoUsuariosService.js): compara por pessoa_id quando a
 *     linha do outro lado também tem; se a linha do outro lado for antiga
 *     e ainda não tiver pessoa_id (participante importado antes do
 *     backfill), cai pra comparação por nome só pra essa linha — nunca
 *     esconde um dado que antes aparecia.
 *   - Se a conta logada NÃO tem pessoa_id (conta antiga, criada à mão antes
 *     da Fase 0 ou sem ter passado pela importação de turma): comportamento
 *     idêntico ao que já existia, comparação por nome.
 *
 * Result shape: { sql: string, params: any[] } — sql é uma condição pronta
 * pra entrar num AND/JOIN...ON, params na mesma ordem dos "?" dentro dela.
 */
function condicaoIdentidade(alias, colunaNome, pessoaId, nomeUsuario) {
  if (pessoaId) {
    return {
      sql: `(${alias}.pessoa_id = ? OR (${alias}.pessoa_id IS NULL AND ${alias}.${colunaNome} = ?))`,
      params: [pessoaId, nomeUsuario],
    };
  }
  return {
    sql: `${alias}.${colunaNome} = ?`,
    params: [nomeUsuario],
  };
}

module.exports = { condicaoIdentidade };
