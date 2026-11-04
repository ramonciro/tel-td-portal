/**
 * mptController.js — Comprovação MPT por subdivisão (04/11/2026).
 *
 *  GET    /api/mpt/resumo?ano=            agregado por subdivisão e operação (sem nomes). Metodologia,
 *                                         coordenação, supervisão e superintendência (esta vê todos os ambientes).
 *  GET    /api/mpt/pessoas?subtipo=&ano=  pessoas, horas e evidência linha a linha. SÓ Metodologia.
 *  GET    /api/mpt/dossie?subtipo=&ano=|de=&ate=  dossiê em Excel (resumo, pessoas, evidências, critérios). SÓ Metodologia.
 *  GET    /api/mpt/metas                  metas internas do ambiente.
 *  PUT    /api/mpt/metas                  { subtipo, horas_meta } grava/atualiza. SÓ Metodologia.
 *  DELETE /api/mpt/metas?subtipo=         remove a meta (a subdivisão volta a "meta não definida"). SÓ Metodologia.
 *
 * Meta interna de gestão: nunca citada como exigência legal (decisão de 20/09/2026). CPF nunca sai.
 */
const { tenantScopeFor } = require("../lib/tenantScope");
const { normalizeSubtipo } = require("../lib/subtipos");
const { registrarAuditoria } = require("../services/auditoria");
const svc = require("../services/mptComprovacaoService");

function falha(res, contexto, e) {
  console.error(`[mpt] ${contexto}:`, e.message || e);
  return res.status(500).json({ ok: false, message: `Erro ao ${contexto}.` });
}

function anoDe(req) {
  const a = Number(req.query?.ano);
  return Number.isInteger(a) ? a : undefined;
}

// Período do pedido: ?ano= (ano-calendário) ou ?de=AAAA-MM-DD&ate=AAAA-MM-DD (intervalo; tem precedência).
function periodoDe(req) {
  return { ano: anoDe(req), de: String(req.query?.de || "").trim() || undefined, ate: String(req.query?.ate || "").trim() || undefined };
}

// Erro de período vira 400 com a mensagem pronta; qualquer outro vai para o 500 padrão.
function responderErro(res, contexto, e) {
  if (e && e.codigo === "PERIODO_INVALIDO") return res.status(400).json({ ok: false, message: e.message });
  return falha(res, contexto, e);
}

async function resumo(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: ["superintendente"] });
    const r = await svc.calcularComprovacao({ empresaId, ...periodoDe(req) });
    return res.json({ ok: true, ano: r.ano, periodo: r.periodo, subdivisoes: r.subdivisoes, avisos: r.avisos, metas: r.metas });
  } catch (e) {
    return responderErro(res, "carregar a Comprovação MPT", e);
  }
}

async function pessoas(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req);
    const subtipo = String(req.query?.subtipo || "").trim();
    const r = await svc.calcularComprovacao({ empresaId, ...periodoDe(req) });
    let linhas = r.linhas;
    if (subtipo) linhas = linhas.filter((l) => l.subtipo === subtipo);
    const chave = String(req.query?.chave || "").trim();
    if (chave) linhas = linhas.filter((l) => l.chave === chave);
    const situacao = String(req.query?.situacao || "").trim();
    if (["atingiu", "abaixo", "sem_hora", "sem_meta"].includes(situacao)) linhas = linhas.filter((l) => l.situacao === situacao);
    const cliente = String(req.query?.cliente || "").trim();
    if (cliente) linhas = linhas.filter((l) => l.cliente === cliente);
    const ordem = { sem_hora: 0, abaixo: 1, sem_meta: 2, atingiu: 3 };
    linhas = [...linhas].sort((a, b) => (ordem[a.situacao] - ordem[b.situacao]) || a.nome.localeCompare(b.nome, "pt-BR"));
    return res.json({
      ok: true,
      ano: r.ano,
      periodo: r.periodo,
      total: linhas.length,
      pessoas: linhas.map((l) => ({
        chave: l.chave,
        nome: l.nome,
        matricula: l.matricula,
        cliente: l.cliente,
        vinculada: l.vinculada,
        subtipo: l.subtipo,
        horas: l.horas,
        meta: l.meta,
        meta_anual: l.meta_anual,
        situacao: l.situacao,
        evidencias: l.evidencias,
      })),
    });
  } catch (e) {
    return responderErro(res, "listar as pessoas da Comprovação MPT", e);
  }
}

async function listarMetas(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: ["superintendente"] });
    return res.json({ ok: true, metas: await svc.listarMetas(empresaId) });
  } catch (e) {
    return falha(res, "carregar as metas", e);
  }
}

async function salvarMeta(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req);
    if (!empresaId) return res.status(400).json({ ok: false, message: "Escolha o ambiente antes de definir a meta." });
    const subtipo = await normalizeSubtipo(req.body?.subtipo);
    if (!subtipo) return res.status(400).json({ ok: false, message: "Escolha uma subdivisão do catálogo." });
    const horas = Number(String(req.body?.horas_meta ?? "").replace(",", "."));
    if (!Number.isFinite(horas) || horas <= 0 || horas > 1000) {
      return res.status(400).json({ ok: false, message: "Informe a meta em horas por pessoa (maior que 0 e até 1000)." });
    }
    await svc.salvarMeta({ empresaId, subtipo, horas: Math.round(horas * 100) / 100, usuarioId: req.user?.id });
    registrarAuditoria({
      usuario: req.user, acao: "editar", entidade: "mpt_meta", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} definiu a meta interna de ${horas}h por pessoa para "${subtipo}" (Comprovação MPT)`,
      ip: req.ip,
    });
    return res.json({ ok: true, message: "Meta salva." });
  } catch (e) {
    return falha(res, "salvar a meta", e);
  }
}

async function removerMeta(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req);
    if (!empresaId) return res.status(400).json({ ok: false, message: "Escolha o ambiente." });
    const subtipo = String(req.query?.subtipo || req.body?.subtipo || "").trim();
    if (!subtipo) return res.status(400).json({ ok: false, message: "Informe a subdivisão." });
    const n = await svc.removerMeta({ empresaId, subtipo });
    if (!n) return res.status(404).json({ ok: false, message: "Meta não encontrada." });
    registrarAuditoria({
      usuario: req.user, acao: "excluir", entidade: "mpt_meta", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} removeu a meta interna de "${subtipo}" (Comprovação MPT)`,
      ip: req.ip,
    });
    return res.json({ ok: true, message: "Meta removida." });
  } catch (e) {
    return falha(res, "remover a meta", e);
  }
}

// ───────────────────────── dossiê em Excel (só Metodologia) ─────────────────────────

const TXT_SITUACAO = { atingiu: "Atingiu a meta", abaixo: "Abaixo da meta", sem_hora: "Sem nenhuma hora", sem_meta: "Meta não definida" };
const TXT_FAROL = { verde: "Em dia (90% ou mais)", amarelo: "Atenção (80 a 89%)", vermelho: "Abaixo (menos de 80%)", cinza: "Meta não definida" };

function slug(v) {
  return String(v || "todas").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "todas";
}

async function dossie(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req);
    const subtipo = String(req.query?.subtipo || "").trim();
    const r = await svc.calcularComprovacao({ empresaId, ...periodoDe(req) });
    const subs = subtipo ? r.subdivisoes.filter((s) => s.subtipo === subtipo) : r.subdivisoes;
    const linhas = (subtipo ? r.linhas.filter((l) => l.subtipo === subtipo) : r.linhas).slice().sort(
      (a, b) => a.subtipo.localeCompare(b.subtipo, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR")
    );
    const { novoWorkbook, escreverTabela, adicionarTabela } = require("../lib/excelExport");
    const wb = novoWorkbook();
    const parcial = !r.periodo.completo;
    const dataBR = (iso) => String(iso).split("-").reverse().join("/");

    // Aba 1 — resumo (cabeçalho do período + cobertura + por operação)
    const ws = wb.addWorksheet("Resumo");
    ws.columns = [{ width: 34 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }];
    ws.getCell(1, 1).value = "Comprovação de horas de desenvolvimento por subdivisão";
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.getCell(2, 1).value = `Período: ${dataBR(r.periodo.de)} a ${dataBR(r.periodo.ate)}${parcial ? " (período parcial: a meta anual não é comparada)" : ""}`;
    ws.getCell(3, 1).value = `Subdivisão: ${subtipo || "todas"}`;
    ws.getCell(4, 1).value = `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" })} por ${req.user?.nome || "—"}`;
    let linha = 6;
    linha = escreverTabela(ws, {
      startRow: linha,
      titulo: "Cobertura por subdivisão",
      colunas: [
        { titulo: "Subdivisão", chave: "subtipo" },
        { titulo: "Meta anual (h por pessoa)", chave: "meta_horas", formato: "decimal1" },
        { titulo: "Pessoas", chave: "pessoas", formato: "inteiro" },
        { titulo: "Atingiram", chave: "atingiram", formato: "inteiro" },
        { titulo: "Abaixo", chave: "abaixo", formato: "inteiro" },
        { titulo: "Sem nenhuma hora", chave: "sem_hora", formato: "inteiro" },
        { titulo: "% que atingiu", chave: "pct", formato: "percentual" },
        { titulo: "Farol", chave: "farol_txt" },
        { titulo: "Horas em jornadas", chave: "horas_jornada", formato: "decimal1" },
        { titulo: "Horas em turmas", chave: "horas_turma", formato: "decimal1" },
      ],
      linhas: subs.map((s) => ({ ...s, farol_txt: parcial ? "Período parcial" : TXT_FAROL[s.farol], pct: parcial ? null : s.pct })),
    });
    linha += 1;
    const porOperacao = [];
    for (const s of subs) for (const c of s.por_cliente) porOperacao.push({ subtipo: s.subtipo, cliente: c.cliente, ...c, pct: parcial ? null : c.pct });
    escreverTabela(ws, {
      startRow: linha,
      titulo: "Por operação",
      colunas: [
        { titulo: "Subdivisão", chave: "subtipo" },
        { titulo: "Operação", chave: "cliente" },
        { titulo: "Pessoas", chave: "pessoas", formato: "inteiro" },
        { titulo: "Atingiram", chave: "atingiram", formato: "inteiro" },
        { titulo: "Abaixo", chave: "abaixo", formato: "inteiro" },
        { titulo: "Sem nenhuma hora", chave: "sem_hora", formato: "inteiro" },
        { titulo: "% que atingiu", chave: "pct", formato: "percentual" },
      ],
      linhas: porOperacao,
    });

    // Aba 2 — pessoas
    adicionarTabela(wb, {
      nomeAba: "Pessoas",
      colunas: [
        { titulo: "Subdivisão", chave: "subtipo", largura: 32 },
        { titulo: "Pessoa", chave: "nome", largura: 34 },
        { titulo: "Matrícula", chave: "matricula", largura: 14 },
        { titulo: "Operação", chave: "cliente", largura: 22 },
        { titulo: "Horas no período", chave: "horas", largura: 16, formato: "decimal1" },
        { titulo: "Meta anual (h)", chave: "meta_anual", largura: 14, formato: "decimal1" },
        { titulo: "Situação", chave: "situacao_txt", largura: 30 },
        { titulo: "Cadastro único", chave: "cadastro_txt", largura: 28 },
      ],
      linhas: linhas.map((l) => ({
        ...l,
        situacao_txt: parcial ? "Período parcial (meta anual não comparada)" : TXT_SITUACAO[l.situacao],
        cadastro_txt: l.vinculada ? "Ligada ao cadastro" : "Só pelo nome (sem matrícula/CPF ligados)",
      })),
    });

    // Aba 3 — evidências linha a linha
    const evid = [];
    for (const l of linhas) {
      for (const ev of l.evidencias) {
        evid.push({
          subtipo: l.subtipo, nome: l.nome, matricula: l.matricula, cliente: l.cliente,
          data: ev.data, fonte: ev.fonte === "turma" ? "Turma" : "Jornada", contexto: ev.contexto, titulo: ev.titulo,
          horas: ev.horas, conta: ev.contada ? "Sim" : "Não", motivo: ev.motivo_nao_contada || "", estimada: ev.estimada ? "Sim" : "",
        });
      }
    }
    adicionarTabela(wb, {
      nomeAba: "Evidências",
      colunas: [
        { titulo: "Subdivisão", chave: "subtipo", largura: 32 },
        { titulo: "Pessoa", chave: "nome", largura: 34 },
        { titulo: "Matrícula", chave: "matricula", largura: 14 },
        { titulo: "Operação", chave: "cliente", largura: 22 },
        { titulo: "Data", chave: "data", largura: 12, formato: "data" },
        { titulo: "Fonte", chave: "fonte", largura: 10 },
        { titulo: "Jornada / turma", chave: "contexto", largura: 34 },
        { titulo: "Encontro / aula", chave: "titulo", largura: 34 },
        { titulo: "Horas", chave: "horas", largura: 9, formato: "decimal1" },
        { titulo: "Conta?", chave: "conta", largura: 9 },
        { titulo: "Motivo de não contar", chave: "motivo", largura: 50 },
        { titulo: "Carga estimada", chave: "estimada", largura: 14 },
      ],
      linhas: evid,
    });

    // Aba 4 — critérios e pontos de atenção (para quem lê o dossiê sem conhecer a conta)
    const wc = wb.addWorksheet("Critérios");
    wc.columns = [{ width: 120 }];
    const criterios = [
      "Como a conta é feita",
      "• Fontes: encontros de jornada e aulas de turma que têm subdivisão (subtipo). A mesma hora nunca conta duas vezes.",
      "• Só conta presença registrada como presente. Justificado e ausente não somam hora.",
      "• Mesma pessoa, mesma subdivisão e mesmo dia: conta uma vez só, a de maior carga. As demais aparecem na aba Evidências como \"Conta? Não\", com o motivo.",
      "• Hora de aula de turma: carga real; se não houver, a planejada; se não houver, a carga da turma dividida pelas aulas (marcada como estimada).",
      "• Universo: quem está inscrito nas jornadas ou turmas da subdivisão, mesmo com zero hora.",
      "• A meta é interna de gestão, definida pela Metodologia, em horas por pessoa no ano-calendário. Não é exigência legal.",
      parcial ? "• Este dossiê cobre um período parcial: as horas são do período e a meta anual NÃO foi comparada." : "• Este dossiê cobre o ano-calendário inteiro: as horas foram comparadas com a meta anual.",
      "• O CPF não consta neste documento.",
      "",
      "Pontos de atenção nos dados (período do dossiê)",
      `• Encontros de jornada sem subdivisão (ficam fora da conta): ${r.avisos.encontros_sem_subdivisao}`,
      `• Turmas com subdivisão e sem cronograma de aulas (ficam fora da conta): ${r.avisos.turmas_sem_cronograma}`,
      `• Presenças de turma com nome que não está na lista de treinandos (não contadas): ${r.avisos.presencas_sem_vinculo}`,
      `• Aulas com carga horária estimada: ${r.avisos.cargas_estimadas}`,
      `• Pessoas ligadas só pelo nome (sem matrícula/CPF no cadastro único): ${r.avisos.pessoas_sem_cadastro}`,
    ];
    criterios.forEach((t, i) => {
      const c = wc.getCell(i + 1, 1);
      c.value = t;
      c.alignment = { wrapText: true, vertical: "top" };
      if (t === "Como a conta é feita" || t.startsWith("Pontos de atenção")) c.font = { bold: true, size: 12 };
    });

    registrarAuditoria({
      usuario: req.user, acao: "exportar", entidade: "mpt_dossie", entidadeId: null,
      resumo: `${req.user?.nome || "Alguém"} exportou o dossiê da Comprovação MPT (${subtipo || "todas as subdivisões"}, ${r.periodo.de} a ${r.periodo.ate}) com nomes`,
      ip: req.ip,
    });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Disposition", `attachment; filename="dossie-mpt-${slug(subtipo)}-${r.periodo.de}_${r.periodo.ate}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(Buffer.from(buffer));
  } catch (e) {
    return responderErro(res, "gerar o dossiê da Comprovação MPT", e);
  }
}

module.exports = { resumo, pessoas, dossie, listarMetas, salvarMeta, removerMeta };
