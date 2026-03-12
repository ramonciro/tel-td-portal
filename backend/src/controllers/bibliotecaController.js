import pool from "../db.js";

export async function listBiblioteca(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, titulo, tipo, cliente, link_arquivo, descricao, criado_em
      FROM biblioteca_conteudos
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao listar biblioteca", error: error.message });
  }
}

export async function createBiblioteca(req, res) {
  try {
    const { titulo, tipo, cliente, link_arquivo, descricao } = req.body || {};
    if (!titulo || !tipo || !cliente) {
      return res.status(400).json({ ok: false, message: "Preencha título, tipo e cliente" });
    }

    const [result] = await pool.query(
      `INSERT INTO biblioteca_conteudos (titulo, tipo, cliente, link_arquivo, descricao)
       VALUES (?, ?, ?, ?, ?)`,
      [titulo, tipo, cliente, link_arquivo || null, descricao || null]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao criar conteúdo", error: error.message });
  }
}

export async function updateBiblioteca(req, res) {
  try {
    const { id } = req.params;
    const { titulo, tipo, cliente, link_arquivo, descricao } = req.body || {};
    if (!titulo || !tipo || !cliente) {
      return res.status(400).json({ ok: false, message: "Preencha título, tipo e cliente" });
    }

    await pool.query(
      `UPDATE biblioteca_conteudos
       SET titulo = ?, tipo = ?, cliente = ?, link_arquivo = ?, descricao = ?
       WHERE id = ?`,
      [titulo, tipo, cliente, link_arquivo || null, descricao || null, id]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao atualizar conteúdo", error: error.message });
  }
}

export async function deleteBiblioteca(req, res) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM biblioteca_conteudos WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao excluir conteúdo", error: error.message });
  }
}
