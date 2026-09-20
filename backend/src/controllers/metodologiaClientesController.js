const db = require("../lib/db");

// Lista de clientes exclusiva do módulo Metodologia (20/09/2026, pedido do
// Ramon) — ver comentário do passo 42 em migrate.js. Não é FK de nada e não
// tem nenhuma relação com a tabela `clientes` da Treinamento: é só uma
// lista de nomes controlada, pra parar de deixar "Cliente" como texto
// livre nas telas de jornada, participante e trilha do Mapa de
// Desenvolvimento. status "inativo" não some da lista — só deixa de
// aparecer como opção nos formulários novos, pra não perder o histórico
// de quem já usava aquele nome.

function normalizarNome(nome) {
  return String(nome || "").trim();
}

async function existeNomeDuplicado(nome, empresaId, ignorarId) {
  const tenantWhere = empresaId ? " AND empresa_id = ?" : "";
  const params = empresaId ? [nome, empresaId] : [nome];

  let query = `SELECT id FROM metodologia_clientes WHERE LOWER(nome) = LOWER(?)${tenantWhere}`;
  if (ignorarId) {
    query += " AND id != ?";
    params.push(ignorarId);
  }

  const [rows] = await db.query(query, params);
  return rows.length > 0;
}

async function listar(req, res) {
  try {
    const tenantWhere = req.empresaId ? "WHERE empresa_id = ?" : "";
    const params = req.empresaId ? [req.empresaId] : [];

    const [rows] = await db.query(
      `SELECT * FROM metodologia_clientes ${tenantWhere} ORDER BY nome ASC`,
      params
    );

    res.json(rows);
  } catch (error) {
    console.error("Erro ao listar clientes da metodologia:", error);
    res.status(500).json({ error: "Erro ao listar clientes da metodologia." });
  }
}

async function criar(req, res) {
  try {
    const { nome, observacoes } = req.body;
    const nomeNormalizado = normalizarNome(nome);

    if (!nomeNormalizado) {
      return res.status(400).json({ error: "Informe o nome do cliente." });
    }

    if (await existeNomeDuplicado(nomeNormalizado, req.empresaId)) {
      return res.status(409).json({ error: "Já existe um cliente cadastrado com este nome." });
    }

    const [result] = await db.query(
      `INSERT INTO metodologia_clientes (nome, status, observacoes, empresa_id) VALUES (?, 'ativo', ?, ?)`,
      [nomeNormalizado, observacoes || null, req.empresaId ?? null]
    );

    const [rows] = await db.query(`SELECT * FROM metodologia_clientes WHERE id = ?`, [result.insertId]);

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Erro ao criar cliente da metodologia:", error);
    res.status(500).json({ error: "Erro ao criar cliente da metodologia." });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const { nome, status, observacoes } = req.body;
    const nomeNormalizado = normalizarNome(nome);

    if (!nomeNormalizado) {
      return res.status(400).json({ error: "Informe o nome do cliente." });
    }

    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(`SELECT id FROM metodologia_clientes WHERE id = ?${tenantCheck}`, checkParams);

    if (!exists.length) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    if (await existeNomeDuplicado(nomeNormalizado, req.empresaId, id)) {
      return res.status(409).json({ error: "Já existe um cliente cadastrado com este nome." });
    }

    const statusNormalizado = status === "inativo" ? "inativo" : "ativo";

    const updateParams = [nomeNormalizado, statusNormalizado, observacoes || null, id];
    if (req.empresaId) updateParams.push(req.empresaId);

    await db.query(
      `UPDATE metodologia_clientes SET nome = ?, status = ?, observacoes = ? WHERE id = ?${tenantCheck}`,
      updateParams
    );

    const [rows] = await db.query(`SELECT * FROM metodologia_clientes WHERE id = ?`, [id]);

    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar cliente da metodologia:", error);
    res.status(500).json({ error: "Erro ao atualizar cliente da metodologia." });
  }
}

async function remover(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(`SELECT id FROM metodologia_clientes WHERE id = ?${tenantCheck}`, checkParams);

    if (!exists.length) {
      return res.status(404).json({ error: "Cliente não encontrado." });
    }

    await db.query(`DELETE FROM metodologia_clientes WHERE id = ?${tenantCheck}`, checkParams);

    res.json({ success: true, message: "Cliente removido com sucesso." });
  } catch (error) {
    console.error("Erro ao remover cliente da metodologia:", error);
    res.status(500).json({ error: "Erro ao remover cliente da metodologia." });
  }
}

module.exports = { listar, criar, atualizar, remover };
