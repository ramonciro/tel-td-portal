"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { formatDateBR } from "../../lib/date";

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
  if (number >= 90) return { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
  if (number >= 80) return { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" };
  return { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" };
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
  const [filters, setFilters] = useState({
    cliente: "",
    instrutor: "",
    supervisor: "",
    status: "",
    modalidade: "",
    data_inicio: "",
    data_fim: "",
  });

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
    <PortalShell
      title="Dashboard"
      subtitle="Uma leitura analítica para comparar os KPIs, identificar prioridades e entender melhor o que o número está dizendo."
    >
      {loading ? (
        <div style={loadingBox}>Carregando o dashboard...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          <section style={heroWrap}>
            <div style={heroMain}>
              <div style={heroBadge}>Painel analítico</div>
              <h2 style={heroTitle}>Filtre, compare e encontre com mais clareza onde a gestão precisa agir.</h2>
              <p style={heroText}>
                Aqui a ideia é sair da visão geral e entrar no detalhe certo: cliente, instrutor, modalidade, período e status.
              </p>
            </div>

            <div style={heroMiniGrid}>
              <div style={heroMiniCard}>
                <strong>{fmt(kpis.treinamentos || 0)}</strong>
                <span>turmas no recorte</span>
              </div>
              <div style={heroMiniCard}>
                <strong>{fmt(kpis.taxa_presenca || 0)}%</strong>
                <span>presença consolidada</span>
              </div>
              <div style={heroMiniCard}>
                <strong>{fmt(kpis.taxa_execucao_diaria || 0)}%</strong>
                <span>execução do recorte</span>
              </div>
            </div>
          </section>

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
            <StatCard title="Turmas" value={fmt(kpis.treinamentos || 0)} subtitle="Base no recorte" accent="#2563eb" />
            <StatCard title="Previstos" value={fmt(kpis.participantes_previstos || 0)} subtitle="Capacidade cadastrada" accent="#0ea5e9" />
            <StatCard title="Confirmados" value={fmt(kpis.treinados || 0)} subtitle="Com chamada registrada" accent="#3b82f6" />
            <StatCard title="Presença" value={`${fmt(kpis.taxa_presenca || 0)}%`} subtitle="Consolidado" accent="#16a34a" />
            <StatCard title="Pendências" value={fmt(kpis.pendentes || 0)} subtitle="Ainda em aberto" accent="#f59e0b" />
            <StatCard title="Horas assistidas" value={`${fmt(kpis.horas_treinadas || 0)}h`} subtitle="Carga executada" accent="#0ea5e9" />
            <StatCard title="Execução" value={`${fmt(kpis.taxa_execucao_diaria || 0)}%`} subtitle="Base já registrada" accent="#7c3aed" />
            {nps.total_avaliacoes > 0 && (
              <>
                <StatCard title="NPS médio" value={nps.media_nps > 0 ? fmt(nps.media_nps) : "—"} subtitle={`${fmt(nps.total_avaliacoes)} avaliação(ões)`} accent="#ec4899" />
                <StatCard title="Qualidade" value={nps.media_qualidade > 0 ? fmt(nps.media_qualidade) : "—"} subtitle="Nota média qualidade" accent="#f97316" />
                {nps.media_prova > 0 && (
                  <StatCard title="Prova" value={fmt(nps.media_prova)} subtitle="Nota média prova" accent="#14b8a6" />
                )}
              </>
            )}
          </div>

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
                    background: pessoa.frequencia_percentual >= 90 ? "#dcfce7" : pessoa.frequencia_percentual >= 75 ? "#fff7ed" : "#fee2e2",
                    color: pessoa.frequencia_percentual >= 90 ? "#166534" : pessoa.frequencia_percentual >= 75 ? "#9a3412" : "#b91c1c",
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
