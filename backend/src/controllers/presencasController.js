import pool from "../db.js";

function normalizeStatus(row) {
  if (row.status) return row.status;
  return row.presente ? "presente" : "ausente";
}

export async function listPresencas(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, treinamento_id, treinando_nome, presente, status, justificativa
      FROM presencas
      ORDER BY id DESC
    `);

    const normalized = rows.map((row) => ({
      ...row,
      status: normalizeStatus(row),
      justificativa: row.justificativa || ""
    }));

    res.json(normalized);
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao listar presenças", error: error.message });
  }
}

export async function getPresencasByTreinamento(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
      SELECT id, treinamento_id, treinando_nome, presente, status, justificativa
      FROM presencas
      WHERE treinamento_id = ?
      ORDER BY treinando_nome ASC, id ASC
      `,
      [id]
    );

    const normalized = rows.map((row) => ({
      id: row.id,
      treinamento_id: row.treinamento_id,
      nome: row.treinando_nome,
      status: normalizeStatus(row),
      justificativa: row.justificativa || ""
    }));

    res.json(normalized);
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao buscar presenças do treinamento",
      error: error.message
    });
  }
}

export async function createPresenca(req, res) {
  try {
    const { treinamento_id, treinando_nome, status, justificativa } = req.body || {};

    if (!treinamento_id || !treinando_nome || !status) {
      return res.status(400).json({ ok: false, message: "Preencha treinamento, treinando e status" });
    }

    if (!["presente", "ausente", "justificado"].includes(status)) {
      return res.status(400).json({ ok: false, message: "Status inválido" });
    }

    if (status === "justificado" && !justificativa) {
      return res.status(400).json({ ok: false, message: "Informe a justificativa" });
    }

    const presente = status === "presente" ? 1 : 0;

    const [result] = await pool.query(
      `INSERT INTO presencas (treinamento_id, treinando_nome, presente, status, justificativa)
       VALUES (?, ?, ?, ?, ?)`,
      [treinamento_id, treinando_nome, presente, status, justificativa || null]
    );

    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao registrar presença", error: error.message });
  }
}

export async function updatePresenca(req, res) {
  try {
    const { id } = req.params;
    const { treinamento_id, treinando_nome, status, justificativa } = req.body || {};

    if (!treinamento_id || !treinando_nome || !status) {
      return res.status(400).json({ ok: false, message: "Preencha treinamento, treinando e status" });
    }

    if (!["presente", "ausente", "justificado"].includes(status)) {
      return res.status(400).json({ ok: false, message: "Status inválido" });
    }

    if (status === "justificado" && !justificativa) {
      return res.status(400).json({ ok: false, message: "Informe a justificativa" });
    }

    const presente = status === "presente" ? 1 : 0;

    await pool.query(
      `UPDATE presencas
       SET treinamento_id = ?, treinando_nome = ?, presente = ?, status = ?, justificativa = ?
       WHERE id = ?`,
      [treinamento_id, treinando_nome, presente, status, justificativa || null, id]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao atualizar presença", error: error.message });
  }
}

export async function savePresencasLote(req, res) {
  try {
    const { treinamento_id, participantes } = req.body || {};

    if (!treinamento_id || !Array.isArray(participantes)) {
      return res.status(400).json({
        ok: false,
        message: "Informe o treinamento e a lista de participantes"
      });
    }

    for (const participante of participantes) {
      const nome = participante.nome || participante.treinando_nome;

      if (!nome) continue;

      const status = participante.status || "presente";
      const justificativa = participante.justificativa || null;
      const presente = status === "presente" ? 1 : 0;

      const [existentes] = await pool.query(
        `
        SELECT id
        FROM presencas
        WHERE treinamento_id = ? AND treinando_nome = ?
        LIMIT 1
        `,
        [treinamento_id, nome]
      );

      if (existentes.length) {
        await pool.query(
          `
          UPDATE presencas
          SET presente = ?, status = ?, justificativa = ?
          WHERE id = ?
          `,
          [presente, status, justificativa, existentes[0].id]
        );
      } else {
        await pool.query(
          `
          INSERT INTO presencas
          (treinamento_id, treinando_nome, presente, status, justificativa)
          VALUES (?, ?, ?, ?, ?)
          `,
          [treinamento_id, nome, presente, status, justificativa]
        );
      }
    }

    res.json({ ok: true, message: "Chamada salva com sucesso" });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao salvar chamada em lote",
      error: error.message
    });
  }
}

export async function deletePresenca(req, res) {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM presencas WHERE id = ?", [id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro ao excluir presença", error: error.message });
  }
}

export async function deletePresencaByTreinamentoAndNome(req, res) {
  try {
    const { treinamento_id, nome } = req.body || {};

    if (!treinamento_id || !nome) {
      return res.status(400).json({
        ok: false,
        message: "Informe treinamento e nome do participante"
      });
    }

    await pool.query(
      `
      DELETE FROM presencas
      WHERE treinamento_id = ? AND treinando_nome = ?
      `,
      [treinamento_id, nome]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Erro ao remover participante da chamada",
      error: error.message
    });
  }
}

export async function migrarPresencasStatus(req, res) {
  try {
    try { await pool.query("ALTER TABLE presencas ADD COLUMN status VARCHAR(20) NULL"); } catch {}
    try { await pool.query("ALTER TABLE presencas ADD COLUMN justificativa TEXT NULL"); } catch {}

    await pool.query(`
      UPDATE presencas
      SET status = CASE
        WHEN status IS NOT NULL THEN status
        WHEN presente = 1 THEN 'presente'
        ELSE 'ausente'
      END
      WHERE status IS NULL
    `);

    res.json({ ok: true, message: "Migração de presenças concluída" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Erro na migração de presenças", error: error.message });
  }
}
