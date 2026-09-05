// backend/src/controllers/rsController.js
// Módulo R&S — Requisições de Pessoas
// CommonJS — nunca usar import/export

const db = require('../lib/db');

const getEmpresaId = (req) => req.user?.empresa_id;

// ─── LISTAR RPs ────────────────────────────────────────────────────
const listar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: 'Não autorizado' });

  const { mes, site, setor, status, produto, page = 1, limit = 200 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const params = [empresa_id];
  const conditions = ['r.empresa_id = ?'];

  if (mes) {
    conditions.push("DATE_FORMAT(r.mes_referencia, '%Y-%m') = ?");
    params.push(mes);
  }
  if (site)    { conditions.push('r.site = ?');            params.push(site); }
  if (setor)   { conditions.push('r.setor = ?');           params.push(setor); }
  if (status)  { conditions.push('r.status = ?');          params.push(status); }
  if (produto) { conditions.push('r.produto LIKE ?');      params.push(`%${produto}%`); }

  const where = conditions.join(' AND ');

  try {
    const [rps] = await db.query(
      `SELECT r.*, u.nome AS criado_por_nome
       FROM rps r
       LEFT JOIN usuarios u ON r.created_by = u.id
       WHERE ${where}
       ORDER BY r.mes_referencia DESC, r.site ASC, r.setor ASC, r.produto ASC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM rps r WHERE ${where}`,
      params
    );

    const [[totais]] = await db.query(
      `SELECT
         SUM(hcs)           AS hcs,
         SUM(hcs_com_to)    AS hcs_com_to,
         SUM(hcs_aprovados) AS hcs_aprovados,
         SUM(qtd_entregue)  AS qtd_entregue
       FROM rps r WHERE ${where}`,
      params
    );

    return res.json({ rps, total, totais, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[rsController.listar]', err);
    return res.status(500).json({ error: 'Erro ao listar RPs' });
  }
};

// ─── CRIAR RP ──────────────────────────────────────────────────────
const criar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: 'Não autorizado' });

  const {
    mes_referencia, site, setor, chamado, produto, cargo,
    data_recebimento, status,
    inicio_av_tecnica, final_av_tecnica, data_fechamento_vaga,
    hcs, hcs_com_to, hcs_aprovados, qtd_entregue, observacoes
  } = req.body;

  if (!mes_referencia || !site || !setor || !produto) {
    return res.status(400).json({ error: 'Campos obrigatórios: mes_referencia, site, setor, produto' });
  }

  // Campos condicionais — cada setor tem os seus, nunca mistura
  const cargoFinal       = setor === 'ESTRATÉGICO' ? (cargo               || null) : null;
  const fechamentoFinal  = setor === 'ESTRATÉGICO' ? (data_fechamento_vaga || null) : null;
  const inicioAvFinal    = setor === 'OPERACIONAL' ? (inicio_av_tecnica    || null) : null;
  const finalAvFinal     = setor === 'OPERACIONAL' ? (final_av_tecnica     || null) : null;

  try {
    const [result] = await db.query(
      `INSERT INTO rps
         (empresa_id, mes_referencia, site, setor, chamado, produto, cargo,
          data_recebimento, status,
          inicio_av_tecnica, final_av_tecnica, data_fechamento_vaga,
          hcs, hcs_com_to, hcs_aprovados, qtd_entregue,
          observacoes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        empresa_id,
        mes_referencia, site, setor,
        chamado || null, produto, cargoFinal,
        data_recebimento || null,
        status || 'EM ANDAMENTO',
        inicioAvFinal, finalAvFinal, fechamentoFinal,
        parseInt(hcs) || 0,
        parseInt(hcs_com_to) || 0,
        parseInt(hcs_aprovados) || 0,
        parseInt(qtd_entregue) || 0,
        observacoes || null,
        req.user?.id || null
      ]
    );

    await _upsertProduto(empresa_id, produto);
    return res.status(201).json({ id: result.insertId, message: 'RP criada com sucesso' });
  } catch (err) {
    console.error('[rsController.criar]', err);
    return res.status(500).json({ error: 'Erro ao criar RP' });
  }
};

// ─── DETALHE ───────────────────────────────────────────────────────
const detalhe = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  const { id } = req.params;

  try {
    const [[rp]] = await db.query(
      'SELECT * FROM rps WHERE id = ? AND empresa_id = ?',
      [id, empresa_id]
    );
    if (!rp) return res.status(404).json({ error: 'RP não encontrada' });
    return res.json(rp);
  } catch (err) {
    console.error('[rsController.detalhe]', err);
    return res.status(500).json({ error: 'Erro ao buscar RP' });
  }
};

// ─── EDITAR ────────────────────────────────────────────────────────
const editar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  const { id } = req.params;

  const {
    mes_referencia, site, setor, chamado, produto, cargo,
    data_recebimento, status,
    inicio_av_tecnica, final_av_tecnica, data_fechamento_vaga,
    hcs, hcs_com_to, hcs_aprovados, qtd_entregue, observacoes
  } = req.body;

  const cargoFinal      = setor === 'ESTRATÉGICO' ? (cargo               || null) : null;
  const fechamentoFinal = setor === 'ESTRATÉGICO' ? (data_fechamento_vaga || null) : null;
  const inicioAvFinal   = setor === 'OPERACIONAL' ? (inicio_av_tecnica    || null) : null;
  const finalAvFinal    = setor === 'OPERACIONAL' ? (final_av_tecnica     || null) : null;

  try {
    const [result] = await db.query(
      `UPDATE rps SET
         mes_referencia = ?, site = ?, setor = ?, chamado = ?,
         produto = ?, cargo = ?,
         data_recebimento = ?, status = ?,
         inicio_av_tecnica = ?, final_av_tecnica = ?, data_fechamento_vaga = ?,
         hcs = ?, hcs_com_to = ?, hcs_aprovados = ?, qtd_entregue = ?,
         observacoes = ?, updated_by = ?
       WHERE id = ? AND empresa_id = ?`,
      [
        mes_referencia, site, setor,
        chamado || null, produto, cargoFinal,
        data_recebimento || null, status,
        inicioAvFinal, finalAvFinal, fechamentoFinal,
        parseInt(hcs) || 0,
        parseInt(hcs_com_to) || 0,
        parseInt(hcs_aprovados) || 0,
        parseInt(qtd_entregue) || 0,
        observacoes || null,
        req.user?.id || null,
        id, empresa_id
      ]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'RP não encontrada' });
    if (produto) await _upsertProduto(empresa_id, produto);
    return res.json({ message: 'RP atualizada com sucesso' });
  } catch (err) {
    console.error('[rsController.editar]', err);
    return res.status(500).json({ error: 'Erro ao editar RP' });
  }
};

// ─── EXCLUIR ───────────────────────────────────────────────────────
const excluir = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  const { id } = req.params;

  try {
    const [result] = await db.query(
      'DELETE FROM rps WHERE id = ? AND empresa_id = ?',
      [id, empresa_id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'RP não encontrada' });
    return res.json({ message: 'RP excluída com sucesso' });
  } catch (err) {
    console.error('[rsController.excluir]', err);
    return res.status(500).json({ error: 'Erro ao excluir RP' });
  }
};

// ─── SITES ─────────────────────────────────────────────────────────
const getSites = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  try {
    const [sites] = await db.query(
      'SELECT id, nome FROM rs_sites WHERE empresa_id = ? AND ativo = 1 ORDER BY nome',
      [empresa_id]
    );
    return res.json(sites);
  } catch (err) {
    console.error('[rsController.getSites]', err);
    return res.status(500).json({ error: 'Erro ao buscar sites' });
  }
};

// ─── PRODUTOS — autocomplete ────────────────────────────────────────
const getProdutos = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  const { q } = req.query;
  try {
    const [rows] = await db.query(
      `SELECT nome FROM rs_produtos
       WHERE empresa_id = ? AND ativo = 1
         ${q ? 'AND nome LIKE ?' : ''}
       ORDER BY nome LIMIT 30`,
      q ? [empresa_id, `%${q}%`] : [empresa_id]
    );
    return res.json(rows.map(r => r.nome));
  } catch (err) {
    console.error('[rsController.getProdutos]', err);
    return res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
};

// ─── HELPER INTERNO — mantém autocomplete atualizado ───────────────
async function _upsertProduto(empresa_id, nome) {
  try {
    const nomeFinal = nome.trim().toUpperCase();
    const [[exists]] = await db.query(
      'SELECT id FROM rs_produtos WHERE empresa_id = ? AND nome = ?',
      [empresa_id, nomeFinal]
    );
    if (!exists) {
      await db.query(
        'INSERT INTO rs_produtos (empresa_id, nome) VALUES (?, ?)',
        [empresa_id, nomeFinal]
      );
    }
  } catch (_) { /* não crítico */ }
}

module.exports = { listar, criar, detalhe, editar, excluir, getSites, getProdutos };
