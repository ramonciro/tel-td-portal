/**
 * trilhaPessoa.js — participantes e progresso das Trilhas, pessoa a pessoa
 * (Fase 3, 16/10/2026). Proposta e decisões em
 * claude/proposta-presenca-desenvolvimento-jornadas-trilhas-2026-10-13.md.
 *
 * Modelo:
 *  - trilha_participantes: quem está na trilha (origem "jornada" = veio da
 *    sincronização com os participantes das jornadas ligadas à trilha;
 *    "manual" = incluído pelo cadastro único). Remover = situacao "removido".
 *  - trilha_progresso_pessoa: etapa concluída por pessoa. Sem linha = não concluída.
 *
 * Isolamento: a trilha é sempre conferida por trilhas_aprendizagem.empresa_id;
 * jornadas são conferidas por jornadas_desenvolvimento.empresa_id.
 */
const db = require("./db");
const { usuarioTemAcessoAoCliente } = require("./acessoCliente");

function hojeBahia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
}

function arred(v, c = 1) {
  const f = 10 ** c;
  return Math.round(Number(v) * f) / f;
}

function statusCancelado(valor) {
  return ["cancelada", "cancelado"].includes(String(valor || "").trim().toLowerCase());
}

function normMatricula(m) {
  return String(m || "").trim().toLowerCase().replace(/\s+/g, "");
}

// Chaves candidatas da mesma pessoa, da mais forte para a mais fraca.
function chavesDaPessoa({ pessoa_id, matricula, jornada_participante_id }) {
  const lista = [];
  if (pessoa_id) lista.push(`p${Number(pessoa_id)}`);
  const m = normMatricula(matricula);
  if (m) lista.push(`m${m}`.slice(0, 40));
  if (jornada_participante_id) lista.push(`j${Number(jornada_participante_id)}`);
  return lista;
}

/** Trilha do ambiente do usuário (e do cliente a que ele tem acesso); null se não existe. */
async function buscarTrilha(req, id) {
  const trilhaId = Number(id);
  if (!trilhaId) return null;
  const tenant = req.empresaId ? " AND empresa_id = ?" : "";
  const params = req.empresaId ? [trilhaId, req.empresaId] : [trilhaId];
  const [rows] = await db.query(
    `SELECT id, titulo, cliente, status, empresa_id FROM trilhas_aprendizagem WHERE id = ?${tenant} LIMIT 1`,
    params
  );
  const trilha = rows[0];
  if (!trilha) return null;
  if (!usuarioTemAcessoAoCliente(req, trilha.cliente)) return null;
  return trilha;
}

/** Participante (linha de trilha_participantes) dentro do ambiente do usuário. */
async function buscarParticipanteDaTrilha(req, id) {
  const participanteId = Number(id);
  if (!participanteId) return null;
  const tenant = req.empresaId ? " AND t.empresa_id = ?" : "";
  const params = req.empresaId ? [participanteId, req.empresaId] : [participanteId];
  const [rows] = await db.query(
    `SELECT tp.*, t.titulo AS trilha_titulo, t.cliente AS trilha_cliente
     FROM trilha_participantes tp
     JOIN trilhas_aprendizagem t ON t.id = tp.trilha_id
     WHERE tp.id = ?${tenant} LIMIT 1`,
    params
  );
  const p = rows[0];
  if (!p) return null;
  if (!usuarioTemAcessoAoCliente(req, p.trilha_cliente)) return null;
  return p;
}

async function jornadasDaTrilha(trilhaId, empresaId) {
  const tenant = empresaId ? " AND jd.empresa_id = ?" : "";
  const params = empresaId ? [trilhaId, empresaId] : [trilhaId];
  const [rows] = await db.query(
    `SELECT jd.id, jd.nome, jd.cliente, jd.status
     FROM jornada_trilhas jt
     JOIN jornadas_desenvolvimento jd ON jd.id = jt.jornada_id
     WHERE jt.trilha_id = ?${tenant}
     ORDER BY jd.nome ASC, jd.id ASC`,
    params
  );
  return rows;
}

/**
 * Matriz pessoa × etapas da trilha.
 * @returns {Promise<{etapas:Array, participantes:Array, removidos:Array, totais:Object, jornadas:Array, hoje:string}>}
 */
async function calcularMatriz(trilha, empresaId) {
  const hoje = hojeBahia();
  const [etapas] = await db.query(
    `SELECT id, ordem, titulo, tipo FROM trilha_etapas WHERE trilha_id = ? ORDER BY ordem ASC, id ASC`,
    [trilha.id]
  );
  const [pessoas] = await db.query(
    `SELECT id, pessoa_id, jornada_participante_id, nome, matricula, turma, cargo, origem, situacao,
            DATE_FORMAT(entrou_em, '%Y-%m-%d') AS entrou_em
     FROM trilha_participantes WHERE trilha_id = ? ORDER BY nome ASC, id ASC`,
    [trilha.id]
  );
  const ids = pessoas.map((p) => p.id);
  let linhas = [];
  if (ids.length) {
    [linhas] = await db.query(
      `SELECT trilha_participante_id, etapa_id, DATE_FORMAT(data_conclusao, '%Y-%m-%d') AS data_conclusao, observacao
       FROM trilha_progresso_pessoa WHERE trilha_id = ?`,
      [trilha.id]
    );
  }
  const idsEtapas = new Set(etapas.map((e) => e.id));
  const porPar = new Map();
  for (const l of linhas) {
    if (idsEtapas.has(l.etapa_id)) porPar.set(`${l.trilha_participante_id}:${l.etapa_id}`, l);
  }

  const ativos = [];
  const removidos = [];
  for (const p of pessoas) {
    if (p.situacao === "removido") {
      removidos.push({ id: p.id, nome: p.nome, matricula: p.matricula || "", origem: p.origem });
      continue;
    }
    const porEtapa = {};
    let concluidas = 0;
    for (const e of etapas) {
      const l = porPar.get(`${p.id}:${e.id}`);
      porEtapa[e.id] = {
        concluida: !!l,
        data_conclusao: l ? l.data_conclusao : null,
        observacao: l ? l.observacao : null,
      };
      if (l) concluidas += 1;
    }
    ativos.push({
      id: p.id,
      pessoa_id: p.pessoa_id,
      jornada_participante_id: p.jornada_participante_id,
      nome: p.nome,
      matricula: p.matricula || "",
      turma: p.turma || "",
      cargo: p.cargo || "",
      origem: p.origem,
      entrou_em: p.entrou_em,
      etapas: porEtapa,
      concluidas,
      total_etapas: etapas.length,
      pct: etapas.length ? arred((concluidas / etapas.length) * 100, 1) : null,
    });
  }

  const comPct = ativos.filter((p) => p.pct !== null);
  const totais = {
    participantes: ativos.length,
    etapas: etapas.length,
    pct_medio: comPct.length ? arred(comPct.reduce((a, p) => a + p.pct, 0) / comPct.length, 1) : null,
    concluiram_todas: ativos.filter((p) => p.total_etapas > 0 && p.concluidas === p.total_etapas).length,
    sem_lancamento: ativos.filter((p) => p.concluidas === 0).length,
    removidos: removidos.length,
  };

  const jornadas = await jornadasDaTrilha(trilha.id, empresaId);
  return { etapas, participantes: ativos, removidos, totais, jornadas, hoje };
}

/**
 * Sincroniza com os participantes das jornadas ligadas à trilha. Idempotente:
 * pessoa já na lista (ativa ou removida) não é duplicada nem volta sozinha.
 * @param {boolean} aplicar  false = só prévia
 */
async function sincronizarComJornadas(trilha, { empresaId, usuarioId, aplicar }) {
  const jornadas = (await jornadasDaTrilha(trilha.id, empresaId)).filter((j) => !statusCancelado(j.status));
  if (!jornadas.length) {
    return { ok: true, aplicado: !!aplicar, jornadas: 0, novos: 0, atualizados: 0, ja_na_lista: 0, ignorados_removidos: 0, nomes_novos: [] };
  }
  const [participantes] = await db.query(
    `SELECT jp.id, jp.jornada_id, jp.nome, jp.matricula, jp.turma, jp.cargo, jp.pessoa_id
     FROM jornada_participantes jp WHERE jp.jornada_id IN (?) ORDER BY jp.nome ASC, jp.id ASC`,
    [jornadas.map((j) => j.id)]
  );
  const [existentes] = await db.query(
    `SELECT id, chave, pessoa_id, jornada_participante_id, matricula, situacao, origem
     FROM trilha_participantes WHERE trilha_id = ?`,
    [trilha.id]
  );
  const porChave = new Map();
  for (const e of existentes) {
    for (const c of chavesDaPessoa({ pessoa_id: e.pessoa_id, matricula: e.matricula, jornada_participante_id: e.jornada_participante_id })) {
      if (!porChave.has(c)) porChave.set(c, e);
    }
    porChave.set(e.chave, e);
  }

  let novos = 0;
  let atualizados = 0;
  let jaNaLista = 0;
  let ignoradosRemovidos = 0;
  const nomesNovos = [];
  const vistosNovos = new Set();
  const hoje = hojeBahia();

  for (const p of participantes) {
    const chaves = chavesDaPessoa({ pessoa_id: p.pessoa_id, matricula: p.matricula, jornada_participante_id: p.id });
    const existente = chaves.map((c) => porChave.get(c)).find(Boolean);
    if (existente) {
      if (existente.situacao === "removido") ignoradosRemovidos += 1;
      else jaNaLista += 1;
      if (aplicar && existente.origem === "jornada") {
        await db.query(
          `UPDATE trilha_participantes SET nome = ?, matricula = ?, turma = ?, cargo = ?,
                  pessoa_id = COALESCE(?, pessoa_id), jornada_participante_id = COALESCE(jornada_participante_id, ?)
           WHERE id = ?`,
          [p.nome, p.matricula || null, p.turma || null, p.cargo || null, p.pessoa_id || null, p.id, existente.id]
        );
        atualizados += 1;
      }
      continue;
    }
    const chave = chaves[0];
    if (vistosNovos.has(chave)) continue; // mesma pessoa em duas jornadas da trilha
    vistosNovos.add(chave);
    novos += 1;
    if (nomesNovos.length < 50) nomesNovos.push(p.nome);
    if (aplicar) {
      await db.query(
        `INSERT IGNORE INTO trilha_participantes
           (empresa_id, trilha_id, chave, pessoa_id, jornada_participante_id, nome, matricula, turma, cargo, origem, situacao, entrou_em, criado_por_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'jornada', 'ativo', ?, ?)`,
        [trilha.empresa_id ?? empresaId ?? null, trilha.id, chave, p.pessoa_id || null, p.id, p.nome, p.matricula || null, p.turma || null, p.cargo || null, hoje, usuarioId || null]
      );
    }
  }

  return {
    ok: true,
    aplicado: !!aplicar,
    jornadas: jornadas.length,
    novos,
    atualizados,
    ja_na_lista: jaNaLista,
    ignorados_removidos: ignoradosRemovidos,
    nomes_novos: nomesNovos,
  };
}

/**
 * Trilhas de uma pessoa (Perfil 360 e extrato do participante da jornada):
 * por pessoa_id e/ou pelo participante da jornada.
 * @returns {Promise<Array>}
 */
async function trilhasDaPessoa({ empresaId, pessoaId = null, participanteId = null }) {
  const condicoes = [];
  const params = [];
  if (pessoaId) {
    condicoes.push("tp.pessoa_id = ?");
    params.push(pessoaId);
  }
  if (participanteId) {
    condicoes.push("tp.jornada_participante_id = ?");
    params.push(participanteId);
  }
  if (!condicoes.length) return [];
  const tenant = empresaId ? " AND t.empresa_id = ?" : "";
  if (empresaId) params.push(empresaId);

  const [linhas] = await db.query(
    `SELECT tp.id AS trilha_participante_id, tp.trilha_id, t.titulo, t.cliente, t.status
     FROM trilha_participantes tp
     JOIN trilhas_aprendizagem t ON t.id = tp.trilha_id
     WHERE tp.situacao = 'ativo' AND (${condicoes.join(" OR ")})${tenant}
     ORDER BY t.titulo ASC`,
    params
  );
  // a mesma trilha pode aparecer duas vezes (uma linha por pessoa_id e outra pelo participante): fica a primeira
  const vistas = new Set();
  const unicas = linhas.filter((l) => (vistas.has(l.trilha_id) ? false : vistas.add(l.trilha_id)));
  if (!unicas.length) return [];

  const [etapas] = await db.query(
    `SELECT id, trilha_id, titulo, ordem FROM trilha_etapas WHERE trilha_id IN (?) ORDER BY ordem ASC, id ASC`,
    [unicas.map((u) => u.trilha_id)]
  );
  const [prog] = await db.query(
    `SELECT trilha_participante_id, etapa_id, DATE_FORMAT(data_conclusao, '%Y-%m-%d') AS data_conclusao
     FROM trilha_progresso_pessoa WHERE trilha_participante_id IN (?)`,
    [unicas.map((u) => u.trilha_participante_id)]
  );
  const porPar = new Map(prog.map((p) => [`${p.trilha_participante_id}:${p.etapa_id}`, p]));

  return unicas.map((u) => {
    const doTrilha = etapas.filter((e) => e.trilha_id === u.trilha_id);
    const lista = doTrilha.map((e) => {
      const p = porPar.get(`${u.trilha_participante_id}:${e.id}`);
      return { id: e.id, titulo: e.titulo, concluida: !!p, data_conclusao: p ? p.data_conclusao : null };
    });
    const concluidas = lista.filter((e) => e.concluida).length;
    return {
      trilha_id: u.trilha_id,
      titulo: u.titulo,
      cliente: u.cliente || "",
      status: u.status,
      total: lista.length,
      concluidas,
      pct: lista.length ? arred((concluidas / lista.length) * 100, 1) : null,
      etapas: lista,
    };
  });
}

module.exports = {
  hojeBahia,
  chavesDaPessoa,
  buscarTrilha,
  buscarParticipanteDaTrilha,
  calcularMatriz,
  sincronizarComJornadas,
  trilhasDaPessoa,
  jornadasDaTrilha,
  normMatricula,
};
