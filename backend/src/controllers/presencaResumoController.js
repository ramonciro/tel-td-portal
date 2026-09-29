const { getResumoPresenca } = require("../services/presencaResolver");
const { tenantScopeFor } = require("../lib/tenantScope");

// Decisão 12 (Pacote Salas/Assistente/CPF/Horas/Farol MPT, 15/09/2026): a
// Assistente de Treinamento enxerga o resumo de presença de qualquer tenant
// nesta tela (Presenças) — decidido aqui, por chamada, nunca no
// clientMiddleware. Importante: getResumoPresenca() também é usada por
// dashboardTreinamentosController.js e desempenhoInstrutorController.js,
// que continuam chamando com req.empresaId diretamente (sem passar por
// tenantScopeFor) — se a exceção tivesse sido posta dentro de
// getResumoPresenca(), ela vazaria pra essas telas de forma implícita. Ver
// claude/auditoria-riscos-cruzados-pacote-salas-2026-09.md.
//
// Pacote Superintendente (24/09/2026): a superintendente também precisa ver
// o resumo de presença de todos os tenants (tela Gestão de Turmas). Como o
// Dashboard TAMBÉM está no escopo cross-tenant dela (diferente da
// Assistente), foi adicionado o mesmo tenantScopeFor com "superintendente"
// diretamente em dashboardTreinamentosController.js (que não importa este
// arquivo — ele chama getResumoPresenca diretamente), então não há
// duplicidade nem vazamento cruzado entre os dois pacotes.
const CROSS_TENANT_ROLES = ["assistente_treinamento", "superintendente"];

// Sprint 1 fix: passa req.empresaId para filtrar por tenant automaticamente.
// Sem req.empresaId (super_admin ou migration pendente) → retorna tudo.
async function listarResumoGeral(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const dados = await getResumoPresenca({ empresaId });
    return res.json({ ok: true, itens: dados });
  } catch (error) {
    console.error("[presencaResumoController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao montar o resumo de presença"});
  }
}

async function obterResumoPorTreinamento(req, res) {
  try {
    const { treinamento_id } = req.params;
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const dados = await getResumoPresenca({
      treinamentoId: Number(treinamento_id),
      empresaId,
    });
    if (!dados.length) {
      return res.status(404).json({ ok: false, message: "Treinamento não encontrado" });
    }
    return res.json({ ok: true, item: dados[0] });
  } catch (error) {
    console.error("[presencaResumoController]", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao montar o resumo de presença"});
  }
}

// Pedido do Ramon (29/09/2026): "O relatório que exporto ... ainda parece
// confuso pra mim, preciso que esteja melhor estruturado". Esta era a última
// exportação do sistema que ainda montava o Excel cru no navegador
// (`frontend/app/presencas/page.js`, `exportarRelatorio()`, `xlsx` puro) —
// as outras 5 já tinham passado por esse tratamento no Pacote 3 (redesign de
// telas, 16/09/2026, ver backend/src/lib/excelExport.js).
//
// Mantém toda a lógica de negócio (filtro de período/status/cliente, cálculo
// de CH realizada etc.) exatamente como está no front — só recebe as linhas
// já prontas e troca a MONTAGEM do arquivo por uma versão com cabeçalho
// agrupado, formato numérico de verdade (data/percentual/inteiro em vez de
// texto solto) e cor por status/faixa de presença, igual ao resto da tela.
async function exportarRelatorioPresenca(req, res) {
  try {
    const { novoWorkbook, estilizarCabecalho, paraDate, FORMATO_DATA } = require("../lib/excelExport");

    const linhas = Array.isArray(req.body?.linhas) ? req.body.linhas : [];
    const kpi = req.body?.kpi || {};
    const periodo = req.body?.periodo || {};

    // Mesmo mapa de cor de `frontend/lib/theme.js` (estiloBadgeStatus), pra
    // a planilha bater visualmente com o que a tela mostra.
    const CORES_STATUS = {
      "Concluída":        { bg: "FFDCFCE7", texto: "FF166534" },
      "Em andamento":     { bg: "FFFFF7ED", texto: "FF9A3412" },
      "Cancelada":        { bg: "FFFEE2E2", texto: "FFB91C1C" },
      "Chamada pendente": { bg: "FFFFF7ED", texto: "FFC2410C" },
      "Sem cronograma":   { bg: "FFFEE2E2", texto: "FFB91C1C" },
      "Sem treinandos":   { bg: "FFFEE2E2", texto: "FFB91C1C" },
      "Planejada":        { bg: "FFDBEAFE", texto: "FF2563EB" },
    };
    const corStatus = (s) => CORES_STATUS[s] || { bg: "FFDBEAFE", texto: "FF2563EB" };
    // Mesmos limiares de `estiloFreq()` em presencas/page.js.
    const corTaxa = (n) => {
      const v = Number(n || 0);
      if (v >= 90) return { bg: "FFDCFCE7", texto: "FF166534" };
      if (v >= 75) return { bg: "FFFFF7ED", texto: "FF9A3412" };
      return { bg: "FFFEE2E2", texto: "FFB91C1C" };
    };

    const wb = novoWorkbook();

    // ── Aba "Resumo" — visão executiva, o que faltava pra não precisar
    // rolar 20 colunas só pra saber "como estamos". ──
    const wsResumo = wb.addWorksheet("Resumo");
    wsResumo.columns = [{ width: 30 }, { width: 20 }];
    wsResumo.getCell(1, 1).value = "Resumo — Gestão de Turmas (Presenças)";
    wsResumo.getCell(1, 1).font = { bold: true, size: 14 };
    const subtitulo = periodo.inicio || periodo.fim
      ? `Período: ${periodo.inicio || "início"} a ${periodo.fim || "hoje"}`
      : "Período: histórico completo";
    wsResumo.getCell(2, 1).value = subtitulo;
    wsResumo.getCell(2, 1).font = { italic: true, color: { argb: "FF64748B" } };

    const kpiLinhas = [
      ["Turmas no filtro atual", Number(kpi.total || 0)],
      ["Treinandos previstos (soma)", Number(kpi.treinandos || 0)],
      ["Turmas com chamada lançada", Number(kpi.turmasComDados || 0)],
      ["Presenças registradas", Number(kpi.participacoes || 0)],
      ["Taxa média de presença", kpi.taxaMedia == null ? "—" : `${kpi.taxaMedia}%`],
      ["Horas realizadas (soma)", `${Number(kpi.horas || 0).toFixed(1)}h`],
    ];
    let linhaKpi = 4;
    kpiLinhas.forEach(([label, valor]) => {
      wsResumo.getCell(linhaKpi, 1).value = label;
      wsResumo.getCell(linhaKpi, 1).font = { bold: true };
      wsResumo.getCell(linhaKpi, 2).value = valor;
      linhaKpi += 1;
    });

    // Turmas por status (contagem simples a partir das próprias linhas).
    const porStatus = {};
    const porCliente = {};
    linhas.forEach((l) => {
      const st = l.status || "—";
      porStatus[st] = (porStatus[st] || 0) + 1;
      const cli = l.cliente || "—";
      if (!porCliente[cli]) porCliente[cli] = { turmas: 0, horas: 0 };
      porCliente[cli].turmas += 1;
      porCliente[cli].horas += Number(l.chRealizada || 0);
    });

    let linhaTabela = linhaKpi + 1;
    wsResumo.getCell(linhaTabela, 1).value = "Turmas por status";
    wsResumo.getCell(linhaTabela, 1).font = { bold: true, size: 12 };
    linhaTabela += 1;
    wsResumo.getCell(linhaTabela, 1).value = "Status";
    wsResumo.getCell(linhaTabela, 2).value = "Turmas";
    estilizarCabecalho(wsResumo, linhaTabela, 2);
    linhaTabela += 1;
    Object.entries(porStatus)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, total]) => {
        wsResumo.getCell(linhaTabela, 1).value = status;
        wsResumo.getCell(linhaTabela, 2).value = total;
        linhaTabela += 1;
      });

    linhaTabela += 1;
    wsResumo.getCell(linhaTabela, 1).value = "Horas realizadas por cliente";
    wsResumo.getCell(linhaTabela, 1).font = { bold: true, size: 12 };
    linhaTabela += 1;
    wsResumo.getCell(linhaTabela, 1).value = "Cliente";
    wsResumo.getCell(linhaTabela, 2).value = "Horas";
    estilizarCabecalho(wsResumo, linhaTabela, 2);
    linhaTabela += 1;
    Object.entries(porCliente)
      .sort((a, b) => b[1].horas - a[1].horas)
      .forEach(([cliente, v]) => {
        wsResumo.getCell(linhaTabela, 1).value = cliente;
        const cell = wsResumo.getCell(linhaTabela, 2);
        cell.value = Number(v.horas.toFixed(1));
        cell.numFmt = '0.0"h"';
        linhaTabela += 1;
      });

    // ── Aba "Detalhe" — a mesma tabela de antes, agora agrupada por seção
    // em vez de 20 colunas soltas, com tipos de verdade (data/percentual/
    // inteiro) e cor de status/taxa igual à tela. ──
    const GRUPOS = [
      {
        titulo: "IDENTIFICAÇÃO", cor: "FFE2E8F0",
        colunas: [
          { titulo: "Turma",              chave: "turma",              largura: 26 },
          { titulo: "Cliente",            chave: "cliente",            largura: 20 },
          { titulo: "Instrutor",          chave: "instrutor",          largura: 20 },
          { titulo: "Supervisor",         chave: "supervisor",         largura: 20 },
          { titulo: "Status",             chave: "status",             largura: 16 },
          { titulo: "Início",             chave: "inicio",             largura: 12, formato: "data" },
          { titulo: "Fim",                chave: "fim",                largura: 12, formato: "data" },
          { titulo: "Origem frequência",  chave: "origemFrequencia",   largura: 16 },
        ],
      },
      {
        titulo: "PLANEJADO", cor: "FFDBEAFE",
        colunas: [
          { titulo: "Treinandos previstos",    chave: "treinandosPrevistos",    largura: 14, formato: "inteiro" },
          { titulo: "Treinandos confirmados",  chave: "treinandosConfirmados",  largura: 14, formato: "inteiro" },
          { titulo: "Aulas planejadas",        chave: "aulasPlanejadas",        largura: 13, formato: "inteiro" },
          { titulo: "Base esperada",           chave: "baseEsperada",           largura: 12, formato: "inteiro" },
          { titulo: "Carga horária",           chave: "cargaHoraria",           largura: 12, numFmt: '0.0"h"' },
        ],
      },
      {
        titulo: "REALIZADO", cor: "FFDCFCE7",
        colunas: [
          { titulo: "Total realizado", chave: "totalRealizado", largura: 13, formato: "inteiro" },
          { titulo: "Presentes",       chave: "presentes",      largura: 11, formato: "inteiro" },
          { titulo: "Ausentes",        chave: "ausentes",       largura: 11, formato: "inteiro" },
          { titulo: "Justificados",    chave: "justificados",   largura: 12, formato: "inteiro" },
          { titulo: "Pendentes",       chave: "pendentes",      largura: 11, formato: "inteiro" },
          { titulo: "CH realizada",    chave: "chRealizada",    largura: 12, numFmt: '0.0"h"' },
        ],
      },
      {
        titulo: "INDICADORES", cor: "FFFEF3C7",
        colunas: [
          { titulo: "Taxa presença",  chave: "taxaPresenca",  largura: 12, formato: "percentual", destaque: corTaxa },
          { titulo: "Taxa execução",  chave: "taxaExecucao",  largura: 12, formato: "percentual" },
        ],
      },
    ];
    const colunas = GRUPOS.flatMap((g) => g.colunas);

    const wsDetalhe = wb.addWorksheet("Detalhe");
    wsDetalhe.columns = colunas.map((c) => ({ width: c.largura }));

    // Linha 1: faixa colorida por grupo (mesclada).
    let colAtual = 1;
    GRUPOS.forEach((g) => {
      const inicioCol = colAtual;
      const fimCol = colAtual + g.colunas.length - 1;
      if (fimCol > inicioCol) wsDetalhe.mergeCells(1, inicioCol, 1, fimCol);
      const cell = wsDetalhe.getCell(1, inicioCol);
      cell.value = g.titulo;
      cell.font = { bold: true, size: 10, color: { argb: "FF334155" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      for (let c = inicioCol; c <= fimCol; c++) {
        wsDetalhe.getCell(1, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: g.cor } };
      }
      colAtual = fimCol + 1;
    });
    wsDetalhe.getRow(1).height = 18;

    // Linha 2: cabeçalho de coluna de verdade.
    colunas.forEach((c, i) => { wsDetalhe.getCell(2, i + 1).value = c.titulo; });
    estilizarCabecalho(wsDetalhe, 2, colunas.length);

    linhas.forEach((linha, idx) => {
      const row = 3 + idx;
      colunas.forEach((c, i) => {
        const col = i + 1;
        const cell = wsDetalhe.getCell(row, col);
        const valor = linha[c.chave];
        if (c.formato === "data") {
          const d = paraDate(valor);
          if (d) { cell.value = d; cell.numFmt = FORMATO_DATA; } else { cell.value = ""; }
        } else if (c.formato === "inteiro") {
          cell.value = valor == null || valor === "" ? 0 : Number(valor);
          cell.numFmt = "#,##0";
        } else if (c.formato === "percentual") {
          if (valor == null || valor === "") { cell.value = ""; }
          else {
            cell.value = Number(valor) / 100;
            cell.numFmt = "0.0%";
            const destaque = (c.destaque || corTaxa)(valor);
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: destaque.bg } };
            cell.font = { color: { argb: destaque.texto }, bold: true };
          }
        } else if (c.numFmt) {
          cell.value = valor == null || valor === "" ? 0 : Number(valor);
          cell.numFmt = c.numFmt;
        } else {
          cell.value = valor == null ? "" : valor;
          if (c.chave === "status") {
            const cor = corStatus(valor);
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor.bg } };
            cell.font = { color: { argb: cor.texto }, bold: true };
          }
        }
      });
    });

    wsDetalhe.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: colunas.length } };
    wsDetalhe.views = [{ state: "frozen", ySplit: 2 }];

    const buf = await wb.xlsx.writeBuffer();
    const sufixoPeriodo = periodo.inicio || periodo.fim
      ? `_${periodo.inicio || "inicio"}_a_${periodo.fim || "hoje"}`
      : "";
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio_presenca${sufixoPeriodo}.xlsx"`);
    return res.send(Buffer.from(buf));
  } catch (error) {
    console.error("[presencaResumoController] exportarRelatorio:", error.message || error);
    return res.status(500).json({
      ok: false,
      message: "Erro ao gerar o relatório de presença",
    });
  }
}

module.exports = { listarResumoGeral, obterResumoPorTreinamento, exportarRelatorioPresenca };
