/**
 * rpClienteService.js — RP ligada ao cliente (17/11/2026)
 *
 * Até aqui a RP guardava só o texto do Produto e o portal "adivinhava" o cliente pelo nome
 * (Radar, lista de RPs elegíveis). Agora a RP tem `rps.cliente_id` (cliente ativo do mesmo
 * ambiente, menu Clientes). Com isso a turma lista as RPs do cliente escolhido e o Radar
 * deixa de esconder RP por diferença de grafia.
 *
 * Regras:
 *  - cliente_id é opcional na API (importação e RPs antigas podem ficar sem cliente);
 *    a tela exige a escolha quando o ambiente tem clientes ativos cadastrados.
 *  - O cliente precisa ser do MESMO ambiente (empresa_id) e não estar Inativo.
 *  - Ao ligar a RP a um cliente, o texto `produto` passa a ser o nome do cliente
 *    (os relatórios do R&S agrupam por produto).
 *  - RPs antigas são ligadas sozinhas SÓ quando o nome do produto casa com exatamente um
 *    cliente ativo do ambiente; ambíguas ou sem correspondência ficam "sem cliente" para
 *    a coordenação do R&S ligar na mão.
 *  - Compatível com banco sem a coluna (migração ainda não rodou): tudo vira no-op.
 */

const pool = require("../lib/db");
const { chavesDeAreas, semAcento: semAcentoArea } = require("../lib/rsAreas");

const semAcento = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function semColuna(e) {
  return e && (e.code === "ER_NO_SUCH_TABLE" || e.code === "ER_BAD_FIELD_ERROR");
}

function erro400(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

// ── detecção da coluna (cache curto; só cacheia "sim" por mais tempo) ─────────────────────────
let _cache = { tem: null, em: 0 };
async function rpsTemClienteId() {
  const agora = Date.now();
  if (_cache.tem === true) return true;
  if (_cache.tem === false && agora - _cache.em < 60000) return false;
  try {
    const [c] = await pool.query("SHOW COLUMNS FROM rps LIKE 'cliente_id'");
    _cache = { tem: c.length > 0, em: agora };
  } catch (_) {
    _cache = { tem: false, em: agora };
  }
  return _cache.tem;
}
function _resetCache() { _cache = { tem: null, em: 0 }; }

// ── clientes ──────────────────────────────────────────────────────────────────────────────
/** Clientes ativos do ambiente (menu Clientes). */
async function clientesAtivos(empresaId) {
  try {
    const [rows] = await pool.query(
      `SELECT id, nome FROM clientes
        WHERE empresa_id = ? AND (status IS NULL OR status <> 'Inativo')
        ORDER BY nome`,
      [empresaId]
    );
    return rows;
  } catch (e) {
    if (semColuna(e)) return [];
    throw e;
  }
}

/** O texto do produto "casa" com o nome do cliente? (mesma regra do Radar: um contém o outro) */
function produtoCasaComCliente(produto, nomeCliente) {
  const p = semAcento(produto);
  const c = semAcento(nomeCliente);
  if (!p || c.length < 3) return false;
  return p.includes(c) || (p.length >= 3 && c.includes(p));
}

/**
 * Cliente sugerido para um produto: igualdade exata (sem acento/maiúscula) primeiro; senão,
 * o único cliente que casa por "contém". Ambíguo ou sem correspondência: null.
 */
function sugerirCliente(produto, clientes) {
  const p = semAcento(produto);
  if (!p) return null;
  const exatos = clientes.filter((c) => semAcento(c.nome) === p);
  if (exatos.length === 1) return exatos[0];
  if (exatos.length > 1) return null;
  const parecidos = clientes.filter((c) => produtoCasaComCliente(produto, c.nome));
  return parecidos.length === 1 ? parecidos[0] : null;
}

/** Cliente de uma turma/filtro pelo NOME (a turma guarda o nome do cliente em texto). */
async function clientePorNome(empresaId, nome) {
  const n = semAcento(nome);
  if (!n) return null;
  const lista = await clientesAtivos(empresaId);
  return lista.find((c) => semAcento(c.nome) === n) || null;
}

/**
 * Valida o cliente escolhido na RP. Devolve { id, nome } ou null (limpar).
 * Lança Error com .status 400 quando o cliente não existe, é de outro ambiente ou está inativo.
 */
async function validarClienteDaRP(clienteIdBruto, empresaId) {
  if (clienteIdBruto === null || clienteIdBruto === undefined || clienteIdBruto === "") return null;
  const id = Number(clienteIdBruto);
  if (!Number.isInteger(id) || id <= 0) throw erro400("Cliente inválido.");
  let cli;
  try {
    const [rows] = await pool.query(
      `SELECT id, nome, empresa_id, status FROM clientes WHERE id = ? LIMIT 1`, [id]
    );
    cli = rows[0];
  } catch (e) {
    if (semColuna(e)) throw erro400("Cadastro de clientes indisponível neste ambiente.");
    throw e;
  }
  if (!cli || Number(cli.empresa_id) !== Number(empresaId)) throw erro400("Cliente não encontrado neste ambiente.");
  if (String(cli.status || "").toLowerCase() === "inativo") throw erro400(`O cliente "${cli.nome}" está inativo. Reative-o em Clientes ou escolha outro.`);
  return { id: cli.id, nome: cli.nome };
}

/** Grava (ou limpa) o cliente da RP. No-op se o banco ainda não tem a coluna. */
async function gravarClienteDaRP(rpId, empresaId, clienteId) {
  if (!(await rpsTemClienteId())) return false;
  try {
    await pool.query(`UPDATE rps SET cliente_id = ? WHERE id = ? AND empresa_id = ?`, [clienteId || null, rpId, empresaId]);
    return true;
  } catch (e) {
    if (semColuna(e)) return false;
    throw e;
  }
}

/**
 * Liga sozinho as RPs sem cliente quando o produto casa com UM cliente ativo do ambiente.
 * `empresaId` null = todos os ambientes. Idempotente. Devolve { ligadas, semCorrespondencia }.
 */
async function vincularClientesAutomatico({ empresaId = null } = {}) {
  if (!(await rpsTemClienteId())) return { ligadas: 0, semCorrespondencia: 0 };
  let rps;
  try {
    [rps] = await pool.query(
      `SELECT id, empresa_id, produto FROM rps WHERE cliente_id IS NULL AND excluido_em IS NULL${empresaId ? " AND empresa_id = ?" : ""}`,
      empresaId ? [empresaId] : []
    );
  } catch (e) {
    if (semColuna(e)) return { ligadas: 0, semCorrespondencia: 0 };
    throw e;
  }
  const cache = new Map();
  let ligadas = 0;
  let sem = 0;
  for (const r of rps) {
    if (!cache.has(r.empresa_id)) cache.set(r.empresa_id, await clientesAtivos(r.empresa_id));
    const lista = cache.get(r.empresa_id);
    const cli = sugerirCliente(r.produto, lista);
    if (!cli) { sem += 1; continue; }
    await pool.query(`UPDATE rps SET cliente_id = ? WHERE id = ? AND cliente_id IS NULL`, [cli.id, r.id]);
    ligadas += 1;
  }
  return { ligadas, semCorrespondencia: sem };
}

/** RPs (não excluídas, não canceladas) sem cliente, com a sugestão do portal, para a tela de revisão. */
async function rpsSemCliente(empresaId) {
  if (!(await rpsTemClienteId())) return { rps: [], clientes: [] };
  const clientes = await clientesAtivos(empresaId);
  // Ambiente sem cliente ativo cadastrado: não há o que ligar.
  if (!clientes.length) return { rps: [], clientes: [], ambiente: null };
  const [rps] = await pool.query(
    `SELECT id, site, setor, produto, cargo, chamado, status,
            DATE_FORMAT(mes_referencia, '%Y-%m') AS mes
       FROM rps
      WHERE empresa_id = ? AND cliente_id IS NULL AND excluido_em IS NULL AND status <> 'CANCELADA'
      ORDER BY mes_referencia DESC, id DESC LIMIT 300`,
    [empresaId]
  );
  const areas = await chavesDeAreas(empresaId);
  // Diagnóstico: o produto da RP existe como cliente ATIVO em OUTRO ambiente (só o aviso; nada de outro ambiente é exibido ou ligado).
  const [outros] = await pool.query(
    `SELECT nome FROM clientes WHERE empresa_id <> ? AND (status IS NULL OR status <> 'Inativo')`, [empresaId]
  ).catch(() => [[]]);
  const nomeAmbiente = await pool.query(`SELECT nome FROM empresas WHERE id = ? LIMIT 1`, [empresaId]).then(([r]) => (r[0] && r[0].nome) || null).catch(() => null);
  const lista = rps.filter((r) => !areas.has(semAcentoArea(r.produto))).map((r) => {
    const s = sugerirCliente(r.produto, clientes);
    const emOutro = !s && !!sugerirCliente(r.produto, outros);
    return { ...r, cliente_sugerido_id: s ? s.id : null, cliente_em_outro_ambiente: emOutro };
  });
  return { rps: lista, clientes, ambiente: nomeAmbiente };
}

module.exports = {
  semAcento, rpsTemClienteId, _resetCache, clientesAtivos, produtoCasaComCliente, sugerirCliente,
  clientePorNome, validarClienteDaRP, gravarClienteDaRP, vincularClientesAutomatico, rpsSemCliente,
};
