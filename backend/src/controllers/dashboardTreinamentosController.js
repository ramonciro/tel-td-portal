const pool = require("../lib/db");

function parseHorasTexto(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;

  const texto = String(valor).toLowerCase().replace(",", ".").trim();
  const match = texto.match(/(\d+(\.\d+)?)/);

  return match ? Number(match[1]) || 0 : 0;
}

function getDiasPeriodo(item) {
  const inicio = item.data_inicio || item.data;
  const fim = item.data_fim || item.data_inicio || item.data;

  if (!inicio || !fim) return 1;

  const d1 = new Date(inicio);
  const d2 = new Date(fim);

  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 1;

  const a = new Date(d1);
  const b = new Date(d2);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);

  const diffMs = b - a;
  const dias = Math.floor(diffMs / 86400000) + 1;

  return dias > 0 ? dias : 1;
}

async function getDashboardTreinamentos(req, res) {
  try {
    const [[treinamentos]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamentos
    `);

    const [[clientesCarteira]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM clientes
    `);

    const [[clientesComTreinamento]] = await pool.query(`
      SELECT COUNT(DISTINCT cliente) AS total
      FROM treinamentos
      WHERE cliente IS NOT NULL
        AND cliente <> ''
    `);

    const [[participantesPrevistos]] = await pool.query(`
      SELECT COALESCE(SUM(participantes), 0) AS total
      FROM treinamentos
    `);

    // Base ativa atual da turma
    const [[treinadosAtivos]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
    `);

    const [[presentesAtivos]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.status_presenca = 'presente'
    `);

    const [[ausentesAtivos]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.status_presenca = 'ausente'
    `);

    const [[justificadosAtivos]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.status_presenca = 'justificado'
    `);

    const [[pendentesAtivos]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.status_presenca IS NULL
         OR tp.status_presenca = ''
         OR tp.status_presenca = 'pendente'
    `);

    // Registros diários reais, mas só de pessoas ainda ativas na turma
    const [[registrosChamada]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM presencas p
      INNER JOIN treinamento_participantes tp
        ON tp.treinamento_id = p.treinamento_id
       AND tp.nome = p.treinando_nome
      INNER JOIN treinamentos t
        ON t.id = p.treinamento_id
    `);

    const [[mediaParticipantesPorTurma]] = await pool.query(`
      SELECT COALESCE(ROUND(AVG(participantes), 1), 0) AS total
      FROM treinamentos
    `);

    const [cargas] = await pool.query(`
      SELECT carga_horaria
      FROM treinamentos
      WHERE carga_horaria IS NOT NULL
        AND carga_horaria <> ''
    `);

    const cargaHorariaTotal = cargas.reduce(
      (acc, item) => acc + parseHorasTexto(item.carga_horaria),
      0
    );

    const [horasTreinadasBase] = await pool.query(`
      SELECT
        t.id,
        t.carga_horaria,
        t.data,
        t.data_inicio,
        t.data_fim,
        p.data_chamada,
        SUM(CASE WHEN p.status = 'presente' THEN 1 ELSE 0 END) AS presentes_dia
      FROM treinamentos t
      LEFT JOIN presencas p
        ON p.treinamento_id = t.id
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = p.treinamento_id
       AND tp.nome = p.treinando_nome
      WHERE p.id IS NULL OR tp.id IS NOT NULL
      GROUP BY
        t.id,
        t.carga_horaria,
        t.data,
        t.data_inicio,
        t.data_fim,
        p.data_chamada
    `);

    const horasTreinadas = horasTreinadasBase.reduce((acc, item) => {
      const horasTotais = parseHorasTexto(item.carga_horaria);
      const diasPeriodo = getDiasPeriodo(item);
      const cargaDia = diasPeriodo > 0 ? horasTotais / diasPeriodo : horasTotais;
      const presentesDia = Number(item.presentes_dia || 0);

      return acc + cargaDia * presentesDia;
    }, 0);

    // Presença por cliente baseada só na base ativa
    const [presencaPorCliente] = await pool.query(`
      SELECT
        t.cliente,
        COUNT(DISTINCT t.id) AS total_turmas,
        COUNT(tp.id) AS total_treinados,
        SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) AS presentes,
        SUM(CASE WHEN tp.status_presenca = 'ausente' THEN 1 ELSE 0 END) AS ausentes,
        SUM(CASE WHEN tp.status_presenca = 'justificado' THEN 1 ELSE 0 END) AS justificados,
        SUM(
          CASE
            WHEN tp.status_presenca IS NULL
              OR tp.status_presenca = ''
              OR tp.status_presenca = 'pendente'
            THEN 1
            ELSE 0
          END
        ) AS pendentes,
        ROUND(
          (
            SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) /
            NULLIF(COUNT(tp.id), 0)
          ) * 100,
          0
        ) AS taxa_presenca
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      WHERE t.cliente IS NOT NULL
        AND t.cliente <> ''
      GROUP BY t.cliente
      ORDER BY total_turmas DESC, total_treinados DESC
      LIMIT 10
    `);

    const [rankingInstrutores] = await pool.query(`
      SELECT
        t.instrutor,
        COUNT(DISTINCT t.id) AS total_turmas,
        COALESCE(SUM(t.participantes), 0) AS treinandos_previstos,
        COUNT(tp.id) AS treinandos_vinculados,
        SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) AS presentes,
        ROUND(
          (
            SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) /
            NULLIF(COUNT(tp.id), 0)
          ) * 100,
          0
        ) AS taxa_presenca
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      WHERE t.instrutor IS NOT NULL
        AND t.instrutor <> ''
      GROUP BY t.instrutor
      ORDER BY total_turmas DESC, treinandos_previstos DESC
      LIMIT 10
    `);

    const [ultimasTurmas] = await pool.query(`
      SELECT
        t.id,
        t.tema,
        t.cliente,
        t.instrutor,
        COALESCE(t.data_fim, t.data_inicio, t.data) AS data,
        t.carga_horaria,
        t.participantes,
        COUNT(tp.id) AS treinados,
        SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) AS presentes,
        SUM(CASE WHEN tp.status_presenca = 'ausente' THEN 1 ELSE 0 END) AS ausentes,
        SUM(CASE WHEN tp.status_presenca = 'justificado' THEN 1 ELSE 0 END) AS justificados,
        SUM(
          CASE
            WHEN tp.status_presenca IS NULL
              OR tp.status_presenca = ''
              OR tp.status_presenca = 'pendente'
            THEN 1
            ELSE 0
          END
        ) AS pendentes
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      GROUP BY
        t.id,
        t.tema,
        t.cliente,
        t.instrutor,
        t.data,
        t.data_inicio,
        t.data_fim,
        t.carga_horaria,
        t.participantes
      ORDER BY t.id DESC
      LIMIT 8
    `);

    const [[npsBase]] = await pool.query(`
      SELECT
        COUNT(*) AS respostas,
        SUM(CASE WHEN nota_nps >= 9 THEN 1 ELSE 0 END) AS promotores,
        SUM(CASE WHEN nota_nps <= 6 THEN 1 ELSE 0 END) AS detratores
      FROM avaliacoes_treinandos
    `);

    const respostasNps = Number(npsBase.respostas || 0);
    const promotores = Number(npsBase.promotores || 0);
    const detratores = Number(npsBase.detratores || 0);

    const nps =
      respostasNps > 0
        ? Math.round(((promotores - detratores) / respostasNps) * 100)
        : 0;

    const totalTreinamentos = Number(treinamentos.total || 0);
    const totalTreinados = Number(treinadosAtivos.total || 0);
    const totalPrevistos = Number(participantesPrevistos.total || 0);
    const totalPresentes = Number(presentesAtivos.total || 0);
    const totalAusentes = Number(ausentesAtivos.total || 0);
    const totalJustificados = Number(justificadosAtivos.total || 0);
    const totalPendentes = Number(pendentesAtivos.total || 0);
    const totalRegistrosChamada = Number(registrosChamada.total || 0);

    const taxaPresenca =
      totalTreinados > 0 ? Math.round((totalPresentes / totalTreinados) * 100) : 0;

    const taxaConclusaoChamada =
      totalTreinados > 0
        ? Math.round(((totalTreinados - totalPendentes) / totalTreinados) * 100)
        : 0;

    return res.json({
      ok: true,
      kpis: {
        treinamentos: totalTreinamentos,
        treinados: totalRegistrosChamada,
        participantes_previstos: totalPrevistos,
        presentes: totalPresentes,
        ausentes: totalAusentes,
        justificados: totalJustificados,
        pendentes: totalPendentes,
        taxa_presenca: taxaPresenca,
        taxa_conclusao_chamada: taxaConclusaoChamada,
        media_participantes_por_turma: Number(mediaParticipantesPorTurma.total || 0),
        horas_treinadas: Number(horasTreinadas.toFixed(1)),
        carga_horaria_total: Number(cargaHorariaTotal.toFixed(1)),
        clientes_ativos: Number(clientesCarteira.total || 0),
        clientes_com_treinamento: Number(clientesComTreinamento.total || 0),
        nps,
        respostas_nps: respostasNps,
      },
      presenca_por_cliente: presencaPorCliente.map((item) => ({
        ...item,
        total_turmas: Number(item.total_turmas || 0),
        total_treinados: Number(item.total_treinados || 0),
        presentes: Number(item.presentes || 0),
        ausentes: Number(item.ausentes || 0),
        justificados: Number(item.justificados || 0),
        pendentes: Number(item.pendentes || 0),
        taxa_presenca: Number(item.taxa_presenca || 0),
      })),
      ranking_instrutores: rankingInstrutores.map((item) => ({
        ...item,
        total_turmas: Number(item.total_turmas || 0),
        total_treinados: Number(item.treinandos_vinculados || 0),
        treinandos_previstos: Number(item.treinandos_previstos || 0),
        presentes: Number(item.presentes || 0),
        taxa_presenca: Number(item.taxa_presenca || 0),
      })),
      ultimas_turmas: ultimasTurmas.map((item) => ({
        ...item,
        treinados: Number(item.treinados || 0),
        presentes: Number(item.presentes || 0),
        ausentes: Number(item.ausentes || 0),
        justificados: Number(item.justificados || 0),
        pendentes: Number(item.pendentes || 0),
      })),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar dashboard de treinamentos",
      error: error.message,
    });
  }
}

module.exports = {
  getDashboardTreinamentos,
};
