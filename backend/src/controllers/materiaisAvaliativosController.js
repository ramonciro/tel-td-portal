import pool from "../db.js";

export async function listMateriaisAvaliativos(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT id, treinamento_id, titulo, tipo, link_arquivo, observacao, criado_em FROM materiais_avaliativos ORDER BY id DESC"
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao listar materiais avaliativos"
    });
  }
}

export async function createMaterialAvaliativo(req, res) {
  try {
    const { treinamento_id, titulo, tipo, link_arquivo, observacao } = req.body;

    if (!treinamento_id || !titulo || !tipo) {
      return res.status(400).json({
        ok: false,
        message: "Preencha treinamento, título e tipo"
      });
    }

    const [result] = await pool.query(
      "INSERT INTO materiais_avaliativos (treinamento_id, titulo, tipo, link_arquivo, observacao) VALUES (?,?,?,?,?)",
      [treinamento_id, titulo, tipo, link_arquivo || null, observacao || null]
    );

    res.json({
      ok: true,
      id: result.insertId
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao salvar material avaliativo"
    });
  }
}
