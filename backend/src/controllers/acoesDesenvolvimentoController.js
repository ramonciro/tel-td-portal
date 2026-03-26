const db = require("../lib/db");

exports.listar = async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT ad.*,
             jd.nome AS jornada_nome,
             jd.cliente,
             u.nome AS responsavel_nome
      FROM acoes_desenvolvimento ad
      LEFT JOIN jornadas_desenvolvimento jd ON jd.id = ad.jornada_id
      LEFT JOIN usuarios u ON u.id = ad.responsavel_id
      ORDER BY ad.id DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error("Erro ao listar ações:", error);
    res.status(500).json({ error: "Erro ao listar ações." });
  }
};

exports.buscarPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT ad.*,
             jd.nome AS jornada_nome,
             jd.cliente,
             u.nome AS responsavel_nome
      FROM acoes_desenvolvimento ad
      LEFT JOIN jornadas_desenvolvimento jd ON jd.id = ad.jornada_id
      LEFT JOIN usuarios u ON u.id = ad.responsavel_id
      WHERE ad.id = ?
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Ação não encontrada." });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao buscar ação:", error);
    res.status(500).json({ error: "Erro ao buscar ação." });
  }
};

exports.criar = async (req, res) => {
  try {
    const {
      jornada_id,
      tipo_acao,
      tema,
      subtipo,
      publico_alvo,
      obrigatoria,
      descricao,
      carga_horaria,
      participantes_previstos,
      participantes_realizados,
      quantidade_turmas_sessoes,
      horas_planejadas,
      horas_realizadas,
      status,
      responsavel_id,
      data_inicio,
      data_fim,
    } = req.body;

    if (!jornada_id || !tema) {
      return res.status(400).json({
        error: "Jornada e tema são obrigatórios.",
      });
    }

    const [jornada] = await db.query(
      `SELECT id FROM jornadas_desenvolvimento WHERE id = ?`,
      [jornada_id]
    );

    if (!jornada.length) {
      return res.status(404).json({ error: "Jornada não encontrada." });
    }

    const [result] = await db.query(
      `
      INSERT INTO acoes_desenvolvimento
      (
        jornada_id,
        tipo_acao,
        tema,
        subtipo,
        publico_alvo,
        obrigatoria,
        descricao,
        carga_horaria,
        participantes_previstos,
        participantes_realizados,
        quantidade_turmas_sessoes,
        horas_planejadas,
        horas_realizadas,
        status,
        responsavel_id,
        data_inicio,
        data_fim
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        jornada_id,
        tipo_acao || "treinamento",
        tema,
        subtipo || null,
        publico_alvo || null,
        Number(obrigatoria || 0),
        descricao || null,
        Number(carga_horaria || 0),
        Number(participantes_previstos || 0),
        Number(participantes_realizados || 0),
        Number(quantidade_turmas_sessoes || 0),
        Number(horas_planejadas || 0),
        Number(horas_realizadas || 0),
        status || "planejada",
        responsavel_id || null,
        data_inicio || null,
        data_fim || null,
      ]
    );

    const [rows] = await db.query(
      `SELECT * FROM acoes_desenvolvimento WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Erro ao criar ação:", error);
    res.status(500).json({ error: "Erro ao criar ação." });
  }
};

exports.atualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      jornada_id,
      tipo_acao,
      tema,
      subtipo,
      publico_alvo,
      obrigatoria,
      descricao,
      carga_horaria,
      participantes_previstos,
      participantes_realizados,
      quantidade_turmas_sessoes,
      horas_planejadas,
      horas_realizadas,
      status,
      responsavel_id,
      data_inicio,
      data_fim,
    } = req.body;

    const [exists] = await db.query(
      `SELECT id FROM acoes_desenvolvimento WHERE id = ?`,
      [id]
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Ação não encontrada." });
    }

    await db.query(
      `
      UPDATE acoes_desenvolvimento
      SET jornada_id = ?,
          tipo_acao = ?,
          tema = ?,
          subtipo = ?,
          publico_alvo = ?,
          obrigatoria = ?,
          descricao = ?,
          carga_horaria = ?,
          participantes_previstos = ?,
          participantes_realizados = ?,
          quantidade_turmas_sessoes = ?,
          horas_planejadas = ?,
          horas_realizadas = ?,
          status = ?,
          responsavel_id = ?,
          data_inicio = ?,
          data_fim = ?
      WHERE id = ?
      `,
      [
        jornada_id,
        tipo_acao || "treinamento",
        tema,
        subtipo || null,
        publico_alvo || null,
        Number(obrigatoria || 0),
        descricao || null,
        Number(carga_horaria || 0),
        Number(participantes_previstos || 0),
        Number(participantes_realizados || 0),
        Number(quantidade_turmas_sessoes || 0),
        Number(horas_planejadas || 0),
        Number(horas_realizadas || 0),
        status || "planejada",
        responsavel_id || null,
        data_inicio || null,
        data_fim || null,
        id,
      ]
    );

    const [rows] = await db.query(
      `SELECT * FROM acoes_desenvolvimento WHERE id = ?`,
      [id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar ação:", error);
    res.status(500).json({ error: "Erro ao atualizar ação." });
  }
};

exports.remover = async (req, res) => {
  try {
    const { id } = req.params;

    const [exists] = await db.query(
      `SELECT id FROM acoes_desenvolvimento WHERE id = ?`,
      [id]
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Ação não encontrada." });
    }

    await db.query(`DELETE FROM acoes_desenvolvimento WHERE id = ?`, [id]);

    res.json({ success: true, message: "Ação removida com sucesso." });
  } catch (error) {
    console.error("Erro ao remover ação:", error);
    res.status(500).json({ error: "Erro ao remover ação." });
  }
};
