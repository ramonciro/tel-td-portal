const db = require("../db");

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeIds(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];
}

async function countParticipantesByTreinamento(treinamentoId) {
  try {
    const [rows] = await db.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes
      WHERE treinamento_id = ?
      `,
      [treinamentoId]
    );

    return toNumber(rows?.[0]?.total, 0);
  } catch {
    return 0;
  }
}

async function loadTurmasByAcaoId(acaoId) {
  const [rows] = await db.query(
    `
    SELECT
      t.id,
      t.tema,
      t.cliente,
      t.instrutor,
      t.data,
      t.data_inicio,
      t.data_fim,
      COALESCE(t.carga_horaria, 0) AS carga_horaria
    FROM acoes_desenvolvimento_turmas rel
    INNER JOIN treinamentos t
      ON t.id = rel.treinamento_id
    WHERE rel.acao_id = ?
    ORDER BY
      COALESCE(t.data_inicio, t.data, t.data_fim) ASC,
      t.id ASC
    `,
    [acaoId]
  );

  const base = Array.isArray(rows) ? rows : [];

  const turmas = await Promise.all(
    base.map(async (item) => {
      const participantes = await countParticipantesByTreinamento(item.id);

      return {
        ...item,
        participantes,
      };
    })
  );

  return turmas;
}

async function buildResumoTurmas(acaoId) {
  const turmas = await loadTurmasByAcaoId(acaoId);

  const quantidadeTurmas = turmas.length;
  const participantesRealizados = turmas.reduce(
    (acc, item) => acc + toNumber(item.participantes, 0),
    0
  );
  const horasPlanejadas = turmas.reduce(
    (acc, item) => acc + toNumber(item.carga_horaria, 0),
    0
  );

  return {
    turmas,
    quantidadeTurmas,
    participantesRealizados,
    horasPlanejadas,
    horasRealizadas: horasPlanejadas,
  };
}

async function syncTurmasDaAcao(acaoId, turmaIds = []) {
  const ids = normalizeIds(turmaIds);

  await db.query(
    `DELETE FROM acoes_desenvolvimento_turmas WHERE acao_id = ?`,
    [acaoId]
  );

  if (!ids.length) return;

  const values = ids.map((treinamentoId) => [Number(acaoId), treinamentoId]);

  await db.query(
    `
    INSERT INTO acoes_desenvolvimento_turmas (acao_id, treinamento_id)
    VALUES ?
    `,
    [values]
  );
}

async function persistResumoTurmas(acaoId) {
  const resumo = await buildResumoTurmas(acaoId);

  await db.query(
    `
    UPDATE acoes_desenvolvimento
    SET
      quantidade_turmas_sessoes = ?,
      participantes_realizados = ?,
      horas_planejadas = ?,
      horas_realizadas = ?
    WHERE id = ?
    `,
    [
      resumo.quantidadeTurmas,
      resumo.participantesRealizados,
      resumo.horasPlanejadas,
      resumo.horasRealizadas,
      acaoId,
    ]
  );

  return resumo;
}

async function mapAcaoWithTurmas(acao) {
  const resumo = await buildResumoTurmas(acao.id);

  return {
    ...acao,
    turmas_vinculadas: resumo.turmas,
    quantidade_turmas_sessoes: resumo.quantidadeTurmas,
    participantes_realizados: resumo.participantesRealizados,
    horas_planejadas: resumo.horasPlanejadas,
    horas_realizadas: resumo.horasRealizadas,
  };
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

    const lista = await Promise.all(
      (Array.isArray(rows) ? rows : []).map((acao) => mapAcaoWithTurmas(acao))
    );

    return res.json(lista);
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

    const payload = await mapAcaoWithTurmas(acao);
    return res.json(payload);
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
    const descricao = body.descricao || null;
    const responsavel = body.responsavel || null;
    const status = body.status || "planejada";
    const dataInicio = body.data_inicio || null;
    const dataFim = body.data_fim || null;
    const cargaHoraria = toNumber(body.carga_horaria, 0);
    const participantesPrevistos = toNumber(body.participantes_previstos, 0);
    const turmaIds = normalizeIds(body.turma_ids);

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
        0,
        participantesPrevistos,
        0,
        0,
        0,
      ]
    );

    const acaoId = result.insertId;

    await syncTurmasDaAcao(acaoId, turmaIds);
    await persistResumoTurmas(acaoId);

    req.params = { id: acaoId };
    return detalhar(req, res);
  } catch (error) {
    console.error("Erro ao criar ação de desenvolvimento:", error);
    return res.status(500).json({ error: "Erro ao criar ação." });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const jornadaId = body.jornada_id ? Number(body.jornada_id) : null;
    const titulo = String(body.titulo || "").trim();
    const descricao = body.descricao || null;
    const responsavel = body.responsavel || null;
    const status = body.status || "planejada";
    const dataInicio = body.data_inicio || null;
    const dataFim = body.data_fim || null;
    const cargaHoraria = toNumber(body.carga_horaria, 0);
    const participantesPrevistos = toNumber(body.participantes_previstos, 0);
    const turmaIds = normalizeIds(body.turma_ids);

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
        participantes_previstos = ?
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
        participantesPrevistos,
        id,
      ]
    );

    await syncTurmasDaAcao(id, turmaIds);
    await persistResumoTurmas(id);

    return detalhar(req, res);
  } catch (error) {
    console.error("Erro ao atualizar ação de desenvolvimento:", error);
    return res.status(500).json({ error: "Erro ao atualizar ação." });
  }
}

async function remover(req, res) {
  try {
    const { id } = req.params;

    await db.query(
      `DELETE FROM acoes_desenvolvimento_turmas WHERE acao_id = ?`,
      [id]
    );

    await db.query(`DELETE FROM acoes_desenvolvimento WHERE id = ?`, [id]);

    return res.json({ ok: true });
  } catch (error) {
    console.error("Erro ao remover ação de desenvolvimento:", error);
    return res.status(500).json({ error: "Erro ao remover ação." });
  }
}

async function listarTurmasDaAcao(req, res) {
  try {
    const { id } = req.params;

    const resumo = await buildResumoTurmas(id);

    return res.json({
      turmas: resumo.turmas,
      quantidade_turmas_sessoes: resumo.quantidadeTurmas,
      participantes_realizados: resumo.participantesRealizados,
      horas_planejadas: resumo.horasPlanejadas,
      horas_realizadas: resumo.horasRealizadas,
    });
  } catch (error) {
    console.error("Erro ao listar turmas da ação:", error);
    return res.status(500).json({ error: "Erro ao listar turmas da ação." });
  }
}

module.exports = {
  listar,
  detalhar,
  criar,
  atualizar,
  remover,
  listarTurmasDaAcao,
};
