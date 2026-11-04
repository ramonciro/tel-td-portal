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
async function buscarConflitosSala({ salaId, dataInicio, dataFim, horaInicio, horaFim, excluirTreinamentoId, excluirBloqueioId }) {
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

  // Turma online não ocupa sala física (04/11/2026): se ainda sobrou um sala_id numa turma marcada como
  // online, ele não gera conflito.
  const [turmas] = await pool.query(
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
      AND (t.modalidade IS NULL OR LOWER(TRIM(t.modalidade)) <> 'online')
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

  // Bloqueios de sala (reserva sem turma). Mesmo formato de linha, com tipo "bloqueio":
  // `tema` carrega o motivo e `cliente` o rótulo, para as mensagens e o Radar seguirem funcionando.
  const paramsB = [salaId, String(dataFim).slice(0, 10), String(dataInicio).slice(0, 10), String(horaFim).slice(0, 5), String(horaInicio).slice(0, 5)];
  let excludeB = "";
  if (excluirBloqueioId) {
    excludeB = " AND b.id <> ?";
    paramsB.push(excluirBloqueioId);
  }
  let bloqueios = [];
  try {
    const [rows] = await pool.query(
      `
      SELECT b.id, b.motivo AS tema, 'Bloqueio de sala' AS cliente, b.empresa_id,
             b.data_inicio, b.data_fim, b.hora_inicio, b.hora_fim
        FROM sala_bloqueios b
       WHERE b.sala_id = ? AND b.ativo = 1
         AND b.data_inicio <= ? AND b.data_fim >= ?
         AND b.hora_inicio < ? AND b.hora_fim > ?
         ${excludeB}
       ORDER BY b.data_inicio ASC
      `,
      paramsB
    );
    bloqueios = rows;
  } catch (e) {
    // tabela ainda não migrada: segue só com as turmas
  }

  return [
    ...turmas.map((r) => ({ ...r, tipo: "turma" })),
    ...bloqueios.map((r) => ({ ...r, tipo: "bloqueio" })),
  ];
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


function somarDiasISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Agenda das salas (04/11/2026): o que ocupa cada sala em cada dia da janela, de QUALQUER ambiente
 * (sala compartilhada — mesma regra de visibilidade da conferência de conflito). Cada turma ocupa a
 * sala em todos os dias do período dela, no horário informado — exatamente a regra do conflito, para
 * a agenda nunca mostrar "livre" onde o formulário vai bloquear.
 *
 * @returns {{ salas: object[], ocupacoes: object[] }}
 */
async function agendaSalas({ dataInicio, dataFim }) {
  const ini = String(dataInicio).slice(0, 10);
  const fim = String(dataFim).slice(0, 10);

  const [salas] = await pool.query(
    `SELECT id, nome, capacidade, grupo FROM salas WHERE ativo = 1 ORDER BY grupo ASC, nome ASC`
  );

  const [turmas] = await pool.query(
    `
    SELECT t.id, t.tema, t.cliente, t.instrutor, t.sala_id, t.status,
           DATE_FORMAT(COALESCE(t.data_inicio, t.data), '%Y-%m-%d') AS data_inicio,
           DATE_FORMAT(COALESCE(t.data_fim, t.data_inicio, t.data), '%Y-%m-%d') AS data_fim,
           TIME_FORMAT(t.hora_inicio, '%H:%i') AS hora_inicio,
           TIME_FORMAT(t.hora_fim, '%H:%i') AS hora_fim
      FROM treinamentos t
     WHERE t.sala_id IS NOT NULL
       AND (t.status IS NULL OR LOWER(TRIM(t.status)) NOT LIKE '%cancel%')
       AND (t.modalidade IS NULL OR LOWER(TRIM(t.modalidade)) <> 'online')
       AND DATE_FORMAT(COALESCE(t.data_inicio, t.data), '%Y-%m-%d') <= ?
       AND DATE_FORMAT(COALESCE(t.data_fim, t.data_inicio, t.data), '%Y-%m-%d') >= ?
    `,
    [fim, ini]
  );

  let bloqueios = [];
  try {
    const [rows] = await pool.query(
      `
      SELECT b.id, b.sala_id, b.motivo, b.hora_inicio, b.hora_fim, b.criado_por_id,
             DATE_FORMAT(b.data_inicio, '%Y-%m-%d') AS data_inicio,
             DATE_FORMAT(b.data_fim, '%Y-%m-%d') AS data_fim,
             u.nome AS criado_por
        FROM sala_bloqueios b
        LEFT JOIN usuarios u ON u.id = b.criado_por_id
       WHERE b.ativo = 1 AND b.data_inicio <= ? AND b.data_fim >= ?
      `,
      [fim, ini]
    );
    bloqueios = rows;
  } catch (e) {
    // tabela ainda não migrada
  }

  const ocupacoes = [];
  const expandir = (base, extra) => {
    const de = base.data_inicio > ini ? base.data_inicio : ini;
    const ate = base.data_fim < fim ? base.data_fim : fim;
    for (let d = de, guarda = 0; d <= ate && guarda < 400; d = somarDiasISO(d, 1), guarda += 1) {
      ocupacoes.push({ sala_id: base.sala_id, data: d, hora_inicio: base.hora_inicio, hora_fim: base.hora_fim, ...extra });
    }
  };
  for (const t of turmas) {
    expandir(t, {
      tipo: "turma", id: t.id, tema: t.tema, cliente: t.cliente, instrutor: t.instrutor,
      periodo_inicio: t.data_inicio, periodo_fim: t.data_fim, sem_horario: !(t.hora_inicio && t.hora_fim),
    });
  }
  for (const b of bloqueios) {
    expandir(b, {
      tipo: "bloqueio", id: b.id, tema: b.motivo, cliente: "Bloqueio de sala", criado_por: b.criado_por || null,
      periodo_inicio: b.data_inicio, periodo_fim: b.data_fim, sem_horario: false,
    });
  }
  ocupacoes.sort((a, b) => a.data.localeCompare(b.data) || String(a.hora_inicio || "").localeCompare(String(b.hora_inicio || "")));

  return { salas, ocupacoes };
}

module.exports = {
  agendaSalas,
  somarDiasISO,
  turmaEhRetroativa,
  buscarConflitosSala,
  listarSalasComDisponibilidade,
};
