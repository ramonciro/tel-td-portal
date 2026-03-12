import pool from "../db.js";

export async function listTreinamentos(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id, tema, cliente, instrutor, data, status,
        IFNULL(carga_horaria, 0) AS carga_horaria,
        IFNULL(participantes_previstos, 0) AS participantes_previstos,
        IFNULL(participantes_presentes, 0) AS participantes_presentes,
        IFNULL(concluidos, 0) AS concluidos
      FROM treinamentos
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao listar treinamentos", error: error.message });
  }
}

export async function createTreinamento(req, res) {
  try {
    const {
      tema, cliente, instrutor, data, status,
      carga_horaria, participantes_previstos, participantes_presentes, concluidos
    } = req.body || {};

    if (!tema || !cliente || !instrutor || !data || !status) {
      return res.status(400).json({ ok: false, message: "Preencha os campos obrigatórios do treinamento" });
    }

    const [result] = await pool.query(`
      INSERT INTO treinamentos
      (tema, cliente, instrutor, data, status, carga_horaria, participantes_previstos, participantes_presentes, concluidos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tema, cliente, instrutor, data, status,
      carga_horaria || 0, participantes_previstos || 0, participantes_presentes || 0, concluidos || 0
    ]);

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao criar treinamento", error: error.message });
  }
}

export async function updateTreinamento(req, res) {
  try {
    const { id } = req.params;
    const {
      tema, cliente, instrutor, data, status,
      carga_horaria, participantes_previstos, participantes_presentes, concluidos
    } = req.body || {};

    if (!tema || !cliente || !instrutor || !data || !status) {
      return res.status(400).json({ ok: false, message: "Preencha os campos obrigatórios do treinamento" });
    }

    await pool.query(`
      UPDATE treinamentos
      SET tema = ?, cliente = ?, instrutor = ?, data = ?, status = ?,
          carga_horaria = ?, participantes_previstos = ?, participantes_presentes = ?, concluidos = ?
      WHERE id = ?
    `, [
      tema, cliente, instrutor, data, status,
      carga_horaria || 0, participantes_previstos || 0, participantes_presentes || 0, concluidos || 0, id
    ]);

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao atualizar treinamento", error: error.message });
  }
}

export async function deleteTreinamento(req, res) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM treinamentos WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao excluir treinamento", error: error.message });
  }
}
