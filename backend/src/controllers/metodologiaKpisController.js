const db = require("../lib/db");

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
    const tenantWhereJP = req.empresaId ? "AND jp.empresa_id = ?" : "";
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
    const [coberturaRows] = await db.query(
      `
      SELECT jp.cliente, COUNT(*) AS pessoas
      FROM jornada_participantes jp
      WHERE 1=1 ${tenantWhereJP}
      GROUP BY jp.cliente
      ORDER BY pessoas DESC
      `,
      params
    );
    const coberturaPorCliente = coberturaRows.map((r) => ({
      cliente: r.cliente || "Sem cliente",
      pessoas: Number(r.pessoas),
    }));
    const totalCobertura = coberturaPorCliente.reduce((soma, c) => soma + c.pessoas, 0);

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

module.exports = { obterKpis };
