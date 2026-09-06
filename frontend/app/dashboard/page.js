"use client";
 
import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { formatDateBR } from "../../lib/date";
import { colors, chart } from "../../lib/theme";
 
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
 
function buildFarois(kpis = {}, oceano = {}, presencaPorCliente = [], ultimasTurmas = []) {
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
 
  const farois = useMemo(() => buildFarois(kpis, oceano, presencaPorCliente, ultimasTurmas), [kpis, oceano, presencaPorCliente, ultimasTurmas]);
  const narrativa = useMemo(() => buildNarrativa(kpis, filters), [kpis, filters]);
 
  const clienteOptions = Array.isArray(filtrosApi.clientes) ? filtrosApi.clientes : [];
  const instrutorOptions = Array.isArray(filtrosApi.instrutores) ? filtrosApi.instrutores : [];
  const supervisorOptions = Array.isArray(filtrosApi.supervisores) ? filtrosApi.supervisores : [];
  const statusOptions = Array.isArray(filtrosApi.status) ? filtrosApi.status : [];
  const modalidadeOptions = Array.isArray(filtrosApi.modalidades) ? filtrosApi.modalidades : [];
  const nps = dados?.nps || {};
 
  return (
    <PortalShell>
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
 
          <AlertasDashboard alertas={alertas} onAbrirTurma={abrirDrillDown} />
 
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
 
          <div style={kpiGrid}>
            <StatCard title="Turmas" value={fmt(kpis.treinamentos || 0)} subtitle="Base no recorte" accent={chart.blue} />
            <StatCard title="Previstos" value={fmt(kpis.participantes_previstos || 0)} subtitle="Capacidade cadastrada" accent={chart.cyan} />
            <StatCard title="Confirmados" value={fmt(kpis.treinados || 0)} subtitle="Com chamada registrada" accent={colors.primary} />
            <StatCard title="Presença" value={`${fmt(kpis.taxa_presenca || 0)}%`} subtitle="Consolidado" accent={colors.success} />
            <StatCard title="Pendências" value={fmt(kpis.pendentes || 0)} subtitle="Ainda em aberto" accent={colors.warning} />
            <StatCard title="Execução" value={`${fmt(kpis.taxa_execucao_diaria || 0)}%`} subtitle="Base já registrada" accent={chart.purple} />
            <StatCard title="Horas previstas" value={`${fmt(kpis.horas_previstas || 0)}h`} subtitle="Cronograma planejado" accent={chart.cyan} />
            <StatCard title="Horas realizadas" value={`${fmt(kpis.horas_realizadas || 0)}h`} subtitle={`Aderência ${fmt(kpis.aderencia_horas || 0)}%`} accent={colors.primary} />
            <StatCard title="Dias praticados" value={`${fmt(kpis.dias_praticados || 0)}/${fmt(kpis.dias_previstos || 0)}`} subtitle="Praticados / previstos" accent={chart.teal} />
            <StatCard title="HC previsto" value={fmt(kpis.hc_previsto || 0)} subtitle="Headcount planejado" accent={chart.orange} />
            <StatCard title="HC realizado" value={fmt(kpis.hc_realizado || 0)} subtitle={`Taxa ${fmt(kpis.taxa_hc || 0)}%`} accent={colors.success} />
            {nps.total_avaliacoes > 0 && (
              <>
                <StatCard title="NPS médio" value={nps.media_nps > 0 ? fmt(nps.media_nps) : "—"} subtitle={`${fmt(nps.total_avaliacoes)} avaliação(ões)`} accent={chart.pink} />
                <StatCard title="Qualidade" value={nps.media_qualidade > 0 ? fmt(nps.media_qualidade) : "—"} subtitle="Nota média qualidade" accent={chart.orange} />
                {nps.media_prova > 0 && (
                  <StatCard title="Prova" value={fmt(nps.media_prova)} subtitle="Nota média prova" accent={chart.teal} />
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
                <div style={kpiGrid}>
                  <StatCard
                    title="CH programada (período)"
                    value={`${fmt(capacidade.indicadores?.hc_programado_periodo || 0)}h`}
                    subtitle="Turmas + cronograma planejados"
                    accent={chart.cyan}
                  />
                  <StatCard
                    title="CH realizada (período)"
                    value={`${fmt(capacidade.indicadores?.hc_realizado_periodo || 0)}h`}
                    subtitle={capacidade.indicadores?.aderencia_geral_pct != null ? `Aderência ${fmt(capacidade.indicadores.aderencia_geral_pct)}%` : "Sem base de comparação"}
                    accent={colors.primary}
                  />
                  <StatCard
                    title="Ocupação do time"
                    value={`${fmt(capacidade.indicadores?.ocupacao_time_pct || 0)}%`}
                    subtitle="Realizado vs. capacidade nominal"
                    accent={colors.success}
                  />
                  <StatCard
                    title="Capacidade nominal (time)"
                    value={`${fmt(capacidade.indicadores?.capacidade_nominal_periodo || 0)}h`}
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
                    <div style={listGrid}>
                      {capacidadeRanking.slice(0, 3).map((item) => (
                        <div key={item.instrutor} style={listRow}>
                          <div>
                            <div style={rowTitle}>{item.posicao}º · {item.instrutor}</div>
                            <div style={rowMeta}>{fmt(item.pct_capacidade)}% da capacidade do mês</div>
                          </div>
                          <div style={{ ...pill, background: "#eff6ff", color: colors.primary, border: "1px solid #bfdbfe" }}>{fmt(item.horas_realizadas)}h</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
 
          <div style={twoColumns}>
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
 
          <div style={twoColumns}>
            <SectionCard title="Saúde por cliente" subtitle="Ajuda a comparar rapidamente onde a operação está mais firme e onde precisa de suporte.">
              <div style={listGrid}>
                {presencaPorCliente.length ? presencaPorCliente.map((item) => {
                  const badgeStyle = getBadgeStyleByTax(item.taxa_presenca);
                  return (
                    <div key={item.cliente} style={listRow}>
                      <div>
                        <div style={rowTitle}>{item.cliente}</div>
                        <div style={rowMeta}>{fmt(item.total_treinados)} base • {fmt(item.presentes)} presentes • {fmt(item.pendentes)} pendentes</div>
                      </div>
                      <div style={{ ...pill, ...badgeStyle }}>{fmt(item.taxa_presenca)}%</div>
                    </div>
                  );
                }) : <div style={emptyState}>Nenhum dado por cliente apareceu nesse recorte.</div>}
              </div>
            </SectionCard>
 
            <SectionCard title="Instrutores no recorte" subtitle="Uma leitura simples de produtividade e presença.">
              <div style={listGrid}>
                {rankingInstrutores.length ? rankingInstrutores.map((item) => {
                  const badgeStyle = getBadgeStyleByTax(item.taxa_presenca);
                  return (
                    <div key={item.instrutor} style={listRow}>
                      <div>
                        <div style={rowTitle}>{item.instrutor}</div>
                        <div style={rowMeta}>{fmt(item.total_turmas)} turma(s) • {fmt(item.total_treinados)} base • {fmt(item.presentes)} presentes</div>
                      </div>
                      <div style={{ ...pill, ...badgeStyle }}>{fmt(item.taxa_presenca)}%</div>
                    </div>
                  );
                }) : <div style={emptyState}>Nenhum dado de instrutor apareceu nesse recorte.</div>}
              </div>
            </SectionCard>
          </div>
 
          <div style={twoColumns}>
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
                const total = Number(oceano.tripulacao || 0);
                const items = [
                  { label: "Em percurso", value: Number(prog.em_percurso || 0), color: "#3b82f6" },
                  { label: "Concluídos", value: Number(prog.concluido || 0), color: "#16a34a" },
                  { label: "Em sustentação", value: Number(prog.em_sustentacao || 0), color: "#7c3aed" },
                ];
                return (
                  <div style={{ display: "grid", gap: 12 }}>
                    {items.map((item) => {
                      const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                      return (
                        <div key={item.label}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 5 }}>
                            <span>{item.label}</span>
                            <span style={{ color: item.color }}>{fmt(item.value)} <span style={{ color: "#94a3b8", fontWeight: 400 }}>({pct}%)</span></span>
                          </div>
                          <div style={{ height: 8, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: item.color, borderRadius: 999, transition: "width .4s ease" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </SectionCard>
          </div>
 
          <SectionCard title="Turmas recentes" subtitle="As últimas turmas.">
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
