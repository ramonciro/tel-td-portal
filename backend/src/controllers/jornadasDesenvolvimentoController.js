const db = require("../lib/db");

function normalizeStatusToDb(value) {
  const status = String(value || "").trim().toLowerCase();

  if (["planejada", "planejado", "ativo", "ativa", "em_andamento", "em andamento"].includes(status)) {
    return "ativo";
  }

  if (["inativo", "inativa", "cancelada", "cancelado"].includes(status)) {
    return "inativo";
  }

  if (["concluida", "concluído", "concluido", "finalizada"].includes(status)) {
    return "concluido";
  }

  return "ativo";
}

function mapRow(item) {
  return {
    ...item,
    titulo: item.nome || "",
    publico_alvo: item.publico_macro || "",
    status:
      item.status === "ativo"
        ? "planejada"
        : item.status === "concluido"
        ? "concluida"
        : "cancelada",
  };
}

async function listar(_req, res) {
  try {
    const [rows] = await db.query(`
      SELECT jd.*,
             u.nome AS responsavel_nome
      FROM jornadas_desenvolvimento jd
      LEFT JOIN usuarios u ON u.id = jd.responsavel_id
      ORDER BY jd.id DESC
    `);

    res.json(rows.map(mapRow));
  } catch (error) {
    console.error("Erro ao listar jornadas:", error);
    res.status(500).json({ error: "Erro ao listar jornadas." });
  }
}

async function buscarPorId(req, res) {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT jd.*,
             u.nome AS responsavel_nome
      FROM jornadas_desenvolvimento jd
      LEFT JOIN usuarios u ON u.id = jd.responsavel_id
      WHERE jd.id = ?
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Jornada não encontrada." });
    }

    res.json(mapRow(rows[0]));
  } catch (error) {
    console.error("Erro ao buscar jornada:", error);
    res.status(500).json({ error: "Erro ao buscar jornada." });
  }
}

async function criar(req, res) {
  try {
    const nome = String(req.body.nome || req.body.titulo || "").trim();
    const cliente = req.body.cliente || null;
    const descricao = req.body.descricao || req.body.objetivo || null;
    const objetivo = req.body.objetivo || null;
    const publico_macro = req.body.publico_macro || req.body.publico_alvo || null;
    const observacoes = req.body.observacoes || null;
    const responsavel_id = req.body.responsavel_id
      ? Number(req.body.responsavel_id)
      : null;
    const status = normalizeStatusToDb(req.body.status);
    const data_inicio = req.body.data_inicio || null;
    const data_fim = req.body.data_fim || null;

    if (!nome) {
      return res.status(400).json({
        error: "Nome da jornada é obrigatório.",
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO jornadas_desenvolvimento
      (cliente, nome, descricao, objetivo, publico_macro, observacoes, status, responsavel_id, data_inicio, data_fim)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cliente,
        nome,
        descricao,
        objetivo,
        publico_macro,
        observacoes,
        status,
        responsavel_id,
        data_inicio,
        data_fim,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT jd.*,
             u.nome AS responsavel_nome
      FROM jornadas_desenvolvimento jd
      LEFT JOIN usuarios u ON u.id = jd.responsavel_id
      WHERE jd.id = ?
      `,
      [result.insertId]
    );

    res.status(201).json(mapRow(rows[0]));
  } catch (error) {
    console.error("Erro ao criar jornada:", error);
    res.status(500).json({ error: "Erro ao criar jornada." });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;

    const nome = String(req.body.nome || req.body.titulo || "").trim();
    const cliente = req.body.cliente || null;
    const descricao = req.body.descricao || req.body.objetivo || null;
    const objetivo = req.body.objetivo || null;
    const publico_macro = req.body.publico_macro || req.body.publico_alvo || null;
    const observacoes = req.body.observacoes || null;
    const responsavel_id = req.body.responsavel_id
      ? Number(req.body.responsavel_id)
      : null;
    const status = normalizeStatusToDb(req.body.status);
    const data_inicio = req.body.data_inicio || null;
    const data_fim = req.body.data_fim || null;

    if (!nome) {
      return res.status(400).json({
        error: "Nome da jornada é obrigatório.",
      });
    }

    const [exists] = await db.query(
      `SELECT id FROM jornadas_desenvolvimento WHERE id = ?`,
      [id]
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Jornada não encontrada." });
    }

    await db.query(
      `
      UPDATE jornadas_desenvolvimento
      SET cliente = ?,
          nome = ?,
          descricao = ?,
          objetivo = ?,
          publico_macro = ?,
          observacoes = ?,
          status = ?,
          responsavel_id = ?,
          data_inicio = ?,
          data_fim = ?
      WHERE id = ?
      `,
      [
        cliente,
        nome,
        descricao,
        objetivo,
        publico_macro,
        observacoes,
        status,
        responsavel_id,
        data_inicio,
        data_fim,
        id,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT jd.*,
             u.nome AS responsavel_nome
      FROM jornadas_desenvolvimento jd
      LEFT JOIN usuarios u ON u.id = jd.responsavel_id
      WHERE jd.id = ?
      `,
      [id]
    );

    res.json(mapRow(rows[0]));
  } catch (error) {
    console.error("Erro ao atualizar jornada:", error);
    res.status(500).json({ error: "Erro ao atualizar jornada." });
  }
}

async function remover(req, res) {
  try {
    const { id } = req.params;

    const [exists] = await db.query(
      `SELECT id FROM jornadas_desenvolvimento WHERE id = ?`,
      [id]
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Jornada não encontrada." });
    }

    await db.query(`DELETE FROM jornadas_desenvolvimento WHERE id = ?`, [id]);

    res.json({ success: true, message: "Jornada removida com sucesso." });
  } catch (error) {
    console.error("Erro ao remover jornada:", error);
    res.status(500).json({ error: "Erro ao remover jornada." });
  }
}

module.exports = {
  listar,
  buscarPorId,
  criar,
  atualizar,
  remover,
};
