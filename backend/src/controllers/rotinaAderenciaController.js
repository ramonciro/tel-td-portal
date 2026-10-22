/**
 * Painel de aderência da Rotina do instrutor (Fase 3, 16/10/2026).
 * Leitura apenas. Coordenação, assistente, supervisor e superintendente veem
 * todas as turmas (respeitando o cliente do usuário); o instrutor vê só as próprias.
 */
const { tenantScopeFor } = require("../lib/tenantScope");
const { usuarioTemAcessoAoCliente } = require("../lib/acessoCliente");
const A = require("../lib/rotinaAderencia");

const chave = (s) => String(s || "").trim().toLowerCase();
// Principal + adicionais (TBT) de uma turma — aceita a linha crua (_adicionais) ou a calculada.
const nomesDaTurma = (t) => [t.instrutor, ...(t._adicionais || t.instrutores_adicionais || [])].map((n) => String(n || "").trim()).filter(Boolean);
const perfilDe = (req) => chave(req.user?.perfil);
const erro = (res, status, msg) => res.status(status).json({ ok: false, message: msg, error: msg });
const escopo = (req) => tenantScopeFor(req, { crossTenantRoles: ["assistente_treinamento"] }).empresaId;

function recorte(req) {
  const instrutorLogin = perfilDe(req) === "instrutor" ? req.user?.nome : null;
  return {
    empresaId: escopo(req),
    instrutorLogin,
    podeVer: (t) => {
      if (instrutorLogin) return nomesDaTurma(t).some((n) => chave(n) === chave(instrutorLogin));
      return usuarioTemAcessoAoCliente(req, t.cliente);
    },
  };
}

const ROTULO_FAROL = { verde: "Em dia", amarelo: "Atenção", vermelho: "Atrasada", cinza: "Ainda não começou" };

async function montar(req) {
  const { empresaId, instrutorLogin, podeVer } = recorte(req);
  const { mes, de, ate } = A.mesParaIntervalo(req.query.mes);
  const cliente = String(req.query.cliente || "").trim() || undefined;
  const instrutor = instrutorLogin || String(req.query.instrutor || "").trim() || undefined;
  const turmas = await A.calcularTurmas({ empresaId, de, ate, cliente, instrutor, podeVer });
  let instrutores = A.resumirInstrutores(turmas);
  // Com um instrutor selecionado, o resumo mostra só ele (os co-instrutores da TBT não entram).
  if (instrutor) instrutores = instrutores.filter((i) => chave(i.instrutor) === chave(instrutor));
  const atividades = await A.atividadesPorOperacao({
    empresaId, de, ate, cliente, instrutor,
    clientesComTurma: [...new Set(turmas.map((t) => t.cliente).filter(Boolean))],
  });
  const filtrarOp = (o) => (cliente ? o.cliente === cliente : true);
  const pend = turmas.flatMap((t) => t.pendencias.map((p) => ({ ...p, turma_id: t.id, tema: t.tema, cliente: t.cliente, instrutor: t.instrutor })));
  const turmasLimpas = turmas.map(({ _num, _den, ...resto }) => resto);
  return {
    mes, de, ate, turmas: turmasLimpas, instrutores, atividades: atividades.filter(filtrarOp),
    resumo: {
      turmas: turmas.length,
      verdes: turmas.filter((t) => t.farol === "verde").length,
      amarelas: turmas.filter((t) => t.farol === "amarelo").length,
      vermelhas: turmas.filter((t) => t.farol === "vermelho").length,
      pendencias: pend.length,
    },
    filtros: {
      clientes: [...new Set(turmas.map((t) => t.cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
      instrutores: [...new Set(turmas.flatMap((t) => nomesDaTurma(t)))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    },
    so_proprias: !!instrutorLogin,
  };
}

async function painel(req, res) {
  try {
    return res.json({ ok: true, ...(await montar(req)) });
  } catch (e) {
    console.error("[rotinaAderencia.painel]", e.message || e);
    return erro(res, 500, "Erro ao carregar o painel de aderência.");
  }
}

async function pendencias(req, res) {
  try {
    const { empresaId, instrutorLogin, podeVer } = recorte(req);
    const r = await A.getPendenciasRotina({ empresaId, podeVer, instrutor: instrutorLogin || undefined });
    const limite = Math.min(Math.max(Number(req.query.limite) || 8, 1), 100);
    return res.json({ ok: true, total: r.total, vermelhas: r.vermelhas, amarelas: r.amarelas, itens: r.itens.slice(0, limite) });
  } catch (e) {
    console.error("[rotinaAderencia.pendencias]", e.message || e);
    return erro(res, 500, "Erro ao carregar as pendências da rotina.");
  }
}

async function exportar(req, res) {
  try {
    const d = await montar(req);
    const XL = require("../lib/excelExport");
    const wb = XL.novoWorkbook();
    XL.adicionarTabela(wb, {
      nomeAba: "Turmas",
      colunas: [
        { titulo: "Turma", chave: "tema", largura: 34 },
        { titulo: "Operação", chave: "cliente", largura: 18 },
        { titulo: "Instrutor", chave: "instrutor", largura: 22 },
        { titulo: "Modelo", chave: "modelo", largura: 20 },
        { titulo: "Início", chave: "inicio", largura: 12 },
        { titulo: "Fim", chave: "fim", largura: 12 },
        { titulo: "Situação", chave: "farol", largura: 16 },
        { titulo: "Aderência (%)", chave: "aderencia_pct", formato: "decimal1", largura: 14 },
        { titulo: "Checklist respondido", chave: "checklist", largura: 20 },
        { titulo: "Responsabilidades feitas", chave: "tarefas", largura: 24 },
        { titulo: "Atrasadas", chave: "atrasadas", formato: "inteiro", largura: 11 },
        { titulo: "Dias sem diário", chave: "sem_diario", formato: "inteiro", largura: 15 },
        { titulo: "Avaliação individual", chave: "avaliacao", largura: 20 },
        { titulo: "Pendências", chave: "pendencias", largura: 70 },
      ],
      linhas: d.turmas.map((t) => ({
        tema: t.tema, cliente: t.cliente, instrutor: nomesDaTurma(t).join(", "),
        modelo: t.modo === "avaliacao_tecnica" ? "Avaliação Técnica" : "Formação continuada",
        inicio: t.inicio || "", fim: t.fim || "", farol: ROTULO_FAROL[t.farol] || t.farol,
        aderencia_pct: t.aderencia_pct,
        checklist: t.checklist.total ? `${t.checklist.respondidos}/${t.checklist.total}` : "",
        tarefas: t.tarefas.total ? `${t.tarefas.feitas}/${t.tarefas.total}` : "",
        atrasadas: t.tarefas.atrasadas, sem_diario: t.diario ? t.diario.faltando : null,
        avaliacao: t.avaliacao ? (t.avaliacao.registrada ? "Registrada" : t.avaliacao.pendente ? "Pendente" : "Em andamento") : "",
        pendencias: t.pendencias.map((p) => p.texto).join(" | "),
      })),
    });
    XL.adicionarTabela(wb, {
      nomeAba: "Instrutores",
      colunas: [
        { titulo: "Instrutor", chave: "instrutor", largura: 26 },
        { titulo: "Turmas", chave: "turmas", formato: "inteiro", largura: 9 },
        { titulo: "Aderência (%)", chave: "aderencia_pct", formato: "decimal1", largura: 14 },
        { titulo: "Atrasadas", chave: "vermelhas", formato: "inteiro", largura: 11 },
        { titulo: "Atenção", chave: "amarelas", formato: "inteiro", largura: 10 },
        { titulo: "Em dia", chave: "verdes", formato: "inteiro", largura: 9 },
        { titulo: "Pendências", chave: "pendencias", formato: "inteiro", largura: 12 },
      ],
      linhas: d.instrutores,
    });
    XL.adicionarTabela(wb, {
      nomeAba: "Atividades por operação",
      colunas: [
        { titulo: "Operação", chave: "cliente", largura: 24 },
        { titulo: "Atividades no mês", chave: "atividades_qtd", formato: "inteiro", largura: 18 },
        { titulo: "Horas", chave: "horas", formato: "decimal1", largura: 9 },
        { titulo: "Vídeos (ref. 1/mês)", chave: "videos", formato: "inteiro", largura: 19 },
        { titulo: "Cards (ref. semanal)", chave: "cards", formato: "inteiro", largura: 20 },
        { titulo: "Por tipo", chave: "tipos", largura: 70 },
      ],
      linhas: d.atividades.map((o) => ({
        cliente: o.cliente, atividades_qtd: o.atividades_qtd, horas: o.horas,
        videos: (o.ritmo.find((r) => r.tipo === "Vídeo") || {}).qtd || 0,
        cards: (o.ritmo.find((r) => r.tipo.startsWith("Card")) || {}).qtd || 0,
        tipos: o.por_tipo.map((p) => `${p.tipo}: ${p.qtd} (${p.horas}h)`).join(" | "),
      })),
    });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="aderencia-rotina-${d.mes}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  } catch (e) {
    console.error("[rotinaAderencia.exportar]", e.message || e);
    if (!res.headersSent) return erro(res, 500, "Erro ao exportar o painel de aderência.");
  }
}

module.exports = { painel, pendencias, exportar };
