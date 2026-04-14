const pool = require("../lib/db");

async function listAvaliacoes(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, treinamento_id, titulo, nota_nps, nota_qualidade, nota_prova, observacoes
      FROM avaliacoes ORDER BY id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao listar avaliações", error: error.message });
  }
}

async function createAvaliacao(req, res) {
  try {
    const { treinamento_id, titulo, nota_nps, nota_qualidade, nota_prova, observacoes } = req.body || {};

    if (!treinamento_id) {
      return res.status(400).json({ ok: false, message: "Informe o treinamento" });
    }

    const [result] = await pool.query(
      `INSERT INTO avaliacoes (treinamento_id, titulo, nota_nps, nota_qualidade, nota_prova, observacoes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        treinamento_id,
        titulo || null,
        nota_nps    != null ? nota_nps    : 0,
        nota_qualidade != null ? nota_qualidade : 0,
        nota_prova  != null ? nota_prova  : 0,
        observacoes || null,
      ]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao criar avaliação", error: error.message });
  }
}

async function updateAvaliacao(req, res) {
  try {
    const { id } = req.params;
    const { treinamento_id, titulo, nota_nps, nota_qualidade, nota_prova, observacoes } = req.body || {};

    if (!treinamento_id) {
      return res.status(400).json({ ok: false, message: "Informe o treinamento" });
    }

    await pool.query(
      `UPDATE avaliacoes
       SET treinamento_id = ?, titulo = ?, nota_nps = ?, nota_qualidade = ?, nota_prova = ?, observacoes = ?
       WHERE id = ?`,
      [
        treinamento_id,
        titulo || null,
        nota_nps    != null ? nota_nps    : 0,
        nota_qualidade != null ? nota_qualidade : 0,
        nota_prova  != null ? nota_prova  : 0,
        observacoes || null,
        id,
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao atualizar avaliação", error: error.message });
  }
}

async function deleteAvaliacao(req, res) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM avaliacoes WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao excluir avaliação", error: error.message });
  }
}

module.exports = { listAvaliacoes, createAvaliacao, updateAvaliacao, deleteAvaliacao };
