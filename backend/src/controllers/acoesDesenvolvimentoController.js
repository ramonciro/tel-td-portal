const db = require("../db");

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function listar(req, res) {
  try {
    const [rows] = await db.query(
      `
      SELECT *
      FROM acoes_desenvolvimento
      ORDER BY id DESC
      `
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

    const [rows] = await db.query(
      `
      SELECT *
      FROM acoes_desenvolvimento
      WHERE id = ?
      LIMIT 1
      `,
      [id]
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
    const titulo = String(body.titulo || "").trim();
    const payload = {
  jornada_id: Number(body.jornada_id),
  titulo: body.titulo,
  descricao: body.descricao || null,
  responsavel: body.responsavel || null,
  status: body.status || "planejada",
  data_inicio: body.data_inicio || null,
  data_fim: body.data_fim || null,
  carga_horaria: Number(body.carga_horaria || 0),
  participantes_previstos: Number(body.participantes_previstos || 0),
  quantidade_turmas_sessoes: Number(body.quantidade_turmas_sessoes || 0),
  participantes_realizados: Number(body.participantes_realizados || 0),
  horas_planejadas: Number(body.horas_planejadas || 0),
  horas_realizadas: Number(body.horas_realizadas || 0),
};

    if (!jornadaId || !titulo) {
      return res
        .status(400)
        .json({ error: "Jornada e título da ação são obrigatórios." });
    }

    const [result] = await db.query(
      `
      INSERT INTO acoes_desenvolvimento (
        jornada_id,
        titulo,
        descricao,
        responsavel,
        status,
        data_inicio,
        data_fim,
        carga_horaria,
        quantidade_turmas_sessoes,
        participantes_previstos,
        participantes_realizados,
        horas_planejadas,
        horas_realizadas
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        jornadaId,
        titulo,
        descricao,
        responsavel,
        status,
        dataInicio,
        dataFim,
        cargaHoraria,
        quantidadeTurmasSessoes,
        participantesPrevistos,
        participantesRealizados,
        horasPlanejadas,
        horasRealizadas,
      ]
    );

    const acaoId = result.insertId;

    const [rows] = await db.query(
      `
      SELECT *
      FROM acoes_desenvolvimento
      WHERE id = ?
      LIMIT 1
      `,
      [acaoId]
    );

    return res.status(201).json(rows?.[0] || { id: acaoId });
  } catch (error) {
    console.error("Erro ao criar ação de desenvolvimento:", error);
    return res.status(500).json({ error: "Erro ao criar ação." });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const payload = {
  jornada_id: Number(body.jornada_id),
  titulo: body.titulo,
  descricao: body.descricao || null,
  responsavel: body.responsavel || null,
  status: body.status || "planejada",
  data_inicio: body.data_inicio || null,
  data_fim: body.data_fim || null,
  carga_horaria: Number(body.carga_horaria || 0),
  participantes_previstos: Number(body.participantes_previstos || 0),
  quantidade_turmas_sessoes: Number(body.quantidade_turmas_sessoes || 0),
  participantes_realizados: Number(body.participantes_realizados || 0),
  horas_planejadas: Number(body.horas_planejadas || 0),
  horas_realizadas: Number(body.horas_realizadas || 0),
}; 
    
    if (!jornadaId || !titulo) {
      return res
        .status(400)
        .json({ error: "Jornada e título da ação são obrigatórios." });
    }

    const [exists] = await db.query(
      `
      SELECT id
      FROM acoes_desenvolvimento
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!exists?.length) {
      return res.status(404).json({ error: "Ação não encontrada." });
    }

    await db.query(
      `
      UPDATE acoes_desenvolvimento
      SET
        jornada_id = ?,
        titulo = ?,
        descricao = ?,
        responsavel = ?,
        status = ?,
        data_inicio = ?,
        data_fim = ?,
        carga_horaria = ?,
        quantidade_turmas_sessoes = ?,
        participantes_previstos = ?,
        participantes_realizados = ?,
        horas_planejadas = ?,
        horas_realizadas = ?
      WHERE id = ?
      `,
      [
        jornadaId,
        titulo,
        descricao,
        responsavel,
        status,
        dataInicio,
        dataFim,
        cargaHoraria,
        quantidadeTurmasSessoes,
        participantesPrevistos,
        participantesRealizados,
        horasPlanejadas,
        horasRealizadas,
        id,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT *
      FROM acoes_desenvolvimento
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    return res.json(rows?.[0] || { id: Number(id) });
  } catch (error) {
    console.error("Erro ao atualizar ação de desenvolvimento:", error);
    return res.status(500).json({ error: "Erro ao atualizar ação." });
  }
}

async function remover(req, res) {
  try {
    const { id } = req.params;

    await db.query(`DELETE FROM acoes_desenvolvimento WHERE id = ?`, [id]);

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
