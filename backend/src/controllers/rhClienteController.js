/**
 * rhClienteController.js — Acesso do cliente (Pacote 5, 13/11/2026)
 *
 * Duas metades, bem separadas:
 *  1) Liberações (equipe do RH): o coordenador libera uma pesquisa de clima para um cliente e pode revogar quando quiser;
 *     o analista só consulta. Também lista os acessos de cliente criados em Gestão de Usuários.
 *  2) Portal do cliente (perfil cliente_rh): só LEITURA, só das pesquisas liberadas para o cliente do usuário, sempre no formato
 *     "relatório para o cliente" (sem cargo nem coordenação, grupos pequenos nunca aparecem). Nada de resposta individual,
 *     nome de quem importou, Canguru ou dado de outro cliente. Cada abertura é registrada em rh_acessos_log.
 * A trava geral (negar por padrão) está em lib/clienteRh.js + middlewares/auth.js.
 * CommonJS — nunca usar import/export.
 */
const pool = require("../lib/db");
const R = require("../lib/rhBase");
const S = require("../services/rhClimaService");
const Planos = require("../services/rhPlanosService");
const Clima = require("./rhClimaController");
const CanguruS = require("../services/rhCangaruService");
const CanguruC = require("./rhCangaruController");
const { registrarAuditoria } = require("../services/auditoria");

const auditar = (req, acao, entidade, id, resumo, antes, depois) =>
  registrarAuditoria({ usuario: req.user, acao, entidade, entidadeId: id, resumo, dadosAntes: antes, dadosDepois: depois, ip: req.ip });
const falha = (res, e, rotulo, msg) => {
  if (e && e.status) return res.status(e.status).json({ ok: false, message: e.message, error: e.message });
  console.error(`[rh.cliente.${rotulo}]`, e);
  return R.erro(res, 500, msg);
};
const idParam = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : null; };
const iso = (v) => (v instanceof Date ? v.toISOString() : v ? new Date(v).toISOString() : null);

// ═══ 1) Liberações (equipe do RH) ════════════════════════════════════
async function listarLiberacoes(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const [rows] = await pool.query(
      `SELECT l.id, l.ciclo_id, l.cliente, l.liberado_por_nome, l.created_at, l.revogado_em, l.revogado_por_nome, c.nome AS ciclo_nome
         FROM rh_clima_liberacoes l LEFT JOIN rh_clima_ciclos c ON c.id = l.ciclo_id AND c.empresa_id = l.empresa_id
        WHERE l.empresa_id = ? ${Number(req.query.ciclo) > 0 ? "AND l.ciclo_id = ?" : ""} ORDER BY (l.revogado_em IS NULL) DESC, l.id DESC LIMIT 300`,
      Number(req.query.ciclo) > 0 ? [c.empresaId, Number(req.query.ciclo)] : [c.empresaId]);
    const [acc] = await pool.query(`SELECT registro_id AS ciclo_id, MAX(created_at) AS ultimo, COUNT(*) AS n FROM rh_acessos_log WHERE empresa_id = ? AND recurso = 'cliente_relatorio' GROUP BY registro_id`, [c.empresaId]);
    const porCiclo = new Map(acc.map((a) => [Number(a.ciclo_id), a]));
    const [usuarios] = await pool.query(`SELECT id, nome, email, cliente, ativo FROM usuarios WHERE empresa_id = ? AND perfil = 'cliente_rh' ORDER BY nome`, [c.empresaId]);
    const [ult] = await pool.query(`SELECT usuario_id, MAX(created_at) AS ultimo FROM rh_acessos_log WHERE empresa_id = ? AND recurso IN ('cliente_relatorio','cliente_lista') GROUP BY usuario_id`, [c.empresaId]);
    const ultPor = new Map(ult.map((u) => [Number(u.usuario_id), u.ultimo]));
    return res.json({
      ok: true, pode_editar: c.perfil === R.PERFIL_COORD,
      liberacoes: rows.map((l) => ({ id: l.id, ciclo_id: l.ciclo_id, ciclo_nome: l.ciclo_nome, cliente: l.cliente, liberado_por: l.liberado_por_nome, liberado_em: iso(l.created_at), ativa: !l.revogado_em, revogado_em: iso(l.revogado_em), revogado_por: l.revogado_por_nome,
        acessos: Number(porCiclo.get(l.ciclo_id)?.n || 0), ultimo_acesso: iso(porCiclo.get(l.ciclo_id)?.ultimo) })),
      usuarios: usuarios.map((u) => ({ id: u.id, nome: u.nome, email: u.email, clientes: String(u.cliente || "").split(",").map((x) => x.trim()).filter(Boolean), ativo: u.ativo === null || Number(u.ativo) === 1, ultimo_acesso: iso(ultPor.get(u.id)) })),
    });
  } catch (e) { return falha(res, e, "liberacoes", "Erro ao carregar as liberações"); }
}

// Nomes de cliente conhecidos (cadastro de clientes do portal, pesquisas já importadas e acessos de cliente já criados), para o coordenador escolher.
async function clientesConhecidos(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const nomes = new Set();
    const [a] = await pool.query(`SELECT nome FROM clientes WHERE empresa_id = ? AND (status IS NULL OR status <> 'inativo') ORDER BY nome`, [c.empresaId]).catch(() => [[]]);
    const [b] = await pool.query(`SELECT DISTINCT cliente FROM rh_clima_ciclos WHERE empresa_id = ? AND cliente IS NOT NULL AND cliente <> ''`, [c.empresaId]);
    const [d] = await pool.query(`SELECT cliente FROM usuarios WHERE empresa_id = ? AND perfil = 'cliente_rh' AND cliente IS NOT NULL`, [c.empresaId]);
    a.forEach((x) => x.nome && nomes.add(String(x.nome).trim()));
    b.forEach((x) => nomes.add(String(x.cliente).trim()));
    d.forEach((x) => String(x.cliente).split(",").map((s) => s.trim()).filter(Boolean).forEach((s) => nomes.add(s)));
    return res.json({ ok: true, clientes: [...nomes].filter(Boolean).sort((x, y) => x.localeCompare(y, "pt-BR")) });
  } catch (e) { return falha(res, e, "clientes", "Erro ao carregar os clientes"); }
}

async function liberar(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  try {
    const cicloId = Number(req.body?.ciclo_id);
    const cliente = String(req.body?.cliente ?? "").replace(/\s+/g, " ").trim();
    if (!Number.isInteger(cicloId) || cicloId <= 0) return R.erro(res, 400, "Escolha a pesquisa.");
    if (!cliente || cliente.length > 100) return R.erro(res, 400, "Informe o cliente (até 100 letras).");
    if (cliente.includes(",")) return R.erro(res, 400, "Escreva um cliente por vez, sem vírgula.");
    const ciclo = await S.carregarCiclo(c.empresaId, cicloId);
    if (!ciclo) return R.erro(res, 404, "Pesquisa não encontrada.");
    const chave = R.chave(cliente);
    const [[ja]] = await pool.query(`SELECT id FROM rh_clima_liberacoes WHERE empresa_id = ? AND ciclo_id = ? AND cliente_chave = ? AND revogado_em IS NULL`, [c.empresaId, cicloId, chave]);
    if (ja) return res.status(409).json({ ok: false, message: "Esta pesquisa já está liberada para esse cliente." });
    const [ins] = await pool.query(`INSERT INTO rh_clima_liberacoes (empresa_id, ciclo_id, cliente, cliente_chave, liberado_por, liberado_por_nome) VALUES (?,?,?,?,?,?)`, [c.empresaId, cicloId, cliente, chave, req.user.id ?? null, req.user.nome ?? null]);
    auditar(req, "liberar", "rh_clima_liberacao", ins.insertId, `Liberou a pesquisa “${ciclo.nome}” para o cliente “${cliente}”`, null, { ciclo_id: cicloId, cliente });
    return res.status(201).json({ ok: true, id: ins.insertId, message: "Pesquisa liberada para o cliente" });
  } catch (e) { return falha(res, e, "liberar", "Erro ao liberar a pesquisa"); }
}

async function revogar(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  try {
    const id = idParam(req); if (!id) return R.erro(res, 404, "Liberação não encontrada");
    const [[l]] = await pool.query(`SELECT l.*, c.nome AS ciclo_nome FROM rh_clima_liberacoes l LEFT JOIN rh_clima_ciclos c ON c.id = l.ciclo_id WHERE l.id = ? AND l.empresa_id = ?`, [id, c.empresaId]);
    if (!l) return R.erro(res, 404, "Liberação não encontrada");
    if (l.revogado_em) return res.status(409).json({ ok: false, message: "Esta liberação já foi retirada." });
    await pool.query(`UPDATE rh_clima_liberacoes SET revogado_em = NOW(), revogado_por_nome = ? WHERE id = ? AND empresa_id = ?`, [req.user.nome ?? null, id, c.empresaId]);
    auditar(req, "revogar", "rh_clima_liberacao", id, `Retirou a liberação da pesquisa “${l.ciclo_nome}” para o cliente “${l.cliente}”`, { cliente: l.cliente }, null);
    return res.json({ ok: true, message: "Liberação retirada. O cliente não vê mais esta pesquisa." });
  } catch (e) { return falha(res, e, "revogar", "Erro ao retirar a liberação"); }
}

// ═══ 2) Portal do cliente (somente leitura) ══════════════════════════
const ciclo_publico = (x) => ({ id: x.id, nome: x.nome, cliente: x.cliente, periodo: x.periodo, data_ini: x.data_ini, data_fim: x.data_fim, n_respondentes: x.n_respondentes });

/** Liberações ativas que valem para este usuário (o cliente da liberação precisa estar entre os clientes do cadastro dele). */
async function liberacoesDoUsuario(c) {
  const [rows] = await pool.query(`SELECT id, ciclo_id, cliente, cliente_chave, created_at FROM rh_clima_liberacoes WHERE empresa_id = ? AND revogado_em IS NULL ORDER BY id DESC`, [c.empresaId]);
  return rows.filter((l) => c.chaves.includes(l.cliente_chave));
}
async function cicloLiberado(c, id) {
  const lib = (await liberacoesDoUsuario(c)).find((l) => Number(l.ciclo_id) === id);
  if (!lib) return null;
  return S.carregarCiclo(c.empresaId, id);
}

async function eu(req, res) {
  const c = await R.contextoCliente(req, res); if (!c) return;
  return res.json({ ok: true, nome: c.usuario.nome, clientes: c.clientes });
}

async function meusCiclos(req, res) {
  const c = await R.contextoCliente(req, res); if (!c) return;
  try {
    const libs = await liberacoesDoUsuario(c);
    const ciclos = [];
    for (const l of libs) {
      const x = await S.carregarCiclo(c.empresaId, l.ciclo_id);
      if (!x || ciclos.some((y) => y.id === x.id)) continue;
      const [[np]] = await pool.query(`SELECT COUNT(*) AS n FROM rh_planos WHERE empresa_id = ? AND ciclo_id = ? AND visivel_cliente = 1 AND status <> 'cancelado'`, [c.empresaId, x.id]);
      ciclos.push({ ...ciclo_publico(x), liberado_em: iso(l.created_at), planos: Number(np.n) });
    }
    ciclos.sort((a, b) => String(b.data_fim || "").localeCompare(String(a.data_fim || "")) || b.id - a.id);
    await R.registrarLeitura(req, c.empresaId, "cliente_lista", null, "Cliente abriu a lista de pesquisas");
    return res.json({ ok: true, nome: c.usuario.nome, clientes: c.clientes, ciclos });
  } catch (e) { return falha(res, e, "ciclos", "Erro ao carregar as pesquisas"); }
}

function parametros(req) {
  const def = Clima.PUBLICOS.cliente;
  const secoes = String(req.query.secoes || Clima.SECOES.join(",")).split(",").map((s) => s.trim()).filter((s) => Clima.SECOES.includes(s));
  const recortes = String(req.query.recortes || "").split(",").map((s) => s.trim()).filter((s) => def.recortes.includes(s));
  return { secoes: secoes.length ? secoes : Clima.SECOES, recortes };
}

async function relatorio(req, res) {
  const c = await R.contextoCliente(req, res); if (!c) return;
  try {
    const id = idParam(req); if (!id) return R.erro(res, 404, "Pesquisa não encontrada");
    const x = await cicloLiberado(c, id); if (!x) return R.erro(res, 404, "Pesquisa não encontrada");
    const p = parametros(req);
    const rel = await Clima.montarRelatorio({ empresaId: c.empresaId }, x, "cliente", p.secoes, p.recortes);
    rel.ciclo = ciclo_publico(x);
    await R.registrarLeitura(req, c.empresaId, "cliente_relatorio", id, "Cliente abriu o relatório");
    return res.json({ ok: true, ...rel });
  } catch (e) { return falha(res, e, "relatorio", "Erro ao montar o relatório"); }
}

async function exportar(req, res) {
  const c = await R.contextoCliente(req, res); if (!c) return;
  try {
    const id = idParam(req); if (!id) return R.erro(res, 404, "Pesquisa não encontrada");
    const x0 = await cicloLiberado(c, id); if (!x0) return R.erro(res, 404, "Pesquisa não encontrada");
    const x = ciclo_publico(x0); const p = parametros(req);
    const rel = await Clima.montarRelatorio({ empresaId: c.empresaId }, x0, "cliente", p.secoes, p.recortes);
    const { buf, slug } = await Clima.excelDoRelatorio(x, rel);
    await R.registrarLeitura(req, c.empresaId, "cliente_relatorio", id, "Cliente baixou o Excel");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="clima_${slug}_${R.hojeISO()}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (e) { return falha(res, e, "exportar", "Erro ao exportar o relatório"); }
}

async function planos(req, res) {
  const c = await R.contextoCliente(req, res); if (!c) return;
  try {
    const id = idParam(req); if (!id) return R.erro(res, 404, "Pesquisa não encontrada");
    const x = await cicloLiberado(c, id); if (!x) return R.erro(res, 404, "Pesquisa não encontrada");
    const [rows] = await pool.query(`SELECT * FROM rh_planos WHERE empresa_id = ? AND ciclo_id = ? AND visivel_cliente = 1 AND status <> 'cancelado' ORDER BY FIELD(status,'aberto','andamento','concluido'), prazo ASC`, [c.empresaId, id]);
    const hoje = R.hojeISO();
    return res.json({ ok: true, planos: rows.map((p) => ({
      id: p.id, titulo: p.titulo, acao: p.acao, tema: p.tema, prazo: p.prazo instanceof Date ? p.prazo.toISOString().slice(0, 10) : String(p.prazo).slice(0, 10),
      prioridade: p.prioridade, status: p.status, status_rotulo: Planos.ROTULO_STATUS[p.status], situacao: Planos.situacao(p, hoje), resultado: p.status === "concluido" ? p.resultado : null,
      responsavel: p.responsavel_id ? "Equipe do RH" : (p.responsavel_nome || "—"),
    })) });
  } catch (e) { return falha(res, e, "planos", "Erro ao carregar os planos"); }
}

// ═══ 3) Canguru para o cliente (Pacote 7) ════════════════════════════
// O cliente vê só o resultado agregado (público "cliente") dos serviços que o coordenador definiu, nunca nomes, relatos nem grupos pequenos.
// Se o escopo tiver menos novatos que o mínimo do projeto, o relatório inteiro fica oculto, para ninguém ser reconhecido.
const lista = (txt) => { try { const v = JSON.parse(txt || "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
const limpaLista = (v, max = 60) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x ?? "").replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, max);
const publicoCg = (l) => ({ id: l.id, cliente: l.cliente, servicos: lista(l.servicos), sites: lista(l.sites), liberado_por: l.liberado_por_nome, liberado_em: iso(l.created_at), ativa: !l.revogado_em, revogado_em: iso(l.revogado_em) });

async function canguruListarLiberacoes(req, res) {
  const c = R.contextoOperacao(req, res); if (!c) return;
  try {
    const [rows] = await pool.query(`SELECT * FROM rh_canguru_liberacoes WHERE empresa_id = ? ORDER BY (revogado_em IS NULL) DESC, id DESC LIMIT 200`, [c.empresaId]);
    const op = await CanguruS.opcoesEscopo(c.empresaId);
    return res.json({ ok: true, pode_editar: c.perfil === R.PERFIL_COORD, liberacoes: rows.map(publicoCg), opcoes: op });
  } catch (e) { return falha(res, e, "canguru.liberacoes", "Erro ao carregar as liberações do Canguru"); }
}

async function canguruLiberar(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  try {
    const cliente = String(req.body?.cliente ?? "").replace(/\s+/g, " ").trim();
    if (!cliente || cliente.length > 100 || cliente.includes(",")) return R.erro(res, 400, "Informe um cliente (até 100 letras, sem vírgula).");
    const servicos = limpaLista(req.body?.servicos), sites = limpaLista(req.body?.sites);
    if (!servicos.length) return R.erro(res, 400, "Escolha ao menos um serviço. É ele que define o que o cliente enxerga.");
    const op = await CanguruS.opcoesEscopo(c.empresaId);
    const validosS = new Set(op.servicos.map((x) => x.valor)), validosT = new Set(op.sites.map((x) => x.valor));
    if (servicos.some((x) => !validosS.has(x))) return R.erro(res, 400, "Há serviço que não existe nas avaliações importadas.");
    if (sites.some((x) => !validosT.has(x))) return R.erro(res, 400, "Há site que não existe nas avaliações importadas.");
    const chave = R.chave(cliente);
    const [[ja]] = await pool.query(`SELECT id FROM rh_canguru_liberacoes WHERE empresa_id = ? AND cliente_chave = ? AND revogado_em IS NULL`, [c.empresaId, chave]);
    if (ja) return res.status(409).json({ ok: false, message: "Esse cliente já tem o Canguru liberado. Retire a liberação atual para definir outro escopo." });
    const [ins] = await pool.query(`INSERT INTO rh_canguru_liberacoes (empresa_id, cliente, cliente_chave, servicos, sites, liberado_por, liberado_por_nome) VALUES (?,?,?,?,?,?,?)`,
      [c.empresaId, cliente, chave, JSON.stringify(servicos), sites.length ? JSON.stringify(sites) : null, req.user.id ?? null, req.user.nome ?? null]);
    auditar(req, "liberar", "rh_canguru_liberacao", ins.insertId, `Liberou o Canguru para o cliente “${cliente}” (${servicos.length} serviço(s))`, null, { cliente, servicos, sites });
    return res.status(201).json({ ok: true, id: ins.insertId, message: "Canguru liberado para o cliente" });
  } catch (e) { return falha(res, e, "canguru.liberar", "Erro ao liberar o Canguru"); }
}

async function canguruRevogar(req, res) {
  const c = R.contextoCoord(req, res); if (!c) return;
  try {
    const id = idParam(req); if (!id) return R.erro(res, 404, "Liberação não encontrada");
    const [[l]] = await pool.query(`SELECT * FROM rh_canguru_liberacoes WHERE id = ? AND empresa_id = ?`, [id, c.empresaId]);
    if (!l) return R.erro(res, 404, "Liberação não encontrada");
    if (l.revogado_em) return res.status(409).json({ ok: false, message: "Esta liberação já foi retirada." });
    await pool.query(`UPDATE rh_canguru_liberacoes SET revogado_em = NOW(), revogado_por_nome = ? WHERE id = ? AND empresa_id = ?`, [req.user.nome ?? null, id, c.empresaId]);
    auditar(req, "revogar", "rh_canguru_liberacao", id, `Retirou a liberação do Canguru para o cliente “${l.cliente}”`, { cliente: l.cliente }, null);
    return res.json({ ok: true, message: "Liberação retirada. O cliente não vê mais o Canguru." });
  } catch (e) { return falha(res, e, "canguru.revogar", "Erro ao retirar a liberação"); }
}

/** Escopo (serviços/sites) do usuário: união das liberações ativas dos clientes dele. Sem liberação, null. */
async function escopoCanguru(c) {
  const [rows] = await pool.query(`SELECT * FROM rh_canguru_liberacoes WHERE empresa_id = ? AND revogado_em IS NULL ORDER BY id DESC`, [c.empresaId]);
  const minhas = rows.filter((l) => c.chaves.includes(l.cliente_chave));
  if (!minhas.length) return null;
  const servicos = [...new Set(minhas.flatMap((l) => lista(l.servicos)))];
  // Se qualquer liberação não restringe sites, vale todos os sites dos serviços dela; senão, a união dos sites.
  const sites = minhas.some((l) => !lista(l.sites).length) ? [] : [...new Set(minhas.flatMap((l) => lista(l.sites)))];
  return { servicos, sites, clientes: minhas.map((l) => l.cliente) };
}

function filtrosCliente(esc, q) {
  const dia = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);
  return { servicos: esc.servicos, sites: esc.sites, de: dia(q.de), ate: dia(q.ate) };
}

/** Relatório do Canguru já sem nada que identifique alguém ou liste o que está fora do escopo. */
async function relatorioCanguruCliente(c, q) {
  const esc = await escopoCanguru(c); if (!esc) return null;
  const r = await CanguruS.resultado(c.empresaId, filtrosCliente(esc, q), false);
  const cfg = r.config;
  const base = { ok: true, publico: "cliente", publico_rotulo: "Cliente", clientes: esc.clientes };
  if (r.geral.novatos < cfg.min_grupo) return { ...base, poucos: true, mensagem: `Ainda há poucos novatos avaliados (menos de ${cfg.min_grupo}) para mostrar o resultado sem identificar ninguém.`, min_grupo: cfg.min_grupo };
  delete r.filtros; delete r.nominal;
  r.filtros_aplicados = { site: null, servico: null, de: r.filtros_aplicados.de, ate: r.filtros_aplicados.ate };
  return { ...base, ...r };
}

async function canguruInfo(req, res) {
  const c = await R.contextoCliente(req, res); if (!c) return;
  try { const esc = await escopoCanguru(c); return res.json({ ok: true, liberado: !!esc, clientes: esc?.clientes || [] }); }
  catch (e) { return falha(res, e, "canguru.info", "Erro ao verificar o Canguru"); }
}
async function canguruRelatorio(req, res) {
  const c = await R.contextoCliente(req, res); if (!c) return;
  try {
    const r = await relatorioCanguruCliente(c, req.query); if (!r) return R.erro(res, 404, "O Canguru não está liberado para o seu cliente.");
    await R.registrarLeitura(req, c.empresaId, "cliente_canguru", null, "Cliente abriu o relatório do Canguru");
    return res.json(r);
  } catch (e) { return falha(res, e, "canguru.relatorio", "Erro ao montar o relatório do Canguru"); }
}
async function canguruExportar(req, res) {
  const c = await R.contextoCliente(req, res); if (!c) return;
  try {
    const r = await relatorioCanguruCliente(c, req.query); if (!r) return R.erro(res, 404, "O Canguru não está liberado para o seu cliente.");
    if (r.poucos) return R.erro(res, 409, r.mensagem);
    const buf = await CanguruC.excelDoCanguru(r, "cliente", null);
    await R.registrarLeitura(req, c.empresaId, "cliente_canguru", null, "Cliente baixou o Excel do Canguru");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="canguru_${R.hojeISO()}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (e) { return falha(res, e, "canguru.exportar", "Erro ao exportar o Canguru"); }
}
async function canguruComparativo(req, res) {
  const c = await R.contextoCliente(req, res); if (!c) return;
  try {
    const esc = await escopoCanguru(c); if (!esc) return R.erro(res, 404, "O Canguru não está liberado para o seu cliente.");
    const p = CanguruC.periodos(req.query);
    const r = await CanguruS.compararPeriodos(c.empresaId, { servicos: esc.servicos, sites: esc.sites }, p.a, p.b);
    delete r.filtros_aplicados;
    await R.registrarLeitura(req, c.empresaId, "cliente_canguru", null, "Cliente abriu o comparativo do Canguru");
    return res.json({ ok: true, clientes: esc.clientes, ...r });
  } catch (e) { return falha(res, e, "canguru.comparativo", "Erro ao comparar os períodos"); }
}

// ═══ 4) Comparativo do Clima para o cliente ══════════════════════════
// Só entre duas pesquisas que estão liberadas para o cliente. Recortes: apenas os permitidos para o público "cliente".
async function cicloPar(c, q) {
  const libs = await liberacoesDoUsuario(c);
  const ids = [...new Set(libs.map((l) => Number(l.ciclo_id)))];
  const ciclos = [];
  for (const id of ids) { const x = await S.carregarCiclo(c.empresaId, id); if (x) ciclos.push(x); }
  ciclos.sort((a, b) => String(b.data_fim || "").localeCompare(String(a.data_fim || "")) || b.id - a.id);
  const n = (v) => { const k = Number(v); return Number.isInteger(k) && k > 0 ? k : null; };
  const idB = n(q.b) || ciclos[0]?.id, idA = n(q.a) || ciclos.find((x) => x.id !== idB)?.id;
  const a = ciclos.find((x) => x.id === idA), b = ciclos.find((x) => x.id === idB);
  return { ciclos, a, b };
}
async function comparativoClima(req, res) {
  const c = await R.contextoCliente(req, res); if (!c) return;
  try {
    const par = await cicloPar(c, req.query);
    if (par.ciclos.length < 2) return res.json({ ok: true, disponivel: false, ciclos: par.ciclos.map(ciclo_publico), mensagem: "Para comparar, o RH precisa liberar pelo menos duas pesquisas para o seu cliente." });
    if (!par.a || !par.b || par.a.id === par.b.id) return R.erro(res, 400, "Escolha duas pesquisas diferentes entre as liberadas.");
    const permitidos = Clima.PUBLICOS.cliente.recortes;
    const rec = req.query.recorte ? String(req.query.recorte) : null;
    if (rec && !permitidos.includes(rec)) return R.erro(res, 400, "Recorte não disponível.");
    const r = await S.comparar(c.empresaId, par.a, par.b, rec, false);
    r.a = ciclo_publico(par.a); r.b = ciclo_publico(par.b);
    await R.registrarLeitura(req, c.empresaId, "cliente_relatorio", par.b.id, "Cliente abriu o comparativo de pesquisas");
    return res.json({ ok: true, disponivel: true, ...r, ciclos: par.ciclos.map(ciclo_publico), recortes_disponiveis: S.tiposRecorte().filter((t) => permitidos.includes(t.tipo)) });
  } catch (e) { return falha(res, e, "comparativo", "Erro ao comparar as pesquisas"); }
}
async function comparativoClimaExportar(req, res) {
  const c = await R.contextoCliente(req, res); if (!c) return;
  try {
    const par = await cicloPar(c, req.query);
    if (!par.a || !par.b || par.a.id === par.b.id) return R.erro(res, 400, "Escolha duas pesquisas diferentes entre as liberadas.");
    const rec = req.query.recorte ? String(req.query.recorte) : null;
    if (rec && !Clima.PUBLICOS.cliente.recortes.includes(rec)) return R.erro(res, 400, "Recorte não disponível.");
    const r = await S.comparar(c.empresaId, par.a, par.b, rec, false);
    r.a = ciclo_publico(par.a); r.b = ciclo_publico(par.b);
    const buf = await Clima.excelDoComparativo(r);
    await R.registrarLeitura(req, c.empresaId, "cliente_relatorio", par.b.id, "Cliente baixou o comparativo de pesquisas");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="comparativo_clima_${R.hojeISO()}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (e) { return falha(res, e, "comparativo.exportar", "Erro ao exportar o comparativo"); }
}

module.exports = { listarLiberacoes, clientesConhecidos, liberar, revogar, eu, meusCiclos, relatorio, exportar, planos, canguruListarLiberacoes, canguruLiberar, canguruRevogar, canguruInfo, canguruRelatorio, canguruExportar, canguruComparativo, comparativoClima, comparativoClimaExportar };
