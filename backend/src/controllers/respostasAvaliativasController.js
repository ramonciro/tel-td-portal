const pool = require("../lib/db");

async function listRespostasAvaliativas(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        material_id,
        treinamento_id,
        treinando_nome,
        respostas_json,
        acertos,
        total_questoes,
        percentual,
        nota_final,
        criado_em,
        atualizado_em
      FROM respostas_avaliativas
      ORDER BY id DESC
    `);

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar respostas avaliativas",
      error: error.message,
    });
  }
}

async function createRespostaAvaliativa(req, res) {
  try {
    const {
      material_id,
      treinamento_id,
      treinando_nome,
      respostas_json,
      acertos,
      total_questoes,
      percentual,
      nota_final,
    } = req.body || {};

    if (!material_id || !treinamento_id || !treinando_nome) {
      return res.status(400).json({
        ok: false,
        message: "Preencha material, treinamento e treinando",
      });
    }

    await pool.query(
      `
      INSERT INTO respostas_avaliativas
      (
        material_id,
        treinamento_id,
        treinando_nome,
        respostas_json,
        acertos,
        total_questoes,
        percentual,
        nota_final
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        respostas_json = VALUES(respostas_json),
        acertos = VALUES(acertos),
        total_questoes = VALUES(total_questoes),
        percentual = VALUES(percentual),
        nota_final = VALUES(nota_final),
        atualizado_em = CURRENT_TIMESTAMP
      `,
      [
        material_id,
        treinamento_id,
        treinando_nome,
        typeof respostas_json === "string"
          ? respostas_json
          : JSON.stringify(respostas_json || {}),
        Number(acertos || 0),
        Number(total_questoes || 0),
        Number(percentual || 0),
        Number(nota_final || 0),
      ]
    );

    return res.status(201).json({
      ok: true,
      message: "Resposta avaliativa registrada com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao registrar resposta avaliativa",
      error: error.message,
    });
  }
}

async function updateRespostaAvaliativa(req, res) {
  try {
    const { id } = req.params;
    const {
      material_id,
      treinamento_id,
      treinando_nome,
      respostas_json,
      acertos,
      total_questoes,
      percentual,
      nota_final,
    } = req.body || {};

    await pool.query(
      `
      UPDATE respostas_avaliativas
      SET
        material_id = ?,
        treinamento_id = ?,
        treinando_nome = ?,
        respostas_json = ?,
        acertos = ?,
        total_questoes = ?,
        percentual = ?,
        nota_final = ?,
        atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [
        material_id,
        treinamento_id,
        treinando_nome,
        typeof respostas_json === "string"
          ? respostas_json
          : JSON.stringify(respostas_json || {}),
        Number(acertos || 0),
        Number(total_questoes || 0),
        Number(percentual || 0),
        Number(nota_final || 0),
        id,
      ]
    );

    return res.json({
      ok: true,
      message: "Resposta avaliativa atualizada com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao atualizar resposta avaliativa",
      error: error.message,
    });
  }
}

async function deleteRespostaAvaliativa(req, res) {
  try {
    const { id } = req.params;

    await pool.query(
      `DELETE FROM respostas_avaliativas WHERE id = ?`,
      [id]
    );

    return res.json({
      ok: true,
      message: "Resposta avaliativa excluída com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao excluir resposta avaliativa",
      error: error.message,
    });
  }
}

module.exports = {
  listRespostasAvaliativas,
  createRespostaAvaliativa,
  updateRespostaAvaliativa,
  deleteRespostaAvaliativa,
};
