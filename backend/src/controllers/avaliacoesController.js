import pool from "../db.js";

function classificarResultado(item) {
  const notaProva = Number(item?.nota_prova || 0);
  const notaQualidade = Number(item?.nota_qualidade || 0);
  const notaFinal = notaProva > 0 ? notaProva : notaQualidade;

  if (notaFinal >= 8) return "Aprovado";
  if (notaFinal >= 6) return "Atenção";
  return "Reforço";
}

export async function listAvaliacoes(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        treinamento_id,
        treinando_nome,
        COALESCE(nota_nps, 0) AS nota_nps,
        COALESCE(nota_qualidade, 0) AS nota_qualidade,
        COALESCE(nota_prova, 0) AS nota_prova,
        comentario
      FROM avaliacoes
      ORDER BY id DESC
    `);

    const data = rows.map((item) => ({
      ...item,
      status_resultado: classificarResultado(item),
    }));

    res.json(data);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao listar avaliações",
      error: error.message,
    });
  }
}

export async function createAvaliacao(req, res) {
  try {
    const {
      treinamento_id,
      treinando_nome,
      nota_nps,
      nota_qualidade,
      nota_prova,
      comentario,
    } = req.body || {};

    if (!treinamento_id || !treinando_nome || nota_qualidade === undefined) {
      return res.status(400).json({
        ok: false,
        message: "Preencha turma, treinando e qualidade",
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO avaliacoes
      (treinamento_id, treinando_nome, nota_nps, nota_qualidade, nota_prova, comentario)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        treinamento_id,
        treinando_nome,
        nota_nps || 0,
        nota_qualidade,
        nota_prova || 0,
        comentario || null,
      ]
    );

    res.status(201).json({
      ok: true,
      id: result.insertId,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao registrar avaliação",
      error: error.message,
    });
  }
}

export async function updateAvaliacao(req, res) {
  try {
    const { id } = req.params;
    const {
      treinamento_id,
      treinando_nome,
      nota_nps,
      nota_qualidade,
      nota_prova,
      comentario,
    } = req.body || {};

    if (!treinamento_id || !treinando_nome || nota_qualidade === undefined) {
      return res.status(400).json({
        ok: false,
        message: "Preencha turma, treinando e qualidade",
      });
    }

    await pool.query(
      `
      UPDATE avaliacoes
      SET
        treinamento_id = ?,
        treinando_nome = ?,
        nota_nps = ?,
        nota_qualidade = ?,
        nota_prova = ?,
        comentario = ?
      WHERE id = ?
      `,
      [
        treinamento_id,
        treinando_nome,
        nota_nps || 0,
        nota_qualidade,
        nota_prova || 0,
        comentario || null,
        id,
      ]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao atualizar avaliação",
      error: error.message,
    });
  }
}

export async function deleteAvaliacao(req, res) {
  try {
    const { id } = req.params;

    await pool.query("DELETE FROM avaliacoes WHERE id = ?", [id]);

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao excluir avaliação",
      error: error.message,
    });
  }
}
