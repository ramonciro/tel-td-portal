/**
 * reembolsoTransporteController.js — Pacote Salas/Assistente/CPF/Horas/Farol
 * MPT (15/09/2026) + planilha no modelo do financeiro (15/09/2026, tarde)
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
 *
 * --- Ajuste de 15/09/2026 (tarde) — planilha no modelo real do financeiro ---
 * Ramon mandou o modelo usado hoje para pedir VT ("SOLICITAÇÃO DE VT -
 * AVALIAÇÃO TÉCNICA.xlsx") e pediu pra exportação seguir esse layout. Três
 * coisas que o export simples (nome/CPF/matrícula/dias) não tinha e o
 * modelo real precisa, decididas com o Ramon antes de implementar:
 *
 *   1) Dados bancários/PIX por pessoa — cadastrados manualmente no Portal
 *      (não tínhamos esse dado em lugar nenhum) e guardados por CPF em
 *      dados_bancarios_colaborador (migrate.js passo 36), pra não pedir de
 *      novo numa próxima turma da mesma pessoa. Ver salvarDadosBancarios.
 *   2) Valor da passagem configurável por turma (nem toda turma/cliente
 *      paga o mesmo valor) — treinamentos.valor_passagem_vt, com R$5,90
 *      como padrão até a primeira exportação informar um valor.
 *   3) "Período da requisição" pode ser um recorte de dias dentro da turma
 *      (cortes semanais/quinzenais), não necessariamente a turma inteira —
 *      reaproveita os parâmetros `inicio`/`fim` que
 *      getFrequenciaPorParticipante já aceitava (usados em outro lugar do
 *      sistema) pra contar só a presença dentro do período pedido.
 */
const ExcelJS = require("exceljs");
const pool = require("../lib/db");
const { getFrequenciaPorParticipante } = require("../services/presencaResolver");
const { registrarAuditoria } = require("../services/auditoria");
const { tenantScopeFor } = require("../lib/tenantScope");

const CROSS_TENANT_ROLES = ["assistente_treinamento"];
const SUBTIPO_AVALIACAO_TECNICA = "Avaliação Técnica";
const VALOR_PASSAGEM_PADRAO = 5.9;

async function buscarTurmaElegivel(req, treinamentoId) {
  const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
  const tenantCheck = empresaId ? " AND empresa_id = ?" : "";
  const params = empresaId ? [treinamentoId, empresaId] : [treinamentoId];

  const [rows] = await pool.query(
    `SELECT id, tema, cliente, empresa_id, subtipo, data_inicio, data, data_fim, valor_passagem_vt
     FROM treinamentos WHERE id = ?${tenantCheck} LIMIT 1`,
    params
  );
  return rows[0] || null;
}

function normalizarCpf(valor) {
  const digits = String(valor || "").replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

// Correção de segurança 15/09/2026 (auditoria, Pacote A.1): antes, essa
// consulta não filtrava por tenant nenhum — qualquer Coordenador conseguia
// ler banco/PIX de um CPF cadastrado por outro cliente/tenant, bastando
// digitar o mesmo CPF numa turma da própria empresa. Agora só devolve um
// registro se ele foi cadastrado pelo mesmo tenant (empresa_id = ?) ou se
// ainda não tem dono (empresa_id IS NULL — registros antigos, de antes
// desta correção). empresaId null = Assistente de Treinamento, que
// continua vendo tudo (cross-tenant é intencional pra esse perfil).
async function buscarDadosBancarios(cpfs, empresaId) {
  const cpfsValidos = [...new Set(cpfs.filter(Boolean))];
  if (!cpfsValidos.length) return new Map();
  const placeholders = cpfsValidos.map(() => "?").join(",");
  const tenantCheck = empresaId ? " AND (empresa_id = ? OR empresa_id IS NULL)" : "";
  const params = empresaId ? [...cpfsValidos, empresaId] : cpfsValidos;
  const [rows] = await pool.query(
    `SELECT cpf, banco, agencia, operacao, conta, dv, tipo_chave_pix, chave_pix
     FROM dados_bancarios_colaborador WHERE cpf IN (${placeholders})${tenantCheck}`,
    params
  );
  return new Map(rows.map((r) => [r.cpf, r]));
}

async function montarListaNominal(treinamentoId, empresaId, { inicio, fim } = {}) {
  const [participantes] = await pool.query(
    `SELECT nome, cpf, matricula FROM treinamento_participantes WHERE treinamento_id = ? ORDER BY nome ASC`,
    [treinamentoId]
  );

  const frequencias = await getFrequenciaPorParticipante({
    treinamentoId: Number(treinamentoId),
    empresaId,
    inicio: inicio || undefined,
    fim: fim || undefined,
  });
  const freqPorNome = new Map(frequencias.map((f) => [f.treinando_nome, f]));

  const cpfsNormalizados = participantes.map((p) => normalizarCpf(p.cpf));
  const bancarios = await buscarDadosBancarios(cpfsNormalizados, empresaId);

  return participantes.map((p, index) => {
    const freq = freqPorNome.get(p.nome);
    const cpfNormalizado = cpfsNormalizados[index];
    const dadosBancarios = cpfNormalizado ? bancarios.get(cpfNormalizado) : null;
    return {
      nome: p.nome,
      cpf: p.cpf || null,
      matricula: p.matricula || null,
      // Decisão 16: "dias em treinamento" = dias com presença confirmada
      // na chamada — getFrequenciaPorParticipante já resolve cronograma
      // > legado pela mesma prioridade usada no resto do sistema (ver
      // presencaResolver.js), então turma migrada retroativamente sem
      // dado de presença por dia continua puxando do legado corretamente.
      // Com inicio/fim informados, conta só a presença dentro do recorte
      // pedido (período da requisição), não a turma inteira.
      dias_em_treinamento: freq ? freq.presentes : 0,
      banco: dadosBancarios?.banco || "",
      agencia: dadosBancarios?.agencia || "",
      operacao: dadosBancarios?.operacao || "",
      conta: dadosBancarios?.conta || "",
      dv: dadosBancarios?.dv || "",
      tipo_chave_pix: dadosBancarios?.tipo_chave_pix || "",
      chave_pix: dadosBancarios?.chave_pix || "",
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
// Aceita ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD pra recortar o período da
// requisição (opcional — sem eles, conta a turma inteira).
async function obterListaNominal(req, res) {
  try {
    const { treinamento_id } = req.params;
    const { inicio, fim } = req.query;
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

    const itens = await montarListaNominal(treinamento_id, empresaId, { inicio, fim });

    // Decisão 19 — toda VISUALIZAÇÃO gera auditoria.
    registrarAuditoria({
      usuario: req.user,
      acao: "visualizar",
      entidade: "presenca_nominal",
      entidadeId: treinamento_id,
      resumo: `${req.user?.nome || "Alguém"} visualizou a lista nominal (CPF) da turma "${turma.tema}" (${turma.cliente})${crossTenant ? " — acesso cross-tenant (Assistente de Treinamento)" : ""}`,
      ip: req.ip,
    });

    return res.json({
      ok: true,
      turma,
      itens,
      valor_passagem_padrao: turma.valor_passagem_vt != null ? Number(turma.valor_passagem_vt) : VALOR_PASSAGEM_PADRAO,
    });
  } catch (error) {
    console.error("[reembolsoTransporteController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao montar a lista nominal" });
  }
}

// PUT /api/reembolso-transporte/:treinamento_id/dados-bancarios — cadastra/
// atualiza banco/agência/conta ou chave PIX de um ou mais participantes da
// turma, guardado por CPF (reaproveitado em qualquer outra turma da mesma
// pessoa). Body: { itens: [{ cpf, banco, agencia, operacao, conta, dv,
// tipo_chave_pix, chave_pix }, ...] }. treinamento_id só serve pra checar
// que quem está chamando tem acesso a essa turma (e pra auditoria) — a
// tabela em si não é por turma.
async function salvarDadosBancarios(req, res) {
  try {
    const { treinamento_id } = req.params;
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
    const { empresaId, crossTenant } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });

    const turma = await buscarTurmaElegivel(req, treinamento_id);
    if (!turma) {
      return res.status(404).json({ ok: false, message: "Turma não encontrada" });
    }

    // Correção de segurança 15/09/2026 (auditoria, Pacote A.1): antes, este
    // UPSERT gravava direto pelo CPF sem checar dono nenhum — um
    // Coordenador conseguia sobrescrever silenciosamente banco/PIX de um
    // CPF já cadastrado por outro tenant, bastando incluir esse CPF numa
    // turma da própria empresa. Agora, antes de cada gravação, checa quem
    // é o dono atual do registro (se existir) e bloqueia quando o dono é
    // um tenant diferente do efetivo (empresaId; null pra Assistente de
    // Treinamento, que pode gravar em qualquer tenant de propósito).
    // Registro sem dono (empresa_id NULL, de antes desta correção) é
    // "adotado" pelo tenant que gravar primeiro depois da correção.
    //
    // Ressalva conhecida (aceita como troca razoável, sem exigir um
    // sistema de verificação de identidade completo pra um patch de
    // segurança urgente): quem cadastrar um CPF alheio ANTES do dono
    // legítimo "reserva" esse CPF pro próprio tenant — a gravação legítima
    // seguinte fica bloqueada (visível, auditada) em vez de silenciosamente
    // sobrescrita, que já elimina o risco de vazamento/hijack de PIX.
    let salvos = 0;
    const bloqueados = [];
    for (const item of itens) {
      const cpf = normalizarCpf(item.cpf);
      if (!cpf) continue;

      if (empresaId) {
        const [existentes] = await pool.query(
          `SELECT empresa_id FROM dados_bancarios_colaborador WHERE cpf = ? LIMIT 1`,
          [cpf]
        );
        const donoAtual = existentes[0]?.empresa_id;
        if (donoAtual != null && Number(donoAtual) !== Number(empresaId)) {
          bloqueados.push(cpf);
          continue;
        }
      }

      await pool.query(
        `
        INSERT INTO dados_bancarios_colaborador
          (cpf, nome, banco, agencia, operacao, conta, dv, tipo_chave_pix, chave_pix, atualizado_por, empresa_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          nome = COALESCE(VALUES(nome), nome),
          banco = VALUES(banco), agencia = VALUES(agencia), operacao = VALUES(operacao),
          conta = VALUES(conta), dv = VALUES(dv), tipo_chave_pix = VALUES(tipo_chave_pix),
          chave_pix = VALUES(chave_pix), atualizado_por = VALUES(atualizado_por),
          empresa_id = COALESCE(dados_bancarios_colaborador.empresa_id, VALUES(empresa_id))
        `,
        [
          cpf,
          item.nome || null,
          item.banco || null,
          item.agencia || null,
          item.operacao || null,
          item.conta || null,
          item.dv || null,
          item.tipo_chave_pix || null,
          item.chave_pix || null,
          req.user?.nome || null,
          empresaId || null,
        ]
      );
      salvos += 1;
    }

    registrarAuditoria({
      usuario: req.user,
      acao: "editar",
      entidade: "dados_bancarios_colaborador",
      entidadeId: treinamento_id,
      resumo: `${req.user?.nome || "Alguém"} atualizou dados bancários/PIX de ${salvos} participante(s) a partir da turma "${turma.tema}" (${turma.cliente})${crossTenant ? " — acesso cross-tenant (Assistente de Treinamento)" : ""}`,
      ip: req.ip,
    });

    if (bloqueados.length) {
      registrarAuditoria({
        usuario: req.user,
        acao: "bloqueado",
        entidade: "dados_bancarios_colaborador",
        entidadeId: treinamento_id,
        resumo: `${req.user?.nome || "Alguém"} tentou gravar dados bancários/PIX de CPF(s) já cadastrado(s) por outro cliente/tenant, a partir da turma "${turma.tema}" (${turma.cliente}) — gravação bloqueada`,
        ip: req.ip,
      });
    }

    return res.json({ ok: true, salvos, bloqueados: bloqueados.length });
  } catch (error) {
    console.error("[reembolsoTransporteController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao salvar os dados bancários" });
  }
}

function formatarDataBR(value) {
  if (!value) return "";
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const [ano, mes, dia] = iso.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : "";
}

function paraDate(value) {
  if (!value) return null;
  const iso = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia);
}

// GET /api/reembolso-transporte/:treinamento_id/exportar — export Excel no
// modelo real de solicitação de VT (ver cabeçalho do arquivo). Aceita, via
// query string, os campos que variam a cada solicitação:
//   inicio, fim            — período da requisição (recorta a presença
//                             contada; sem eles, usa a turma inteira)
//   valor_passagem          — valor da passagem de ida (total do dia = 2x
//                             esse valor); se informado, fica salvo em
//                             treinamentos.valor_passagem_vt como padrão
//                             das próximas exportações dessa turma
//   motivo                  — texto livre pro "Motivo do treinamento:"
//                             (padrão: tema da turma em caixa alta)
//   responsavel              — "Responsável pelo preenchimento:" (padrão:
//                             nome de quem está exportando)
async function exportarListaNominal(req, res) {
  try {
    const { treinamento_id } = req.params;
    const { inicio, fim, valor_passagem, motivo, responsavel } = req.query;
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

    const itens = await montarListaNominal(treinamento_id, empresaId, { inicio, fim });

    let valorPassagem = valor_passagem != null && valor_passagem !== "" ? Number(valor_passagem) : null;
    if (!Number.isFinite(valorPassagem) || valorPassagem <= 0) {
      valorPassagem = turma.valor_passagem_vt != null ? Number(turma.valor_passagem_vt) : VALOR_PASSAGEM_PADRAO;
    } else if (valorPassagem !== Number(turma.valor_passagem_vt)) {
      // Valor novo informado nesta exportação — fica de padrão pras próximas.
      await pool.query(`UPDATE treinamentos SET valor_passagem_vt = ? WHERE id = ?`, [valorPassagem, treinamento_id]);
    }
    const totalPorDia = Math.round(valorPassagem * 2 * 100) / 100;

    const motivoFinal = (motivo && String(motivo).trim()) || `${turma.tema}${turma.cliente ? ` — ${turma.cliente}` : ""}`.toUpperCase();
    const responsavelFinal = (responsavel && String(responsavel).trim()) || req.user?.nome || "";
    const periodoLabel =
      inicio && fim
        ? `${formatarDataBR(inicio)} à ${formatarDataBR(fim)}`
        : `${formatarDataBR(turma.data_inicio || turma.data)} à ${formatarDataBR(turma.data_fim || turma.data)}`;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Presença Nominal");

    ws.columns = [
      { width: 34 }, { width: 15 }, { width: 20 }, { width: 12 }, { width: 8 },
      { width: 15 }, { width: 6 }, { width: 7 }, { width: 11 }, { width: 11 },
      { width: 13 }, { width: 18 },
    ];

    const bold = { bold: true };
    const dinheiro = '"R$" #,##0.00';

    ws.mergeCells("A4:B4");
    ws.getCell("A4").value = "Vale Transporte - Treinamento";
    ws.getCell("A4").font = { bold: true, size: 13 };

    ws.getCell("A5").value = "TEL:  16.18.1618099";
    ws.getCell("A6").value = `Responsável pelo preenchimento: ${responsavelFinal}`;
    ws.getCell("A7").value = "Departamento: Treinamento";

    ws.getCell("D4").value = "Data de início do treinamento:";
    ws.getCell("D4").font = bold;
    const dataInicioTurma = paraDate(turma.data_inicio || turma.data);
    if (dataInicioTurma) { ws.getCell("G4").value = dataInicioTurma; ws.getCell("G4").numFmt = "dd/mm/yyyy"; }

    ws.getCell("D5").value = "Data de conclusão do treinamento:";
    ws.getCell("D5").font = bold;
    const dataFimTurma = paraDate(turma.data_fim || turma.data);
    if (dataFimTurma) { ws.getCell("G5").value = dataFimTurma; ws.getCell("G5").numFmt = "dd/mm/yyyy"; }

    ws.mergeCells("G6:I6");
    ws.getCell("D6").value = "Período da requisição:";
    ws.getCell("D6").font = bold;
    ws.getCell("G6").value = periodoLabel;

    ws.getCell("D7").value = "Data da Solicitação";
    ws.getCell("D7").font = bold;
    ws.getCell("G7").value = new Date();
    ws.getCell("G7").numFmt = "dd/mm/yyyy";

    ws.mergeCells("G8:I8");
    ws.getCell("D8").value = "Motivo do treinamento:";
    ws.getCell("D8").font = bold;
    ws.getCell("G8").value = motivoFinal;

    ws.getCell("D9").value = "Número de Registros:";
    ws.getCell("D9").font = bold;
    ws.getCell("G9").value = itens.length;

    const primeiraLinha = 15;
    const ultimaLinha = primeiraLinha + itens.length - 1;

    ws.mergeCells("G10:I10");
    ws.getCell("D10").value = "Total:";
    ws.getCell("D10").font = bold;
    if (itens.length) {
      ws.getCell("G10").value = { formula: `SUM(J${primeiraLinha}:J${ultimaLinha})` };
      ws.getCell("G10").numFmt = dinheiro;
    } else {
      ws.getCell("G10").value = 0;
      ws.getCell("G10").numFmt = dinheiro;
    }

    const headerRow = 14;
    const headers = ["Nome", "CPF", "Banco", "Agência", "OP", "Conta", "DV", "Dias", "Passagem", "Total", "Tipo de Chave", "Chave PIX"];
    headers.forEach((texto, i) => {
      const cell = ws.getCell(headerRow, i + 1);
      cell.value = texto;
      cell.font = bold;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    });

    itens.forEach((item, index) => {
      const row = primeiraLinha + index;
      ws.getCell(row, 1).value = item.nome;
      ws.getCell(row, 2).value = item.cpf ? String(item.cpf) : "";
      ws.getCell(row, 2).numFmt = "@";
      ws.getCell(row, 3).value = item.banco;
      ws.getCell(row, 4).value = item.agencia;
      ws.getCell(row, 5).value = item.operacao;
      ws.getCell(row, 6).value = item.conta;
      ws.getCell(row, 7).value = item.dv;
      ws.getCell(row, 8).value = item.dias_em_treinamento;
      ws.getCell(row, 9).value = valorPassagem;
      ws.getCell(row, 9).numFmt = dinheiro;
      ws.getCell(row, 10).value = { formula: `${totalPorDia}*H${row}` };
      ws.getCell(row, 10).numFmt = dinheiro;
      ws.getCell(row, 11).value = item.tipo_chave_pix;
      ws.getCell(row, 12).value = item.chave_pix ? String(item.chave_pix) : "";
    });

    if (itens.length) {
      const linhaTotal = ultimaLinha + 1;
      ws.getCell(linhaTotal, 9).value = "TOTAL:";
      ws.getCell(linhaTotal, 9).font = bold;
      ws.getCell(linhaTotal, 9).alignment = { horizontal: "right" };
      ws.getCell(linhaTotal, 10).value = { formula: `SUM(J${primeiraLinha}:J${ultimaLinha})` };
      ws.getCell(linhaTotal, 10).numFmt = dinheiro;
      ws.getCell(linhaTotal, 10).font = bold;
    }

    // Decisão 19 — todo EXPORT gera auditoria.
    registrarAuditoria({
      usuario: req.user,
      acao: "exportar",
      entidade: "presenca_nominal",
      entidadeId: treinamento_id,
      resumo: `${req.user?.nome || "Alguém"} exportou a solicitação de VT da turma "${turma.tema}" (${turma.cliente})${crossTenant ? " — acesso cross-tenant (Assistente de Treinamento)" : ""}`,
      ip: req.ip,
    });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="solicitacao-vt-turma-${treinamento_id}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (error) {
    console.error("[reembolsoTransporteController]", error.message || error);
    return res.status(500).json({ ok: false, message: "Erro ao exportar a solicitação de VT" });
  }
}

module.exports = {
  listarTurmasElegiveis,
  obterListaNominal,
  exportarListaNominal,
  salvarDadosBancarios,
};
