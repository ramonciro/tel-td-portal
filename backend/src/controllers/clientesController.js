import pool from "../db.js";

export async function listClientes(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT
        c.id,
        c.nome,
        COALESCE(t.total_treinamentos, 0) AS total_treinamentos,
        COALESCE(u.total_usuarios, 0) AS total_usuarios
      FROM clientes c
      LEFT JOIN (
        SELECT cliente, COUNT(*) AS total_treinamentos
        FROM treinamentos
        GROUP BY cliente
      ) t ON t.cliente = c.nome
      LEFT JOIN (
        SELECT cliente, COUNT(*) AS total_usuarios
        FROM usuarios
        GROUP BY cliente
      ) u ON u.cliente = c.nome
      ORDER BY c.nome ASC
    `);

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao listar clientes",
      error: error.message
    });
  }
}
