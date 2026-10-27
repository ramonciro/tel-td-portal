/**
 * rpOrigemService.js — RP de origem da turma de Avaliação Técnica (27/10/2026)
 *
 * Liga uma turma de Avaliação Técnica à RP do R&S que a originou (treinamentos.rp_id).
 * Até aqui o Radar adivinhava a ligação por data (±3 dias) e nome. Com o vínculo exato,
 * a conta deixa de depender de coincidência.
 *
 * Regras:
 *  - A RP precisa ser do MESMO ambiente (empresa_id) da turma, não estar na lixeira
 *    nem cancelada.
 *  - Só turma de Avaliação Técnica guarda RP de origem (outro subtipo limpa o campo).
 *  - Uma RP pode ter várias turmas (ex.: duas levas de candidatos).
 *  - Sugestão (nunca grava sozinha): RP operacional em andamento do mesmo ambiente com
 *    início da avaliação a até 3 dias do início da turma; se mais de uma, a que casa
 *    pelo nome (produto/site × cliente/tema) vem primeiro.
 */

const pool = require("../lib/db");
const { nomesAvaliacaoTecnica } = require("../lib/subtipos");

const TOLERANCIA_DIAS = 3;

const semAcento = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function diasEntreISO(a, b) {
  if (!a || !b) return null;
  const da = new Date(`${String(a).slice(0, 10)}T00:00:00Z`);
  const db = new Date(`${String(b).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return null;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

const COLUNAS_RP = `r.id, r.empresa_id, r.site, r.setor, r.produto, r.cargo, r.chamado, r.status,
  r.hcs, r.hcs_com_to, r.hcs_aprovados,
  DATE_FORMAT(r.inicio_av_tecnica, '%Y-%m-%d') AS inicio_av, DATE_FORMAT(r.final_av_tecnica, '%Y-%m-%d') AS final_av`;

function semColuna(e) {
  return e && (e.code === "ER_NO_SUCH_TABLE" || e.code === "ER_BAD_FIELD_ERROR");
}

/** O nome da turma lembra o produto ou o site da RP? */
function nomeConfere(rp, turma) {
  const dicas = [semAcento(rp.produto), semAcento(rp.site)].filter((x) => x.length >= 3);
  const cli = semAcento(turma.cliente);
  const tema = semAcento(turma.tema);
  return dicas.some((d) => (cli && cli.includes(d)) || (tema && tema.includes(d)) || (cli.length >= 3 && d.includes(cli)));
}

/**
 * Escolhe a RP mais provável para uma turma. `rps` já deve ser do mesmo ambiente.
 * Devolve { rp, confere_pelo_nome, dias } ou null.
 */
function sugerirRP(turma, rps) {
  const ini = turma.ini || turma.data_inicio;
  if (!ini) return null;
  const candidatas = rps
    .map((r) => ({ r, dias: diasEntreISO(r.inicio_av, ini) }))
    .filter((c) => c.dias !== null && Math.abs(c.dias) <= TOLERANCIA_DIAS);
  if (!candidatas.length) return null;
  candidatas.sort((a, b) => {
    const na = nomeConfere(a.r, turma) ? 0 : 1;
    const nb = nomeConfere(b.r, turma) ? 0 : 1;
    return na - nb || Math.abs(a.dias) - Math.abs(b.dias) || a.r.id - b.r.id;
  });
  const m = candidatas[0];
  return { rp: m.r, confere_pelo_nome: nomeConfere(m.r, turma), dias: m.dias };
}

/** RPs que podem ser origem de uma turma (operacionais, em andamento, do ambiente). */
async function carregarRPsAbertas(empresaId) {
  try {
    const [rows] = await pool.query(
      `SELECT ${COLUNAS_RP},
              (SELECT COUNT(*) FROM treinamentos t WHERE t.rp_id = r.id) AS turmas_vinculadas
         FROM rps r
        WHERE r.empresa_id = ? AND r.excluido_em IS NULL AND r.setor = 'OPERACIONAL' AND r.status = 'EM ANDAMENTO'
        ORDER BY (r.inicio_av_tecnica IS NULL), r.inicio_av_tecnica DESC, r.id DESC
        LIMIT 300`,
      [empresaId]
    );
    return rows;
  } catch (e) {
    if (semColuna(e)) return [];
    throw e;
  }
}

/**
 * Lista para o seletor do formulário da turma. `turma` = { cliente, tema, data_inicio } opcional
 * (usado só para marcar a sugerida). `rpAtualId` entra mesmo que não esteja mais "em andamento".
 */
async function rpsElegiveis({ empresaId, turma = {}, rpAtualId = null }) {
  const abertas = await carregarRPsAbertas(empresaId);
  const sug = sugerirRP({ cliente: turma.cliente, tema: turma.tema, ini: turma.data_inicio }, abertas);
  const lista = abertas.map((r) => ({ ...r, turmas_vinculadas: Number(r.turmas_vinculadas) || 0, sugerida: !!(sug && sug.rp.id === r.id) }));
  if (rpAtualId && !lista.some((r) => r.id === Number(rpAtualId))) {
    const atual = await buscarRP(rpAtualId, empresaId);
    if (atual) lista.unshift({ ...atual, turmas_vinculadas: 0, sugerida: false, fora_da_lista: true });
  }
  if (turma.data_inicio) {
    lista.sort((a, b) => {
      if (a.sugerida !== b.sugerida) return a.sugerida ? -1 : 1;
      const da = a.inicio_av ? Math.abs(diasEntreISO(a.inicio_av, turma.data_inicio)) : 9999;
      const db = b.inicio_av ? Math.abs(diasEntreISO(b.inicio_av, turma.data_inicio)) : 9999;
      return da - db;
    });
  }
  return { rps: lista, sugestao: sug ? { rp_id: sug.rp.id, confere_pelo_nome: sug.confere_pelo_nome, dias: sug.dias } : null };
}

async function buscarRP(rpId, empresaId) {
  try {
    const [rows] = await pool.query(
      `SELECT ${COLUNAS_RP}, r.excluido_em FROM rps r WHERE r.id = ? ${empresaId ? "AND r.empresa_id = ?" : ""} LIMIT 1`,
      empresaId ? [rpId, empresaId] : [rpId]
    );
    return rows[0] || null;
  } catch (e) {
    if (semColuna(e)) return null;
    throw e;
  }
}

/**
 * Valida o vínculo. Devolve o id numérico (ou null para limpar). Lança Error com .status 400.
 * `empresaTurma` é o ambiente da turma.
 */
async function validarRpDaTurma(rpIdBruto, empresaTurma) {
  if (rpIdBruto === null || rpIdBruto === undefined || rpIdBruto === "") return null;
  const id = Number(rpIdBruto);
  if (!Number.isInteger(id) || id <= 0) {
    const erro = new Error("RP de origem inválida.");
    erro.status = 400;
    throw erro;
  }
  const rp = await buscarRP(id, empresaTurma || null);
  const falha = (msg) => {
    const erro = new Error(msg);
    erro.status = 400;
    return erro;
  };
  if (!rp || rp.excluido_em) throw falha("RP de origem não encontrada neste ambiente.");
  if (empresaTurma && Number(rp.empresa_id) !== Number(empresaTurma)) throw falha("A RP de origem precisa ser do mesmo ambiente da turma.");
  if (rp.status === "CANCELADA") throw falha("Esta RP está cancelada e não pode ser a origem de uma turma.");
  return id;
}

/** Dados da RP para mostrar na turma / relatório. */
async function rpDaTurma(rpId, empresaId) {
  if (!rpId) return null;
  const rp = await buscarRP(rpId, empresaId || null);
  if (!rp || rp.excluido_em) return null;
  const { excluido_em, ...dados } = rp;
  return dados;
}

/** Turmas ligadas a uma RP (para a tela da RP). */
async function turmasDaRP(rpId, empresaId) {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.tema, t.cliente, t.status, DATE_FORMAT(COALESCE(t.data_inicio, t.data), '%Y-%m-%d') AS data_inicio
         FROM treinamentos t WHERE t.rp_id = ? AND t.empresa_id = ? ORDER BY COALESCE(t.data_inicio, t.data) ASC, t.id ASC`,
      [rpId, empresaId]
    );
    return rows;
  } catch (e) {
    if (semColuna(e)) return [];
    throw e;
  }
}

/** Solta o vínculo das turmas (RP cancelada ou enviada à lixeira). Devolve quantas turmas soltou. */
async function soltarTurmasDaRP(rpId, empresaId) {
  try {
    const [r] = await pool.query(`UPDATE treinamentos SET rp_id = NULL WHERE rp_id = ? AND empresa_id = ?`, [rpId, empresaId]);
    return r.affectedRows || 0;
  } catch (e) {
    if (semColuna(e)) return 0;
    throw e;
  }
}

/**
 * Sugestões em lote: turmas de Avaliação Técnica sem RP (não canceladas, a partir de 60 dias atrás)
 * × RP sugerida. `empresaId` null = todos os ambientes (assistente).
 */
async function sugestoesEmLote({ empresaId }) {
  const { nomes } = await nomesAvaliacaoTecnica();
  if (!nomes.length) return [];
  let turmas = [];
  try {
    [turmas] = await pool.query(
      `SELECT t.id, t.tema, t.cliente, t.empresa_id, DATE_FORMAT(COALESCE(t.data_inicio, t.data), '%Y-%m-%d') AS ini
         FROM treinamentos t
        WHERE t.subtipo IN (${nomes.map(() => "?").join(",")}) AND t.rp_id IS NULL
          AND (t.status IS NULL OR LOWER(TRIM(t.status)) NOT LIKE '%cancel%')
          AND COALESCE(DATE(t.data_inicio), t.data) >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
          ${empresaId ? "AND t.empresa_id = ?" : ""}
        ORDER BY COALESCE(t.data_inicio, t.data) ASC, t.id ASC LIMIT 300`,
      [...nomes, ...(empresaId ? [empresaId] : [])]
    );
  } catch (e) {
    if (semColuna(e)) return [];
    throw e;
  }
  const porEmpresa = {};
  const out = [];
  for (const t of turmas) {
    if (!porEmpresa[t.empresa_id]) porEmpresa[t.empresa_id] = await carregarRPsAbertas(t.empresa_id);
    const s = sugerirRP(t, porEmpresa[t.empresa_id]);
    if (!s) continue;
    out.push({
      turma: { id: t.id, tema: t.tema, cliente: t.cliente, data_inicio: t.ini },
      rp: {
        id: s.rp.id, chamado: s.rp.chamado, site: s.rp.site, produto: s.rp.produto, cargo: s.rp.cargo,
        inicio_av: s.rp.inicio_av, hcs_com_to: s.rp.hcs_com_to,
      },
      dias: s.dias,
      confere_pelo_nome: s.confere_pelo_nome,
    });
  }
  return out;
}

module.exports = {
  TOLERANCIA_DIAS, sugerirRP, nomeConfere, rpsElegiveis, validarRpDaTurma, rpDaTurma, turmasDaRP,
  soltarTurmasDaRP, sugestoesEmLote, buscarRP,
};
