/**
 * reembolsoTransporteController.js — Pacote Salas/Assistente/CPF/Horas/Farol
 * MPT (15/09/2026)
 *
 * Presença Nominal / Reembolso de Transporte (decisão 15): para turmas
 * classificadas como "Avaliação Técnica" (decisão 20, mesmo padrão de
 * subtipo de acoes_desenvolvimento), gera a lista nome completo + CPF +
 * dias em treinamento (decisão 16: dias com presença confirmada na
 * chamada) de cada participante, e o export em Excel correspondente. Sem
 * aprovação dentro do portal.
 *
 * Decisão 14: CPF só é devolvido para Assistente de Treinamento,
 * Coordenador e Super Admin — os únicos perfis com acesso a esta tela
 * (ver authorizeRoles nas rotas, em index.js).
 *
 * Decisão 19: toda visualização e todo export gera registro em
 * auditoria_log (quem acessou, quando, qual turma) — reaproveitando o
 * serviço de auditoria já existente, sem tabela nova.
 *
 * Acesso cross-tenant da Assistente de Treinamento: decidido aqui, não no
 * clientMiddleware (ver lib/tenantScope.js e a razão registrada em
 * claude/auditoria-riscos-cruzados-pacote-salas-2026-09.md).
 */
const XLSX = require("xlsx");
const pool = require("../lib/db");
const { getFrequenciaPorParticipante } = require("../services/presencaResolver");
const { registrarAuditoria } = require("../services/auditoria");
const { tenantScopeFor } = require("../lib/tenantScope");

const CROSS_TENANT_ROLES = ["assistente_treinamento"];
const SUBTIPO_AVALIACAO_TECNICA = "Avaliação Técnica";

async function buscarTurmaElegivel(req, treinamentoId) {
  const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
  const tenantCheck = empresaId ? " AND empresa_id = ?" : "";
  const params = empresaId ? [treinamentoId, empresaId] : [treinamentoId];

  const [rows] = await pool.query(
    `SELECT id, tema, cliente, empresa_id, subtipo FROM treinamentos WHERE id = ?${tenantCheck} LIMIT 1`,
    params
  );
  return rows[0] || null;
}

async function montarListaNominal(treinamentoId, empresaId) {
  const [participantes] = await pool.query(
    `SELECT nome, cpf, matricula FROM treinamento_participantes WHERE treinamento_id = ? ORDER BY nome ASC`,
    [treinamentoId]
  );

  const frequencias = await getFrequenciaPorParticipante({
    treinamentoId: Number(treinamentoId),
    empresaId,
  });
  const freqPorNome = new Map(frequencias.map((f) => [f.treinando_nome, f]));

  return participantes.map((p) => {
    const freq = freqPorNome.get(p.nome);
    return {
      nome: p.nome,
      cpf: p.cpf || null,
      matricula: p.matricula || null,
      // Decisão 16: "dias em treinamento" = dias com presença confirmada
      // na chamada — getFrequenciaPorParticipante já resolve cronograma
      // > legado pela mesma prioridade usada no resto do sistema (ver
      // presencaResolver.js), então turma migrada retroativamente sem
      // dado de presença por dia continua puxando do legado corretamente.
      dias_em_treinamento: freq ? freq.presentes : 0,
    };
  });
}

// GET /api/reembolso-transporte/turmas — turmas elegíveis (subtipo =
// "Avaliação Técnica") pro seletor da tela.
async function listarTurmasElegiveis(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const tenantCheck = empresaId ? " AND t.empresa_id = ?" : "";
    const params = empresaId ? [SUBTIPO_AVALIACAO_TECNICA, empresaId] : [SUBTIPO_AVALIACAO_TECNICA];

    const [rows] = await pool.query(
      `
      SELECT t.id, t.tema, t.cliente, t.empresa_id, t.data_inicio, t.data, t.data_fim
      FROM treinamentos t
      WHERE t.subtipo = ?${tenantCheck}
      ORDER BY COALESCE(t.data_inicio, t.data) DESC
      `,
      params
    );

    return res.json(rows);
  } catch (error) {
    console.error("[reembolsoTransporteController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao listar turmas de Avaliação Técnica" });
  }
}

// GET /api/reembolso-transporte/:treinamento_id — lista nominal em tela.
async function obterListaNominal(req, res) {
  try {
    const { treinamento_id } = req.params;
    const { empresaId, crossTenant } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });

    const turma = await buscarTurmaElegivel(req, treinamento_id);
    if (!turma) {
      return res.status(404).json({ ok: false, message: "Turma não encontrada" });
    }
    if (turma.subtipo !== SUBTIPO_AVALIACAO_TECNICA) {
      return res.status(400).json({
        ok: false,
        message: 'Presença Nominal/Reembolso só está disponível para turmas classificadas como "Avaliação Técnica".',
      });
    }

    const itens = await montarListaNominal(treinamento_id, empresaId);

    // Decisão 19 — toda VISUALIZAÇÃO gera auditoria.
    registrarAuditoria({
      usuario: req.user,
      acao: "visualizar",
      entidade: "presenca_nominal",
      entidadeId: treinamento_id,
      resumo: `${req.user?.nome || "Alguém"} visualizou a lista nominal (CPF) da turma "${turma.tema}" (${turma.cliente})${crossTenant ? " — acesso cross-tenant (Assistente de Treinamento)" : ""}`,
      ip: req.ip,
    });

    return res.json({ ok: true, turma, itens });
  } catch (error) {
    console.error("[reembolsoTransporteController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao montar a lista nominal" });
  }
}

// GET /api/reembolso-transporte/:treinamento_id/exportar — export Excel.
async function exportarListaNominal(req, res) {
  try {
    const { treinamento_id } = req.params;
    const { empresaId, crossTenant } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });

    const turma = await buscarTurmaElegivel(req, treinamento_id);
    if (!turma) {
      return res.status(404).json({ ok: false, message: "Turma não encontrada" });
    }
    if (turma.subtipo !== SUBTIPO_AVALIACAO_TECNICA) {
      return res.status(400).json({
        ok: false,
        message: 'Presença Nominal/Reembolso só está disponível para turmas classificadas como "Avaliação Técnica".',
      });
    }

    const itens = await montarListaNominal(treinamento_id, empresaId);

    const linhas = itens.map((item) => [
      item.nome,
      item.cpf || "-",
      item.matricula || "-",
      item.dias_em_treinamento,
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [`Turma: ${turma.tema}`, `Cliente: ${turma.cliente}`],
      [],
      ["Nome completo", "CPF", "Matrícula", "Dias em treinamento"],
      ...linhas,
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Presença Nominal");

    // Decisão 19 — todo EXPORT gera auditoria.
    registrarAuditoria({
      usuario: req.user,
      acao: "exportar",
      entidade: "presenca_nominal",
      entidadeId: treinamento_id,
      resumo: `${req.user?.nome || "Alguém"} exportou a lista nominal (CPF) da turma "${turma.tema}" (${turma.cliente})${crossTenant ? " — acesso cross-tenant (Assistente de Treinamento)" : ""}`,
      ip: req.ip,
    });

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="reembolso-transporte-turma-${treinamento_id}.xlsx"`);
    return res.send(buf);
  } catch (error) {
    console.error("[reembolsoTransporteController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao exportar a lista nominal" });
  }
}

module.exports = {
  listarTurmasElegiveis,
  obterListaNominal,
  exportarListaNominal,
};
