// backend/src/controllers/rsController.js
// Sprint 1: CRUD + Sites + Produtos
// Sprint 2: Dashboard + Relatório + Exportação Excel
// Sprint 3: Importação de planilha histórica + Gestão de usuários R&S
// CommonJS — nunca usar import/export

const db      = require("../lib/db");
const bcrypt  = require("bcryptjs");

const getEmpresaId = (req) => req.user?.empresa_id;

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 1 — CRUD
// ─────────────────────────────────────────────────────────────────────────────

const listar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: "Não autorizado" });

  const { mes, site, setor, status, produto, page = 1, limit = 200 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [empresa_id];
  const conditions = ["r.empresa_id = ?"];

  if (mes)     { conditions.push("DATE_FORMAT(r.mes_referencia, '%Y-%m') = ?"); params.push(mes); }
  if (site)    { conditions.push("r.site = ?");          params.push(site); }
  if (setor)   { conditions.push("r.setor = ?");         params.push(setor); }
  if (status)  { conditions.push("r.status = ?");        params.push(status); }
  if (produto) { conditions.push("r.produto LIKE ?");    params.push(`%${produto}%`); }

  const where = conditions.join(" AND ");

  try {
    const [rps] = await db.query(
      `SELECT r.*, u.nome AS criado_por_nome
       FROM rps r LEFT JOIN usuarios u ON r.created_by = u.id
       WHERE ${where}
       ORDER BY r.mes_referencia DESC, r.site, r.setor, r.produto
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM rps r WHERE ${where}`, params);
    const [[totais]]    = await db.query(
      `SELECT SUM(hcs) AS hcs, SUM(hcs_com_to) AS hcs_com_to,
              SUM(hcs_aprovados) AS hcs_aprovados, SUM(qtd_entregue) AS qtd_entregue
       FROM rps r WHERE ${where}`, params
    );
    return res.json({ rps, total, totais, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error("[rsController.listar]", err);
    return res.status(500).json({ error: "Erro ao listar RPs" });
  }
};

const criar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: "Não autorizado" });

  const {
    mes_referencia, site, setor, chamado, produto, cargo,
    data_recebimento, status,
    inicio_av_tecnica, final_av_tecnica, data_fechamento_vaga,
    hcs, hcs_com_to, hcs_aprovados, qtd_entregue, observacoes,
  } = req.body;

  if (!mes_referencia || !site || !setor || !produto)
    return res.status(400).json({ error: "Campos obrigatórios: mes_referencia, site, setor, produto" });

  const cargoFinal      = setor === "ESTRATÉGICO" ? (cargo               || null) : null;
  const fechamentoFinal = setor === "ESTRATÉGICO" ? (data_fechamento_vaga || null) : null;
  const inicioAvFinal   = setor === "OPERACIONAL" ? (inicio_av_tecnica    || null) : null;
  const finalAvFinal    = setor === "OPERACIONAL" ? (final_av_tecnica     || null) : null;

  try {
    const [result] = await db.query(
      `INSERT INTO rps
         (empresa_id, mes_referencia, site, setor, chamado, produto, cargo,
          data_recebimento, status, inicio_av_tecnica, final_av_tecnica,
          data_fechamento_vaga, hcs, hcs_com_to, hcs_aprovados, qtd_entregue,
          observacoes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [empresa_id, mes_referencia, site, setor, chamado || null, produto, cargoFinal,
       data_recebimento || null, status || "EM ANDAMENTO",
       inicioAvFinal, finalAvFinal, fechamentoFinal,
       parseInt(hcs) || 0, parseInt(hcs_com_to) || 0,
       parseInt(hcs_aprovados) || 0, parseInt(qtd_entregue) || 0,
       observacoes || null, req.user?.id || null]
    );
    await _upsertProduto(empresa_id, produto);
    return res.status(201).json({ id: result.insertId, message: "RP criada com sucesso" });
  } catch (err) {
    console.error("[rsController.criar]", err);
    return res.status(500).json({ error: "Erro ao criar RP" });
  }
};

const detalhe = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  try {
    const [[rp]] = await db.query("SELECT * FROM rps WHERE id = ? AND empresa_id = ?", [req.params.id, empresa_id]);
    if (!rp) return res.status(404).json({ error: "RP não encontrada" });
    return res.json(rp);
  } catch (err) {
    console.error("[rsController.detalhe]", err);
    return res.status(500).json({ error: "Erro ao buscar RP" });
  }
};

const editar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  const {
    mes_referencia, site, setor, chamado, produto, cargo,
    data_recebimento, status,
    inicio_av_tecnica, final_av_tecnica, data_fechamento_vaga,
    hcs, hcs_com_to, hcs_aprovados, qtd_entregue, observacoes,
  } = req.body;

  const cargoFinal      = setor === "ESTRATÉGICO" ? (cargo               || null) : null;
  const fechamentoFinal = setor === "ESTRATÉGICO" ? (data_fechamento_vaga || null) : null;
  const inicioAvFinal   = setor === "OPERACIONAL" ? (inicio_av_tecnica    || null) : null;
  const finalAvFinal    = setor === "OPERACIONAL" ? (final_av_tecnica     || null) : null;

  try {
    const [result] = await db.query(
      `UPDATE rps SET mes_referencia=?, site=?, setor=?, chamado=?, produto=?, cargo=?,
         data_recebimento=?, status=?, inicio_av_tecnica=?, final_av_tecnica=?,
         data_fechamento_vaga=?, hcs=?, hcs_com_to=?, hcs_aprovados=?, qtd_entregue=?,
         observacoes=?, updated_by=?
       WHERE id=? AND empresa_id=?`,
      [mes_referencia, site, setor, chamado || null, produto, cargoFinal,
       data_recebimento || null, status, inicioAvFinal, finalAvFinal, fechamentoFinal,
       parseInt(hcs) || 0, parseInt(hcs_com_to) || 0,
       parseInt(hcs_aprovados) || 0, parseInt(qtd_entregue) || 0,
       observacoes || null, req.user?.id || null, req.params.id, empresa_id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "RP não encontrada" });
    if (produto) await _upsertProduto(empresa_id, produto);
    return res.json({ message: "RP atualizada com sucesso" });
  } catch (err) {
    console.error("[rsController.editar]", err);
    return res.status(500).json({ error: "Erro ao editar RP" });
  }
};

const excluir = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  try {
    const [result] = await db.query("DELETE FROM rps WHERE id=? AND empresa_id=?", [req.params.id, empresa_id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "RP não encontrada" });
    return res.json({ message: "RP excluída com sucesso" });
  } catch (err) {
    console.error("[rsController.excluir]", err);
    return res.status(500).json({ error: "Erro ao excluir RP" });
  }
};

const getSites = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  try {
    const [sites] = await db.query("SELECT id, nome FROM rs_sites WHERE empresa_id=? AND ativo=1 ORDER BY nome", [empresa_id]);
    return res.json(sites);
  } catch (err) {
    console.error("[rsController.getSites]", err);
    return res.status(500).json({ error: "Erro ao buscar sites" });
  }
};

const getProdutos = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  const { q } = req.query;
  try {
    const [rows] = await db.query(
      `SELECT nome FROM rs_produtos WHERE empresa_id=? AND ativo=1 ${q ? "AND nome LIKE ?" : ""} ORDER BY nome LIMIT 30`,
      q ? [empresa_id, `%${q}%`] : [empresa_id]
    );
    return res.json(rows.map(r => r.nome));
  } catch (err) {
    console.error("[rsController.getProdutos]", err);
    return res.status(500).json({ error: "Erro ao buscar produtos" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 2 — ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

const getDashboard = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: "Não autorizado" });
  const { mes } = req.query;
  const params = [empresa_id];
  let where = "empresa_id = ?";
  if (mes) { where += " AND DATE_FORMAT(mes_referencia, '%Y-%m') = ?"; params.push(mes); }

  try {
    const [[k]] = await db.query(
      `SELECT COUNT(*) AS total_rps,
         COALESCE(SUM(hcs),0) AS total_hcs, COALESCE(SUM(hcs_com_to),0) AS total_hcs_to,
         COALESCE(SUM(hcs_aprovados),0) AS total_hcs_aprovados, COALESCE(SUM(qtd_entregue),0) AS total_entregue,
         SUM(CASE WHEN status='ENTREGUE' THEN 1 ELSE 0 END) AS st_entregue,
         SUM(CASE WHEN status='EM ANDAMENTO' THEN 1 ELSE 0 END) AS st_em_andamento,
         SUM(CASE WHEN status='CANCELADA' THEN 1 ELSE 0 END) AS st_cancelada,
         SUM(CASE WHEN status LIKE 'N_O ENTREGUE' THEN 1 ELSE 0 END) AS st_nao_entregue,
         SUM(CASE WHEN setor='OPERACIONAL' THEN 1 ELSE 0 END) AS op_rps,
         COALESCE(SUM(CASE WHEN setor='OPERACIONAL' THEN hcs ELSE 0 END),0) AS op_hcs,
         COALESCE(SUM(CASE WHEN setor='OPERACIONAL' THEN hcs_aprovados ELSE 0 END),0) AS op_aprovados,
         COALESCE(SUM(CASE WHEN setor='OPERACIONAL' THEN qtd_entregue ELSE 0 END),0) AS op_entregue,
         SUM(CASE WHEN setor LIKE 'ESTRAT%' THEN 1 ELSE 0 END) AS es_rps,
         COALESCE(SUM(CASE WHEN setor LIKE 'ESTRAT%' THEN hcs ELSE 0 END),0) AS es_hcs,
         COALESCE(SUM(CASE WHEN setor LIKE 'ESTRAT%' THEN hcs_aprovados ELSE 0 END),0) AS es_aprovados,
         COALESCE(SUM(CASE WHEN setor LIKE 'ESTRAT%' THEN qtd_entregue ELSE 0 END),0) AS es_entregue
       FROM rps WHERE ${where}`, params
    );
    const [por_site]     = await db.query(`SELECT site, COUNT(*) AS total_rps FROM rps WHERE ${where} GROUP BY site ORDER BY total_rps DESC`, params);
    const [top_produtos] = await db.query(`SELECT produto, SUM(hcs) AS hcs, SUM(qtd_entregue) AS qtd_entregue FROM rps WHERE ${where} GROUP BY produto ORDER BY hcs DESC LIMIT 5`, params);
    const tot = (k.st_entregue||0)+(k.st_em_andamento||0)+(k.st_cancelada||0)+(k.st_nao_entregue||0);
    return res.json({
      total_rps: k.total_rps||0, total_hcs: k.total_hcs||0,
      total_hcs_aprovados: k.total_hcs_aprovados||0, total_entregue: k.total_entregue||0,
      por_status: {
        entregue:     { count: k.st_entregue||0,     pct: _pct(k.st_entregue,     tot) },
        em_andamento: { count: k.st_em_andamento||0, pct: _pct(k.st_em_andamento, tot) },
        cancelada:    { count: k.st_cancelada||0,    pct: _pct(k.st_cancelada,    tot) },
        nao_entregue: { count: k.st_nao_entregue||0, pct: _pct(k.st_nao_entregue, tot) },
      },
      operacional: { rps: k.op_rps||0, hcs: k.op_hcs||0, hcs_aprovados: k.op_aprovados||0, qtd_entregue: k.op_entregue||0 },
      estrategico: { rps: k.es_rps||0, hcs: k.es_hcs||0, hcs_aprovados: k.es_aprovados||0, qtd_entregue: k.es_entregue||0 },
      por_site, top_produtos,
    });
  } catch (err) {
    console.error("[rsController.getDashboard]", err);
    return res.status(500).json({ error: "Erro ao gerar dashboard" });
  }
};

const getRelatorio = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: "Não autorizado" });
  const { mes, setor } = req.query;
  if (!mes) return res.status(400).json({ error: "Parâmetro mes é obrigatório" });

  const base = [empresa_id, mes];
  const bw   = "empresa_id=? AND DATE_FORMAT(mes_referencia,'%Y-%m')=?";
  const sc   = setor ? " AND setor=?" : "";
  const sp   = setor ? [...base, setor] : base;

  try {
    const [[k]] = await db.query(`SELECT COUNT(*) AS total_rps, COALESCE(SUM(hcs),0) AS total_hcs, COALESCE(SUM(hcs_com_to),0) AS total_hcs_to, COALESCE(SUM(hcs_aprovados),0) AS total_hcs_aprovados, COALESCE(SUM(qtd_entregue),0) AS total_entregue FROM rps WHERE ${bw}${sc}`, sp);
    const [por_site]   = await db.query(`SELECT site, COUNT(*) AS total_rps FROM rps WHERE ${bw}${sc} GROUP BY site ORDER BY total_rps DESC`, sp);
    const [rawStatus]  = await db.query(`SELECT status, COUNT(*) AS total FROM rps WHERE ${bw}${sc} GROUP BY status ORDER BY total DESC`, sp);
    const totSt = rawStatus.reduce((s,r)=>s+r.total,0);
    const por_status = rawStatus.map(r=>({status:r.status,total:r.total,pct:_pct(r.total,totSt)}));

    let por_produto = [];
    if (!setor || setor==="OPERACIONAL") {
      const [rows] = await db.query(`SELECT produto, COALESCE(SUM(hcs),0) AS hcs, COALESCE(SUM(hcs_com_to),0) AS hcs_com_to, COALESCE(SUM(hcs_aprovados),0) AS hcs_aprovados, COALESCE(SUM(qtd_entregue),0) AS qtd_entregue FROM rps WHERE ${bw} AND setor='OPERACIONAL' GROUP BY produto ORDER BY hcs DESC`, base);
      por_produto = rows;
    }
    let por_cargo = [];
    if (!setor || setor==="ESTRATÉGICO") {
      const [rows] = await db.query(`SELECT COALESCE(NULLIF(cargo,''),'(sem cargo)') AS cargo, COALESCE(SUM(hcs),0) AS hcs, COALESCE(SUM(hcs_com_to),0) AS hcs_com_to, COALESCE(SUM(hcs_aprovados),0) AS hcs_aprovados, COALESCE(SUM(qtd_entregue),0) AS qtd_entregue FROM rps WHERE ${bw} AND setor LIKE 'ESTRAT%' GROUP BY cargo ORDER BY hcs DESC`, base);
      por_cargo = rows;
    }
    return res.json({ kpis: { total_rps:k.total_rps||0, total_hcs:k.total_hcs||0, total_hcs_to:k.total_hcs_to||0, total_hcs_aprovados:k.total_hcs_aprovados||0, total_entregue:k.total_entregue||0 }, por_site, por_status, por_produto, por_cargo });
  } catch (err) {
    console.error("[rsController.getRelatorio]", err);
    return res.status(500).json({ error: "Erro ao gerar relatório" });
  }
};

const exportar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: "Não autorizado" });
  const { mes } = req.query;
  if (!mes) return res.status(400).json({ error: "Parâmetro mes é obrigatório" });

  try {
    const XLSX = require("xlsx");
    const bw   = "empresa_id=? AND DATE_FORMAT(mes_referencia,'%Y-%m')=?";
    const [rpsOp] = await db.query(`SELECT * FROM rps WHERE ${bw} AND setor='OPERACIONAL' ORDER BY site, produto`, [empresa_id, mes]);
    const [rpsEs] = await db.query(`SELECT * FROM rps WHERE ${bw} AND setor LIKE 'ESTRAT%' ORDER BY site, cargo`, [empresa_id, mes]);

    const fd  = v => v ? new Date(v).toLocaleDateString("pt-BR") : "";
    const fm  = v => { if(!v) return ""; const m=["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"]; return m[new Date(v).getMonth()]; };
    const sum = (arr, f) => arr.reduce((s,r)=>s+(Number(r[f])||0), 0);

    const opData = [
      ["MÊS","SITE","SETOR","CHAMADO","PRODUTO","DATA RECEBIMENTO RP","STATUS","INICIO DA AV. TÉCNICA","FINAL DA AV. TECNICA","HC'S","HC'S COM TO","HC'S APROVADOS","QTD ENTREGUE"],
      ...rpsOp.map(r=>[fm(r.mes_referencia),r.site,r.setor,r.chamado||"",r.produto,fd(r.data_recebimento),r.status,fd(r.inicio_av_tecnica),fd(r.final_av_tecnica),r.hcs,r.hcs_com_to,r.hcs_aprovados,r.qtd_entregue]),
      ["TOTAL","","","","","","","","",sum(rpsOp,"hcs"),sum(rpsOp,"hcs_com_to"),sum(rpsOp,"hcs_aprovados"),sum(rpsOp,"qtd_entregue")],
    ];
    const esData = [
      ["MÊS","SITE","SETOR","CHAMADO","PRODUTO","CARGO","DATA RECEBIMENTO RP","STATUS","DATA FECHAMENTO DA VAGA","HC'S","HC'S COM TO","HC'S APROVADOS","QTD ENTREGUE"],
      ...rpsEs.map(r=>[fm(r.mes_referencia),r.site,r.setor,r.chamado||"",r.produto,r.cargo||"",fd(r.data_recebimento),r.status,fd(r.data_fechamento_vaga),r.hcs,r.hcs_com_to,r.hcs_aprovados,r.qtd_entregue]),
      ["TOTAL","","","","","","","","",sum(rpsEs,"hcs"),sum(rpsEs,"hcs_com_to"),sum(rpsEs,"hcs_aprovados"),sum(rpsEs,"qtd_entregue")],
    ];

    const siteCount={};
    [...rpsOp,...rpsEs].forEach(r=>{siteCount[r.site]=(siteCount[r.site]||0)+1;});
    const sitePivot=[["SITE","TOTAL RPs"],...Object.entries(siteCount).map(([k,v])=>[k,v])];
    const prodMap={};
    rpsOp.forEach(r=>{if(!prodMap[r.produto])prodMap[r.produto]={hcs:0,ha:0,qe:0};prodMap[r.produto].hcs+=r.hcs||0;prodMap[r.produto].ha+=r.hcs_aprovados||0;prodMap[r.produto].qe+=r.qtd_entregue||0;});
    const prodPivot=[["PRODUTO","HC'S","HC'S APROVADOS","QTD ENTREGUE"],...Object.entries(prodMap).map(([k,v])=>[k,v.hcs,v.ha,v.qe]),["TOTAL",sum(rpsOp,"hcs"),sum(rpsOp,"hcs_aprovados"),sum(rpsOp,"qtd_entregue")]];
    const cargoMap={};
    rpsEs.forEach(r=>{const c=r.cargo||"(sem cargo)";if(!cargoMap[c])cargoMap[c]={hcs:0,ha:0,qe:0};cargoMap[c].hcs+=r.hcs||0;cargoMap[c].ha+=r.hcs_aprovados||0;cargoMap[c].qe+=r.qtd_entregue||0;});
    const cargoPivot=[["CARGO","HC'S","HC'S APROVADOS","QTD ENTREGUE"],...Object.entries(cargoMap).map(([k,v])=>[k,v.hcs,v.ha,v.qe]),["TOTAL",sum(rpsEs,"hcs"),sum(rpsEs,"hcs_aprovados"),sum(rpsEs,"qtd_entregue")]];
    const dashData=[["DASHBOARD — "+mes.replace("-","/")],[],["POR SITE"],...sitePivot,[],["OPERACIONAL — POR PRODUTO"],...prodPivot,[],["ESTRATÉGICO — POR CARGO"],...cargoPivot];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(opData),   "OPERACIONAL");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(esData),   "ESTRATÉGICO");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dashData), "DASHBOARD");

    const buf = XLSX.write(wb, { type:"buffer", bookType:"xlsx" });
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename="relatorio_rs_${mes.replace("-","_")}.xlsx"`);
    return res.send(buf);
  } catch (err) {
    console.error("[rsController.exportar]", err);
    if (err.code === "MODULE_NOT_FOUND") return res.status(500).json({ error: "xlsx não instalado — rodar: npm install xlsx" });
    return res.status(500).json({ error: "Erro ao gerar exportação" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 3 — IMPORTAÇÃO DE PLANILHA HISTÓRICA
// ─────────────────────────────────────────────────────────────────────────────

// Mapeamento de meses em português
const MESES_PT = {
  JANEIRO:"01",FEVEREIRO:"02","MARÇO":"03",MARCO:"03",ABRIL:"04",MAIO:"05",JUNHO:"06",
  JULHO:"07",AGOSTO:"08",SETEMBRO:"09",OUTUBRO:"10",NOVEMBRO:"11",DEZEMBRO:"12",
  JAN:"01",FEV:"02",MAR:"03",ABR:"04",MAI:"05",JUN:"06",
  JUL:"07",AGO:"08",SET:"09",OUT:"10",NOV:"11",DEZ:"12",
};

function _normMes(val, ano) {
  if (!val) return null;
  const s = String(val).trim().toUpperCase().replace(/\./g,"");
  const mm = MESES_PT[s];
  return mm ? `${ano}-${mm}-01` : null;
}

function _normDate(val, ano) {
  if (!val || val === "-" || val === "") return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().slice(0, 10);
  }
  // Excel serial number → Date (xlsx já converte, mas por segurança)
  if (typeof val === "number") {
    try { return new Date((val - 25569) * 86400000).toISOString().slice(0,10); } catch { return null; }
  }
  const s = String(val).trim();
  // "03/jun." ou "21/ago"
  const m1 = s.match(/(\d{1,2})\s*\/\s*([a-záéíóúâêîôûãõç]+)\.?/i);
  if (m1) {
    const dia = m1[1].padStart(2,"0");
    const mesAbr = m1[2].toUpperCase().replace(/\./g,"").slice(0,3);
    const mm = MESES_PT[mesAbr];
    if (mm) return `${ano}-${mm}-${dia}`;
  }
  // "dd/mm/yyyy" ou "dd/mm/yy"
  const m2 = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m2) {
    const [, d, mo, y] = m2;
    const fy = y.length===2 ? "20"+y : y;
    return `${fy}-${mo.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  return null;
}

function _normStatus(val) {
  if (!val) return "EM ANDAMENTO";
  const s = String(val).trim().toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  if (s.includes("ENTREGUE") && !s.includes("NAO") && !s.includes("NÃO")) return "ENTREGUE";
  if (s.includes("ANDAMENTO")) return "EM ANDAMENTO";
  if (s.includes("CANCELADA") || s.includes("CANCELADO")) return "CANCELADA";
  if (s.includes("NAO") || s.includes("NÃO") || s.includes("N_O")) return "NÃO ENTREGUE";
  return "EM ANDAMENTO";
}

function _normSetor(val) {
  if (!val) return null;
  const s = String(val).trim().toUpperCase();
  if (s.includes("ESTRAT")) return "ESTRATÉGICO";
  if (s.includes("OPER"))   return "OPERACIONAL";
  return null;
}

function _normInt(val) {
  if (val === null || val === undefined || val === "" || val === "-") return 0;
  const n = parseInt(String(val).replace(/[^0-9]/g,""), 10);
  return isNaN(n) ? 0 : n;
}

// Detecta a linha do cabeçalho procurando por "MÊS" ou "MES"
function _findHeaderRow(sheet, XLSX) {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  for (let r = range.s.r; r <= Math.min(range.s.r + 15, range.e.r); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && /M[EÊ]S/i.test(String(cell.v || ""))) return r;
    }
  }
  return null;
}

/**
 * POST /api/rs/importar
 * Aceita um arquivo xlsx (download do Google Sheets) e importa os dados.
 * Query params:
 *   ?ano=2026      → ano de referência para normalizar meses sem ano (default: ano atual)
 *   ?modo=append   → adiciona sem verificar duplicatas
 *   ?modo=skip     → ignora linhas que já existem (default)
 */
const importarPlanilha = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: "Não autorizado" });
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });

  const ano  = parseInt(req.query.ano) || new Date().getFullYear();
  const modo = req.query.modo || "skip";

  try {
    const XLSX      = require("xlsx");
    const workbook  = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const sheetNames = workbook.SheetNames;

    let totalImportado = 0;
    let totalIgnorado  = 0;
    let totalErro      = 0;
    const detalhes = [];

    // Processar cada aba que contém dados operacionais ou estratégicos
    for (const nomAba of sheetNames) {
      // Pular abas de dashboard/tabelas/gráficos
      const nomUpper = nomAba.toUpperCase();
      if (nomUpper.includes("DASHBOARD") || nomUpper.includes("TABELA") ||
          nomUpper.includes("GRAFICO") || nomUpper.includes("GRÁFICO") ||
          nomUpper === "HOME" || nomUpper === "COVER") {
        continue;
      }

      // Determinar setor pela aba (ex: "JULHO OPERACIONAL", "AGOSTO ESTRATÉGICO")
      let setorAba = null;
      if (nomUpper.includes("OPER"))   setorAba = "OPERACIONAL";
      if (nomUpper.includes("ESTRAT")) setorAba = "ESTRATÉGICO";

      const sheet = workbook.Sheets[nomAba];
      if (!sheet || !sheet["!ref"]) continue;

      const headerRow = _findHeaderRow(sheet, XLSX);
      if (headerRow === null) {
        detalhes.push({ aba: nomAba, status: "pulada — sem cabeçalho detectado" });
        continue;
      }

      // Ler dados a partir do cabeçalho
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: null, range: headerRow });
      if (!raw || raw.length === 0) continue;

      // Mapear nomes de colunas (podem ter acentos ou espaços diferentes)
      const colMap = (row) => {
        const result = {};
        for (const [k, v] of Object.entries(row)) {
          const ku = k.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
          result[ku] = v;
        }
        return result;
      };

      let importadosAba = 0;
      let ignoradosAba  = 0;

      for (const rawRow of raw) {
        const row = colMap(rawRow);

        // Pular linha de TOTAL e linhas completamente vazias
        const primeiroVal = String(Object.values(rawRow)[0] || "").trim().toUpperCase();
        if (primeiroVal === "TOTAL" || primeiroVal === "MES" || primeiroVal === "MÊS") continue;

        // Extrair mes
        const mesRaw = row["MES"] ?? row["MES REFERENCIA"] ?? null;
        const mes_referencia = _normMes(mesRaw, ano);
        if (!mes_referencia) { totalIgnorado++; ignoradosAba++; continue; }

        // Site e setor
        const site = String(row["SITE"] || "").trim().toUpperCase() || null;
        if (!site) { totalIgnorado++; ignoradosAba++; continue; }

        // Setor: usar da aba ou da coluna
        const setorColuna = _normSetor(row["SETOR"]);
        const setor       = setorColuna || setorAba;
        if (!setor) { totalIgnorado++; ignoradosAba++; continue; }

        // Produto
        const produto = String(row["PRODUTO"] ?? row["CLIENTE"] ?? "").trim().toUpperCase();
        if (!produto) { totalIgnorado++; ignoradosAba++; continue; }

        // Status
        const status = _normStatus(row["STATUS"]);

        // Datas
        const data_recebimento     = _normDate(row["DATA RECEBIMENTO RP"] ?? row["DATA RECEBIMENTO"], ano);
        const inicio_av_tecnica    = setor==="OPERACIONAL" ? _normDate(row["INICIO DA AV TECNICA"] ?? row["INICIO AV TECNICA"], ano) : null;
        const final_av_tecnica     = setor==="OPERACIONAL" ? _normDate(row["FINAL DA AV TECNICA"]  ?? row["FINAL AV TECNICA"],  ano) : null;
        const data_fechamento_vaga = setor==="ESTRATÉGICO"  ? _normDate(row["DATA FECHAMENTO DA VAGA"] ?? row["DATA FECHAMENTO VAGA"], ano) : null;

        // Cargo (só ESTRATÉGICO)
        const cargo = setor==="ESTRATÉGICO" ? (String(row["CARGO"]||"").trim().toUpperCase()||null) : null;

        // Chamado
        const chamado = String(row["CHAMADO"]??row["N CHAMADO"]??"").trim()||null;

        // HC's
        const hcs           = _normInt(row["HCS"] ?? row["HC'S"] ?? row["HCS SOLICITADOS"]);
        const hcs_com_to    = _normInt(row["HCS COM TO"] ?? row["HC'S COM TO"]);
        const hcs_aprovados = _normInt(row["HCS APROVADOS"] ?? row["HC'S APROVADOS"]);
        const qtd_entregue  = _normInt(row["QTD ENTREGUE"] ?? row["ENTREGUE"]);

        // Verificar duplicata (modo skip)
        if (modo === "skip") {
          const [[exists]] = await db.query(
            `SELECT id FROM rps WHERE empresa_id=? AND mes_referencia=? AND site=? AND setor=?
             AND produto=? AND COALESCE(chamado,'')=? LIMIT 1`,
            [empresa_id, mes_referencia, site, setor, produto, chamado||""]
          );
          if (exists) { totalIgnorado++; ignoradosAba++; continue; }
        }

        try {
          await db.query(
            `INSERT INTO rps (empresa_id, mes_referencia, site, setor, chamado, produto, cargo,
               data_recebimento, status, inicio_av_tecnica, final_av_tecnica, data_fechamento_vaga,
               hcs, hcs_com_to, hcs_aprovados, qtd_entregue, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [empresa_id, mes_referencia, site, setor, chamado, produto, cargo,
             data_recebimento, status, inicio_av_tecnica, final_av_tecnica, data_fechamento_vaga,
             hcs, hcs_com_to, hcs_aprovados, qtd_entregue, req.user?.id||null]
          );
          await _upsertProduto(empresa_id, produto);
          totalImportado++; importadosAba++;
        } catch (rowErr) {
          console.error("[importar] erro na linha:", rowErr.message);
          totalErro++;
        }
      }

      detalhes.push({ aba: nomAba, importados: importadosAba, ignorados: ignoradosAba });
    }

    return res.json({
      ok: true,
      resumo: { total_importado: totalImportado, total_ignorado: totalIgnorado, total_erro: totalErro },
      detalhes,
    });
  } catch (err) {
    console.error("[rsController.importarPlanilha]", err);
    if (err.code === "MODULE_NOT_FOUND") return res.status(500).json({ error: "xlsx não instalado" });
    return res.status(500).json({ error: "Erro ao processar arquivo: " + err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 3 — GESTÃO DE USUÁRIOS R&S
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/rs/usuarios — lista usuários coordenador_rs e gestor_rs do tenant */
const listarUsuariosRS = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: "Não autorizado" });
  try {
    const [usuarios] = await db.query(
      `SELECT id, nome, email, perfil, ativo, created_at
       FROM usuarios
       WHERE empresa_id=? AND perfil IN ('coordenador_rs','gestor_rs')
       ORDER BY nome`,
      [empresa_id]
    );
    return res.json(usuarios);
  } catch (err) {
    console.error("[rsController.listarUsuariosRS]", err);
    return res.status(500).json({ error: "Erro ao listar usuários R&S" });
  }
};

/** POST /api/rs/usuarios — cria usuário coordenador_rs ou gestor_rs */
const criarUsuarioRS = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return res.status(401).json({ error: "Não autorizado" });

  const { nome, email, senha, perfil } = req.body;

  if (!nome || !email || !senha)
    return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios" });

  const perfilFinal = ["coordenador_rs","gestor_rs"].includes(perfil) ? perfil : "gestor_rs";

  try {
    // Verificar e-mail duplicado
    const [[exists]] = await db.query("SELECT id FROM usuarios WHERE email=? LIMIT 1", [email]);
    if (exists) return res.status(400).json({ error: "E-mail já cadastrado" });

    const hash = await bcrypt.hash(senha, 10);
    const [result] = await db.query(
      `INSERT INTO usuarios (empresa_id, nome, email, senha, perfil, ativo, troca_senha_obrigatoria)
       VALUES (?,?,?,?,?,1,0)`,
      [empresa_id, nome.trim(), email.trim().toLowerCase(), hash, perfilFinal]
    );
    return res.status(201).json({ id: result.insertId, message: "Usuário R&S criado com sucesso" });
  } catch (err) {
    console.error("[rsController.criarUsuarioRS]", err);
    return res.status(500).json({ error: "Erro ao criar usuário" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────────────────────

async function _upsertProduto(empresa_id, nome) {
  try {
    const nomeFinal = nome.trim().toUpperCase();
    const [[exists]] = await db.query("SELECT id FROM rs_produtos WHERE empresa_id=? AND nome=?", [empresa_id, nomeFinal]);
    if (!exists) await db.query("INSERT INTO rs_produtos (empresa_id, nome) VALUES (?,?)", [empresa_id, nomeFinal]);
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
  // Sprint 3
  importarPlanilha, listarUsuariosRS, criarUsuarioRS,
};
