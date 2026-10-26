/**
 * preventivoService.js — Radar preventivo, Pacote 1 (26/10/2026)
 *
 * Duas leituras que antecipam problema em vez de só registrar:
 *
 *  1) PRONTIDÃO DA TURMA — turma que começa nos próximos dias e ainda não tem
 *     o que precisa (instrutor, sala/local, cronograma, participantes), tem
 *     conflito de sala ou de instrutor, sala menor que a turma ou material
 *     ainda em produção.
 *
 *  2) RISCO DE CERTIFICAÇÃO — turma em andamento: por participante, projeta a
 *     presença final com as aulas que ainda faltam e diz quem já não consegue
 *     chegar à presença mínima, quem está no limite e quem faltou em sequência.
 *
 * Só LÊ dados que o portal já guarda (nada novo é digitado). As regras de
 * presença são as mesmas da grade (turmaPresencaGradeController): % =
 * presentes ÷ (presentes + ausentes), justificada fora da conta, aula passada
 * sem lançamento = pendente (não é falta), mínima padrão 75% ou a da turma.
 *
 * Quem chama decide o recorte: `empresaId` (null = todos os ambientes, só para
 * a Assistente de Treinamento), `podeVer(turma)` (acesso por cliente) e
 * `instrutor` (o instrutor só vê as próprias turmas, principal ou adicional).
 */
const pool = require("../lib/db");
const { buscarConflitosSala } = require("./salaConflitoService");
const { mapaAdicionais } = require("../lib/instrutoresTurma");

const PRESENCA_MINIMA_PADRAO = 75;
const chave = (s) => String(s || "").trim().toLowerCase();
const GRAV_ORDEM = { critica: 4, alta: 3, media: 2, baixa: 1 };

function hojeBahia() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
}

function somarDias(iso, n) {
  const [a, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function diasEntre(deIso, ateIso) {
  const p = (s) => {
    const [a, m, d] = String(s).slice(0, 10).split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((p(ateIso) - p(deIso)) / 86400000);
}

function normalizarNome(v) {
  return String(v == null ? "" : v).normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function numeroOuNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function modalidadeDe(descricao) {
  const m = String(descricao || "").match(/\[modalidade:([^\]]+)\]/i);
  const v = chave(m && m[1]);
  return v === "presencial" || v === "online" ? v : "";
}

const inIds = (ids) => ids.map(() => "?").join(",");
const hhmm = (t) => (t ? String(t).slice(0, 5) : "");

/** Consulta que não derruba o Radar se uma tabela opcional ainda não existe. */
async function consulta(sql, params) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (e) {
    if (e && (e.code === "ER_NO_SUCH_TABLE" || e.code === "ER_BAD_FIELD_ERROR")) return [];
    throw e;
  }
}

function filtrarAcesso(turmas, { instrutor, podeVer }) {
  let out = turmas;
  if (instrutor) {
    out = out.filter((t) => chave(t.instrutor) === chave(instrutor) || t._adicionais.some((n) => chave(n) === chave(instrutor)));
  }
  if (podeVer) out = out.filter((t) => podeVer(t));
  return out;
}

const SQL_TURMA = `t.id, t.empresa_id, t.tema, t.cliente, t.instrutor, t.supervisor, t.turma, t.status, t.descricao,
       t.carga_horaria, t.presenca_minima_pct, t.sala_id, t.sala_outro_local,
       DATE_FORMAT(COALESCE(t.data_inicio, t.data), '%Y-%m-%d') AS data_inicio,
       DATE_FORMAT(COALESCE(t.data_fim, t.data_inicio, t.data), '%Y-%m-%d') AS data_fim,
       TIME_FORMAT(t.hora_inicio, '%H:%i') AS hora_inicio, TIME_FORMAT(t.hora_fim, '%H:%i') AS hora_fim`;

const NAO_ENCERRADA = `(t.status IS NULL OR (LOWER(TRIM(t.status)) NOT LIKE '%cancel%' AND LOWER(TRIM(t.status)) NOT LIKE 'conclu%'))`;

// ─────────────────────────── 1) PRONTIDÃO ───────────────────────────

function gravidadeItem(base, diasParaInicio) {
  // base "alta" = sem isso a turma não acontece; "media" = acontece, mas mal.
  if (base === "alta") return diasParaInicio <= 2 ? "critica" : "alta";
  return diasParaInicio <= 2 ? "alta" : "media";
}

/**
 * Turmas que começam de hoje até hoje + `dias` com o que falta para estarem prontas.
 * Só devolve turmas com pelo menos uma pendência de prontidão.
 */
async function calcularProntidao({ empresaId, dias = 7, instrutor, podeVer } = {}) {
  const janela = Math.min(30, Math.max(1, Number(dias) || 7));
  const hoje = hojeBahia();
  const ate = somarDias(hoje, janela);

  const where = [`COALESCE(DATE(t.data_inicio), t.data) >= ?`, `COALESCE(DATE(t.data_inicio), t.data) <= ?`, NAO_ENCERRADA];
  const params = [hoje, ate];
  if (empresaId) { where.push("t.empresa_id = ?"); params.push(empresaId); }
  const brutas = await consulta(
    `SELECT ${SQL_TURMA} FROM treinamentos t WHERE ${where.join(" AND ")} ORDER BY COALESCE(t.data_inicio, t.data), t.id`,
    params
  );
  const adic = await mapaAdicionais(empresaId);
  const turmas = filtrarAcesso(brutas.map((t) => ({ ...t, _adicionais: adic.get(t.id) || [] })), { instrutor, podeVer });
  if (!turmas.length) return { hoje, dias: janela, turmas: [], resumo: resumoProntidao([]) };

  const ids = turmas.map((t) => t.id);
  const [aulas, parts, salas, pedidos] = await Promise.all([
    consulta(`SELECT treinamento_id, COUNT(*) AS n FROM turma_aulas
               WHERE treinamento_id IN (${inIds(ids)}) AND LOWER(TRIM(COALESCE(status_execucao,''))) <> 'cancelada'
               GROUP BY treinamento_id`, ids),
    consulta(`SELECT treinamento_id, COUNT(*) AS n FROM treinamento_participantes
               WHERE treinamento_id IN (${inIds(ids)}) GROUP BY treinamento_id`, ids),
    consulta(`SELECT id, nome, capacidade FROM salas`, []),
    consulta(`SELECT treinamento_id, COUNT(*) AS n FROM conteudo_pedidos
               WHERE treinamento_id IN (${inIds(ids)}) AND status NOT IN ('concluido','cancelado')
               GROUP BY treinamento_id`, ids),
  ]);
  const nAulas = new Map(aulas.map((r) => [r.treinamento_id, Number(r.n)]));
  const nParts = new Map(parts.map((r) => [r.treinamento_id, Number(r.n)]));
  const salaPorId = new Map(salas.map((s) => [s.id, s]));
  const nPedidos = new Map(pedidos.map((r) => [r.treinamento_id, Number(r.n)]));

  const out = [];
  for (const t of turmas) {
    const diasParaInicio = diasEntre(hoje, t.data_inicio);
    const modalidade = modalidadeDe(t.descricao);
    const itens = [];
    const add = (codigo, base, titulo, detalhe, acao) =>
      itens.push({ codigo, gravidade: gravidadeItem(base, diasParaInicio), titulo, detalhe, acao });

    if (!String(t.instrutor || "").trim()) {
      add("sem_instrutor", "alta", "Sem instrutor", "A turma não tem instrutor definido.", "Definir o instrutor");
    }
    const temLocal = t.sala_id || String(t.sala_outro_local || "").trim();
    if (modalidade !== "online" && !temLocal) {
      add("sem_sala", "alta", "Sem sala ou local", modalidade === "presencial"
        ? "Turma presencial sem sala nem local informado."
        : "Sem sala/local informado (se for online, marque a modalidade na turma).", "Reservar a sala");
    }
    if (!(nAulas.get(t.id) > 0)) {
      add("sem_cronograma", "media", "Sem cronograma", "Nenhuma aula cadastrada no cronograma.", "Montar o cronograma");
    }
    const participantes = nParts.get(t.id) || 0;
    if (!participantes) {
      add("sem_participantes", "media", "Sem participantes", "Nenhum participante cadastrado na turma.", "Cadastrar ou importar os participantes");
    }
    // Capacidade da sala × participantes.
    const sala = t.sala_id ? salaPorId.get(t.sala_id) : null;
    const cap = sala ? numeroOuNull(sala.capacidade) : null;
    if (cap && participantes > cap) {
      add("sala_pequena", "media", "Sala menor que a turma", `${sala.nome} comporta ${cap} e a turma tem ${participantes} participante(s).`, "Trocar de sala ou dividir a turma");
    }
    // Conflito de sala (qualquer ambiente, a sala é compartilhada).
    if (t.sala_id && t.hora_inicio && t.hora_fim) {
      const conflitos = await buscarConflitosSala({
        salaId: t.sala_id, dataInicio: t.data_inicio, dataFim: t.data_fim,
        horaInicio: t.hora_inicio, horaFim: t.hora_fim, excluirTreinamentoId: t.id,
      });
      if (conflitos.length) {
        const c = conflitos[0];
        add("conflito_sala", "alta", "Conflito de sala",
          `${sala ? sala.nome : "A sala"} já está ocupada por "${c.tema}" (${hhmm(c.hora_inicio)}–${hhmm(c.hora_fim)})${conflitos.length > 1 ? ` e mais ${conflitos.length - 1}` : ""}.`,
          "Trocar de sala ou de horário");
      }
    }
    // Conflito de instrutor (mesmo ambiente, mesmo horário).
    if (String(t.instrutor || "").trim() && t.hora_inicio && t.hora_fim) {
      const outros = await consulta(
        `SELECT t2.id, t2.tema FROM treinamentos t2
          WHERE t2.id <> ? AND t2.empresa_id = ? AND LOWER(TRIM(t2.instrutor)) = ?
            AND (t2.status IS NULL OR (LOWER(TRIM(t2.status)) NOT LIKE '%cancel%' AND LOWER(TRIM(t2.status)) NOT LIKE 'conclu%'))
            AND COALESCE(DATE(t2.data_inicio), t2.data) <= ? AND COALESCE(DATE(t2.data_fim), DATE(t2.data_inicio), t2.data) >= ?
            AND t2.hora_inicio IS NOT NULL AND t2.hora_fim IS NOT NULL
            AND t2.hora_inicio < ? AND t2.hora_fim > ?
          LIMIT 3`,
        [t.id, t.empresa_id, chave(t.instrutor), t.data_fim, t.data_inicio, t.hora_fim, t.hora_inicio]
      );
      if (outros.length) {
        add("conflito_instrutor", "alta", "Conflito de instrutor",
          `${t.instrutor} já está em "${outros[0].tema}" no mesmo período e horário${outros.length > 1 ? ` (e mais ${outros.length - 1})` : ""}.`,
          "Trocar o instrutor ou o horário");
      }
    }
    if (nPedidos.get(t.id) > 0) {
      add("material_pendente", "media", "Material em produção",
        `${nPedidos.get(t.id)} pedido(s) de conteúdo desta turma ainda não foram concluídos.`, "Cobrar a Produção de Conteúdo");
    }

    if (!itens.length) continue;
    itens.sort((a, b) => GRAV_ORDEM[b.gravidade] - GRAV_ORDEM[a.gravidade]);
    out.push({
      id: t.id, tema: t.tema, cliente: t.cliente, turma: t.turma, instrutor: t.instrutor, supervisor: t.supervisor,
      instrutores_adicionais: t._adicionais, modalidade: modalidade || null,
      data_inicio: t.data_inicio, hora_inicio: t.hora_inicio || null, dias_para_inicio: diasParaInicio,
      participantes, gravidade: itens[0].gravidade, itens,
    });
  }
  out.sort((a, b) => a.dias_para_inicio - b.dias_para_inicio || GRAV_ORDEM[b.gravidade] - GRAV_ORDEM[a.gravidade] || a.id - b.id);
  return { hoje, dias: janela, turmas: out, resumo: resumoProntidao(out) };
}

function resumoProntidao(turmas) {
  return {
    turmas_com_pendencia: turmas.length,
    criticas: turmas.filter((t) => t.gravidade === "critica").length,
    altas: turmas.filter((t) => t.gravidade === "alta").length,
    medias: turmas.filter((t) => t.gravidade === "media").length,
    pendencias: turmas.reduce((s, t) => s + t.itens.length, 0),
  };
}

// ─────────────────────── 2) RISCO DE CERTIFICAÇÃO ───────────────────────

/**
 * Projeção de UM participante. P presentes, A ausentes, R aulas que ainda podem
 * ser assistidas (futuras + passadas sem lançamento), `minimo` em %.
 * Justificada fica fora da conta (como na grade).
 */
function projetarParticipante({ P, A, R, minimo }) {
  const base = P + A + R;
  if (base <= 0) return null;
  // Faltas totais que a pessoa pode ter e ainda fechar no mínimo.
  const permitidas = Math.floor((base * (100 - minimo)) / 100 + 1e-9);
  const margem = permitidas - A; // faltas que ainda pode ter daqui para frente
  const melhorFinal = Math.round(((P + R) / base) * 1000) / 10; // se não faltar mais nenhuma vez
  let nivel = "ok";
  if (margem < 0) nivel = "perdeu";
  else if (margem === 0 && A > 0) nivel = "no_limite";
  else if (margem === 1 && A > 0) nivel = "atencao";
  return { margem, melhor_final: melhorFinal, nivel };
}

const NIVEL_GRAV = { perdeu: "critica", no_limite: "alta", atencao: "media" };

async function calcularRiscoCertificacao({ empresaId, instrutor, podeVer } = {}) {
  const hoje = hojeBahia();
  const where = [`COALESCE(DATE(t.data_inicio), t.data) <= ?`, NAO_ENCERRADA];
  const params = [hoje];
  if (empresaId) { where.push("t.empresa_id = ?"); params.push(empresaId); }
  const brutas = await consulta(
    `SELECT ${SQL_TURMA} FROM treinamentos t WHERE ${where.join(" AND ")} ORDER BY COALESCE(t.data_inicio, t.data), t.id`,
    params
  );
  const adic = await mapaAdicionais(empresaId);
  const turmas = filtrarAcesso(brutas.map((t) => ({ ...t, _adicionais: adic.get(t.id) || [] })), { instrutor, podeVer });
  if (!turmas.length) return { hoje, turmas: [], resumo: resumoRisco([]) };

  const ids = turmas.map((t) => t.id);
  const [aulasRows, partsRows, presRows] = await Promise.all([
    consulta(`SELECT id, treinamento_id, DATE_FORMAT(data_aula, '%Y-%m-%d') AS data
                FROM turma_aulas
               WHERE treinamento_id IN (${inIds(ids)}) AND LOWER(TRIM(COALESCE(status_execucao,''))) <> 'cancelada'
               ORDER BY data_aula, dia_numero, ordem, id`, ids),
    consulta(`SELECT id, treinamento_id, nome FROM treinamento_participantes
               WHERE treinamento_id IN (${inIds(ids)}) ORDER BY nome, id`, ids),
    consulta(`SELECT turma_aula_id, treinamento_id, treinando_nome, status FROM presenca_aulas
               WHERE treinamento_id IN (${inIds(ids)})`, ids),
  ]);
  const porTurma = (rows) => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r.treinamento_id)) m.set(r.treinamento_id, []);
      m.get(r.treinamento_id).push(r);
    }
    return m;
  };
  const aulasPor = porTurma(aulasRows);
  const partsPor = porTurma(partsRows);
  const presPor = porTurma(presRows);

  const out = [];
  for (const t of turmas) {
    const aulas = aulasPor.get(t.id) || [];
    const partes = partsPor.get(t.id) || [];
    if (!aulas.length || !partes.length) continue;
    const minimo = numeroOuNull(t.presenca_minima_pct) ?? PRESENCA_MINIMA_PADRAO;
    const aulaData = new Map(aulas.map((a) => [a.id, a.data]));
    // situação por (nome normalizado, aula)
    const sit = new Map();
    for (const r of presPor.get(t.id) || []) {
      if (!aulaData.has(r.turma_aula_id)) continue;
      const s = chave(r.status);
      if (s !== "presente" && s !== "ausente" && s !== "justificado") continue;
      sit.set(`${normalizarNome(r.treinando_nome)}|${r.turma_aula_id}`, s);
    }
    const passadas = aulas.filter((a) => a.data <= hoje);
    const futuras = aulas.length - passadas.length;
    const aulasRestantes = aulas.filter((a) => a.data > hoje).length;

    const risco = [];
    let somaPct = 0, nPct = 0;
    for (const p of partes) {
      const nome = normalizarNome(p.nome);
      let P = 0, A = 0, pend = 0;
      const sequencia = []; // situação das aulas já realizadas, em ordem
      for (const a of passadas) {
        const s = sit.get(`${nome}|${a.id}`);
        if (s === "presente") P += 1;
        else if (s === "ausente") A += 1;
        else if (!s) pend += 1;
        sequencia.push(s || "pendente");
      }
      if (P + A > 0) { somaPct += (P / (P + A)) * 100; nPct += 1; }
      const proj = projetarParticipante({ P, A, R: futuras + pend, minimo });
      if (!proj) continue;
      // faltas em sequência: as duas últimas aulas LANÇADAS são faltas.
      const lancadas = sequencia.filter((s) => s !== "pendente");
      const seguidas = lancadas.length >= 2 && lancadas.slice(-2).every((s) => s === "ausente");
      if (proj.nivel === "ok" && !seguidas) continue;
      const nivel = proj.nivel !== "ok" ? proj.nivel : "faltas_seguidas";
      risco.push({
        nome: p.nome, presentes: P, ausentes: A, pendentes: pend,
        pct_atual: P + A > 0 ? Math.round((P / (P + A)) * 1000) / 10 : null,
        melhor_final: proj.melhor_final, faltas_que_ainda_pode_ter: Math.max(0, proj.margem),
        nivel, faltas_seguidas: seguidas,
        gravidade: NIVEL_GRAV[nivel] || "media",
      });
    }
    if (!risco.length) continue;
    risco.sort((a, b) => GRAV_ORDEM[b.gravidade] - GRAV_ORDEM[a.gravidade] || a.melhor_final - b.melhor_final || a.nome.localeCompare(b.nome, "pt-BR"));
    out.push({
      id: t.id, tema: t.tema, cliente: t.cliente, turma: t.turma, instrutor: t.instrutor, supervisor: t.supervisor,
      instrutores_adicionais: t._adicionais,
      data_inicio: t.data_inicio, data_fim: t.data_fim, presenca_minima_pct: minimo,
      participantes: partes.length, aulas: aulas.length, aulas_restantes: aulasRestantes + 0,
      pct_medio: nPct ? Math.round((somaPct / nPct) * 10) / 10 : null,
      perderam: risco.filter((r) => r.nivel === "perdeu").length,
      no_limite: risco.filter((r) => r.nivel === "no_limite").length,
      em_atencao: risco.filter((r) => r.nivel === "atencao" || r.nivel === "faltas_seguidas").length,
      gravidade: risco[0].gravidade,
      participantes_em_risco: risco,
    });
  }
  out.sort((a, b) => GRAV_ORDEM[b.gravidade] - GRAV_ORDEM[a.gravidade] || b.perderam - a.perderam || b.no_limite - a.no_limite || a.id - b.id);
  return { hoje, turmas: out, resumo: resumoRisco(out) };
}

function resumoRisco(turmas) {
  return {
    turmas_em_risco: turmas.length,
    pessoas_perderam: turmas.reduce((s, t) => s + t.perderam, 0),
    pessoas_no_limite: turmas.reduce((s, t) => s + t.no_limite, 0),
    pessoas_em_atencao: turmas.reduce((s, t) => s + t.em_atencao, 0),
  };
}

module.exports = { calcularProntidao, calcularRiscoCertificacao, projetarParticipante, hojeBahia, somarDias, diasEntre, GRAV_ORDEM };
