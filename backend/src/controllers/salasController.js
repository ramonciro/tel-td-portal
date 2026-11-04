/**
 * salasController.js — Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026)
 *
 * Catálogo de salas: tabela GLOBAL, sem empresa_id (decisão 8 — 6 salas
 * físicas compartilhadas entre todas as tenants). CRUD liberado para
 * Super Admin e Assistente de Treinamento (decisão 13); qualquer outro
 * perfil autorizado só lista/consulta disponibilidade (Coordenadores "só
 * consultam e usam", conforme a proposta).
 */
const pool = require("../lib/db");
const {
  listarSalasComDisponibilidade,
  buscarConflitosSala,
  agendaSalas,
  somarDiasISO,
  turmaEhRetroativa,
} = require("../services/salaConflitoService");
const { registrarAuditoria } = require("../services/auditoria");

const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const GRUPOS_VALIDOS = ["geral", "sebrae"];

async function listarSalas(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, nome, capacidade, grupo, ativo, criado_em FROM salas ORDER BY grupo ASC, nome ASC`
    );
    return res.json(rows);
  } catch (error) {
    console.error("[salasController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao listar salas" });
  }
}

async function criarSala(req, res) {
  try {
    const { nome, capacidade, grupo } = req.body || {};
    const nomeLimpo = String(nome || "").trim();
    if (!nomeLimpo) {
      return res.status(400).json({ ok: false, message: "Informe o nome da sala" });
    }
    const grupoNormalizado = GRUPOS_VALIDOS.includes(String(grupo || "").toLowerCase())
      ? String(grupo).toLowerCase()
      : "geral";

    const [result] = await pool.query(
      `INSERT INTO salas (nome, capacidade, grupo, ativo) VALUES (?, ?, ?, 1)`,
      [nomeLimpo, capacidade ? Number(capacidade) : null, grupoNormalizado]
    );

    return res.status(201).json({ ok: true, id: result.insertId, message: "Sala criada com sucesso" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Já existe uma sala com esse nome" });
    }
    console.error("[salasController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao criar sala" });
  }
}

async function atualizarSala(req, res) {
  try {
    const { id } = req.params;
    const { nome, capacidade, grupo, ativo } = req.body || {};

    const [existente] = await pool.query(`SELECT id FROM salas WHERE id = ? LIMIT 1`, [id]);
    if (!existente.length) {
      return res.status(404).json({ ok: false, message: "Sala não encontrada" });
    }

    const campos = [];
    const valores = [];
    if (nome !== undefined) { campos.push("nome = ?"); valores.push(String(nome).trim()); }
    if (capacidade !== undefined) { campos.push("capacidade = ?"); valores.push(capacidade ? Number(capacidade) : null); }
    if (grupo !== undefined) { campos.push("grupo = ?"); valores.push(GRUPOS_VALIDOS.includes(String(grupo).toLowerCase()) ? String(grupo).toLowerCase() : "geral"); }
    if (ativo !== undefined) { campos.push("ativo = ?"); valores.push(ativo ? 1 : 0); }

    if (!campos.length) {
      return res.status(400).json({ ok: false, message: "Nenhum campo válido enviado" });
    }

    valores.push(id);
    await pool.query(`UPDATE salas SET ${campos.join(", ")} WHERE id = ?`, valores);

    return res.json({ ok: true, message: "Sala atualizada com sucesso" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Já existe uma sala com esse nome" });
    }
    console.error("[salasController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao atualizar sala" });
  }
}

// Decisão 3 do desenho original (sem reserva avulsa): não existe exclusão
// "dura" de sala aqui de propósito — desativar (ativo=0, via atualizarSala)
// é o caminho normal, pra não invalidar o histórico de turmas que já
// referenciam a sala (sala_id tem ON DELETE SET NULL só como rede de
// segurança, não como fluxo esperado).
async function desativarSala(req, res) {
  try {
    const { id } = req.params;
    const [existente] = await pool.query(`SELECT id FROM salas WHERE id = ? LIMIT 1`, [id]);
    if (!existente.length) {
      return res.status(404).json({ ok: false, message: "Sala não encontrada" });
    }
    await pool.query(`UPDATE salas SET ativo = 0 WHERE id = ?`, [id]);
    return res.json({ ok: true, message: "Sala desativada com sucesso" });
  } catch (error) {
    console.error("[salasController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao desativar sala" });
  }
}

// Decisão 6/9: usada pelo formulário de turma para filtrar o campo Sala
// depois de informar data(s) e horário — varre todas as tenants de
// propósito (ver salaConflitoService.js). Também usada pelo painel de
// disponibilidade (Fase 2, ainda não construído) quando existir.
async function disponibilidadeSalas(req, res) {
  try {
    const { data_inicio, data_fim, hora_inicio, hora_fim, excluir_treinamento_id } = req.query || {};

    const { salas, retroativa } = await listarSalasComDisponibilidade({
      dataInicio: data_inicio || null,
      dataFim: data_fim || data_inicio || null,
      horaInicio: hora_inicio || null,
      horaFim: hora_fim || null,
      excluirTreinamentoId: excluir_treinamento_id ? Number(excluir_treinamento_id) : null,
    });

    return res.json({ ok: true, retroativa, salas });
  } catch (error) {
    console.error("[salasController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao consultar disponibilidade de salas" });
  }
}


function hojeISOLocal() {
  const h = new Date();
  return [h.getFullYear(), String(h.getMonth() + 1).padStart(2, "0"), String(h.getDate()).padStart(2, "0")].join("-");
}

// GET /api/salas/agenda?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD (padrão: a semana de hoje, segunda a domingo; máx. 42 dias)
async function agendaDasSalas(req, res) {
  try {
    let { data_inicio: ini, data_fim: fim } = req.query || {};
    if (!ini || !ISO_DATA.test(String(ini))) {
      const hoje = hojeISOLocal();
      const dow = (new Date(`${hoje}T00:00:00Z`).getUTCDay() + 6) % 7; // segunda = 0
      ini = somarDiasISO(hoje, -dow);
      fim = somarDiasISO(ini, 6);
    }
    if (!fim || !ISO_DATA.test(String(fim))) fim = somarDiasISO(String(ini), 6);
    if (String(fim) < String(ini)) {
      return res.status(400).json({ ok: false, message: "A data final precisa ser igual ou depois da inicial." });
    }
    const dias = Math.round((new Date(`${fim}T00:00:00Z`) - new Date(`${ini}T00:00:00Z`)) / 86400000) + 1;
    if (dias > 42) {
      return res.status(400).json({ ok: false, message: "Escolha um período de até 42 dias." });
    }
    const { salas, ocupacoes } = await agendaSalas({ dataInicio: ini, dataFim: fim });
    return res.json({ ok: true, data_inicio: ini, data_fim: fim, salas, ocupacoes });
  } catch (error) {
    console.error("[salasController] agenda:", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao carregar a agenda das salas" });
  }
}

// POST /api/salas/bloqueios — reserva de sala sem turma (manutenção, evento, reunião)
async function criarBloqueio(req, res) {
  try {
    const b = req.body || {};
    const salaId = Number(b.sala_id);
    const motivo = String(b.motivo || "").trim();
    const dataInicio = String(b.data_inicio || "").slice(0, 10);
    const dataFim = String(b.data_fim || b.data_inicio || "").slice(0, 10);
    const horaInicio = String(b.hora_inicio || "").slice(0, 5);
    const horaFim = String(b.hora_fim || "").slice(0, 5);

    if (!Number.isInteger(salaId) || salaId <= 0) return res.status(400).json({ ok: false, message: "Escolha a sala." });
    if (!motivo) return res.status(400).json({ ok: false, message: "Informe o motivo do bloqueio." });
    if (motivo.length > 200) return res.status(400).json({ ok: false, message: "O motivo pode ter até 200 caracteres." });
    if (!ISO_DATA.test(dataInicio) || !ISO_DATA.test(dataFim)) {
      return res.status(400).json({ ok: false, message: "Informe as datas do bloqueio." });
    }
    if (dataFim < dataInicio) return res.status(400).json({ ok: false, message: "A data final precisa ser igual ou depois da inicial." });
    if (!HHMM.test(horaInicio) || !HHMM.test(horaFim)) {
      return res.status(400).json({ ok: false, message: "Horário inválido — use o formato HH:MM." });
    }
    if (horaFim <= horaInicio) return res.status(400).json({ ok: false, message: "O horário de fim precisa ser depois do horário de início." });

    const [sala] = await pool.query(`SELECT id, nome FROM salas WHERE id = ? AND ativo = 1 LIMIT 1`, [salaId]);
    if (!sala.length) return res.status(404).json({ ok: false, message: "Sala não encontrada ou desativada." });

    // Bloqueio no passado é só registro histórico (mesma lógica da turma retroativa): não confere conflito.
    if (!turmaEhRetroativa(dataFim)) {
      const conflitos = await buscarConflitosSala({ salaId, dataInicio, dataFim, horaInicio, horaFim });
      if (conflitos.length) {
        const c = conflitos[0];
        const quem = c.tipo === "bloqueio" ? `bloqueio "${c.tema}"` : `turma "${c.tema}" (${c.cliente})`;
        return res.status(409).json({
          ok: false,
          message: `${sala[0].nome} já está ocupada nesse horário pela ${quem}, de ${String(c.hora_inicio).slice(0, 5)} às ${String(c.hora_fim).slice(0, 5)}.`,
        });
      }
    }

    const [r] = await pool.query(
      `INSERT INTO sala_bloqueios (sala_id, data_inicio, data_fim, hora_inicio, hora_fim, motivo, empresa_id, criado_por_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [salaId, dataInicio, dataFim, horaInicio, horaFim, motivo, req.empresaId || null, req.user?.id || null]
    );
    registrarAuditoria({
      usuario: req.user, acao: "criar", entidade: "sala_bloqueio", entidadeId: r.insertId,
      resumo: `${req.user?.nome || "Alguém"} bloqueou ${sala[0].nome} (${dataInicio}${dataFim !== dataInicio ? ` a ${dataFim}` : ""}, ${horaInicio}–${horaFim}): ${motivo}`,
      ip: req.ip,
    });
    return res.status(201).json({ ok: true, id: r.insertId, message: "Sala bloqueada." });
  } catch (error) {
    console.error("[salasController] bloqueio:", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao bloquear a sala" });
  }
}

// DELETE /api/salas/bloqueios/:id — cancela o bloqueio (fica registrado, só deixa de ocupar a sala)
async function cancelarBloqueio(req, res) {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(`SELECT id, motivo, sala_id, ativo FROM sala_bloqueios WHERE id = ? LIMIT 1`, [id]);
    if (!rows.length || !rows[0].ativo) return res.status(404).json({ ok: false, message: "Bloqueio não encontrado." });
    await pool.query(`UPDATE sala_bloqueios SET ativo = 0, cancelado_em = NOW() WHERE id = ?`, [id]);
    registrarAuditoria({
      usuario: req.user, acao: "excluir", entidade: "sala_bloqueio", entidadeId: id,
      resumo: `${req.user?.nome || "Alguém"} cancelou o bloqueio de sala "${rows[0].motivo}"`,
      ip: req.ip,
    });
    return res.json({ ok: true, message: "Bloqueio cancelado." });
  } catch (error) {
    console.error("[salasController] cancelar bloqueio:", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao cancelar o bloqueio" });
  }
}

module.exports = {
  agendaDasSalas,
  criarBloqueio,
  cancelarBloqueio,
  listarSalas,
  criarSala,
  atualizarSala,
  desativarSala,
  disponibilidadeSalas,
};
