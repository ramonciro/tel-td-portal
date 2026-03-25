"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function isCoachingRecord(item) {
  const text = [item?.tema, item?.descricao, item?.publico].join(" ").toLowerCase();
  return text.includes("coaching");
}

function getJourneyName(cliente) {
  const base = String(cliente || "GLOBAL").trim() || "GLOBAL";
  return `Jornada ${base}`;
}

function getTrainingStatus(item) {
  const status = normalize(item?.status);
  if (status.includes("concl")) return "Concluído";
  if (status.includes("andamento") || status.includes("andam")) return "Em andamento";
  if (status.includes("planej") || status.includes("agend")) return "Planejado";
  return item?.status || "Em andamento";
}

function uniqueParticipantCountFromPresencas(presencas, treinamentoId) {
  const names = new Set(
    presencas
      .filter((item) => String(item?.treinamento_id) === String(treinamentoId))
      .map((item) => normalize(item?.treinando_nome))
      .filter(Boolean)
  );
  return names.size;
}

function presentParticipantCountFromPresencas(presencas, treinamentoId) {
  const names = new Set(
    presencas
      .filter(
        (item) =>
          String(item?.treinamento_id) === String(treinamentoId) && normalize(item?.status) === "presente"
      )
      .map((item) => normalize(item?.treinando_nome))
      .filter(Boolean)
  );
  return names.size;
}

function formatHours(value) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(
    round1(value)
  );
}

export default function MapaDesenvolvimentoPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [treinamentos, setTreinamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [activeTab, setActiveTab] = useState("geral");
  const [selectedClient, setSelectedClient] = useState("todos");
  const [selectedJourney, setSelectedJourney] = useState("todos");
  const [selectedStatus, setSelectedStatus] = useState("todos");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      const [usuariosData, treinamentosData, presencasData] = await Promise.all([
        apiFetch("/usuarios").catch(() => []),
        apiFetch("/treinamentos").catch(() => []),
        apiFetch("/presencas").catch(() => []),
      ]);
      setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
      setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
      setPresencas(Array.isArray(presencasData) ? presencasData : []);
    } catch (err) {
      setError(err.message || "Erro ao carregar mapa de desenvolvimento.");
    } finally {
      setLoading(false);
    }
  }

  const normalizedActions = useMemo(() => {
    return treinamentos.map((item) => {
      const cliente = item?.cliente || "GLOBAL";
      const cargaHoraria = toNumber(item?.carga_horaria);
      const participantesBase = uniqueParticipantCountFromPresencas(presencas, item?.id);
      const participantesPrevistos = Math.max(participantesBase, toNumber(item?.participantes));
      const concluintes = Math.max(presentParticipantCountFromPresencas(presencas, item?.id), participantesPrevistos);
      const horasPlanejadas = round1(participantesPrevistos * cargaHoraria);
      const horasRealizadas = round1(concluintes * cargaHoraria);

      return {
        id: item?.id,
        cliente,
        jornada: getJourneyName(cliente),
        tema: item?.tema || "Tema não informado",
        tipo: isCoachingRecord(item) ? "Coaching" : "Treinamento",
        publico: item?.publico || "Público não informado",
        responsavel: item?.instrutor || "Responsável não informado",
        status: getTrainingStatus(item),
        data: item?.data || "",
        cargaHoraria,
        participantesPrevistos,
        concluintes,
        turmasOuSessoes: 1,
        horasPlanejadas,
        horasRealizadas,
        descricao: item?.descricao || "",
      };
    });
  }, [treinamentos, presencas]);

  const clients = useMemo(() => {
    return [...new Set(normalizedActions.map((item) => item.cliente))].sort();
  }, [normalizedActions]);

  const journeys = useMemo(() => {
    return [...new Set(normalizedActions.map((item) => item.jornada))].sort();
  }, [normalizedActions]);

  const filteredActions = useMemo(() => {
    const term = normalize(search);
    return normalizedActions.filter((item) => {
      const matchesTab =
        activeTab === "geral"
          ? true
          : activeTab === "treinamentos"
          ? item.tipo === "Treinamento"
          : item.tipo === "Coaching";

      const matchesClient = selectedClient === "todos" || item.cliente === selectedClient;
      const matchesJourney = selectedJourney === "todos" || item.jornada === selectedJourney;
      const matchesStatus = selectedStatus === "todos" || item.status === selectedStatus;
      const matchesSearch =
        !term ||
        [item.tema, item.publico, item.responsavel, item.jornada, item.cliente, item.descricao]
          .join(" ")
          .toLowerCase()
          .includes(term);

      return matchesTab && matchesClient && matchesJourney && matchesStatus && matchesSearch;
    });
  }, [normalizedActions, activeTab, selectedClient, selectedJourney, selectedStatus, search]);

  const kpis = useMemo(() => {
    const jornadasAtivas = new Set(normalizedActions.map((item) => item.jornada)).size;
    const clientesContemplados = new Set(normalizedActions.map((item) => item.cliente)).size;
    const participantesImpactados = normalizedActions.reduce((acc, item) => acc + item.concluintes, 0);
    const horasTotais = normalizedActions.reduce((acc, item) => acc + item.horasRealizadas, 0);
    const treinamentosCount = normalizedActions.filter((item) => item.tipo === "Treinamento").length;
    const coachingsCount = normalizedActions.filter((item) => item.tipo === "Coaching").length;

    return {
      jornadasAtivas,
      clientesContemplados,
      participantesImpactados,
      horasTotais,
      treinamentosCount,
      coachingsCount,
    };
  }, [normalizedActions]);

  const journeySummary = useMemo(() => {
    const map = {};
    normalizedActions.forEach((item) => {
      const key = `${item.cliente}__${item.jornada}`;
      if (!map[key]) {
        map[key] = {
          cliente: item.cliente,
          jornada: item.jornada,
          acoes: 0,
          participantes: 0,
          horas: 0,
          coachings: 0,
          treinamentos: 0,
        };
      }
      map[key].acoes += 1;
      map[key].participantes += item.concluintes;
      map[key].horas += item.horasRealizadas;
      if (item.tipo === "Coaching") map[key].coachings += 1;
      else map[key].treinamentos += 1;
    });

    return Object.values(map).sort((a, b) => b.horas - a.horas);
  }, [normalizedActions]);

  const coachingSummary = useMemo(() => {
    const actions = normalizedActions.filter((item) => item.tipo === "Coaching");
    const planned = actions.length;
    const hours = actions.reduce((acc, item) => acc + item.horasRealizadas, 0);
    const responsaveis = new Set(actions.map((item) => item.responsavel).filter(Boolean)).size;
    const clientes = new Set(actions.map((item) => item.cliente)).size;

    return {
      planned,
      hours,
      responsaveis,
      clientes,
    };
  }, [normalizedActions]);

  const personas = useMemo(() => {
    const coordCount = usuarios.filter((item) => normalize(item?.perfil) === "coordenador").length;
    const supCount = usuarios.filter((item) => normalize(item?.perfil) === "supervisor").length;
    const instrCount = usuarios.filter((item) => normalize(item?.perfil) === "instrutor").length;
    return { coordCount, supCount, instrCount };
  }, [usuarios]);

  const statusOptions = [
    ...new Set(normalizedActions.map((item) => item.status).filter(Boolean)),
  ].sort();

  const coachingAlert = useMemo(() => {
    if (coachingSummary.planned === 0) {
      return "Nenhum coaching registrado na base atual. A aba já está pronta para separar essas ações quando começarem a ser lançadas no portal.";
    }
    return "Aba de coaching separada para leitura da coordenadora responsável, com foco em horas aplicadas, público e cliente.";
  }, [coachingSummary]);

  return (
    <PortalShell
      title="Mapa de Desenvolvimento"
      subtitle="Visão executiva por jornadas, treinamentos e coaching, pronta para leitura gerencial, auditorias e respostas institucionais."
      topRight={<div style={heroBadge}>Visão gerencial institucional</div>}
    >
      <div style={pageGrid}>
        {error ? <div style={errorBox}>{error}</div> : null}

        <section style={heroPanel}>
          <div style={heroTop}>
            <div>
              <div style={eyebrow}>Mapa de desenvolvimento</div>
              <h2 style={heroTitle}>Jornadas por cliente com leitura separada para treinamentos e coaching</h2>
              <p style={heroText}>
                A página agora conversa melhor com o uso gerencial que você descreveu: jornadas por cliente,
                controle de horas e uma visão apartada para coaching, sem fugir do padrão já validado no portal.
              </p>
            </div>

            <div style={executiveCard}>
              <div style={executiveLabel}>Leitura estratégica</div>
              <div style={executiveValue}>Cliente • Jornada • Tema • Horas • Evidência</div>
              <div style={executiveSub}>Base útil para superintendência, metodologia e demandas do MPT</div>
            </div>
          </div>

          <div style={statsGrid}>
            <StatCard title="Jornadas ativas" value={fmt(kpis.jornadasAtivas)} subtitle="Clientes mapeados" accent="#2563eb" />
            <StatCard title="Ações realizadas" value={fmt(normalizedActions.length)} subtitle="Treinamentos e coaching" accent="#16a34a" />
            <StatCard title="Clientes contemplados" value={fmt(kpis.clientesContemplados)} subtitle="Com desenvolvimento" accent="#0f766e" />
            <StatCard title="Participantes impactados" value={fmt(kpis.participantesImpactados)} subtitle="Base consolidada" accent="#7c3aed" />
            <StatCard title="Horas aplicadas" value={formatHours(kpis.horasTotais)} subtitle="Leitura institucional" accent="#0891b2" />
            <StatCard title="Coachings" value={fmt(kpis.coachingsCount)} subtitle="Visão apartada" accent="#ea580c" />
          </div>
        </section>

        <div style={tabRow}>
          {[
            ["geral", "Visão geral"],
            ["treinamentos", "Treinamentos"],
            ["coaching", "Coaching"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              style={{ ...tabButton, ...(activeTab === id ? tabButtonActive : {}) }}
            >
              {label}
            </button>
          ))}
        </div>

        <SectionCard
          title="Filtros executivos"
          subtitle="Ajuste a leitura do mapa por cliente, jornada, status e tema."
        >
          <div style={filterGrid}>
            <div style={fieldWrap}>
              <label style={label}>Busca</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tema, cliente, público ou responsável" style={input} />
            </div>
            <div style={fieldWrap}>
              <label style={label}>Cliente</label>
              <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} style={input}>
                <option value="todos">Todos</option>
                {clients.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div style={fieldWrap}>
              <label style={label}>Jornada</label>
              <select value={selectedJourney} onChange={(e) => setSelectedJourney(e.target.value)} style={input}>
                <option value="todos">Todas</option>
                {journeys.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div style={fieldWrap}>
              <label style={label}>Status</label>
              <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} style={input}>
                <option value="todos">Todos</option>
                {statusOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>
        </SectionCard>

        {activeTab === "geral" ? (
          <>
            <div style={twoCol}>
              <SectionCard title="Resumo das jornadas" subtitle="Consolidação por cliente e jornada para leitura da superintendência.">
                <div style={summaryList}>
                  {journeySummary.length ? journeySummary.slice(0, 8).map((item) => (
                    <div key={`${item.cliente}-${item.jornada}`} style={summaryItem}>
                      <div style={summaryTop}>
                        <strong>{item.jornada}</strong>
                        <span>{item.cliente}</span>
                      </div>
                      <div style={summaryMeta}>
                        {fmt(item.acoes)} ação(ões) • {fmt(item.participantes)} participantes • {formatHours(item.horas)}h aplicadas
                      </div>
                      <div style={summaryMetaMuted}>
                        {fmt(item.treinamentos)} treinamento(s) • {fmt(item.coachings)} coaching(s)
                      </div>
                    </div>
                  )) : <div style={emptyState}>Nenhuma jornada encontrada na base atual.</div>}
                </div>
              </SectionCard>

              <SectionCard title="Leitura gerencial" subtitle="Recortes rápidos para governança da área.">
                <div style={governanceGrid}>
                  <div style={governanceItem}>Coordenação cadastrada: <strong>{fmt(personas.coordCount)}</strong></div>
                  <div style={governanceItem}>Supervisão cadastrada: <strong>{fmt(personas.supCount)}</strong></div>
                  <div style={governanceItem}>Instrutores cadastrados: <strong>{fmt(personas.instrCount)}</strong></div>
                  <div style={governanceItem}>Treinamentos mapeados: <strong>{fmt(kpis.treinamentosCount)}</strong></div>
                  <div style={governanceItem}>Coachings mapeados: <strong>{fmt(kpis.coachingsCount)}</strong></div>
                  <div style={governanceItem}>Base pronta para exportação futura de evidências.</div>
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Base consolidada" subtitle={loading ? "Carregando base..." : `${fmt(filteredActions.length)} registro(s) encontrados para a visão atual.`}>
              {loading ? (
                <div style={emptyState}>Carregando ações de desenvolvimento...</div>
              ) : filteredActions.length ? (
                <div style={tableWrap}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Cliente</th>
                        <th style={th}>Jornada</th>
                        <th style={th}>Tema/Ação</th>
                        <th style={th}>Tipo</th>
                        <th style={th}>Público</th>
                        <th style={th}>Participantes</th>
                        <th style={th}>Carga horária</th>
                        <th style={th}>Horas realizadas</th>
                        <th style={th}>Responsável</th>
                        <th style={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredActions.map((item) => (
                        <tr key={item.id}>
                          <td style={td}>{item.cliente}</td>
                          <td style={td}>{item.jornada}</td>
                          <td style={tdStrong}>{item.tema}</td>
                          <td style={td}><span style={typeBadge(item.tipo)}>{item.tipo}</span></td>
                          <td style={td}>{item.publico}</td>
                          <td style={td}>{fmt(item.concluintes)}</td>
                          <td style={td}>{formatHours(item.cargaHoraria)}h</td>
                          <td style={td}>{formatHours(item.horasRealizadas)}h</td>
                          <td style={td}>{item.responsavel}</td>
                          <td style={td}><span style={statusBadge(item.status)}>{item.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={emptyState}>Nenhum registro encontrado para os filtros selecionados.</div>
              )}
            </SectionCard>
          </>
        ) : null}

        {activeTab === "treinamentos" ? (
          <SectionCard title="Treinamentos por jornada" subtitle="Camada formal de capacitação, útil para horas aplicadas, cliente e tema.">
            {filteredActions.length ? (
              <div style={cardsGrid}>
                {filteredActions.map((item) => (
                  <article key={item.id} style={actionCard}>
                    <div style={cardTopRow}>
                      <span style={typeBadge(item.tipo)}>{item.tipo}</span>
                      <span style={hoursBadge}>{formatHours(item.horasRealizadas)}h realizadas</span>
                    </div>
                    <div style={cardTitle}>{item.tema}</div>
                    <div style={cardMeta}>{item.cliente} • {item.jornada}</div>
                    <div style={metricGrid}>
                      <div style={metricItem}><strong>{fmt(item.concluintes)}</strong><span>Participantes</span></div>
                      <div style={metricItem}><strong>{formatHours(item.cargaHoraria)}h</strong><span>Carga</span></div>
                      <div style={metricItem}><strong>{item.status}</strong><span>Status</span></div>
                    </div>
                    <div style={cardText}>{item.publico}</div>
                    <div style={mutedInfo}>Responsável: {item.responsavel}</div>
                  </article>
                ))}
              </div>
            ) : (
              <div style={emptyState}>Nenhum treinamento encontrado na visão filtrada.</div>
            )}
          </SectionCard>
        ) : null}

        {activeTab === "coaching" ? (
          <>
            <div style={coachStatsGrid}>
              <StatCard title="Coachings" value={fmt(coachingSummary.planned)} subtitle="Registros na base" accent="#ea580c" />
              <StatCard title="Horas de coaching" value={formatHours(coachingSummary.hours)} subtitle="Total aplicado" accent="#f97316" />
              <StatCard title="Responsáveis" value={fmt(coachingSummary.responsaveis)} subtitle="Com ações lançadas" accent="#c2410c" />
              <StatCard title="Clientes" value={fmt(coachingSummary.clientes)} subtitle="Contemplados" accent="#9a3412" />
            </div>

            <SectionCard title="Visão apartada de coaching" subtitle="Estrutura separada para a coordenadora responsável pelos coachings.">
              <div style={coachBanner}>{coachingAlert}</div>

              {filteredActions.length ? (
                <div style={cardsGrid}>
                  {filteredActions.map((item) => (
                    <article key={item.id} style={coachCard}>
                      <div style={cardTopRow}>
                        <span style={coachBadge}>Coaching</span>
                        <span style={hoursBadge}>{formatHours(item.horasRealizadas)}h</span>
                      </div>
                      <div style={cardTitle}>{item.tema}</div>
                      <div style={cardMeta}>{item.cliente} • {item.jornada}</div>
                      <div style={coachList}>
                        <div style={coachListItem}><strong>Público:</strong> {item.publico}</div>
                        <div style={coachListItem}><strong>Responsável:</strong> {item.responsavel}</div>
                        <div style={coachListItem}><strong>Participantes:</strong> {fmt(item.concluintes)}</div>
                        <div style={coachListItem}><strong>Carga por ação:</strong> {formatHours(item.cargaHoraria)}h</div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div style={emptyState}>Nenhum coaching encontrado. Quando os registros entrarem com “coaching” no tema, descrição ou público, esta aba já fará a separação automaticamente.</div>
              )}
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalShell>
  );
}

function typeBadge(type) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
    background: type === "Coaching" ? "#fff7ed" : "#eff6ff",
    color: type === "Coaching" ? "#c2410c" : "#1d4ed8",
  };
}

function statusBadge(status) {
  const key = normalize(status);
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };
  if (key.includes("concl")) return { ...base, background: "#dcfce7", color: "#166534" };
  if (key.includes("planej") || key.includes("agend")) return { ...base, background: "#fef3c7", color: "#92400e" };
  return { ...base, background: "#dbeafe", color: "#1d4ed8" };
}

const pageGrid = {
  display: "grid",
  gap: 14,
};

const heroPanel = {
  background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 52%, #38bdf8 100%)",
  borderRadius: 24,
  padding: 22,
  color: "#ffffff",
  boxShadow: "0 16px 32px rgba(30,58,138,0.18)",
};

const heroTop = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 320px)",
  gap: 16,
  alignItems: "start",
};

const eyebrow = {
  display: "inline-flex",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.14)",
  fontWeight: 800,
  fontSize: 11,
  letterSpacing: ".04em",
  textTransform: "uppercase",
};

const heroTitle = {
  margin: "12px 0 8px",
  fontSize: 28,
  lineHeight: 1.1,
};

const heroText = {
  margin: 0,
  color: "rgba(255,255,255,0.9)",
  lineHeight: 1.55,
  maxWidth: 760,
};

const executiveCard = {
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 20,
  padding: 16,
  backdropFilter: "blur(8px)",
};

const executiveLabel = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  opacity: 0.88,
  fontWeight: 800,
};

const executiveValue = {
  marginTop: 8,
  fontSize: 18,
  fontWeight: 900,
  lineHeight: 1.25,
};

const executiveSub = {
  marginTop: 8,
  fontSize: 13,
  lineHeight: 1.45,
  color: "rgba(255,255,255,0.82)",
};

const heroBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 14px",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 12,
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
  marginTop: 18,
};

const tabRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const tabButton = {
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#334155",
  borderRadius: 999,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
};

const tabButtonActive = {
  background: "#1d4ed8",
  color: "#ffffff",
  borderColor: "#1d4ed8",
  boxShadow: "0 10px 20px rgba(37,99,235,0.18)",
};

const filterGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const fieldWrap = {
  display: "grid",
  gap: 6,
};

const label = {
  fontSize: 13,
  fontWeight: 800,
  color: "#334155",
};

const input = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  padding: "12px 14px",
  fontSize: 14,
  outline: "none",
  background: "#ffffff",
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 14,
};

const summaryList = {
  display: "grid",
  gap: 10,
};

const summaryItem = {
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid #dbe4f0",
  borderRadius: 16,
  padding: 12,
};

const summaryTop = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  color: "#0f172a",
  fontSize: 14,
};

const summaryMeta = {
  marginTop: 5,
  color: "#334155",
  fontSize: 13,
  lineHeight: 1.45,
};

const summaryMetaMuted = {
  marginTop: 3,
  color: "#64748b",
  fontSize: 12,
};

const governanceGrid = {
  display: "grid",
  gap: 10,
};

const governanceItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 12,
  color: "#334155",
  lineHeight: 1.45,
};

const tableWrap = {
  overflowX: "auto",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#ffffff",
};

const th = {
  textAlign: "left",
  padding: "12px 14px",
  background: "#f8fafc",
  color: "#475569",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  borderBottom: "1px solid #e2e8f0",
};

const td = {
  padding: "12px 14px",
  borderBottom: "1px solid #edf2f7",
  color: "#334155",
  fontSize: 13,
  verticalAlign: "top",
};

const tdStrong = {
  ...td,
  fontWeight: 800,
  color: "#0f172a",
};

const cardsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const actionCard = {
  background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  border: "1px solid #dbe4f0",
  borderRadius: 20,
  padding: 16,
  display: "grid",
  gap: 12,
};

const coachCard = {
  ...actionCard,
  borderColor: "#fed7aa",
  boxShadow: "0 10px 24px rgba(249,115,22,0.08)",
};

const cardTopRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
};

const hoursBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  padding: "6px 10px",
  fontWeight: 800,
  fontSize: 11,
};

const coachBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  background: "#fff7ed",
  color: "#c2410c",
  padding: "6px 10px",
  fontWeight: 800,
  fontSize: 11,
};

const cardTitle = {
  fontSize: 18,
  lineHeight: 1.2,
  fontWeight: 900,
  color: "#0f172a",
};

const cardMeta = {
  fontSize: 13,
  color: "#64748b",
  fontWeight: 700,
};

const metricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const metricItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 4,
};

const cardText = {
  color: "#475569",
  lineHeight: 1.45,
  fontSize: 14,
};

const mutedInfo = {
  color: "#64748b",
  fontSize: 13,
};

const coachStatsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const coachBanner = {
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  padding: 14,
  borderRadius: 14,
  fontWeight: 700,
  marginBottom: 14,
  lineHeight: 1.45,
};

const coachList = {
  display: "grid",
  gap: 8,
};

const coachListItem = {
  background: "#fffaf5",
  border: "1px solid #fed7aa",
  borderRadius: 12,
  padding: 10,
  fontSize: 13,
  color: "#9a3412",
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  padding: 14,
  borderRadius: 14,
  fontWeight: 700,
};

const emptyState = {
  padding: 22,
  borderRadius: 16,
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
  color: "#64748b",
  textAlign: "center",
};
