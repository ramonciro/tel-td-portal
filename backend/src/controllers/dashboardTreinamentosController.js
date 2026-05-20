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

    const [baseRows] = await pool.query(
      `
      SELECT
        t.id,
        t.tema,
        t.cliente,
        t.instrutor,
        t.supervisor,
        t.descricao,
        t.status,
        t.data,
        t.data_inicio,
        t.data_fim,
        t.carga_horaria,
        ${participantCountExpr} AS participantes_previstos,
        COUNT(tp.id) AS treinados,
        COALESCE(SUM(CASE WHEN LOWER(TRIM(tp.status_presenca)) = 'presente' THEN 1 ELSE 0 END), 0) AS presentes,
        COALESCE(SUM(CASE WHEN LOWER(TRIM(tp.status_presenca)) = 'ausente' THEN 1 ELSE 0 END), 0) AS ausentes,
        COALESCE(SUM(CASE WHEN LOWER(TRIM(tp.status_presenca)) = 'justificado' THEN 1 ELSE 0 END), 0) AS justificados,
        COALESCE(SUM(CASE WHEN tp.status_presenca IS NULL OR TRIM(tp.status_presenca) = '' OR LOWER(TRIM(tp.status_presenca)) = 'pendente' THEN 1 ELSE 0 END), 0) AS pendentes
      FROM treinamentos t
      LEFT JOIN treinamento_participantes tp ON tp.treinamento_id = t.id
      ${whereSql}
      GROUP BY
        t.id, t.tema, t.cliente, t.instrutor, t.supervisor,
        t.descricao, t.status, t.data, t.data_inicio, t.data_fim,
        t.carga_horaria, ${participantCountExpr}
      ORDER BY ${dateOrderExpr} DESC, t.id DESC
      `,
      params
    );

    // FIX 4: filtro de modalidade feito em memória (campo embutido em descricao)
    // quando modalidade tiver campo próprio na tabela, mover para o WHERE do SQL
    const filteredRows = baseRows.filter((row) => {
      if (!query.modalidade) return true;
      return parseModalidadeFromDescricao(row.descricao) === String(query.modalidade).toLowerCase();
    });

    const totalTreinamentos = filteredRows.length;
    const totalPrevistos = filteredRows.reduce((acc, item) => acc + n(item.participantes_previstos), 0);
    const totalTreinados = filteredRows.reduce((acc, item) => acc + n(item.treinados), 0);
    const totalPresentes = filteredRows.reduce((acc, item) => acc + n(item.presentes), 0);
    const totalAusentes = filteredRows.reduce((acc, item) => acc + n(item.ausentes), 0);
    const totalJustificados = filteredRows.reduce((acc, item) => acc + n(item.justificados), 0);
    const totalPendentes = filteredRows.reduce((acc, item) => acc + n(item.pendentes), 0);
    // horas ministradas: soma de carga das turmas com participantes registrados
    // (carga × presentes inflava multi-sessão: 10 pessoas × 12 aulas = 120 "presentes")
    const horasMinistradas = filteredRows.reduce((acc, item) => acc + (n(item.treinados) > 0 ? parseHorasTexto(item.carga_horaria) : 0), 0);
    const horasTreinadas = horasMinistradas; // alias mantido por compatibilidade
    const cargaHorariaTotal = filteredRows.reduce((acc, item) => acc + parseHorasTexto(item.carga_horaria), 0);
    const taxaPresenca = totalTreinados > 0 ? Math.round((totalPresentes / totalTreinados) * 100) : 0;
    const taxaConclusaoChamada = totalTreinados > 0 ? Math.round(((totalTreinados - totalPendentes) / totalTreinados) * 100) : 0;
    // taxa_execucao_diaria zerava quando participantes_previstos era nulo
    // usa treinados/base ativa apenas entre turmas que têm base definida
    const turmasComBase = filteredRows.filter((item) => n(item.participantes_previstos) > 0 || n(item.treinados) > 0);
    const baseAtiva = turmasComBase.reduce((acc, item) => acc + Math.max(n(item.participantes_previstos), n(item.treinados)), 0);
    const taxaExecucaoDiaria = baseAtiva > 0 ? Math.min(Math.round((totalTreinados / baseAtiva) * 100), 100) : 0;
    const mediaParticipantesPorTurma = totalTreinamentos > 0 ? Number((totalPrevistos / totalTreinamentos).toFixed(1)) : 0;
    const gapDiario = Math.max(totalPrevistos - totalTreinados, 0);

    const byCliente = new Map();
    const byInstrutor = new Map();
    const clientesSet = new Set();
    const instrutoresSet = new Set();
    const supervisoresSet = new Set();
    const statusSet = new Set();
    const modalidadeSet = new Set();

    for (const row of filteredRows) {
      const cliente = row.cliente || "Sem cliente";
      const instrutor = row.instrutor || "Sem instrutor";
      const supervisor = row.supervisor || "";
      const modalidade = parseModalidadeFromDescricao(row.descricao);
      const status = normalizeStatus(row.status);
      clientesSet.add(cliente);
      instrutoresSet.add(instrutor);
      if (supervisor) supervisoresSet.add(supervisor);
      if (status) statusSet.add(status);
      if (modalidade) modalidadeSet.add(modalidade);

      if (!byCliente.has(cliente)) {
        byCliente.set(cliente, { cliente, total_turmas: 0, total_treinados: 0, presentes: 0, pendentes: 0, ausentes: 0, justificados: 0 });
      }
      const c = byCliente.get(cliente);
      c.total_turmas += 1;
      c.total_treinados += n(row.treinados) > 0 ? n(row.treinados) : n(row.participantes_previstos);
      c.presentes += n(row.presentes);
      c.pendentes += n(row.pendentes);
      c.ausentes += n(row.ausentes);
      c.justificados += n(row.justificados);

      if (!byInstrutor.has(instrutor)) {
        byInstrutor.set(instrutor, { instrutor, total_turmas: 0, total_treinados: 0, presentes: 0 });
      }
      const i = byInstrutor.get(instrutor);
      i.total_turmas += 1;
      i.total_treinados += n(row.treinados) > 0 ? n(row.treinados) : n(row.participantes_previstos);
      i.presentes += n(row.presentes);
    }

    const presencaPorCliente = Array.from(byCliente.values())
      .map((item) => ({
        ...item,
        taxa_presenca: item.total_treinados > 0 ? Math.round((item.presentes / item.total_treinados) * 100) : 0,
      }))
      .sort((a, b) => b.total_turmas - a.total_turmas || b.total_treinados - a.total_treinados)
      .slice(0, 10);

    const rankingInstrutores = Array.from(byInstrutor.values())
      .map((item) => ({
        ...item,
        taxa_presenca: item.total_treinados > 0 ? Math.round((item.presentes / item.total_treinados) * 100) : 0,
      }))
      .sort((a, b) => b.total_turmas - a.total_turmas || b.total_treinados - a.total_treinados)
      .slice(0, 10);

    // FIX 8: NPS e avaliações por turma
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
      for (const row of progresso || []) {
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

    const ultimasTurmas = filteredRows.slice(0, 8).map((item) => ({
      ...item,
      base_ativa: n(item.treinados) > 0 ? n(item.treinados) : n(item.participantes_previstos),
      taxa_presenca: n(item.treinados) > 0 ? Math.round((n(item.presentes) / n(item.treinados)) * 100) : 0,
      modalidade: parseModalidadeFromDescricao(item.descricao),
      status_canonico: normalizeStatus(item.status),
    }));

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
        taxa_execucao_diaria: taxaExecucaoDiaria,
        media_participantes_por_turma: mediaParticipantesPorTurma,
        horas_treinadas: n(horasTreinadas),
        horas_ministradas: n(horasMinistradas),
        carga_horaria_total: n(cargaHorariaTotal),
        clientes_ativos: Array.from(clientesSet).filter((item) => item && item !== "Sem cliente").length,
        clientes_com_treinamento: Array.from(clientesSet).filter((item) => item && item !== "Sem cliente").length,
        capacidade_diaria_prevista: totalPrevistos,
        gap_diario: gapDiario,
        previstos_no_dia: totalPrevistos,
        presentes_no_dia: totalPresentes,
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
