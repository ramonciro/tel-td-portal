"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { formatDateBR, parseLocalDate } from "../../lib/date";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function formatDateSafe(value) {
  return formatDateBR(value, "-");
}

function getSaudeOperacao(taxaPresenca, nps, qualidade) {
  const presenca = Number(taxaPresenca || 0);
  const npsValor = Number(nps || 0);
  const qualidadeValor = Number(qualidade || 0);

  if (
    presenca >= 90 &&
    (npsValor >= 70 || npsValor === 0) &&
    (qualidadeValor >= 8 || qualidadeValor === 0)
  ) {
    return {
      label: "Estável",
      color: "#166534",
      bg: "#dcfce7",
      border: "#86efac",
      message:
        "A operação apresenta boa tração de presença e execução, sem desvios críticos relevantes no momento.",
    };
  }

  if (presenca >= 80) {
    return {
      label: "Atenção",
      color: "#92400e",
      bg: "#fef3c7",
      border: "#fcd34d",
      message:
        "Há estabilidade parcial, mas já existem sinais que pedem leitura mais próxima de execução, satisfação ou qualidade.",
    };
  }

  return {
    label: "Crítico",
    color: "#b91c1c",
    bg: "#fee2e2",
    border: "#fca5a5",
    message:
      "Os indicadores pedem atuação imediata em presença, chamada diária e fechamento operacional das turmas acompanhadas.",
  };
}

function getPresenceTone(value) {
  const n = Number(value || 0);
  if (n >= 90) {
    return { bg: "#dcfce7", color: "#166534", border: "#86efac", label: "Estável" };
  }
  if (n >= 80) {
    return { bg: "#fef3c7", color: "#92400e", border: "#fcd34d", label: "Atenção" };
  }
  return { bg: "#fee2e2", color: "#b91c1c", border: "#fca5a5", label: "Crítico" };
}

function getRecentMovement(kpis, ultimasTurmas) {
  return [
    {
      title: "Turmas em base",
      value: fmt(kpis.treinamentos || 0),
      detail: "turmas consolidadas no portal",
    },
    {
      title: "Chamadas do dia",
      value: fmt(kpis.treinados || 0),
      detail: "registros diários considerados",
    },
    {
      title: "Última movimentação",
      value: ultimasTurmas?.[0]?.tema || "Sem movimentação",
      detail: ultimasTurmas?.[0]?.cliente || "Sem cliente identificado",
    },
  ];
}

function getFarois(kpis, ultimasTurmas, presencaPorCliente, rankingInstrutores) {
  const farois = [];

  if (Number(kpis.pendentes || 0) > 0) {
    farois.push({
      icon: "🧭",
      title: "Chamada em aberto",
      text: `${fmt(kpis.pendentes)} registro(s) ainda precisam de fechamento operacional.`,
      tone: "warn",
    });
  }

  const clienteCritico = [...(presencaPorCliente || [])]
    .filter((item) => Number(item.total_treinados || 0) > 0)
    .sort((a, b) => Number(a.taxa_presenca || 0) - Number(b.taxa_presenca || 0))[0];

  if (clienteCritico) {
    farois.push({
      icon: "🌊",
      title: "Cliente em atenção",
      text: `${clienteCritico.cliente || "Sem cliente"} com presença em ${Number(clienteCritico.taxa_presenca || 0)}%.`,
      tone: Number(clienteCritico.taxa_presenca || 0) >= 85 ? "soft" : "danger",
    });
  }

  const instrutorCritico = [...(rankingInstrutores || [])]
    .filter((item) => Number(item.total_turmas || 0) > 0)
    .sort((a, b) => Number(a.taxa_presenca || 0) - Number(b.taxa_presenca || 0))[0];

  if (instrutorCritico) {
    farois.push({
      icon: "⛵",
      title: "Instrutor para acompanhar",
      text: `${instrutorCritico.instrutor || "Sem instrutor"} com presença média de ${Number(instrutorCritico.taxa_presenca || 0)}%.`,
      tone: Number(instrutorCritico.taxa_presenca || 0) >= 85 ? "soft" : "warn",
    });
  }

  if (Number(kpis.respostas_nps || 0) === 0) {
    farois.push({
      icon: "⚓",
      title: "Sem leitura de experiência",
      text: "Ainda não há respostas de NPS suficientes para leitura de satisfação.",
      tone: "soft",
    });
  }

  const ultimaTurma = (ultimasTurmas || []).find(
    (item) => Number(item.ausentes || 0) > 0 || Number(item.pendentes || 0) > 0
  );

  if (ultimaTurma) {
    farois.push({
      icon: "🚨",
      title: "Turma com risco recente",
      text: `${ultimaTurma.tema || "Turma"} • ${ultimaTurma.cliente || "Sem cliente"}`,
      tone: "danger",
    });
  }

  if (!farois.length) {
    farois.push({
      icon: "🌤️",
      title: "Leitura estável",
      text: "No momento, não há desvios críticos aparentes nas turmas acompanhadas.",
      tone: "ok",
    });
  }

  return farois.slice(0, 4);
}

function getPriorityList(kpis, ultimasTurmas) {
  const prioridades = [];

  if (Number(kpis.pendentes || 0) > 0) {
    prioridades.push({
      titulo: "Finalizar chamadas pendentes",
      descricao: `${fmt(kpis.pendentes)} registro(s) ainda estão sem fechamento de chamada diária.`,
      tag: "Execução",
    });
  }

  if (Number(kpis.ausentes || 0) > 0) {
    prioridades.push({
      titulo: "Atuar sobre ausências",
      descricao: `${fmt(kpis.ausentes)} ausência(s) registradas nas chamadas diárias das turmas acompanhadas.`,
      tag: "Presença",
    });
  }

  if (Number(kpis.respostas_nps || 0) === 0) {
    prioridades.push({
      titulo: "Ampliar base de satisfação",
      descricao: "Ainda não há respostas de NPS registradas na base para leitura de experiência.",
      tag: "Experiência",
    });
  }

  if (
    Number(kpis.media_qualidade || 0) > 0 &&
    Number(kpis.media_qualidade || 0) < 7
  ) {
    prioridades.push({
      titulo: "Reforçar qualidade dos treinamentos",
      descricao: `A média de qualidade está em ${kpis.media_qualidade}, abaixo do patamar desejado.`,
      tag: "Qualidade",
    });
  }

  const turmaCritica = (ultimasTurmas || []).find(
    (item) => Number(item.ausentes || 0) > 0 || Number(item.pendentes || 0) > 0
  );

  if (turmaCritica) {
    prioridades.push({
      titulo: "Acompanhar turma com maior risco operacional",
      descricao: `${turmaCritica.tema || "Treinamento"} • ${turmaCritica.cliente || "Sem cliente"}`,
      tag: "Turma",
    });
  }

  if (!prioridades.length) {
    prioridades.push({
      titulo: "Operação dentro do esperado",
      descricao: "No momento, não há prioridades críticas abertas no portal.",
      tag: "Status",
    });
  }

  return prioridades.slice(0, 5);
}

function getNarrativaExecutiva(kpis) {
  const frases = [];

  frases.push(
    `A área acumula ${fmt(kpis.treinamentos || 0)} turma(s), com ${fmt(kpis.treinados || 0)} registro(s) de chamada considerados na base diária.`
  );

  if (Number(kpis.taxa_presenca || 0) > 0) {
    frases.push(
      `A presença consolidada está em ${kpis.taxa_presenca}%, com ${fmt(kpis.presentes || 0)} presentes, ${fmt(kpis.ausentes || 0)} ausências e ${fmt(kpis.pendentes || 0)} pendência(s).`
    );
  }

  if (Number(kpis.respostas_nps || 0) > 0) {
    frases.push(
      `A satisfação do treinando registra NPS ${kpis.nps}, com ${fmt(kpis.respostas_nps || 0)} resposta(s) já coletadas.`
    );
  } else {
    frases.push("Ainda não há base consolidada de NPS para leitura de satisfação.");
  }

  if (Number(kpis.media_qualidade || 0) > 0) {
    frases.push(`A qualidade média dos treinamentos está em ${kpis.media_qualidade}.`);
  }

  return frases;
}

export default function InicioPage() {
  const router = useRouter();
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
  const presencaPorCliente = dados?.presenca_por_cliente || [];
  const rankingInstrutores = dados?.ranking_instrutores || [];
  const rankingNps = dados?.ranking_nps || [];
  const ultimasTurmas = dados?.ultimas_turmas || [];

  const saudeOperacao = useMemo(
    () => getSaudeOperacao(kpis.taxa_presenca, kpis.nps, kpis.media_qualidade),
    [kpis]
  );

  const taxaExecucao = useMemo(() => {
    const horasMinistradas = Number(kpis.horas_ministradas || kpis.horas_treinadas || 0);
    const cargaPlanejada = Number(kpis.carga_horaria_total || 0);
    if (!cargaPlanejada) return 0;
    return Math.round((horasMinistradas / cargaPlanejada) * 100);
  }, [kpis]);

  const gapPresenca = useMemo(() => {
    const previstosNoDia = Number(kpis.previstos_no_dia || 0);
    const presentesNoDia = Number(kpis.presentes_no_dia || 0);
    const gap = previstosNoDia - presentesNoDia;
    return gap > 0 ? gap : 0;
  }, [kpis]);

  const farois = useMemo(
    () => getFarois(kpis, ultimasTurmas, presencaPorCliente, rankingInstrutores),
    [kpis, ultimasTurmas, presencaPorCliente, rankingInstrutores]
  );

  const prioridades = useMemo(() => getPriorityList(kpis, ultimasTurmas), [kpis, ultimasTurmas]);
  const narrativaExecutiva = useMemo(() => getNarrativaExecutiva(kpis), [kpis]);
  const movement = useMemo(() => getRecentMovement(kpis, ultimasTurmas), [kpis, ultimasTurmas]);

  const clienteSpotlight = useMemo(() => {
    return [...presencaPorCliente]
      .filter((item) => Number(item.total_treinados || 0) > 0)
      .sort((a, b) => Number(a.taxa_presenca || 0) - Number(b.taxa_presenca || 0))
      .slice(0, 4);
  }, [presencaPorCliente]);

  const rankingNpsTop = useMemo(() => rankingNps.slice(0, 4), [rankingNps]);

  return (
    <PortalShell
      title="Início"
      subtitle="Painel executivo da operação de Treinamento & Desenvolvimento."
    >
      {loading ? (
        <div style={loadingBox}>Carregando visão executiva...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <section style={heroWrap}>
            <div style={heroMain}>
              <div style={heroBadge}>Mesa de comando</div>
              <h2 style={heroTitle}>Panorama executivo da área de T&amp;D</h2>
              <p style={heroText}>
                Uma leitura rápida para decidir prioridades do dia, acompanhar a saúde da operação e abrir os fluxos certos do portal.
              </p>

              <div style={{ ...healthPill, background: saudeOperacao.bg, color: saudeOperacao.color, border: `1px solid ${saudeOperacao.border}` }}>
                {saudeOperacao.label}
              </div>

              <p style={{ ...heroText, marginTop: 14 }}>{saudeOperacao.message}</p>

              <div style={heroActions}>
                <button style={primaryAction} onClick={() => router.push("/dashboard")}>Ver dashboard completo</button>
                <button style={ghostAction} onClick={() => router.push("/gestao-de-turmas")}>Abrir gestão de turmas</button>
                <button style={ghostAction} onClick={() => router.push("/mapa-desenvolvimento")}>Abrir Oceano</button>
              </div>
            </div>

            <div style={heroSide}>
              <div style={heroSideCard}>
                <span style={heroSideLabel}>Execução da grade</span>
                <strong style={heroSideValue}>{taxaExecucao}%</strong>
                <span style={heroSideSub}>horas ministradas em relação à carga horária planejada</span>
              </div>

              <div style={heroSideCard}>
                <span style={heroSideLabel}>Gap de presença</span>
                <strong style={heroSideValue}>{fmt(gapPresenca)}</strong>
                <span style={heroSideSub}>diferença entre previstos no dia e presença efetiva do dia</span>
              </div>

              <div style={heroSideCard}>
                <span style={heroSideLabel}>Carga efetiva</span>
                <strong style={heroSideValue}>{fmt(kpis.horas_treinadas || 0)}h</strong>
                <span style={heroSideSub}>horas realmente assistidas na base acompanhada</span>
              </div>
            </div>
          </section>

          <SectionCard title="Faróis executivos" subtitle="Alertas curtos para orientar sua atuação imediata.">
            <div style={farolGrid}>
              {farois.map((item, index) => (
                <div key={`${item.title}-${index}`} style={{ ...farolCard, ...toneBox(item.tone) }}>
                  <div style={farolIcon}>{item.icon}</div>
                  <div style={farolTitle}>{item.title}</div>
                  <div style={farolText}>{item.text}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <div style={gridFive}>
            <StatCard title="Turmas" value={fmt(kpis.treinamentos || 0)} subtitle="Volume consolidado" accent="#2563eb" />
            <StatCard title="Registros de chamada" value={fmt(kpis.treinados || 0)} subtitle="Base real diária" accent="#06b6d4" />
            <StatCard title="Presença" value={`${kpis.taxa_presenca || 0}%`} subtitle="Presença diária consolidada" accent="#0891b2" />
            <StatCard title="NPS" value={kpis.nps || 0} subtitle="Satisfação do treinando" accent="#1d4ed8" />
            <StatCard title="Qualidade" value={kpis.media_qualidade || 0} subtitle="Aproveitamento médio" accent="#059669" />
          </div>

          <div style={threeColumns}>
            <SectionCard title="Narrativa executiva" subtitle="Leitura pronta para acompanhamento gerencial.">
              <div style={narrativeGrid}>
                {narrativaExecutiva.map((item, index) => (
                  <div key={index} style={narrativeItem}>{item}</div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Prioridades imediatas" subtitle="Os focos mais relevantes para o dia.">
              <div style={priorityGrid}>
                {prioridades.map((item, index) => (
                  <div key={index} style={priorityItem}>
                    <div style={priorityHeader}>
                      <span style={priorityTag}>{item.tag}</span>
                      <strong style={priorityTitle}>{item.titulo}</strong>
                    </div>
                    <div style={priorityDescription}>{item.descricao}</div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Movimento recente" subtitle="O que mais importa na leitura rápida do momento.">
              <div style={movementGrid}>
                {movement.map((item) => (
                  <div key={item.title} style={movementCard}>
                    <div style={movementTitle}>{item.title}</div>
                    <div style={movementValue}>{item.value}</div>
                    <div style={movementDetail}>{item.detail}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div style={twoCol}>
            <SectionCard title="Clientes em destaque" subtitle="Leitura de presença dos clientes que mais pedem atenção.">
              {clienteSpotlight.length ? (
                <div style={spotlightGrid}>
                  {clienteSpotlight.map((item, index) => {
                    const tone = getPresenceTone(item.taxa_presenca);
                    return (
                      <div key={`${item.cliente}-${index}`} style={spotlightCard}>
                        <div style={spotlightHeader}>
                          <div style={spotlightTitle}>{item.cliente || "Sem cliente"}</div>
                          <div style={{ ...miniBadge, background: tone.bg, color: tone.color, border: `1px solid ${tone.border}` }}>
                            {Number(item.taxa_presenca || 0)}%
                          </div>
                        </div>
                        <div style={spotlightMeta}>
                          {fmt(item.total_treinados || 0)} registro(s) • {fmt(item.presentes || 0)} presentes • {fmt(item.ausentes || 0)} ausentes
                        </div>
                        <div style={spotlightStatus}>{tone.label}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={emptyText}>Sem clientes com chamada registrada no momento.</div>
              )}
            </SectionCard>

            <SectionCard title="Satisfação em foco" subtitle="Clientes com leitura disponível de experiência do treinando.">
              {rankingNpsTop.length ? (
                <div style={spotlightGrid}>
                  {rankingNpsTop.map((item, index) => (
                    <div key={`${item.cliente}-${index}`} style={spotlightCard}>
                      <div style={spotlightHeader}>
                        <div style={spotlightTitle}>{item.cliente || "Sem cliente"}</div>
                        <div style={{ ...miniBadge, background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>{Number(item.nps || 0)}</div>
                      </div>
                      <div style={spotlightMeta}>{fmt(item.respostas || 0)} resposta(s) de NPS registradas.</div>
                      <div style={spotlightStatus}>Experiência medida</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyText}>Sem ranking de NPS no momento.</div>
              )}
            </SectionCard>
          </div>

          <div style={twoCol}>
            <SectionCard title="Ranking de instrutores" subtitle="Produtividade por turma e presença consolidada.">
              {rankingInstrutores.length ? (
                <div style={listGrid}>
                  {rankingInstrutores.slice(0, 6).map((item, index) => (
                    <div key={index} style={listItem}>
                      <div style={itemHeader}>
                        <div style={itemTitle}>{item.instrutor || "Sem instrutor"}</div>
                        <div style={itemBadgePurple}>{Number(item.taxa_presenca || 0)}%</div>
                      </div>
                      <div style={itemMeta}>
                        {fmt(item.total_turmas || 0)} turma(s) • {fmt(item.total_treinados || 0)} registro(s) • {fmt(item.presentes || 0)} presentes
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyText}>Sem dados de instrutores no momento.</div>
              )}
            </SectionCard>

            <SectionCard title="Últimas turmas" subtitle="Resumo operacional das turmas mais recentes.">
              {ultimasTurmas.length ? (
                <div style={ultimasTurmasGrid}>
                  {ultimasTurmas.slice(0, 6).map((item) => (
                    <div key={item.id} style={turmaResumoCard}>
                      <div style={turmaResumoTop}>
                        <div>
                          <div style={turmaResumoTitulo}>{item.tema || "Turma"}</div>
                          <div style={turmaResumoMeta}>{(item.cliente || "Sem cliente") + " • " + (item.instrutor || "Sem instrutor")}</div>
                        </div>
                        <div style={turmaResumoData}>{formatDateSafe(item.data_inicio || item.data)}</div>
                      </div>

                      <div style={turmaResumoNumbers}>
                        <div style={turmaMiniBox}>
                          <span style={turmaMiniLabel}>Base</span>
                          <strong style={turmaMiniValue}>{fmt(item.treinados || 0)}</strong>
                        </div>
                        <div style={turmaMiniBox}>
                          <span style={turmaMiniLabel}>Presentes</span>
                          <strong style={turmaMiniValue}>{fmt(item.presentes || 0)}</strong>
                        </div>
                        <div style={turmaMiniBox}>
                          <span style={turmaMiniLabel}>Pendentes</span>
                          <strong style={turmaMiniValue}>{fmt(item.pendentes || 0)}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyText}>Sem turmas recentes para exibir.</div>
              )}
            </SectionCard>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

function toneBox(tone) {
  const map = {
    ok: { background: "#f0fdf4", border: "#bbf7d0", color: "#166534" },
    soft: { background: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8" },
    warn: { background: "#fff7ed", border: "#fed7aa", color: "#c2410c" },
    danger: { background: "#fef2f2", border: "#fecaca", color: "#b91c1c" },
  };
  return map[tone] || map.soft;
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
  gridTemplateColumns: "1.45fr .95fr",
  gap: 14,
};

const heroMain = {
  background: "linear-gradient(135deg, #082f49 0%, #0f172a 45%, #1d4ed8 100%)",
  borderRadius: 24,
  padding: 24,
  color: "#ffffff",
  boxShadow: "0 18px 36px rgba(15, 23, 42, 0.22)",
  display: "grid",
  gap: 10,
};

const heroBadge = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,.14)",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".06em",
  width: "fit-content",
};

const heroTitle = {
  margin: 0,
  fontSize: 31,
  lineHeight: 1.08,
};

const heroText = {
  margin: 0,
  color: "rgba(255,255,255,.86)",
  lineHeight: 1.65,
};

const healthPill = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 12px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 12,
  width: "fit-content",
};

const heroActions = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 8,
};

const primaryAction = {
  border: "none",
  background: "#ffffff",
  color: "#0f172a",
  borderRadius: 12,
  padding: "11px 14px",
  fontWeight: 800,
  cursor: "pointer",
};

const ghostAction = {
  border: "1px solid rgba(255,255,255,.18)",
  background: "rgba(255,255,255,.08)",
  color: "#ffffff",
  borderRadius: 12,
  padding: "11px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const heroSide = {
  display: "grid",
  gap: 12,
};

const heroSideCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 20,
  padding: 18,
  display: "grid",
  gap: 6,
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
};

const heroSideLabel = {
  color: "#475569",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const heroSideValue = {
  fontSize: 30,
  lineHeight: 1,
  color: "#0f172a",
};

const heroSideSub = {
  color: "#64748b",
  lineHeight: 1.5,
  fontSize: 13,
};

const farolGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const farolCard = {
  borderRadius: 18,
  border: "1px solid",
  padding: 16,
  display: "grid",
  gap: 8,
};

const farolIcon = { fontSize: 22 };
const farolTitle = { fontWeight: 900, fontSize: 15 };
const farolText = { fontSize: 13, lineHeight: 1.55 };

const gridFive = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 14,
};

const threeColumns = {
  display: "grid",
  gridTemplateColumns: "1.1fr 1fr .9fr",
  gap: 14,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const narrativeGrid = { display: "grid", gap: 10 };
const narrativeItem = {
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  padding: 14,
  color: "#334155",
  lineHeight: 1.6,
};

const priorityGrid = { display: "grid", gap: 10 };
const priorityItem = {
  borderRadius: 16,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid #dbeafe",
  padding: 14,
  display: "grid",
  gap: 8,
};

const priorityHeader = { display: "grid", gap: 6 };
const priorityTag = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "fit-content",
  padding: "5px 8px",
  borderRadius: 999,
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 11,
};
const priorityTitle = { color: "#0f172a", fontSize: 15 };
const priorityDescription = { color: "#475569", lineHeight: 1.55, fontSize: 13 };

const movementGrid = { display: "grid", gap: 10 };
const movementCard = {
  borderRadius: 16,
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  padding: 14,
  display: "grid",
  gap: 6,
};
const movementTitle = { color: "#64748b", fontSize: 12, fontWeight: 800, textTransform: "uppercase" };
const movementValue = { color: "#0f172a", fontSize: 20, fontWeight: 900 };
const movementDetail = { color: "#475569", fontSize: 13, lineHeight: 1.5 };

const spotlightGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};
const spotlightCard = {
  borderRadius: 18,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid #e2e8f0",
  padding: 16,
  display: "grid",
  gap: 10,
};
const spotlightHeader = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" };
const spotlightTitle = { fontWeight: 900, color: "#0f172a", fontSize: 15 };
const spotlightMeta = { color: "#475569", fontSize: 13, lineHeight: 1.5 };
const spotlightStatus = { color: "#64748b", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em" };
const miniBadge = {
  borderRadius: 999,
  padding: "6px 10px",
  fontWeight: 800,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const listGrid = { display: "grid", gap: 10 };
const listItem = {
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  padding: 14,
  display: "grid",
  gap: 8,
};
const itemHeader = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" };
const itemTitle = { color: "#0f172a", fontWeight: 900, fontSize: 15 };
const itemMeta = { color: "#64748b", lineHeight: 1.5, fontSize: 13 };
const itemBadgeBlue = { ...miniBadge, background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe" };
const itemBadgePurple = { ...miniBadge, background: "#ede9fe", color: "#6d28d9", border: "1px solid #ddd6fe" };

const ultimasTurmasGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};
const turmaResumoCard = {
  borderRadius: 18,
  border: "1px solid #dbeafe",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  padding: 16,
  display: "grid",
  gap: 12,
};
const turmaResumoTop = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" };
const turmaResumoTitulo = { color: "#0f172a", fontSize: 16, fontWeight: 900 };
const turmaResumoMeta = { color: "#64748b", fontSize: 13, lineHeight: 1.5, marginTop: 4 };
const turmaResumoData = { color: "#1d4ed8", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" };
const turmaResumoNumbers = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 };
const turmaMiniBox = { borderRadius: 14, background: "#ffffff", border: "1px solid #e2e8f0", padding: 12, display: "grid", gap: 4 };
const turmaMiniLabel = { color: "#64748b", fontSize: 11, fontWeight: 800, textTransform: "uppercase" };
const turmaMiniValue = { color: "#0f172a", fontSize: 18, fontWeight: 900 };

const emptyText = {
  padding: 18,
  borderRadius: 16,
  border: "1px dashed #cbd5e1",
  background: "#f8fafc",
  color: "#64748b",
  textAlign: "center",
};
