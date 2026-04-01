const db = require("../config/db");

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();

  if (["ativa", "ativo"].includes(status)) return "ativo";
  if (["inativa", "inativo"].includes(status)) return "inativo";
  if (["concluida", "concluído", "concluido", "finalizada"].includes(status)) {
    return "concluido";
  }
  if (["planejada", "planejado"].includes(status)) return "planejado";
  if (["em_andamento", "em andamento"].includes(status)) return "em_andamento";
  if (["cancelada", "cancelado"].includes(status)) return "cancelado";

  return status || "planejado";
}

function mapPayload(body = {}) {
  return {
    nome: body.nome || body.titulo || null,
    titulo: body.titulo || body.nome || null,
    descricao: body.descricao || body.objetivo || null,
    objetivo: body.objetivo || body.descricao || null,
    cliente: body.cliente || null,
    publico_macro: body.publico_macro || body.publico_alvo || null,
    publico_alvo: body.publico_alvo || body.publico_macro || null,
    observacoes: body.observacoes || null,
    responsavel_id: body.responsavel_id ? Number(body.responsavel_id) : null,
    status: normalizeStatus(body.status),
    data_inicio: body.data_inicio || null,
    data_fim: body.data_fim || null,
  };
}

exports.listar = async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        nome,
        titulo,
        cliente,
        publico_macro,
        publico_alvo,
        descricao,
        objetivo,
        observacoes,
        responsavel_id,
        status,
        data_inicio,
        data_fim,
        criado_em,
        atualizado_em
      FROM jornadas_desenvolvimento
      ORDER BY id DESC
    `);

    const data = rows.map((item) => ({
      ...item,
      titulo: item.titulo || item.nome,
      nome: item.nome || item.titulo,
      publico_alvo: item.publico_alvo || item.publico_macro,
      publico_macro: item.publico_macro || item.publico_alvo,
      objetivo: item.objetivo || item.descricao,
      descricao: item.descricao || item.objetivo,
    }));

    return res.json(data);
  } catch (error) {
    console.error("Erro ao listar jornadas:", error);
    return res.status(500).json({ error: "Erro ao listar jornadas." });
  }
};

exports.buscarPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT
        id,
        nome,
        titulo,
        cliente,
        publico_macro,
        publico_alvo,
        descricao,
        objetivo,
        observacoes,
        responsavel_id,
        status,
        data_inicio,
        data_fim,
        criado_em,
        atualizado_em
      FROM jornadas_desenvolvimento
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Jornada não encontrada." });
    }

    const item = rows[0];

    return res.json({
      ...item,
      titulo: item.titulo || item.nome,
      nome: item.nome || item.titulo,
      publico_alvo: item.publico_alvo || item.publico_macro,
      publico_macro: item.publico_macro || item.publico_alvo,
      objetivo: item.objetivo || item.descricao,
      descricao: item.descricao || item.objetivo,
    });
  } catch (error) {
    console.error("Erro ao buscar jornada:", error);
    return res.status(500).json({ error: "Erro ao buscar jornada." });
  }
};

exports.criar = async (req, res) => {
  try {
    const payload = mapPayload(req.body);

    if (!String(payload.nome || "").trim()) {
      return res.status(400).json({ error: "Informe o nome da jornada." });
    }

    const [result] = await db.query(
      `
      INSERT INTO jornadas_desenvolvimento (
        nome,
        titulo,
        cliente,
        publico_macro,
        publico_alvo,
        descricao,
        objetivo,
        observacoes,
        responsavel_id,
        status,
        data_inicio,
        data_fim
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.nome,
        payload.titulo,
        payload.cliente,
        payload.publico_macro,
        payload.publico_alvo,
        payload.descricao,
        payload.objetivo,
        payload.observacoes,
        payload.responsavel_id,
        payload.status,
        payload.data_inicio,
        payload.data_fim,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT
        id,
        nome,
        titulo,
        cliente,
        publico_macro,
        publico_alvo,
        descricao,
        objetivo,
        observacoes,
        responsavel_id,
        status,
        data_inicio,
        data_fim,
        criado_em,
        atualizado_em
      FROM jornadas_desenvolvimento
      WHERE id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Erro ao criar jornada:", error);
    return res.status(500).json({ error: "Erro ao criar jornada." });
  }
};

exports.atualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = mapPayload(req.body);

    if (!String(payload.nome || "").trim()) {
      return res.status(400).json({ error: "Informe o nome da jornada." });
    }

    const [exists] = await db.query(
      `SELECT id FROM jornadas_desenvolvimento WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Jornada não encontrada." });
    }

    await db.query(
      `
      UPDATE jornadas_desenvolvimento
      SET
        nome = ?,
        titulo = ?,
        cliente = ?,
        publico_macro = ?,
        publico_alvo = ?,
        descricao = ?,
        objetivo = ?,
        observacoes = ?,
        responsavel_id = ?,
        status = ?,
        data_inicio = ?,
        data_fim = ?
      WHERE id = ?
      `,
      [
        payload.nome,
        payload.titulo,
        payload.cliente,
        payload.publico_macro,
        payload.publico_alvo,
        payload.descricao,
        payload.objetivo,
        payload.observacoes,
        payload.responsavel_id,
        payload.status,
        payload.data_inicio,
        payload.data_fim,
        id,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT
        id,
        nome,
        titulo,
        cliente,
        publico_macro,
        publico_alvo,
        descricao,
        objetivo,
        observacoes,
        responsavel_id,
        status,
        data_inicio,
        data_fim,
        criado_em,
        atualizado_em
      FROM jornadas_desenvolvimento
      WHERE id = ?
      LIMIT 1
      `,
      [id]
    );

    return res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar jornada:", error);
    return res.status(500).json({ error: "Erro ao atualizar jornada." });
  }
};

exports.excluir = async (req, res) => {
  try {
    const { id } = req.params;

    const [exists] = await db.query(
      `SELECT id FROM jornadas_desenvolvimento WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Jornada não encontrada." });
    }

    await db.query(`DELETE FROM jornadas_desenvolvimento WHERE id = ?`, [id]);

    return res.json({ ok: true, message: "Jornada excluída com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir jornada:", error);
    return res.status(500).json({ error: "Erro ao excluir jornada." });
  }
};
