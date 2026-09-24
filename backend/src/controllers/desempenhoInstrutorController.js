/**
 * desempenhoInstrutorController.js
 *
 * GET /api/desempenho-instrutor?periodo=mensal&ano=2026&mes=9[&instrutor=Fulano]
 * GET /api/desempenho-instrutor?periodo=trimestral&ano=2026&trimestre=3[&instrutor=Fulano]
 * GET /api/desempenho-instrutor/exportar?... (mesmos filtros, devolve .xlsx)
 * GET /api/desempenho-instrutor/resumo-executivo (item 5 — resumo do mês
 *   corrente pro bloco executivo do Dashboard; só coordenação, sem filtro)
 *
 * Scorecard de instrutor (CH, frequência, avaliação, NPS) — ver
 * desempenhoInstrutorResolver.js para o cálculo e as ressalvas sobre
 * cobertura de avaliação e o índice geral.
 *
 * Perfil "instrutor" só pode ver o próprio scorecard — o parâmetro
 * `instrutor` da query é ignorado nesse caso e substituído pelo nome do
 * usuário logado (mesmo padrão de auto-escopo já usado em
 * avaliacoesTreinandosController.listAvaliacoesTreinandos para o perfil
 * treinando). Coordenador/supervisor/superintendente podem filtrar por
 * qualquer instrutor, ou ver todos de uma vez (sem o parâmetro).
 */

const { getScorecardInstrutor, getResumoExecutivo } = require("../services/desempenhoInstrutorResolver");
const { tenantScopeFor } = require("../lib/tenantScope");

// Pacote Superintendente (24/09/2026): scorecard e resumo executivo são
// leitura pura (nenhum dos dois grava nada) — cross-tenant liberado por
// inteiro para a superintendente, mesmo mecanismo usado nas demais telas.
const CROSS_TENANT_ROLES = ["superintendente"];

function resolverFiltros(req) {
  const perfil = String(req.user?.perfil || "").toLowerCase();
  const nomeUsuario = String(req.user?.nome || "").trim();
  const q = req.query || {};

  let instrutor = q.instrutor || undefined;
  if (perfil === "instrutor") {
    if (!nomeUsuario) {
      throw Object.assign(new Error("Usuário não identificado"), { status: 400 });
    }
    instrutor = nomeUsuario;
  }

  const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });

  return {
    instrutor,
    periodo: q.periodo === "trimestral" ? "trimestral" : "mensal",
    ano: q.ano ? Number(q.ano) : undefined,
    mes: q.mes ? Number(q.mes) : undefined,
    trimestre: q.trimestre ? Number(q.trimestre) : undefined,
    empresaId,
  };
}

async function getDesempenho(req, res) {
  try {
    const filtros = resolverFiltros(req);
    const resultado = await getScorecardInstrutor(filtros);
    return res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("[desempenho-instrutor] getDesempenho:", error);
    return res.status(error.status || 400).json({ ok: false, message: error.message || "Erro ao calcular desempenho do instrutor." });
  }
}

function labelPeriodo(periodo) {
  if (periodo.tipo === "trimestral") return `${periodo.ano} — ${periodo.trimestre}º trimestre`;
  return `${String(periodo.mes).padStart(2, "0")}/${periodo.ano}`;
}

async function getDesempenhoExportar(req, res) {
  try {
    const filtros = resolverFiltros(req);
    const resultado = await getScorecardInstrutor(filtros);
    const { novoWorkbook, adicionarTabela, estilizarCabecalho, escreverCelula } = require("../lib/excelExport");
    const wb = novoWorkbook();

    adicionarTabela(wb, {
      nomeAba: "Scorecard instrutores",
      colunas: [
        { titulo: "Instrutor", chave: "instrutor", largura: 26 },
        { titulo: "Posição no time", chave: "posicao", largura: 15 },
        { titulo: "Índice geral (freq./NPS)", chave: "indice_geral", largura: 16, formato: "decimal1" },
        { titulo: "CH realizada (h)", chave: "horas_realizadas", largura: 14, formato: "decimal1" },
        { titulo: "Capacidade (h)", chave: "capacidade_horas", largura: 13, formato: "decimal1" },
        { titulo: "Ocupação (%)", chave: "ocupacao_pct", largura: 12, formato: "percentual" },
        { titulo: "Frequência média (%)", chave: "frequencia_media_pct", largura: 15, formato: "percentual" },
        { titulo: "Turmas c/ chamada lançada", chave: "turmas_consideradas", largura: 16, formato: "inteiro" },
        { titulo: "Nota prova (média)", chave: "nota_prova_media", largura: 14, formato: "decimal1" },
        { titulo: "Nota qualidade (média)", chave: "nota_qualidade_media", largura: 15, formato: "decimal1" },
        { titulo: "Cobertura avaliação (%)", chave: "cobertura_pct", largura: 16, formato: "percentual" },
        { titulo: "Turmas avaliadas / total", chave: "turmas_avaliadas_total", largura: 16 },
        { titulo: "NPS score", chave: "nps_score", largura: 11, formato: "decimal1" },
        { titulo: "NPS nota média", chave: "nps_nota_media", largura: 12, formato: "decimal1" },
        { titulo: "Promotores", chave: "promotores", largura: 11, formato: "inteiro" },
        { titulo: "Neutros", chave: "neutros", largura: 10, formato: "inteiro" },
        { titulo: "Detratores", chave: "detratores", largura: 11, formato: "inteiro" },
        { titulo: "Respostas NPS", chave: "total_respostas", largura: 12, formato: "inteiro" },
      ],
      linhas: resultado.itens.map((i) => ({
        instrutor: i.instrutor,
        posicao: i.posicao_no_time ? `${i.posicao_no_time}º de ${i.total_no_ranking}` : "—",
        indice_geral: i.indice_geral,
        horas_realizadas: i.ch.horas_realizadas,
        capacidade_horas: i.ch.capacidade_horas,
        ocupacao_pct: i.ch.ocupacao_pct,
        frequencia_media_pct: i.frequencia.media_pct,
        turmas_consideradas: i.frequencia.turmas_consideradas,
        nota_prova_media: i.avaliacao.nota_prova_media,
        nota_qualidade_media: i.avaliacao.nota_qualidade_media,
        cobertura_pct: i.avaliacao.cobertura_pct,
        turmas_avaliadas_total: `${i.avaliacao.turmas_com_avaliacao} / ${i.avaliacao.turmas_no_periodo}`,
        nps_score: i.nps.nps_score,
        nps_nota_media: i.nps.nota_media,
        promotores: i.nps.promotores,
        neutros: i.nps.neutros,
        detratores: i.nps.detratores,
        total_respostas: i.nps.total_respostas,
      })),
    });

    if (resultado.medias_time) {
      const wsMedia = wb.addWorksheet("Média do time");
      wsMedia.columns = [{ width: 26 }, { width: 16 }];
      wsMedia.getCell(1, 1).value = "Média do time";
      wsMedia.getCell(1, 2).value = "";
      estilizarCabecalho(wsMedia, 1, 2);
      const linhasMedia = [
        ["Ocupação (%)", resultado.medias_time.ocupacao_pct, "percentual"],
        ["Frequência (%)", resultado.medias_time.frequencia_pct, "percentual"],
        ["NPS score", resultado.medias_time.nps_score, "decimal1"],
        ["Índice geral", resultado.medias_time.indice_geral, "decimal1"],
        ["Instrutores considerados", resultado.medias_time.instrutores_considerados, "inteiro"],
      ];
      linhasMedia.forEach(([label, valor, formato], index) => {
        const row = index + 2;
        wsMedia.getCell(row, 1).value = label;
        escreverCelula(wsMedia, row, 2, valor, formato);
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    const nomeArquivo = `desempenho_instrutor_${labelPeriodo(resultado.periodo).replace(/[^0-9a-zA-Z]+/g, "_")}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    return res.send(Buffer.from(buf));
  } catch (error) {
    console.error("[desempenho-instrutor] getDesempenhoExportar:", error);
    return res.status(error.status || 500).json({ ok: false, message: error.message || "Erro ao exportar desempenho do instrutor." });
  }
}

// Resumo executivo do mês corrente — sempre o time todo (não aceita
// `instrutor`, nem faz sentido pro perfil instrutor individual: essa rota
// não é registrada pra esse perfil, ver index.js). Usada pelo Dashboard
// pra alimentar o farol "Instrutores fora da faixa saudável" e o bloco
// "Desempenho dos instrutores", do mesmo jeito que a Capacidade já faz com
// /capacidade/alertas.
async function getResumoExecutivoController(req, res) {
  try {
    const { empresaId } = tenantScopeFor(req, { crossTenantRoles: CROSS_TENANT_ROLES });
    const resultado = await getResumoExecutivo({ empresaId });
    return res.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("[desempenho-instrutor] getResumoExecutivo:", error);
    return res.status(500).json({ ok: false, message: error.message || "Erro ao montar o resumo executivo de desempenho." });
  }
}

module.exports = { getDesempenho, getDesempenhoExportar, getResumoExecutivo: getResumoExecutivoController };
