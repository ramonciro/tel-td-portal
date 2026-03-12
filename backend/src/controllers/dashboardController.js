import pool from "../db.js";

export async function getDashboard(req, res) {
  try {
    const [[clientesRow]] = await pool.query(
      "SELECT COUNT(*) AS totalClientes FROM clientes"
    );

    const [[usuariosRow]] = await pool.query(
      "SELECT COUNT(*) AS totalUsuarios FROM usuarios"
    );

    const [[treinamentosRow]] = await pool.query(
      "SELECT COUNT(*) AS totalTreinamentos FROM treinamentos"
    );

    const [[presencasRow]] = await pool.query(
      "SELECT COUNT(*) AS totalPresencas FROM presencas"
    );

    const [[avaliacoesRow]] = await pool.query(
      "SELECT COUNT(*) AS totalAvaliacoes FROM avaliacoes"
    );

    const [[npsRow]] = await pool.query(
      "SELECT COALESCE(ROUND(AVG(nota_nps), 1), 0) AS npsMedio FROM avaliacoes"
    );

    const [[qualidadeRow]] = await pool.query(
      "SELECT COALESCE(ROUND(AVG(nota_qualidade), 1), 0) AS qualidadeMedia FROM avaliacoes"
    );

    const [[assiduidadeRow]] = await pool.query(`
      SELECT COALESCE(
        ROUND(
          (SUM(CASE WHEN presente = TRUE THEN 1 ELSE 0 END) * 100.0) / NULLIF(COUNT(*), 0),
          1
        ),
        0
      ) AS assiduidadeMedia
      FROM presencas
    `);

    const [treinamentosRecentes] = await pool.query(`
      SELECT id, tema, cliente, instrutor, status
      FROM treinamentos
      ORDER BY id DESC
      LIMIT 10
    `);

    return res.json({
      totalClientes: clientesRow.totalClientes ?? 0,
      totalUsuarios: usuariosRow.totalUsuarios ?? 0,
      totalTreinamentos: treinamentosRow.totalTreinamentos ?? 0,
      totalPresencas: presencasRow.totalPresencas ?? 0,
      totalAvaliacoes: avaliacoesRow.totalAvaliacoes ?? 0,
      npsMedio: npsRow.npsMedio ?? 0,
      qualidadeMedia: qualidadeRow.qualidadeMedia ?? 0,
      assiduidadeMedia: assiduidadeRow.assiduidadeMedia ?? 0,
      treinamentosRecentes: Array.isArray(treinamentosRecentes)
        ? treinamentosRecentes
        : []
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar dashboard",
      error: error.message
    });
  }
}
