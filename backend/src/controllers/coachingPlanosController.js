const db = require("../config/db");

exports.listar = async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT cp.*,
             jd.nome AS jornada_nome,
             jd.cliente AS jornada_cliente,
             ad.tema AS acao_tema,
             u.nome AS responsavel_nome
      FROM coaching_planos cp
      LEFT JOIN jornadas_desenvolvimento jd ON jd.id = cp.jornada_id
      LEFT JOIN acoes_desenvolvimento ad ON ad.id = cp.acao_id
      LEFT JOIN usuarios u ON u.id = cp.responsavel_id
      ORDER BY cp.id DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error("Erro ao listar planos de coaching:", error);
    res.status(500).json({ error: "Erro ao listar planos de coaching." });
  }
};

exports.buscarPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT cp.*,
             jd.nome AS jornada_nome,
             jd.cliente AS jornada_cliente,
             ad.tema AS acao_tema,
             u.nome AS responsavel_nome
      FROM coaching_planos cp
      LEFT JOIN jornadas_desenvolvimento jd ON jd.id = cp.jornada_id
      LEFT JOIN acoes_desenvolvimento ad ON ad.id = cp.acao_id
      LEFT JOIN usuarios u ON u.id = cp.responsavel_id
      WHERE cp.id = ?
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Plano de coaching não encontrado." });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao buscar plano de coaching:", error);
    res.status(500).json({ error: "Erro ao buscar plano de coaching." });
  }
};

exports.criar = async (req, res) => {
  try {
    const {
      jornada_id,
      acao_id,
      cliente,
      tipo_coaching,
      titulo,
      publico_alvo,
      objetivo,
      responsavel_id,
      participantes_previstos,
      participantes_realizados,
      sessoes_previstas,
      sessoes_realizadas,
      carga_horaria_sessao,
      horas_totais,
      status,
      data_inicio,
      data_fim,
    } = req.body;

    if (!jornada_id || !titulo) {
      return res.status(400).json({
        error: "Jornada e título são obrigatórios.",
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
      INSERT INTO coaching_planos
      (
        jornada_id,
        acao_id,
        cliente,
        tipo_coaching,
        titulo,
        publico_alvo,
        objetivo,
        responsavel_id,
        participantes_previstos,
        participantes_realizados,
        sessoes_previstas,
        sessoes_realizadas,
        carga_horaria_sessao,
        horas_totais,
        status,
        data_inicio,
        data_fim
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        jornada_id,
        acao_id || null,
        cliente || null,
        tipo_coaching || "desenvolvimento",
        titulo,
        publico_alvo || null,
        objetivo || null,
        responsavel_id || null,
        Number(participantes_previstos || 0),
        Number(participantes_realizados || 0),
        Number(sessoes_previstas || 0),
        Number(sessoes_realizadas || 0),
        Number(carga_horaria_sessao || 0),
        Number(horas_totais || 0),
        status || "planejado",
        data_inicio || null,
        data_fim || null,
      ]
    );

    const [rows] = await db.query(
      `SELECT * FROM coaching_planos WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Erro ao criar plano de coaching:", error);
    res.status(500).json({ error: "Erro ao criar plano de coaching." });
  }
};

exports.atualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      jornada_id,
      acao_id,
      cliente,
      tipo_coaching,
      titulo,
      publico_alvo,
      objetivo,
      responsavel_id,
      participantes_previstos,
      participantes_realizados,
      sessoes_previstas,
      sessoes_realizadas,
      carga_horaria_sessao,
      horas_totais,
      status,
      data_inicio,
      data_fim,
    } = req.body;

    const [exists] = await db.query(
      `SELECT id FROM coaching_planos WHERE id = ?`,
      [id]
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Plano de coaching não encontrado." });
    }

    await db.query(
      `
      UPDATE coaching_planos
      SET jornada_id = ?,
          acao_id = ?,
          cliente = ?,
          tipo_coaching = ?,
          titulo = ?,
          publico_alvo = ?,
          objetivo = ?,
          responsavel_id = ?,
          participantes_previstos = ?,
          participantes_realizados = ?,
          sessoes_previstas = ?,
          sessoes_realizadas = ?,
          carga_horaria_sessao = ?,
          horas_totais = ?,
          status = ?,
          data_inicio = ?,
          data_fim = ?
      WHERE id = ?
      `,
      [
        jornada_id,
        acao_id || null,
        cliente || null,
        tipo_coaching || "desenvolvimento",
        titulo,
        publico_alvo || null,
        objetivo || null,
        responsavel_id || null,
        Number(participantes_previstos || 0),
        Number(participantes_realizados || 0),
        Number(sessoes_previstas || 0),
        Number(sessoes_realizadas || 0),
        Number(carga_horaria_sessao || 0),
        Number(horas_totais || 0),
        status || "planejado",
        data_inicio || null,
        data_fim || null,
        id,
      ]
    );

    const [rows] = await db.query(
      `SELECT * FROM coaching_planos WHERE id = ?`,
      [id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar plano de coaching:", error);
    res.status(500).json({ error: "Erro ao atualizar plano de coaching." });
  }
};

exports.remover = async (req, res) => {
  try {
    const { id } = req.params;

    const [exists] = await db.query(
      `SELECT id FROM coaching_planos WHERE id = ?`,
      [id]
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Plano de coaching não encontrado." });
    }

    await db.query(`DELETE FROM coaching_planos WHERE id = ?`, [id]);

    res.json({ success: true, message: "Plano de coaching removido com sucesso." });
  } catch (error) {
    console.error("Erro ao remover plano de coaching:", error);
    res.status(500).json({ error: "Erro ao remover plano de coaching." });
  }
};
