const db = require("../lib/db");
const { resumoPorJornada } = require("../lib/jornadaPresencaResumo");

// KPIs do Ambiente Metodologia (20/09/2026) — implementa o framework
// acordado com o Ramon em claude/framework-kpis-metodologia-2026-09-20.md:
// duas trilhas que NUNCA se misturam num só número (coletiva vs.
// individual/coaching), e nenhum indicador de risco/conformidade é diluído
// numa média — MPT fica sempre um alerta à parte, nunca compõe o índice de
// adesão.

// Mesma normalização de status já usada no frontend (canonicalStatus, em
// mapa-desenvolvimento/page.js) — replicada aqui pro cálculo de adesão
// rodar no backend em vez de recalculado por item na tela.
function statusConcluido(valor) {
  const s = String(valor || "").trim().toLowerCase();
  return ["concluida", "concluído", "concluido", "finalizada"].includes(s);
}

function statusCancelado(valor) {
  const s = String(valor || "").trim().toLowerCase();
  return ["cancelada", "cancelado"].includes(s);
}

// Farol combinado com o mesmo corte já usado em frequência/ocupação no
// resto do Portal (decisão do Ramon, 20/09/2026: reaproveitar o corte
// existente em vez de um padrão novo só para este KPI).
function farolPercentual(pct) {
  if (pct >= 90) return "saudavel";
  if (pct >= 80) return "atencao";
  return "critico";
}

async function obterKpis(req, res) {
  try {
    const tenantWhereJE = req.empresaId ? "AND je.empresa_id = ?" : "";
    const tenantWhereJD = req.empresaId ? "AND jd.empresa_id = ?" : "";
    const tenantWhereCI = req.empresaId ? "AND ci.empresa_id = ?" : "";
    const tenantWhereAD = req.empresaId ? "AND ad.empresa_id = ?" : "";
    const params = req.empresaId ? [req.empresaId] : [];

    // ── Adesão ao cronograma (trilha coletiva) ──────────────────────────
    // "Portos" = etapas com data_fim já vencida (previstas até hoje).
    // Adesão = concluídas no prazo (data_fim >= hoje da conclusão real não
    // é rastreada — usamos "concluída e não vencida" como proxy, mesma
    // lógica do farol de prazo já existente em getPrazoInfo) / previstas
    // até a data.
    const [etapas] = await db.query(
      `
      SELECT je.id, je.status, je.data_fim, jd.cliente
      FROM jornadas_etapas je
      INNER JOIN jornadas_desenvolvimento jd ON jd.id = je.jornada_id
      WHERE je.data_fim IS NOT NULL AND je.data_fim <= CURDATE() ${tenantWhereJE}
      `,
      params
    );

    const porClienteAdesao = {};
    let previstos = 0;
    let concluidosNoPrazo = 0;

    for (const etapa of etapas) {
      const cliente = etapa.cliente || "Sem cliente";
      if (!porClienteAdesao[cliente]) {
        porClienteAdesao[cliente] = { cliente, previstos: 0, concluidos: 0 };
      }
      if (statusCancelado(etapa.status)) continue;

      previstos += 1;
      porClienteAdesao[cliente].previstos += 1;

      if (statusConcluido(etapa.status)) {
        concluidosNoPrazo += 1;
        porClienteAdesao[cliente].concluidos += 1;
      }
    }

    const adesaoPct = previstos > 0 ? Math.round((concluidosNoPrazo / previstos) * 100) : null;

    const adesaoPorCliente = Object.values(porClienteAdesao).map((c) => {
      const pct = c.previstos > 0 ? Math.round((c.concluidos / c.previstos) * 100) : null;
      return { ...c, pct, farol: pct === null ? null : farolPercentual(pct) };
    });

    // ── Cobertura por cliente (headcount simples, sem cálculo de gap) ───
    // 16/10/2026: agrupa pelo cliente da JORNADA (o do participante só entra
    // se a jornada não tiver cliente) e conta PESSOAS distintas — antes
    // agrupava só pelo cliente digitado em cada participante (vazio na
    // maioria → tudo caía em "Sem cliente") e contava linhas, então quem
    // está em duas jornadas era somado duas vezes. Jornada cancelada não
    // conta como "pessoa em jornada". O escopo vem da jornada (empresa_id
    // do participante nem sempre foi gravado).
    const [participantesRows] = await db.query(
      `
      SELECT jp.id, jp.pessoa_id, jp.cliente AS cliente_participante, jd.cliente AS cliente_jornada, jd.status AS status_jornada
      FROM jornada_participantes jp
      INNER JOIN jornadas_desenvolvimento jd ON jd.id = jp.jornada_id
      WHERE 1=1 ${tenantWhereJD}
      `,
      params
    );
    const pessoasPorCliente = new Map();
    const pessoasTotal = new Set();
    for (const r of participantesRows) {
      if (statusCancelado(r.status_jornada)) continue;
      const cliente =
        String(r.cliente_jornada || "").trim() || String(r.cliente_participante || "").trim() || "Sem cliente";
      const chavePessoa = r.pessoa_id ? `p${r.pessoa_id}` : `j${r.id}`;
      if (!pessoasPorCliente.has(cliente)) pessoasPorCliente.set(cliente, new Set());
      pessoasPorCliente.get(cliente).add(chavePessoa);
      pessoasTotal.add(chavePessoa);
    }
    const coberturaPorCliente = Array.from(pessoasPorCliente.entries())
      .map(([cliente, set]) => ({ cliente, pessoas: set.size }))
      .sort((a, b) => b.pessoas - a.pessoas || a.cliente.localeCompare(b.cliente, "pt-BR"));
    const totalCobertura = pessoasTotal.size;

    // ── Coaching individual (trilha à parte — nunca soma na adesão) ─────
    const [coachingRows] = await db.query(
      `
      SELECT ci.id, ci.cadencia_dias, ci.status,
             (SELECT MAX(data_encontro) FROM coaching_encontros ce WHERE ce.coaching_individual_id = ci.id) AS ultimo_encontro
      FROM coaching_individual ci
      WHERE ci.status = 'ativo' ${tenantWhereCI}
      `,
      params
    );

    let coachingEmDia = 0;
    let coachingAtrasados = 0;
    let coachingAguardando = 0;

    for (const c of coachingRows) {
      if (!c.ultimo_encontro) {
        coachingAguardando += 1;
        continue;
      }
      const hoje = new Date();
      const hojeLocal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      const ultimo = new Date(c.ultimo_encontro);
      const ultimoLocal = new Date(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate());
      const dias = Math.round((hojeLocal - ultimoLocal) / (1000 * 60 * 60 * 24));
      if (dias > Number(c.cadencia_dias || 30)) coachingAtrasados += 1;
      else coachingEmDia += 1;
    }

    // ── Comprovação MPT — PROVISÓRIO ─────────────────────────────────────
    // Ainda não temos a regra de "horas exigidas" por subdivisão (pendência
    // em aberto com o Ramon, ver framework-kpis-metodologia-2026-09-20.md).
    // Como proxy temporário, honesto sobre a limitação: conta ações de
    // desenvolvimento VENCIDAS (data_fim no passado) e não concluídas,
    // agrupadas por subtipo/subdivisão — não é um cálculo de horas, é um
    // indicador de atraso. Trocar por horas reais assim que a regra vier.
    const [acoesVencidas] = await db.query(
      `
      SELECT ad.subtipo, ad.status, COUNT(*) AS pendentes
      FROM acoes_desenvolvimento ad
      WHERE ad.data_fim IS NOT NULL AND ad.data_fim < CURDATE() ${tenantWhereAD}
      GROUP BY ad.subtipo, ad.status
      `,
      params
    );
    const statusConcluidoOuCancelado = (s) =>
      ["concluida", "concluído", "concluido", "finalizada", "cancelada", "cancelado"].includes(
        String(s || "").trim().toLowerCase()
      );
    const acumuladoPorSubdivisao = {};
    for (const r of acoesVencidas) {
      if (statusConcluidoOuCancelado(r.status)) continue;
      const chave = r.subtipo || "Não classificada";
      acumuladoPorSubdivisao[chave] = (acumuladoPorSubdivisao[chave] || 0) + Number(r.pendentes);
    }
    const mptPorSubdivisao = Object.entries(acumuladoPorSubdivisao).map(([subdivisao, pendentes]) => ({
      subdivisao,
      pendentes,
    }));
    const mptTotal = mptPorSubdivisao.reduce((soma, r) => soma + r.pendentes, 0);

    // ── Jornadas: encontros e presença (Fase 1) ─────────────────────────
    // Antes nada disto aparecia aqui: o dashboard só lia etapas com prazo,
    // coaching e ações vencidas. Mesmas regras da grade de presença.
    const resumoJornadas = (await resumoPorJornada(req.empresaId || null)).filter((j) => !j.cancelada);

    let encPrevistos = 0;
    let encLancados = 0;
    const encPorCliente = {};
    let presentesTotal = 0;
    let ausentesTotal = 0;
    let jornadasComDado = 0;
    let jornadasAbaixo = 0;
    let pessoasAbaixo = 0;
    for (const j of resumoJornadas) {
      const cliente = j.cliente || "Sem cliente";
      if (!encPorCliente[cliente]) encPorCliente[cliente] = { cliente, previstos: 0, concluidos: 0 };
      encPorCliente[cliente].previstos += j.encontros_realizados;
      encPorCliente[cliente].concluidos += j.encontros_com_chamada;
      encPrevistos += j.encontros_realizados;
      encLancados += j.encontros_com_chamada;
      presentesTotal += j.presentes;
      ausentesTotal += j.ausentes;
      if (j.pct_presenca !== null) {
        jornadasComDado += 1;
        if (j.farol === "vermelho") jornadasAbaixo += 1;
      }
      pessoasAbaixo += j.abaixo_do_minimo;
    }
    const encPct = encPrevistos > 0 ? Math.round((encLancados / encPrevistos) * 100) : null;
    const adesaoEncontros = {
      pct: encPct,
      farol: encPct === null ? null : farolPercentual(encPct),
      previstos: encPrevistos,
      lancados: encLancados,
      porCliente: Object.values(encPorCliente)
        .filter((c) => c.previstos > 0)
        .map((c) => {
          const pct = Math.round((c.concluidos / c.previstos) * 100);
          return { ...c, pct, farol: farolPercentual(pct) };
        }),
    };
    const basePresenca = presentesTotal + ausentesTotal;
    const presencaJornadas = {
      pct: basePresenca > 0 ? Math.round((presentesTotal / basePresenca) * 1000) / 10 : null,
      presentes: presentesTotal,
      ausentes: ausentesTotal,
      jornadasComDado,
      jornadasAbaixoDoMinimo: jornadasAbaixo,
      pessoasAbaixoDoMinimo: pessoasAbaixo,
      // Regra do framework: risco nunca é diluído numa média — basta uma
      // jornada abaixo do mínimo para o farol geral ficar crítico.
      farol: jornadasComDado === 0 ? null : jornadasAbaixo > 0 ? "critico" : "saudavel",
    };

    // Comprovação MPT por HORAS REAIS (presença × meta de horas da jornada).
    // Só entra jornada com meta cadastrada em "Configurar presença"; sem meta
    // o sistema não inventa número (decisão E do Ramon, 13/10/2026).
    const comParticipantes = resumoJornadas.filter((j) => j.participantes > 0);
    const comMeta = comParticipantes.filter((j) => j.meta_horas);
    const mptHoras = {
      jornadasComMeta: comMeta.length,
      jornadasSemMeta: comParticipantes.length - comMeta.length,
      pessoas: comMeta.reduce((a, j) => a + j.participantes, 0),
      atingiram: comMeta.reduce((a, j) => a + (j.atingiram_meta || 0), 0),
      abaixo: comMeta.reduce((a, j) => a + (j.abaixo_da_meta || 0), 0),
      porJornada: comMeta.map((j) => ({
        jornada_id: j.jornada_id,
        nome: j.nome,
        cliente: j.cliente || "Sem cliente",
        meta_horas: j.meta_horas,
        pessoas: j.participantes,
        atingiram: j.atingiram_meta || 0,
        abaixo: j.abaixo_da_meta || 0,
      })),
    };

    res.json({
      adesaoCronograma: {
        pct: adesaoPct,
        farol: adesaoPct === null ? null : farolPercentual(adesaoPct),
        previstos,
        concluidosNoPrazo,
        porCliente: adesaoPorCliente,
      },
      coberturaPorCliente: {
        total: totalCobertura,
        porCliente: coberturaPorCliente,
      },
      adesaoEncontros,
      presencaJornadas,
      jornadas: resumoJornadas,
      mptHoras,
      coachingIndividual: {
        total: coachingRows.length,
        emDia: coachingEmDia,
        atrasados: coachingAtrasados,
        aguardando: coachingAguardando,
      },
      mptPendentes: {
        total: mptTotal,
        porSubdivisao: mptPorSubdivisao,
        provisorio: true,
        aviso: "Contagem provisória por vencimento de prazo — regra de horas exigidas ainda não definida.",
      },
    });
  } catch (error) {
    console.error("Erro ao calcular KPIs do Ambiente Metodologia:", error);
    res.status(500).json({ error: "Erro ao calcular KPIs do Ambiente Metodologia." });
  }
}

// Resumo de encontros e presença por jornada — usado pelos cards do Mapa de
// Desenvolvimento (horas, progresso, próximo encontro). Retorna um ARRAY, no
// mesmo formato das demais fontes do Mapa.
async function resumoJornadas(req, res) {
  try {
    res.json(await resumoPorJornada(req.empresaId || null));
  } catch (error) {
    console.error("Erro ao resumir presença das jornadas:", error);
    res.status(500).json({ error: "Erro ao resumir encontros e presença das jornadas." });
  }
}

module.exports = { obterKpis, resumoJornadas };
