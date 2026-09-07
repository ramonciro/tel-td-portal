const pool = require("../lib/db");

// materiais_avaliativos não tem empresa_id própria — isolamento via JOIN
// até treinamentos, mesmo padrão do restante do módulo de avaliações.
function tenantJoinTreinamento(empresaId, alias = "materiais_avaliativos") {
  return empresaId
    ? ` AND EXISTS (SELECT 1 FROM treinamentos t WHERE t.id = ${alias}.treinamento_id AND t.empresa_id = ${pool.escape(empresaId)})`
    : "";
}

async function treinamentoPertenceAoTenant(treinamentoId, empresaId) {
  if (!empresaId) return true;
  const [rows] = await pool.query(
    `SELECT id FROM treinamentos WHERE id = ? AND empresa_id = ? LIMIT 1`,
    [treinamentoId, empresaId]
  );
  return rows.length > 0;
}

async function listMateriaisAvaliativos(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        treinamento_id,
        titulo,
        tipo,
        link_arquivo,
        descricao,
        COALESCE(nota_maxima, 0) AS nota_maxima,
        data_aplicacao,
        questoes_json,
        criado_em
      FROM materiais_avaliativos
      WHERE 1 = 1${tenantJoinTreinamento(req.empresaId)}
      ORDER BY id DESC
    `);

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar materiais avaliativos",
      error: error.message,
    });
  }
}

// Lista usada pela página do treinando (/responder-avaliacao). Diferente de
// listMateriaisAvaliativos (tela de gestão, restrita a coordenador/
// supervisor/instrutor): aqui o treinando só vê provas/simulados de
// treinamentos em que ele realmente participa (via treinamento_participantes),
// e provas que ele já respondeu somem da lista (uma tentativa por prova,
// mesma regra já usada no NPS — ver avaliacoesTreinandosController.js).
// Aceita ?treinamento_id= opcional pra restringir à turma de onde o link
// veio (aba Avaliações da turma).
async function listMateriaisAvaliativosDisponiveis(req, res) {
  try {
    const perfil = String(req.user?.perfil || "").toLowerCase();
    const treinamentoIdFiltro = req.query?.treinamento_id
      ? Number(req.query.treinamento_id)
      : null;

    if (perfil === "treinando") {
      const nomeUsuario = String(req.user?.nome || "").trim();
      if (!nomeUsuario) {
        return res.status(400).json({ ok: false, message: "Usuário não identificado" });
      }

      const filtros = [];
      const params = [nomeUsuario, nomeUsuario];
      if (req.empresaId) { filtros.push("t.empresa_id = ?"); params.push(req.empresaId); }
      if (treinamentoIdFiltro) { filtros.push("m.treinamento_id = ?"); params.push(treinamentoIdFiltro); }
      const where = filtros.length ? ` AND ${filtros.join(" AND ")}` : "";

      const [rows] = await pool.query(
        `
        SELECT
          m.id, m.treinamento_id, m.titulo, m.tipo, m.link_arquivo, m.descricao,
          COALESCE(m.nota_maxima, 0) AS nota_maxima, m.data_aplicacao, m.questoes_json, m.criado_em,
          t.tema, t.cliente
        FROM materiais_avaliativos m
        INNER JOIN treinamentos t ON t.id = m.treinamento_id
        INNER JOIN treinamento_participantes tp ON tp.treinamento_id = t.id AND tp.nome = ?
        LEFT JOIN respostas_avaliativas ra ON ra.material_id = m.id AND ra.treinando_nome = ?
        WHERE ra.id IS NULL${where}
        ORDER BY m.id DESC
        `,
        params
      );

      return res.json(rows);
    }

    // Coordenador/supervisor/instrutor: mesma listagem completa de sempre
    // (com tema/cliente do treinamento já juntos, pra não precisar de uma
    // segunda chamada a /treinamentos só pra montar o rótulo na tela), só
    // respeitando o filtro de turma quando informado.
    const extraFiltro = treinamentoIdFiltro ? " AND m.treinamento_id = ?" : "";
    const params = treinamentoIdFiltro ? [treinamentoIdFiltro] : [];
    const [rows] = await pool.query(
      `
      SELECT
        m.id, m.treinamento_id, m.titulo, m.tipo, m.link_arquivo, m.descricao,
        COALESCE(m.nota_maxima, 0) AS nota_maxima, m.data_aplicacao, m.questoes_json, m.criado_em,
        t.tema, t.cliente
      FROM materiais_avaliativos m
      LEFT JOIN treinamentos t ON t.id = m.treinamento_id
      WHERE 1 = 1${tenantJoinTreinamento(req.empresaId, "m")}${extraFiltro}
      ORDER BY m.id DESC
      `,
      params
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao listar provas/simulados disponíveis",
      error: error.message,
    });
  }
}

async function createMaterialAvaliativo(req, res) {
  try {
    const {
      treinamento_id,
      titulo,
      tipo,
      link_arquivo,
      descricao,
      nota_maxima,
      data_aplicacao,
      questoes_json,
    } = req.body || {};

    if (!treinamento_id || !titulo || !tipo) {
      return res.status(400).json({
        ok: false,
        message: "Preencha treinamento, título e tipo",
      });
    }

    if (!(await treinamentoPertenceAoTenant(treinamento_id, req.empresaId))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    const [result] = await pool.query(
      `
      INSERT INTO materiais_avaliativos
      (
        treinamento_id,
        titulo,
        tipo,
        link_arquivo,
        descricao,
        nota_maxima,
        data_aplicacao,
        questoes_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        treinamento_id,
        titulo,
        tipo,
        link_arquivo || null,
        descricao || null,
        Number(nota_maxima || 0),
        data_aplicacao || null,
        questoes_json || null,
      ]
    );

    return res.status(201).json({
      ok: true,
      id: result.insertId,
      message: "Material avaliativo criado com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao criar material avaliativo",
      error: error.message,
    });
  }
}

async function updateMaterialAvaliativo(req, res) {
  try {
    const { id } = req.params;
    const {
      treinamento_id,
      titulo,
      tipo,
      link_arquivo,
      descricao,
      nota_maxima,
      data_aplicacao,
      questoes_json,
    } = req.body || {};

    if (!treinamento_id || !titulo || !tipo) {
      return res.status(400).json({
        ok: false,
        message: "Preencha treinamento, título e tipo",
      });
    }

    const tenantCheck = tenantJoinTreinamento(req.empresaId);
    const [exists] = await pool.query(
      `SELECT id FROM materiais_avaliativos WHERE id = ?${tenantCheck} LIMIT 1`,
      [id]
    );
    if (!exists.length) {
      return res.status(404).json({ ok: false, message: "Material avaliativo não encontrado" });
    }

    if (!(await treinamentoPertenceAoTenant(treinamento_id, req.empresaId))) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }

    await pool.query(
      `
      UPDATE materiais_avaliativos
      SET
        treinamento_id = ?,
        titulo = ?,
        tipo = ?,
        link_arquivo = ?,
        descricao = ?,
        nota_maxima = ?,
        data_aplicacao = ?,
        questoes_json = ?
      WHERE id = ?
      `,
      [
        treinamento_id,
        titulo,
        tipo,
        link_arquivo || null,
        descricao || null,
        Number(nota_maxima || 0),
        data_aplicacao || null,
        questoes_json || null,
        id,
      ]
    );

    return res.json({
      ok: true,
      message: "Material avaliativo atualizado com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao atualizar material avaliativo",
      error: error.message,
    });
  }
}

async function deleteMaterialAvaliativo(req, res) {
  try {
    const { id } = req.params;

    const tenantCheck = tenantJoinTreinamento(req.empresaId);
    const [materiais] = await pool.query(
      `
      SELECT id, treinamento_id, titulo
      FROM materiais_avaliativos
      WHERE id = ?${tenantCheck}
      LIMIT 1
      `,
      [id]
    );

    if (!materiais.length) {
      return res.status(404).json({
        ok: false,
        message: "Material avaliativo não encontrado",
      });
    }

    const material = materiais[0];

    await pool.query(
      `DELETE FROM respostas_avaliativas WHERE material_id = ?`,
      [id]
    );

    await pool.query(
      `
      DELETE FROM avaliacoes
      WHERE treinamento_id = ?
        AND titulo = ?
        AND comentario LIKE 'Resultado automático da prova/simulado:%'
      `,
      [material.treinamento_id, material.titulo]
    );

    await pool.query(
      `DELETE FROM materiais_avaliativos WHERE id = ?`,
      [id]
    );

    return res.json({
      ok: true,
      message: "Material avaliativo e resultados vinculados excluídos com sucesso",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao excluir material avaliativo",
      error: error.message,
    });
  }
}

module.exports = {
  listMateriaisAvaliativos,
  listMateriaisAvaliativosDisponiveis,
  createMaterialAvaliativo,
  updateMaterialAvaliativo,
  deleteMaterialAvaliativo,
};
