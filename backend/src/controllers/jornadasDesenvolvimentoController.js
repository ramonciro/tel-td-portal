const db = require("../lib/db");

exports.listar = async (_req, res) => {
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
};

exports.buscarPorId = async (req, res) => {
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
};

exports.criar = async (req, res) => {
  try {
    const {
      cliente,
      nome,
      descricao,
      status,
      responsavel_id,
      data_inicio,
      data_fim,
    } = req.body;

    if (!cliente || !nome) {
      return res.status(400).json({
        error: "Cliente e nome da jornada são obrigatórios.",
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO jornadas_desenvolvimento
      (cliente, nome, descricao, status, responsavel_id, data_inicio, data_fim)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cliente,
        nome,
        descricao || null,
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
};

exports.atualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      cliente,
      nome,
      descricao,
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
      SET cliente = ?,
          nome = ?,
          descricao = ?,
          status = ?,
          responsavel_id = ?,
          data_inicio = ?,
          data_fim = ?
      WHERE id = ?
      `,
      [
        cliente,
        nome,
        descricao || null,
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
};

exports.remover = async (req, res) => {
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
};
