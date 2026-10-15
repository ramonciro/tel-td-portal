/**
 * jornadaDesenvolvimentoController.js — Desenvolvimento de cada pessoa nas
 * Jornadas (Fase 2, 16/10/2026): status e avaliação por etapa, % da jornada e
 * anotações de evolução. Proposta e decisões em
 * claude/proposta-presenca-desenvolvimento-jornadas-trilhas-2026-10-13.md.
 *
 * Regras:
 *  - Só a Metodologia lança (rota montada com authorizeRoles("metodologia");
 *    super_admin passa) — mesma decisão D da Fase 1.
 *  - Sem ajuste manual de horas: as horas vêm só da presença (decisão do Ramon).
 *  - O status da etapa pode ser SUGERIDO pela presença, mas a decisão final é
 *    da Metodologia: "aplicar sugestões" só preenche quem ainda não tem lançamento.
 *  - Tudo passa pela jornada (empresa_id); registro de outro ambiente responde
 *    404 igual a inexistente.
 */
const db = require("../lib/db");
const {
  STATUS_ETAPA,
  AVALIACOES,
  TIPOS_EVOLUCAO,
  calcularDesenvolvimento,
  hojeBahia,
} = require("../lib/jornadaDesenvolvimento");

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dataValida(v) {
  if (!DATA_ISO.test(String(v || ""))) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function erro(res, status, message) {
  return res.status(status).json({ error: message });
}

function falha(res, contexto, e) {
  console.error(`[jornadaDesenvolvimento] ${contexto}:`, e.message || e);
  return res.status(500).json({ error: "Erro interno ao processar o desenvolvimento da jornada." });
}

async function buscarJornada(req, id) {
  const jornadaId = Number(id);
  if (!jornadaId) return null;
  const tenant = req.empresaId ? " AND empresa_id = ?" : "";
  const params = req.empresaId ? [jornadaId, req.empresaId] : [jornadaId];
  const [rows] = await db.query(
    `SELECT id, nome, cliente, status, empresa_id, presenca_minima_pct, meta_horas, periodicidade_meses
     FROM jornadas_desenvolvimento WHERE id = ?${tenant} LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function buscarParticipante(req, id) {
  const participanteId = Number(id);
  if (!participanteId) return null;
  const tenant = req.empresaId ? " AND jd.empresa_id = ?" : "";
  const params = req.empresaId ? [participanteId, req.empresaId] : [participanteId];
  const [rows] = await db.query(
    `SELECT jp.id, jp.nome, jp.jornada_id, jp.pessoa_id, jd.empresa_id,
            jd.nome AS jornada_nome, jd.cliente, jd.presenca_minima_pct, jd.meta_horas, jd.periodicidade_meses
     FROM jornada_participantes jp
     JOIN jornadas_desenvolvimento jd ON jd.id = jp.jornada_id
     WHERE jp.id = ?${tenant} LIMIT 1`,
    params
  );
  return rows[0] || null;
}

function decimalOuNulo(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

// ───────────────────────── matriz da jornada ─────────────────────────

async function matriz(req, res) {
  try {
    const jornada = await buscarJornada(req, req.params.jornadaId);
    if (!jornada) return erro(res, 404, "Jornada não encontrada.");
    const d = await calcularDesenvolvimento(jornada, { incluirEvolucao: false });

    const comEtapas = d.participantes;
    const totais = {
      participantes: comEtapas.length,
      etapas: d.etapas.length,
      carga_prevista: d.carga_prevista,
      pct_medio_jornada: comEtapas.length
        ? Math.round((comEtapas.reduce((a, p) => a + (p.pct_jornada || 0), 0) / comEtapas.length) * 10) / 10
        : null,
      concluiram_todas: comEtapas.filter((p) => p.total_etapas > 0 && p.concluidas === p.total_etapas).length,
      sem_lancamento: comEtapas.filter((p) => Object.values(p.etapas).every((e) => !e.lancado)).length,
      sugestoes_pendentes: comEtapas.reduce(
        (a, p) => a + Object.values(p.etapas).filter((e) => !e.lancado && e.sugestao).length,
        0
      ),
    };

    return res.json({
      jornada: { id: jornada.id, nome: jornada.nome, cliente: jornada.cliente, status: jornada.status, ...d.config },
      etapas: d.etapas,
      participantes: d.participantes,
      totais,
      encontros_sem_etapa: d.encontros_sem_etapa,
      hoje: d.hoje,
    });
  } catch (e) {
    return falha(res, "matriz", e);
  }
}

// ───────────────────────── status/avaliação por etapa ─────────────────────────

async function salvarEtapa(req, res) {
  try {
    const participante = await buscarParticipante(req, req.params.participanteId);
    if (!participante) return erro(res, 404, "Participante não encontrado.");

    const etapaId = Number(req.params.etapaId);
    const [etapas] = await db.query(
      `SELECT id FROM jornadas_etapas WHERE id = ? AND jornada_id = ? LIMIT 1`,
      [etapaId, participante.jornada_id]
    );
    if (!etapas.length) return erro(res, 404, "Etapa não encontrada nesta jornada.");

    const b = req.body || {};
    const status = b.status === undefined || b.status === null || b.status === "" ? "nao_iniciada" : String(b.status);
    if (!STATUS_ETAPA.includes(status)) return erro(res, 400, "Status da etapa inválido.");

    const avaliacao = b.avaliacao === undefined || b.avaliacao === null || b.avaliacao === "" ? null : String(b.avaliacao);
    if (avaliacao !== null && !AVALIACOES.includes(avaliacao)) return erro(res, 400, "Avaliação inválida.");

    const nota = decimalOuNulo(b.nota);
    if (Number.isNaN(nota) || (nota !== null && (nota < 0 || nota > 10))) {
      return erro(res, 400, "A nota deve estar entre 0 e 10.");
    }

    const observacao = String(b.observacao || "").trim();
    if (observacao.length > 500) return erro(res, 400, "A observação aceita no máximo 500 caracteres.");

    const hoje = hojeBahia();
    let dataConclusao = null;
    if (status === "concluida") {
      dataConclusao = b.data_conclusao ? String(b.data_conclusao).slice(0, 10) : hoje;
      if (!dataValida(dataConclusao)) return erro(res, 400, "Data de conclusão inválida.");
      if (dataConclusao > hoje) return erro(res, 400, "A data de conclusão não pode ser futura.");
    }

    // Nada preenchido → remove o lançamento (volta a "sem lançamento").
    if (status === "nao_iniciada" && avaliacao === null && nota === null && !observacao) {
      await db.query(`DELETE FROM jornada_participante_etapas WHERE participante_id = ? AND etapa_id = ?`, [participante.id, etapaId]);
      return res.json({ ok: true, removido: true });
    }

    await db.query(
      `INSERT INTO jornada_participante_etapas
         (empresa_id, participante_id, etapa_id, status, data_conclusao, avaliacao, nota, observacao, atualizado_por_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), data_conclusao = VALUES(data_conclusao),
         avaliacao = VALUES(avaliacao), nota = VALUES(nota), observacao = VALUES(observacao),
         atualizado_por_id = VALUES(atualizado_por_id)`,
      [participante.empresa_id ?? null, participante.id, etapaId, status, dataConclusao, avaliacao, nota, observacao || null, req.user?.id ?? null]
    );
    return res.json({ ok: true });
  } catch (e) {
    return falha(res, "salvarEtapa", e);
  }
}

// Preenche status pela presença — só onde ainda NÃO há lançamento. Com
// `confirmar` ausente apenas conta (prévia), nada é gravado.
async function aplicarSugestoes(req, res) {
  try {
    const jornada = await buscarJornada(req, req.params.jornadaId);
    if (!jornada) return erro(res, 404, "Jornada não encontrada.");

    const etapaFiltro = req.body?.etapa_id ? Number(req.body.etapa_id) : null;
    const confirmar = req.body?.confirmar === true;
    const d = await calcularDesenvolvimento(jornada, { incluirEvolucao: false });

    const [encontros] = await db.query(
      `SELECT etapa_id, MAX(DATE_FORMAT(data, '%Y-%m-%d')) AS ultima FROM jornada_encontros
       WHERE jornada_id = ? AND etapa_id IS NOT NULL GROUP BY etapa_id`,
      [jornada.id]
    );
    const ultimaPorEtapa = new Map(encontros.map((e) => [e.etapa_id, e.ultima]));

    const itens = [];
    for (const p of d.participantes) {
      for (const et of d.etapas) {
        if (etapaFiltro && et.id !== etapaFiltro) continue;
        const c = p.etapas[et.id];
        if (c.lancado || !c.sugestao) continue;
        itens.push({ participante_id: p.id, etapa_id: et.id, status: c.sugestao, data: c.sugestao === "concluida" ? ultimaPorEtapa.get(et.id) || d.hoje : null });
      }
    }

    const resumo = {
      concluida: itens.filter((i) => i.status === "concluida").length,
      em_andamento: itens.filter((i) => i.status === "em_andamento").length,
    };
    if (!confirmar) return res.json({ ok: true, previa: true, total: itens.length, ...resumo });

    for (const i of itens) {
      // INSERT IGNORE: se alguém lançou no meio do caminho, o lançamento manual vence.
      await db.query(
        `INSERT IGNORE INTO jornada_participante_etapas (empresa_id, participante_id, etapa_id, status, data_conclusao, atualizado_por_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [jornada.empresa_id ?? null, i.participante_id, i.etapa_id, i.status, i.data, req.user?.id ?? null]
      );
    }
    return res.json({ ok: true, aplicadas: itens.length, ...resumo });
  } catch (e) {
    return falha(res, "aplicarSugestoes", e);
  }
}

// ───────────────────────── painel da pessoa ─────────────────────────

async function painel(req, res) {
  try {
    const participante = await buscarParticipante(req, req.params.participanteId);
    if (!participante) return erro(res, 404, "Participante não encontrado.");
    const d = await calcularDesenvolvimento(
      { id: participante.jornada_id, presenca_minima_pct: participante.presenca_minima_pct, meta_horas: participante.meta_horas, periodicidade_meses: participante.periodicidade_meses },
      { participanteId: participante.id }
    );
    return res.json({
      jornada: { id: participante.jornada_id, nome: participante.jornada_nome, cliente: participante.cliente, ...d.config },
      etapas: d.etapas,
      participante: d.participantes[0] || null,
      hoje: d.hoje,
    });
  } catch (e) {
    return falha(res, "painel", e);
  }
}

// ───────────────────────── evolução ─────────────────────────

function validarNota(body) {
  const texto = String(body?.texto || "").trim();
  if (!texto) return { erro: "Escreva a anotação de evolução." };
  if (texto.length > 2000) return { erro: "A anotação aceita no máximo 2000 caracteres." };
  const tipo = body?.tipo ? String(body.tipo) : "geral";
  if (!TIPOS_EVOLUCAO.includes(tipo)) return { erro: "Tipo de anotação inválido." };
  const hoje = hojeBahia();
  const data = body?.data ? String(body.data).slice(0, 10) : hoje;
  if (!dataValida(data)) return { erro: "Data inválida." };
  if (data > hoje) return { erro: "A data da anotação não pode ser futura." };
  return { texto, tipo, data };
}

async function criarEvolucao(req, res) {
  try {
    const participante = await buscarParticipante(req, req.params.participanteId);
    if (!participante) return erro(res, 404, "Participante não encontrado.");
    const v = validarNota(req.body);
    if (v.erro) return erro(res, 400, v.erro);
    const [r] = await db.query(
      `INSERT INTO jornada_evolucao_notas (empresa_id, participante_id, data, tipo, texto, criado_por_id, criado_por_nome)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [participante.empresa_id ?? null, participante.id, v.data, v.tipo, v.texto, req.user?.id ?? null, req.user?.nome || null]
    );
    return res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    return falha(res, "criarEvolucao", e);
  }
}

async function buscarNota(req, id) {
  const notaId = Number(id);
  if (!notaId) return null;
  const tenant = req.empresaId ? " AND jd.empresa_id = ?" : "";
  const params = req.empresaId ? [notaId, req.empresaId] : [notaId];
  const [rows] = await db.query(
    `SELECT n.id FROM jornada_evolucao_notas n
     JOIN jornada_participantes jp ON jp.id = n.participante_id
     JOIN jornadas_desenvolvimento jd ON jd.id = jp.jornada_id
     WHERE n.id = ?${tenant} LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function atualizarEvolucao(req, res) {
  try {
    const nota = await buscarNota(req, req.params.id);
    if (!nota) return erro(res, 404, "Anotação não encontrada.");
    const v = validarNota(req.body);
    if (v.erro) return erro(res, 400, v.erro);
    await db.query(`UPDATE jornada_evolucao_notas SET data = ?, tipo = ?, texto = ? WHERE id = ?`, [v.data, v.tipo, v.texto, nota.id]);
    return res.json({ ok: true });
  } catch (e) {
    return falha(res, "atualizarEvolucao", e);
  }
}

async function excluirEvolucao(req, res) {
  try {
    const nota = await buscarNota(req, req.params.id);
    if (!nota) return erro(res, 404, "Anotação não encontrada.");
    await db.query(`DELETE FROM jornada_evolucao_notas WHERE id = ?`, [nota.id]);
    return res.json({ ok: true });
  } catch (e) {
    return falha(res, "excluirEvolucao", e);
  }
}

module.exports = {
  matriz,
  salvarEtapa,
  aplicarSugestoes,
  painel,
  criarEvolucao,
  atualizarEvolucao,
  excluirEvolucao,
};
