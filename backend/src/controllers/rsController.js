// backend/src/controllers/rsController.js
// Módulo R&S — Requisições de Pessoas
// Sprint 1: CRUD + Sites + Produtos
// Sprint 2: Dashboard + Relatório + Exportação Excel
// CommonJS — nunca usar import/export

const db = require('../lib/db');

const getEmpresaId = (req) => req.user?.empresa_id;

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 1 — CRUD
// ─────────────────────────────────────────────────────────────────────────────

const listar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: 'Não autorizado' });

  const { mes, site, setor, status, produto, page = 1, limit = 200 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const params = [empresa_id];
  const conditions = ['r.empresa_id = ?'];

  if (mes)     { conditions.push("DATE_FORMAT(r.mes_referencia, '%Y-%m') = ?"); params.push(mes); }
  if (site)    { conditions.push('r.site = ?');           params.push(site); }
  if (setor)   { conditions.push('r.setor = ?');          params.push(setor); }
  if (status)  { conditions.push('r.status = ?');         params.push(status); }
  if (produto) { conditions.push('r.produto LIKE ?');     params.push(`%${produto}%`); }

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
      `SELECT SUM(hcs) AS hcs, SUM(hcs_com_to) AS hcs_com_to,
              SUM(hcs_aprovados) AS hcs_aprovados, SUM(qtd_entregue) AS qtd_entregue
       FROM rps r WHERE ${where}`,
      params
    );

    return res.json({ rps, total, totais, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('[rsController.listar]', err);
    return res.status(500).json({ error: 'Erro ao listar RPs' });
  }
};

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

  const cargoFinal      = setor === 'ESTRATÉGICO' ? (cargo               || null) : null;
  const fechamentoFinal = setor === 'ESTRATÉGICO' ? (data_fechamento_vaga || null) : null;
  const inicioAvFinal   = setor === 'OPERACIONAL' ? (inicio_av_tecnica    || null) : null;
  const finalAvFinal    = setor === 'OPERACIONAL' ? (final_av_tecnica     || null) : null;

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
        empresa_id, mes_referencia, site, setor,
        chamado || null, produto, cargoFinal,
        data_recebimento || null, status || 'EM ANDAMENTO',
        inicioAvFinal, finalAvFinal, fechamentoFinal,
        parseInt(hcs) || 0, parseInt(hcs_com_to) || 0,
        parseInt(hcs_aprovados) || 0, parseInt(qtd_entregue) || 0,
        observacoes || null, req.user?.id || null
      ]
    );

    await _upsertProduto(empresa_id, produto);
    return res.status(201).json({ id: result.insertId, message: 'RP criada com sucesso' });
  } catch (err) {
    console.error('[rsController.criar]', err);
    return res.status(500).json({ error: 'Erro ao criar RP' });
  }
};

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
        mes_referencia, site, setor, chamado || null,
        produto, cargoFinal,
        data_recebimento || null, status,
        inicioAvFinal, finalAvFinal, fechamentoFinal,
        parseInt(hcs) || 0, parseInt(hcs_com_to) || 0,
        parseInt(hcs_aprovados) || 0, parseInt(qtd_entregue) || 0,
        observacoes || null, req.user?.id || null,
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

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 2 — ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/rs/dashboard?mes=2026-07
 * KPIs consolidados para o Dashboard.
 */
const getDashboard = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: 'Não autorizado' });

  const { mes } = req.query;

  const params = [empresa_id];
  let where = 'empresa_id = ?';
  if (mes) {
    where += " AND DATE_FORMAT(mes_referencia, '%Y-%m') = ?";
    params.push(mes);
  }

  try {
    // KPIs gerais + breakdown por status e por setor em uma única query
    const [[k]] = await db.query(
      `SELECT
         COUNT(*)                                                   AS total_rps,
         COALESCE(SUM(hcs), 0)                                     AS total_hcs,
         COALESCE(SUM(hcs_com_to), 0)                              AS total_hcs_to,
         COALESCE(SUM(hcs_aprovados), 0)                           AS total_hcs_aprovados,
         COALESCE(SUM(qtd_entregue), 0)                            AS total_entregue,
         SUM(CASE WHEN status = 'ENTREGUE'       THEN 1 ELSE 0 END) AS st_entregue,
         SUM(CASE WHEN status = 'EM ANDAMENTO'   THEN 1 ELSE 0 END) AS st_em_andamento,
         SUM(CASE WHEN status = 'CANCELADA'      THEN 1 ELSE 0 END) AS st_cancelada,
         SUM(CASE WHEN status LIKE 'N_O ENTREGUE'THEN 1 ELSE 0 END) AS st_nao_entregue,
         SUM(CASE WHEN setor = 'OPERACIONAL'     THEN 1 ELSE 0 END) AS op_rps,
         COALESCE(SUM(CASE WHEN setor = 'OPERACIONAL' THEN hcs           ELSE 0 END), 0) AS op_hcs,
         COALESCE(SUM(CASE WHEN setor = 'OPERACIONAL' THEN hcs_aprovados ELSE 0 END), 0) AS op_aprovados,
         COALESCE(SUM(CASE WHEN setor = 'OPERACIONAL' THEN qtd_entregue  ELSE 0 END), 0) AS op_entregue,
         SUM(CASE WHEN setor = 'ESTRATÉGICO'     THEN 1 ELSE 0 END) AS es_rps,
         COALESCE(SUM(CASE WHEN setor LIKE 'ESTRAT_GICO' THEN hcs           ELSE 0 END), 0) AS es_hcs,
         COALESCE(SUM(CASE WHEN setor LIKE 'ESTRAT_GICO' THEN hcs_aprovados ELSE 0 END), 0) AS es_aprovados,
         COALESCE(SUM(CASE WHEN setor LIKE 'ESTRAT_GICO' THEN qtd_entregue  ELSE 0 END), 0) AS es_entregue
       FROM rps WHERE ${where}`,
      params
    );

    // Por site
    const [por_site] = await db.query(
      `SELECT site, COUNT(*) AS total_rps
       FROM rps WHERE ${where}
       GROUP BY site ORDER BY total_rps DESC`,
      params
    );

    // Top 5 produtos por HC'S
    const [top_produtos] = await db.query(
      `SELECT produto, SUM(hcs) AS hcs, SUM(qtd_entregue) AS qtd_entregue
       FROM rps WHERE ${where}
       GROUP BY produto ORDER BY hcs DESC LIMIT 5`,
      params
    );

    const totalStatus = (k.st_entregue || 0) + (k.st_em_andamento || 0) +
                        (k.st_cancelada || 0) + (k.st_nao_entregue || 0);

    return res.json({
      total_rps:           k.total_rps || 0,
      total_hcs:           k.total_hcs || 0,
      total_hcs_aprovados: k.total_hcs_aprovados || 0,
      total_entregue:      k.total_entregue || 0,
      por_status: {
        entregue:     { count: k.st_entregue     || 0, pct: _pct(k.st_entregue,     totalStatus) },
        em_andamento: { count: k.st_em_andamento || 0, pct: _pct(k.st_em_andamento, totalStatus) },
        cancelada:    { count: k.st_cancelada    || 0, pct: _pct(k.st_cancelada,    totalStatus) },
        nao_entregue: { count: k.st_nao_entregue || 0, pct: _pct(k.st_nao_entregue, totalStatus) },
      },
      operacional: {
        rps:           k.op_rps       || 0,
        hcs:           k.op_hcs       || 0,
        hcs_aprovados: k.op_aprovados || 0,
        qtd_entregue:  k.op_entregue  || 0,
      },
      estrategico: {
        rps:           k.es_rps       || 0,
        hcs:           k.es_hcs       || 0,
        hcs_aprovados: k.es_aprovados || 0,
        qtd_entregue:  k.es_entregue  || 0,
      },
      por_site,
      top_produtos,
    });
  } catch (err) {
    console.error('[rsController.getDashboard]', err);
    return res.status(500).json({ error: 'Erro ao gerar dashboard' });
  }
};

/**
 * GET /api/rs/relatorio?mes=2026-07&setor=OPERACIONAL
 * Dados completos para o relatório mensal (pivot tables).
 * setor: OPERACIONAL | ESTRATÉGICO | (omitir = ambos)
 */
const getRelatorio = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: 'Não autorizado' });

  const { mes, setor } = req.query;
  if (!mes) return res.status(400).json({ error: 'Parâmetro mes é obrigatório' });

  const baseParams = [empresa_id, mes];
  const baseWhere  = "empresa_id = ? AND DATE_FORMAT(mes_referencia, '%Y-%m') = ?";
  const setorClause = setor ? ' AND setor = ?' : '';
  const setorParams = setor ? [...baseParams, setor] : baseParams;

  try {
    // KPIs filtrados
    const [[k]] = await db.query(
      `SELECT COUNT(*) AS total_rps,
              COALESCE(SUM(hcs), 0)           AS total_hcs,
              COALESCE(SUM(hcs_com_to), 0)    AS total_hcs_to,
              COALESCE(SUM(hcs_aprovados), 0) AS total_hcs_aprovados,
              COALESCE(SUM(qtd_entregue), 0)  AS total_entregue
       FROM rps WHERE ${baseWhere}${setorClause}`,
      setorParams
    );

    // Por site
    const [por_site] = await db.query(
      `SELECT site, COUNT(*) AS total_rps
       FROM rps WHERE ${baseWhere}${setorClause}
       GROUP BY site ORDER BY total_rps DESC`,
      setorParams
    );

    // Por status (com percentual)
    const [rawStatus] = await db.query(
      `SELECT status, COUNT(*) AS total
       FROM rps WHERE ${baseWhere}${setorClause}
       GROUP BY status ORDER BY total DESC`,
      setorParams
    );
    const totalStatus = rawStatus.reduce((s, r) => s + r.total, 0);
    const por_status = rawStatus.map(r => ({
      status: r.status,
      total:  r.total,
      pct:    _pct(r.total, totalStatus),
    }));

    // Por produto — Operacional
    let por_produto = [];
    if (!setor || setor === 'OPERACIONAL') {
      const [rows] = await db.query(
        `SELECT produto,
                COALESCE(SUM(hcs), 0)           AS hcs,
                COALESCE(SUM(hcs_com_to), 0)    AS hcs_com_to,
                COALESCE(SUM(hcs_aprovados), 0) AS hcs_aprovados,
                COALESCE(SUM(qtd_entregue), 0)  AS qtd_entregue
         FROM rps WHERE ${baseWhere} AND setor = 'OPERACIONAL'
         GROUP BY produto ORDER BY hcs DESC`,
        baseParams
      );
      por_produto = rows;
    }

    // Por cargo — Estratégico
    let por_cargo = [];
    if (!setor || setor === 'ESTRATÉGICO') {
      const [rows] = await db.query(
        `SELECT COALESCE(NULLIF(cargo, ''), '(sem cargo)') AS cargo,
                COALESCE(SUM(hcs), 0)           AS hcs,
                COALESCE(SUM(hcs_com_to), 0)    AS hcs_com_to,
                COALESCE(SUM(hcs_aprovados), 0) AS hcs_aprovados,
                COALESCE(SUM(qtd_entregue), 0)  AS qtd_entregue
         FROM rps WHERE ${baseWhere} AND setor LIKE 'ESTRAT%'
         GROUP BY cargo ORDER BY hcs DESC`,
        baseParams
      );
      por_cargo = rows;
    }

    return res.json({
      kpis: {
        total_rps:           k.total_rps           || 0,
        total_hcs:           k.total_hcs           || 0,
        total_hcs_to:        k.total_hcs_to        || 0,
        total_hcs_aprovados: k.total_hcs_aprovados || 0,
        total_entregue:      k.total_entregue      || 0,
      },
      por_site,
      por_status,
      por_produto,
      por_cargo,
    });
  } catch (err) {
    console.error('[rsController.getRelatorio]', err);
    return res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
};

/**
 * GET /api/rs/exportar?mes=2026-07
 * Gera e retorna um arquivo Excel no mesmo formato da planilha original.
 * Requer: npm install xlsx  (se ainda não estiver no package.json)
 */
const exportar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: 'Não autorizado' });

  const { mes } = req.query;
  if (!mes) return res.status(400).json({ error: 'Parâmetro mes é obrigatório' });

  try {
    const XLSX = require('xlsx');

    const baseParams = [empresa_id, mes];
    const baseWhere  = "empresa_id = ? AND DATE_FORMAT(mes_referencia, '%Y-%m') = ?";

    const [rpsOp] = await db.query(
      `SELECT mes_referencia, site, setor, chamado, produto,
              data_recebimento, status, inicio_av_tecnica, final_av_tecnica,
              hcs, hcs_com_to, hcs_aprovados, qtd_entregue
       FROM rps WHERE ${baseWhere} AND setor = 'OPERACIONAL'
       ORDER BY site, produto`,
      baseParams
    );

    const [rpsEs] = await db.query(
      `SELECT mes_referencia, site, setor, chamado, produto, cargo,
              data_recebimento, status, data_fechamento_vaga,
              hcs, hcs_com_to, hcs_aprovados, qtd_entregue
       FROM rps WHERE ${baseWhere} AND setor LIKE 'ESTRAT%'
       ORDER BY site, cargo`,
      baseParams
    );

    const fd  = (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '';
    const fm  = (v) => {
      if (!v) return '';
      const meses = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO',
                     'JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
      return meses[new Date(v).getMonth()];
    };
    const sum = (arr, field) => arr.reduce((s, r) => s + (Number(r[field]) || 0), 0);

    // ── Aba OPERACIONAL ──────────────────────────────────────────────────────
    const opHeader = [
      'MÊS','SITE','SETOR','CHAMADO','PRODUTO',
      'DATA RECEBIMENTO RP','STATUS',
      'INICIO DA AV. TÉCNICA','FINAL DA AV. TECNICA',
      "HC'S","HC'S COM TO","HC'S APROVADOS",'QTD ENTREGUE',
    ];
    const opRows = rpsOp.map(r => [
      fm(r.mes_referencia), r.site, r.setor, r.chamado || '', r.produto,
      fd(r.data_recebimento), r.status,
      fd(r.inicio_av_tecnica), fd(r.final_av_tecnica),
      r.hcs, r.hcs_com_to, r.hcs_aprovados, r.qtd_entregue,
    ]);
    const opTotal = [
      'TOTAL','','','','','','','','',
      sum(rpsOp,'hcs'), sum(rpsOp,'hcs_com_to'),
      sum(rpsOp,'hcs_aprovados'), sum(rpsOp,'qtd_entregue'),
    ];
    const wsOp = XLSX.utils.aoa_to_sheet([opHeader, ...opRows, opTotal]);

    // ── Aba ESTRATÉGICO ──────────────────────────────────────────────────────
    const esHeader = [
      'MÊS','SITE','SETOR','CHAMADO','PRODUTO','CARGO',
      'DATA RECEBIMENTO RP','STATUS','DATA FECHAMENTO DA VAGA',
      "HC'S","HC'S COM TO","HC'S APROVADOS",'QTD ENTREGUE',
    ];
    const esRows = rpsEs.map(r => [
      fm(r.mes_referencia), r.site, r.setor, r.chamado || '', r.produto, r.cargo || '',
      fd(r.data_recebimento), r.status, fd(r.data_fechamento_vaga),
      r.hcs, r.hcs_com_to, r.hcs_aprovados, r.qtd_entregue,
    ]);
    const esTotal = [
      'TOTAL','','','','','','','','',
      sum(rpsEs,'hcs'), sum(rpsEs,'hcs_com_to'),
      sum(rpsEs,'hcs_aprovados'), sum(rpsEs,'qtd_entregue'),
    ];
    const wsEs = XLSX.utils.aoa_to_sheet([esHeader, ...esRows, esTotal]);

    // ── Aba DASHBOARD (pivot tables) ─────────────────────────────────────────
    // Por Site
    const siteCount = {};
    [...rpsOp, ...rpsEs].forEach(r => { siteCount[r.site] = (siteCount[r.site] || 0) + 1; });
    const sitePivot = [['SITE','TOTAL RPs'], ...Object.entries(siteCount).map(([k,v]) => [k, v])];

    // Por Produto — Operacional
    const prodMap = {};
    rpsOp.forEach(r => {
      if (!prodMap[r.produto]) prodMap[r.produto] = { hcs: 0, hcs_aprovados: 0, qtd_entregue: 0 };
      prodMap[r.produto].hcs           += (r.hcs           || 0);
      prodMap[r.produto].hcs_aprovados += (r.hcs_aprovados || 0);
      prodMap[r.produto].qtd_entregue  += (r.qtd_entregue  || 0);
    });
    const prodPivot = [
      ['PRODUTO',"HC'S","HC'S APROVADOS",'QTD ENTREGUE'],
      ...Object.entries(prodMap).map(([k, v]) => [k, v.hcs, v.hcs_aprovados, v.qtd_entregue]),
      ['TOTAL', sum(rpsOp,'hcs'), sum(rpsOp,'hcs_aprovados'), sum(rpsOp,'qtd_entregue')],
    ];

    // Por Cargo — Estratégico
    const cargoMap = {};
    rpsEs.forEach(r => {
      const c = r.cargo || '(sem cargo)';
      if (!cargoMap[c]) cargoMap[c] = { hcs: 0, hcs_aprovados: 0, qtd_entregue: 0 };
      cargoMap[c].hcs           += (r.hcs           || 0);
      cargoMap[c].hcs_aprovados += (r.hcs_aprovados || 0);
      cargoMap[c].qtd_entregue  += (r.qtd_entregue  || 0);
    });
    const cargoPivot = [
      ['CARGO',"HC'S","HC'S APROVADOS",'QTD ENTREGUE'],
      ...Object.entries(cargoMap).map(([k, v]) => [k, v.hcs, v.hcs_aprovados, v.qtd_entregue]),
      ['TOTAL', sum(rpsEs,'hcs'), sum(rpsEs,'hcs_aprovados'), sum(rpsEs,'qtd_entregue')],
    ];

    // Montar aba DASHBOARD com espaço entre as tabelas
    const dashData = [
      ['DASHBOARD — ' + mes.replace('-', '/').toUpperCase()], [],
      ['POR SITE'], ...sitePivot, [],
      ['OPERACIONAL — POR PRODUTO'], ...prodPivot, [],
      ['ESTRATÉGICO — POR CARGO'], ...cargoPivot,
    ];
    const wsDash = XLSX.utils.aoa_to_sheet(dashData);

    // ── Workbook final ───────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsOp,   'OPERACIONAL');
    XLSX.utils.book_append_sheet(wb, wsEs,   'ESTRATÉGICO');
    XLSX.utils.book_append_sheet(wb, wsDash, 'DASHBOARD');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const nomeArquivo = `relatorio_rs_${mes.replace('-', '_')}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    return res.send(buf);
  } catch (err) {
    console.error('[rsController.exportar]', err);
    // Erro comum: xlsx não instalado
    if (err.code === 'MODULE_NOT_FOUND') {
      return res.status(500).json({ error: 'Pacote xlsx não instalado. Rode: npm install xlsx' });
    }
    return res.status(500).json({ error: 'Erro ao gerar exportação Excel' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

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

function _pct(valor, total) {
  if (!total || !valor) return 0;
  return Math.round((valor / total) * 100);
}

module.exports = {
  // Sprint 1
  listar, criar, detalhe, editar, excluir, getSites, getProdutos,
  // Sprint 2
  getDashboard, getRelatorio, exportar,
};
