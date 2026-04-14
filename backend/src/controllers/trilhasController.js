const pool = require("../lib/db");

async function listTrilhas(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, titulo, cliente, descricao, carga_horaria_estimada, publico, status
      FROM trilhas ORDER BY id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao listar trilhas", error: error.message });
  }
}

async function createTrilha(req, res) {
  try {
    const { titulo, cliente, descricao, carga_horaria_estimada, publico, status } = req.body || {};

    if (!titulo) {
      return res.status(400).json({ ok: false, message: "Informe o título da trilha" });
    }

    const [result] = await pool.query(
      `INSERT INTO trilhas (titulo, cliente, descricao, carga_horaria_estimada, publico, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [titulo, cliente || null, descricao || null,
       carga_horaria_estimada || null, publico || "todos", status || "ativo"]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao criar trilha", error: error.message });
  }
}

async function updateTrilha(req, res) {
  try {
    const { id } = req.params;
    const { titulo, cliente, descricao, carga_horaria_estimada, publico, status } = req.body || {};

    if (!titulo) {
      return res.status(400).json({ ok: false, message: "Informe o título da trilha" });
    }

    await pool.query(
      `UPDATE trilhas
       SET titulo = ?, cliente = ?, descricao = ?, carga_horaria_estimada = ?, publico = ?, status = ?
       WHERE id = ?`,
      [titulo, cliente || null, descricao || null,
       carga_horaria_estimada || null, publico || "todos", status || "ativo", id]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao atualizar trilha", error: error.message });
  }
}

async function deleteTrilha(req, res) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM trilhas WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao excluir trilha", error: error.message });
  }
}

module.exports = { listTrilhas, createTrilha, updateTrilha, deleteTrilha };
