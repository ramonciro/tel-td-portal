const db = require("../lib/db");

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeStatus(value) {
  const raw = String(value || "").trim().toLowerCase();

  const map = {
    planejado: "planejada",
    planejada: "planejada",
    "em andamento": "em_andamento",
    em_andamento: "em_andamento",
    concluido: "concluida",
    "concluído": "concluida",
    concluida: "concluida",
    cancelado: "cancelada",
    cancelada: "cancelada",
  };

  return map[raw] || "planejada";
}

function buildPayload(body) {
  const cargaHoraria = toNumber(body.carga_horaria, 0);
  const participantesPrevistos = toNumber(body.participantes_previstos, 0);
  const participantesRealizados = toNumber(body.participantes_realizados, 0);

  const horasPlanejadasInformadas = toNumber(body.horas_planejadas, 0);
  let quantidadeTurmasSessoes = toNumber(body.quantidade_turmas_sessoes, 0);

  if (quantidadeTurmasSessoes <= 0 && cargaHoraria > 0 && horasPlanejadasInformadas > 0) {
    quantidadeTurmasSessoes = Math.ceil(horasPlanejadasInformadas / cargaHoraria);
  }

  const horasPlanejadas =
    horasPlanejadasInformadas > 0
      ? horasPlanejadasInformadas
      : quantidadeTurmasSessoes > 0 && cargaHoraria > 0
      ? Number((quantidadeTurmasSessoes * cargaHoraria).toFixed(2))
      : 0;

  const horasRealizadas =
    quantidadeTurmasSessoes > 0 && cargaHoraria > 0
      ? Number((quantidadeTurmasSessoes * cargaHoraria).toFixed(2))
      : 0;

  return {
    jornada_id: toNumber(body.jornada_id, 0),
    etapa_id: body.etapa_id ? toNumber(body.etapa_id, 0) : null,
    tipo_acao: body.tipo_acao || "treinamento",
    tema: String(body.tema || "").trim(),
    subtipo: body.subtipo || null,
    publico_alvo: body.publico_alvo || null,
    obrigatoria: toNumber(body.obrigatoria, 0),
    descricao: body.descricao || null,
    carga_horaria: cargaHoraria,
    participantes_previstos: participantesPrevistos,
    participantes_realizados: participantesRealizados,
    quantidade_turmas_sessoes: quantidadeTurmasSessoes,
    horas_planejadas: horasPlanejadas,
    horas_realizadas: horasRealizadas,
    status: normalizeStatus(body.status),
    responsavel_id: body.responsavel_id || null,
    data_inicio: body.data_inicio || null,
    data_fim: body.data_fim || null,
  };
}

exports.listar = async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT ad.*,
             jd.nome AS jornada_nome,
             je.nome AS etapa_nome,
             u.nome AS responsavel_nome
      FROM acoes_desenvolvimento ad
      LEFT JOIN jornadas_desenvolvimento jd ON jd.id = ad.jornada_id
      LEFT JOIN jornadas_etapas je ON je.id = ad.etapa_id
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
             je.nome AS etapa_nome,
             u.nome AS responsavel_nome
      FROM acoes_desenvolvimento ad
      LEFT JOIN jornadas_desenvolvimento jd ON jd.id = ad.jornada_id
      LEFT JOIN jornadas_etapas je ON je.id = ad.etapa_id
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
    const payload = buildPayload(req.body);

    if (!payload.jornada_id || !payload.tema) {
      return res.status(400).json({
        error: "Jornada e tema são obrigatórios.",
      });
    }

    const [jornada] = await db.query(
      `SELECT id FROM jornadas_desenvolvimento WHERE id = ?`,
      [payload.jornada_id]
    );

    if (!jornada.length) {
      return res.status(404).json({ error: "Jornada não encontrada." });
    }

    if (payload.etapa_id) {
      const [etapa] = await db.query(
        `SELECT id, jornada_id FROM jornadas_etapas WHERE id = ?`,
        [payload.etapa_id]
      );

      if (!etapa.length) {
        return res.status(404).json({ error: "Etapa não encontrada." });
      }

      if (String(etapa[0].jornada_id) !== String(payload.jornada_id)) {
        return res.status(400).json({ error: "A etapa informada não pertence à jornada selecionada." });
      }
    }

    const [result] = await db.query(
      `
      INSERT INTO acoes_desenvolvimento
      (
        jornada_id,
        etapa_id,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.jornada_id,
        payload.etapa_id,
        payload.tipo_acao,
        payload.tema,
        payload.subtipo,
        payload.publico_alvo,
        payload.obrigatoria,
        payload.descricao,
        payload.carga_horaria,
        payload.participantes_previstos,
        payload.participantes_realizados,
        payload.quantidade_turmas_sessoes,
        payload.horas_planejadas,
        payload.horas_realizadas,
        payload.status,
        payload.responsavel_id,
        payload.data_inicio,
        payload.data_fim,
      ]
    );

    const [rows] = await db.query(
      `SELECT * FROM acoes_desenvolvimento WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Erro ao criar ação:", {
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      sqlMessage: error?.sqlMessage,
      sql: error?.sql,
    });

    res.status(500).json({
      error: "Erro ao criar ação.",
      detail: error?.sqlMessage || error?.message || null,
      code: error?.code || null,
    });
  }
};

exports.atualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = buildPayload(req.body);

    const [exists] = await db.query(
      `SELECT id FROM acoes_desenvolvimento WHERE id = ?`,
      [id]
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Ação não encontrada." });
    }

    if (!payload.jornada_id || !payload.tema) {
      return res.status(400).json({
        error: "Jornada e tema são obrigatórios.",
      });
    }

    if (payload.etapa_id) {
      const [etapa] = await db.query(
        `SELECT id, jornada_id FROM jornadas_etapas WHERE id = ?`,
        [payload.etapa_id]
      );

      if (!etapa.length) {
        return res.status(404).json({ error: "Etapa não encontrada." });
      }

      if (String(etapa[0].jornada_id) !== String(payload.jornada_id)) {
        return res.status(400).json({ error: "A etapa informada não pertence à jornada selecionada." });
      }
    }

    await db.query(
      `
      UPDATE acoes_desenvolvimento
      SET jornada_id = ?,
          etapa_id = ?,
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
        payload.jornada_id,
        payload.etapa_id,
        payload.tipo_acao,
        payload.tema,
        payload.subtipo,
        payload.publico_alvo,
        payload.obrigatoria,
        payload.descricao,
        payload.carga_horaria,
        payload.participantes_previstos,
        payload.participantes_realizados,
        payload.quantidade_turmas_sessoes,
        payload.horas_planejadas,
        payload.horas_realizadas,
        payload.status,
        payload.responsavel_id,
        payload.data_inicio,
        payload.data_fim,
        id,
      ]
    );

    const [rows] = await db.query(
      `SELECT * FROM acoes_desenvolvimento WHERE id = ?`,
      [id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar ação:", {
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      sqlMessage: error?.sqlMessage,
      sql: error?.sql,
    });

    res.status(500).json({
      error: "Erro ao atualizar ação.",
      detail: error?.sqlMessage || error?.message || null,
      code: error?.code || null,
    });
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
