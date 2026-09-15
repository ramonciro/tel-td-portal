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
const { listarSalasComDisponibilidade } = require("../services/salaConflitoService");

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

module.exports = {
  listarSalas,
  criarSala,
  atualizarSala,
  desativarSala,
  disponibilidadeSalas,
};
