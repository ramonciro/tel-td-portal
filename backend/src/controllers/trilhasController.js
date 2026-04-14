import pool from "../db.js";

export async function listTrilhas(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, cliente, titulo, descricao, etapas, criado_em
      FROM trilhas_aprendizagem
      ORDER BY id DESC
    `);

    const normalized = rows.map((row) => ({
      ...row,
      etapas: row.etapas ? JSON.parse(row.etapas) : []
    }));

    res.json(normalized);
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao listar trilhas", error: error.message });
  }
}

export async function createTrilha(req, res) {
  try {
    const { cliente, titulo, descricao, etapas } = req.body || {};
    if (!cliente || !titulo) {
      return res.status(400).json({ ok: false, message: "Preencha cliente e título" });
    }

    const etapasJson = JSON.stringify(Array.isArray(etapas) ? etapas : []);

    const [result] = await pool.query(
      `INSERT INTO trilhas_aprendizagem (cliente, titulo, descricao, etapas)
       VALUES (?, ?, ?, ?)`,
      [cliente, titulo, descricao || null, etapasJson]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao criar trilha", error: error.message });
  }
}

export async function updateTrilha(req, res) {
  try {
    const { id } = req.params;
    const { cliente, titulo, descricao, etapas } = req.body || {};
    if (!cliente || !titulo) {
      return res.status(400).json({ ok: false, message: "Preencha cliente e título" });
    }

    const etapasJson = JSON.stringify(Array.isArray(etapas) ? etapas : []);

    await pool.query(
      `UPDATE trilhas_aprendizagem
       SET cliente = ?, titulo = ?, descricao = ?, etapas = ?
       WHERE id = ?`,
      [cliente, titulo, descricao || null, etapasJson, id]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao atualizar trilha", error: error.message });
  }
}

export async function deleteTrilha(req, res) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM trilhas_aprendizagem WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao excluir trilha", error: error.message });
  }
}
