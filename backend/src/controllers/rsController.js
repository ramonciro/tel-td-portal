// backend/src/controllers/rsController.js
// Sprint 1: CRUD + Sites + Produtos
// Sprint 2: Dashboard + Relatório + Exportação Excel
// Sprint 3: Importação de planilha histórica + Gestão de usuários R&S
// CommonJS — nunca usar import/export

const db      = require("../lib/db");
const { registrarAuditoria } = require("../services/auditoria");
const rel     = require("../lib/rsRelatorios");
const { tituloPadrao, chaveNormal, listarSites, resolverSite } = require("../lib/rsPadrao");

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
function validarRP(b, { exigirDataRecebimento = false } = {}) {
  const erros = [];
  const mes = _soDataISO(b.mes_referencia);
  if (b.mes_referencia === undefined || b.mes_referencia === null || b.mes_referencia === "") erros.push("mes_referencia é obrigatório");
  else if (mes === undefined || mes === null) erros.push("mes_referencia inválido (use AAAA-MM)");

  // Grafia padrão (20/10/2026): inicial maiúscula em site, produto e cargo.
  const siteBruto    = _texto(b.site, 100, "site", erros, { obrigatorio: true });
  const produtoBruto = _texto(b.produto, 150, "produto", erros, { obrigatorio: true });
  const site    = siteBruto ? tituloPadrao(siteBruto) : siteBruto;
  const produto = produtoBruto ? tituloPadrao(produtoBruto) : produtoBruto;

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
  if (exigirDataRecebimento && !datas.data_recebimento) erros.push("Informe a data de recebimento da RP — sem ela o prazo (SLA) e as RPs atrasadas não são calculados");
  if (setor === "OPERACIONAL" && datas.inicio_av_tecnica && datas.final_av_tecnica && datas.final_av_tecnica < datas.inicio_av_tecnica)
    erros.push("final_av_tecnica não pode ser anterior a inicio_av_tecnica");

  const chamado = _texto(b.chamado, 200, "chamado", erros);
  const cargoBruto = _texto(b.cargo, 200, "cargo", erros);
  const cargo   = cargoBruto ? tituloPadrao(cargoBruto) : cargoBruto;
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

/**
 * Números que não fecham (decisão 20/10/2026: bloquear com mensagem clara).
 * RP CANCELADA não entra nos totais, então não é checada.
 */
function incoerencias(d) {
  if (d.status === "CANCELADA") return [];
  const msgs = [];
  if (d.hcs_aprovados > d.hcs)
    msgs.push(`HC'S aprovados (${d.hcs_aprovados}) não pode ser maior que HC'S solicitados (${d.hcs})`);
  if (d.qtd_entregue > d.hcs_aprovados)
    msgs.push(`Qtd entregue (${d.qtd_entregue}) não pode ser maior que HC'S aprovados (${d.hcs_aprovados})`);
  if (d.status === "ENTREGUE" && !(d.qtd_entregue > 0))
    msgs.push("RP com status ENTREGUE precisa ter Qtd entregue maior que zero");
  return msgs;
}

const COLUNAS_RP = [
  "mes_referencia", "site", "setor", "chamado", "produto", "cargo", "data_recebimento", "status",
  "inicio_av_tecnica", "final_av_tecnica", "data_fechamento_vaga",
  "hcs", "hcs_com_to", "hcs_aprovados", "qtd_entregue", "observacoes",
];

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 1 — CRUD
// ─────────────────────────────────────────────────────────────────────────────

// Filtros da lista de RPs (usados pela tela e pela exportação, para saírem iguais).
function _filtrosLista(q, empresa_id) {
  const { mes, site, setor, status, produto } = q;
  const params = [empresa_id];
  const conditions = ["r.empresa_id = ?", "r.excluido_em IS NULL"];
  if (mes && !/^\d{4}-\d{2}$/.test(String(mes))) return { erro: "Filtro mes inválido (use AAAA-MM)" };
  if (mes)     { conditions.push("DATE_FORMAT(r.mes_referencia, '%Y-%m') = ?"); params.push(mes); }
  if (site)    { conditions.push("r.site = ?");          params.push(site); }
  if (setor)   { conditions.push("r.setor = ?");         params.push(setor); }
  if (status)  { conditions.push("r.status = ?");        params.push(status); }
  if (produto) { conditions.push("r.produto LIKE ?");    params.push(`%${produto}%`); }
  return { where: conditions.join(" AND "), params };
}

const listar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");

  // Teto no limite: antes um `?limit=999999` devolvia a tabela inteira.
  // 20/10/2026: padrão 100 por página, com paginação na tela (antes cortava em 200 sem avisar).
  const limit  = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), LIMITE_LISTA_MAX);
  const limiteDias = Math.min(Math.max(parseInt(req.query.limite_dias, 10) || rel.LIMITE_DIAS_PADRAO, 1), 365);
  const page   = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const offset = (page - 1) * limit;
  const f = _filtrosLista(req.query, empresa_id);
  if (f.erro) return erro(res, 400, f.erro);
  const { where, params } = f;

  try {
    const [rps] = await db.query(
      `SELECT r.*, u.nome AS criado_por_nome,
              CASE WHEN r.status = 'EM ANDAMENTO'
                   THEN GREATEST(DATEDIFF(CURDATE(), COALESCE(r.data_recebimento, r.mes_referencia)), 0) END AS dias_aberto,
              (SELECT COUNT(*) FROM rps_comentarios c WHERE c.rp_id = r.id) AS qtd_comentarios
       FROM rps r LEFT JOIN usuarios u ON r.created_by = u.id
       WHERE ${where}
       ORDER BY r.mes_referencia DESC, r.site, r.setor, r.produto
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM rps r WHERE ${where}`, params);
    const [[totais]]    = await db.query(
      // RPs canceladas não entram nos totais de HC'S (mesma regra do Dashboard e do Relatório)
      `SELECT COALESCE(SUM(CASE WHEN status <> 'CANCELADA' THEN hcs ELSE 0 END),0) AS hcs,
              COALESCE(SUM(CASE WHEN status <> 'CANCELADA' THEN hcs_com_to ELSE 0 END),0) AS hcs_com_to,
              COALESCE(SUM(CASE WHEN status <> 'CANCELADA' THEN hcs_aprovados ELSE 0 END),0) AS hcs_aprovados,
              COALESCE(SUM(CASE WHEN status <> 'CANCELADA' THEN qtd_entregue ELSE 0 END),0) AS qtd_entregue
       FROM rps r WHERE ${where}`, params
    );
    const itens = rps.map((r) => ({
      ...r,
      dias_aberto: r.dias_aberto === null || r.dias_aberto === undefined ? null : Number(r.dias_aberto),
      atrasada: r.status === "EM ANDAMENTO" && Number(r.dias_aberto) > limiteDias,
      // Varredura 20/10/2026: marca RPs cujos números não fecham (vindas de
      // importação ou de antes da regra). Texto vazio = tudo certo.
      numeros_incoerentes: incoerencias({
        status: r.status, hcs: Number(r.hcs) || 0, hcs_aprovados: Number(r.hcs_aprovados) || 0, qtd_entregue: Number(r.qtd_entregue) || 0,
      }).join(" · "),
    }));
    return res.json({ rps: itens, total, totais, page, limit, paginas: Math.max(Math.ceil(total / limit), 1), limite_dias: limiteDias });
  } catch (err) {
    console.error("[rsController.listar]", err);
    return erro(res, 500, "Erro ao listar RPs");
  }
};

const criar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");

  // Data de recebimento é obrigatória nas RPs novas (20/10/2026): sem ela o SLA não calcula.
  const { erros, dados } = validarRP(req.body || {}, { exigirDataRecebimento: true });
  if (!erros.length) erros.push(...incoerencias(dados));

  try {
    // Site precisa existir no cadastro (ou já aparecer em RPs): evita variações e erros de digitação.
    if (!erros.length) {
      const siteCanon = await resolverSite(empresa_id, dados.site);
      if (!siteCanon) erros.push(`O site "${dados.site}" não está cadastrado. Cadastre-o em Configurações R&S > Sites e tente de novo`);
      else dados.site = siteCanon;
    }
    if (erros.length) return erro(res, 400, erros.join("; "), { erros });

    // Aviso de RP parecida (mesmo mês, site, setor, produto, chamado, cargo e data de recebimento).
    // Responde 200 com precisa_confirmar para a tela perguntar; reenviar com confirmar_duplicada=true grava.
    if (!req.body?.confirmar_duplicada) {
      const [parecidas] = await db.query(
        `SELECT id, site, produto, cargo, chamado, status, hcs,
                DATE_FORMAT(mes_referencia, '%Y-%m') AS mes, DATE_FORMAT(data_recebimento, '%Y-%m-%d') AS data_recebimento
           FROM rps
          WHERE empresa_id = ? AND excluido_em IS NULL
            AND DATE_FORMAT(mes_referencia, '%Y-%m') = ? AND site = ? AND setor = ? AND produto = ?
            AND COALESCE(chamado, '') = ? AND COALESCE(cargo, '') = ? AND data_recebimento <=> ?
          ORDER BY id LIMIT 5`,
        [empresa_id, dados.mes_referencia.slice(0, 7), dados.site, dados.setor, dados.produto,
         dados.chamado || "", dados.cargo || "", dados.data_recebimento]
      );
      if (parecidas.length) {
        return res.json({
          precisa_confirmar: true, duplicadas: parecidas,
          message: "Já existe uma RP com o mesmo mês, site, setor, produto, chamado, cargo e data de recebimento.",
        });
      }
    }

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
    const [[rp]] = await db.query("SELECT * FROM rps WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL", [req.params.id, empresa_id]);
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
    const [[antes]] = await db.query("SELECT * FROM rps WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL", [req.params.id, empresa_id]);
    if (!antes) return erro(res, 404, "RP não encontrada");

    // Campo ausente no corpo mantém o valor atual; o conjunto final é validado.
    const corpo = req.body || {};
    const mesclado = {};
    for (const c of COLUNAS_RP) mesclado[c] = corpo[c] !== undefined ? corpo[c] : antes[c];
    const { erros, dados } = validarRP(mesclado, { exigirDataRecebimento: true });
    // Números incoerentes só travam se esta edição mexeu neles — assim uma RP antiga
    // que já estava inconsistente ainda pode ter observação, datas etc. corrigidas.
    const mexeuNosNumeros = ["hcs", "hcs_aprovados", "qtd_entregue", "status"].some(
      (c) => String(dados[c] ?? "") !== String(antes[c] ?? "")
    );
    if (!erros.length && mexeuNosNumeros) erros.push(...incoerencias(dados));
    if (!erros.length) {
      const siteCanon = await resolverSite(empresa_id, dados.site);
      if (siteCanon) dados.site = siteCanon;
      else if (chaveNormal(dados.site) !== chaveNormal(antes.site))
        erros.push(`O site "${dados.site}" não está cadastrado. Cadastre-o em Configurações R&S > Sites e tente de novo`);
    }
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
    const [[antes]] = await db.query("SELECT * FROM rps WHERE id = ? AND empresa_id = ? AND excluido_em IS NULL", [req.params.id, empresa_id]);
    if (!antes) return erro(res, 404, "RP não encontrada");
    // Lixeira (20/10/2026): a RP some das telas e dos relatórios, mas pode ser restaurada em até 30 dias.
    // Comentários ficam guardados junto; a purga (gestão de lixeira) apaga de vez depois do prazo.
    await db.query("UPDATE rps SET excluido_em = NOW(), excluido_por = ? WHERE id = ? AND empresa_id = ?", [req.user?.id || null, req.params.id, empresa_id]);
    registrarAuditoria({
      usuario: req.user, acao: "excluir", entidade: "rp", entidadeId: Number(req.params.id),
      resumo: `${req.user?.nome || "Alguém"} enviou para a lixeira a RP ${antes.produto} · ${antes.site}`,
      dadosAntes: antes, ip: req.ip,
    });
    return res.json({ message: "RP enviada para a lixeira. Dá para restaurar por 30 dias." });
  } catch (err) {
    console.error("[rsController.excluir]", err);
    return erro(res, 500, "Erro ao excluir RP");
  }
};

const getSites = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  try {
    // Sites cadastrados (ativos) + sites que já aparecem em RPs, sem repetir variações
    // de maiúsculas/acentos ("SALVADOR" e "Salvador" viram um só).
    const sites = await listarSites(empresa_id);
    return res.json(sites.map((s) => ({ id: s.id || `n:${s.nome}`, nome: s.nome })));
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
      `SELECT nome FROM rs_produtos WHERE empresa_id=? AND ativo=1 ${q ? "AND nome LIKE ?" : ""} ORDER BY nome LIMIT 60`,
      q ? [empresa_id, `%${q}%`] : [empresa_id]
    );
    const vistos = new Set();
    const nomes = [];
    for (const r of rows) {
      const k = chaveNormal(r.nome);
      if (vistos.has(k)) continue;
      vistos.add(k);
      nomes.push(tituloPadrao(r.nome));
    }
    return res.json(nomes.slice(0, 30));
  } catch (err) {
    console.error("[rsController.getProdutos]", err);
    return res.status(500).json({ error: "Erro ao buscar produtos" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SPRINT 2 — ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

// Cálculo único em lib/rsRelatorios.js — Dashboard, Relatório e Excel usam as mesmas funções,
// então tela e planilha nunca divergem. Regras de negócio estão descritas no topo daquele arquivo.

const MESES_NOME = ["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];
const rotuloMes = (ym) => (ym && /^\d{4}-\d{2}$/.test(ym) ? `${MESES_NOME[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}` : "");

/** Mantém as chaves antigas (total_hcs etc.) ao lado das novas, para telas antigas não quebrarem durante o deploy. */
function _comLegado(k) {
  return { ...k, total_hcs: k.hcs, total_hcs_to: k.hcs_com_to, total_hcs_aprovados: k.hcs_aprovados, total_entregue: k.qtd_entregue };
}

/** Período da requisição; sem período, usa o último mês com RPs (ou o mês atual). */
async function _periodoDaRequisicao(empresa_id, query) {
  const lido = rel.lerPeriodo(query, { obrigatorio: false });
  if (lido.erro) return lido;
  if (lido.periodo) return lido;
  const [[r]] = await db.query("SELECT DATE_FORMAT(MAX(mes_referencia), '%Y-%m') AS ym FROM rps WHERE empresa_id = ?", [empresa_id]);
  const hoje = new Date();
  const ym = r?.ym || `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  return { periodo: { de: ym, ate: ym, meses: 1 } };
}

const getDashboard = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  try {
    const lido = await _periodoDaRequisicao(empresa_id, req.query);
    if (lido.erro) return erro(res, 400, lido.erro);
    const filtros = rel.lerFiltros(req.query);
    const periodo = lido.periodo;

    const vazio = rel.vazio();
    const [r, tend, kOp, kEs] = await Promise.all([
      rel.montarRelatorio(empresa_id, periodo, filtros),
      rel.tendencia(empresa_id, periodo.ate, filtros, 6),
      filtros.setor === "ESTRATÉGICO" ? vazio : rel.kpis(empresa_id, periodo, { ...filtros, setor: "OPERACIONAL" }),
      filtros.setor === "OPERACIONAL" ? vazio : rel.kpis(empresa_id, periodo, { ...filtros, setor: "ESTRATÉGICO" }),
    ]);

    const st = (nome) => r.por_status.find((s) => s.status === nome) || { total: 0, pct: 0 };
    const stat = (nome) => ({ count: st(nome).total, pct: st(nome).pct });
    const { todos, ...emAberto } = r.em_aberto;
    const setorLegado = (k) => ({ rps: k.total_rps, hcs: k.hcs, hcs_aprovados: k.hcs_aprovados, qtd_entregue: k.qtd_entregue, ...k });

    return res.json({
      // chaves antigas
      total_rps: r.kpis.total_rps, total_hcs: r.kpis.hcs,
      total_hcs_aprovados: r.kpis.hcs_aprovados, total_entregue: r.kpis.qtd_entregue,
      por_status: {
        entregue: stat("ENTREGUE"), em_andamento: stat("EM ANDAMENTO"),
        cancelada: stat("CANCELADA"), nao_entregue: stat("NÃO ENTREGUE"),
      },
      operacional: setorLegado(kOp), estrategico: setorLegado(kEs),
      por_site: r.por_site.map((s) => ({ site: s.rotulo, ...s })),
      top_produtos: r.por_produto.slice(0, 5).map((p) => ({ produto: p.rotulo, ...p })),
      // novas
      periodo: r.periodo, filtros: r.filtros,
      kpis: _comLegado(r.kpis), anterior: r.anterior, variacao: r.variacao, acumulado_ano: r.acumulado_ano,
      status_lista: r.por_status,
      top_cargos: r.por_cargo.slice(0, 5).map((c) => ({ cargo: c.rotulo, ...c })),
      tendencia: tend, sla: r.sla, em_aberto: emAberto,
    });
  } catch (err) {
    console.error("[rsController.getDashboard]", err);
    return erro(res, 500, "Erro ao gerar dashboard");
  }
};

const getRelatorio = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  const lido = rel.lerPeriodo(req.query, { obrigatorio: true });
  if (lido.erro) return erro(res, 400, lido.erro);
  const filtros = rel.lerFiltros(req.query);
  try {
    const r = await rel.montarRelatorio(empresa_id, lido.periodo, filtros);
    const { todos, ...emAberto } = r.em_aberto;
    return res.json({
      periodo: r.periodo, filtros: r.filtros,
      kpis: _comLegado(r.kpis), anterior: r.anterior, variacao: r.variacao, acumulado_ano: r.acumulado_ano,
      por_status: r.por_status,
      por_site: r.por_site.map((s) => ({ site: s.rotulo, ...s })),
      por_produto: r.por_produto.map((p) => ({ produto: p.rotulo, ...p })),
      por_cargo: r.por_cargo.map((c) => ({ cargo: c.rotulo, ...c })),
      por_mes: r.por_mes, sla: r.sla, em_aberto: emAberto,
    });
  } catch (err) {
    console.error("[rsController.getRelatorio]", err);
    return erro(res, 500, "Erro ao gerar relatório");
  }
};

const exportar = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  const lido = rel.lerPeriodo(req.query, { obrigatorio: true });
  if (lido.erro) return erro(res, 400, lido.erro);
  const filtros = rel.lerFiltros(req.query);
  const periodo = lido.periodo;

  try {
    const { novoWorkbook, adicionarTabela, escreverTabela, escreverCelula, estilizarCabecalho } = require("../lib/excelExport");
    const r = await rel.montarRelatorio(empresa_id, periodo, filtros);

    // RPs do período (respeitando site/setor) — com comentários, para o Excel levar o histórico junto.
    const { where, params } = rel.montarWhere(empresa_id, periodo, filtros, "r");
    const [rps] = await db.query(
      `SELECT r.*, DATE_FORMAT(r.mes_referencia, '%Y-%m') AS mes_ym,
              DATEDIFF(r.final_av_tecnica, r.data_recebimento) AS dias_op,
              DATEDIFF(r.data_fechamento_vaga, r.data_recebimento) AS dias_es
         FROM rps r WHERE ${where} ORDER BY r.mes_referencia, r.site, r.produto, r.id`, params);
    const comentariosPorRp = new Map();
    if (rps.length) {
      const ids = rps.map((x) => x.id);
      const [coms] = await db.query(
        `SELECT rp_id, autor_nome, texto, created_at FROM rps_comentarios
          WHERE empresa_id = ? AND rp_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at, id`,
        [empresa_id, ...ids]).catch(() => [[]]);
      for (const c of coms) {
        const d = c.created_at ? new Date(c.created_at) : null;
        const ds = d && !isNaN(d) ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : "";
        const linha = `${ds} ${c.autor_nome || ""}: ${c.texto}`.trim();
        if (!comentariosPorRp.has(c.rp_id)) comentariosPorRp.set(c.rp_id, []);
        comentariosPorRp.get(c.rp_id).push(linha);
      }
    }

    const ativas = (arr) => arr.filter((x) => x.status !== "CANCELADA");
    const sum = (arr, f) => ativas(arr).reduce((s, x) => s + (Number(x[f]) || 0), 0);
    const nomeSetor = filtros.setor || "Todos";
    const nomePeriodo = periodo.meses === 1 ? rotuloMes(periodo.de) : `${rotuloMes(periodo.de)} a ${rotuloMes(periodo.ate)}`;
    const wb = novoWorkbook();

    // ───────────── RESUMO ─────────────
    const ws = wb.addWorksheet("RESUMO");
    ws.columns = [{ width: 30 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 22 }, { width: 14 }];
    ws.getCell(1, 1).value = "RELATÓRIO R&S — RESUMO EXECUTIVO";
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.getCell(2, 1).value = `Período: ${nomePeriodo}   |   Site: ${filtros.site || "Todos"}   |   Setor: ${nomeSetor}`;
    ws.getCell(3, 1).value = "RPs canceladas não entram nos totais de HC'S. Taxas = sobre HC'S solicitados. Comparativo = período anterior de mesma duração.";
    ws.getCell(3, 1).font = { italic: true, color: { argb: "FF64748B" } };

    let linha = 5;
    const cab = ["INDICADOR", nomePeriodo, `ANTERIOR (${rotuloMes(r.anterior.periodo.de)}${periodo.meses > 1 ? " a " + rotuloMes(r.anterior.periodo.ate) : ""})`, "VARIAÇÃO", `ACUMULADO ${periodo.ate.slice(0, 4)}`];
    cab.forEach((t, i) => { ws.getCell(linha, i + 1).value = t; });
    estilizarCabecalho(ws, linha, cab.length);
    linha += 1;
    const K = r.kpis, A = r.anterior.kpis, Y = r.acumulado_ano.kpis, V = r.variacao;
    const linhasKpi = [
      ["RPs recebidas", "total_rps", "inteiro", "pct"],
      ["HC'S solicitados", "hcs", "inteiro", "pct"],
      ["Meta com reserva", "hcs_com_to", "inteiro", null],
      ["HC'S aprovados", "hcs_aprovados", "inteiro", "pct"],
      ["HC'S entregues", "qtd_entregue", "inteiro", "pct"],
      ["Vagas pendentes (RPs em andamento)", "pendentes", "inteiro", "pct"],
      ["Vagas não atendidas (RPs não entregues)", "nao_atendidas", "inteiro", null],
      ["Taxa de aprovação", "taxa_aprovacao", "percentual", "pp"],
      ["Taxa de entrega", "taxa_entrega", "percentual", "pp"],
    ];
    for (const [rot, chave, fmt, tipoVar] of linhasKpi) {
      ws.getCell(linha, 1).value = rot;
      escreverCelula(ws, linha, 2, K[chave], fmt);
      escreverCelula(ws, linha, 3, A[chave], fmt);
      if (tipoVar === "pct") {
        const c = escreverCelula(ws, linha, 4, V[chave], "percentual");
        if (V[chave] === null || V[chave] === undefined) c.value = "—";
      } else if (tipoVar === "pp") {
        const c = ws.getCell(linha, 4);
        c.value = V[chave] === null || V[chave] === undefined ? "—" : `${V[chave] > 0 ? "+" : ""}${V[chave].toFixed(1).replace(".", ",")} pp`;
      } else ws.getCell(linha, 4).value = "—";
      escreverCelula(ws, linha, 5, Y[chave], fmt);
      linha += 1;
    }
    linha += 1;

    linha = escreverTabela(ws, {
      startRow: linha, titulo: "SITUAÇÃO DAS RPs",
      colunas: [{ titulo: "STATUS", chave: "status" }, { titulo: "RPs", chave: "total", formato: "inteiro" }, { titulo: "% DAS RPs", chave: "pct", formato: "percentual" }],
      linhas: r.por_status.map((s) => ({ status: s.status, total: s.total, pct: s.pct })),
    }) + 1;

    linha = escreverTabela(ws, {
      startRow: linha, titulo: `PRAZO MÉDIO (dias corridos, só RPs com as duas datas)`,
      colunas: [{ titulo: "SETOR / ETAPA", chave: "etapa" }, { titulo: "DIAS (MÉDIA)", chave: "dias", formato: "decimal1" }, { titulo: "RPs CONSIDERADAS", chave: "n", formato: "inteiro" }],
      linhas: [
        { etapa: "Operacional: recebimento → início da av. técnica", dias: r.sla.operacional.ate_inicio, n: r.sla.operacional.n },
        { etapa: "Operacional: recebimento → final da av. técnica", dias: r.sla.operacional.dias_medio, n: r.sla.operacional.n },
        { etapa: "Estratégico: recebimento → fechamento da vaga", dias: r.sla.estrategico.dias_medio, n: r.sla.estrategico.n },
      ],
    }) + 1;

    linha = escreverTabela(ws, {
      startRow: linha,
      titulo: `RPs EM ANDAMENTO: ${r.em_aberto.total} no total, ${r.em_aberto.atrasadas} atrasada(s) (mais de ${r.em_aberto.limite_dias} dias) — detalhe na aba EM ANDAMENTO`,
      colunas: [{ titulo: "INDICADOR", chave: "i" }, { titulo: "QTD", chave: "q", formato: "inteiro" }],
      linhas: [{ i: "Em andamento", q: r.em_aberto.total }, { i: "Atrasadas", q: r.em_aberto.atrasadas }],
    }) + 1;

    const colTaxas = (rotuloTitulo) => [
      { titulo: rotuloTitulo, chave: "rotulo" },
      { titulo: "RPs", chave: "total_rps", formato: "inteiro" },
      { titulo: "HC'S", chave: "hcs", formato: "inteiro" },
      { titulo: "APROVADOS", chave: "hcs_aprovados", formato: "inteiro" },
      { titulo: "ENTREGUES", chave: "qtd_entregue", formato: "inteiro" },
      { titulo: "TAXA ENTREGA", chave: "taxa_entrega", formato: "percentual" },
      { titulo: "PENDENTES", chave: "pendentes", formato: "inteiro" },
    ];
    const totalLinha = (rot, k) => ({ rotulo: rot, total_rps: k.total_rps, hcs: k.hcs, hcs_aprovados: k.hcs_aprovados, qtd_entregue: k.qtd_entregue, taxa_entrega: k.taxa_entrega, pendentes: k.pendentes });
    escreverTabela(ws, {
      startRow: linha, titulo: "POR SITE", colunas: colTaxas("SITE"),
      linhas: r.por_site, linhaTotal: totalLinha("TOTAL", K),
    });

    // ───────────── OPERACIONAL / ESTRATÉGICO ─────────────
    const rpsOp = rps.filter((x) => x.setor === "OPERACIONAL");
    const rpsEs = rps.filter((x) => String(x.setor).startsWith("ESTRAT"));
    const comuns = (x) => ({
      mes: rotuloMes(x.mes_ym), site: x.site, setor: x.setor, chamado: x.chamado || "", produto: x.produto,
      data_recebimento: x.data_recebimento, status: x.status,
      hcs: x.hcs, hcs_com_to: x.hcs_com_to, hcs_aprovados: x.hcs_aprovados, qtd_entregue: x.qtd_entregue,
      observacoes: x.observacoes || "", comentarios: (comentariosPorRp.get(x.id) || []).join("\n"),
    });
    const totais = (arr) => ({
      mes: "TOTAL (sem canceladas)", hcs: sum(arr, "hcs"), hcs_com_to: sum(arr, "hcs_com_to"),
      hcs_aprovados: sum(arr, "hcs_aprovados"), qtd_entregue: sum(arr, "qtd_entregue"),
    });
    const colFinais = [
      { titulo: "HC'S", chave: "hcs", largura: 8, formato: "inteiro" },
      { titulo: "META COM RESERVA", chave: "hcs_com_to", largura: 12, formato: "inteiro" },
      { titulo: "HC'S APROVADOS", chave: "hcs_aprovados", largura: 14, formato: "inteiro" },
      { titulo: "QTD ENTREGUE", chave: "qtd_entregue", largura: 13, formato: "inteiro" },
      { titulo: "OBSERVAÇÕES", chave: "observacoes", largura: 36 },
      { titulo: "COMENTÁRIOS", chave: "comentarios", largura: 60 },
    ];
    const colunasOp = [
      { titulo: "MÊS", chave: "mes", largura: 18 }, { titulo: "SITE", chave: "site", largura: 14 },
      { titulo: "SETOR", chave: "setor", largura: 14 }, { titulo: "CHAMADO", chave: "chamado", largura: 12 },
      { titulo: "PRODUTO", chave: "produto", largura: 20 },
      { titulo: "DATA RECEBIMENTO RP", chave: "data_recebimento", largura: 16, formato: "data" },
      { titulo: "STATUS", chave: "status", largura: 16 },
      { titulo: "INICIO DA AV. TÉCNICA", chave: "inicio_av_tecnica", largura: 16, formato: "data" },
      { titulo: "FINAL DA AV. TECNICA", chave: "final_av_tecnica", largura: 16, formato: "data" },
      { titulo: "DIAS ATÉ O FINAL", chave: "dias", largura: 12 },
      ...colFinais,
    ];
    adicionarTabela(wb, {
      nomeAba: "OPERACIONAL", colunas: colunasOp,
      linhas: rpsOp.map((x) => ({ ...comuns(x), inicio_av_tecnica: x.inicio_av_tecnica, final_av_tecnica: x.final_av_tecnica, dias: x.dias_op != null && x.dias_op >= 0 ? x.dias_op : "" })),
      linhaTotal: totais(rpsOp),
    });
    const colunasEs = [
      { titulo: "MÊS", chave: "mes", largura: 18 }, { titulo: "SITE", chave: "site", largura: 14 },
      { titulo: "SETOR", chave: "setor", largura: 14 }, { titulo: "CHAMADO", chave: "chamado", largura: 12 },
      { titulo: "PRODUTO", chave: "produto", largura: 20 }, { titulo: "CARGO", chave: "cargo", largura: 20 },
      { titulo: "DATA RECEBIMENTO RP", chave: "data_recebimento", largura: 16, formato: "data" },
      { titulo: "STATUS", chave: "status", largura: 16 },
      { titulo: "DATA FECHAMENTO DA VAGA", chave: "data_fechamento_vaga", largura: 18, formato: "data" },
      { titulo: "DIAS ATÉ O FECHAMENTO", chave: "dias", largura: 14 },
      ...colFinais,
    ];
    adicionarTabela(wb, {
      nomeAba: "ESTRATÉGICO", colunas: colunasEs,
      linhas: rpsEs.map((x) => ({ ...comuns(x), cargo: x.cargo || "", data_fechamento_vaga: x.data_fechamento_vaga, dias: x.dias_es != null && x.dias_es >= 0 ? x.dias_es : "" })),
      linhaTotal: totais(rpsEs),
    });
    for (const nome of ["OPERACIONAL", "ESTRATÉGICO"]) {
      for (const col of [15, 16]) wb.getWorksheet(nome).getColumn(col).alignment = { wrapText: true, vertical: "top" };
    }

    // ───────────── PRODUTOS E CARGOS ─────────────
    const wsPC = wb.addWorksheet("PRODUTOS E CARGOS");
    wsPC.columns = [{ width: 34 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 12 }];
    const colPC = (t) => [
      { titulo: t, chave: "rotulo" }, { titulo: "RPs", chave: "total_rps", formato: "inteiro" },
      { titulo: "HC'S", chave: "hcs", formato: "inteiro" }, { titulo: "COM RESERVA", chave: "hcs_com_to", formato: "inteiro" },
      { titulo: "APROVADOS", chave: "hcs_aprovados", formato: "inteiro" }, { titulo: "ENTREGUES", chave: "qtd_entregue", formato: "inteiro" },
      { titulo: "TAXA ENTREGA", chave: "taxa_entrega", formato: "percentual" }, { titulo: "PENDENTES", chave: "pendentes", formato: "inteiro" },
    ];
    const somaGrupo = (arr) => {
      const t = { total_rps: 0, hcs: 0, hcs_com_to: 0, hcs_aprovados: 0, qtd_entregue: 0, pendentes: 0 };
      arr.forEach((g) => Object.keys(t).forEach((c) => { t[c] += g[c]; }));
      t.taxa_entrega = t.hcs > 0 ? Math.round((t.qtd_entregue / t.hcs) * 1000) / 10 : null;
      return { rotulo: "TOTAL", ...t };
    };
    let l2 = escreverTabela(wsPC, { startRow: 1, titulo: "OPERACIONAL — POR PRODUTO", colunas: colPC("PRODUTO"), linhas: r.por_produto, linhaTotal: somaGrupo(r.por_produto) }) + 1;
    escreverTabela(wsPC, { startRow: l2, titulo: "ESTRATÉGICO — POR CARGO", colunas: colPC("CARGO"), linhas: r.por_cargo, linhaTotal: somaGrupo(r.por_cargo) });

    // ───────────── EM ANDAMENTO ─────────────
    adicionarTabela(wb, {
      nomeAba: "EM ANDAMENTO",
      colunas: [
        { titulo: "MÊS", chave: "mes", largura: 18 }, { titulo: "SITE", chave: "site", largura: 14 }, { titulo: "SETOR", chave: "setor", largura: 14 },
        { titulo: "CHAMADO", chave: "chamado", largura: 12 }, { titulo: "PRODUTO", chave: "produto", largura: 22 }, { titulo: "CARGO", chave: "cargo", largura: 20 },
        { titulo: "RECEBIMENTO", chave: "data_recebimento", largura: 14, formato: "data" },
        { titulo: "DIAS EM ABERTO", chave: "dias", largura: 14, formato: "inteiro" },
        { titulo: `ATRASADA (> ${r.em_aberto.limite_dias} DIAS)`, chave: "atrasada", largura: 20 },
        { titulo: "HC'S", chave: "hcs", largura: 8, formato: "inteiro" }, { titulo: "APROVADOS", chave: "hcs_aprovados", largura: 12, formato: "inteiro" },
        { titulo: "ENTREGUES", chave: "qtd_entregue", largura: 12, formato: "inteiro" }, { titulo: "PENDENTES", chave: "pendentes", largura: 12, formato: "inteiro" },
      ],
      linhas: r.em_aberto.todos.map((x) => ({ ...x, mes: rotuloMes(x.mes), cargo: x.cargo || "", atrasada: x.atrasada ? "SIM" : "" })),
      linhaTotal: null,
    });

    // ───────────── POR MÊS (só quando o período tem mais de um mês) ─────────────
    if (periodo.meses > 1) {
      adicionarTabela(wb, {
        nomeAba: "POR MÊS",
        colunas: [
          { titulo: "MÊS", chave: "mes", largura: 18 }, { titulo: "RPs", chave: "total_rps", formato: "inteiro" },
          { titulo: "HC'S", chave: "hcs", formato: "inteiro" }, { titulo: "APROVADOS", chave: "hcs_aprovados", formato: "inteiro", largura: 14 },
          { titulo: "ENTREGUES", chave: "qtd_entregue", formato: "inteiro", largura: 14 },
          { titulo: "TAXA APROVAÇÃO", chave: "taxa_aprovacao", formato: "percentual", largura: 16 },
          { titulo: "TAXA ENTREGA", chave: "taxa_entrega", formato: "percentual", largura: 14 },
          { titulo: "PENDENTES", chave: "pendentes", formato: "inteiro", largura: 12 },
        ],
        linhas: r.por_mes.map((m) => ({ ...m, mes: rotuloMes(m.mes) })),
        linhaTotal: { mes: "TOTAL", total_rps: K.total_rps, hcs: K.hcs, hcs_aprovados: K.hcs_aprovados, qtd_entregue: K.qtd_entregue, taxa_aprovacao: K.taxa_aprovacao, taxa_entrega: K.taxa_entrega, pendentes: K.pendentes },
      });
    }

    const sufixo = periodo.meses === 1 ? periodo.de.replace("-", "_") : `${periodo.de.replace("-", "_")}_a_${periodo.ate.replace("-", "_")}`;
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio_rs_${sufixo}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (err) {
    console.error("[rsController.exportar]", err);
    if (err.code === "MODULE_NOT_FOUND") return erro(res, 500, "exceljs não instalado — rodar: npm install exceljs");
    return erro(res, 500, "Erro ao gerar exportação");
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
    .map((v) => chaveNormal(v)).join("|");
}

const importarPlanilha = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  if (!req.file) return erro(res, 400, "Nenhum arquivo enviado");

  const ano  = parseInt(req.query.ano, 10) || new Date().getFullYear();
  if (ano < 2000 || ano > 2100) return erro(res, 400, "Ano inválido");
  const modo = req.query.modo === "append" ? "append" : "skip";
  // simular=1: só analisa e devolve a prévia (nada é gravado)
  const simular = req.query.simular === "1" || req.query.simular === "true";

  let conn;
  try {
    const XLSX      = require("xlsx");
    const sitesConhecidos = await listarSites(empresa_id, { incluirInativos: true });
    const mapaSites = new Map(sitesConhecidos.map((x) => [x.chave, x.nome]));
    const sitesNovos = new Map(); // chave → nome padrão (ainda não cadastrado)
    let totalInvalido = 0;
    let totalDuplicado = 0;
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
        if (!mes_referencia) { totalIgnorado++; totalInvalido++; ignoradosAba++; continue; }

        const siteBruto = tituloPadrao(row["SITE"]).slice(0, 100);
        if (!siteBruto) { totalIgnorado++; totalInvalido++; ignoradosAba++; continue; }
        const chaveSite = chaveNormal(siteBruto);
        const site = mapaSites.get(chaveSite) || siteBruto;
        if (!mapaSites.has(chaveSite)) { sitesNovos.set(chaveSite, siteBruto); mapaSites.set(chaveSite, siteBruto); }

        const setor = _normSetor(row["SETOR"]) || setorAba;
        if (!setor) { totalIgnorado++; totalInvalido++; ignoradosAba++; continue; }

        const produto = tituloPadrao(row["PRODUTO"] ?? row["CLIENTE"] ?? "").slice(0, 150);
        if (!produto) { totalIgnorado++; totalInvalido++; ignoradosAba++; continue; }

        const data_recebimento = _normDate(row["DATA RECEBIMENTO RP"] ?? row["DATA RECEBIMENTO"], ano);
        const registro = {
          mes_referencia, site, setor, produto,
          status: _normStatus(row["STATUS"]),
          data_recebimento,
          inicio_av_tecnica:    setor==="OPERACIONAL" ? _normDate(row["INICIO DA AV TECNICA"] ?? row["INICIO AV TECNICA"], ano) : null,
          final_av_tecnica:     setor==="OPERACIONAL" ? _normDate(row["FINAL DA AV TECNICA"]  ?? row["FINAL AV TECNICA"],  ano) : null,
          data_fechamento_vaga: setor==="ESTRATÉGICO"  ? _normDate(row["DATA FECHAMENTO DA VAGA"] ?? row["DATA FECHAMENTO VAGA"], ano) : null,
          cargo:   setor==="ESTRATÉGICO" ? (tituloPadrao(row["CARGO"]).slice(0, 200)||null) : null,
          chamado: String(row["CHAMADO"]??row["N CHAMADO"]??"").trim().slice(0, 200)||null,
          hcs:           _normInt(row["HCS"] ?? row["HC'S"] ?? row["HCS SOLICITADOS"]),
          hcs_com_to:    _normInt(row["META COM RESERVA"] ?? row["HCS COM TO"] ?? row["HC'S COM TO"]),
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
         FROM rps WHERE empresa_id=? AND excluido_em IS NULL`,
        [empresa_id]
      );
      const vistos = new Set(existentes.map(_chaveRP));
      aInserir = [];
      for (const r of novas) {
        const k = _chaveRP(r);
        if (vistos.has(k)) { totalIgnorado++; totalDuplicado++; continue; }
        vistos.add(k);
        aInserir.push(r);
      }
    }

    // ── Prévia (simulação): conta e resume, sem gravar nada ──────────────────
    if (simular) {
      const porMes = {};
      const porSetor = { OPERACIONAL: 0, "ESTRATÉGICO": 0 };
      const produtosNovos = new Set();
      const [prodCad] = await db.query("SELECT nome FROM rs_produtos WHERE empresa_id=?", [empresa_id]).catch(() => [[]]);
      const [prodRps] = await db.query("SELECT DISTINCT produto AS nome FROM rps WHERE empresa_id=? AND excluido_em IS NULL", [empresa_id]);
      const prodConhecidos = new Set([...prodCad, ...prodRps].map((x) => chaveNormal(x.nome)));
      for (const r of aInserir) {
        const m = String(r.mes_referencia).slice(0, 7);
        porMes[m] = (porMes[m] || 0) + 1;
        porSetor[r.setor] = (porSetor[r.setor] || 0) + 1;
        if (!prodConhecidos.has(chaveNormal(r.produto))) produtosNovos.add(r.produto);
      }
      // Varredura 20/10/2026: a importação não aplicava a regra "aprovados <= HC'S
      // e entregues <= aprovados" que o cadastro manual já exige. Não bloqueia
      // (planilhas antigas têm esse tipo de linha), mas avisa na prévia.
      const incoerentes = aInserir
        .map((r) => ({ r, msgs: incoerencias(r) }))
        .filter((x) => x.msgs.length);
      return res.json({
        ok: true,
        simulacao: true,
        incoerentes: {
          total: incoerentes.length,
          amostra: incoerentes.slice(0, 8).map(({ r, msgs }) => ({
            mes: String(r.mes_referencia).slice(0, 7), site: r.site, produto: r.produto,
            hcs: r.hcs, hcs_aprovados: r.hcs_aprovados, qtd_entregue: r.qtd_entregue, problemas: msgs,
          })),
        },
        resumo: {
          total_linhas_validas: novas.length,
          total_a_importar: aInserir.length,
          total_duplicadas: totalDuplicado,
          total_invalidas: totalInvalido,
        },
        por_mes: Object.keys(porMes).sort().map((m) => ({ mes: m, rps: porMes[m] })),
        por_setor: porSetor,
        sites_novos: [...sitesNovos.values()].sort((a, b) => a.localeCompare(b, "pt-BR")),
        produtos_novos: [...produtosNovos].sort((a, b) => a.localeCompare(b, "pt-BR")),
        amostra: aInserir.slice(0, 8).map((r) => ({
          mes: String(r.mes_referencia).slice(0, 7), site: r.site, setor: r.setor, produto: r.produto,
          cargo: r.cargo, chamado: r.chamado, status: r.status, data_recebimento: r.data_recebimento,
        })),
        detalhes,
      });
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
      for (const nome of new Set(aInserir.map((r) => r.site))) await _upsertSite(empresa_id, nome);
    }

    registrarAuditoria({
      usuario: req.user, acao: "importar", entidade: "rp", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} importou planilha de R&S: ${aInserir.length} RP(s) criada(s), ${totalIgnorado} ignorada(s) (ano ${ano}, modo ${modo}, arquivo ${String(req.file.originalname || "").slice(0, 80)})`,
      dadosDepois: { importadas: aInserir.length, ignoradas: totalIgnorado, ano, modo },
      ip: req.ip,
    });

    return res.json({
      ok: true,
      resumo: { total_importado: aInserir.length, total_ignorado: totalIgnorado, total_duplicadas: totalDuplicado, total_invalidas: totalInvalido, total_erro: 0, total_numeros_incoerentes: aInserir.filter((r) => incoerencias(r).length).length },
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
    const nomeFinal = tituloPadrao(nome);
    if (!nomeFinal) return;
    const [[exists]] = await db.query("SELECT id FROM rs_produtos WHERE empresa_id=? AND nome=?", [empresa_id, nomeFinal]);
    if (!exists) await db.query("INSERT INTO rs_produtos (empresa_id, nome) VALUES (?,?)", [empresa_id, nomeFinal]);
  } catch (_) { /* não crítico */ }
}

async function _upsertSite(empresa_id, nome) {
  try {
    const chave = chaveNormal(nome);
    const [cad] = await db.query("SELECT id, nome FROM rs_sites WHERE empresa_id=?", [empresa_id]);
    if (cad.some((x) => chaveNormal(x.nome) === chave)) return;
    await db.query("INSERT INTO rs_sites (empresa_id, nome) VALUES (?,?)", [empresa_id, nome]);
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

// ── Exportar a lista de RPs (20/10/2026): mesmos filtros da tela, uma linha por RP ──
const exportarLista = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  const f = _filtrosLista(req.query, empresa_id);
  if (f.erro) return erro(res, 400, f.erro);
  const limiteDias = Math.min(Math.max(parseInt(req.query.limite_dias, 10) || rel.LIMITE_DIAS_PADRAO, 1), 365);
  try {
    const { novoWorkbook, adicionarTabela } = require("../lib/excelExport");
    const [rps] = await db.query(
      `SELECT r.*, DATE_FORMAT(r.mes_referencia, '%m/%Y') AS mes_rotulo,
              CASE WHEN r.status = 'EM ANDAMENTO'
                   THEN GREATEST(DATEDIFF(CURDATE(), COALESCE(r.data_recebimento, r.mes_referencia)), 0) END AS dias_aberto
         FROM rps r WHERE ${f.where}
         ORDER BY r.mes_referencia DESC, r.site, r.setor, r.produto, r.id
         LIMIT 20000`, f.params);
    const comentarios = new Map();
    if (rps.length) {
      const [coms] = await db.query(
        `SELECT c.rp_id, c.autor_nome, c.texto, c.created_at FROM rps_comentarios c
           JOIN rps r ON r.id = c.rp_id WHERE ${f.where} AND c.empresa_id = r.empresa_id ORDER BY c.created_at, c.id`,
        f.params).catch(() => [[]]);
      for (const c of coms) {
        const d = c.created_at ? new Date(c.created_at) : null;
        const ds = d && !isNaN(d) ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : "";
        if (!comentarios.has(c.rp_id)) comentarios.set(c.rp_id, []);
        comentarios.get(c.rp_id).push(`${ds} ${c.autor_nome || ""}: ${c.texto}`.trim());
      }
    }
    const linhas = rps.map((r) => {
      const dias = r.dias_aberto === null || r.dias_aberto === undefined ? "" : Number(r.dias_aberto);
      return {
        mes: r.mes_rotulo, site: r.site, setor: r.setor, produto: r.produto, cargo: r.cargo || "", chamado: r.chamado || "",
        data_recebimento: r.data_recebimento, status: r.status,
        prazo: r.status === "EM ANDAMENTO" ? (dias > limiteDias ? "Atrasada" : "No prazo") : "",
        dias_aberto: dias,
        inicio_av_tecnica: r.inicio_av_tecnica, final_av_tecnica: r.final_av_tecnica, data_fechamento_vaga: r.data_fechamento_vaga,
        hcs: r.hcs, hcs_com_to: r.hcs_com_to, hcs_aprovados: r.hcs_aprovados, qtd_entregue: r.qtd_entregue,
        observacoes: r.observacoes || "", comentarios: (comentarios.get(r.id) || []).join("\n"),
      };
    });
    const wb = novoWorkbook();
    adicionarTabela(wb, {
      nomeAba: "RPs",
      colunas: [
        { titulo: "Mês", chave: "mes", largura: 10 }, { titulo: "Site", chave: "site", largura: 20 },
        { titulo: "Setor", chave: "setor", largura: 14 }, { titulo: "Produto", chave: "produto", largura: 24 },
        { titulo: "Cargo", chave: "cargo", largura: 22 }, { titulo: "Chamado", chave: "chamado", largura: 14 },
        { titulo: "Recebimento", chave: "data_recebimento", formato: "data", largura: 13 },
        { titulo: "Status", chave: "status", largura: 15 }, { titulo: "Prazo", chave: "prazo", largura: 10 },
        { titulo: "Dias em aberto", chave: "dias_aberto", largura: 10 },
        { titulo: "Início av. técnica", chave: "inicio_av_tecnica", formato: "data", largura: 13 },
        { titulo: "Final av. técnica", chave: "final_av_tecnica", formato: "data", largura: 13 },
        { titulo: "Fechamento da vaga", chave: "data_fechamento_vaga", formato: "data", largura: 13 },
        { titulo: "HC'S", chave: "hcs", formato: "inteiro", largura: 8 },
        { titulo: "Meta com reserva", chave: "hcs_com_to", formato: "inteiro", largura: 10 },
        { titulo: "HC'S aprovados", chave: "hcs_aprovados", formato: "inteiro", largura: 10 },
        { titulo: "Entregues", chave: "qtd_entregue", formato: "inteiro", largura: 10 },
        { titulo: "Observações", chave: "observacoes", largura: 30 }, { titulo: "Comentários", chave: "comentarios", largura: 50 },
      ],
      linhas,
    });
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="rps_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (err) {
    console.error("[rsController.exportarLista]", err);
    return erro(res, 500, "Erro ao exportar a lista de RPs");
  }
};

module.exports = {
  // Sprint 1
  listar, criar, detalhe, editar, excluir, getSites, getProdutos, exportarLista,
  listarComentarios, criarComentario, excluirComentario,
  // Sprint 2
  getDashboard, getRelatorio, exportar,
  // Sprint 3
  importarPlanilha,
};
