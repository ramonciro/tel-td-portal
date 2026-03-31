const db = require("../db");

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function carregarResumoTurmasVinculadas(acaoId) {
  const [rows] = await db.query(
    `
    SELECT
      t.id,
      t.tema,
      t.cliente,
      t.instrutor,
      t.data_inicio,
      t.data_fim,
      COALESCE(t.carga_horaria, 0) AS carga_horaria
    FROM acoes_desenvolvimento_turmas rel
    INNER JOIN treinamentos t ON t.id = rel.treinamento_id
    WHERE rel.acao_id = ?
    ORDER BY t.data_inicio ASC, t.id ASC
    `,
    [acaoId]
  );

  const turmas = Array.isArray(rows) ? rows : [];

  const detalhes = await Promise.all(
    turmas.map(async (turma) => {
      let participantes = 0;

      try {
        const [partRows] = await db.query(
          `
          SELECT COUNT(*) AS total
          FROM treinamento_participantes
          WHERE treinamento_id = ?
          `,
          [turma.id]
        );
        participantes = toNumber(partRows?.[0]?.total, 0);
      } catch {
        participantes = 0;
      }

      return {
        ...turma,
        participantes,
      };
    })
  );

  const quantidadeTurmas = detalhes.length;
  const participantesRealizados = detalhes.reduce(
    (acc, item) => acc + toNumber(item.participantes, 0),
    0
  );
  const horasPlanejadas = detalhes.reduce(
    (acc, item) => acc + toNumber(item.carga_horaria, 0),
    0
  );
  const horasRealizadas = horasPlanejadas;

  return {
    turmas: detalhes,
    quantidadeTurmas,
    participantesRealizados,
    horasPlanejadas,
    horasRealizadas,
  };
}

async function sincronizarTurmasDaAcao(acaoId, turmaIds = []) {
  const idsNormalizados = [...new Set(
    (Array.isArray(turmaIds) ? turmaIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
  )];

  await db.query(
    `DELETE FROM acoes_desenvolvimento_turmas WHERE acao_id = ?`,
    [acaoId]
  );

  if (!idsNormalizados.length) return;

  const values = idsNormalizados.map((treinamentoId) => [acaoId, treinamentoId]);

  await db.query(
    `
    INSERT INTO acoes_desenvolvimento_turmas (acao_id, treinamento_id)
    VALUES ?
    `,
    [values]
  );
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
      (rows || []).map(async (acao) => {
        const resumoTurmas = await carregarResumoTurmasVinculadas(acao.id);

        return {
          ...acao,
          turmas_vinculadas: resumoTurmas.turmas,
          quantidade_turmas_sessoes:
            resumoTurmas.quantidadeTurmas || toNumber(acao.quantidade_turmas_sessoes, 0),
          participantes_realizados:
            resumoTurmas.participantesRealizados || toNumber(acao.participantes_realizados, 0),
          horas_planejadas:
            resumoTurmas.horasPlanejadas || toNumber(acao.horas_planejadas, 0),
          horas_realizadas:
            resumoTurmas.horasRealizadas || toNumber(acao.horas_realizadas, 0),
        };
      })
    );

    res.json(lista);
  } catch (error) {
    console.error("Erro ao listar ações:", error);
    res.status(500).json({ error: "Erro ao listar ações de desenvolvimento." });
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

    const resumoTurmas = await carregarResumoTurmasVinculadas(acao.id);

    res.json({
      ...acao,
      turmas_vinculadas: resumoTurmas.turmas,
      quantidade_turmas_sessoes:
        resumoTurmas.quantidadeTurmas || toNumber(acao.quantidade_turmas_sessoes, 0),
      participantes_realizados:
        resumoTurmas.participantesRealizados || toNumber(acao.participantes_realizados, 0),
      horas_planejadas:
        resumoTurmas.horasPlanejadas || toNumber(acao.horas_planejadas, 0),
      horas_realizadas:
        resumoTurmas.horasRealizadas || toNumber(acao.horas_realizadas, 0),
    });
  } catch (error) {
    console.error("Erro ao detalhar ação:", error);
    res.status(500).json({ error: "Erro ao detalhar ação." });
  }
}

async function criar(req, res) {
  try {
    const body = req.body || {};

    const turmaIds = Array.isArray(body.turma_ids) ? body.turma_ids : [];

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
        body.jornada_id || null,
        body.titulo || "",
        body.descricao || null,
        body.responsavel || null,
        body.status || "planejada",
        body.data_inicio || null,
        body.data_fim || null,
        toNumber(body.carga_horaria, 0),
        0,
        toNumber(body.participantes_previstos, 0),
        0,
        0,
        0,
      ]
    );

    const acaoId = result.insertId;

    await sincronizarTurmasDaAcao(acaoId, turmaIds);

    const resumoTurmas = await carregarResumoTurmasVinculadas(acaoId);

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
        resumoTurmas.quantidadeTurmas,
        resumoTurmas.participantesRealizados,
        resumoTurmas.horasPlanejadas,
        resumoTurmas.horasRealizadas,
        acaoId,
      ]
    );

    return detalhar({ params: { id: acaoId } }, res);
  } catch (error) {
    console.error("Erro ao criar ação:", error);
    res.status(500).json({ error: "Erro ao criar ação." });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const turmaIds = Array.isArray(body.turma_ids) ? body.turma_ids : [];

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
        body.jornada_id || null,
        body.titulo || "",
        body.descricao || null,
        body.responsavel || null,
        body.status || "planejada",
        body.data_inicio || null,
        body.data_fim || null,
        toNumber(body.carga_horaria, 0),
        toNumber(body.participantes_previstos, 0),
        id,
      ]
    );

    await sincronizarTurmasDaAcao(id, turmaIds);

    const resumoTurmas = await carregarResumoTurmasVinculadas(id);

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
        resumoTurmas.quantidadeTurmas,
        resumoTurmas.participantesRealizados,
        resumoTurmas.horasPlanejadas,
        resumoTurmas.horasRealizadas,
        id,
      ]
    );

    return detalhar(req, res);
  } catch (error) {
    console.error("Erro ao atualizar ação:", error);
    res.status(500).json({ error: "Erro ao atualizar ação." });
  }
}

async function remover(req, res) {
  try {
    const { id } = req.params;

    await db.query(`DELETE FROM acoes_desenvolvimento_turmas WHERE acao_id = ?`, [id]);
    await db.query(`DELETE FROM acoes_desenvolvimento WHERE id = ?`, [id]);

    res.json({ ok: true });
  } catch (error) {
    console.error("Erro ao remover ação:", error);
    res.status(500).json({ error: "Erro ao remover ação." });
  }
}

async function listarTurmasDaAcao(req, res) {
  try {
    const { id } = req.params;
    const resumoTurmas = await carregarResumoTurmasVinculadas(id);
    res.json(resumoTurmas);
  } catch (error) {
    console.error("Erro ao listar turmas da ação:", error);
    res.status(500).json({ error: "Erro ao listar turmas da ação." });
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
