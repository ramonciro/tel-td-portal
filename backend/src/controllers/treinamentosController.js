const pool = require("../lib/db");

async function listTreinamentos(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, tema, cliente, instrutor, carga_horaria,
             participantes_previstos, participantes_presentes, concluidos, status
      FROM treinamentos ORDER BY id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao listar treinamentos", error: error.message });
  }
}

async function getTreinamentoById(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT id, tema, cliente, instrutor, carga_horaria,
              participantes_previstos, participantes_presentes, concluidos, status
       FROM treinamentos WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao buscar treinamento", error: error.message });
  }
}

async function createTreinamento(req, res) {
  try {
    const {
      tema, cliente, instrutor, carga_horaria,
      participantes_previstos, participantes_presentes, concluidos, status,
    } = req.body || {};

    if (!tema) {
      return res.status(400).json({ ok: false, message: "Informe o tema do treinamento" });
    }

    const [result] = await pool.query(
      `INSERT INTO treinamentos
         (tema, cliente, instrutor, carga_horaria, participantes_previstos,
          participantes_presentes, concluidos, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tema,
        cliente    || null,
        instrutor  || null,
        carga_horaria          != null ? carga_horaria          : 0,
        participantes_previstos != null ? participantes_previstos : 0,
        participantes_presentes != null ? participantes_presentes : 0,
        concluidos != null ? concluidos : 0,
        status     || "planejado",
      ]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao criar treinamento", error: error.message });
  }
}

async function updateTreinamento(req, res) {
  try {
    const { id } = req.params;
    const {
      tema, cliente, instrutor, carga_horaria,
      participantes_previstos, participantes_presentes, concluidos, status,
    } = req.body || {};

    if (!tema) {
      return res.status(400).json({ ok: false, message: "Informe o tema do treinamento" });
    }

    await pool.query(
      `UPDATE treinamentos
       SET tema = ?, cliente = ?, instrutor = ?, carga_horaria = ?,
           participantes_previstos = ?, participantes_presentes = ?, concluidos = ?, status = ?
       WHERE id = ?`,
      [
        tema,
        cliente    || null,
        instrutor  || null,
        carga_horaria          != null ? carga_horaria          : 0,
        participantes_previstos != null ? participantes_previstos : 0,
        participantes_presentes != null ? participantes_presentes : 0,
        concluidos != null ? concluidos : 0,
        status     || "planejado",
        id,
      ]
    );

    res.json({ ok: true, message: "Treinamento atualizado com sucesso" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao atualizar treinamento", error: error.message });
  }
}

async function deleteTreinamento(req, res) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM treinamentos WHERE id = ?", [id]);
    res.json({ ok: true, message: "Treinamento excluído com sucesso" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao excluir treinamento", error: error.message });
  }
}

module.exports = {
  listTreinamentos,
  getTreinamentoById,
  createTreinamento,
  updateTreinamento,
  deleteTreinamento,
};
