/**
 * salaConflitoService.js — Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026)
 *
 * Catálogo de salas é GLOBAL (sem empresa_id — ver migrate.js, passo 31 e
 * decisão 8 da proposta): a checagem de conflito e a listagem de
 * disponibilidade varrem TODAS as tenants de propósito, nunca filtram por
 * req.empresaId. Isso é diferente de toda outra consulta do sistema, e é
 * a única exceção "por natureza do dado" (sala física compartilhada), não
 * uma exceção de perfil como a da Assistente de Treinamento (ver
 * lib/tenantScope.js) — aqui não há tenant nenhum a filtrar.
 *
 * Decisão 9: conflito entre tenants mostra o mesmo nível de detalhe que
 * conflito dentro do mesmo tenant (exposição de dado deliberada, restrita a
 * esta tela) — por isso a query devolve tema/cliente/horário do
 * treinamento conflitante sem nenhum corte.
 */
const pool = require("../lib/db");

function hojeISO() {
  const hoje = new Date();
  return [
    hoje.getFullYear(),
    String(hoje.getMonth() + 1).padStart(2, "0"),
    String(hoje.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Decisão 7: turma retroativa (data_fim já no passado) não é bloqueada por
 * conflito de sala, só recebe aviso. `dataFim` no formato "YYYY-MM-DD".
 */
function turmaEhRetroativa(dataFim) {
  if (!dataFim) return false;
  return String(dataFim).slice(0, 10) < hojeISO();
}

/**
 * Busca turmas que conflitam com o período/horário informado numa sala
 * específica, em QUALQUER tenant. Não filtra por status "concluído" (uma
 * sala pode legitimamente já ter sido usada e liberada); filtra apenas
 * turmas canceladas, que não ocupam a sala de verdade.
 *
 * @returns {Promise<object[]>} treinamentos conflitantes com tema, cliente,
 *   empresa_id, data_inicio, data_fim, hora_inicio, hora_fim.
 */
async function buscarConflitosSala({ salaId, dataInicio, dataFim, horaInicio, horaFim, excluirTreinamentoId }) {
  if (!salaId || !dataInicio || !dataFim || !horaInicio || !horaFim) return [];

  const params = [
    salaId,
    dataFim, // t.data_inicio <= dataFim (equivalente a COALESCE(t.data_inicio, t.data))
    dataInicio, // t.data_fim >= dataInicio
    horaFim, // t.hora_inicio < horaFim
    horaInicio, // t.hora_fim > horaInicio
  ];

  let excludeSql = "";
  if (excluirTreinamentoId) {
    excludeSql = " AND t.id <> ?";
    params.push(excluirTreinamentoId);
  }

  const [rows] = await pool.query(
    `
    SELECT
      t.id,
      t.tema,
      t.cliente,
      t.empresa_id,
      COALESCE(t.data_inicio, t.data) AS data_inicio,
      t.data_fim,
      t.hora_inicio,
      t.hora_fim
    FROM treinamentos t
    WHERE t.sala_id = ?
      AND (t.status IS NULL OR LOWER(TRIM(t.status)) NOT LIKE '%cancel%')
      AND COALESCE(t.data_inicio, t.data) <= ?
      AND t.data_fim >= ?
      AND t.hora_inicio IS NOT NULL AND t.hora_fim IS NOT NULL
      AND t.hora_inicio < ?
      AND t.hora_fim > ?
      ${excludeSql}
    ORDER BY COALESCE(t.data_inicio, t.data) ASC
    `,
    params
  );

  return rows;
}

/**
 * Decisão 6: o campo Sala já vem filtrado por disponibilidade depois de
 * informar data(s) e horário. Decisão 8/9: considera todas as tenants.
 * "Outro local" e "Online" não passam por aqui (não fazem parte do
 * catálogo — ver decisão 11).
 */
async function listarSalasComDisponibilidade({ dataInicio, dataFim, horaInicio, horaFim, excluirTreinamentoId }) {
  const [salas] = await pool.query(
    `SELECT id, nome, capacidade, grupo, ativo FROM salas WHERE ativo = 1 ORDER BY grupo ASC, nome ASC`
  );

  const retroativa = turmaEhRetroativa(dataFim);
  const temPeriodo = Boolean(dataInicio && dataFim && horaInicio && horaFim);

  const resultado = [];
  for (const sala of salas) {
    let conflitos = [];
    if (temPeriodo) {
      conflitos = await buscarConflitosSala({
        salaId: sala.id,
        dataInicio,
        dataFim,
        horaInicio,
        horaFim,
        excluirTreinamentoId,
      });
    }

    resultado.push({
      ...sala,
      // Decisão 7: turma retroativa nunca aparece como indisponível — só
      // carrega o(s) conflito(s) pra exibir o aviso não bloqueante.
      disponivel: !temPeriodo || retroativa || conflitos.length === 0,
      conflitos,
    });
  }

  return { salas: resultado, retroativa };
}

module.exports = {
  turmaEhRetroativa,
  buscarConflitosSala,
  listarSalasComDisponibilidade,
};
