const pool = require("../lib/db");

function normalizeStatus(value) {
  const text = String(value || "").toLowerCase().trim();

  if (text === "presente") return "presente";
  if (text === "ausente") return "ausente";
  if (text === "justificado") return "justificado";
  return "pendente";
}

// Isolamento por tenant: turma_aulas.empresa_id não é gravado de forma
// confiável em todo insert (mesmo motivo documentado em turmaAulasController.js),
// então a checagem é feita via JOIN até treinamentos, que sempre tem
// empresa_id. Sem isso, qualquer turma_aula_id de outra empresa dava acesso
// à lista de presença, permitia inicializar/gravar chamada e ver o resumo.
async function turmaAulaPertenceAoTenant(turmaAulaId, empresaId) {
  if (!empresaId) return true;
  const [rows] = await pool.query(
    `SELECT ta.id FROM turma_aulas ta
     JOIN treinamentos t ON t.id = ta.treinamento_id
     WHERE ta.id = ? AND t.empresa_id = ?
     LIMIT 1`,
    [turmaAulaId, empresaId]
  );
  return rows.length > 0;
}

async function listarPresencaAula(req, res) {
  try {
    const { turma_aula_id } = req.query || {};

    if (!turma_aula_id) {
      return res.status(400).json({
        ok: false,
        message: "Informe o turma_aula_id",
      });
    }

    if (!(await turmaAulaPertenceAoTenant(turma_aula_id, req.empresaId))) {
      return res.status(404).json({ ok: false, message: "Aula não encontrada" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        id,
        turma_aula_id,
        treinamento_id,
        data_aula,
        treinando_nome,
        status,
        justificativa,
        criado_em,
        atualizado_em
      FROM presenca_aulas
      WHERE turma_aula_id = ?
      ORDER BY treinando_nome ASC
      `,
      [turma_aula_id]
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar presença da aula",
      error: error.message,
    });
  }
}

async function inicializarPresencaAula(req, res) {
  try {
    const { turma_aula_id } = req.body || {};

    if (!turma_aula_id) {
      return res.status(400).json({
        ok: false,
        message: "Informe o turma_aula_id",
      });
    }

    if (!(await turmaAulaPertenceAoTenant(turma_aula_id, req.empresaId))) {
      return res.status(404).json({ ok: false, message: "Aula não encontrada" });
    }

    const [aulas] = await pool.query(
      `
      SELECT id, treinamento_id, data_aula
      FROM turma_aulas
      WHERE id = ?
      LIMIT 1
      `,
      [turma_aula_id]
    );

    if (!aulas.length) {
      return res.status(404).json({
        ok: false,
        message: "Aula não encontrada",
      });
    }

    const aula = aulas[0];

    const [participantes] = await pool.query(
      `
      SELECT nome
      FROM treinamento_participantes
      WHERE treinamento_id = ?
      ORDER BY nome ASC
      `,
      [aula.treinamento_id]
    );

    for (const participante of participantes) {
      await pool.query(
        `
        INSERT INTO presenca_aulas
        (
          turma_aula_id,
          treinamento_id,
          data_aula,
          treinando_nome,
          status,
          justificativa
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          atualizado_em = CURRENT_TIMESTAMP
        `,
        [
          Number(turma_aula_id),
          Number(aula.treinamento_id),
          aula.data_aula,
          participante.nome,
          "pendente",
          null,
        ]
      );
    }

    const [rows] = await pool.query(
      `
      SELECT
        id,
        turma_aula_id,
        treinamento_id,
        data_aula,
        treinando_nome,
        status,
        justificativa
      FROM presenca_aulas
      WHERE turma_aula_id = ?
      ORDER BY treinando_nome ASC
      `,
      [turma_aula_id]
    );

    return res.json({
      ok: true,
      message: "Presença da aula inicializada com sucesso",
      registros: rows,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao inicializar presença da aula",
      error: error.message,
    });
  }
}

async function salvarPresencaAula(req, res) {
  try {
    const { turma_aula_id, registros } = req.body || {};

    if (!turma_aula_id || !Array.isArray(registros)) {
      return res.status(400).json({
        ok: false,
        message: "Informe turma_aula_id e a lista de registros",
      });
    }

    if (!(await turmaAulaPertenceAoTenant(turma_aula_id, req.empresaId))) {
      return res.status(404).json({ ok: false, message: "Aula não encontrada" });
    }

    const [aulas] = await pool.query(
      `
      SELECT id, treinamento_id, data_aula
      FROM turma_aulas
      WHERE id = ?
      LIMIT 1
      `,
      [turma_aula_id]
    );

    if (!aulas.length) {
      return res.status(404).json({
        ok: false,
        message: "Aula não encontrada",
      });
    }

    const aula = aulas[0];

    for (const item of registros) {
      const nome = String(item?.treinando_nome || "").trim();
      if (!nome) continue;

      await pool.query(
        `
        INSERT INTO presenca_aulas
        (
          turma_aula_id,
          treinamento_id,
          data_aula,
          treinando_nome,
          status,
          justificativa
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          justificativa = VALUES(justificativa),
          atualizado_em = CURRENT_TIMESTAMP
        `,
        [
          Number(turma_aula_id),
          Number(aula.treinamento_id),
          aula.data_aula,
          nome,
          normalizeStatus(item.status),
          item.justificativa || null,
        ]
      );
    }

    const [rows] = await pool.query(
      `
      SELECT
        id,
        turma_aula_id,
        treinamento_id,
        data_aula,
        treinando_nome,
        status,
        justificativa
      FROM presenca_aulas
      WHERE turma_aula_id = ?
      ORDER BY treinando_nome ASC
      `,
      [turma_aula_id]
    );

    return res.json({
      ok: true,
      message: "Presença da aula salva com sucesso",
      registros: rows,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao salvar presença da aula",
      error: error.message,
    });
  }
}

async function resumoPresencaAula(req, res) {
  try {
    const { turma_aula_id } = req.params;

    if (!(await turmaAulaPertenceAoTenant(turma_aula_id, req.empresaId))) {
      return res.status(404).json({ ok: false, message: "Aula não encontrada" });
    }

    const [[aula]] = await pool.query(
      `
      SELECT id, treinamento_id
      FROM turma_aulas
      WHERE id = ?
      LIMIT 1
      `,
      [turma_aula_id]
    );

    if (!aula) {
      return res.status(404).json({
        ok: false,
        message: "Aula não encontrada",
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'presente' THEN 1 ELSE 0 END) AS presentes,
        SUM(CASE WHEN status = 'ausente' THEN 1 ELSE 0 END) AS ausentes,
        SUM(CASE WHEN status = 'justificado' THEN 1 ELSE 0 END) AS justificados,
        SUM(CASE WHEN status = 'pendente' OR status IS NULL OR status = '' THEN 1 ELSE 0 END) AS pendentes
      FROM presenca_aulas
      WHERE turma_aula_id = ?
      `,
      [turma_aula_id]
    );

    const [[participantesBase]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM treinamento_participantes
      WHERE treinamento_id = ?
      `,
      [aula.treinamento_id]
    );

    const base = rows[0] || {};
    const totalParticipantes = Number(participantesBase?.total || 0);

    let total = Number(base.total || 0);
    let presentes = Number(base.presentes || 0);
    let ausentes = Number(base.ausentes || 0);
    let justificados = Number(base.justificados || 0);
    let pendentes = Number(base.pendentes || 0);

    if (total === 0 && totalParticipantes > 0) {
      total = totalParticipantes;
      pendentes = totalParticipantes;
    } else if (total < totalParticipantes) {
      pendentes += totalParticipantes - total;
      total = totalParticipantes;
    }

    const taxa_presenca = total > 0 ? Math.round((presentes / total) * 100) : 0;

    return res.json({
      ok: true,
      total,
      presentes,
      ausentes,
      justificados,
      pendentes,
      percentual: taxa_presenca,
      taxa_presenca,
      resumo: {
        total,
        presentes,
        ausentes,
        justificados,
        pendentes,
        percentual: taxa_presenca,
        taxa_presenca,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar resumo da presença da aula",
      error: error.message,
    });
  }
}

module.exports = {
  listarPresencaAula,
  inicializarPresencaAula,
  salvarPresencaAula,
  resumoPresencaAula,
};
