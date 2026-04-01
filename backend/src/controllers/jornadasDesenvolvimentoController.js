const db = require("../lib/db");

function pick(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

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
    res.status(500).json({ error: error.message || "Erro ao listar jornadas." });
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
    res.status(500).json({ error: error.message || "Erro ao buscar jornada." });
  }
}

async function criar(req, res) {
  try {
    const body = req.body || {};
    const nome = pick(body.nome, body.titulo);
    const descricao = pick(body.descricao, body.cliente);
    const objetivo = pick(body.objetivo);
    const publico_macro = pick(body.publico_macro, body.publico_alvo);
    const observacoes = pick(body.observacoes, body.cliente ? `Cliente: ${body.cliente}` : null);
    const status = pick(body.status, "ativa");
    const responsavel_id = pick(body.responsavel_id);
    const data_inicio = pick(body.data_inicio);
    const data_fim = pick(body.data_fim);

    if (!nome) {
      return res.status(400).json({ error: "Nome da jornada é obrigatório." });
    }

    const [result] = await db.query(
      `
      INSERT INTO jornadas_desenvolvimento
      (nome, descricao, objetivo, publico_macro, observacoes, status, responsavel_id, data_inicio, data_fim)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [nome, descricao, objetivo, publico_macro, observacoes, status, responsavel_id, data_inicio, data_fim]
    );

    const [rows] = await db.query(`SELECT * FROM jornadas_desenvolvimento WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Erro ao criar jornada:", error);
    res.status(500).json({ error: error.message || "Erro ao criar jornada." });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const nome = pick(body.nome, body.titulo);
    const descricao = pick(body.descricao, body.cliente);
    const objetivo = pick(body.objetivo);
    const publico_macro = pick(body.publico_macro, body.publico_alvo);
    const observacoes = pick(body.observacoes, body.cliente ? `Cliente: ${body.cliente}` : null);
    const status = pick(body.status, "ativa");
    const responsavel_id = pick(body.responsavel_id);
    const data_inicio = pick(body.data_inicio);
    const data_fim = pick(body.data_fim);

    const [exists] = await db.query(`SELECT id FROM jornadas_desenvolvimento WHERE id = ?`, [id]);
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
      [nome, descricao, objetivo, publico_macro, observacoes, status, responsavel_id, data_inicio, data_fim, id]
    );

    const [rows] = await db.query(`SELECT * FROM jornadas_desenvolvimento WHERE id = ?`, [id]);
    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar jornada:", error);
    res.status(500).json({ error: error.message || "Erro ao atualizar jornada." });
  }
}

async function remover(req, res) {
  try {
    const { id } = req.params;
    const [exists] = await db.query(`SELECT id FROM jornadas_desenvolvimento WHERE id = ?`, [id]);
    if (!exists.length) {
      return res.status(404).json({ error: "Jornada não encontrada." });
    }
    await db.query(`DELETE FROM jornadas_desenvolvimento WHERE id = ?`, [id]);
    res.json({ success: true, message: "Jornada removida com sucesso." });
  } catch (error) {
    console.error("Erro ao remover jornada:", error);
    res.status(500).json({ error: error.message || "Erro ao remover jornada." });
  }
}

module.exports = { listar, buscarPorId, criar, atualizar, remover };
