import pool from "../db.js";

export async function listMateriaisAvaliativos(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        treinamento_id,
        titulo,
        tipo,
        link_arquivo,
        descricao,
        COALESCE(nota_maxima, 0) AS nota_maxima,
        data_aplicacao,
        criado_em
      FROM materiais_avaliativos
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao listar materiais avaliativos", error: error.message });
  }
}

export async function createMaterialAvaliativo(req, res) {
  try {
    const {
      treinamento_id,
      titulo,
      tipo,
      link_arquivo,
      descricao,
      nota_maxima,
      data_aplicacao
    } = req.body || {};

    if (!treinamento_id || !titulo || !tipo) {
      return res.status(400).json({ ok: false, message: "Preencha treinamento, título e tipo" });
    }

    const [result] = await pool.query(
      `INSERT INTO materiais_avaliativos
      (treinamento_id, titulo, tipo, link_arquivo, descricao, nota_maxima, data_aplicacao)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        treinamento_id,
        titulo,
        tipo,
        link_arquivo || null,
        descricao || null,
        Number(nota_maxima || 0),
        data_aplicacao || null
      ]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao criar material avaliativo", error: error.message });
  }
}

export async function updateMaterialAvaliativo(req, res) {
  try {
    const { id } = req.params;
    const {
      treinamento_id,
      titulo,
      tipo,
      link_arquivo,
      descricao,
      nota_maxima,
      data_aplicacao
    } = req.body || {};

    if (!treinamento_id || !titulo || !tipo) {
      return res.status(400).json({ ok: false, message: "Preencha treinamento, título e tipo" });
    }

    await pool.query(
      `UPDATE materiais_avaliativos
       SET treinamento_id = ?, titulo = ?, tipo = ?, link_arquivo = ?, descricao = ?, nota_maxima = ?, data_aplicacao = ?
       WHERE id = ?`,
      [
        treinamento_id,
        titulo,
        tipo,
        link_arquivo || null,
        descricao || null,
        Number(nota_maxima || 0),
        data_aplicacao || null,
        id
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao atualizar material avaliativo", error: error.message });
  }
}

export async function deleteMaterialAvaliativo(req, res) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM materiais_avaliativos WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao excluir material avaliativo", error: error.message });
  }
}
