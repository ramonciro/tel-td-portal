/**
 * mptComprovacaoService.js — Comprovação MPT por subdivisão (04/11/2026).
 *
 * Responde "esta pessoa recebeu esse tema, quando, quantas horas?" e "quantas pessoas já bateram
 * a meta interna de horas de cada subdivisão neste ano?".
 *
 * Fontes de horas (decisão do Ramon: jornadas + turmas com subtipo):
 *   - Encontros de jornada: horas = carga do encontro, só para quem esteve PRESENTE. A subdivisão é a do
 *     encontro; se vazia, a da jornada. Mesma regra de presença da grade (justificado não soma hora).
 *   - Aulas de turma (cronograma): turma com subtipo, presença 'presente' em presenca_aulas. Horas da aula =
 *     carga real, senão a planejada, senão a carga da turma dividida pelas aulas (marcada como estimada).
 *
 * Sem contagem em dobro: por pessoa + subdivisão + DIA conta uma vez só (a maior carga do dia). É a conta
 * conservadora — nunca superestima a evidência. As linhas não contadas aparecem na evidência com o motivo.
 *
 * Meta: tabela mpt_metas (uma por ambiente e subdivisão), horas por pessoa no ano-calendário. É META INTERNA
 * DE GESTÃO, nunca citada como exigência legal. Sem meta cadastrada o sistema não inventa número.
 * Farol: % de pessoas que atingiram a meta (>=90 verde, 80–89 amarelo, <80 vermelho) — régua já usada no
 * portal. Standalone: nunca entra em média com outro indicador.
 *
 * Universo (denominador): pessoas inscritas nas jornadas que têm encontro da subdivisão no ano e nas turmas
 * da subdivisão com aula no ano — mesmo com zero hora.
 *
 * Privacidade: CPF nunca sai daqui. Nome/matrícula só saem quando `comNomes` (Metodologia).
 */
const pool = require("../lib/db");

function hojeBahia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
}

function norm(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function arred(v, casas = 2) {
  const f = 10 ** casas;
  return Math.round(Number(v) * f) / f;
}

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function farolDoPct(pct) {
  if (pct === null || pct === undefined) return "cinza";
  if (pct >= 90) return "verde";
  if (pct >= 80) return "amarelo";
  return "vermelho";
}

const CANCELADO = ["cancelada", "cancelado"];

// ───────────────────────── metas ─────────────────────────

async function listarMetas(empresaId) {
  const [rows] = await pool.query(
    `SELECT id, empresa_id, subtipo, horas_meta, atualizado_em FROM mpt_metas WHERE ativo = 1 ${empresaId ? "AND empresa_id = ?" : ""} ORDER BY subtipo ASC`,
    empresaId ? [empresaId] : []
  );
  return rows.map((r) => ({ ...r, horas_meta: num(r.horas_meta) }));
}

async function salvarMeta({ empresaId, subtipo, horas, usuarioId }) {
  await pool.query(
    `INSERT INTO mpt_metas (empresa_id, subtipo, horas_meta, ativo, criado_por_id)
     VALUES (?, ?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE horas_meta = VALUES(horas_meta), ativo = 1`,
    [empresaId, subtipo, horas, usuarioId ?? null]
  );
}

async function removerMeta({ empresaId, subtipo }) {
  const [r] = await pool.query(`UPDATE mpt_metas SET ativo = 0 WHERE empresa_id = ? AND subtipo = ? AND ativo = 1`, [empresaId, subtipo]);
  return r.affectedRows || 0;
}

// ───────────────────────── cálculo de um ambiente ─────────────────────────

async function calcularEmpresa(empresaId, ano) {
  const de = `${ano}-01-01`;
  const ate = `${ano}-12-31`;

  const metas = new Map((await listarMetas(empresaId)).map((m) => [m.subtipo, m.horas_meta]));

  // Cadastro único de pessoas do ambiente (para ligar matrícula/CPF ao mesmo indivíduo).
  const [pessoasRows] = await pool.query(`SELECT id, cpf, matricula, nome, cliente FROM pessoas WHERE empresa_id = ?`, [empresaId]);
  const pessoaPorId = new Map(pessoasRows.map((p) => [p.id, p]));
  const pessoaPorCpf = new Map();
  const pessoaPorMatricula = new Map();
  for (const p of pessoasRows) {
    if (p.cpf) pessoaPorCpf.set(String(p.cpf), p);
    const m = String(p.matricula || "").trim();
    if (m && !pessoaPorMatricula.has(m)) pessoaPorMatricula.set(m, p);
  }

  const avisos = { encontros_sem_subdivisao: 0, turmas_sem_cronograma: 0, presencas_sem_vinculo: 0, cargas_estimadas: 0, pessoas_sem_cadastro: 0 };
  const universo = new Map(); // `${chave}|${subtipo}` → { chave, subtipo, pessoa }
  const evidencias = new Map(); // `${chave}|${subtipo}` → [evidência]
  const pessoasInfo = new Map(); // chave → { nome, matricula, cliente, vinculada }

  function resolver(part, clienteFonte) {
    let p = null;
    if (part.pessoa_id && pessoaPorId.has(part.pessoa_id)) p = pessoaPorId.get(part.pessoa_id);
    if (!p && part.cpf && pessoaPorCpf.has(String(part.cpf))) p = pessoaPorCpf.get(String(part.cpf));
    const mat = String(part.matricula || "").trim();
    if (!p && mat && pessoaPorMatricula.has(mat)) p = pessoaPorMatricula.get(mat);
    let chave;
    let vinculada = true;
    if (p) chave = `p${p.id}`;
    else {
      chave = `n:${norm(part.nome)}|${norm(part.cliente || clienteFonte)}`;
      vinculada = false;
    }
    if (!pessoasInfo.has(chave)) {
      pessoasInfo.set(chave, {
        nome: p ? p.nome : part.nome,
        matricula: String((p ? p.matricula : part.matricula) || "").trim() || null,
        cliente: String((p && p.cliente) || part.cliente || clienteFonte || "").trim() || "Sem operação",
        vinculada,
      });
    }
    return chave;
  }

  function marcarUniverso(chave, subtipo) {
    const k = `${chave}|${subtipo}`;
    if (!universo.has(k)) universo.set(k, { chave, subtipo });
  }
  function adicionarEvidencia(chave, subtipo, ev) {
    const k = `${chave}|${subtipo}`;
    marcarUniverso(chave, subtipo);
    if (!evidencias.has(k)) evidencias.set(k, []);
    evidencias.get(k).push(ev);
  }

  // ── Fonte 1: encontros de jornada ──
  const [encontros] = await pool.query(
    `SELECT e.id AS encontro_id, e.jornada_id, e.titulo, DATE_FORMAT(e.data, '%Y-%m-%d') AS data, e.carga_horaria,
            COALESCE(NULLIF(TRIM(e.subtipo), ''), NULLIF(TRIM(jd.subtipo), '')) AS subtipo,
            jd.nome AS jornada_nome, jd.cliente AS jornada_cliente
       FROM jornada_encontros e
       JOIN jornadas_desenvolvimento jd ON jd.id = e.jornada_id
      WHERE jd.empresa_id = ? AND e.data BETWEEN ? AND ?
        AND LOWER(COALESCE(jd.status, '')) NOT IN ('cancelada', 'cancelado')`,
    [empresaId, de, ate]
  );
  const encontroPorId = new Map();
  const subtiposPorJornada = new Map();
  for (const e of encontros) {
    if (!e.subtipo) {
      avisos.encontros_sem_subdivisao += 1;
      continue;
    }
    encontroPorId.set(e.encontro_id, e);
    if (!subtiposPorJornada.has(e.jornada_id)) subtiposPorJornada.set(e.jornada_id, new Set());
    subtiposPorJornada.get(e.jornada_id).add(e.subtipo);
  }

  if (subtiposPorJornada.size) {
    const [partsJ] = await pool.query(
      `SELECT jp.id, jp.jornada_id, jp.nome, jp.matricula, jp.cliente, jp.cpf, jp.pessoa_id
         FROM jornada_participantes jp JOIN jornadas_desenvolvimento jd ON jd.id = jp.jornada_id
        WHERE jd.empresa_id = ?`,
      [empresaId]
    );
    const clientePorJornada = new Map(encontros.map((e) => [e.jornada_id, e.jornada_cliente]));
    const chavePorParticipanteJ = new Map();
    for (const jp of partsJ) {
      const subs = subtiposPorJornada.get(jp.jornada_id);
      if (!subs) continue;
      const chave = resolver(jp, clientePorJornada.get(jp.jornada_id));
      chavePorParticipanteJ.set(jp.id, chave);
      for (const s of subs) marcarUniverso(chave, s);
    }
    const [presJ] = await pool.query(
      `SELECT p.encontro_id, p.participante_id, p.situacao
         FROM jornada_presencas p
         JOIN jornada_encontros e ON e.id = p.encontro_id
         JOIN jornadas_desenvolvimento jd ON jd.id = e.jornada_id
        WHERE jd.empresa_id = ? AND e.data BETWEEN ? AND ? AND p.situacao = 'presente'`,
      [empresaId, de, ate]
    );
    for (const pr of presJ) {
      const enc = encontroPorId.get(pr.encontro_id);
      const chave = chavePorParticipanteJ.get(pr.participante_id);
      if (!enc || !chave) continue;
      adicionarEvidencia(chave, enc.subtipo, {
        fonte: "jornada",
        origem_id: enc.encontro_id,
        contexto: enc.jornada_nome,
        titulo: enc.titulo,
        data: enc.data,
        horas: num(enc.carga_horaria),
        estimada: false,
      });
    }
  }

  // ── Fonte 2: aulas de turma com subtipo ──
  const [turmas] = await pool.query(
    `SELECT t.id, t.tema, t.cliente, t.subtipo, t.carga_horaria, DATE_FORMAT(t.data, '%Y-%m-%d') AS data
       FROM treinamentos t
      WHERE t.empresa_id = ? AND t.subtipo IS NOT NULL AND TRIM(t.subtipo) <> ''
        AND LOWER(COALESCE(t.status, '')) NOT IN ('cancelada', 'cancelado')`,
    [empresaId]
  );
  if (turmas.length) {
    const turmaPorId = new Map(turmas.map((t) => [t.id, t]));
    const [aulasTodas] = await pool.query(
      `SELECT a.id, a.treinamento_id, DATE_FORMAT(a.data_aula, '%Y-%m-%d') AS data, a.titulo, a.carga_horaria_real, a.carga_horaria_planejada
         FROM turma_aulas a JOIN treinamentos t ON t.id = a.treinamento_id
        WHERE t.empresa_id = ? AND t.subtipo IS NOT NULL AND TRIM(t.subtipo) <> ''`,
      [empresaId]
    );
    const aulasPorTurma = new Map();
    for (const a of aulasTodas) {
      if (!aulasPorTurma.has(a.treinamento_id)) aulasPorTurma.set(a.treinamento_id, []);
      aulasPorTurma.get(a.treinamento_id).push(a);
    }
    const turmasNoAno = new Set();
    for (const t of turmas) {
      const aulas = aulasPorTurma.get(t.id) || [];
      if (!aulas.length) {
        if (t.data && t.data >= de && t.data <= ate) avisos.turmas_sem_cronograma += 1;
        continue;
      }
      if (aulas.some((a) => a.data >= de && a.data <= ate)) turmasNoAno.add(t.id);
    }
    const aulaPorId = new Map();
    for (const id of turmasNoAno) for (const a of aulasPorTurma.get(id)) aulaPorId.set(a.id, a);

    if (turmasNoAno.size) {
      const [partsT] = await pool.query(
        `SELECT tp.id, tp.treinamento_id, tp.nome, tp.matricula, tp.cliente, tp.cpf, tp.pessoa_id
           FROM treinamento_participantes tp JOIN treinamentos t ON t.id = tp.treinamento_id
          WHERE t.empresa_id = ?`,
        [empresaId]
      );
      const chavePorTurmaNome = new Map(); // `${turma}|${nome normalizado}` → chave
      for (const tp of partsT) {
        if (!turmasNoAno.has(tp.treinamento_id)) continue;
        const turma = turmaPorId.get(tp.treinamento_id);
        const chave = resolver(tp, turma.cliente);
        const k = `${tp.treinamento_id}|${norm(tp.nome)}`;
        if (!chavePorTurmaNome.has(k)) chavePorTurmaNome.set(k, chave);
        marcarUniverso(chave, turma.subtipo);
      }

      const [presT] = await pool.query(
        `SELECT p.turma_aula_id, p.treinamento_id, p.treinando_nome
           FROM presenca_aulas p JOIN turma_aulas a ON a.id = p.turma_aula_id JOIN treinamentos t ON t.id = a.treinamento_id
          WHERE t.empresa_id = ? AND a.data_aula BETWEEN ? AND ? AND p.status = 'presente'`,
        [empresaId, de, ate]
      );
      const jaVisto = new Set();
      for (const pr of presT) {
        const aula = aulaPorId.get(pr.turma_aula_id);
        if (!aula || !turmasNoAno.has(aula.treinamento_id)) continue;
        const turma = turmaPorId.get(aula.treinamento_id);
        const chave = chavePorTurmaNome.get(`${aula.treinamento_id}|${norm(pr.treinando_nome)}`);
        if (!chave) {
          avisos.presencas_sem_vinculo += 1;
          continue;
        }
        const dup = `${aula.id}|${chave}`;
        if (jaVisto.has(dup)) continue;
        jaVisto.add(dup);
        let horas = num(aula.carga_horaria_real) > 0 ? num(aula.carga_horaria_real) : num(aula.carga_horaria_planejada);
        let estimada = false;
        if (!(horas > 0)) {
          const aulas = aulasPorTurma.get(aula.treinamento_id) || [];
          horas = aulas.length ? num(turma.carga_horaria) / aulas.length : 0;
          estimada = horas > 0;
          if (estimada) avisos.cargas_estimadas += 1;
        }
        adicionarEvidencia(chave, turma.subtipo, {
          fonte: "turma",
          origem_id: aula.id,
          contexto: turma.tema,
          titulo: aula.titulo || turma.tema,
          data: aula.data,
          horas: arred(horas),
          estimada,
        });
      }
    }
  }

  // ── Dedupe por pessoa + subdivisão + dia (maior carga do dia conta; demais ficam sem contar) ──
  const linhas = [];
  for (const [k, u] of universo) {
    const lista = evidencias.get(k) || [];
    const porDia = new Map();
    for (const ev of lista) {
      if (!porDia.has(ev.data)) porDia.set(ev.data, []);
      porDia.get(ev.data).push(ev);
    }
    const final = [];
    let total = 0;
    for (const [, evs] of porDia) {
      evs.sort((a, b) => b.horas - a.horas);
      evs.forEach((ev, i) => {
        const contada = i === 0;
        if (contada) total += ev.horas;
        final.push({ ...ev, contada, motivo_nao_contada: contada ? null : "Mesmo dia e mesma subdivisão: contada uma vez só (vale a maior carga)." });
      });
    }
    final.sort((a, b) => a.data.localeCompare(b.data));
    const info = pessoasInfo.get(u.chave);
    const meta = metas.has(u.subtipo) ? metas.get(u.subtipo) : null;
    let situacao = "sem_meta";
    if (meta !== null) situacao = total >= meta ? "atingiu" : total > 0 ? "abaixo" : "sem_hora";
    linhas.push({
      chave: u.chave,
      nome: info.nome,
      matricula: info.matricula,
      cliente: info.cliente,
      vinculada: info.vinculada,
      subtipo: u.subtipo,
      horas: arred(total),
      meta,
      situacao,
      evidencias: final,
    });
  }
  avisos.pessoas_sem_cadastro = new Set(linhas.filter((l) => !l.vinculada).map((l) => l.chave)).size;

  return { empresa_id: empresaId, linhas, avisos, metas };
}

// ───────────────────────── agregação ─────────────────────────

function agregar(linhas) {
  const porSub = new Map();
  for (const l of linhas) {
    if (!porSub.has(l.subtipo)) porSub.set(l.subtipo, { subtipo: l.subtipo, metas: new Set(), horas_jornada: 0, horas_turma: 0, itens: [] });
    const s = porSub.get(l.subtipo);
    if (l.meta !== null) s.metas.add(l.meta);
    s.itens.push(l);
    for (const ev of l.evidencias) if (ev.contada) (ev.fonte === "turma" ? (s.horas_turma += ev.horas) : (s.horas_jornada += ev.horas));
  }
  const contar = (itens) => {
    const comMeta = itens.filter((i) => i.situacao !== "sem_meta");
    const atingiram = itens.filter((i) => i.situacao === "atingiu").length;
    const abaixo = itens.filter((i) => i.situacao === "abaixo").length;
    const semHora = itens.filter((i) => i.situacao === "sem_hora").length;
    const pct = comMeta.length ? Math.round((atingiram / comMeta.length) * 100) : null;
    return { pessoas: itens.length, atingiram, abaixo, sem_hora: semHora, sem_meta: itens.length - comMeta.length, pct, farol: farolDoPct(pct) };
  };
  const out = [];
  for (const s of porSub.values()) {
    const porCliente = new Map();
    for (const i of s.itens) {
      if (!porCliente.has(i.cliente)) porCliente.set(i.cliente, []);
      porCliente.get(i.cliente).push(i);
    }
    out.push({
      subtipo: s.subtipo,
      meta_horas: s.metas.size === 1 ? [...s.metas][0] : null,
      metas_diferentes: s.metas.size > 1,
      ...contar(s.itens),
      horas_jornada: arred(s.horas_jornada),
      horas_turma: arred(s.horas_turma),
      por_cliente: [...porCliente.entries()].map(([cliente, itens]) => ({ cliente, ...contar(itens) })).sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR")),
    });
  }
  out.sort((a, b) => a.subtipo.localeCompare(b.subtipo, "pt-BR"));
  return out;
}

/**
 * @param {{empresaId?: number|null, ano?: number}} opts  empresaId null = todos os ambientes (superintendente)
 * @returns {Promise<{ano, subdivisoes, avisos, metas, linhas}>}  `linhas` traz os nomes — o controller decide se devolve.
 */
async function calcularComprovacao({ empresaId = null, ano } = {}) {
  const anoCalc = Number.isInteger(Number(ano)) && Number(ano) >= 2020 && Number(ano) <= 2100 ? Number(ano) : Number(hojeBahia().slice(0, 4));
  let ids;
  if (empresaId) ids = [empresaId];
  else {
    const [rows] = await pool.query(
      `SELECT empresa_id FROM jornadas_desenvolvimento WHERE empresa_id IS NOT NULL
       UNION SELECT empresa_id FROM treinamentos WHERE empresa_id IS NOT NULL AND subtipo IS NOT NULL
       UNION SELECT empresa_id FROM mpt_metas`
    );
    ids = rows.map((r) => r.empresa_id);
  }
  const todas = [];
  const metas = [];
  const avisos = { encontros_sem_subdivisao: 0, turmas_sem_cronograma: 0, presencas_sem_vinculo: 0, cargas_estimadas: 0, pessoas_sem_cadastro: 0 };
  for (const id of ids) {
    const r = await calcularEmpresa(id, anoCalc);
    for (const l of r.linhas) todas.push({ ...l, empresa_id: id, chave: `${id}:${l.chave}` });
    for (const [subtipo, horas] of r.metas) metas.push({ empresa_id: id, subtipo, horas_meta: horas });
    for (const k of Object.keys(avisos)) avisos[k] += r.avisos[k];
  }
  return { ano: anoCalc, subdivisoes: agregar(todas), avisos, metas, linhas: todas };
}

module.exports = { calcularComprovacao, listarMetas, salvarMeta, removerMeta, farolDoPct };
