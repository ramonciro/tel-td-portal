"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch, apiDownload } from "../../services/api";
import { formatDateBR } from "../../lib/date";
import { colors, chart } from "../../lib/theme";
import { ContadorAnimado, Donut, BarraHorizontal } from "../../components/Charts";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function formatDate(value) {
  return formatDateBR(value, "-");
}

function normalizeStatus(status) {
  const key = String(status || "").toLowerCase();
  if (key.includes("concl")) return "Concluída";
  if (key.includes("andamento")) return "Em andamento";
  if (key.includes("cancel")) return "Cancelada";
  return "Planejada";
}

function parseModalidade(descricao, modalidade) {
  if (modalidade === "presencial") return "Presencial";
  if (modalidade === "online") return "Online";
  const text = String(descricao || "");
  const match = text.match(/\[modalidade:([^\]]+)\]/i);
  const parsed = String(match?.[1] || "").trim().toLowerCase();
  if (parsed === "presencial") return "Presencial";
  if (parsed === "online") return "Online";
  return "-";
}

function getBadgeStyleByTax(value) {
  const number = Number(value || 0);
  if (number >= 90) return { background: colors.successLight, color: colors.successText, border: "1px solid #86efac" };
  if (number >= 80) return { background: colors.warningLight, color: colors.warningText, border: "1px solid #fcd34d" };
  return { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fca5a5" };
}

// Mesmos limiares de getBadgeStyleByTax, só que como cor sólida — usado nos
// rankings de barra (BarraHorizontal) de "Saúde por cliente"/"Instrutores no
// recorte", onde presença é um indicador de saúde (status), não uma métrica
// neutra de magnitude — por isso cor por item é intencional aqui.
function corPorPresenca(value) {
  const number = Number(value || 0);
  if (number >= 90) return colors.success;
  if (number >= 80) return colors.warning;
  return colors.danger;
}

function buildFarois(kpis = {}, oceano = {}, presencaPorCliente = [], ultimasTurmas = [], desempenhoResumo = null) {
  const items = [];

  if (Number(kpis.pendentes || 0) > 0) {
    items.push({
      title: "Chamada pedindo fechamento",
      text: `${fmt(kpis.pendentes)} registro(s) ainda precisam ser concluídos para a leitura do dia ficar mais fiel.`,
      tone: Number(kpis.pendentes || 0) > 15 ? "danger" : "attention",
    });
  }

  const clienteMaisSensivel = [...presencaPorCliente].sort((a, b) => Number(a.taxa_presenca || 0) - Number(b.taxa_presenca || 0))[0];
  if (clienteMaisSensivel && Number(clienteMaisSensivel.total_turmas || 0) > 0) {
    items.push({
      title: "Cliente que merece olhar primeiro",
      text: `${clienteMaisSensivel.cliente} está com ${fmt(clienteMaisSensivel.taxa_presenca)}% de presença no recorte atual.`,
      tone: Number(clienteMaisSensivel.taxa_presenca || 0) >= 85 ? "ok" : "attention",
    });
  }

  const turmaPendente = ultimasTurmas.find((item) => Number(item.pendentes || 0) > 0);
  if (turmaPendente) {
    items.push({
      title: "Turma com pendência aberta",
      text: `${turmaPendente.tema || "Turma sem título"} ainda tem ${fmt(turmaPendente.pendentes)} pendência(s) para fechamento.`,
      tone: Number(turmaPendente.pendentes || 0) > 5 ? "danger" : "attention",
    });
  }

  if (Number(oceano.jornadas || 0) > 0) {
    items.push({
      title: "Oceano em movimento",
      text: `${fmt(oceano.jornadas)} jornada(s), ${fmt(oceano.acoes)} ação(ões) e ${fmt(oceano.tripulacao)} pessoa(s) já estão no fluxo do desenvolvimento.`,
      tone: "ok",
    });
  }

  const foraFaixa = desempenhoResumo?.fora_faixa_saudavel || [];
  if (foraFaixa.length > 0) {
    const algumCritico = foraFaixa.some((i) => i.status === "critico");
    items.push({
      title: "Instrutores fora da faixa saudável",
      text: `${fmt(foraFaixa.length)} instrutor(es) com frequência ou NPS fora da faixa saudável este mês (${foraFaixa.slice(0, 2).map((i) => i.instrutor).join(", ")}${foraFaixa.length > 2 ? "..." : ""}).`,
      tone: algumCritico ? "danger" : "attention",
    });
  } else if (desempenhoResumo && Number(desempenhoResumo.instrutores_considerados || 0) > 0) {
    items.push({
      title: "Instrutores na faixa saudável",
      text: `Os ${fmt(desempenhoResumo.instrutores_considerados)} instrutor(es) com atividade este mês estão dentro da faixa saudável de frequência e NPS.`,
      tone: "ok",
    });
  }

  if (!items.length) {
    items.push({
      title: "Leitura tranquila",
      text: "O recorte não está apontando nenhum desvio mais sensível agora. Vale usar os filtros para aprofundar a análise.",
      tone: "ok",
    });
  }

  return items.slice(0, 4);
}

function buildNarrativa(kpis = {}, filters = {}) {
  const partes = [];
  const recortes = [];
  if (filters.cliente) recortes.push(`cliente ${filters.cliente}`);
  if (filters.instrutor) recortes.push(`instrutor ${filters.instrutor}`);
  if (filters.supervisor) recortes.push(`supervisor ${filters.supervisor}`);
  if (filters.status) recortes.push(`status ${normalizeStatus(filters.status)}`);
  if (filters.modalidade) recortes.push(`modalidade ${filters.modalidade === "online" ? "Online" : "Presencial"}`);

  if (recortes.length) {
    partes.push(`Você está olhando um recorte por ${recortes.join(", ")}.`);
  } else {
    partes.push("Você está olhando a visão consolidada da operação.");
  }

  partes.push(`No período filtrado, a base reúne ${fmt(kpis.treinamentos || 0)} turma(s) e ${fmt(kpis.treinados || 0)} lançamento(s) de chamada.`);

  if (Number(kpis.taxa_presenca || 0) > 0) {
    partes.push(`A presença está em ${fmt(kpis.taxa_presenca)}%, com ${fmt(kpis.presentes || 0)} presença(s) confirmada(s).`);
  } else {
    partes.push("Ainda não há base suficiente para leitura de presença neste recorte.");
  }

  if (Number(kpis.pendentes || 0) > 0) {
    partes.push(`Ainda há ${fmt(kpis.pendentes || 0)} pendência(s) de chamada em aberto, então esse recorte pode mudar ao longo do dia.`);
  } else {
    partes.push("A chamada do período está bem encaminhada, sem pendência relevante.");
  }

  return partes;
}

export default function DashboardPage() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState(null); // { turma, itens, loading }
  const [alertas, setAlertas] = useState({ turmasCriticas: [], necessidadesAtrasadas: [], chamadasPendentes: [] });
  const [capacidade, setCapacidade] = useState(null);
  const [capacidadeAlertas, setCapacidadeAlertas] = useState([]);
  const [capacidadeRanking, setCapacidadeRanking] = useState([]);
  const [capacidadeErro, setCapacidadeErro] = useState("");
  const [desempenhoResumo, setDesempenhoResumo] = useState(null);
  const [desempenhoErro, setDesempenhoErro] = useState("");
  const [filters, setFilters] = useState({
    cliente: "",
    instrutor: "",
    supervisor: "",
    status: "",
    modalidade: "",
    data_inicio: "",
    data_fim: "",
  });

  // alertas: carregados uma vez, independente dos filtros do KPI abaixo —
  // "o que precisa de atenção hoje" não deveria mudar conforme você filtra
  // a tabela.
  useEffect(() => {
    async function carregarAlertas() {
      try {
        const [resumoData, necessidadesData] = await Promise.all([
          apiFetch("/presenca-resumo").catch(() => null),
          apiFetch("/necessidades").catch(() => null),
        ]);
        const turmas = Array.isArray(resumoData?.itens) ? resumoData.itens : [];
        const necessidades = Array.isArray(necessidadesData?.itens) ? necessidadesData.itens : [];

        setAlertas({
          turmasCriticas: turmas.filter((t) => t.classificacao === "Crítico" && t.status_turma !== "Sem treinandos"),
          necessidadesAtrasadas: necessidades.filter((n) => n.status_calculado === "atrasada"),
          chamadasPendentes: turmas.filter((t) => t.status_turma === "Chamada pendente"),
        });
      } catch {
        // alertas são um complemento — se falhar, o resto do dashboard segue normal
      }
    }
    carregarAlertas();
  }, []);

  // Capacidade / CH por instrutor — mesmo motor automático da página
  // /capacidade (turma + cronograma, sem lançamento manual). Aqui é o resumo
  // do mês corrente para o coordenador ver de cara no Dashboard; o detalhe
  // completo (ranking, aderência por tema, distribuição por operação, meses
  // anteriores) continua em "CH por Instrutor". Reaproveita o filtro de
  // Cliente já existente no painel para não duplicar controles na tela.
  useEffect(() => {
    async function carregarCapacidade() {
      try {
        setCapacidadeErro("");
        const qs = filters.cliente ? `?cliente=${encodeURIComponent(filters.cliente)}` : "";
        const [painelData, alertasData, rankingData] = await Promise.all([
          apiFetch(`/capacidade/painel${qs}`),
          apiFetch(`/capacidade/alertas`),
          apiFetch(`/capacidade/ranking${qs}${qs ? "&" : "?"}meses=1`),
        ]);
        setCapacidade(painelData || null);
        setCapacidadeAlertas(Array.isArray(alertasData?.itens) ? alertasData.itens : []);
        setCapacidadeRanking(Array.isArray(rankingData?.itens) ? rankingData.itens : []);
      } catch (error) {
        setCapacidade(null);
        setCapacidadeErro(error.message || "Erro ao carregar capacidade da equipe.");
      }
    }
    carregarCapacidade();
  }, [filters.cliente]);

  // Resumo executivo do desempenho de instrutor (frequência/NPS do mês
  // corrente) — item 5 da visão de universidade corporativa (ver
  // claude/visao-plataforma-educativa-instrutor-2026-09.md no projeto).
  // Mesmo espírito da Capacidade acima: carrega uma vez, não depende dos
  // filtros do painel — é sempre "o mês inteiro, o time todo".
  useEffect(() => {
    async function carregarDesempenho() {
      try {
        setDesempenhoErro("");
        const resumo = await apiFetch("/desempenho-instrutor/resumo-executivo");
        setDesempenhoResumo(resumo || null);
      } catch (error) {
        setDesempenhoResumo(null);
        setDesempenhoErro(error.message || "Erro ao carregar o resumo de desempenho dos instrutores.");
      }
    }
    carregarDesempenho();
  }, []);

  // Cascata de entrada — mesmo padrão já usado em /inicio e /rs. Liga só
  // depois que o KPI principal termina de carregar pela primeira vez, e não
  // religa a cada troca de filtro (senão a tela "piscaria" a cada clique).
  const [revelado, setRevelado] = useState(false);
  useEffect(() => {
    if (loading) return;
    const id = requestAnimationFrame(() => setRevelado(true));
    return () => cancelAnimationFrame(id);
  }, [loading]);

  useEffect(() => {
    async function carregar() {
      try {
        setErro("");
        setLoading(true);
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.set(key, value);
        });
        const path = params.toString() ? `/dashboard/treinamentos?${params.toString()}` : "/dashboard/treinamentos";
        const response = await apiFetch(path);
        setDados(response || null);
      } catch (error) {
        setErro(error.message || "Erro ao carregar dashboard.");
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, [filters]);

  const [exportando, setExportando] = useState(false);

  async function handleExportar() {
    try {
      setExportando(true);
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const path = params.toString() ? `/dashboard/treinamentos/exportar?${params.toString()}` : "/dashboard/treinamentos/exportar";
      await apiDownload(path, "dashboard-turmas.xlsx");
    } catch (error) {
      setErro(error.message || "Erro ao exportar turmas.");
    } finally {
      setExportando(false);
    }
  }

  async function abrirDrillDown(item) {
    setDrillDown({ turma: item, itens: [], loading: true });
    try {
      const resposta = await apiFetch(`/frequencia-individual?treinamento_id=${item.id}`);
      setDrillDown({ turma: item, itens: Array.isArray(resposta?.itens) ? resposta.itens : [], loading: false });
    } catch (error) {
      setDrillDown({ turma: item, itens: [], loading: false, erro: error.message });
    }
  }

  const kpis = dados?.kpis || {};
  const filtrosApi = dados?.filtros || {};
  const presencaPorCliente = dados?.presenca_por_cliente || [];
  const rankingInstrutores = dados?.ranking_instrutores || [];
  const ultimasTurmas = dados?.ultimas_turmas || [];
  const oceano = dados?.oceano || {};

  const farois = useMemo(
    () => buildFarois(kpis, oceano, presencaPorCliente, ultimasTurmas, desempenhoResumo),
    [kpis, oceano, presencaPorCliente, ultimasTurmas, desempenhoResumo]
  );
  const narrativa = useMemo(() => buildNarrativa(kpis, filters), [kpis, filters]);

  const clienteOptions = Array.isArray(filtrosApi.clientes) ? filtrosApi.clientes : [];
  const instrutorOptions = Array.isArray(filtrosApi.instrutores) ? filtrosApi.instrutores : [];
  const supervisorOptions = Array.isArray(filtrosApi.supervisores) ? filtrosApi.supervisores : [];
  const statusOptions = Array.isArray(filtrosApi.status) ? filtrosApi.status : [];
  const modalidadeOptions = Array.isArray(filtrosApi.modalidades) ? filtrosApi.modalidades : [];
  const nps = dados?.nps || {};

  return (
    <PortalShell>
      {/* Cascata de entrada — mesmo padrão de /inicio e /rs. */}
      <style>{`
        @keyframes dashCascade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .dash-cascade { opacity: 0; }
        .dash-cascade.dash-play { animation: dashCascade .5s cubic-bezier(.16,1,.3,1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .dash-cascade, .dash-cascade.dash-play { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      {loading ? (
        <div style={loadingBox}>Carregando o dashboard...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          <PageHero
            eyebrow="Painel analítico"
            title="Filtre, compare e encontre com mais clareza onde a gestão precisa agir."
            subtitle="Aqui a ideia é sair da visão geral."
            stats={[
              { label: "turmas no recorte", value: fmt(kpis.treinamentos || 0) },
              { label: "presença consolidada", value: `${fmt(kpis.taxa_presenca || 0)}%` },
              { label: "execução do recorte", value: `${fmt(kpis.taxa_execucao_diaria || 0)}%` },
            ]}
          />

          <div className={`dash-cascade ${revelado ? "dash-play" : ""}`}>
            <AlertasDashboard alertas={alertas} onAbrirTurma={abrirDrillDown} />
          </div>

          <SectionCard
            title="Filtros do painel"
            subtitle="Escolha o recorte que faz mais sentido para a sua leitura e refine a análise sem perder contexto."
            action={
              <button
                style={buttonSecondary}
                onClick={() =>
                  setFilters({
                    cliente: "",
                    instrutor: "",
                    supervisor: "",
                    status: "",
                    modalidade: "",
                    data_inicio: "",
                    data_fim: "",
                  })
                }
              >
                Limpar filtros
              </button>
            }
          >
            <div style={filtersGrid}>
              <label style={fieldLabel}>
                Cliente
                <select style={inputStyle} value={filters.cliente} onChange={(e) => setFilters((prev) => ({ ...prev, cliente: e.target.value }))}>
                  <option value="">Todos</option>
                  {clienteOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label style={fieldLabel}>
                Instrutor
                <select style={inputStyle} value={filters.instrutor} onChange={(e) => setFilters((prev) => ({ ...prev, instrutor: e.target.value }))}>
                  <option value="">Todos</option>
                  {instrutorOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label style={fieldLabel}>
                Supervisor
                <select style={inputStyle} value={filters.supervisor} onChange={(e) => setFilters((prev) => ({ ...prev, supervisor: e.target.value }))}>
                  <option value="">Todos</option>
                  {supervisorOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label style={fieldLabel}>
                Status
                <select style={inputStyle} value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="">Todos</option>
                  {statusOptions.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label style={fieldLabel}>
                Modalidade
                <select style={inputStyle} value={filters.modalidade} onChange={(e) => setFilters((prev) => ({ ...prev, modalidade: e.target.value }))}>
                  <option value="">Todas</option>
                  {modalidadeOptions.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label style={fieldLabel}>
                De
                <input type="date" style={inputStyle} value={filters.data_inicio} onChange={(e) => setFilters((prev) => ({ ...prev, data_inicio: e.target.value }))} />
              </label>

              <label style={fieldLabel}>
                Até
                <input type="date" style={inputStyle} value={filters.data_fim} onChange={(e) => setFilters((prev) => ({ ...prev, data_fim: e.target.value }))} />
              </label>
            </div>
          </SectionCard>

          <div className={`dash-cascade ${revelado ? "dash-play" : ""}`} style={kpiGrid}>
            <StatCard title="Turmas" value={<ContadorAnimado valor={kpis.treinamentos} revelado={revelado} />} subtitle="Base no recorte" accent={chart.blue} />
            <StatCard title="Previstos" value={<ContadorAnimado valor={kpis.participantes_previstos} revelado={revelado} />} subtitle="Capacidade cadastrada" accent={chart.cyan} />
            <StatCard title="Confirmados" value={<ContadorAnimado valor={kpis.treinados} revelado={revelado} />} subtitle="Com chamada registrada" accent={colors.primary} />
            <StatCard title="Presença" value={<ContadorAnimado valor={kpis.taxa_presenca} sufixo="%" revelado={revelado} />} subtitle="Consolidado" accent={colors.success} />
            <StatCard title="Pendências" value={<ContadorAnimado valor={kpis.pendentes} revelado={revelado} />} subtitle="Ainda em aberto" accent={colors.warning} />
            <StatCard title="Execução" value={<ContadorAnimado valor={kpis.taxa_execucao_diaria} sufixo="%" revelado={revelado} />} subtitle="Base já registrada" accent={chart.purple} />
            <StatCard title="Chamada concluída" value={<ContadorAnimado valor={kpis.taxa_conclusao_chamada} sufixo="%" revelado={revelado} />} subtitle="Dias de chamada já registrados" accent={chart.teal} />
            <StatCard title="Gap de participantes" value={<ContadorAnimado valor={kpis.gap_previstos_vs_treinados} revelado={revelado} />} subtitle="Previstos ainda sem chamada" accent={colors.warning} />
            {/* decimais=1: media_nps/media_qualidade/media_prova vêm do backend
               como ROUND(AVG(...), 1) — sem isso a nota terminaria a animação
               arredondada pra inteiro (8,5 virando "9"). */}
            {nps.total_avaliacoes > 0 && (
              <>
                <StatCard title="NPS médio" value={nps.media_nps > 0 ? <ContadorAnimado valor={nps.media_nps} decimais={1} revelado={revelado} /> : "—"} subtitle={`${fmt(nps.total_avaliacoes)} avaliação(ões)`} accent={chart.pink} />
                <StatCard title="Qualidade" value={nps.media_qualidade > 0 ? <ContadorAnimado valor={nps.media_qualidade} decimais={1} revelado={revelado} /> : "—"} subtitle="Nota média qualidade" accent={chart.orange} />
                {nps.media_prova > 0 && (
                  <StatCard title="Prova" value={<ContadorAnimado valor={nps.media_prova} decimais={1} revelado={revelado} />} subtitle="Nota média prova" accent={chart.teal} />
                )}
              </>
            )}
          </div>

          <SectionCard
            title="Capacidade da equipe (CH por instrutor)"
            subtitle={`Calculado automaticamente a partir das turmas e do cronograma já registrados${filters.cliente ? ` — recorte: ${filters.cliente}` : " — todas as operações"}. Nenhum lançamento manual extra para o time.`}
            action={<a href="/capacidade" style={linkBotao}>Ver detalhamento completo →</a>}
          >
            {capacidadeErro ? (
              <div style={emptyState}>{capacidadeErro}</div>
            ) : !capacidade ? (
              <div style={emptyState}>Carregando capacidade da equipe...</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <div className={`dash-cascade ${revelado ? "dash-play" : ""}`} style={kpiGrid}>
                  {/* decimais=2 nas horas e 1 na ocupação: mesmos campos de
                     /capacidade (hc_*_periodo e capacidade_nominal_periodo saem
                     com até 2 casas, ocupacao_time_pct com 1) — sem isso o
                     contador arredondava o valor exibido, não só a forma. */}
                  <StatCard
                    title="CH programada (período)"
                    value={<ContadorAnimado valor={capacidade.indicadores?.hc_programado_periodo} decimais={2} sufixo="h" revelado={revelado} />}
                    subtitle="Turmas + cronograma planejados"
                    accent={chart.cyan}
                  />
                  <StatCard
                    title="CH realizada (período)"
                    value={<ContadorAnimado valor={capacidade.indicadores?.hc_realizado_periodo} decimais={2} sufixo="h" revelado={revelado} />}
                    subtitle={capacidade.indicadores?.aderencia_geral_pct != null ? `Aderência ${fmt(capacidade.indicadores.aderencia_geral_pct)}%` : "Sem base de comparação"}
                    accent={colors.primary}
                  />
                  <StatCard
                    title="Ocupação do time"
                    value={<ContadorAnimado valor={capacidade.indicadores?.ocupacao_time_pct} decimais={1} sufixo="%" revelado={revelado} />}
                    subtitle="Realizado vs. capacidade nominal"
                    accent={colors.success}
                  />
                  <StatCard
                    title="Capacidade nominal (time)"
                    value={<ContadorAnimado valor={capacidade.indicadores?.capacidade_nominal_periodo} decimais={2} sufixo="h" revelado={revelado} />}
                    subtitle="Dias úteis × regra padrão"
                    accent={chart.orange}
                  />
                </div>

                {capacidadeAlertas.length > 0 ? (
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
                      Instrutores fora da faixa saudável este mês
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                      {capacidadeAlertas.slice(0, 6).map((item) => (
                        <a key={item.instrutor} href="/capacidade" style={{ ...listRow, textDecoration: "none" }}>
                          <div>
                            <div style={rowTitle}>{item.instrutor}</div>
                            <div style={rowMeta}>{item.status === "sobrecarga" ? "Sobrecarga" : item.status === "atencao" ? "Atenção" : "Ociosidade"} no mês corrente</div>
                          </div>
                          <div style={{ ...pill, ...getBadgeStyleByTax(item.ocupacao_pct) }}>{item.status_emoji} {fmt(item.ocupacao_pct)}%</div>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ borderRadius: 16, border: `1px solid ${colors.border}`, background: colors.successLight, padding: "12px 16px", fontSize: 13, color: colors.successText, fontWeight: 600 }}>
                    ✅ Todos os instrutores estão na faixa saudável de ocupação este mês.
                  </div>
                )}

                {capacidadeRanking.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
                      Top instrutores por CH realizada (mês corrente)
                    </div>
                    <BarraHorizontal
                      dados={capacidadeRanking}
                      labelKey="instrutor"
                      valueKey="horas_realizadas"
                      sufixo="h"
                      cor={colors.primary}
                      maxItens={3}
                      revelado={revelado}
                      subtitulo={(d) => `${fmt(d.pct_capacidade)}% da capacidade do mês`}
                    />
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Desempenho dos instrutores (frequência e NPS)"
            subtitle="Índice geral, frequência e NPS do mês corrente — o mesmo scorecard que cada instrutor já vê em 'Meu Desempenho'."
            action={<a href="/capacidade?aba=instrutor" style={linkBotao}>Ver scorecard completo →</a>}
          >
            {desempenhoErro ? (
              <div style={emptyState}>{desempenhoErro}</div>
            ) : !desempenhoResumo ? (
              <div style={emptyState}>Carregando desempenho dos instrutores...</div>
            ) : desempenhoResumo.instrutores_considerados === 0 ? (
              <div style={emptyState}>Nenhum instrutor com atividade registrada este mês ainda.</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <div className={`dash-cascade ${revelado ? "dash-play" : ""}`} style={kpiGrid}>
                  <StatCard title="Instrutores considerados" value={<ContadorAnimado valor={desempenhoResumo.instrutores_considerados} revelado={revelado} />} subtitle="Com atividade no mês" accent={chart.cyan} />
                  {/* decimais=1: estas três médias vêm do backend já com 1 casa
                     decimal (ex.: índice 87,3 · NPS -14,5) — sem isso o contador
                     arredondava pra inteiro ao terminar de animar, trocando o
                     dado exibido, não só a forma (achado ao revisar Indicadores/
                     Capacidade, que tinham o mesmo padrão de dado). */}
                  <StatCard title="Índice geral médio" value={desempenhoResumo.indice_geral_medio != null ? <ContadorAnimado valor={desempenhoResumo.indice_geral_medio} decimais={1} revelado={revelado} /> : "—"} subtitle="90% frequência + 10% NPS" accent={colors.primary} />
                  <StatCard title="Frequência média" value={<ContadorAnimado valor={desempenhoResumo.frequencia_media} decimais={1} sufixo="%" revelado={revelado} />} subtitle="Média do time" accent={colors.success} />
                  <StatCard title="NPS médio" value={desempenhoResumo.nps_media != null ? <ContadorAnimado valor={desempenhoResumo.nps_media} decimais={1} revelado={revelado} /> : "—"} subtitle="Média do time" accent={chart.pink} />
                </div>

                {desempenhoResumo.fora_faixa_saudavel.length > 0 ? (
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
                      Instrutores fora da faixa saudável este mês
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                      {desempenhoResumo.fora_faixa_saudavel.slice(0, 6).map((item) => (
                        <a key={item.instrutor} href="/capacidade?aba=instrutor" style={{ ...listRow, textDecoration: "none" }}>
                          <div>
                            <div style={rowTitle}>{item.instrutor}</div>
                            <div style={rowMeta}>{item.motivo}</div>
                          </div>
                          <div style={{ ...pill, ...(item.status === "critico" ? { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fca5a5" } : { background: colors.warningLight, color: colors.warningText, border: "1px solid #fcd34d" }) }}>
                            {item.status_emoji}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ borderRadius: 16, border: `1px solid ${colors.border}`, background: colors.successLight, padding: "12px 16px", fontSize: 13, color: colors.successText, fontWeight: 600 }}>
                    ✅ Todos os instrutores com atividade este mês estão na faixa saudável de frequência e NPS.
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <div className={`dash-cascade ${revelado ? "dash-play" : ""}`} style={{ ...twoColumns, animationDelay: ".05s" }}>
            <SectionCard title="Leitura gerencial" subtitle="Sinais que te ajudam a interpretar o cenário com mais rapidez.">
              <div style={summaryList}>
                {narrativa.map((item) => (
                  <div key={item} style={summaryItem}>{item}</div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Faróis acionáveis" subtitle="O painel resume o que mais vale sua energia agora.">
              <div style={farolList}>
                {farois.map((item) => (
                  <div key={item.title} style={farolItem(item.tone)}>
                    <div style={farolTitle}>{item.title}</div>
                    <div style={farolText}>{item.text}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div className={`dash-cascade ${revelado ? "dash-play" : ""}`} style={{ ...twoColumns, animationDelay: ".1s" }}>
            <SectionCard title="Saúde por cliente" subtitle="Ajuda a comparar rapidamente onde a operação está mais firme e onde precisa de suporte.">
              {presencaPorCliente.length ? (
                <BarraHorizontal
                  dados={presencaPorCliente}
                  labelKey="cliente"
                  valueKey="taxa_presenca"
                  sufixo="%"
                  maxValor={100}
                  maxItens={10}
                  corPorItem={(d) => corPorPresenca(d.taxa_presenca)}
                  subtitulo={(d) => `${fmt(d.total_treinados)} base · ${fmt(d.presentes)} presentes · ${fmt(d.pendentes)} pendentes`}
                  revelado={revelado}
                />
              ) : <div style={emptyState}>Nenhum dado por cliente apareceu nesse recorte.</div>}
            </SectionCard>

            <SectionCard title="Instrutores no recorte" subtitle="Uma leitura simples de produtividade e presença.">
              {rankingInstrutores.length ? (
                <BarraHorizontal
                  dados={rankingInstrutores}
                  labelKey="instrutor"
                  valueKey="taxa_presenca"
                  sufixo="%"
                  maxValor={100}
                  maxItens={10}
                  corPorItem={(d) => corPorPresenca(d.taxa_presenca)}
                  subtitulo={(d) => `${fmt(d.total_turmas)} turma(s) · ${fmt(d.total_treinados)} base · ${fmt(d.presentes)} presentes`}
                  revelado={revelado}
                />
              ) : <div style={emptyState}>Nenhum dado de instrutor apareceu nesse recorte.</div>}
            </SectionCard>
          </div>

          <div className={`dash-cascade ${revelado ? "dash-play" : ""}`} style={{ ...twoColumns, animationDelay: ".15s" }}>
            <SectionCard title="Oceano em resumo" subtitle="Uma leitura curta para conectar o dashboard ao fluxo de desenvolvimento.">
              <div style={oceanoGrid}>
                <MiniStat label="Jornadas" value={fmt(oceano.jornadas || 0)} />
                <MiniStat label="Ações" value={fmt(oceano.acoes || 0)} />
                <MiniStat label="Sustentações" value={fmt(oceano.sustentacoes || 0)} />
                <MiniStat label="Tripulação" value={fmt(oceano.tripulacao || 0)} />
              </div>
            </SectionCard>

            <SectionCard title="Progresso da tripulação" subtitle="Ajuda a enxergar se o oceano está só bonito ou realmente em movimento.">
              {(() => {
                const prog = oceano.progresso_tripulacao || {};
                const fatias = [
                  { label: "Em percurso", valor: Number(prog.em_percurso || 0), cor: chart.blue },
                  { label: "Concluídos", valor: Number(prog.concluido || 0), cor: colors.success },
                  { label: "Em sustentação", valor: Number(prog.em_sustentacao || 0), cor: chart.purple },
                ];
                return <Donut fatias={fatias} total={Number(oceano.tripulacao || 0)} revelado={revelado} />;
              })()}
            </SectionCard>
          </div>

          <SectionCard
            title="Turmas recentes"
            subtitle="As últimas turmas. O Excel exporta o recorte completo, não só as exibidas aqui."
            action={
              <button style={buttonSecondary} onClick={handleExportar} disabled={exportando}>
                {exportando ? "Exportando..." : "Exportar Excel"}
              </button>
            }
          >
            {ultimasTurmas.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Turma</th>
                      <th style={th}>Cliente</th>
                      <th style={th}>Instrutor</th>
                      <th style={th}>Modalidade</th>
                      <th style={th}>Status</th>
                      <th style={th}>Data</th>
                      <th style={th}>Base</th>
                      <th style={th}>Presença</th>
                      <th style={th}>Presentes</th>
                      <th style={th}>Pendentes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ultimasTurmas.map((item) => (
                      <tr key={item.id} onClick={() => abrirDrillDown(item)} style={{ cursor: "pointer" }} title="Clique para ver a frequência por pessoa">
                        <td style={td}>{item.tema || "-"}</td>
                        <td style={td}>{item.cliente || "-"}</td>
                        <td style={td}>{item.instrutor || "-"}</td>
                        <td style={td}>{parseModalidade(item.descricao, item.modalidade)}</td>
                        <td style={td}>{normalizeStatus(item.status_canonico || item.status)}</td>
                        <td style={td}>{formatDate(item.data || item.data_inicio)}</td>
                        <td style={td}>{fmt(item.base_ativa || item.treinados || 0)}</td>
                        <td style={td}>
                          {item.taxa_presenca > 0
                            ? <span style={{ ...getBadgeStyleByTax(item.taxa_presenca), padding: "3px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{item.taxa_presenca}%</span>
                            : <span style={{ color: "#94a3b8" }}>—</span>}
                        </td>
                        <td style={td}>{fmt(item.presentes || 0)}</td>
                        <td style={td}>{fmt(item.pendentes || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={emptyState}>Não apareceu nenhuma turma nesse recorte.</div>
            )}
          </SectionCard>
        </div>
      )}

      {drillDown && (
        <div
          onClick={() => setDrillDown(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, padding: 22, maxWidth: 520, width: "100%", maxHeight: "80vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Frequência por pessoa</p>
                <p style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{drillDown.turma?.tema || "Turma"}</p>
              </div>
              <button onClick={() => setDrillDown(null)} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: "#64748b" }}>✕</button>
            </div>

            {drillDown.loading && <p style={{ fontSize: 13, color: "#64748b" }}>Carregando...</p>}
            {drillDown.erro && <p style={{ fontSize: 13, color: "#b91c1c" }}>{drillDown.erro}</p>}
            {!drillDown.loading && !drillDown.erro && drillDown.itens.length === 0 && (
              <p style={{ fontSize: 13, color: "#94a3b8" }}>Sem dados de frequência individual para esta turma ainda.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {drillDown.itens.map((pessoa, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, border: "1px solid #eef2f7" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{pessoa.treinando_nome}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8" }}>{pessoa.presentes} presentes · {pessoa.ausentes} ausentes · {pessoa.justificados} justificados</p>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "4px 10px",
                    background: pessoa.frequencia_percentual >= 90 ? colors.successLight : pessoa.frequencia_percentual >= 75 ? colors.warningLight : colors.dangerLight,
                    color: pessoa.frequencia_percentual >= 90 ? colors.successText : pessoa.frequencia_percentual >= 75 ? colors.warningText : colors.dangerText,
                  }}>
                    {pessoa.frequencia_percentual}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={miniStatCard}>
      <div style={miniStatLabel}>{label}</div>
      <div style={miniStatValue}>{value}</div>
    </div>
  );
}

const loadingBox = { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, color: "#475569", fontWeight: 700 };
const errorBox = { background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 18, padding: 16, fontWeight: 700 };
const heroWrap = { display: "grid", gridTemplateColumns: "1.45fr .9fr", gap: 16 };
const heroMain = { background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)", borderRadius: 24, padding: 24, color: "#ffffff", boxShadow: "0 14px 30px rgba(29, 78, 216, 0.18)" };
const heroBadge = { display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,.14)", fontSize: 12, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase" };
const heroTitle = { fontSize: 30, lineHeight: 1.15, margin: "12px 0 10px" };
const heroText = { color: "#dbeafe", lineHeight: 1.7, margin: 0 };
const heroMiniGrid = { display: "grid", gap: 12 };
const heroMiniCard = { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18, display: "grid", gap: 4, boxShadow: "0 10px 24px rgba(15,23,42,.05)" };
const filtersGrid = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 };
const fieldLabel = { display: "grid", gap: 6, color: "#334155", fontSize: 13, fontWeight: 700 };
const inputStyle = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 12, padding: "10px 12px", background: "#fff", color: "#0f172a" };
const buttonSecondary = { border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", borderRadius: 12, padding: "10px 14px", fontWeight: 700, cursor: "pointer" };
const linkBotao = { border: "1px solid #cbd5e1", background: "#fff", color: "#1d4ed8", borderRadius: 12, padding: "10px 14px", fontWeight: 700, textDecoration: "none", fontSize: 13, whiteSpace: "nowrap" };
const kpiGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const twoColumns = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };
const summaryList = { display: "grid", gap: 10 };
const summaryItem = { padding: "14px 16px", borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#334155", lineHeight: 1.6 };
const farolList = { display: "grid", gap: 10 };
function farolItem(tone) {
  const map = {
    ok: { background: "#f0fdf4", border: "1px solid #bbf7d0" },
    attention: { background: "#fffbeb", border: "1px solid #fde68a" },
    danger: { background: "#fff1f2", border: "1px solid #fecaca" },
  };
  return { padding: "14px 16px", borderRadius: 16, ...(map[tone] || map.ok) };
}
const farolTitle = { fontWeight: 900, color: "#0f172a", marginBottom: 4 };
const farolText = { color: "#475569", lineHeight: 1.55 };
const listGrid = { display: "grid", gap: 10 };
const listRow = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16, border: "1px solid #e2e8f0", background: "#fff" };
const rowTitle = { fontWeight: 900, color: "#0f172a" };
const rowMeta = { marginTop: 4, color: "#64748b", fontSize: 13, lineHeight: 1.45 };
const pill = { display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "6px 10px", borderRadius: 999, fontWeight: 800, fontSize: 12, whiteSpace: "nowrap" };
const oceanoGrid = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 };
const miniStatCard = { borderRadius: 16, border: "1px solid #e2e8f0", background: "#fff", padding: 14 };
const miniStatLabel = { fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 800 };
const miniStatValue = { marginTop: 6, fontSize: 22, fontWeight: 900, color: "#0f172a" };
const table = { width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 860 };
const th = { textAlign: "left", padding: "12px 14px", fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "#64748b", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" };
const td = { padding: "12px 14px", borderBottom: "1px solid #eef2f7", color: "#334155", fontSize: 14 };
const emptyState = { padding: 18, borderRadius: 16, background: "#f8fafc", border: "1px dashed #cbd5e1", color: "#64748b" };

// ---------------------------------------------------------------------------
// Bloco de alertas — "o que precisa de atenção hoje", antes de qualquer
// filtro. A ideia é que o Dashboard avise, em vez de esperar você perguntar.
// As 3 fontes já existiam espalhadas no sistema (presenca-resumo e
// necessidades) — isso só junta num único lugar de leitura rápida.
// ---------------------------------------------------------------------------
function AlertasDashboard({ alertas, onAbrirTurma }) {
  const cards = [
    {
      key: "criticas",
      label: "Turmas críticas",
      cor: colors.danger,
      corFundo: colors.dangerLight,
      itens: alertas.turmasCriticas,
      render: (t) => (
        <span key={t.id} onClick={() => onAbrirTurma(t)} style={alertaItemLink}>
          {t.tema} · {t.cliente} — {t.taxa_presenca}%
        </span>
      ),
      href: null,
    },
    {
      key: "pendentes",
      label: "Chamadas pendentes",
      cor: colors.warning,
      corFundo: colors.warningLight,
      itens: alertas.chamadasPendentes,
      render: (t) => (
        <a key={t.id} href="/presencas" style={alertaItemLink}>
          {t.tema} · {t.cliente}
        </a>
      ),
      href: "/presencas",
    },
    {
      key: "necessidades",
      label: "Necessidades atrasadas",
      cor: chart.purple,
      corFundo: "#EDE9FE",
      itens: alertas.necessidadesAtrasadas,
      render: (n) => (
        <a key={n.id} href="/necessidades" style={alertaItemLink}>
          {n.tema} · {n.cliente}
        </a>
      ),
      href: "/necessidades",
    },
  ];

  const algumAlerta = cards.some((c) => c.itens.length > 0);

  if (!algumAlerta) {
    return (
      <div style={{ borderRadius: 16, border: `1px solid ${colors.border}`, background: colors.successLight, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18 }}>✅</span>
        <span style={{ fontSize: 13.5, color: colors.successText, fontWeight: 600 }}>Nada precisando de atenção imediata agora — todos os indicadores estão dentro do esperado.</span>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
      {cards.filter((c) => c.itens.length > 0).map((c) => (
        <div key={c.key} style={{ borderRadius: 16, border: `1px solid ${colors.border}`, borderLeft: `4px solid ${c.cor}`, background: "#fff", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: c.cor }}>{c.itens.length}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.textPrimary }}>{c.label}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {c.itens.slice(0, 3).map(c.render)}
          </div>
          {c.itens.length > 3 && c.href && (
            <a href={c.href} style={{ display: "inline-block", marginTop: 6, fontSize: 11.5, color: c.cor, fontWeight: 700, textDecoration: "none" }}>
              +{c.itens.length - 3} outra(s) →
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

const alertaItemLink = {
  display: "block",
  fontSize: 12,
  color: "#475569",
  textDecoration: "none",
  cursor: "pointer",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
