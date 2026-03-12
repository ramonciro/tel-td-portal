import pool from "../db.js";

export async function listClientes(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT id, nome FROM clientes ORDER BY nome ASC"
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao listar clientes",
      error: error.message
    });
  }
}
