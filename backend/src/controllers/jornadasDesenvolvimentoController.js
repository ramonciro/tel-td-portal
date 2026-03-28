const db = require("../lib/db");

async function listar(_req, res) {
  try {
    const [rows] = await db.query(`
      SELECT jd.*,
             u.nome AS responsavel_nome
      FROM jornadas_desenvolvimento jd
      LEFT JOIN usuarios u ON u.id = jd.responsavel_id
      ORDER BY jd.id DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error("Erro ao listar jornadas:", error);
    res.status(500).json({ error: "Erro ao listar jornadas." });
  }
}

async function buscarPorId(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT jd.*,
             u.nome AS responsavel_nome
      FROM jornadas_desenvolvimento jd
      LEFT JOIN usuarios u ON u.id = jd.responsavel_id
      WHERE jd.id = ?
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Jornada não encontrada." });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao buscar jornada:", error);
    res.status(500).json({ error: "Erro ao buscar jornada." });
  }
}

async function criar(req, res) {
  try {
    const {
      nome,
      descricao,
      objetivo,
      publico_macro,
      observacoes,
      status,
      responsavel_id,
      data_inicio,
      data_fim,
    } = req.body;

    if (!nome) {
      return res.status(400).json({
        error: "Nome da jornada é obrigatório.",
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO jornadas_desenvolvimento
      (nome, descricao, objetivo, publico_macro, observacoes, status, responsavel_id, data_inicio, data_fim)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        nome,
        descricao || null,
        objetivo || null,
        publico_macro || null,
        observacoes || null,
        status || "ativa",
        responsavel_id || null,
        data_inicio || null,
        data_fim || null,
      ]
    );

    const [rows] = await db.query(
      `SELECT * FROM jornadas_desenvolvimento WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Erro ao criar jornada:", error);
    res.status(500).json({ error: "Erro ao criar jornada." });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const {
      nome,
      descricao,
      objetivo,
      publico_macro,
      observacoes,
      status,
      responsavel_id,
      data_inicio,
      data_fim,
    } = req.body;

    const [exists] = await db.query(
      `SELECT id FROM jornadas_desenvolvimento WHERE id = ?`,
      [id]
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Jornada não encontrada." });
    }

    await db.query(
      `
      UPDATE jornadas_desenvolvimento
      SET nome = ?,
          descricao = ?,
          objetivo = ?,
          publico_macro = ?,
          observacoes = ?,
          status = ?,
          responsavel_id = ?,
          data_inicio = ?,
          data_fim = ?
      WHERE id = ?
      `,
      [
        nome,
        descricao || null,
        objetivo || null,
        publico_macro || null,
        observacoes || null,
        status || "ativa",
        responsavel_id || null,
        data_inicio || null,
        data_fim || null,
        id,
      ]
    );

    const [rows] = await db.query(
      `SELECT * FROM jornadas_desenvolvimento WHERE id = ?`,
      [id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar jornada:", error);
    res.status(500).json({ error: "Erro ao atualizar jornada." });
  }
}

async function remover(req, res) {
  try {
    const { id } = req.params;

    const [exists] = await db.query(
      `SELECT id FROM jornadas_desenvolvimento WHERE id = ?`,
      [id]
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Jornada não encontrada." });
    }

    await db.query(`DELETE FROM jornadas_desenvolvimento WHERE id = ?`, [id]);

    res.json({ success: true, message: "Jornada removida com sucesso." });
  } catch (error) {
    console.error("Erro ao remover jornada:", error);
    res.status(500).json({ error: "Erro ao remover jornada." });
  }
}

module.exports = {
  listar,
  buscarPorId,
  criar,
  atualizar,
  remover,
};
