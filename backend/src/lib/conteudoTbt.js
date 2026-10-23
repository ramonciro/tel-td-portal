/**
 * conteudoTbt.js — Produção de conteúdo, Pacote 3 (23/10/2026)
 *
 * O #TBT do analista é o material criado DEPOIS de uma ação em piso: o instrutor
 * abre e realiza a turma de TBT e, só então, o analista produz o material. Por
 * isso não existe "pedido semanal automático": o gatilho é a turma realizada.
 *
 * Este arquivo concentra:
 *  - a série de cada cliente ("#TBT Mercantil"), semeada de forma preguiçosa;
 *  - o vínculo do pedido com a série pelo título/cliente do histórico;
 *  - a lista de "TBT realizadas que ainda não têm material" (pendentes), usada
 *    pela aba "TBT e séries" e pelo aviso do sino.
 *
 * Como o portal reconhece uma turma de TBT (não há campo próprio no cadastro):
 *  1) o tema da turma tem "TBT"; ou
 *  2) a turma tem instrutores adicionais (a TBT é feita por mais de um instrutor).
 * Se o critério pegar uma turma que não é TBT, a pessoa marca "Não precisa de
 * material" e ela sai da lista. Qualquer turma ainda pode virar pedido pelo
 * seletor de turmas, mesmo fora desse critério.
 */
const pool = require("./db");
const C = require("./conteudo");

const DIAS_PADRAO = 45;
const DIAS_MAX = 365;

const SERIES_PADRAO = [
  ["#TBT Mercantil", "Mercantil"],
  ["#TBT Siclos", "Siclos"],
  ["#TBT Prefeitura", "Prefeitura de Salvador"],
  ["#TBT Rede Américas", "Rede Américas"],
];
const TIPO_TBT = "Material para Postagem";

const filtroEmpresa = (empresaId, alias = "") =>
  empresaId ? { sql: ` AND ${alias}empresa_id = ?`, params: [empresaId] } : { sql: "", params: [] };

/** "Mercantil" ≈ "Banco Mercantil": igual sem acento, ou um contém o outro (mín. 4 letras). */
function mesmoCliente(a, b) {
  const x = C.sansAcento(a);
  const y = C.sansAcento(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [menor, maior] = x.length <= y.length ? [x, y] : [y, x];
  return menor.length >= 4 && maior.includes(menor);
}

const jaSemeou = new Set();

/**
 * Garante as 4 séries iniciais da empresa (só quando ela ainda não tem nenhuma) e
 * liga ao seu cliente os pedidos antigos cujo título tem "tbt". Idempotente.
 */
async function garantirSeries(empresaId) {
  const chaveEmp = String(empresaId ?? "global");
  const f = filtroEmpresa(empresaId);
  const emp = empresaId ? "empresa_id = ?" : "empresa_id IS NULL";
  const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM conteudo_series WHERE ${emp}`, empresaId ? [empresaId] : []);
  if (n === 0) {
    const [[tipo]] = await pool.query(
      `SELECT id FROM conteudo_tipos WHERE nome = ? AND ${emp} LIMIT 1`,
      [TIPO_TBT, ...(empresaId ? [empresaId] : [])]
    );
    for (const [nome, cliente] of SERIES_PADRAO) {
      await pool.query(
        `INSERT IGNORE INTO conteudo_series (empresa_id, nome, cliente, gatilho, tipo_id) VALUES (?, ?, ?, 'tbt', ?)`,
        [empresaId || null, nome, cliente, tipo?.id || null]
      );
    }
  }
  if (jaSemeou.has(chaveEmp)) return;
  jaSemeou.add(chaveEmp);
  // Histórico: pedidos com "tbt" no título entram na série do mesmo cliente.
  const [series] = await pool.query(`SELECT id, cliente FROM conteudo_series WHERE gatilho = 'tbt'${f.sql}`, f.params);
  for (const s of series) {
    await pool.query(
      `UPDATE conteudo_pedidos SET serie_id = ?
        WHERE serie_id IS NULL AND LOWER(titulo) LIKE '%tbt%' AND LOWER(cliente) = LOWER(?)${f.sql}`,
      [s.id, s.cliente, ...f.params]
    );
  }
}

/** Série ativa do cliente (a primeira que casar). */
async function serieDoCliente(empresaId, cliente) {
  const f = filtroEmpresa(empresaId);
  const [series] = await pool.query(
    `SELECT id, nome, cliente, tipo_id FROM conteudo_series WHERE ativo = 1 AND gatilho = 'tbt'${f.sql} ORDER BY id`,
    f.params
  );
  return series.find((s) => mesmoCliente(s.cliente, cliente)) || null;
}

const FMT = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s')`;

const cache = new Map(); // `${empresaId}|${dias}` -> { quando, itens }
const CACHE_MS = 60 * 1000;
function limparCache() { cache.clear(); }

/**
 * Turmas de TBT já realizadas, dentro dos últimos `dias`, sem nenhum pedido ativo
 * ligado e sem dispensa. Mais antigas primeiro (são as que mais esperam).
 */
async function tbtPendentes(empresaId, dias = DIAS_PADRAO) {
  dias = Math.min(Math.max(Number(dias) || DIAS_PADRAO, 1), DIAS_MAX);
  const k = `${empresaId ?? "global"}|${dias}`;
  const c = cache.get(k);
  if (c && Date.now() - c.quando < CACHE_MS) return c.itens;

  await garantirSeries(empresaId);
  const f = filtroEmpresa(empresaId, "t.");
  const hoje = C.hojeBahia();
  const desde = C.somarDias(hoje, -dias);
  const [rows] = await pool.query(
    `SELECT t.id, t.tema, t.cliente, t.instrutor, t.status, ${FMT("t.data_inicio")} AS data_inicio, ${FMT("t.data_fim")} AS data_fim,
            DATE_FORMAT(t.data, '%Y-%m-%d') AS data,
            DATE_FORMAT(COALESCE(t.data_fim, t.data_inicio, t.data), '%Y-%m-%d') AS dia_fim,
            (SELECT COUNT(*) FROM treinamento_instrutores ti WHERE ti.treinamento_id = t.id) AS n_adicionais
       FROM treinamentos t
      WHERE COALESCE(t.data_fim, t.data_inicio, t.data) >= ?
        AND COALESCE(t.data_fim, t.data_inicio, t.data) < DATE_ADD(?, INTERVAL 1 DAY)
        AND (LOWER(t.tema) LIKE '%tbt%'
             OR EXISTS (SELECT 1 FROM treinamento_instrutores ti2 WHERE ti2.treinamento_id = t.id))
        AND NOT EXISTS (SELECT 1 FROM conteudo_pedidos p WHERE p.treinamento_id = t.id AND p.status <> 'cancelado')
        AND NOT EXISTS (SELECT 1 FROM conteudo_tbt_dispensas d WHERE d.treinamento_id = t.id)${f.sql}
      ORDER BY COALESCE(t.data_fim, t.data_inicio, t.data) ASC, t.id ASC`,
    [desde, hoje, ...f.params]
  );
  let itens = [];
  if (rows.length) {
    const { getResumoPresenca } = require("../services/presencaResolver");
    const resumo = await getResumoPresenca({ empresaId });
    const statusPorId = new Map(resumo.map((r) => [Number(r.id), r.status_turma]));
    const ids = rows.map((r) => r.id);
    const [ad] = await pool.query(
      `SELECT treinamento_id, instrutor FROM treinamento_instrutores WHERE treinamento_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`,
      ids
    );
    const adMapa = new Map();
    for (const a of ad) {
      if (!adMapa.has(a.treinamento_id)) adMapa.set(a.treinamento_id, []);
      adMapa.get(a.treinamento_id).push(a.instrutor);
    }
    const sf = filtroEmpresa(empresaId);
    const [series] = await pool.query(
      `SELECT id, nome, cliente FROM conteudo_series WHERE ativo = 1 AND gatilho = 'tbt'${sf.sql} ORDER BY id`,
      sf.params
    );
    const { todosOsInstrutores } = require("./instrutoresTurma");
    for (const r of rows) {
      const status = statusPorId.get(Number(r.id));
      if (status !== "Concluída") continue; // só o que o instrutor já realizou
      const serie = series.find((s) => mesmoCliente(s.cliente, r.cliente)) || null;
      const tbtPeloTema = /tbt/i.test(r.tema || "");
      const dias_espera = Math.max(0, Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${r.dia_fim}T00:00:00Z`)) / 86400000));
      itens.push({
        id: r.id,
        tema: r.tema,
        cliente: r.cliente,
        instrutores: todosOsInstrutores(r.instrutor, adMapa.get(r.id) || []),
        realizada_em: r.dia_fim,
        dias_espera,
        serie: serie ? { id: serie.id, nome: serie.nome } : null,
        motivo: tbtPeloTema ? "tema" : "co-instrutores",
      });
    }
  }
  cache.set(k, { quando: Date.now(), itens });
  if (cache.size > 200) cache.clear();
  return itens;
}

module.exports = { DIAS_PADRAO, DIAS_MAX, SERIES_PADRAO, TIPO_TBT, mesmoCliente, garantirSeries, serieDoCliente, tbtPendentes, limparCache, filtroEmpresa };
