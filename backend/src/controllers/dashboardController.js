const pool = require("../lib/db");

async function countOrZero(sql) {
  const [[row]] = await pool.query(sql);
  return Number(row.total || 0);
}

async function getDashboard(req, res) {
  try {
    const totalClientes    = await countOrZero("SELECT COUNT(*) AS total FROM clientes");
    const totalUsuarios    = await countOrZero("SELECT COUNT(*) AS total FROM usuarios");
    const totalTreinamentos = await countOrZero("SELECT COUNT(*) AS total FROM treinamentos");
    const totalPresencas   = await countOrZero("SELECT COUNT(*) AS total FROM presencas");
    const totalAvaliacoes  = await countOrZero("SELECT COUNT(*) AS total FROM avaliacoes");

    let totalMateriaisAvaliativos = 0;
    try { totalMateriaisAvaliativos = await countOrZero("SELECT COUNT(*) AS total FROM materiais_avaliativos"); } catch {}

    let totalConteudosBiblioteca = 0;
    try { totalConteudosBiblioteca = await countOrZero("SELECT COUNT(*) AS total FROM biblioteca"); } catch {}

    let totalTrilhas = 0;
    try { totalTrilhas = await countOrZero("SELECT COUNT(*) AS total FROM trilhas"); } catch {}

    const [[horasRow]] = await pool.query(
      "SELECT COALESCE(ROUND(SUM(carga_horaria),1),0) AS total FROM treinamentos"
    );

    const [[participantesRow]] = await pool.query(`
      SELECT COALESCE(COUNT(DISTINCT treinando_nome),0) AS total
      FROM presencas
      WHERE COALESCE(status, CASE WHEN presente = 1 THEN 'presente' ELSE 'ausente' END) = 'presente'
    `);

    const [[conclusaoRow]] = await pool.query(`
      SELECT COALESCE(
        ROUND((SUM(concluidos) / NULLIF(SUM(participantes_presentes),0)) * 100, 1),
        0
      ) AS total FROM treinamentos
    `);

    const [[aproveitamentoRow]] = await pool.query(
      "SELECT COALESCE(ROUND(AVG(nota_prova),1),0) AS total FROM avaliacoes"
    );

    const [[npsRow]] = await pool.query(
      "SELECT COALESCE(ROUND(AVG(nota_nps),1),0) AS total FROM avaliacoes"
    );

    const [[qualidadeRow]] = await pool.query(
      "SELECT COALESCE(ROUND(AVG(nota_qualidade),1),0) AS total FROM avaliacoes"
    );

    const [[assiduidadeRow]] = await pool.query(`
      SELECT COALESCE(
        ROUND((
          SUM(CASE WHEN COALESCE(status, CASE WHEN presente=1 THEN 'presente' ELSE 'ausente' END) = 'presente' THEN 1 ELSE 0 END) * 100.0
        ) / NULLIF(COUNT(*), 0), 1),
        0
      ) AS total FROM presencas
    `);

    const mediaTreinamentosPorPessoa =
      totalUsuarios > 0 ? Number((totalTreinamentos / totalUsuarios).toFixed(2)) : 0;

    const [treinamentosRecentes] = await pool.query(`
      SELECT id, tema, cliente, instrutor, status,
             COALESCE(carga_horaria,0) AS carga_horaria,
             COALESCE(participantes_presentes,0) AS participantes_presentes
      FROM treinamentos ORDER BY id DESC LIMIT 10
    `);

    const [treinamentosPorCliente] = await pool.query(`
      SELECT cliente, COUNT(*) AS total, COALESCE(ROUND(SUM(carga_horaria),1),0) AS horas
      FROM treinamentos GROUP BY cliente ORDER BY total DESC LIMIT 8
    `);

    const [treinamentosPorInstrutor] = await pool.query(`
      SELECT instrutor, COUNT(*) AS total, COALESCE(ROUND(SUM(carga_horaria),1),0) AS horas
      FROM treinamentos GROUP BY instrutor ORDER BY total DESC LIMIT 8
    `);

    const [avaliacoesPorCliente] = await pool.query(`
      SELECT t.cliente,
             COALESCE(ROUND(AVG(a.nota_nps),1),0) AS nps_medio,
             COALESCE(ROUND(AVG(a.nota_qualidade),1),0) AS qualidade_media
      FROM avaliacoes a
      INNER JOIN treinamentos t ON t.id = a.treinamento_id
      GROUP BY t.cliente ORDER BY nps_medio DESC LIMIT 8
    `);

    const [rankingInstrutores] = await pool.query(`
      SELECT t.instrutor,
             COUNT(*) AS total_treinamentos,
             COALESCE(ROUND(SUM(t.carga_horaria),1),0) AS horas,
             COALESCE(ROUND(AVG(a.nota_nps),1),0) AS nps_medio,
             COALESCE(ROUND(AVG(a.nota_qualidade),1),0) AS qualidade_media
      FROM treinamentos t
      LEFT JOIN avaliacoes a ON a.treinamento_id = t.id
      GROUP BY t.instrutor ORDER BY total_treinamentos DESC LIMIT 8
    `);

    return res.json({
      totalClientes, totalUsuarios, totalTreinamentos, totalPresencas, totalAvaliacoes,
      totalMateriaisAvaliativos, totalConteudosBiblioteca, totalTrilhas,
      horasTreinadas: Number(horasRow.total || 0),
      participantesTreinados: Number(participantesRow.total || 0),
      taxaConclusao: Number(conclusaoRow.total || 0),
      aproveitamentoMedio: Number(aproveitamentoRow.total || 0),
      npsMedio: Number(npsRow.total || 0),
      qualidadeMedia: Number(qualidadeRow.total || 0),
      assiduidadeMedia: Number(assiduidadeRow.total || 0),
      mediaTreinamentosPorPessoa,
      treinamentosRecentes,
      treinamentosPorCliente,
      treinamentosPorInstrutor,
      avaliacoesPorCliente,
      rankingInstrutores,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao carregar dashboard", error: error.message });
  }
}

module.exports = { getDashboard };
