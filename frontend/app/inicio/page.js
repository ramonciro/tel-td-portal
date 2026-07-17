"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { formatDateBR } from "../../lib/date";
import { corDoCliente } from "../../lib/theme";

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

function getHeroTone(kpis = {}) {
  const presenca = Number(kpis.taxa_presenca || 0);
  const fechamento = Number(kpis.taxa_conclusao_chamada || 0);
  const pendentes = Number(kpis.pendentes || 0);

  if (presenca >= 90 && fechamento >= 90 && pendentes === 0) {
    return {
      label: "Ritmo estável",
      bg: "#dcfce7",
      color: "#166534",
      border: "#86efac",
      message:
        "A operação está fluindo bem. Vale manter o ritmo e acompanhar só os pontos mais sensíveis do dia.",
    };
  }

  if (presenca >= 80 && fechamento >= 75) {
    return {
      label: "Acompanhamento próximo",
      bg: "#fef3c7",
      color: "#92400e",
      border: "#fcd34d",
      message:
        "O cenário está administrável, mas ainda pede atenção em presença e fechamento para o dia terminar redondo.",
    };
  }

  return {
    label: "Prioridade de ajuste",
    bg: "#fee2e2",
    color: "#b91c1c",
    border: "#fca5a5",
    message:
      "Hoje a leitura pede atuação mais próxima da operação, principalmente onde ainda há chamadas abertas ou presença abaixo do esperado.",
  };
}

function buildFarois(kpis = {}, oceano = {}) {
  const items = [];

  if (Number(kpis.pendentes || 0) > 0) {
    items.push({
      icon: "📋",
      title: "Chamada em aberto",
      text: `${fmt(kpis.pendentes)} registro(s) ainda precisam de fechamento para a leitura ficar mais redonda.`,
      tone: "attention",
    });
  }

  if (Number(kpis.taxa_presenca || 0) > 0 && Number(kpis.taxa_presenca || 0) < 85) {
    items.push({
      icon: "👥",
      title: "Presença abaixo do ideal",
      text: `A presença está em ${fmt(kpis.taxa_presenca)}% e vale acompanhar mais de perto este movimento.`,
      tone: "danger",
    });
  }

  if (Number(oceano.jornadas || 0) > 0 && Number(oceano.tripulacao || 0) === 0) {
    items.push({
      icon: "🧭",
      title: "Jornadas sem tripulação",
      text: "As jornadas já estão no ar, mas ainda sem pessoas vinculadas na base consolidada.",
      tone: "attention",
    });
  }

  if (Number(oceano.tripulacao || 0) > 0 && Number(oceano.progresso_tripulacao?.em_sustentacao || 0) > 0) {
    items.push({
      icon: "🌱",
      title: "Sustentação em andamento",
      text: `${fmt(oceano.progresso_tripulacao.em_sustentacao)} pessoa(s) já estão em fase de sustentação no oceano.`,
      tone: "ok",
    });
  }

  if (!items.length) {
    items.push({
      icon: "✅",
      title: "Leitura tranquila",
      text: "No momento, o portal não está sinalizando nenhum ponto mais sensível na operação.",
      tone: "ok",
    });
  }

  return items.slice(0, 4);
}

function buildResumo(kpis = {}, oceano = {}) {
  const frases = [];

  frases.push(
    `Hoje a base mostra ${fmt(kpis.treinamentos || 0)} turma(s) acompanhada(s) e ${fmt(kpis.treinados || 0)} registro(s) de chamada já lançados.`
  );

  if (Number(kpis.taxa_presenca || 0) > 0) {
    frases.push(
      `A presença consolidada está em ${fmt(kpis.taxa_presenca)}%, com ${fmt(kpis.presentes || 0)} presença(s) confirmada(s) e ${fmt(kpis.ausentes || 0)} ausência(s).`
    );
  }

  if (Number(kpis.pendentes || 0) > 0) {
    frases.push(
      `Ainda há ${fmt(kpis.pendentes || 0)} lançamento(s) pendente(s), então a leitura pode evoluir ao longo do dia.`
    );
  } else {
    frases.push("As chamadas do dia estão bem encaminhadas, sem acúmulo relevante de pendências.");
  }

  if (Number(oceano.jornadas || 0) > 0) {
    frases.push(
      `No Oceano do Desenvolvimento, já existem ${fmt(oceano.jornadas || 0)} jornada(s), ${fmt(oceano.acoes || 0)} ação(ões) e ${fmt(oceano.tripulacao || 0)} pessoa(s) vinculada(s).`
    );
  }

  return frases;
}

function getMiniTone(value, good = 90, warning = 75) {
  const number = Number(value || 0);
  if (number >= good) return { bg: "#dcfce7", color: "#166534" };
  if (number >= warning) return { bg: "#fef3c7", color: "#92400e" };
  return { bg: "#fee2e2", color: "#b91c1c" };
}

function getStoredUser() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("usuario") || "null");
  } catch {
    return null;
  }
}

export default function InicioPage() {
  const [usuario, setUsuario] = useState(undefined);

  useEffect(() => {
    setUsuario(getStoredUser());
  }, []);

  if (usuario === undefined) return null;

  if (usuario?.perfil === "instrutor" || usuario?.perfil === "treinando") {
    return <MinhasTurmas usuario={usuario} />;
  }

  return <InicioCoordenacao />;
}

function InicioCoordenacao() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        setErro("");
        setLoading(true);
        const response = await apiFetch("/dashboard/treinamentos");
        setDados(response || null);
      } catch (error) {
        setErro(error.message || "Erro ao carregar a visão inicial.");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const kpis = dados?.kpis || {};
  const ultimasTurmas = dados?.ultimas_turmas || [];
  const oceano = dados?.oceano || {};

  const heroTone = useMemo(() => getHeroTone(kpis), [kpis]);
  const farois = useMemo(() => buildFarois(kpis, oceano), [kpis, oceano]);
  const resumo = useMemo(() => buildResumo(kpis, oceano), [kpis, oceano]);

  return (
    <PortalShell
      title="Início"
      subtitle="Uma leitura rápida, clara e útil para entender como a área está andando hoje."
    >
      {loading ? (
        <div style={loadingBox}>Carregando sua visão do dia...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          <section style={heroWrap}>
            <div style={heroMain}>
              <div style={eyebrow}>Visão do dia</div>
              <h2 style={heroTitle}>Mapeie suas prioridades e comece a agir.</h2>
              <p style={heroText}>
                Resumo do que realmente merece atenção e o que já está caminhando bem.
              </p>

              <div
                style={{
                  ...statusPill,
                  background: heroTone.bg,
                  color: heroTone.color,
                  border: `1px solid ${heroTone.border}`,
                }}
              >
                {heroTone.label}
              </div>

              <p style={{ ...heroText, marginTop: 14 }}>{heroTone.message}</p>
            </div>

            <div style={heroSide}>
              <div style={heroMiniCard}>
                <span style={heroMiniLabel}>Presença</span>
                <strong style={heroMiniValue}>{fmt(kpis.taxa_presenca || 0)}%</strong>
                <span style={heroMiniSub}>base consolidada do dia</span>
              </div>

              <div style={heroMiniCard}>
                <span style={heroMiniLabel}>Fechamento</span>
                <strong style={heroMiniValue}>{fmt(kpis.taxa_conclusao_chamada || 0)}%</strong>
                <span style={heroMiniSub}>lançamentos já concluídos</span>
              </div>

              <div style={heroMiniCard}>
                <span style={heroMiniLabel}>Oceano</span>
                <strong style={heroMiniValue}>{fmt(oceano.jornadas || 0)}</strong>
                <span style={heroMiniSub}>jornadas em construção</span>
              </div>
            </div>
          </section>

          <SectionCard
            title="Faróis executivos"
            subtitle="Sinais rápidos para entender o que está bem e o que pede presença mais próxima."
          >
            <div style={faroisGrid}>
              {farois.map((item) => (
                <div key={`${item.title}-${item.text}`} style={farolCard(item.tone)}>
                  <div style={farolIcon}>{item.icon}</div>
                  <div style={farolTitle}>{item.title}</div>
                  <div style={farolText}>{item.text}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <div style={kpiGrid}>
            <StatCard title="Turmas" value={fmt(kpis.treinamentos || 0)} subtitle="Base ativa no portal" accent="#2563eb" />
            <StatCard title="Registros" value={fmt(kpis.treinados || 0)} subtitle="Chamadas já lançadas" accent="#3b82f6" />
            <StatCard title="Presentes" value={fmt(kpis.presentes || 0)} subtitle="Participação confirmada" accent="#16a34a" />
            <StatCard title="Pendências" value={fmt(kpis.pendentes || 0)} subtitle="Ainda em aberto" accent="#f59e0b" />
          </div>

          <div style={twoColumns}>
            <SectionCard
              title="Leitura do momento"
              subtitle="Um resumo simples, para você bater o olho e seguir a gestão com contexto."
            >
              <div style={summaryList}>
                {resumo.map((item) => (
                  <div key={item} style={summaryItem}>{item}</div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Oceano do Desenvolvimento"
              subtitle="Um retrato curto do que já está estruturado no fluxo de jornadas."
            >
              <div style={oceanoGrid}>
                <MiniStat label="Jornadas" value={fmt(oceano.jornadas || 0)} />
                <MiniStat label="Ações" value={fmt(oceano.acoes || 0)} />
                <MiniStat label="Sustentações" value={fmt(oceano.sustentacoes || 0)} />
                <MiniStat label="Tripulação" value={fmt(oceano.tripulacao || 0)} />
              </div>

              <div style={progressWrap}>
                <ProgressRow
                  label="Em percurso"
                  value={oceano.progresso_tripulacao?.em_percurso || 0}
                  total={oceano.tripulacao || 0}
                />
                <ProgressRow
                  label="Concluídos"
                  value={oceano.progresso_tripulacao?.concluido || 0}
                  total={oceano.tripulacao || 0}
                />
                <ProgressRow
                  label="Em sustentação"
                  value={oceano.progresso_tripulacao?.em_sustentacao || 0}
                  total={oceano.tripulacao || 0}
                />
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Resumo recente"
            subtitle="As turmas mais novas aparecem aqui de um jeito mais leve, para facilitar a leitura."
          >
            {ultimasTurmas.length ? (
              <div style={recentGrid}>
                {ultimasTurmas.map((item) => {
                  const tone = getMiniTone(
                    item.treinados > 0 ? Math.round((Number(item.presentes || 0) / Number(item.treinados || 1)) * 100) : 0
                  );

                  return (
                    <div key={item.id} style={recentCard}>
                      <div style={recentHeader}>
                        <div style={recentTitle}>{item.tema || "Turma sem título"}</div>
                        <div style={{ ...miniPill, ...tone }}>
                          {item.treinados > 0
                            ? `${fmt(Math.round((Number(item.presentes || 0) / Number(item.base_ativa || item.treinados || 1)) * 100))}% presença`
                            : "Sem base"}
                        </div>
                      </div>

                      <div style={recentMeta}>
                        {item.cliente || "Sem cliente"} • {item.instrutor || "Sem instrutor"}
                      </div>

                      <div style={recentChips}>
                        <span style={softChip("neutral")}>{normalizeStatus(item.status)}</span>
                        <span style={softChip("blue")}>{parseModalidade(item.descricao)}</span>
                        <span style={softChip("neutral")}>Data {formatDate(item.data || item.data_inicio)}</span>
                      </div>

                      <div style={recentBand}>
                        <span>Base {fmt(item.base_ativa || item.treinados || item.participantes || 0)}</span>
                        <span>Presentes {fmt(item.presentes || 0)}</span>
                        <span>Pendentes {fmt(item.pendentes || 0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={emptyState}>Ainda não há turmas recentes para mostrar por aqui.</div>
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

function ProgressRow({ label, value, total }) {
  const percent = total ? Math.round((Number(value || 0) / Number(total || 1)) * 100) : 0;
  return (
    <div style={progressRow}>
      <div style={progressHead}>
        <span>{label}</span>
        <strong>{fmt(value || 0)}</strong>
      </div>
      <div style={progressTrack}>
        <div style={{ ...progressFill, width: `${Math.max(percent, total ? 8 : 0)}%` }} />
      </div>
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
  background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
  borderRadius: 26,
  padding: 24,
  color: "#fff",
  boxShadow: "0 18px 38px rgba(15, 23, 42, 0.18)",
};

const heroSide = {
  display: "grid",
  gap: 12,
};

const eyebrow = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "#bfdbfe",
};

const heroTitle = {
  margin: "10px 0 10px",
  fontSize: 34,
  lineHeight: 1.1,
};

const heroText = {
  color: "#dbeafe",
  lineHeight: 1.7,
  maxWidth: 760,
  margin: 0,
};

const statusPill = {
  display: "inline-flex",
  marginTop: 16,
  padding: "8px 12px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 13,
};

const heroMiniCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 20,
  padding: 18,
  display: "grid",
  gap: 4,
  boxShadow: "0 8px 22px rgba(15,23,42,.05)",
};

const heroMiniLabel = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "#64748b",
  fontWeight: 800,
};

const heroMiniValue = {
  fontSize: 28,
  lineHeight: 1,
  color: "#0f172a",
};

const heroMiniSub = {
  color: "#475569",
  fontSize: 13,
};

const faroisGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

function farolCard(tone) {
  const map = {
    ok: {
      background: "linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)",
      border: "1px solid #bbf7d0",
    },
    attention: {
      background: "linear-gradient(180deg, #ffffff 0%, #fffbeb 100%)",
      border: "1px solid #fde68a",
    },
    danger: {
      background: "linear-gradient(180deg, #ffffff 0%, #fff1f2 100%)",
      border: "1px solid #fecaca",
    },
  };

  return {
    borderRadius: 18,
    padding: 16,
    display: "grid",
    gap: 8,
    boxShadow: "0 10px 24px rgba(15,23,42,.04)",
    ...(map[tone] || map.ok),
  };
}

const farolIcon = { fontSize: 22 };
const farolTitle = { fontWeight: 900, color: "#0f172a" };
const farolText = { color: "#475569", lineHeight: 1.55, fontSize: 14 };

const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const twoColumns = {
  display: "grid",
  gridTemplateColumns: "1.1fr .9fr",
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

const oceanoGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 14,
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

const progressWrap = { display: "grid", gap: 12 };
const progressRow = { display: "grid", gap: 6 };
const progressHead = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  color: "#334155",
  fontSize: 14,
};
const progressTrack = {
  height: 10,
  borderRadius: 999,
  background: "#e2e8f0",
  overflow: "hidden",
};
const progressFill = {
  height: "100%",
  background: "linear-gradient(90deg, #38bdf8 0%, #2563eb 100%)",
  borderRadius: 999,
};

const recentGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
};

const recentCard = {
  borderRadius: 20,
  border: "1px solid #dbeafe",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  padding: 16,
  display: "grid",
  gap: 8,
  boxShadow: "0 10px 24px rgba(15,23,42,.04)",
  minWidth: 0,
};

const recentHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  flexWrap: "wrap",
};
const recentTitle = {
  fontWeight: 900,
  color: "#0f172a",
  lineHeight: 1.35,
  minWidth: 0,
  wordBreak: "break-word",
};
const recentMeta = { color: "#64748b", fontSize: 13, lineHeight: 1.45 };

const recentChips = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 10,
};

function softChip(tone = "neutral") {
  const map = {
    neutral: { background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" },
    blue: { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    ...(map[tone] || map.neutral),
  };
}

const recentBand = {
  marginTop: 4,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#334155",
  fontSize: 13,
};
const miniPill = {
  display: "inline-flex",
  padding: "5px 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const emptyState = {
  padding: 18,
  borderRadius: 16,
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
  color: "#64748b",
};

// ---------------------------------------------------------------------------
// "Minhas turmas" — home por papel para instrutor e treinando. Em vez do
// painel de KPIs (feito para coordenação), aqui a pergunta é sempre
// "o que eu preciso fazer agora" — por isso os cards já trazem a ação mais
// provável (fazer chamada, ver mural) em vez de só listar números.
// ---------------------------------------------------------------------------
function MinhasTurmas({ usuario }) {
  const [turmas, setTurmas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregar() {
    try {
      setLoading(true);
      const [treinamentosData, resumoData] = await Promise.all([
        apiFetch("/treinamentos").catch(() => []),
        apiFetch("/presenca-resumo").catch(() => null),
      ]);

      const listaTreinamentos = Array.isArray(treinamentosData) ? treinamentosData : [];
      const resumoPorId = new Map(
        (Array.isArray(resumoData?.itens) ? resumoData.itens : []).map((r) => [Number(r.id), r])
      );

      let minhas = [];

      if (usuario?.perfil === "instrutor") {
        const nomeUsuario = String(usuario?.nome || "").trim().toLowerCase();
        minhas = listaTreinamentos.filter(
          (t) => String(t.instrutor || "").trim().toLowerCase() === nomeUsuario
        );
      } else {
        // treinando: a turma "é minha" se meu nome aparece no roster dela.
        // Sem uma tabela de matrícula formal, esse é o melhor sinal disponível
        // hoje (mesmo padrão de nome usado no resto do portal).
        const nomeUsuario = String(usuario?.nome || "").trim().toLowerCase();
        const verificacoes = await Promise.all(
          listaTreinamentos.map(async (t) => {
            try {
              const participantes = await apiFetch(`/treinamentos/${t.id}/participantes`).catch(() => []);
              const pertence = (Array.isArray(participantes) ? participantes : []).some(
                (p) => String(p.nome || "").trim().toLowerCase() === nomeUsuario
              );
              return pertence ? t : null;
            } catch {
              return null;
            }
          })
        );
        minhas = verificacoes.filter(Boolean);
      }

      const comResumo = minhas.map((t) => ({
        ...t,
        resumo: resumoPorId.get(Number(t.id)) || null,
      }));

      setTurmas(comResumo);
      setErro("");
    } catch (error) {
      setErro(error.message || "Erro ao carregar suas turmas.");
    } finally {
      setLoading(false);
    }
  }

  const pendentes = turmas.filter((t) => t.resumo?.status_turma === "Chamada pendente").length;

  return (
    <PortalShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Minhas turmas</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#475569" }}>
              {usuario?.nome} · {usuario?.perfil}
            </p>
          </div>
        </div>

        {pendentes > 0 && (
          <div style={{ borderRadius: 12, border: "0.5px solid #fed7aa", background: "#fff7ed", padding: "12px 16px", fontSize: 13, color: "#9a3412", fontWeight: 600 }}>
            Você tem chamada pendente em {pendentes} turma{pendentes > 1 ? "s" : ""} hoje.
          </div>
        )}

        {erro && (
          <div style={{ borderRadius: 12, background: "#fee2e2", color: "#b91c1c", padding: "12px 16px", fontSize: 13 }}>{erro}</div>
        )}

        {loading && <p style={{ fontSize: 13, color: "#475569" }}>Carregando suas turmas...</p>}
        {!loading && turmas.length === 0 && (
          <p style={{ fontSize: 13, color: "#94a3b8" }}>Nenhuma turma encontrada para você no momento.</p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          {turmas.map((t) => (
            <CardTurma key={t.id} turma={t} usuario={usuario} />
          ))}
        </div>
      </div>
    </PortalShell>
  );
}

function CardTurma({ turma, usuario }) {
  const resumo = turma.resumo;
  const status = resumo?.status_turma || "—";
  const taxa = resumo?.taxa_presenca_pessoas ?? resumo?.taxa_presenca ?? 0;
  const cor = corDoCliente(turma.cliente);

  const acaoPrimaria =
    status === "Chamada pendente"
      ? { label: "Fazer chamada", href: `/turma/${turma.id}/mural` }
      : { label: "Ver mural", href: `/turma/${turma.id}/mural` };

  return (
    <div style={{ borderRadius: 12, border: "0.5px solid #e2e8f0", overflow: "hidden", background: "#fff" }}>
      <div style={{ background: cor.bg, padding: "14px 16px" }}>
        <p style={{ margin: 0, fontSize: 12, color: cor.text, fontWeight: 600 }}>{turma.cliente || "—"}</p>
        <p style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{turma.tema || "Turma"}</p>
      </div>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "#475569" }}>
          <span>{status}</span>
          <span>{taxa}% presença</span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(taxa, 100)}%`, background: taxa >= 85 ? "#16a34a" : taxa >= 75 ? "#f59e0b" : "#dc2626" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
          <a
            href={acaoPrimaria.href}
            style={{ flex: 1, textAlign: "center", height: 32, lineHeight: "32px", fontSize: 13, background: "#2563eb", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}
          >
            {acaoPrimaria.label}
          </a>
          <a
            href={`/turma/${turma.id}`}
            style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid #e2e8f0", textDecoration: "none", color: "#475569" }}
          >
            →
          </a>
        </div>
      </div>
    </div>
  );
}
