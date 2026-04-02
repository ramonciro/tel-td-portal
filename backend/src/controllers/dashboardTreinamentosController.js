const pool = require("../lib/db");

function parseHorasTexto(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;

  const texto = String(valor).toLowerCase().replace(",", ".").trim();
  const match = texto.match(/(\d+(\.\d+)?)/);

  return match ? Number(match[1]) || 0 : 0;
}

function n(value) {
  return Number(value || 0);
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

    const [[treinadosImportados]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
    `);

    const [[presentes]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.status_presenca = 'presente'
    `);

    const [[ausentes]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.status_presenca = 'ausente'
    `);

    const [[justificados]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.status_presenca = 'justificado'
    `);

    const [[pendentes]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes tp
      INNER JOIN treinamentos t ON t.id = tp.treinamento_id
      WHERE tp.status_presenca IS NULL
         OR tp.status_presenca = ''
         OR tp.status_presenca = 'pendente'
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
        SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END) AS presentes,
        COUNT(tp.id) AS registros_total
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      GROUP BY t.id, t.carga_horaria
    `);

    const horasTreinadas = horasTreinadasBase.reduce((acc, item) => {
      const horas = parseHorasTexto(item.carga_horaria);
      return acc + horas * n(item.presentes);
    }, 0);

    const horasMinistradas = horasTreinadasBase.reduce((acc, item) => {
      const horas = parseHorasTexto(item.carga_horaria);
      return acc + (n(item.registros_total) > 0 ? horas : 0);
    }, 0);

    const [presencaPorCliente] = await pool.query(`
      SELECT
        t.cliente,
        COUNT(DISTINCT t.id) AS total_turmas,
        COALESCE(SUM(CASE WHEN tp.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS treinados_importados,
        COALESCE(SUM(t.participantes), 0) AS previstos,
        COALESCE(SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END), 0) AS presentes,
        COALESCE(SUM(CASE WHEN tp.status_presenca = 'ausente' THEN 1 ELSE 0 END), 0) AS ausentes,
        COALESCE(SUM(CASE WHEN tp.status_presenca = 'justificado' THEN 1 ELSE 0 END), 0) AS justificados,
        ROUND(
          (
            COALESCE(SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END), 0) /
            NULLIF(COALESCE(SUM(CASE WHEN tp.id IS NOT NULL THEN 1 ELSE 0 END), 0), 0)
          ) * 100,
          0
        ) AS taxa_presenca
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp
        ON tp.treinamento_id = t.id
      WHERE t.cliente IS NOT NULL
        AND t.cliente <> ''
      GROUP BY t.cliente
      ORDER BY total_turmas DESC, previstos DESC
      LIMIT 10
    `);

    const [rankingInstrutores] = await pool.query(`
      SELECT
        t.instrutor,
        COUNT(DISTINCT t.id) AS total_turmas,
        COALESCE(SUM(t.participantes), 0) AS treinandos_previstos,
        COALESCE(SUM(CASE WHEN tp.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS treinandos_vinculados,
        COALESCE(SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END), 0) AS presentes,
        ROUND(
          (
            COALESCE(SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END), 0) /
            NULLIF(COALESCE(SUM(CASE WHEN tp.id IS NOT NULL THEN 1 ELSE 0 END), 0), 0)
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
        t.data,
        t.data_inicio,
        t.data_fim,
        t.carga_horaria,
        t.participantes,
        COUNT(tp.id) AS treinados,
        COALESCE(SUM(CASE WHEN tp.status_presenca = 'presente' THEN 1 ELSE 0 END), 0) AS presentes,
        COALESCE(SUM(CASE WHEN tp.status_presenca = 'ausente' THEN 1 ELSE 0 END), 0) AS ausentes,
        COALESCE(SUM(CASE WHEN tp.status_presenca = 'justificado' THEN 1 ELSE 0 END), 0) AS justificados,
        COALESCE(SUM(
          CASE
            WHEN tp.status_presenca IS NULL
              OR tp.status_presenca = ''
              OR tp.status_presenca = 'pendente'
            THEN 1
            ELSE 0
          END
        ), 0) AS pendentes
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
      ORDER BY COALESCE(t.data_inicio, t.data) DESC, t.id DESC
      LIMIT 8
    `);

    const totalTreinamentos = n(treinamentos.total);
    const totalTreinados = n(treinadosImportados.total);
    const totalPrevistos = n(participantesPrevistos.total);
    const totalPresentes = n(presentes.total);
    const totalAusentes = n(ausentes.total);
    const totalJustificados = n(justificados.total);
    const totalPendentes = n(pendentes.total);

    const taxaPresenca =
      totalTreinados > 0 ? Math.round((totalPresentes / totalTreinados) * 100) : 0;

    const taxaConclusaoChamada =
      totalTreinados > 0
        ? Math.round(((totalTreinados - totalPendentes) / totalTreinados) * 100)
        : 0;

    const taxaExecucaoDiaria =
      totalPrevistos > 0
        ? Math.min(Math.round((totalTreinados / totalPrevistos) * 100), 100)
        : 0;

    const gapDiario = Math.max(totalPrevistos - totalTreinados, 0);

    return res.json({
      ok: true,
      kpis: {
        treinamentos: totalTreinamentos,
        treinados: totalTreinados,
        participantes_previstos: totalPrevistos,
        presentes: totalPresentes,
        ausentes: totalAusentes,
        justificados: totalJustificados,
        pendentes: totalPendentes,
        taxa_presenca: taxaPresenca,
        taxa_conclusao_chamada: taxaConclusaoChamada,
        taxa_execucao_diaria: taxaExecucaoDiaria,
        media_participantes_por_turma: n(mediaParticipantesPorTurma.total),
        horas_treinadas: n(horasTreinadas),
        horas_ministradas: n(horasMinistradas),
        carga_horaria_total: n(cargaHorariaTotal),
        clientes_ativos: n(clientesCarteira.total),
        clientes_com_treinamento: n(clientesComTreinamento.total),
        capacidade_diaria_prevista: totalPrevistos,
        gap_diario: gapDiario,
        previstos_no_dia: totalPrevistos,
        presentes_no_dia: totalPresentes,
      },
      presenca_por_cliente: presencaPorCliente.map((item) => ({
        ...item,
        total_treinados:
          n(item.treinados_importados) > 0 ? n(item.treinados_importados) : n(item.previstos),
      })),
      ranking_instrutores: rankingInstrutores.map((item) => ({
        ...item,
        total_treinados:
          n(item.treinandos_vinculados) > 0
            ? n(item.treinandos_vinculados)
            : n(item.treinandos_previstos),
      })),
      ultimas_turmas: ultimasTurmas.map((item) => ({
        ...item,
        base_ativa: n(item.treinados) > 0 ? n(item.treinados) : n(item.participantes),
        taxa_presenca:
          n(item.treinados) > 0 ? Math.round((n(item.presentes) / n(item.treinados)) * 100) : 0,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar dashboard de treinamentos.",
      error: error.message,
    });
  }
}

module.exports = {
  getDashboardTreinamentos,
};
