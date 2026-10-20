// backend/src/controllers/rsGestaoController.js
// R&S — gestão do cadastro (20/10/2026): sites, padronização da grafia dos dados
// existentes e lixeira de RPs. CommonJS — nunca usar import/export.
const db = require("../lib/db");
const { registrarAuditoria } = require("../services/auditoria");
const { tituloPadrao, chaveNormal, listarSites } = require("../lib/rsPadrao");

const getEmpresaId = (req) => req.user?.empresa_id;
const erro = (res, status, msg, extra = {}) => res.status(status).json({ error: msg, message: msg, ...extra });
const DIAS_LIXEIRA = 30;

// ─────────────────────────────────────────────────────────────────────────────
// SITES
// ─────────────────────────────────────────────────────────────────────────────

const listarSitesGestao = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  try {
    const sites = await listarSites(empresa_id, { incluirInativos: true });
    return res.json({
      sites: sites.map((s) => ({ id: s.id, nome: s.nome, ativo: s.ativo, cadastrado: s.cadastrado, rps: s.rps })),
    });
  } catch (err) {
    console.error("[rsGestao.listarSites]", err);
    return erro(res, 500, "Erro ao listar os sites");
  }
};

const criarSite = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  const nome = tituloPadrao(req.body?.nome).slice(0, 100);
  if (!nome) return erro(res, 400, "Informe o nome do site.");
  try {
    const [cad] = await db.query("SELECT id, nome, ativo FROM rs_sites WHERE empresa_id = ?", [empresa_id]);
    const igual = cad.find((x) => chaveNormal(x.nome) === chaveNormal(nome));
    if (igual) {
      if (igual.ativo) return erro(res, 400, `O site "${igual.nome}" já está cadastrado.`);
      await db.query("UPDATE rs_sites SET ativo = 1 WHERE id = ? AND empresa_id = ?", [igual.id, empresa_id]);
      registrarAuditoria({ usuario: req.user, acao: "editar", entidade: "rs_site", entidadeId: igual.id,
        resumo: `${req.user?.nome || "Alguém"} reativou o site ${igual.nome} (R&S)`, ip: req.ip });
      return res.json({ id: igual.id, nome: igual.nome, message: `Site "${igual.nome}" reativado.` });
    }
    const [r] = await db.query("INSERT INTO rs_sites (empresa_id, nome) VALUES (?,?)", [empresa_id, nome]);
    registrarAuditoria({ usuario: req.user, acao: "criar", entidade: "rs_site", entidadeId: r.insertId,
      resumo: `${req.user?.nome || "Alguém"} cadastrou o site ${nome} (R&S)`, dadosDepois: { nome }, ip: req.ip });
    return res.status(201).json({ id: r.insertId, nome, message: `Site "${nome}" cadastrado.` });
  } catch (err) {
    console.error("[rsGestao.criarSite]", err);
    return erro(res, 500, "Erro ao cadastrar o site");
  }
};

/** PUT: renomear (com cascata nas RPs) e/ou ativar/desativar. `mesclar:true` junta com um site que já existe. */
const editarSite = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  const id = parseInt(req.params.id, 10);
  if (!id) return erro(res, 400, "Site inválido");
  const b = req.body || {};
  let conn;
  try {
    const [[atual]] = await db.query("SELECT id, nome, ativo FROM rs_sites WHERE id = ? AND empresa_id = ?", [id, empresa_id]);
    if (!atual) return erro(res, 404, "Site não encontrado");

    // Só ativar/desativar
    if (b.nome === undefined) {
      const ativo = b.ativo ? 1 : 0;
      await db.query("UPDATE rs_sites SET ativo = ? WHERE id = ? AND empresa_id = ?", [ativo, id, empresa_id]);
      registrarAuditoria({ usuario: req.user, acao: "editar", entidade: "rs_site", entidadeId: id,
        resumo: `${req.user?.nome || "Alguém"} ${ativo ? "reativou" : "desativou"} o site ${atual.nome} (R&S)`, ip: req.ip });
      return res.json({ message: ativo ? `Site "${atual.nome}" reativado.` : `Site "${atual.nome}" desativado. As RPs dele continuam; só não dá mais para escolhê-lo em RPs novas.` });
    }

    const novo = tituloPadrao(b.nome).slice(0, 100);
    if (!novo) return erro(res, 400, "Informe o novo nome do site.");
    const [outros] = await db.query("SELECT id, nome FROM rs_sites WHERE empresa_id = ? AND id <> ?", [empresa_id, id]);
    const conflito = outros.find((x) => chaveNormal(x.nome) === chaveNormal(novo));
    if (conflito && !b.mesclar) {
      return erro(res, 409, `Já existe o site "${conflito.nome}". Para juntar os dois, confirme a mesclagem.`, { conflito: conflito.nome, precisa_mesclar: true });
    }
    const destino = conflito ? conflito.nome : novo;

    conn = await db.getConnection();
    await conn.beginTransaction();
    // Todas as grafias que existem hoje nas RPs (inclusive lixeira) para o nome antigo e para o destino
    const [vars] = await conn.query("SELECT DISTINCT site FROM rps WHERE empresa_id = ?", [empresa_id]);
    const chavesAlvo = new Set([chaveNormal(atual.nome), chaveNormal(destino)]);
    const grafias = vars.map((v) => v.site).filter((v) => chavesAlvo.has(chaveNormal(v)) && v !== destino);
    let atualizadas = 0;
    for (const g of grafias) {
      const [r] = await conn.query("UPDATE rps SET site = ? WHERE empresa_id = ? AND BINARY site = BINARY ?", [destino, empresa_id, g]);
      atualizadas += r.affectedRows;
    }
    if (conflito) {
      await conn.query("DELETE FROM rs_sites WHERE id = ? AND empresa_id = ?", [id, empresa_id]);
    } else {
      await conn.query("UPDATE rs_sites SET nome = ? WHERE id = ? AND empresa_id = ?", [destino, id, empresa_id]);
    }
    await conn.commit();
    conn.release();
    conn = null;
    registrarAuditoria({ usuario: req.user, acao: "editar", entidade: "rs_site", entidadeId: id,
      resumo: `${req.user?.nome || "Alguém"} ${conflito ? "mesclou" : "renomeou"} o site ${atual.nome} → ${destino} (${atualizadas} RP(s) atualizada(s))`,
      dadosAntes: { nome: atual.nome }, dadosDepois: { nome: destino, rps_atualizadas: atualizadas }, ip: req.ip });
    return res.json({ nome: destino, rps_atualizadas: atualizadas,
      message: `${conflito ? "Sites mesclados" : "Site renomeado"}: "${atual.nome}" → "${destino}". ${atualizadas} RP(s) atualizada(s).` });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch (_) { /* ignora */ } conn.release(); }
    console.error("[rsGestao.editarSite]", err);
    return erro(res, 500, "Erro ao atualizar o site. Nada foi alterado.");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PADRONIZAÇÃO da grafia dos dados que já estão no banco
// ─────────────────────────────────────────────────────────────────────────────
const CAMPOS_PADRONIZAVEIS = { site: 100, produto: 150, cargo: 200 };

/** Prévia: agrupa as grafias de cada campo e propõe o nome padrão (sem gravar nada). */
const previaPadronizacao = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  try {
    // A leitura é feita no Node de propósito: o MySQL de produção ignora maiúsculas/acentos em
    // GROUP BY e juntaria "SALVADOR" e "Salvador" numa linha só, escondendo justamente o problema.
    const [linhas] = await db.query("SELECT site, produto, cargo FROM rps WHERE empresa_id = ? AND excluido_em IS NULL", [empresa_id]);
    const [sitesCad] = await db.query("SELECT nome FROM rs_sites WHERE empresa_id = ? AND ativo = 1", [empresa_id]);
    const [prodCad] = await db.query("SELECT nome FROM rs_produtos WHERE empresa_id = ?", [empresa_id]).catch(() => [[]]);
    const preferido = {
      site: new Map(sitesCad.map((x) => [chaveNormal(x.nome), x.nome])),
      produto: new Map(prodCad.map((x) => [chaveNormal(x.nome), x.nome])),
      cargo: new Map(),
    };
    const grupos = [];
    for (const campo of Object.keys(CAMPOS_PADRONIZAVEIS)) {
      const contagem = new Map(); // valor exato → qtd
      for (const l of linhas) {
        const v = l[campo];
        if (v === null || v === undefined || String(v).trim() === "") continue;
        contagem.set(v, (contagem.get(v) || 0) + 1);
      }
      const porChave = new Map();
      for (const [valor, rps] of contagem) {
        const k = chaveNormal(valor);
        if (!porChave.has(k)) porChave.set(k, []);
        porChave.get(k).push({ valor, rps });
      }
      for (const [k, variantes] of porChave) {
        variantes.sort((a, b) => b.rps - a.rps);
        const destino = preferido[campo].get(k) || tituloPadrao(variantes[0].valor);
        const precisa = variantes.some((v) => v.valor !== destino);
        if (!precisa) continue;
        grupos.push({
          campo, destino, variantes,
          total_rps: variantes.reduce((s, v) => s + v.rps, 0),
          junta_nomes: variantes.length > 1,
        });
      }
    }
    grupos.sort((a, b) => a.campo.localeCompare(b.campo) || a.destino.localeCompare(b.destino, "pt-BR"));
    return res.json({
      grupos,
      resumo: {
        grupos: grupos.length,
        rps_afetadas: grupos.reduce((s, g) => s + g.variantes.filter((v) => v.valor !== g.destino).reduce((x, v) => x + v.rps, 0), 0),
      },
    });
  } catch (err) {
    console.error("[rsGestao.previaPadronizacao]", err);
    return erro(res, 500, "Erro ao analisar os nomes");
  }
};

/** Mantém um único registro no cadastro (rs_sites / rs_produtos) com o nome padrão. */
async function _consolidarCadastro(conn, tabela, empresa_id, destino) {
  const [rows] = await conn.query(`SELECT id, nome FROM ${tabela} WHERE empresa_id = ? ORDER BY id`, [empresa_id]);
  const iguais = rows.filter((x) => chaveNormal(x.nome) === chaveNormal(destino));
  if (!iguais.length) {
    await conn.query(`INSERT INTO ${tabela} (empresa_id, nome) VALUES (?,?)`, [empresa_id, destino]);
    return;
  }
  const manter = iguais.find((x) => x.nome === destino) || iguais[0];
  if (manter.nome !== destino) await conn.query(`UPDATE ${tabela} SET nome = ? WHERE id = ? AND empresa_id = ?`, [destino, manter.id, empresa_id]);
  for (const x of iguais) if (x.id !== manter.id) await conn.query(`DELETE FROM ${tabela} WHERE id = ? AND empresa_id = ?`, [x.id, empresa_id]);
}

/** Aplica a padronização. body: { itens: [{ campo, de: ["SALVADOR","salvador"], para: "Salvador" }] } */
const aplicarPadronizacao = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
  if (!itens.length) return erro(res, 400, "Nenhum ajuste selecionado.");
  if (itens.length > 2000) return erro(res, 400, "Ajustes demais de uma vez. Aplique em partes.");

  const limpos = [];
  for (const it of itens) {
    const campo = String(it?.campo || "");
    if (!CAMPOS_PADRONIZAVEIS[campo]) return erro(res, 400, `Campo inválido: ${campo}`);
    const para = tituloPadrao(it?.para).slice(0, CAMPOS_PADRONIZAVEIS[campo]);
    if (!para) return erro(res, 400, "O nome padrão não pode ficar vazio.");
    const de = (Array.isArray(it?.de) ? it.de : []).map((v) => String(v)).filter((v) => v !== "" && v !== para);
    limpos.push({ campo, para, de });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    let atualizadas = 0;
    const resumo = [];
    for (const it of limpos) {
      let n = 0;
      for (const v of it.de) {
        // BINARY: troca só a grafia exata, mesmo que o banco trate "SALVADOR" e "Salvador" como iguais
        const [r] = await conn.query(
          `UPDATE rps SET ${it.campo} = ? WHERE empresa_id = ? AND BINARY ${it.campo} = BINARY ?`,
          [it.para, empresa_id, v]
        );
        n += r.affectedRows;
      }
      atualizadas += n;
      if (it.campo === "site") await _consolidarCadastro(conn, "rs_sites", empresa_id, it.para);
      if (it.campo === "produto") await _consolidarCadastro(conn, "rs_produtos", empresa_id, it.para);
      resumo.push({ campo: it.campo, para: it.para, rps: n });
    }
    await conn.commit();
    conn.release();
    conn = null;
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "rp", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} padronizou a grafia de ${limpos.length} nome(s) no R&S (${atualizadas} RP(s) atualizada(s))`,
      dadosDepois: { ajustes: resumo.slice(0, 200) }, ip: req.ip,
    });
    return res.json({ ok: true, rps_atualizadas: atualizadas, ajustes: limpos.length, message: `Nomes padronizados: ${atualizadas} RP(s) atualizada(s).` });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch (_) { /* ignora */ } conn.release(); }
    console.error("[rsGestao.aplicarPadronizacao]", err);
    return erro(res, 500, "Erro ao padronizar. Nada foi alterado.");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LIXEIRA (30 dias)
// ─────────────────────────────────────────────────────────────────────────────

/** Apaga de vez as RPs que estão na lixeira há mais de 30 dias (e os comentários delas). */
async function purgarLixeira(empresa_id = null) {
  const filtroEmp = empresa_id ? "AND empresa_id = ?" : "";
  const params = empresa_id ? [empresa_id] : [];
  const sqlAntigas = `SELECT id FROM rps WHERE excluido_em IS NOT NULL AND excluido_em < (NOW() - INTERVAL ${DIAS_LIXEIRA} DAY) ${filtroEmp}`;
  const [antigas] = await db.query(sqlAntigas, params);
  if (!antigas.length) return 0;
  const ids = antigas.map((x) => x.id);
  const marcas = ids.map(() => "?").join(",");
  await db.query(`DELETE FROM rps_comentarios WHERE rp_id IN (${marcas})`, ids).catch(() => {});
  await db.query(`DELETE FROM rps WHERE id IN (${marcas})`, ids);
  return ids.length;
}

const listarLixeira = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  try {
    await purgarLixeira(empresa_id).catch((e) => console.error("[rsGestao.purgar]", e.message));
    const [rps] = await db.query(
      `SELECT r.id, DATE_FORMAT(r.mes_referencia, '%Y-%m') AS mes, r.site, r.setor, r.produto, r.cargo, r.chamado, r.status,
              r.excluido_em, u.nome AS excluido_por_nome,
              GREATEST(${DIAS_LIXEIRA} - DATEDIFF(NOW(), r.excluido_em), 0) AS dias_restantes
         FROM rps r LEFT JOIN usuarios u ON u.id = r.excluido_por
        WHERE r.empresa_id = ? AND r.excluido_em IS NOT NULL
        ORDER BY r.excluido_em DESC LIMIT 500`, [empresa_id]);
    return res.json({ rps: rps.map((r) => ({ ...r, dias_restantes: Number(r.dias_restantes) })), dias_lixeira: DIAS_LIXEIRA });
  } catch (err) {
    console.error("[rsGestao.listarLixeira]", err);
    return erro(res, 500, "Erro ao abrir a lixeira");
  }
};

const restaurarRP = async (req, res) => {
  const empresa_id = getEmpresaId(req);
  if (!empresa_id) return erro(res, 401, "Não autorizado");
  try {
    const [[rp]] = await db.query("SELECT id, produto, site FROM rps WHERE id = ? AND empresa_id = ? AND excluido_em IS NOT NULL", [req.params.id, empresa_id]);
    if (!rp) return erro(res, 404, "RP não encontrada na lixeira");
    await db.query("UPDATE rps SET excluido_em = NULL, excluido_por = NULL, updated_by = ? WHERE id = ? AND empresa_id = ?", [req.user?.id || null, rp.id, empresa_id]);
    registrarAuditoria({ usuario: req.user, acao: "editar", entidade: "rp", entidadeId: rp.id,
      resumo: `${req.user?.nome || "Alguém"} restaurou da lixeira a RP ${rp.produto} · ${rp.site}`, ip: req.ip });
    return res.json({ message: "RP restaurada." });
  } catch (err) {
    console.error("[rsGestao.restaurarRP]", err);
    return erro(res, 500, "Erro ao restaurar a RP");
  }
};

module.exports = {
  listarSitesGestao, criarSite, editarSite,
  previaPadronizacao, aplicarPadronizacao,
  listarLixeira, restaurarRP, purgarLixeira,
};
