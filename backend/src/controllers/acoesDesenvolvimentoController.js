const db = require("../lib/db");

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function listar(req, res) {
  try {
    const tenantWhere = req.empresaId ? "WHERE a.empresa_id = ?" : "";
    const params = req.empresaId ? [req.empresaId] : [];

    const [rows] = await db.query(
      `
      SELECT
        a.*,
        j.nome AS jornada_nome,
        u.nome AS responsavel_nome
      FROM acoes_desenvolvimento a
      LEFT JOIN jornadas_desenvolvimento j ON j.id = a.jornada_id
      LEFT JOIN usuarios u ON u.id = a.responsavel_id
      ${tenantWhere}
      ORDER BY a.id DESC
      `,
      params
    );

    return res.json(Array.isArray(rows) ? rows : []);
  } catch (error) {
    console.error("Erro ao listar ações de desenvolvimento:", error);
    return res
      .status(500)
      .json({ error: "Erro ao listar ações de desenvolvimento." });
  }
}

async function detalhar(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? " AND a.empresa_id = ?" : "";
    const params = req.empresaId ? [id, req.empresaId] : [id];

    const [rows] = await db.query(
      `
      SELECT
        a.*,
        j.nome AS jornada_nome,
        u.nome AS responsavel_nome
      FROM acoes_desenvolvimento a
      LEFT JOIN jornadas_desenvolvimento j ON j.id = a.jornada_id
      LEFT JOIN usuarios u ON u.id = a.responsavel_id
      WHERE a.id = ?${tenantCheck}
      LIMIT 1
      `,
      params
    );

    const acao = rows?.[0];

    if (!acao) {
      return res.status(404).json({ error: "Ação não encontrada." });
    }

    return res.json(acao);
  } catch (error) {
    console.error("Erro ao detalhar ação de desenvolvimento:", error);
    return res.status(500).json({ error: "Erro ao detalhar ação." });
  }
}

async function criar(req, res) {
  try {
    const body = req.body || {};

    const jornadaId = body.jornada_id ? Number(body.jornada_id) : null;
    const tema = String(body.titulo || body.tema || "").trim();
    const descricao = body.descricao || null;
    const status = body.status || "planejada";
    const responsavelId = body.responsavel_id ? Number(body.responsavel_id) : null;
    const dataInicio = body.data_inicio || null;
    const dataFim = body.data_fim || null;
    const cargaHoraria = toNumber(body.carga_horaria, 0);
    const participantesPrevistos = toNumber(body.participantes_previstos, 0);
    const participantesRealizados = toNumber(body.participantes_realizados, 0);
    const quantidadeTurmasSessoes = toNumber(body.quantidade_turmas_sessoes, 0);
    const horasPlanejadas = toNumber(body.horas_planejadas, 0);
    const horasRealizadas = toNumber(body.horas_realizadas, 0);

    if (!jornadaId || !tema) {
      return res.status(400).json({
        error: "Jornada e título da ação são obrigatórios.",
      });
    }

    if (req.empresaId) {
      const [jornadaDoTenant] = await db.query(
        `SELECT id FROM jornadas_desenvolvimento WHERE id = ? AND empresa_id = ?`,
        [jornadaId, req.empresaId]
      );
      if (!jornadaDoTenant.length) {
        return res.status(404).json({ error: "Jornada não encontrada." });
      }
    }

    const [result] = await db.query(
      `
      INSERT INTO acoes_desenvolvimento (
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
        data_fim,
        empresa_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        jornadaId,
        null,
        "treinamento",
        tema,
        null,
        null,
        0,
        descricao,
        cargaHoraria,
        participantesPrevistos,
        participantesRealizados,
        quantidadeTurmasSessoes,
        horasPlanejadas,
        horasRealizadas,
        status,
        responsavelId,
        dataInicio,
        dataFim,
        req.empresaId ?? null,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT 
        a.*,
        j.nome AS jornada_nome,
        u.nome AS responsavel_nome
      FROM acoes_desenvolvimento a
      LEFT JOIN jornadas_desenvolvimento j ON j.id = a.jornada_id
      LEFT JOIN usuarios u ON u.id = a.responsavel_id
      WHERE a.id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json(rows?.[0] || {});
  } catch (error) {
    console.error("Erro ao criar ação de desenvolvimento:", error);
    return res.status(500).json({
      error: error.message || "Erro ao criar ação.",
    });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const jornadaId = body.jornada_id ? Number(body.jornada_id) : null;
    const tema = String(body.titulo || body.tema || "").trim();
    const descricao = body.descricao || null;
    const status = body.status || "planejada";
    const responsavelId = body.responsavel_id ? Number(body.responsavel_id) : null;
    const dataInicio = body.data_inicio || null;
    const dataFim = body.data_fim || null;
    const cargaHoraria = toNumber(body.carga_horaria, 0);
    const participantesPrevistos = toNumber(body.participantes_previstos, 0);
    const participantesRealizados = toNumber(body.participantes_realizados, 0);
    const quantidadeTurmasSessoes = toNumber(body.quantidade_turmas_sessoes, 0);
    const horasPlanejadas = toNumber(body.horas_planejadas, 0);
    const horasRealizadas = toNumber(body.horas_realizadas, 0);

    if (!jornadaId || !tema) {
      return res.status(400).json({
        error: "Jornada e título da ação são obrigatórios.",
      });
    }

    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(
      `
      SELECT id
      FROM acoes_desenvolvimento
      WHERE id = ?${tenantCheck}
      LIMIT 1
      `,
      checkParams
    );

    if (!exists?.length) {
      return res.status(404).json({ error: "Ação não encontrada." });
    }

    if (req.empresaId) {
      const [jornadaDoTenant] = await db.query(
        `SELECT id FROM jornadas_desenvolvimento WHERE id = ? AND empresa_id = ?`,
        [jornadaId, req.empresaId]
      );
      if (!jornadaDoTenant.length) {
        return res.status(404).json({ error: "Jornada não encontrada." });
      }
    }

    const updateParams = [
      jornadaId,
      tema,
      descricao,
      cargaHoraria,
      participantesPrevistos,
      participantesRealizados,
      quantidadeTurmasSessoes,
      horasPlanejadas,
      horasRealizadas,
      status,
      responsavelId,
      dataInicio,
      dataFim,
      id,
    ];
    if (req.empresaId) updateParams.push(req.empresaId);

    await db.query(
      `
      UPDATE acoes_desenvolvimento
      SET
        jornada_id = ?,
        tema = ?,
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
      WHERE id = ?${tenantCheck}
      `,
      updateParams
    );

    const [rows] = await db.query(
      `
      SELECT 
        a.*,
        j.nome AS jornada_nome,
        u.nome AS responsavel_nome
      FROM acoes_desenvolvimento a
      LEFT JOIN jornadas_desenvolvimento j ON j.id = a.jornada_id
      LEFT JOIN usuarios u ON u.id = a.responsavel_id
      WHERE a.id = ?
      LIMIT 1
      `,
      [id]
    );

    return res.json(rows?.[0] || { id: Number(id) });
  } catch (error) {
    console.error("Erro ao atualizar ação de desenvolvimento:", error);
    return res.status(500).json({
      error: error.message || "Erro ao atualizar ação.",
    });
  }
}

async function remover(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];

    if (req.empresaId) {
      const [exists] = await db.query(
        `SELECT id FROM acoes_desenvolvimento WHERE id = ?${tenantCheck}`,
        checkParams
      );
      if (!exists.length) {
        return res.status(404).json({ error: "Ação não encontrada." });
      }
    }

    await db.query(`DELETE FROM acoes_desenvolvimento WHERE id = ?${tenantCheck}`, checkParams);

    return res.json({ ok: true });
  } catch (error) {
    console.error("Erro ao remover ação de desenvolvimento:", error);
    return res.status(500).json({ error: "Erro ao remover ação." });
  }
}

module.exports = {
  listar,
  detalhar,
  criar,
  atualizar,
  remover,
};
