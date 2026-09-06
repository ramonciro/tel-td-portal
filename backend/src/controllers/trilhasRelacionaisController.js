/**
 * trilhasRelacionaisController.js — Sprint 3
 *
 * Substitui o trilhasController.js original (que usava import/export ESM
 * e estava como código morto — nunca importado no index.js).
 *
 * Etapas agora são registros relacionais na tabela trilha_etapas,
 * não mais um campo JSON serializado em trilhas_aprendizagem.
 *
 * Endpoints:
 *   GET    /api/trilhas                          → listTrilhas
 *   GET    /api/trilhas/:id                      → getTrilha
 *   POST   /api/trilhas                          → createTrilha
 *   PUT    /api/trilhas/:id                      → updateTrilha
 *   DELETE /api/trilhas/:id                      → deleteTrilha
 *   GET    /api/trilhas/:id/progresso            → getProgresso
 *   POST   /api/trilhas/:id/etapas/:eid/concluir → marcarEtapaConcluida
 */

const pool = require('../lib/db');

/* ─── LIST ─────────────────────────────────────────────────────────────────── */
async function listTrilhas(req, res) {
  try {
    const empresaId = req.empresaId ?? null;

    let query = 'SELECT * FROM trilhas_aprendizagem';
    const params = [];

    if (empresaId !== null) {
      query += ' WHERE empresa_id = ?';
      params.push(empresaId);
    }
    query += ' ORDER BY id DESC';

    const [trilhas] = await pool.query(query, params);

    if (!trilhas.length) return res.json([]);

    const trilhaIds = trilhas.map((t) => t.id);
    const [etapas] = await pool.query(
      'SELECT * FROM trilha_etapas WHERE trilha_id IN (?) ORDER BY trilha_id, ordem ASC',
      [trilhaIds]
    );

    const result = trilhas.map((t) => ({
      ...t,
      etapas: etapas.filter((e) => e.trilha_id === t.id),
    }));

    return res.json(result);
  } catch (error) {
    console.error('[trilhas] listTrilhas:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao listar trilhas', error: error.message });
  }
}

/* ─── GET ONE ───────────────────────────────────────────────────────────────── */
async function getTrilha(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? ' AND empresa_id = ?' : '';
    const params = req.empresaId ? [id, req.empresaId] : [id];

    const [rows] = await pool.query(
      `SELECT * FROM trilhas_aprendizagem WHERE id = ?${tenantCheck} LIMIT 1`,
      params
    );
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Trilha não encontrada' });

    const [etapas] = await pool.query(
      'SELECT * FROM trilha_etapas WHERE trilha_id = ? ORDER BY ordem ASC',
      [id]
    );

    return res.json({ ...rows[0], etapas });
  } catch (error) {
    console.error('[trilhas] getTrilha:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar trilha', error: error.message });
  }
}

/* ─── CREATE ────────────────────────────────────────────────────────────────── */
async function createTrilha(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { cliente, titulo, descricao, etapas } = req.body || {};
    if (!titulo) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ ok: false, message: 'Título é obrigatório' });
    }

    // Bugfix: "?? 1" atribuía toda trilha criada por super_admin/usuário
    // legado (empresaId nulo) à empresa 1 em vez de manter sem tenant.
    const empresaId = req.empresaId ?? null;

    const [result] = await conn.query(
      `INSERT INTO trilhas_aprendizagem (cliente, titulo, descricao, empresa_id)
       VALUES (?, ?, ?, ?)`,
      [cliente || null, titulo, descricao || null, empresaId]
    );
    const trilhaId = result.insertId;

    if (Array.isArray(etapas) && etapas.length) {
      for (let i = 0; i < etapas.length; i++) {
        const e = etapas[i];
        await conn.query(
          `INSERT INTO trilha_etapas (trilha_id, ordem, titulo, descricao, tipo, turma_id, empresa_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            trilhaId, i,
            e.titulo || `Etapa ${i + 1}`,
            e.descricao || null,
            e.tipo || 'conteudo',
            e.turma_id || null,
            empresaId,
          ]
        );
      }
    }

    await conn.commit();
    conn.release();
    return res.status(201).json({ ok: true, id: trilhaId });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('[trilhas] createTrilha:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao criar trilha', error: error.message });
  }
}

/* ─── UPDATE ────────────────────────────────────────────────────────────────── */
async function updateTrilha(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const { cliente, titulo, descricao, etapas } = req.body || {};

    if (!titulo) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ ok: false, message: 'Título é obrigatório' });
    }

    const empresaId = req.empresaId ?? null;

    const tenantCheck = req.empresaId ? ' AND empresa_id = ?' : '';
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await conn.query(
      `SELECT id FROM trilhas_aprendizagem WHERE id = ?${tenantCheck}`,
      checkParams
    );
    if (!exists.length) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ ok: false, message: 'Trilha não encontrada' });
    }

    await conn.query(
      `UPDATE trilhas_aprendizagem SET cliente = ?, titulo = ?, descricao = ? WHERE id = ?${tenantCheck}`,
      req.empresaId ? [cliente || null, titulo, descricao || null, id, req.empresaId] : [cliente || null, titulo, descricao || null, id]
    );

    // Substitui etapas: deleta as existentes e insere as novas
    await conn.query(`DELETE FROM trilha_etapas WHERE trilha_id = ?${tenantCheck}`, checkParams);

    if (Array.isArray(etapas) && etapas.length) {
      for (let i = 0; i < etapas.length; i++) {
        const e = etapas[i];
        await conn.query(
          `INSERT INTO trilha_etapas (trilha_id, ordem, titulo, descricao, tipo, turma_id, empresa_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            id, i,
            e.titulo || `Etapa ${i + 1}`,
            e.descricao || null,
            e.tipo || 'conteudo',
            e.turma_id || null,
            empresaId,
          ]
        );
      }
    }

    await conn.commit();
    conn.release();
    return res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('[trilhas] updateTrilha:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao atualizar trilha', error: error.message });
  }
}

/* ─── DELETE ────────────────────────────────────────────────────────────────── */
async function deleteTrilha(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const tenantCheck = req.empresaId ? ' AND empresa_id = ?' : '';
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];
    const [exists] = await conn.query(
      `SELECT id FROM trilhas_aprendizagem WHERE id = ?${tenantCheck}`,
      checkParams
    );
    if (!exists.length) {
      await conn.rollback();
      conn.release();
      return res.status(404).json({ ok: false, message: 'Trilha não encontrada' });
    }

    await conn.query('DELETE FROM trilha_progresso WHERE trilha_id = ?', [id]);
    await conn.query(`DELETE FROM trilha_etapas WHERE trilha_id = ?${tenantCheck}`, checkParams);
    await conn.query(`DELETE FROM trilhas_aprendizagem WHERE id = ?${tenantCheck}`, checkParams);

    await conn.commit();
    conn.release();
    return res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    conn.release();
    console.error('[trilhas] deleteTrilha:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao excluir trilha', error: error.message });
  }
}

/* ─── PROGRESSO ─────────────────────────────────────────────────────────────── */
async function getProgresso(req, res) {
  try {
    const { id } = req.params;
    const userEmail = req.user?.email;

    if (!userEmail) return res.status(401).json({ ok: false, message: 'Não autenticado' });

    if (req.empresaId) {
      const [trilhaDoTenant] = await pool.query(
        'SELECT id FROM trilhas_aprendizagem WHERE id = ? AND empresa_id = ?',
        [id, req.empresaId]
      );
      if (!trilhaDoTenant.length) {
        return res.status(404).json({ ok: false, message: 'Trilha não encontrada' });
      }
    }

    const [etapas] = await pool.query(
      'SELECT * FROM trilha_etapas WHERE trilha_id = ? ORDER BY ordem ASC',
      [id]
    );

    const [progressoRows] = await pool.query(
      'SELECT etapa_id, concluido, concluido_em FROM trilha_progresso WHERE trilha_id = ? AND usuario_email = ?',
      [id, userEmail]
    );

    const pMap = {};
    progressoRows.forEach((p) => { pMap[p.etapa_id] = p; });

    const etapasComProgresso = etapas.map((e) => ({
      ...e,
      concluido: !!(pMap[e.id]?.concluido),
      concluido_em: pMap[e.id]?.concluido_em ?? null,
    }));

    const total     = etapasComProgresso.length;
    const concluidas = etapasComProgresso.filter((e) => e.concluido).length;
    const percentual = total > 0 ? Math.round((concluidas / total) * 100) : 0;

    return res.json({ ok: true, etapas: etapasComProgresso, total, concluidas, percentual });
  } catch (error) {
    console.error('[trilhas] getProgresso:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar progresso', error: error.message });
  }
}

/* ─── MARCAR ETAPA CONCLUÍDA ────────────────────────────────────────────────── */
async function marcarEtapaConcluida(req, res) {
  try {
    const { id, etapaId } = req.params;
    const userEmail = req.user?.email;
    const { concluido = true } = req.body || {};

    if (!userEmail) return res.status(401).json({ ok: false, message: 'Não autenticado' });

    if (req.empresaId) {
      const [trilhaDoTenant] = await pool.query(
        'SELECT id FROM trilhas_aprendizagem WHERE id = ? AND empresa_id = ?',
        [id, req.empresaId]
      );
      if (!trilhaDoTenant.length) {
        return res.status(404).json({ ok: false, message: 'Trilha não encontrada' });
      }
    }

    // Bugfix: "?? 1" gravava todo progresso de super_admin/usuário legado
    // (empresaId nulo) como se fosse da empresa 1.
    const empresaId = req.empresaId ?? null;
    const ts = concluido ? new Date() : null;

    await pool.query(
      `INSERT INTO trilha_progresso (trilha_id, etapa_id, usuario_email, empresa_id, concluido, concluido_em)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE concluido = VALUES(concluido), concluido_em = VALUES(concluido_em)`,
      [id, etapaId, userEmail, empresaId, concluido ? 1 : 0, ts]
    );

    return res.json({ ok: true, concluido, concluido_em: ts });
  } catch (error) {
    console.error('[trilhas] marcarEtapaConcluida:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao marcar etapa', error: error.message });
  }
}

module.exports = {
  listTrilhas,
  getTrilha,
  createTrilha,
  updateTrilha,
  deleteTrilha,
  getProgresso,
  marcarEtapaConcluida,
};
