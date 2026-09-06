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
const XLSX = require('xlsx');

const STATUS_VALIDOS = ['estruturacao', 'ativa', 'estruturada'];

/* ─── LIST ─────────────────────────────────────────────────────────────────── */
async function listTrilhas(req, res) {
  try {
    const empresaId = req.empresaId ?? null;
    const perfil = String(req.user?.perfil || '').toLowerCase().trim();
    const isGestor = ['coordenador', 'supervisor'].includes(perfil);

    const where = [];
    const params = [];

    if (empresaId !== null) {
      where.push('empresa_id = ?');
      params.push(empresaId);
    }

    // Novo recurso: pra treinando/instrutor, o catálogo mostrava TODAS as
    // trilhas do tenant, sem nenhum recorte por cliente/pessoa. Como um
    // primeiro passo de "trilhas atribuídas", instrutor/treinando agora só
    // veem trilhas globais (sem cliente) ou do próprio cliente do usuário.
    // Gestor (coordenador/supervisor) continua vendo tudo, pra gerenciar.
    const clienteUsuario = String(req.user?.cliente || '').trim();
    if (!isGestor && clienteUsuario) {
      where.push('(cliente IS NULL OR cliente = \'\' OR LOWER(cliente) = LOWER(?))');
      params.push(clienteUsuario);
    }

    let query = 'SELECT * FROM trilhas_aprendizagem';
    if (where.length) query += ' WHERE ' + where.join(' AND ');
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

    const { cliente, titulo, descricao, status, etapas } = req.body || {};
    if (!titulo) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ ok: false, message: 'Título é obrigatório' });
    }

    // Bugfix: "?? 1" atribuía toda trilha criada por super_admin/usuário
    // legado (empresaId nulo) à empresa 1 em vez de manter sem tenant.
    const empresaId = req.empresaId ?? null;
    // Melhoria: status agora é um campo real, escolhido no editor — antes
    // era só calculado no frontend pela quantidade de etapas cadastradas.
    const statusFinal = STATUS_VALIDOS.includes(status) ? status : 'estruturacao';

    const [result] = await conn.query(
      `INSERT INTO trilhas_aprendizagem (cliente, titulo, descricao, status, empresa_id)
       VALUES (?, ?, ?, ?, ?)`,
      [cliente || null, titulo, descricao || null, statusFinal, empresaId]
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
    const { cliente, titulo, descricao, status, etapas } = req.body || {};

    if (!titulo) {
      await conn.rollback();
      conn.release();
      return res.status(400).json({ ok: false, message: 'Título é obrigatório' });
    }

    const empresaId = req.empresaId ?? null;
    const statusFinal = STATUS_VALIDOS.includes(status) ? status : 'estruturacao';

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
      `UPDATE trilhas_aprendizagem SET cliente = ?, titulo = ?, descricao = ?, status = ? WHERE id = ?${tenantCheck}`,
      req.empresaId
        ? [cliente || null, titulo, descricao || null, statusFinal, id, req.empresaId]
        : [cliente || null, titulo, descricao || null, statusFinal, id]
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

/* ─── PROGRESSO EM LOTE ──────────────────────────────────────────────────────
   Melhoria: antes o frontend buscava o progresso de CADA trilha do catálogo
   com uma requisição paralela por trilha (uma pra cada uma). Esse endpoint
   devolve o progresso de todas de uma vez numa única query. */
async function getProgressoBulk(req, res) {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) return res.status(401).json({ ok: false, message: 'Não autenticado' });

    const empresaId = req.empresaId ?? null;
    const tenantWhere = empresaId !== null ? 'WHERE t.empresa_id = ?' : '';
    const params = empresaId !== null ? [userEmail, empresaId] : [userEmail];

    const [rows] = await pool.query(
      `SELECT
         t.id AS trilha_id,
         COUNT(te.id) AS total,
         SUM(CASE WHEN tp.concluido = 1 THEN 1 ELSE 0 END) AS concluidas
       FROM trilhas_aprendizagem t
       LEFT JOIN trilha_etapas te ON te.trilha_id = t.id
       LEFT JOIN trilha_progresso tp ON tp.etapa_id = te.id AND tp.usuario_email = ?
       ${tenantWhere}
       GROUP BY t.id`,
      params
    );

    const progresso = {};
    rows.forEach((r) => {
      const total = Number(r.total || 0);
      const concluidas = Number(r.concluidas || 0);
      progresso[r.trilha_id] = {
        total,
        concluidas,
        percentual: total > 0 ? Math.round((concluidas / total) * 100) : 0,
      };
    });

    return res.json({ ok: true, progresso });
  } catch (error) {
    console.error('[trilhas] getProgressoBulk:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao buscar progresso', error: error.message });
  }
}

/* ─── EXPORTAR PROGRESSO (XLSX) ──────────────────────────────────────────────
   Novo recurso: export de "quem concluiu o quê e quando" numa trilha —
   evidência de desenvolvimento, no mesmo espírito do que se quer pro Oceano. */
async function exportarProgresso(req, res) {
  try {
    const { id } = req.params;
    const tenantCheck = req.empresaId ? ' AND empresa_id = ?' : '';
    const checkParams = req.empresaId ? [id, req.empresaId] : [id];

    const [trilhaRows] = await pool.query(
      `SELECT * FROM trilhas_aprendizagem WHERE id = ?${tenantCheck} LIMIT 1`,
      checkParams
    );
    if (!trilhaRows.length) {
      return res.status(404).json({ ok: false, message: 'Trilha não encontrada' });
    }
    const trilha = trilhaRows[0];

    const [etapas] = await pool.query(
      'SELECT * FROM trilha_etapas WHERE trilha_id = ? ORDER BY ordem ASC',
      [id]
    );
    const [progressoRows] = await pool.query(
      `SELECT usuario_email, etapa_id, concluido, concluido_em
       FROM trilha_progresso WHERE trilha_id = ? AND concluido = 1`,
      [id]
    );

    const porUsuario = {};
    progressoRows.forEach((p) => {
      if (!porUsuario[p.usuario_email]) porUsuario[p.usuario_email] = {};
      porUsuario[p.usuario_email][p.etapa_id] = p.concluido_em;
    });

    const cabecalho = ['E-mail', ...etapas.map((e) => e.titulo), 'Etapas concluídas', '% concluído'];
    const linhas = [cabecalho];

    Object.keys(porUsuario).sort().forEach((email) => {
      const datas = porUsuario[email];
      const linha = [email];
      let concluidas = 0;
      etapas.forEach((e) => {
        const dataConclusao = datas[e.id];
        if (dataConclusao) {
          concluidas += 1;
          linha.push(new Date(dataConclusao).toLocaleDateString('pt-BR'));
        } else {
          linha.push('');
        }
      });
      linha.push(concluidas);
      linha.push(etapas.length > 0 ? `${Math.round((concluidas / etapas.length) * 100)}%` : '0%');
      linhas.push(linha);
    });

    if (linhas.length === 1) linhas.push(['Nenhum progresso registrado ainda.']);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    XLSX.utils.book_append_sheet(wb, ws, 'Progresso');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const nomeArquivo = `trilha-${trilha.titulo}`.replace(/[^a-zA-Z0-9-_]+/g, '-').toLowerCase();
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buf);
  } catch (error) {
    console.error('[trilhas] exportarProgresso:', error.message);
    return res.status(500).json({ ok: false, message: 'Erro ao exportar progresso', error: error.message });
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
  getProgressoBulk,
  exportarProgresso,
  marcarEtapaConcluida,
};
