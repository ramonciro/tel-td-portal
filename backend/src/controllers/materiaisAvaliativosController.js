const pool = require("../lib/db");

async function listMateriaisAvaliativos(req, res) {
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
        questoes_json,
        criado_em
      FROM materiais_avaliativos
      ORDER BY id DESC
    `);

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar materiais avaliativos",
      error: error.message,
    });
  }
}

async function createMaterialAvaliativo(req, res) {
  try {
    const {
      treinamento_id,
      titulo,
      tipo,
      link_arquivo,
      descricao,
      nota_maxima,
      data_aplicacao,
      questoes_json,
    } = req.body || {};

    if (!treinamento_id || !titulo || !tipo) {
      return res.status(400).json({
        ok: false,
        message: "Preencha treinamento, título e tipo",
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO materiais_avaliativos
      (
        treinamento_id,
        titulo,
        tipo,
        link_arquivo,
        descricao,
        nota_maxima,
        data_aplicacao,
        questoes_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        treinamento_id,
        titulo,
        tipo,
        link_arquivo || null,
        descricao || null,
        Number(nota_maxima || 0),
        data_aplicacao || null,
        questoes_json || null,
      ]
    );

    return res.status(201).json({
      ok: true,
      id: result.insertId,
      message: "Material avaliativo criado com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao criar material avaliativo",
      error: error.message,
    });
  }
}

async function updateMaterialAvaliativo(req, res) {
  try {
    const { id } = req.params;
    const {
      treinamento_id,
      titulo,
      tipo,
      link_arquivo,
      descricao,
      nota_maxima,
      data_aplicacao,
      questoes_json,
    } = req.body || {};

    if (!treinamento_id || !titulo || !tipo) {
      return res.status(400).json({
        ok: false,
        message: "Preencha treinamento, título e tipo",
      });
    }

    await pool.query(
      `
      UPDATE materiais_avaliativos
      SET
        treinamento_id = ?,
        titulo = ?,
        tipo = ?,
        link_arquivo = ?,
        descricao = ?,
        nota_maxima = ?,
        data_aplicacao = ?,
        questoes_json = ?
      WHERE id = ?
      `,
      [
        treinamento_id,
        titulo,
        tipo,
        link_arquivo || null,
        descricao || null,
        Number(nota_maxima || 0),
        data_aplicacao || null,
        questoes_json || null,
        id,
      ]
    );

    return res.json({
      ok: true,
      message: "Material avaliativo atualizado com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao atualizar material avaliativo",
      error: error.message,
    });
  }
}

async function deleteMaterialAvaliativo(req, res) {
  try {
    const { id } = req.params;

    const [materiais] = await pool.query(
      `
      SELECT id, treinamento_id, titulo
      FROM materiais_avaliativos
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!materiais.length) {
      return res.status(404).json({
        ok: false,
        message: "Material avaliativo não encontrado",
      });
    }

    const material = materiais[0];

    await pool.query(
      `DELETE FROM respostas_avaliativas WHERE material_id = ?`,
      [id]
    );

    await pool.query(
      `
      DELETE FROM avaliacoes
      WHERE treinamento_id = ?
        AND titulo = ?
        AND comentario LIKE 'Resultado automático da prova/simulado:%'
      `,
      [material.treinamento_id, material.titulo]
    );

    await pool.query(
      `DELETE FROM materiais_avaliativos WHERE id = ?`,
      [id]
    );

    return res.json({
      ok: true,
      message: "Material avaliativo e resultados vinculados excluídos com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao excluir material avaliativo",
      error: error.message,
    });
  }
}

module.exports = {
  listMateriaisAvaliativos,
  createMaterialAvaliativo,
  updateMaterialAvaliativo,
  deleteMaterialAvaliativo,
};
