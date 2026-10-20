// backend/src/controllers/rsController.js
// Sprint 1: CRUD + Sites + Produtos
// Sprint 2: Dashboard + Relatório + Exportação Excel
// Sprint 3: Importação de planilha histórica + Gestão de usuários R&S
// CommonJS — nunca usar import/export

const db      = require("../lib/db");
const { registrarAuditoria } = require("../services/auditoria");

const getEmpresaId = (req) => req.user?.empresa_id;

// Respostas de erro: mantém `error` (usado pelo front antigo) e acrescenta
// `message` (padrão do resto do portal). Detalhes técnicos nunca vão para o
// cliente — ficam só no log do servidor.
const erro = (res, status, msg, extra = {}) => res.status(status).json({ error: msg, message: msg, ...extra });

// ─────────────────────────────────────────────────────────────────────────────
// VALIDAÇÃO (auditoria 14/10/2026) — antes, criar/editar aceitavam qualquer
// texto em setor/status (o banco recusava com 500 genérico), números inválidos
// viravam 0 em silêncio e editar nem checava campos obrigatórios.
// ─────────────────────────────────────────────────────────────────────────────
const SETORES  = ["OPERACIONAL", "ESTRATÉGICO"];
const STATUSES = ["EM ANDAMENTO", "ENTREGUE", "NÃO ENTREGUE", "CANCELADA"];
const LIMITE_LISTA_MAX = 500;

function _soDataISO(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return undefined;
    const p = (n) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const t = String(v).trim();
  const m = t.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ].*)?$/);
  if (!m) return undefined;
  const ano = Number(m[1]); const mes = Number(m[2]); const dia = Number(m[3] || 1);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return undefined;
  return `${m[1]}-${m[2]}-${String(dia).padStart(2, "0")}`;
}

function _inteiro(v, campo, erros) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 100000) {
    erros.push(`${campo} deve ser um número inteiro entre 0 e 100000`);
    return 0;
  }
  return n;
}

function _texto(v, max, campo, erros, { obrigatorio = false } = {}) {
  const t = v === null || v === undefined ? "" : String(v).trim();
  if (!t) {
    if (obrigatorio) erros.push(`${campo} é obrigatório`);
    return null;
  }
  if (t.length > max) { erros.push(`${campo} deve ter no máximo ${max} caracteres`); return t.slice(0, max); }
  return t;
}

/** Valida o corpo completo de uma RP. Devolve { erros, dados }. */
function validarRP(b) {
  const erros = [];
  const mes = _soDataISO(b.mes_referencia);
  if (b.mes_referencia === undefined || b.mes_referencia === null || b.mes_referencia === "") erros.push("mes_referencia é obrigatório");
  else if (mes === undefined || mes === null) erros.push("mes_referencia inválido (use AAAA-MM)");

  const site    = _texto(b.site, 100, "site", erros, { obrigatorio: true });
  const produto = _texto(b.produto, 150, "produto", erros, { obrigatorio: true });

  const setorBruto = b.setor === undefined || b.setor === null ? "" : String(b.setor).trim().toUpperCase();
  const setor = setorBruto.includes("ESTRAT") ? "ESTRATÉGICO" : setorBruto.includes("OPER") ? "OPERACIONAL" : null;
  if (!setor) erros.push("setor deve ser OPERACIONAL ou ESTRATÉGICO");

  const statusBruto = b.status === undefined || b.status === null || b.status === "" ? "EM ANDAMENTO" : String(b.status).trim().toUpperCase();
  const status = STATUSES.find((x) => x === statusBruto) || null;
  if (!status) erros.push(`status deve ser um de: ${STATUSES.join(", ")}`);

  const datas = {};
  for (const campo of ["data_recebimento", "inicio_av_tecnica", "final_av_tecnica", "data_fechamento_vaga"]) {
    const d = _soDataISO(b[campo]);
    if (d === undefined) { erros.push(`${campo} inválida (use AAAA-MM-DD)`); datas[campo] = null; }
    else datas[campo] = d;
  }
  if (setor === "OPERACIONAL" && datas.inicio_av_tecnica && datas.final_av_tecnica && datas.final_av_tecnica < datas.inicio_av_tecnica)
    erros.push("final_av_tecnica não pode ser anterior a inicio_av_tecnica");

  const chamado = _texto(b.chamado, 200, "chamado", erros);
  const cargo   = _texto(b.cargo, 200, "cargo", erros);
  const obs     = _texto(b.observacoes, 5000, "observacoes", erros);
  const hcs           = _inteiro(b.hcs, "hcs", erros);
  const hcs_com_to    = _inteiro(b.hcs_com_to, "hcs_com_to", erros);
  const hcs_aprovados = _inteiro(b.hcs_aprovados, "hcs_aprovados", erros);
  const qtd_entregue  = _inteiro(b.qtd_entregue, "qtd_entregue", erros);

  // Campos que só existem para um dos setores são zerados no outro.
  const dados = {
    mes_referencia: mes ? `${mes.slice(0, 7)}-01` : null,
    site, setor, chamado, produto, status, observacoes: obs,
    cargo:                setor === "ESTRATÉGICO" ? cargo : null,
    data_fechamento_vaga: setor === "ESTRATÉGICO" ? datas.data_fechamento_vaga : null,
    inicio_av_tecnica:    setor === "OPERACIONAL" ? datas.inicio_av_tecnica : null,
    final_av_tecnica:     setor === "OPERACIONAL" ? datas.final_av_tecnica : null,
    data_recebimento: datas.data_recebimento,
    hcs, hcs_com_to, hcs_aprovados, qtd_entregue,
  };
  return { erros, dados };
}

const COLUNAS_RP = [
  "mes_referencia", "site", "setor", "chamado", "produto", "cargo", "data_recebimento", "status",
  "inicio_av_tecnica", "final_av_tecnica", "data_fechamento_vaga",
  "hcs", "hcs_com_to", "hcs_aprovados", "qtd_entregue", "observacoes",
];

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 1 — CRUD
// ─────────────────────────────────────────────────────────────────────────────

const listar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");

  const { mes, site, setor, status, produto } = req.query;
  // Teto no limite: antes um `?limit=999999` devolvia a tabela inteira.
  const limit  = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), LIMITE_LISTA_MAX);
  const page   = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;
  const params = [empresa_id];
  const conditions = ["r.empresa_id = ?"];

  if (mes && !/^\d{4}-\d{2}$/.test(String(mes))) return erro(res, 400, "Filtro mes inválido (use AAAA-MM)");
  if (mes)     { conditions.push("DATE_FORMAT(r.mes_referencia, '%Y-%m') = ?"); params.push(mes); }
  if (site)    { conditions.push("r.site = ?");          params.push(site); }
  if (setor)   { conditions.push("r.setor = ?");         params.push(setor); }
  if (status)  { conditions.push("r.status = ?");        params.push(status); }
  if (produto) { conditions.push("r.produto LIKE ?");    params.push(`%${produto}%`); }

  const where = conditions.join(" AND ");

  try {
    const [rps] = await db.query(
      `SELECT r.*, u.nome AS criado_por_nome,
              (SELECT COUNT(*) FROM rps_comentarios c WHERE c.rp_id = r.id) AS qtd_comentarios
       FROM rps r LEFT JOIN usuarios u ON r.created_by = u.id
       WHERE ${where}
       ORDER BY r.mes_referencia DESC, r.site, r.setor, r.produto
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM rps r WHERE ${where}`, params);
    const [[totais]]    = await db.query(
      `SELECT SUM(hcs) AS hcs, SUM(hcs_com_to) AS hcs_com_to,
              SUM(hcs_aprovados) AS hcs_aprovados, SUM(qtd_entregue) AS qtd_entregue
       FROM rps r WHERE ${where}`, params
    );
    return res.json({ rps, total, totais, page, limit });
  } catch (err) {
    console.error("[rsController.listar]", err);
    return erro(res, 500, "Erro ao listar RPs");
  }
};

const criar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");

  const { erros, dados } = validarRP(req.body || {});
  if (erros.length) return erro(res, 400, erros.join("; "), { erros });

  try {
    const [result] = await db.query(
      `INSERT INTO rps (empresa_id, ${COLUNAS_RP.join(", ")}, created_by)
       VALUES (?, ${COLUNAS_RP.map(() => "?").join(", ")}, ?)`,
      [empresa_id, ...COLUNAS_RP.map((c) => dados[c]), req.user?.id || null]
    );
    await _upsertProduto(empresa_id, dados.produto);
    registrarAuditoria({
      usuario: req.user, acao: "criar", entidade: "rp", entidadeId: result.insertId,
      resumo: `${req.user?.nome || "Alguém"} criou a RP ${dados.produto} · ${dados.site} · ${dados.mes_referencia.slice(0, 7)} (${dados.setor})`,
      dadosDepois: dados, ip: req.ip,
    });
    return res.status(201).json({ id: result.insertId, message: "RP criada com sucesso" });
  } catch (err) {
    console.error("[rsController.criar]", err);
    return erro(res, 500, "Erro ao criar RP");
  }
};

const detalhe = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  try {
    const [[rp]] = await db.query("SELECT * FROM rps WHERE id = ? AND empresa_id = ?", [req.params.id, empresa_id]);
    if (!rp) return erro(res, 404, "RP não encontrada");
    return res.json(rp);
  } catch (err) {
    console.error("[rsController.detalhe]", err);
    return erro(res, 500, "Erro ao buscar RP");
  }
};

const editar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  try {
    const [[antes]] = await db.query("SELECT * FROM rps WHERE id = ? AND empresa_id = ?", [req.params.id, empresa_id]);
    if (!antes) return erro(res, 404, "RP não encontrada");

    // Campo ausente no corpo mantém o valor atual; o conjunto final é validado.
    const corpo = req.body || {};
    const mesclado = {};
    for (const c of COLUNAS_RP) mesclado[c] = corpo[c] !== undefined ? corpo[c] : antes[c];
    const { erros, dados } = validarRP(mesclado);
    if (erros.length) return erro(res, 400, erros.join("; "), { erros });

    await db.query(
      `UPDATE rps SET ${COLUNAS_RP.map((c) => `${c}=?`).join(", ")}, updated_by=?
       WHERE id=? AND empresa_id=?`,
      [...COLUNAS_RP.map((c) => dados[c]), req.user?.id || null, req.params.id, empresa_id]
    );
    await _upsertProduto(empresa_id, dados.produto);
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "rp", entidadeId: Number(req.params.id),
      resumo: `${req.user?.nome || "Alguém"} editou a RP ${dados.produto} · ${dados.site} · ${dados.mes_referencia.slice(0, 7)}`,
      dadosAntes: antes, dadosDepois: dados, ip: req.ip,
    });
    return res.json({ message: "RP atualizada com sucesso" });
  } catch (err) {
    console.error("[rsController.editar]", err);
    return erro(res, 500, "Erro ao editar RP");
  }
};

const excluir = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  try {
    const [[antes]] = await db.query("SELECT * FROM rps WHERE id = ? AND empresa_id = ?", [req.params.id, empresa_id]);
    if (!antes) return erro(res, 404, "RP não encontrada");
    await db.query("DELETE FROM rps_comentarios WHERE rp_id=? AND empresa_id=?", [req.params.id, empresa_id]).catch(() => {});
    await db.query("DELETE FROM rps WHERE id=? AND empresa_id=?", [req.params.id, empresa_id]);
    registrarAuditoria({
      usuario: req.user, acao: "excluir", entidade: "rp", entidadeId: Number(req.params.id),
      resumo: `${req.user?.nome || "Alguém"} excluiu a RP ${antes.produto} · ${antes.site}`,
      dadosAntes: antes, ip: req.ip,
    });
    return res.json({ message: "RP excluída com sucesso" });
  } catch (err) {
    console.error("[rsController.excluir]", err);
    return erro(res, 500, "Erro ao excluir RP");
  }
};

const getSites = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  try {
    // Sites cadastrados + sites que já aparecem em RPs (ambiente novo sem seed
    // não fica com o seletor vazio).
    const [sites] = await db.query(
      `SELECT COALESCE(MIN(id), CONCAT('n:', nome)) AS id, nome FROM (
         SELECT id, nome FROM rs_sites WHERE empresa_id=? AND ativo=1
         UNION ALL
         SELECT NULL AS id, site AS nome FROM rps WHERE empresa_id=? AND site IS NOT NULL AND site <> ''
       ) x GROUP BY nome ORDER BY nome`,
      [empresa_id, empresa_id]
    );
    return res.json(sites);
  } catch (err) {
    console.error("[rsController.getSites]", err);
    return erro(res, 500, "Erro ao buscar sites");
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
  if (!mes || !/^\d{4}-\d{2}$/.test(String(mes))) return res.status(400).json({ error: "Parâmetro mes é obrigatório (AAAA-MM)", message: "Parâmetro mes é obrigatório (AAAA-MM)" });

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
  if (!mes || !/^\d{4}-\d{2}$/.test(String(mes))) return res.status(400).json({ error: "Parâmetro mes é obrigatório (AAAA-MM)", message: "Parâmetro mes é obrigatório (AAAA-MM)" });

  try {
    const { novoWorkbook, adicionarTabela, escreverTabela } = require("../lib/excelExport");
    const bw   = "empresa_id=? AND DATE_FORMAT(mes_referencia,'%Y-%m')=?";
    const [rpsOp] = await db.query(`SELECT * FROM rps WHERE ${bw} AND setor='OPERACIONAL' ORDER BY site, produto`, [empresa_id, mes]);
    const [rpsEs] = await db.query(`SELECT * FROM rps WHERE ${bw} AND setor LIKE 'ESTRAT%' ORDER BY site, cargo`, [empresa_id, mes]);

    const fm  = v => { if(!v) return ""; const m=["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"]; return m[new Date(v).getMonth()]; };
    const sum = (arr, f) => arr.reduce((s,r)=>s+(Number(r[f])||0), 0);

    const wb = novoWorkbook();

    const colunasOp = [
      { titulo: "MÊS", chave: "mes", largura: 12 },
      { titulo: "SITE", chave: "site", largura: 14 },
      { titulo: "SETOR", chave: "setor", largura: 14 },
      { titulo: "CHAMADO", chave: "chamado", largura: 12 },
      { titulo: "PRODUTO", chave: "produto", largura: 20 },
      { titulo: "DATA RECEBIMENTO RP", chave: "data_recebimento", largura: 16, formato: "data" },
      { titulo: "STATUS", chave: "status", largura: 16 },
      { titulo: "INICIO DA AV. TÉCNICA", chave: "inicio_av_tecnica", largura: 16, formato: "data" },
      { titulo: "FINAL DA AV. TECNICA", chave: "final_av_tecnica", largura: 16, formato: "data" },
      { titulo: "HC'S", chave: "hcs", largura: 8, formato: "inteiro" },
      { titulo: "HC'S COM TO", chave: "hcs_com_to", largura: 12, formato: "inteiro" },
      { titulo: "HC'S APROVADOS", chave: "hcs_aprovados", largura: 14, formato: "inteiro" },
      { titulo: "QTD ENTREGUE", chave: "qtd_entregue", largura: 13, formato: "inteiro" },
    ];
    adicionarTabela(wb, {
      nomeAba: "OPERACIONAL",
      colunas: colunasOp,
      linhas: rpsOp.map(r => ({
        mes: fm(r.mes_referencia), site: r.site, setor: r.setor, chamado: r.chamado || "", produto: r.produto,
        data_recebimento: r.data_recebimento, status: r.status,
        inicio_av_tecnica: r.inicio_av_tecnica, final_av_tecnica: r.final_av_tecnica,
        hcs: r.hcs, hcs_com_to: r.hcs_com_to, hcs_aprovados: r.hcs_aprovados, qtd_entregue: r.qtd_entregue,
      })),
      linhaTotal: {
        mes: "TOTAL",
        hcs: sum(rpsOp, "hcs"), hcs_com_to: sum(rpsOp, "hcs_com_to"),
        hcs_aprovados: sum(rpsOp, "hcs_aprovados"), qtd_entregue: sum(rpsOp, "qtd_entregue"),
      },
    });

    const colunasEs = [
      { titulo: "MÊS", chave: "mes", largura: 12 },
      { titulo: "SITE", chave: "site", largura: 14 },
      { titulo: "SETOR", chave: "setor", largura: 14 },
      { titulo: "CHAMADO", chave: "chamado", largura: 12 },
      { titulo: "PRODUTO", chave: "produto", largura: 20 },
      { titulo: "CARGO", chave: "cargo", largura: 20 },
      { titulo: "DATA RECEBIMENTO RP", chave: "data_recebimento", largura: 16, formato: "data" },
      { titulo: "STATUS", chave: "status", largura: 16 },
      { titulo: "DATA FECHAMENTO DA VAGA", chave: "data_fechamento_vaga", largura: 18, formato: "data" },
      { titulo: "HC'S", chave: "hcs", largura: 8, formato: "inteiro" },
      { titulo: "HC'S COM TO", chave: "hcs_com_to", largura: 12, formato: "inteiro" },
      { titulo: "HC'S APROVADOS", chave: "hcs_aprovados", largura: 14, formato: "inteiro" },
      { titulo: "QTD ENTREGUE", chave: "qtd_entregue", largura: 13, formato: "inteiro" },
    ];
    adicionarTabela(wb, {
      nomeAba: "ESTRATÉGICO",
      colunas: colunasEs,
      linhas: rpsEs.map(r => ({
        mes: fm(r.mes_referencia), site: r.site, setor: r.setor, chamado: r.chamado || "", produto: r.produto, cargo: r.cargo || "",
        data_recebimento: r.data_recebimento, status: r.status, data_fechamento_vaga: r.data_fechamento_vaga,
        hcs: r.hcs, hcs_com_to: r.hcs_com_to, hcs_aprovados: r.hcs_aprovados, qtd_entregue: r.qtd_entregue,
      })),
      linhaTotal: {
        mes: "TOTAL",
        hcs: sum(rpsEs, "hcs"), hcs_com_to: sum(rpsEs, "hcs_com_to"),
        hcs_aprovados: sum(rpsEs, "hcs_aprovados"), qtd_entregue: sum(rpsEs, "qtd_entregue"),
      },
    });

    // Aba "DASHBOARD": três mini-tabelas empilhadas na mesma planilha (por
    // site, operacional por produto, estratégico por cargo) — mantém o
    // mesmo layout de sempre, só com o cabeçalho/números formatados.
    const siteCount={};
    [...rpsOp,...rpsEs].forEach(r=>{siteCount[r.site]=(siteCount[r.site]||0)+1;});
    const prodMap={};
    rpsOp.forEach(r=>{if(!prodMap[r.produto])prodMap[r.produto]={hcs:0,ha:0,qe:0};prodMap[r.produto].hcs+=r.hcs||0;prodMap[r.produto].ha+=r.hcs_aprovados||0;prodMap[r.produto].qe+=r.qtd_entregue||0;});
    const cargoMap={};
    rpsEs.forEach(r=>{const c=r.cargo||"(sem cargo)";if(!cargoMap[c])cargoMap[c]={hcs:0,ha:0,qe:0};cargoMap[c].hcs+=r.hcs||0;cargoMap[c].ha+=r.hcs_aprovados||0;cargoMap[c].qe+=r.qtd_entregue||0;});

    const wsDash = wb.addWorksheet("DASHBOARD");
    wsDash.columns = [{ width: 26 }, { width: 16 }, { width: 16 }, { width: 14 }];
    wsDash.getCell(1, 1).value = `DASHBOARD — ${mes.replace("-", "/")}`;
    wsDash.getCell(1, 1).font = { bold: true, size: 14 };

    let linha = 3;
    linha = escreverTabela(wsDash, {
      startRow: linha,
      titulo: "POR SITE",
      colunas: [
        { titulo: "SITE", chave: "site" },
        { titulo: "TOTAL RPs", chave: "total", formato: "inteiro" },
      ],
      linhas: Object.entries(siteCount).map(([site, total]) => ({ site, total })),
    }) + 1;

    linha = escreverTabela(wsDash, {
      startRow: linha,
      titulo: "OPERACIONAL — POR PRODUTO",
      colunas: [
        { titulo: "PRODUTO", chave: "produto" },
        { titulo: "HC'S", chave: "hcs", formato: "inteiro" },
        { titulo: "HC'S APROVADOS", chave: "hcs_aprovados", formato: "inteiro" },
        { titulo: "QTD ENTREGUE", chave: "qtd_entregue", formato: "inteiro" },
      ],
      linhas: Object.entries(prodMap).map(([produto, v]) => ({ produto, hcs: v.hcs, hcs_aprovados: v.ha, qtd_entregue: v.qe })),
      linhaTotal: { produto: "TOTAL", hcs: sum(rpsOp, "hcs"), hcs_aprovados: sum(rpsOp, "hcs_aprovados"), qtd_entregue: sum(rpsOp, "qtd_entregue") },
    }) + 1;

    escreverTabela(wsDash, {
      startRow: linha,
      titulo: "ESTRATÉGICO — POR CARGO",
      colunas: [
        { titulo: "CARGO", chave: "cargo" },
        { titulo: "HC'S", chave: "hcs", formato: "inteiro" },
        { titulo: "HC'S APROVADOS", chave: "hcs_aprovados", formato: "inteiro" },
        { titulo: "QTD ENTREGUE", chave: "qtd_entregue", formato: "inteiro" },
      ],
      linhas: Object.entries(cargoMap).map(([cargo, v]) => ({ cargo, hcs: v.hcs, hcs_aprovados: v.ha, qtd_entregue: v.qe })),
      linhaTotal: { cargo: "TOTAL", hcs: sum(rpsEs, "hcs"), hcs_aprovados: sum(rpsEs, "hcs_aprovados"), qtd_entregue: sum(rpsEs, "qtd_entregue") },
    });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename="relatorio_rs_${mes.replace("-","_")}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (err) {
    console.error("[rsController.exportar]", err);
    if (err.code === "MODULE_NOT_FOUND") return res.status(500).json({ error: "exceljs não instalado — rodar: npm install exceljs" });
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
 *
 * Auditoria 14/10/2026: a importação agora é TUDO OU NADA (uma transação, em
 * lotes de 200 linhas) — antes, um erro no meio deixava a planilha pela
 * metade no banco. A chave de duplicata inclui cargo e data de recebimento
 * (antes era só mês/site/setor/produto/chamado, o que descartava como
 * "duplicadas" RPs diferentes sem número de chamado). Cada importação fica
 * registrada em Auditoria.
 */
const TAM_LOTE_IMPORT = 200;

function _chaveRP(r) {
  return [r.mes_referencia, r.site, r.setor, r.produto, r.chamado || "", r.cargo || "", r.data_recebimento || ""]
    .map((v) => String(v).toUpperCase()).join("|");
}

const importarPlanilha = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  if (!req.file) return erro(res, 400, "Nenhum arquivo enviado");

  const ano  = parseInt(req.query.ano, 10) || new Date().getFullYear();
  if (ano < 2000 || ano > 2100) return erro(res, 400, "Ano inválido");
  const modo = req.query.modo === "append" ? "append" : "skip";

  let conn;
  try {
    const XLSX      = require("xlsx");
    const workbook  = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });

    let totalIgnorado = 0;
    const detalhes = [];
    const novas = []; // linhas válidas, na ordem da planilha

    // ── 1) Ler e validar tudo em memória (nada é gravado ainda) ──────────────
    for (const nomAba of workbook.SheetNames) {
      const nomUpper = nomAba.toUpperCase();
      if (nomUpper.includes("DASHBOARD") || nomUpper.includes("TABELA") ||
          nomUpper.includes("GRAFICO") || nomUpper.includes("GRÁFICO") ||
          nomUpper === "HOME" || nomUpper === "COVER") {
        continue;
      }

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

      const raw = XLSX.utils.sheet_to_json(sheet, { defval: null, range: headerRow });
      if (!raw || raw.length === 0) continue;

      const colMap = (row) => {
        const result = {};
        for (const [k, v] of Object.entries(row)) {
          const ku = k.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g,"").trim();
          result[ku] = v;
        }
        return result;
      };

      let validasAba = 0;
      let ignoradosAba = 0;

      for (const rawRow of raw) {
        const row = colMap(rawRow);

        const primeiroVal = String(Object.values(rawRow)[0] || "").trim().toUpperCase();
        if (primeiroVal === "TOTAL" || primeiroVal === "MES" || primeiroVal === "MÊS") continue;

        const mes_referencia = _normMes(row["MES"] ?? row["MES REFERENCIA"] ?? null, ano);
        if (!mes_referencia) { totalIgnorado++; ignoradosAba++; continue; }

        const site = String(row["SITE"] || "").trim().toUpperCase().slice(0, 100) || null;
        if (!site) { totalIgnorado++; ignoradosAba++; continue; }

        const setor = _normSetor(row["SETOR"]) || setorAba;
        if (!setor) { totalIgnorado++; ignoradosAba++; continue; }

        const produto = String(row["PRODUTO"] ?? row["CLIENTE"] ?? "").trim().toUpperCase().slice(0, 150);
        if (!produto) { totalIgnorado++; ignoradosAba++; continue; }

        const data_recebimento = _normDate(row["DATA RECEBIMENTO RP"] ?? row["DATA RECEBIMENTO"], ano);
        const registro = {
          mes_referencia, site, setor, produto,
          status: _normStatus(row["STATUS"]),
          data_recebimento,
          inicio_av_tecnica:    setor==="OPERACIONAL" ? _normDate(row["INICIO DA AV TECNICA"] ?? row["INICIO AV TECNICA"], ano) : null,
          final_av_tecnica:     setor==="OPERACIONAL" ? _normDate(row["FINAL DA AV TECNICA"]  ?? row["FINAL AV TECNICA"],  ano) : null,
          data_fechamento_vaga: setor==="ESTRATÉGICO"  ? _normDate(row["DATA FECHAMENTO DA VAGA"] ?? row["DATA FECHAMENTO VAGA"], ano) : null,
          cargo:   setor==="ESTRATÉGICO" ? (String(row["CARGO"]||"").trim().toUpperCase().slice(0, 200)||null) : null,
          chamado: String(row["CHAMADO"]??row["N CHAMADO"]??"").trim().slice(0, 200)||null,
          hcs:           _normInt(row["HCS"] ?? row["HC'S"] ?? row["HCS SOLICITADOS"]),
          hcs_com_to:    _normInt(row["HCS COM TO"] ?? row["HC'S COM TO"]),
          hcs_aprovados: _normInt(row["HCS APROVADOS"] ?? row["HC'S APROVADOS"]),
          qtd_entregue:  _normInt(row["QTD ENTREGUE"] ?? row["ENTREGUE"]),
        };
        // Datas incoerentes na planilha: mantém a linha, mas sem o par inválido.
        if (registro.inicio_av_tecnica && registro.final_av_tecnica && registro.final_av_tecnica < registro.inicio_av_tecnica) {
          registro.final_av_tecnica = null;
        }
        novas.push(registro);
        validasAba++;
      }
      detalhes.push({ aba: nomAba, validas: validasAba, ignorados: ignoradosAba });
    }

    if (!novas.length && !totalIgnorado) {
      return erro(res, 400, "Nenhuma aba reconhecida na planilha (procurei uma linha de cabeçalho com a coluna MÊS). Confira se é a planilha de R&S.", { detalhes });
    }

    // ── 2) Remover duplicatas (contra o banco e dentro da própria planilha) ──
    let aInserir = novas;
    if (modo === "skip" && novas.length) {
      const [existentes] = await db.query(
        `SELECT DATE_FORMAT(mes_referencia, '%Y-%m-%d') AS mes_referencia, site, setor, produto, chamado, cargo,
                DATE_FORMAT(data_recebimento, '%Y-%m-%d') AS data_recebimento
         FROM rps WHERE empresa_id=?`,
        [empresa_id]
      );
      const vistos = new Set(existentes.map(_chaveRP));
      aInserir = [];
      for (const r of novas) {
        const k = _chaveRP(r);
        if (vistos.has(k)) { totalIgnorado++; continue; }
        vistos.add(k);
        aInserir.push(r);
      }
    }

    // ── 3) Gravar tudo ou nada ───────────────────────────────────────────────
    if (aInserir.length) {
      conn = await db.getConnection();
      await conn.beginTransaction();
      for (let i = 0; i < aInserir.length; i += TAM_LOTE_IMPORT) {
        const lote = aInserir.slice(i, i + TAM_LOTE_IMPORT);
        const valores = [];
        const marcadores = lote.map((r) => {
          valores.push(
            empresa_id, r.mes_referencia, r.site, r.setor, r.chamado, r.produto, r.cargo,
            r.data_recebimento, r.status, r.inicio_av_tecnica, r.final_av_tecnica, r.data_fechamento_vaga,
            r.hcs, r.hcs_com_to, r.hcs_aprovados, r.qtd_entregue, req.user?.id || null
          );
          return "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
        });
        await conn.query(
          `INSERT INTO rps (empresa_id, mes_referencia, site, setor, chamado, produto, cargo,
             data_recebimento, status, inicio_av_tecnica, final_av_tecnica, data_fechamento_vaga,
             hcs, hcs_com_to, hcs_aprovados, qtd_entregue, created_by)
           VALUES ${marcadores.join(",")}`,
          valores
        );
      }
      await conn.commit();
      conn.release();
      conn = null;
      for (const nome of new Set(aInserir.map((r) => r.produto))) await _upsertProduto(empresa_id, nome);
    }

    registrarAuditoria({
      usuario: req.user, acao: "importar", entidade: "rp", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} importou planilha de R&S: ${aInserir.length} RP(s) criada(s), ${totalIgnorado} ignorada(s) (ano ${ano}, modo ${modo}, arquivo ${String(req.file.originalname || "").slice(0, 80)})`,
      dadosDepois: { importadas: aInserir.length, ignoradas: totalIgnorado, ano, modo },
      ip: req.ip,
    });

    return res.json({
      ok: true,
      resumo: { total_importado: aInserir.length, total_ignorado: totalIgnorado, total_erro: 0 },
      detalhes,
    });
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); } catch (_) { /* ignora */ }
      conn.release();
    }
    console.error("[rsController.importarPlanilha]", err);
    // Sem err.message para o cliente: pode expor SQL e caminhos internos.
    return erro(res, 500, "Não foi possível importar a planilha. Nenhuma linha foi gravada — confira o arquivo e tente de novo.");
  }
};

// Gestão de usuários do R&S: a partir de 14/10/2026 é feita só em /api/usuarios
// (Gestão de Usuários), que já aplica o escopo restrito (lib/perfilScope.js),
// troca de senha obrigatória e vínculo de cliente. Os atalhos /api/rs/usuarios
// foram removidos.

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

// ─────────────────────────────────────────────────────────────────────────────
// COMENTÁRIOS DA RP (19/10/2026) — histórico de observações: cada comentário
// guarda autor, perfil e data/hora; nada é sobrescrito. Coordenador R&S e
// gestor R&S leem e comentam; apagar: o próprio autor ou o coordenador R&S.
// ─────────────────────────────────────────────────────────────────────────────

async function _rpDaEmpresa(rpId, empresa_id) {
  const [[rp]] = await db.query("SELECT id, produto, site FROM rps WHERE id = ? AND empresa_id = ?", [rpId, empresa_id]);
  return rp || null;
}

const listarComentarios = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  try {
    if (!(await _rpDaEmpresa(req.params.id, empresa_id))) return erro(res, 404, "RP não encontrada");
    const [rows] = await db.query(
      `SELECT id, rp_id, autor_id, autor_nome, autor_perfil, texto, created_at
         FROM rps_comentarios WHERE rp_id = ? AND empresa_id = ? ORDER BY created_at DESC, id DESC LIMIT 500`,
      [req.params.id, empresa_id]
    );
    return res.json({ comentarios: rows });
  } catch (err) {
    console.error("[rsController.listarComentarios]", err);
    return erro(res, 500, "Erro ao listar comentários");
  }
};

const criarComentario = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  const texto = String(req.body?.texto ?? "").trim();
  if (!texto) return erro(res, 400, "Escreva o comentário.");
  if (texto.length > 2000) return erro(res, 400, "O comentário pode ter no máximo 2000 caracteres.");
  try {
    const rp = await _rpDaEmpresa(req.params.id, empresa_id);
    if (!rp) return erro(res, 404, "RP não encontrada");
    const [r] = await db.query(
      `INSERT INTO rps_comentarios (empresa_id, rp_id, autor_id, autor_nome, autor_perfil, texto) VALUES (?,?,?,?,?,?)`,
      [empresa_id, rp.id, req.user?.id || null, String(req.user?.nome || "").slice(0, 150) || null,
       String(req.user?.perfil || "").slice(0, 40) || null, texto]
    );
    registrarAuditoria({
      usuario: req.user, acao: "criar", entidade: "rp_comentario", entidadeId: r.insertId,
      resumo: `${req.user?.nome || "Alguém"} comentou na RP ${rp.produto} · ${rp.site}`,
      dadosDepois: { rp_id: rp.id, texto }, ip: req.ip,
    });
    return res.status(201).json({ id: r.insertId, message: "Comentário registrado" });
  } catch (err) {
    console.error("[rsController.criarComentario]", err);
    return erro(res, 500, "Erro ao registrar comentário");
  }
};

const excluirComentario = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  try {
    const [[c]] = await db.query(
      "SELECT * FROM rps_comentarios WHERE id = ? AND rp_id = ? AND empresa_id = ?",
      [req.params.comentarioId, req.params.id, empresa_id]
    );
    if (!c) return erro(res, 404, "Comentário não encontrado");
    const perfil = String(req.user?.perfil || "").toLowerCase();
    if (perfil !== "coordenador_rs" && Number(c.autor_id) !== Number(req.user?.id)) {
      return erro(res, 403, "Só o autor ou o coordenador R&S pode apagar este comentário.");
    }
    await db.query("DELETE FROM rps_comentarios WHERE id = ? AND empresa_id = ?", [c.id, empresa_id]);
    registrarAuditoria({
      usuario: req.user, acao: "excluir", entidade: "rp_comentario", entidadeId: c.id,
      resumo: `${req.user?.nome || "Alguém"} apagou um comentário da RP #${c.rp_id}`, dadosAntes: c, ip: req.ip,
    });
    return res.json({ message: "Comentário apagado" });
  } catch (err) {
    console.error("[rsController.excluirComentario]", err);
    return erro(res, 500, "Erro ao apagar comentário");
  }
};

module.exports = {
  // Sprint 1
  listar, criar, detalhe, editar, excluir, getSites, getProdutos,
  listarComentarios, criarComentario, excluirComentario,
  // Sprint 2
  getDashboard, getRelatorio, exportar,
  // Sprint 3
  importarPlanilha,
};
