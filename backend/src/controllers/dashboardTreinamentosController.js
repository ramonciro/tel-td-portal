const db = require("../lib/db");

async function getDashboardTreinamentos(req, res) {
  try {
    const [[treinamentos]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM treinamentos
    `);

    const [[participantes]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes
    `);

    const [[presentes]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes
      WHERE status_presenca = 'presente'
    `);

    const [[ausentes]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes
      WHERE status_presenca = 'ausente'
    `);

    const [[justificados]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes
      WHERE status_presenca = 'justificado'
    `);

    const [[pendentes]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM treinamento_participantes
      WHERE status_presenca IS NULL
         OR status_presenca = ''
         OR status_presenca = 'pendente'
    `);

    const [[participantesPrevistos]] = await db.query(`
      SELECT COALESCE(SUM(participantes), 0) AS total
      FROM treinamentos
    `);

    const [[mediaPorTurma]] = await db.query(`
      SELECT
        COALESCE(ROUND(AVG(participantes), 1), 0) AS total
      FROM treinamentos
    `);

    const taxaPresenca =
      Number(participantes.total || 0) > 0
        ? Math.round((Number(presentes.total || 0) / Number(participantes.total || 0)) * 100)
        : 0;

    const taxaConclusao =
      Number(participantes.total || 0) > 0
        ? Math.round(
            ((Number(participantes.total || 0) - Number(pendentes.total || 0)) /
              Number(participantes.total || 0)) *
              100
          )
        : 0;

    return res.json({
      treinamentos: Number(treinamentos.total || 0),
      participantes_importados: Number(participantes.total || 0),
      participantes_previstos: Number(participantesPrevistos.total || 0),
      presentes: Number(presentes.total || 0),
      ausentes: Number(ausentes.total || 0),
      justificados: Number(justificados.total || 0),
      pendentes: Number(pendentes.total || 0),
      taxa_presenca: taxaPresenca,
      taxa_conclusao_chamada: taxaConclusao,
      media_participantes_por_turma: Number(mediaPorTurma.total || 0),
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
