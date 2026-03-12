import pool from "../db.js";

export async function getDashboard(req, res) {
  try {
    const [[clientesRow]] = await pool.query("SELECT COUNT(*) AS total FROM clientes");
    const [[usuariosRow]] = await pool.query("SELECT COUNT(*) AS total FROM usuarios");
    const [[treinamentosRow]] = await pool.query("SELECT COUNT(*) AS total FROM treinamentos");
    const [[presencasRow]] = await pool.query("SELECT COUNT(*) AS total FROM presencas");
    const [[avaliacoesRow]] = await pool.query("SELECT COUNT(*) AS total FROM avaliacoes");

    const [[materiaisRow]] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM materiais_avaliativos
    `).catch(() => [[{ total: 0 }]]);

    const [[npsRow]] = await pool.query(`
      SELECT COALESCE(ROUND(AVG(nota_nps), 1), 0) AS media
      FROM avaliacoes
      WHERE nota_nps IS NOT NULL
    `);

    const [[qualidadeRow]] = await pool.query(`
      SELECT COALESCE(ROUND(AVG(nota_qualidade), 1), 0) AS media
      FROM avaliacoes
      WHERE nota_qualidade IS NOT NULL
    `);

    const [[assiduidadeRow]] = await pool.query(`
      SELECT COALESCE(
        ROUND((SUM(CASE WHEN presente = TRUE THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0)) * 100, 1),
        0
      ) AS media
      FROM presencas
    `);

    const [treinamentosRecentes] = await pool.query(`
      SELECT id, tema, cliente, instrutor, data, status
      FROM treinamentos
      ORDER BY id DESC
      LIMIT 10
    `);

    const [treinamentosPorCliente] = await pool.query(`
      SELECT cliente, COUNT(*) AS total
      FROM treinamentos
      GROUP BY cliente
      ORDER BY total DESC, cliente ASC
    `);

    const [treinamentosPorInstrutor] = await pool.query(`
      SELECT instrutor, COUNT(*) AS total
      FROM treinamentos
      GROUP BY instrutor
      ORDER BY total DESC, instrutor ASC
      LIMIT 10
    `);

    const [clientes] = await pool.query(`
      SELECT id, nome
      FROM clientes
      ORDER BY nome ASC
      LIMIT 8
    `);

    return res.json({
      totalClientes: clientesRow.total,
      totalUsuarios: usuariosRow.total,
      totalTreinamentos: treinamentosRow.total,
      totalPresencas: presencasRow.total,
      totalAvaliacoes: avaliacoesRow.total,
      totalMateriaisAvaliativos: materiaisRow.total,
      npsMedio: npsRow.media,
      qualidadeMedia: qualidadeRow.media,
      assiduidadeMedia: assiduidadeRow.media,
      clientes,
      treinamentosRecentes,
      treinamentosPorCliente,
      treinamentosPorInstrutor
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar dashboard",
      error: error.message
    });
  }
}
