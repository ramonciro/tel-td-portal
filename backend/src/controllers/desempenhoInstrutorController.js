/**
 * desempenhoInstrutorController.js
 *
 * GET /api/desempenho-instrutor?periodo=mensal&ano=2026&mes=9[&instrutor=Fulano]
 * GET /api/desempenho-instrutor?periodo=trimestral&ano=2026&trimestre=3[&instrutor=Fulano]
 * GET /api/desempenho-instrutor/exportar?... (mesmos filtros, devolve .xlsx)
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

const { getScorecardInstrutor } = require("../services/desempenhoInstrutorResolver");

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

  return {
    instrutor,
    periodo: q.periodo === "trimestral" ? "trimestral" : "mensal",
    ano: q.ano ? Number(q.ano) : undefined,
    mes: q.mes ? Number(q.mes) : undefined,
    trimestre: q.trimestre ? Number(q.trimestre) : undefined,
    empresaId: req.empresaId,
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
    const XLSX = require("xlsx");
    const wb = XLSX.utils.book_new();

    const linhas = [
      [
        "Instrutor", "Posição no time", "Índice geral (freq./NPS)",
        "CH realizada (h)", "Capacidade (h)", "Ocupação (%)",
        "Frequência média (%)", "Turmas c/ chamada lançada",
        "Nota prova (média)", "Nota qualidade (média)", "Cobertura avaliação (%)", "Turmas avaliadas / total",
        "NPS score", "NPS nota média", "Promotores", "Neutros", "Detratores", "Respostas NPS",
      ],
      ...resultado.itens.map((i) => [
        i.instrutor,
        i.posicao_no_time ? `${i.posicao_no_time}º de ${i.total_no_ranking}` : "—",
        i.indice_geral,
        i.ch.horas_realizadas,
        i.ch.capacidade_horas,
        i.ch.ocupacao_pct,
        i.frequencia.media_pct,
        i.frequencia.turmas_consideradas,
        i.avaliacao.nota_prova_media,
        i.avaliacao.nota_qualidade_media,
        i.avaliacao.cobertura_pct,
        `${i.avaliacao.turmas_com_avaliacao} / ${i.avaliacao.turmas_no_periodo}`,
        i.nps.nps_score,
        i.nps.nota_media,
        i.nps.promotores,
        i.nps.neutros,
        i.nps.detratores,
        i.nps.total_respostas,
      ]),
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), "Scorecard instrutores");

    if (resultado.medias_time) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Média do time", ""],
        ["Ocupação (%)", resultado.medias_time.ocupacao_pct],
        ["Frequência (%)", resultado.medias_time.frequencia_pct],
        ["NPS score", resultado.medias_time.nps_score],
        ["Índice geral", resultado.medias_time.indice_geral],
        ["Instrutores considerados", resultado.medias_time.instrutores_considerados],
      ]), "Média do time");
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const nomeArquivo = `desempenho_instrutor_${labelPeriodo(resultado.periodo).replace(/[^0-9a-zA-Z]+/g, "_")}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
    return res.send(buf);
  } catch (error) {
    console.error("[desempenho-instrutor] getDesempenhoExportar:", error);
    return res.status(error.status || 500).json({ ok: false, message: error.message || "Erro ao exportar desempenho do instrutor." });
  }
}

module.exports = { getDesempenho, getDesempenhoExportar };
