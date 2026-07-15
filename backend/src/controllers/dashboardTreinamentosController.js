const pool = require("../lib/db");

function parseHorasTexto(valor) {
  if (valor === null || valor === undefined || valor === "") return 0;
  const texto = String(valor).toLowerCase().replace(",", ".").trim();
  const match = texto.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

function n(value) {
  return Number(value || 0);
}

function parseModalidadeFromDescricao(descricao) {
  const text = String(descricao || "");
  const match = text.match(/\[modalidade:([^\]]+)\]/i);
  const modalidade = String(match?.[1] || "").trim().toLowerCase();
  if (["presencial", "online"].includes(modalidade)) return modalidade;
  return "";
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["concluido", "concluida", "concluído", "concluída", "finalizado", "finalizada"].includes(status)) return "concluido";
  if (["em_andamento", "em andamento", "andamento"].includes(status)) return "em_andamento";
  if (["cancelado", "cancelada"].includes(status)) return "cancelado";
  return "planejado";
}

// ---------------------------------------------------------------------------
// resolvePresenca: fonte ÚNICA de verdade para presença de um treinamento.
//
// Antes, cada bloco do dashboard (KPI geral, ranking por cliente, ranking por
// instrutor) calculava "quantos treinados / quantos presentes" de um jeito
// diferente, e todos usavam `treinamento_participantes.status_presenca` — um
// campo ÚNICO que é SOBRESCRITO a cada chamada salva. Isso fazia o dashboard
// refletir só o status do ÚLTIMO dia de chamada, não a presença real ao longo
// do treinamento inteiro.
//
// Esta função usa o HISTÓRICO real de chamadas (tabela `presencas`, uma linha
// por participante por dia) sempre que ele existir, e só cai para o snapshot
// (`treinamento_participantes.status_presenca`) quando não há nenhum
// histórico de chamada gravado para o treinamento.
//
// Regra de negócio adotada (mesma usada na Frequência Individual):
//  - "presente" e "ausente" entram no cálculo da taxa de presença.
//  - "justificado" (falta aprovada) e "pendente" (chamada ainda não feita)
//    NÃO contam contra a taxa de presença — mas "pendente" ainda conta
//    contra a taxa de conclusão de chamada.
// ---------------------------------------------------------------------------
function resolvePresenca(row) {
  const temHistorico = n(row.hist_dias) > 0;

  const diasPresente = temHistorico ? n(row.hist_presentes) : n(row.snap_presentes);
  const diasAusente = temHistorico ? n(row.hist_ausentes) : n(row.snap_ausentes);
  const diasJustificado = temHistorico ? n(row.hist_justificados) : n(row.snap_justificados);
  const diasPendente = temHistorico ? n(row.hist_pendentes) : n(row.snap_pendentes);

  // Base de participantes = tamanho do grupo (pessoas), nunca "dias de chamada".
  // Preferimos o roster (treinamento_participantes); se o treinamento nunca
  // teve um roster importado, usamos a quantidade de pessoas distintas que
  // aparecem no histórico de chamada.
  const baseParticipantes =
    n(row.roster_total) > 0 ? n(row.roster_total) : n(row.hist_participantes_distintos);

  const diasRegistrados = temHistorico ? n(row.hist_dias) : baseParticipantes;
  const denomPresenca = diasPresente + diasAusente;

  return {
    baseParticipantes,
    diasRegistrados,
    diasPresente,
    diasAusente,
    diasJustificado,
    diasPendente,
    taxaPresenca: denomPresenca > 0 ? Math.round((diasPresente / denomPresenca) * 100) : 0,
  };
}

async function getDashboardTreinamentos(req, res) {
  try {
    const query = req.query || {};
    // colunas fixas — sem SHOW COLUMNS em cada request
    const participantCountExpr = "COALESCE(t.participantes, 0)";
    const dateOrderExpr = "COALESCE(t.data_inicio, t.data)";

    const conditions = [];
    const params = [];

    if (query.cliente) {
      conditions.push("t.cliente = ?");
      params.push(query.cliente);
    }

    if (query.instrutor) {
      conditions.push("t.instrutor = ?");
      params.push(query.instrutor);
    }

    if (query.status) {
      conditions.push("LOWER(COALESCE(t.status, '')) = ?");
      params.push(String(query.status).toLowerCase());
    }

    if (query.supervisor) {
      conditions.push("t.supervisor = ?");
      params.push(query.supervisor);
    }

    if (query.data_inicio) {
      conditions.push("DATE(COALESCE(t.data_inicio, t.data)) >= ?");
      params.push(query.data_inicio);
    }

    if (query.data_fim) {
      // filtra por data_fim (ou data_inicio como fallback quando data_fim não está preenchida)
      conditions.push("DATE(COALESCE(t.data_fim, t.data_inicio, t.data)) <= ?");
      params.push(query.data_fim);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    // query completa: inclui histórico real de presença (tabela `presencas`) e supervisor
    // se alguma coluna não existir no ambiente, cai para a query simplificada
    let baseRows;
    try {
      const [rows] = await pool.query(
        `SELECT
          t.id, t.tema, t.cliente, t.instrutor,
          COALESCE(t.supervisor, '') AS supervisor,
          t.descricao, t.status, t.data, t.data_inicio, t.data_fim,
          t.carga_horaria,
          ${participantCountExpr} AS participantes_previstos,

          -- roster: participantes cadastrados no treinamento
          COUNT(DISTINCT tp.id) AS roster_total,

          -- snapshot: status da ÚLTIMA chamada por participante (usado só como fallback,
          -- quando o treinamento não tem nenhum histórico de chamada em presencas)
          COALESCE(SUM(CASE WHEN LOWER(TRIM(tp.status_presenca)) = 'presente' THEN 1 ELSE 0 END), 0) AS snap_presentes,
          COALESCE(SUM(CASE WHEN LOWER(TRIM(tp.status_presenca)) = 'ausente' THEN 1 ELSE 0 END), 0) AS snap_ausentes,
          COALESCE(SUM(CASE WHEN LOWER(TRIM(tp.status_presenca)) = 'justificado' THEN 1 ELSE 0 END), 0) AS snap_justificados,
          COALESCE(SUM(CASE WHEN tp.status_presenca IS NULL OR TRIM(tp.status_presenca) = '' OR LOWER(TRIM(tp.status_presenca)) = 'pendente' THEN 1 ELSE 0 END), 0) AS snap_pendentes,

          -- histórico real: agregado de TODAS as chamadas diárias já feitas (tabela presencas)
          -- esta é a fonte PREFERIDA de presença, pois preserva o dia a dia
          COALESCE(hist.dias, 0) AS hist_dias,
          COALESCE(hist.presentes, 0) AS hist_presentes,
          COALESCE(hist.ausentes, 0) AS hist_ausentes,
          COALESCE(hist.justificados, 0) AS hist_justificados,
          COALESCE(hist.pendentes, 0) AS hist_pendentes,
          COALESCE(hist.participantes_distintos, 0) AS hist_participantes_distintos
        FROM treinamentos t
        LEFT JOIN treinamento_participantes tp ON tp.treinamento_id = t.id
        LEFT JOIN (
          SELECT
            treinamento_id,
            COUNT(*) AS dias,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'presente' THEN 1 ELSE 0 END) AS presentes,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'ausente' THEN 1 ELSE 0 END) AS ausentes,
            SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'justificado' THEN 1 ELSE 0 END) AS justificados,
            SUM(CASE WHEN status IS NULL OR TRIM(status) = '' OR LOWER(TRIM(status)) = 'pendente' THEN 1 ELSE 0 END) AS pendentes,
            COUNT(DISTINCT treinando_nome) AS participantes_distintos
          FROM presencas
          GROUP BY treinamento_id
        ) hist ON hist.treinamento_id = t.id
        ${whereSql}
        GROUP BY t.id, t.tema, t.cliente, t.instrutor, t.supervisor,
          t.descricao, t.status, t.data, t.data_inicio, t.data_fim,
          t.carga_horaria, ${participantCountExpr}
        ORDER BY ${dateOrderExpr} DESC, t.id DESC`,
        params
      );
      baseRows = rows;
    } catch (queryErr) {
      // fallback: query original sem histórico de presencas nem supervisor
      console.warn("[dashboard] query completa falhou, usando fallback:", queryErr.message);
      const [rows] = await pool.query(
        `SELECT
          t.id, t.tema, t.cliente, t.instrutor,
          '' AS supervisor,
          t.descricao, t.status, t.data, t.data_inicio, t.data_fim,
          t.carga_horaria,
          ${participantCountExpr} AS participantes_previstos,
          COUNT(DISTINCT tp.id) AS roster_total,
          COALESCE(SUM(CASE WHEN LOWER(TRIM(tp.status_presenca)) = 'presente' THEN 1 ELSE 0 END), 0) AS snap_presentes,
          COALESCE(SUM(CASE WHEN LOWER(TRIM(tp.status_presenca)) = 'ausente' THEN 1 ELSE 0 END), 0) AS snap_ausentes,
          COALESCE(SUM(CASE WHEN LOWER(TRIM(tp.status_presenca)) = 'justificado' THEN 1 ELSE 0 END), 0) AS snap_justificados,
          COALESCE(SUM(CASE WHEN tp.status_presenca IS NULL OR TRIM(tp.status_presenca) = '' OR LOWER(TRIM(tp.status_presenca)) = 'pendente' THEN 1 ELSE 0 END), 0) AS snap_pendentes,
          0 AS hist_dias, 0 AS hist_presentes, 0 AS hist_ausentes,
          0 AS hist_justificados, 0 AS hist_pendentes, 0 AS hist_participantes_distintos
        FROM treinamentos t
        LEFT JOIN treinamento_participantes tp ON tp.treinamento_id = t.id
        ${whereSql}
        GROUP BY t.id, t.tema, t.cliente, t.instrutor,
          t.descricao, t.status, t.data, t.data_inicio, t.data_fim,
          t.carga_horaria, ${participantCountExpr}
        ORDER BY ${dateOrderExpr} DESC, t.id DESC`,
        params
      );
      baseRows = rows;
    }

    // filtro de modalidade feito em memória (campo embutido em descricao)
    // quando modalidade tiver campo próprio na tabela, mover para o WHERE do SQL
    const filteredRows = baseRows.filter((row) => {
      if (!query.modalidade) return true;
      return parseModalidadeFromDescricao(row.descricao) === String(query.modalidade).toLowerCase();
    });

    // enriquece cada turma com a presença resolvida de forma única (fim das
    // três fórmulas divergentes que existiam entre KPI geral / cliente / instrutor)
    const enriched = filteredRows.map((row) => ({ ...row, presenca: resolvePresenca(row) }));

    const totalTreinamentos = enriched.length;
    const totalPrevistos = enriched.reduce((acc, item) => acc + n(item.participantes_previstos), 0);
    const totalTreinados = enriched.reduce((acc, item) => acc + item.presenca.baseParticipantes, 0);
    const totalPresentes = enriched.reduce((acc, item) => acc + item.presenca.diasPresente, 0);
    const totalAusentes = enriched.reduce((acc, item) => acc + item.presenca.diasAusente, 0);
    const totalJustificados = enriched.reduce((acc, item) => acc + item.presenca.diasJustificado, 0);
    const totalPendentes = enriched.reduce((acc, item) => acc + item.presenca.diasPendente, 0);
    const totalDiasRegistrados = enriched.reduce((acc, item) => acc + item.presenca.diasRegistrados, 0);

    // horas ministradas: soma de carga das turmas com participantes registrados
    // (carga × presentes inflava multi-sessão: 10 pessoas × 12 aulas = 120 "presentes")
    const horasMinistradas = enriched.reduce(
      (acc, item) => acc + (item.presenca.baseParticipantes > 0 ? parseHorasTexto(item.carga_horaria) : 0),
      0
    );
    const horasTreinadas = horasMinistradas; // alias mantido por compatibilidade
    const cargaHorariaTotal = enriched.reduce((acc, item) => acc + parseHorasTexto(item.carga_horaria), 0);

    // taxa de presença: presentes / (presentes + ausentes) — justificado e
    // pendente não contam contra a taxa (mesma regra da Frequência Individual)
    const taxaPresenca =
      totalPresentes + totalAusentes > 0
        ? Math.round((totalPresentes / (totalPresentes + totalAusentes)) * 100)
        : 0;

    // taxa de conclusão de chamada: dias já registrados (não pendentes) / dias esperados
    const taxaConclusaoChamada =
      totalDiasRegistrados > 0
        ? Math.round(((totalDiasRegistrados - totalPendentes) / totalDiasRegistrados) * 100)
        : 0;

    // execução: participantes efetivamente treinados / base ativa (previstos ou já treinados)
    const turmasComBase = enriched.filter(
      (item) => n(item.participantes_previstos) > 0 || item.presenca.baseParticipantes > 0
    );
    const baseAtiva = turmasComBase.reduce(
      (acc, item) => acc + Math.max(n(item.participantes_previstos), item.presenca.baseParticipantes),
      0
    );
    const taxaExecucao = baseAtiva > 0 ? Math.min(Math.round((totalTreinados / baseAtiva) * 100), 100) : 0;
    const mediaParticipantesPorTurma = totalTreinamentos > 0 ? Number((totalPrevistos / totalTreinamentos).toFixed(1)) : 0;
    const gapPrevistosVsTreinados = Math.max(totalPrevistos - totalTreinados, 0);

    // opções de filtro sempre construídas de baseRows (não filteredRows)
    // evita que selecionar um filtro esvazie as opções dos outros
    const clientesSet = new Set();
    const instrutoresSet = new Set();
    const supervisoresSet = new Set();
    const statusSet = new Set();
    const modalidadeSet = new Set();

    for (const row of baseRows) {
      if (row.cliente && row.cliente !== "Sem cliente") clientesSet.add(row.cliente);
      if (row.instrutor) instrutoresSet.add(row.instrutor);
      if (row.supervisor && String(row.supervisor).trim()) supervisoresSet.add(String(row.supervisor).trim());
      const modalidade = parseModalidadeFromDescricao(row.descricao);
      const status = normalizeStatus(row.status);
      if (status) statusSet.add(status);
      if (modalidade) modalidadeSet.add(modalidade);
    }

    const byCliente = new Map();
    const byInstrutor = new Map();

    for (const row of enriched) {
      const cliente = row.cliente || "Sem cliente";
      const instrutor = row.instrutor || "Sem instrutor";
      const p = row.presenca;

      if (!byCliente.has(cliente)) {
        byCliente.set(cliente, { cliente, total_turmas: 0, total_treinados: 0, presentes: 0, pendentes: 0, ausentes: 0, justificados: 0 });
      }
      const c = byCliente.get(cliente);
      c.total_turmas += 1;
      c.total_treinados += p.baseParticipantes;
      c.presentes += p.diasPresente;
      c.pendentes += p.diasPendente;
      c.ausentes += p.diasAusente;
      c.justificados += p.diasJustificado;

      if (!byInstrutor.has(instrutor)) {
        byInstrutor.set(instrutor, { instrutor, total_turmas: 0, total_treinados: 0, presentes: 0, ausentes: 0 });
      }
      const i = byInstrutor.get(instrutor);
      i.total_turmas += 1;
      i.total_treinados += p.baseParticipantes;
      i.presentes += p.diasPresente;
      i.ausentes += p.diasAusente;
    }

    // taxa_presenca por cliente/instrutor agora usa a MESMA regra do KPI geral
    // (presentes / (presentes + ausentes)) — antes cada bloco calculava diferente
    // e os números nunca batiam entre si
    const presencaPorCliente = Array.from(byCliente.values())
      .map((item) => ({
        ...item,
        taxa_presenca: item.presentes + item.ausentes > 0 ? Math.round((item.presentes / (item.presentes + item.ausentes)) * 100) : 0,
      }))
      .sort((a, b) => b.total_turmas - a.total_turmas || b.total_treinados - a.total_treinados)
      .slice(0, 10);

    const rankingInstrutores = Array.from(byInstrutor.values())
      .map((item) => ({
        ...item,
        taxa_presenca: item.presentes + item.ausentes > 0 ? Math.round((item.presentes / (item.presentes + item.ausentes)) * 100) : 0,
      }))
      .sort((a, b) => b.total_turmas - a.total_turmas || b.total_treinados - a.total_treinados)
      .slice(0, 10);

    // NPS e avaliações por turma
    let npsData = { media_nps: 0, media_qualidade: 0, media_prova: 0, total_avaliacoes: 0 };
    try {
      const turmaIds = filteredRows.map((r) => r.id).filter(Boolean);
      if (turmaIds.length > 0) {
        const placeholders = turmaIds.map(() => "?").join(",");
        const [[npsRow]] = await pool.query(
          `SELECT
            ROUND(AVG(nota_nps), 1) AS media_nps,
            ROUND(AVG(nota_qualidade), 1) AS media_qualidade,
            ROUND(AVG(nota_prova), 1) AS media_prova,
            COUNT(*) AS total_avaliacoes
           FROM avaliacoes
           WHERE treinamento_id IN (${placeholders})
             AND (nota_nps IS NOT NULL OR nota_qualidade IS NOT NULL OR nota_prova IS NOT NULL)`,
          turmaIds
        );
        if (npsRow) {
          npsData = {
            media_nps: Number(npsRow.media_nps || 0),
            media_qualidade: Number(npsRow.media_qualidade || 0),
            media_prova: Number(npsRow.media_prova || 0),
            total_avaliacoes: Number(npsRow.total_avaliacoes || 0),
          };
        }
      }
    } catch { /* avaliacoes opcionais */ }

    let oceano = {
      jornadas: 0,
      acoes: 0,
      sustentacoes: 0,
      tripulacao: 0,
      progresso_tripulacao: { em_percurso: 0, concluido: 0, em_sustentacao: 0 },
    };

    try {
      const [[jornadas]] = await pool.query("SELECT COUNT(*) AS total FROM jornadas_desenvolvimento");
      const [[acoes]] = await pool.query("SELECT COUNT(*) AS total FROM acoes_desenvolvimento");
      const [[sustentacoes]] = await pool.query("SELECT COUNT(*) AS total FROM coaching_planos");
      const [[tripulacao]] = await pool.query("SELECT COUNT(*) AS total FROM jornada_participantes");
      const [progresso] = await pool.query(`
        SELECT status_jornada, COUNT(*) AS total
        FROM jornada_participantes
        GROUP BY status_jornada
      `).catch(() => [[]]);
      const progressMap = { em_percurso: 0, concluido: 0, em_sustentacao: 0 };
      for (const row of progresso) {
        const key = String(row.status_jornada || "").trim().toLowerCase();
        if (key in progressMap) progressMap[key] = n(row.total);
      }
      oceano = {
        jornadas: n(jornadas.total),
        acoes: n(acoes.total),
        sustentacoes: n(sustentacoes.total),
        tripulacao: n(tripulacao.total),
        progresso_tripulacao: progressMap,
      };
    } catch {

    }

    const ultimasTurmas = enriched.slice(0, 8).map((item) => {
      const p = item.presenca;
      return {
        ...item,
        base_ativa: p.baseParticipantes,
        taxa_presenca: p.taxaPresenca,
        presentes: p.diasPresente,
        pendentes: p.diasPendente,
        modalidade: parseModalidadeFromDescricao(item.descricao),
        status_canonico: normalizeStatus(item.status),
      };
    });

    return res.json({
      ok: true,
      kpis: {
        treinamentos: totalTreinamentos,
        treinados: totalTreinados,
        participantes_previstos: totalPrevistos,
        presentes: totalPresentes,
        ausentes: totalAusentes,
        justificados: totalJustificados,
        pendentes: totalPendentes,
        taxa_presenca: taxaPresenca,
        taxa_conclusao_chamada: taxaConclusaoChamada,
        // mantido com o nome antigo por compatibilidade com o frontend
        // (não é um número "do dia" — é a execução do período filtrado)
        taxa_execucao_diaria: taxaExecucao,
        media_participantes_por_turma: mediaParticipantesPorTurma,
        horas_treinadas: n(horasTreinadas),
        horas_ministradas: n(horasMinistradas),
        carga_horaria_total: n(cargaHorariaTotal),
        clientes_ativos: Array.from(clientesSet).filter((item) => item && item !== "Sem cliente").length,
        clientes_com_treinamento: Array.from(clientesSet).filter((item) => item && item !== "Sem cliente").length,
        gap_previstos_vs_treinados: gapPrevistosVsTreinados,
      },
      filtros: {
        clientes: Array.from(clientesSet).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "pt-BR")),
        instrutores: Array.from(instrutoresSet).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "pt-BR")),
        supervisores: Array.from(supervisoresSet).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "pt-BR")),
        status: Array.from(statusSet).map((item) => ({
          value: item,
          label:
            item === "em_andamento"
              ? "Em andamento"
              : item === "concluido"
              ? "Concluída"
              : item === "cancelado"
              ? "Cancelada"
              : "Planejada",
        })),
        modalidades: Array.from(modalidadeSet).map((item) => ({ value: item, label: item === "online" ? "Online" : "Presencial" })),
      },
      presenca_por_cliente: presencaPorCliente,
      ranking_instrutores: rankingInstrutores,
      ultimas_turmas: ultimasTurmas,
      oceano,
      nps: npsData,
    });
  } catch (error) {
    console.error("[dashboard] Erro:", error.message);
    return res.status(500).json({
      ok: false,
      message: "Erro ao carregar dashboard de treinamentos.",
      error: error.message,
    });
  }
}

module.exports = {
  getDashboardTreinamentos,
};
