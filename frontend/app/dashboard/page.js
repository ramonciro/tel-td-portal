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

function parseModalidade(descricao) {
  const text = String(descricao || "");
  const match = text.match(/\[modalidade:([^\]]+)\]/i);
  const modalidade = String(match?.[1] || "").trim().toLowerCase();
  if (modalidade === "presencial") return "Presencial";
  if (modalidade === "online") return "Online";
  return "-";
}

function getBadgeStyleByTax(value) {
  const taxa = Number(value || 0);
  if (taxa >= 90) return { background: "#dcfce7", color: "#166534" };
  if (taxa >= 75) return { background: "#fef3c7", color: "#92400e" };
  return { background: "#fee2e2", color: "#b91c1c" };
}

function buildFarois(kpis = {}, oceano = {}) {
  const farois = [];

  if (Number(kpis.pendentes || 0) > 0) {
    farois.push({
      title: "Fechar chamadas pendentes",
      text: `${fmt(kpis.pendentes)} registro(s) ainda estão em aberto e podem distorcer a leitura do dia.`,
      tone: "attention",
    });
  }

  if (Number(kpis.taxa_presenca || 0) > 0 && Number(kpis.taxa_presenca || 0) < 85) {
    farois.push({
      title: "Acompanhar presença",
      text: `A presença consolidada está em ${fmt(kpis.taxa_presenca)}% e merece um olhar mais próximo.`,
      tone: "danger",
    });
  }

  if (Number(kpis.gap_diario || 0) > 0) {
    farois.push({
      title: "Reduzir gap do dia",
      text: `${fmt(kpis.gap_diario)} lançamento(s) ainda separam a capacidade prevista da base já registrada.`,
      tone: "attention",
    });
  }

  if (Number(oceano.jornadas || 0) > 0 && Number(oceano.tripulacao || 0) === 0) {
    farois.push({
      title: "Dar tração ao Oceano",
      text: "As jornadas já existem, mas ainda vale acelerar o vínculo das pessoas para transformar a estrutura em acompanhamento real.",
      tone: "attention",
    });
  }

  if (!farois.length) {
    farois.push({
      title: "Leitura estável",
      text: "O painel está sem alertas mais duros agora. O momento é bom para manter ritmo e consistência.",
      tone: "ok",
    });
  }

  return farois.slice(0, 4);
}

function buildNarrativa(kpis = {}, filters = {}) {
  const partes = [];
  const recortes = [];

  if (filters.cliente) recortes.push(`cliente ${filters.cliente}`);
  if (filters.instrutor) recortes.push(`instrutor ${filters.instrutor}`);
  if (filters.modalidade) recortes.push(`modalidade ${filters.modalidade}`);
  if (filters.status) recortes.push(`status ${filters.status}`);

  if (recortes.length) {
    partes.push(`Você está olhando um recorte por ${recortes.join(", ")}.`);
  } else {
    partes.push("Você está olhando a visão consolidada da operação.");
  }

  partes.push(
    `A base atual reúne ${fmt(kpis.treinamentos || 0)} turma(s) e ${fmt(kpis.treinados || 0)} registro(s) já lançados.`
  );

  if (Number(kpis.taxa_presenca || 0) > 0) {
    partes.push(`A presença está em ${fmt(kpis.taxa_presenca)}%, com ${fmt(kpis.presentes || 0)} presença(s) confirmada(s).`);
  }

  if (Number(kpis.pendentes || 0) > 0) {
    partes.push(`Ainda há ${fmt(kpis.pendentes || 0)} pendência(s) na chamada diária.`);
  } else {
    partes.push("A chamada do período está bem encaminhada, sem pendência relevante.");
  }

  return partes;
}

export default function DashboardPage() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    cliente: "",
    instrutor: "",
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

        const path = params.toString()
          ? `/dashboard/treinamentos?${params.toString()}`
          : "/dashboard/treinamentos";

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

  const kpis = dados?.kpis || {};
  const filtrosApi = dados?.filtros || {};
  const presencaPorCliente = dados?.presenca_por_cliente || [];
  const rankingInstrutores = dados?.ranking_instrutores || [];
  const ultimasTurmas = dados?.ultimas_turmas || [];
  const oceano = dados?.oceano || {};

  const farois = useMemo(() => buildFarois(kpis, oceano), [kpis, oceano]);
  const narrativa = useMemo(() => buildNarrativa(kpis, filters), [kpis, filters]);

  return (
    <PortalShell
      title="Dashboard"
      subtitle="Uma leitura mais analítica da operação, com filtros para chegar mais rápido ao que você precisa enxergar."
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
              <h2 style={heroTitle}>Aqui o objetivo é comparar, filtrar e entender melhor o que o número está contando.</h2>
              <p style={heroText}>
                Esta tela foi pensada para sair da foto geral e entrar na análise.
                Quanto melhor o recorte, melhor a decisão.
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
                <strong>{fmt(kpis.pendentes || 0)}</strong>
                <span>pendências em aberto</span>
              </div>
            </div>
          </section>

          <SectionCard
            title="Filtros do painel"
            subtitle="Use os recortes para chegar mais rápido ao cliente, instrutor ou cenário que você quer entender melhor."
            action={
              <button
                style={buttonSecondary}
                onClick={() =>
                  setFilters({
                    cliente: "",
                    instrutor: "",
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
                <select
                  style={inputStyle}
                  value={filters.cliente}
                  onChange={(e) => setFilters((prev) => ({ ...prev, cliente: e.target.value }))}
                >
                  <option value="">Todos</option>
                  {(filtrosApi.clientes || []).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label style={fieldLabel}>
                Instrutor
                <select
                  style={inputStyle}
                  value={filters.instrutor}
                  onChange={(e) => setFilters((prev) => ({ ...prev, instrutor: e.target.value }))}
                >
                  <option value="">Todos</option>
                  {(filtrosApi.instrutores || []).map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label style={fieldLabel}>
                Status
                <select
                  style={inputStyle}
                  value={filters.status}
                  onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                >
                  <option value="">Todos</option>
                  {(filtrosApi.status || []).map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label style={fieldLabel}>
                Modalidade
                <select
                  style={inputStyle}
                  value={filters.modalidade}
                  onChange={(e) => setFilters((prev) => ({ ...prev, modalidade: e.target.value }))}
                >
                  <option value="">Todas</option>
                  {(filtrosApi.modalidades || []).map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label style={fieldLabel}>
                De
                <input
                  type="date"
                  style={inputStyle}
                  value={filters.data_inicio}
                  onChange={(e) => setFilters((prev) => ({ ...prev, data_inicio: e.target.value }))}
                />
              </label>

              <label style={fieldLabel}>
                Até
                <input
                  type="date"
                  style={inputStyle}
                  value={filters.data_fim}
                  onChange={(e) => setFilters((prev) => ({ ...prev, data_fim: e.target.value }))}
                />
              </label>
            </div>
          </SectionCard>

          <div style={kpiGrid}>
            <StatCard title="Turmas" value={fmt(kpis.treinamentos || 0)} subtitle="Base no recorte" accent="#2563eb" />
            <StatCard title="Registros" value={fmt(kpis.treinados || 0)} subtitle="Chamadas lançadas" accent="#3b82f6" />
            <StatCard title="Presença" value={`${fmt(kpis.taxa_presenca || 0)}%`} subtitle="Consolidado" accent="#16a34a" />
            <StatCard title="Pendências" value={fmt(kpis.pendentes || 0)} subtitle="Ainda em aberto" accent="#f59e0b" />
            <StatCard title="Horas assistidas" value={`${fmt(kpis.horas_treinadas || 0)}h`} subtitle="Carga executada" accent="#0ea5e9" />
            <StatCard title="Execução" value={`${fmt(kpis.taxa_execucao_diaria || 0)}%`} subtitle="Base já registrada" accent="#7c3aed" />
          </div>

          <div style={twoColumns}>
            <SectionCard
              title="Leitura gerencial"
              subtitle="Textos mais naturais, para apoiar sua interpretação sem parecer leitura de sistema."
            >
              <div style={summaryList}>
                {narrativa.map((item) => (
                  <div key={item} style={summaryItem}>{item}</div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Faróis acionáveis"
              subtitle="O painel resume aqui o que mais vale sua energia agora."
            >
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
            <SectionCard
              title="Saúde por cliente"
              subtitle="Ajuda a comparar rapidamente onde a operação está mais firme e onde precisa de suporte."
            >
              <div style={listGrid}>
                {presencaPorCliente.length ? (
                  presencaPorCliente.map((item) => {
                    const badgeStyle = getBadgeStyleByTax(item.taxa_presenca);
                    return (
                      <div key={item.cliente} style={listRow}>
                        <div>
                          <div style={rowTitle}>{item.cliente}</div>
                          <div style={rowMeta}>
                            {fmt(item.total_treinados)} base • {fmt(item.presentes)} presentes • {fmt(item.pendentes)} pendentes
                          </div>
                        </div>
                        <div style={{ ...pill, ...badgeStyle }}>{fmt(item.taxa_presenca)}%</div>
                      </div>
                    );
                  })
                ) : (
                  <div style={emptyState}>Nenhum dado por cliente apareceu nesse recorte.</div>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Instrutores no recorte"
              subtitle="Uma leitura simples de produtividade e presença, sem poluição visual."
            >
              <div style={listGrid}>
                {rankingInstrutores.length ? (
                  rankingInstrutores.map((item) => {
                    const badgeStyle = getBadgeStyleByTax(item.taxa_presenca);
                    return (
                      <div key={item.instrutor} style={listRow}>
                        <div>
                          <div style={rowTitle}>{item.instrutor}</div>
                          <div style={rowMeta}>
                            {fmt(item.total_turmas)} turma(s) • {fmt(item.total_treinados)} base • {fmt(item.presentes)} presentes
                          </div>
                        </div>
                        <div style={{ ...pill, ...badgeStyle }}>{fmt(item.taxa_presenca)}%</div>
                      </div>
                    );
                  })
                ) : (
                  <div style={emptyState}>Nenhum dado de instrutor apareceu nesse recorte.</div>
                )}
              </div>
            </SectionCard>
          </div>

          <div style={twoColumns}>
            <SectionCard
              title="Oceano em resumo"
              subtitle="Uma leitura curta para conectar o dashboard ao fluxo de desenvolvimento."
            >
              <div style={oceanoGrid}>
                <MiniStat label="Jornadas" value={fmt(oceano.jornadas || 0)} />
                <MiniStat label="Ações" value={fmt(oceano.acoes || 0)} />
                <MiniStat label="Sustentações" value={fmt(oceano.sustentacoes || 0)} />
                <MiniStat label="Tripulação" value={fmt(oceano.tripulacao || 0)} />
              </div>
            </SectionCard>

            <SectionCard
              title="Progresso da tripulação"
              subtitle="Ajuda a enxergar se o oceano está só bonito ou realmente em movimento."
            >
              <div style={summaryList}>
                <div style={summaryItem}>Em percurso: {fmt(oceano.progresso_tripulacao?.em_percurso || 0)}</div>
                <div style={summaryItem}>Concluídos: {fmt(oceano.progresso_tripulacao?.concluido || 0)}</div>
                <div style={summaryItem}>Em sustentação: {fmt(oceano.progresso_tripulacao?.em_sustentacao || 0)}</div>
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Turmas recentes"
            subtitle="Uma leitura mais limpa das últimas turmas, com status e modalidade no mesmo quadro."
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
                      <th style={th}>Presentes</th>
                      <th style={th}>Pendentes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ultimasTurmas.map((item) => (
                      <tr key={item.id}>
                        <td style={td}>{item.tema || "-"}</td>
                        <td style={td}>{item.cliente || "-"}</td>
                        <td style={td}>{item.instrutor || "-"}</td>
                        <td style={td}>{parseModalidade(item.descricao)}</td>
                        <td style={td}>{normalizeStatus(item.status)}</td>
                        <td style={td}>{formatDate(item.data || item.data_inicio)}</td>
                        <td style={td}>{fmt(item.treinados || 0)}</td>
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

const loadingBox = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 18,
  color: "#475569",
  fontWeight: 700,
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 18,
  padding: 16,
  fontWeight: 700,
};

const heroWrap = {
  display: "grid",
  gridTemplateColumns: "1.45fr .9fr",
  gap: 16,
};

const heroMain = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 24,
  padding: 24,
  color: "#ffffff",
  boxShadow: "0 14px 30px rgba(29, 78, 216, 0.18)",
};

const heroBadge = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,.14)",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: ".05em",
  textTransform: "uppercase",
};

const heroTitle = {
  fontSize: 30,
  lineHeight: 1.15,
  margin: "12px 0 10px",
};

const heroText = {
  color: "#dbeafe",
  lineHeight: 1.7,
  margin: 0,
};

const heroMiniGrid = {
  display: "grid",
  gap: 12,
};

const heroMiniCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 18,
  display: "grid",
  gap: 4,
  boxShadow: "0 10px 24px rgba(15,23,42,.05)",
};

const filtersGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const fieldLabel = {
  display: "grid",
  gap: 6,
  color: "#334155",
  fontSize: 13,
  fontWeight: 700,
};

const inputStyle = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "10px 12px",
  background: "#fff",
  color: "#0f172a",
};

const buttonSecondary = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const twoColumns = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
};

const summaryList = { display: "grid", gap: 10 };
const summaryItem = {
  padding: "14px 16px",
  borderRadius: 16,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  color: "#334155",
  lineHeight: 1.6,
};

const farolList = { display: "grid", gap: 10 };
function farolItem(tone) {
  const map = {
    ok: { background: "#f0fdf4", border: "1px solid #bbf7d0" },
    attention: { background: "#fffbeb", border: "1px solid #fde68a" },
    danger: { background: "#fff1f2", border: "1px solid #fecaca" },
  };
  return {
    padding: "14px 16px",
    borderRadius: 16,
    ...(map[tone] || map.ok),
  };
}
const farolTitle = { fontWeight: 900, color: "#0f172a", marginBottom: 4 };
const farolText = { color: "#475569", lineHeight: 1.55 };

const listGrid = { display: "grid", gap: 10 };
const listRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  background: "#fff",
};
const rowTitle = { fontWeight: 900, color: "#0f172a" };
const rowMeta = { marginTop: 4, color: "#64748b", fontSize: 13, lineHeight: 1.45 };
const pill = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const oceanoGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};
const miniStatCard = {
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  background: "#fff",
  padding: 14,
};
const miniStatLabel = {
  fontSize: 11,
  color: "#64748b",
  textTransform: "uppercase",
  fontWeight: 800,
};
const miniStatValue = {
  marginTop: 6,
  fontSize: 22,
  fontWeight: 900,
  color: "#0f172a",
};

const table = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 860,
};
const th = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "#64748b",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
};
const td = {
  padding: "12px 14px",
  borderBottom: "1px solid #eef2f7",
  color: "#334155",
  fontSize: 14,
};
const emptyState = {
  padding: 18,
  borderRadius: 16,
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
  color: "#64748b",
};
