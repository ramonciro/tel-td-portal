import pool from "../db.js";
export async function listClientes(req, res) {
  try {
    const [rows] = await pool.query("SELECT id, nome FROM clientes ORDER BY nome ASC");
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ ok: false, message: "Erro ao listar clientes", error: error.message });
  }
}
