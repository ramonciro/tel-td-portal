/**
 * salasController.js — Pacote Salas/Assistente/CPF/Horas/Farol MPT (15/09/2026)
 *
 * Catálogo de salas: tabela ÚNICA, sem empresa_id (as mesmas salas físicas podem
 * existir em vários ambientes). Cada ambiente escolhe quais salas usa
 * (sala_ambientes, 17/11/2026 — PUT /api/salas/:id/ambiente, feito pelo Coordenador
 * do ambiente). Editar/desativar uma sala usada por mais de um ambiente fica com a
 * Assistente de Treinamento / Super Admin; o Coordenador só mexe nas salas que só o
 * ambiente dele usa. Agenda é compartilhada, com detalhe mascarado entre ambientes.
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
const SA = require("../services/salaAmbienteService");
const { tenantScopeFor } = require("../lib/tenantScope");

// Assistente de Treinamento vê e administra todos os ambientes (mesma exceção das telas de turma); os demais ficam no ambiente deles.
function escopo(req) {
  return tenantScopeFor(req, { crossTenantRoles: ["assistente_treinamento"] });
}
function hojeISOLocal0() {
  const h = new Date();
  return [h.getFullYear(), String(h.getMonth() + 1).padStart(2, "0"), String(h.getDate()).padStart(2, "0")].join("-");
}
/** A sala pode ser editada/desativada pelo usuário? Sala usada por outro ambiente só pela Assistente / Super Admin. */
async function podeAlterarCatalogo(req, salaId) {
  const { empresaId } = escopo(req);
  if (!empresaId) return { ok: true };
  const ambientes = await SA.ambientesDaSala(salaId);
  const deOutros = ambientes.filter((e) => e !== Number(empresaId));
  if (!deOutros.length) return { ok: true };
  return { ok: false, message: "Esta sala também é usada por outro ambiente. Para renomear, mudar a capacidade ou desativar, fale com a Assistente de Treinamento. Você pode tirá-la do seu ambiente em \"Tirar do ambiente\"." };
}

const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const GRUPOS_VALIDOS = ["geral", "sebrae"];

async function listarSalas(req, res) {
  try {
    // `habilitada` é sempre em relação ao ambiente de quem está logado (inclusive a Assistente, que vê todos).
    const empresaId = req.empresaId || null;
    const [rows] = await pool.query(
      `SELECT id, nome, capacidade, grupo, ativo, criado_em FROM salas ORDER BY grupo ASC, nome ASC`
    );
    // Salas por ambiente: `habilitada` diz se a sala é usada neste ambiente; `ambientes_qtd` quantos ambientes a usam.
    // O catálogo inteiro continua visível (a coordenação precisa dele para escolher quais salas usar).
    const habilitadas = await SA.idsDoAmbiente(empresaId);
    const qtd = await SA.contagemPorSala();
    return res.json(rows.map((r) => ({
      ...r,
      habilitada: habilitadas === null ? true : habilitadas.has(Number(r.id)),
      ambientes_qtd: qtd.get(Number(r.id)) || 0,
    })));
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

    // A sala nova já fica habilitada no ambiente de quem cadastrou (os outros ambientes escolhem se querem usar).
    const { empresaId } = escopo(req);
    const eId = empresaId || req.empresaId || null;
    if (eId) await SA.habilitar(result.insertId, eId);

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

    const perm = await podeAlterarCatalogo(req, Number(id));
    if (!perm.ok) return res.status(403).json({ ok: false, message: perm.message });

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
    const perm = await podeAlterarCatalogo(req, Number(id));
    if (!perm.ok) return res.status(403).json({ ok: false, message: perm.message });
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
    const { data_inicio, data_fim, hora_inicio, hora_fim, excluir_treinamento_id, sala_atual_id } = req.query || {};
    const { empresaId } = escopo(req);

    const { salas, retroativa } = await listarSalasComDisponibilidade({
      dataInicio: data_inicio || null,
      dataFim: data_fim || data_inicio || null,
      horaInicio: hora_inicio || null,
      horaFim: hora_fim || null,
      excluirTreinamentoId: excluir_treinamento_id ? Number(excluir_treinamento_id) : null,
      empresaId,
      salaAtualId: sala_atual_id ? Number(sala_atual_id) : null,
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
    const { empresaId } = escopo(req);
    const { salas, ocupacoes } = await agendaSalas({ dataInicio: ini, dataFim: fim, empresaId });
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
    const { empresaId: empEscopo } = escopo(req);
    if (!(await SA.salaDoAmbiente(salaId, empEscopo))) {
      return res.status(400).json({ ok: false, message: `${sala[0].nome} não está habilitada no seu ambiente. Habilite-a em Salas antes de bloquear.` });
    }

    // Bloqueio no passado é só registro histórico (mesma lógica da turma retroativa): não confere conflito.
    if (!turmaEhRetroativa(dataFim)) {
      const conflitos = await buscarConflitosSala({ salaId, dataInicio, dataFim, horaInicio, horaFim });
      if (conflitos.length) {
        const c = SA.mascarar(conflitos[0], empEscopo);
        const quem = c.outro_ambiente ? "reserva de outro ambiente" : c.tipo === "bloqueio" ? `bloqueio "${c.tema}"` : `turma "${c.tema}" (${c.cliente})`;
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
    // Coordenador só cancela bloqueio do próprio ambiente (Assistente e Super Admin enxergam todos: empresaId nulo).
    const { empresaId: escopoEmp } = escopo(req);
    const filtroEmp = escopoEmp ? " AND empresa_id = ?" : "";
    const paramsEmp = escopoEmp ? [id, escopoEmp] : [id];
    const [rows] = await pool.query(`SELECT id, motivo, sala_id, ativo FROM sala_bloqueios WHERE id = ?${filtroEmp} LIMIT 1`, paramsEmp);
    if (!rows.length || !rows[0].ativo) return res.status(404).json({ ok: false, message: "Bloqueio não encontrado." });
    await pool.query(`UPDATE sala_bloqueios SET ativo = 0, cancelado_em = NOW() WHERE id = ?${filtroEmp}`, paramsEmp);
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

// PUT /api/salas/:id/ambiente { habilitada: true|false, empresa_id? } — escolhe se a sala é usada neste ambiente.
// Coordenador mexe só no ambiente dele; Assistente de Treinamento e Super Admin informam o `empresa_id` do ambiente.
async function definirSalaNoAmbiente(req, res) {
  try {
    const id = Number(req.params.id);
    const habilitada = req.body?.habilitada === true || req.body?.habilitada === 1 || req.body?.habilitada === "1";
    const { empresaId: escopoEmp, crossTenant } = escopo(req);
    let empresaId = escopoEmp;
    // Assistente / Super Admin: `empresa_id` do corpo escolhe o ambiente; sem ele, vale o ambiente de quem está logado.
    if (!empresaId) empresaId = Number(req.body?.empresa_id) || req.empresaId || null;
    if (!empresaId) return res.status(400).json({ ok: false, message: "Informe o ambiente (empresa_id)." });
    if (escopoEmp && req.body?.empresa_id && Number(req.body.empresa_id) !== Number(escopoEmp) && !crossTenant) {
      return res.status(403).json({ ok: false, message: "Você só escolhe as salas do seu ambiente." });
    }
    if (!(await SA.temTabela())) return res.status(409).json({ ok: false, message: "Recurso ainda não disponível: a atualização do banco não foi concluída." });
    const [sala] = await pool.query(`SELECT id, nome, ativo FROM salas WHERE id = ? LIMIT 1`, [id]);
    if (!sala.length) return res.status(404).json({ ok: false, message: "Sala não encontrada" });
    if (habilitada) {
      if (!sala[0].ativo) return res.status(400).json({ ok: false, message: "Sala desativada no catálogo. Reative-a antes de usar." });
      await SA.habilitar(id, empresaId);
    } else {
      const futuras = await SA.turmasFuturasNaSala(id, empresaId, hojeISOLocal0());
      if (futuras.length) {
        const lista = futuras.map((t) => `"${t.tema}" (${t.inicio})`).join(", ");
        return res.status(409).json({ ok: false, message: `${sala[0].nome} ainda é usada por turma deste ambiente que não terminou: ${lista}. Mude a sala dessas turmas antes de tirá-la do ambiente.` });
      }
      await SA.desabilitar(id, empresaId);
    }
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "sala_ambiente", entidadeId: id,
      resumo: `${req.user?.nome || "Alguém"} ${habilitada ? "habilitou" : "tirou"} ${sala[0].nome} ${habilitada ? "no" : "do"} ambiente ${empresaId}`,
      ip: req.ip,
    });
    return res.json({ ok: true, habilitada, message: habilitada ? "Sala habilitada neste ambiente." : "Sala retirada deste ambiente." });
  } catch (error) {
    console.error("[salasController] ambiente:", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao atualizar as salas do ambiente" });
  }
}

module.exports = {
  definirSalaNoAmbiente,
  agendaDasSalas,
  criarBloqueio,
  cancelarBloqueio,
  listarSalas,
  criarSala,
  atualizarSala,
  desativarSala,
  disponibilidadeSalas,
};
