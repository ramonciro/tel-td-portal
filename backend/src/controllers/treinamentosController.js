import pool from "../db.js";

export async function listTreinamentos(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        tema,
        cliente,
        instrutor,
        carga_horaria,
        participantes,
        publico,
        status,
        descricao
      FROM treinamentos
      ORDER BY id DESC
    `);

    res.json(rows);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao listar treinamentos",
      error: error.message,
    });
  }
}

export async function getTreinamentoById(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        id,
        tema,
        cliente,
        instrutor,
        carga_horaria,
        participantes,
        publico,
        status,
        descricao
      FROM treinamentos
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: "Treinamento não encontrado",
      });
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao buscar treinamento",
      error: error.message,
    });
  }
}

export async function createTreinamento(req, res) {
  try {
    const {
      tema,
      cliente,
      instrutor,
      carga_horaria,
      participantes,
      publico,
      status,
      descricao,
    } = req.body || {};

    if (!tema) {
      return res.status(400).json({
        ok: false,
        message: "Informe o tema do treinamento",
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO treinamentos
      (tema, cliente, instrutor, carga_horaria, participantes, publico, status, descricao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        tema,
        cliente || null,
        instrutor || null,
        carga_horaria || null,
        participantes || 0,
        publico || null,
        status || "planejado",
        descricao || null,
      ]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao criar treinamento",
      error: error.message,
    });
  }
}

export async function updateTreinamento(req, res) {
  try {
    const { id } = req.params;
    const {
      tema,
      cliente,
      instrutor,
      carga_horaria,
      participantes,
      publico,
      status,
      descricao,
    } = req.body || {};

    if (!tema) {
      return res.status(400).json({
        ok: false,
        message: "Informe o tema do treinamento",
      });
    }

    await pool.query(
      `
      UPDATE treinamentos
      SET
        tema = ?,
        cliente = ?,
        instrutor = ?,
        carga_horaria = ?,
        participantes = ?,
        publico = ?,
        status = ?,
        descricao = ?
      WHERE id = ?
      `,
      [
        tema,
        cliente || null,
        instrutor || null,
        carga_horaria || null,
        participantes || 0,
        publico || null,
        status || "planejado",
        descricao || null,
        id,
      ]
    );

    res.json({
      ok: true,
      message: "Treinamento atualizado com sucesso",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao atualizar treinamento",
      error: error.message,
    });
  }
}

export async function deleteTreinamento(req, res) {
  try {
    const { id } = req.params;

    await pool.query("DELETE FROM treinamentos WHERE id = ?", [id]);

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao excluir treinamento",
      error: error.message,
    });
  }
}

export async function migrarTreinamentosCampos(req, res) {
  try {
    try {
      await pool.query("ALTER TABLE treinamentos ADD COLUMN participantes INT DEFAULT 0");
    } catch {}

    await pool.query(`
      UPDATE treinamentos
      SET participantes = 0
      WHERE participantes IS NULL
    `);

    res.json({
      ok: true,
      message: "Campos de treinamentos atualizados com sucesso",
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao migrar treinamentos",
      error: error.message,
    });
  }
}
