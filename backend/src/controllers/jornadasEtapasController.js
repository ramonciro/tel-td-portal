const db = require("../lib/db");

exports.listar = async (req, res) => {
  try {
    const tenantWhere = req.empresaId ? "WHERE je.empresa_id = ?" : "";
    const params = req.empresaId ? [req.empresaId] : [];

    const [rows] = await db.query(
      `
      SELECT je.*,
             jd.nome AS jornada_nome,
             u.nome AS responsavel_nome
      FROM jornadas_etapas je
      LEFT JOIN jornadas_desenvolvimento jd ON jd.id = je.jornada_id
      LEFT JOIN usuarios u ON u.id = je.responsavel_id
      ${tenantWhere}
      ORDER BY je.jornada_id ASC, je.ordem ASC, je.id ASC
      `,
      params
    );

    res.json(rows);
  } catch (error) {
    console.error("Erro ao listar etapas:", error);
    res.status(500).json({ error: "Erro ao listar etapas." });
  }
};

exports.buscarPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? " AND je.empresa_id = ?" : "";
    const params = req.empresaId ? [id, req.empresaId] : [id];

    const [rows] = await db.query(
      `
      SELECT je.*,
             jd.nome AS jornada_nome,
             u.nome AS responsavel_nome
      FROM jornadas_etapas je
      LEFT JOIN jornadas_desenvolvimento jd ON jd.id = je.jornada_id
      LEFT JOIN usuarios u ON u.id = je.responsavel_id
      WHERE je.id = ?${tenantCheck}
      `,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Etapa não encontrada." });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao buscar etapa:", error);
    res.status(500).json({ error: "Erro ao buscar etapa." });
  }
};

exports.criar = async (req, res) => {
  try {
    const {
      jornada_id,
      nome,
      descricao,
      objetivo,
      tipo,
      ordem,
      status,
      responsavel_id,
      data_inicio,
      data_fim,
      carga_horaria_prevista,
      carga_horaria_realizada,
      observacoes,
    } = req.body;

    if (!jornada_id || !nome) {
      return res.status(400).json({
        error: "Jornada e nome da etapa são obrigatórios.",
      });
    }

    const tenantCheckJornada = req.empresaId ? " AND empresa_id = ?" : "";
    const jornadaParams = req.empresaId ? [jornada_id, req.empresaId] : [jornada_id];
    const [jornada] = await db.query(
      `SELECT id FROM jornadas_desenvolvimento WHERE id = ?${tenantCheckJornada}`,
      jornadaParams
    );

    if (!jornada.length) {
      return res.status(404).json({ error: "Jornada não encontrada." });
    }

    const [result] = await db.query(
      `
      INSERT INTO jornadas_etapas
      (
        jornada_id,
        nome,
        descricao,
        objetivo,
        tipo,
        ordem,
        status,
        responsavel_id,
        data_inicio,
        data_fim,
        carga_horaria_prevista,
        carga_horaria_realizada,
        observacoes,
        empresa_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        Number(jornada_id),
        nome,
        descricao || null,
        objetivo || null,
        tipo || "treinamento",
        Number(ordem || 0),
        status || "planejada",
        responsavel_id || null,
        data_inicio || null,
        data_fim || null,
        Number(carga_horaria_prevista || 0),
        Number(carga_horaria_realizada || 0),
        observacoes || null,
        req.empresaId ?? null,
      ]
    );

    const [rows] = await db.query(
      `SELECT * FROM jornadas_etapas WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Erro ao criar etapa:", error);
    res.status(500).json({ error: "Erro ao criar etapa." });
  }
};

exports.atualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      jornada_id,
      nome,
      descricao,
      objetivo,
      tipo,
      ordem,
      status,
      responsavel_id,
      data_inicio,
      data_fim,
      carga_horaria_prevista,
      carga_horaria_realizada,
      observacoes,
    } = req.body;

    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(
      `SELECT id FROM jornadas_etapas WHERE id = ?${tenantCheck}`,
      checkParams
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Etapa não encontrada." });
    }

    // Se a etapa está sendo movida para outra jornada, garante que a nova
    // jornada também pertence ao mesmo tenant.
    if (req.empresaId) {
      const [jornadaDestino] = await db.query(
        `SELECT id FROM jornadas_desenvolvimento WHERE id = ? AND empresa_id = ?`,
        [Number(jornada_id), req.empresaId]
      );
      if (!jornadaDestino.length) {
        return res.status(404).json({ error: "Jornada não encontrada." });
      }
    }

    const updateParams = [
      Number(jornada_id),
      nome,
      descricao || null,
      objetivo || null,
      tipo || "treinamento",
      Number(ordem || 0),
      status || "planejada",
      responsavel_id || null,
      data_inicio || null,
      data_fim || null,
      Number(carga_horaria_prevista || 0),
      Number(carga_horaria_realizada || 0),
      observacoes || null,
      id,
    ];
    if (req.empresaId) updateParams.push(req.empresaId);

    await db.query(
      `
      UPDATE jornadas_etapas
      SET jornada_id = ?,
          nome = ?,
          descricao = ?,
          objetivo = ?,
          tipo = ?,
          ordem = ?,
          status = ?,
          responsavel_id = ?,
          data_inicio = ?,
          data_fim = ?,
          carga_horaria_prevista = ?,
          carga_horaria_realizada = ?,
          observacoes = ?
      WHERE id = ?${tenantCheck}
      `,
      updateParams
    );

    const [rows] = await db.query(
      `SELECT * FROM jornadas_etapas WHERE id = ?`,
      [id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar etapa:", error);
    res.status(500).json({ error: "Erro ao atualizar etapa." });
  }
};

exports.remover = async (req, res) => {
  try {
    const { id } = req.params;

    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(
      `SELECT id FROM jornadas_etapas WHERE id = ?${tenantCheck}`,
      checkParams
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Etapa não encontrada." });
    }

    await db.query(`DELETE FROM jornadas_etapas WHERE id = ?${tenantCheck}`, checkParams);

    res.json({ success: true, message: "Etapa removida com sucesso." });
  } catch (error) {
    console.error("Erro ao remover etapa:", error);
    res.status(500).json({ error: "Erro ao remover etapa." });
  }
};
