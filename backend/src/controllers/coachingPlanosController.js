const db = require("../lib/db");

// Bugfix: criar()/atualizar() gravavam jornada_id/etapa_id/acao_id vindos do
// corpo da requisição sem checar se pertenciam ao tenant do usuário — uma
// empresa conseguia vincular um plano de coaching a uma jornada de outra
// empresa (vazamento de dados entre tenants). Mesmo padrão já usado em
// acoesDesenvolvimentoController.js.
async function validarPertencimentoTenant(req, { jornada_id, etapa_id, acao_id }) {
  if (!req.empresaId) return null;

  if (jornada_id) {
    const [rows] = await db.query(
      `SELECT id FROM jornadas_desenvolvimento WHERE id = ? AND empresa_id = ?`,
      [jornada_id, req.empresaId]
    );
    if (!rows.length) return "Jornada não encontrada.";
  }

  if (etapa_id) {
    const [rows] = await db.query(
      `SELECT id FROM jornadas_etapas WHERE id = ? AND empresa_id = ?`,
      [etapa_id, req.empresaId]
    );
    if (!rows.length) return "Etapa não encontrada.";
  }

  if (acao_id) {
    const [rows] = await db.query(
      `SELECT id FROM acoes_desenvolvimento WHERE id = ? AND empresa_id = ?`,
      [acao_id, req.empresaId]
    );
    if (!rows.length) return "Ação não encontrada.";
  }

  return null;
}

async function listar(req, res) {
  try {
    const tenantWhere = req.empresaId ? "WHERE cp.empresa_id = ?" : "";
    const params = req.empresaId ? [req.empresaId] : [];

    const [rows] = await db.query(
      `
      SELECT cp.*,
             jd.nome AS jornada_nome,
             je.nome AS etapa_nome,
             ad.tema AS acao_tema,
             u.nome AS responsavel_nome
      FROM coaching_planos cp
      LEFT JOIN jornadas_desenvolvimento jd ON jd.id = cp.jornada_id
      LEFT JOIN jornadas_etapas je ON je.id = cp.etapa_id
      LEFT JOIN acoes_desenvolvimento ad ON ad.id = cp.acao_id
      LEFT JOIN usuarios u ON u.id = cp.responsavel_id
      ${tenantWhere}
      ORDER BY cp.id DESC
      `,
      params
    );

    res.json(rows);
  } catch (error) {
    console.error("Erro ao listar planos de coaching:", error);
    res.status(500).json({ error: "Erro ao listar planos de coaching." });
  }
}

async function buscarPorId(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? " AND cp.empresa_id = ?" : "";
    const params = req.empresaId ? [id, req.empresaId] : [id];

    const [rows] = await db.query(
      `
      SELECT cp.*,
             jd.nome AS jornada_nome,
             je.nome AS etapa_nome,
             ad.tema AS acao_tema,
             u.nome AS responsavel_nome
      FROM coaching_planos cp
      LEFT JOIN jornadas_desenvolvimento jd ON jd.id = cp.jornada_id
      LEFT JOIN jornadas_etapas je ON je.id = cp.etapa_id
      LEFT JOIN acoes_desenvolvimento ad ON ad.id = cp.acao_id
      LEFT JOIN usuarios u ON u.id = cp.responsavel_id
      WHERE cp.id = ?${tenantCheck}
      `,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Plano de coaching não encontrado." });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao buscar plano de coaching:", error);
    res.status(500).json({ error: "Erro ao buscar plano de coaching." });
  }
}

async function criar(req, res) {
  try {
    const {
      jornada_id,
      etapa_id,
      acao_id,
      tipo_coaching,
      titulo,
      publico_alvo,
      objetivo,
      responsavel_id,
      participantes_previstos,
      participantes_realizados,
      sessoes_previstas,
      sessoes_realizadas,
      carga_horaria_sessao,
      horas_totais,
      horas_planejadas,
      status,
      data_inicio,
      data_fim,
    } = req.body;

    if (!titulo) {
      return res.status(400).json({
        error: "Título do coaching é obrigatório.",
      });
    }

    const jornadaIdNum = jornada_id ? Number(jornada_id) : null;
    const etapaIdNum = etapa_id ? Number(etapa_id) : null;
    const acaoIdNum = acao_id ? Number(acao_id) : null;

    const erroTenant = await validarPertencimentoTenant(req, {
      jornada_id: jornadaIdNum,
      etapa_id: etapaIdNum,
      acao_id: acaoIdNum,
    });
    if (erroTenant) {
      return res.status(404).json({ error: erroTenant });
    }

    const [result] = await db.query(
      `
      INSERT INTO coaching_planos
      (
        jornada_id,
        etapa_id,
        acao_id,
        tipo_coaching,
        titulo,
        publico_alvo,
        objetivo,
        responsavel_id,
        participantes_previstos,
        participantes_realizados,
        sessoes_previstas,
        sessoes_realizadas,
        carga_horaria_sessao,
        horas_totais,
        horas_planejadas,
        status,
        data_inicio,
        data_fim,
        empresa_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        jornadaIdNum,
        etapaIdNum,
        acaoIdNum,
        tipo_coaching || "desenvolvimento",
        titulo,
        publico_alvo || null,
        objetivo || null,
        responsavel_id || null,
        Number(participantes_previstos || 0),
        Number(participantes_realizados || 0),
        Number(sessoes_previstas || 0),
        Number(sessoes_realizadas || 0),
        Number(carga_horaria_sessao || 0),
        Number(horas_totais || 0),
        Number(horas_planejadas || 0),
        status || "planejado",
        data_inicio || null,
        data_fim || null,
        req.empresaId ?? null,
      ]
    );

    const [rows] = await db.query(
      `SELECT * FROM coaching_planos WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Erro ao criar plano de coaching:", error);
    res.status(500).json({ error: "Erro ao criar plano de coaching." });
  }
}

async function atualizar(req, res) {
  try {
    const { id } = req.params;
    const {
      jornada_id,
      etapa_id,
      acao_id,
      tipo_coaching,
      titulo,
      publico_alvo,
      objetivo,
      responsavel_id,
      participantes_previstos,
      participantes_realizados,
      sessoes_previstas,
      sessoes_realizadas,
      carga_horaria_sessao,
      horas_totais,
      horas_planejadas,
      status,
      data_inicio,
      data_fim,
    } = req.body;

    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(
      `SELECT id FROM coaching_planos WHERE id = ?${tenantCheck}`,
      checkParams
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Plano de coaching não encontrado." });
    }

    const jornadaIdNum = jornada_id ? Number(jornada_id) : null;
    const etapaIdNum = etapa_id ? Number(etapa_id) : null;
    const acaoIdNum = acao_id ? Number(acao_id) : null;

    const erroTenant = await validarPertencimentoTenant(req, {
      jornada_id: jornadaIdNum,
      etapa_id: etapaIdNum,
      acao_id: acaoIdNum,
    });
    if (erroTenant) {
      return res.status(404).json({ error: erroTenant });
    }

    const updateParams = [
      jornadaIdNum,
      etapaIdNum,
      acaoIdNum,
      tipo_coaching || "desenvolvimento",
      titulo,
      publico_alvo || null,
      objetivo || null,
      responsavel_id || null,
      Number(participantes_previstos || 0),
      Number(participantes_realizados || 0),
      Number(sessoes_previstas || 0),
      Number(sessoes_realizadas || 0),
      Number(carga_horaria_sessao || 0),
      Number(horas_totais || 0),
      Number(horas_planejadas || 0),
      status || "planejado",
      data_inicio || null,
      data_fim || null,
      id,
    ];
    if (req.empresaId) updateParams.push(req.empresaId);

    await db.query(
      `
      UPDATE coaching_planos
      SET jornada_id = ?,
          etapa_id = ?,
          acao_id = ?,
          tipo_coaching = ?,
          titulo = ?,
          publico_alvo = ?,
          objetivo = ?,
          responsavel_id = ?,
          participantes_previstos = ?,
          participantes_realizados = ?,
          sessoes_previstas = ?,
          sessoes_realizadas = ?,
          carga_horaria_sessao = ?,
          horas_totais = ?,
          horas_planejadas = ?,
          status = ?,
          data_inicio = ?,
          data_fim = ?
      WHERE id = ?${tenantCheck}
      `,
      updateParams
    );

    const [rows] = await db.query(
      `SELECT * FROM coaching_planos WHERE id = ?`,
      [id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error("Erro ao atualizar plano de coaching:", error);
    res.status(500).json({ error: "Erro ao atualizar plano de coaching." });
  }
}

async function remover(req, res) {
  try {
    const { id } = req.params;

    const tenantCheck = req.empresaId ? " AND empresa_id = ?" : "";
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await db.query(
      `SELECT id FROM coaching_planos WHERE id = ?${tenantCheck}`,
      checkParams
    );

    if (!exists.length) {
      return res.status(404).json({ error: "Plano de coaching não encontrado." });
    }

    await db.query(`DELETE FROM coaching_planos WHERE id = ?${tenantCheck}`, checkParams);

    res.json({ success: true, message: "Plano de coaching removido com sucesso." });
  } catch (error) {
    console.error("Erro ao remover plano de coaching:", error);
    res.status(500).json({ error: "Erro ao remover plano de coaching." });
  }
}

module.exports = {
  listar,
  buscarPorId,
  criar,
  atualizar,
  remover,
};
