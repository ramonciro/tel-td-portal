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

function getBadgeStyleByTax(value) {
  const taxa = Number(value || 0);

  if (taxa >= 90) {
    return { background: "#dcfce7", color: "#166534", border: "#86efac", label: "Estável" };
  }

  if (taxa >= 75) {
    return { background: "#fef3c7", color: "#92400e", border: "#fcd34d", label: "Atenção" };
  }

  return { background: "#fee2e2", color: "#b91c1c", border: "#fca5a5", label: "Crítico" };
}

function buildLeituraGerencial(kpis) {
  const taxaPresenca = Number(kpis.taxa_presenca || 0);
  const taxaExecucao = Number(kpis.taxa_execucao_diaria || 0);
  const gapDiario = Number(kpis.gap_diario || 0);
  const pendentes = Number(kpis.pendentes || 0);
  const treinamentos = Number(kpis.treinamentos || 0);
  const registros = Number(kpis.treinados || 0);
  const capacidadeDiaria = Number(kpis.capacidade_diaria_prevista || 0);
  const nps = Number(kpis.nps || 0);

  const alertas = [];

  if (treinamentos === 0) {
    alertas.push({ tone: "soft", title: "Base sem turmas", text: "Ainda não há treinamentos cadastrados no portal." });
  }

  if (registros === 0 && treinamentos > 0) {
    alertas.push({ tone: "warn", title: "Chamada ainda não refletida", text: "Existem turmas cadastradas sem chamada diária registrada." });
  }

  if (capacidadeDiaria > 0 && gapDiario > 0) {
    alertas.push({ tone: "warn", title: "Gap diário aberto", text: `${fmt(gapDiario)} registro(s) ainda faltam para fechar a capacidade diária prevista.` });
  }

  if (pendentes > 0) {
    alertas.push({ tone: "danger", title: "Pendências operacionais", text: `${fmt(pendentes)} registro(s) seguem pendentes na chamada diária.` });
  }

  if (capacidadeDiaria > 0 && taxaExecucao < 90) {
    alertas.push({ tone: "warn", title: "Execução abaixo do ideal", text: `A taxa de execução diária está em ${fmt(taxaExecucao)}%, abaixo do patamar esperado.` });
  }

  if (taxaPresenca < 85 && registros > 0) {
    alertas.push({ tone: "danger", title: "Presença em atenção", text: `A taxa geral de presença está em ${fmt(taxaPresenca)}%, abaixo do nível desejado.` });
  }

  if (nps > 0 && nps < 60) {
    alertas.push({ tone: "warn", title: "Experiência do treinando", text: `O NPS atual está em ${fmt(nps)}, pedindo leitura mais próxima da experiência.` });
  }

  if (!alertas.length) {
    alertas.push({ tone: "ok", title: "Leitura estável", text: "Indicadores sem desvios críticos aparentes no momento." });
  }

  return alertas.slice(0, 5);
}

export default function DashboardPage() {
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
        setErro(error.message || "Erro ao carregar dashboard.");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const kpis = dados?.kpis || {};
  const presencaPorCliente = dados?.presenca_por_cliente || [];
  const rankingInstrutores = dados?.ranking_instrutores || [];
  const ultimasTurmas = dados?.ultimas_turmas || [];
  const rankingNps = dados?.ranking_nps || [];

  const leituraGerencial = useMemo(() => buildLeituraGerencial(kpis), [kpis]);

  const resumoOperacao = useMemo(() => {
    return [
      { label: "clientes da carteira", value: fmt(kpis.clientes_ativos || 0) },
      { label: "clientes com treinamento", value: fmt(kpis.clientes_com_treinamento || 0) },
      { label: "presença diária consolidada", value: `${fmt(kpis.taxa_presenca || 0)}%` },
      { label: "fechamento da chamada diária", value: `${fmt(kpis.taxa_conclusao_chamada || 0)}%` },
    ];
  }, [kpis]);

  const clientesSaude = useMemo(() => {
    return [...presencaPorCliente]
      .filter((item) => Number(item.total_treinados || 0) > 0)
      .sort((a, b) => Number(a.taxa_presenca || 0) - Number(b.taxa_presenca || 0))
      .slice(0, 6);
  }, [presencaPorCliente]);

  return (
    <PortalShell
      title="Dashboard"
      subtitle="Painel analítico de Treinamento & Desenvolvimento com leitura executiva, capacidade e performance por operação."
    >
      {loading ? (
        <div style={loadingBox}>Carregando dashboard...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <section style={heroWrap}>
            <div style={heroMain}>
              <div style={heroBadge}>Centro analítico</div>
              <h2 style={heroTitle}>Dashboard de execução de treinamentos</h2>
              <p style={heroText}>
                Uma leitura mais profunda para comparar volume, presença, execução, capacidade e resultados por cliente, instrutor e turma.
              </p>
            </div>

            <div style={heroMiniGrid}>
              {resumoOperacao.map((item) => (
                <div key={item.label} style={heroMiniCard}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </section>

          <SectionCard title="KPIs mestre" subtitle="Os indicadores mais importantes para leitura rápida da operação.">
            <div style={gridSix}>
              <StatCard title="Turmas" value={fmt(kpis.treinamentos || 0)} subtitle="Base total cadastrada" accent="#2563eb" />
              <StatCard title="Registros de chamada" value={fmt(kpis.treinados || 0)} subtitle="Base real diária" accent="#3b82f6" />
              <StatCard title="TX. Presença" value={`${fmt(kpis.taxa_presenca || 0)}%`} subtitle="Presença consolidada" accent="#0891b2" />
              <StatCard title="TX. Execução" value={`${fmt(kpis.taxa_execucao_diaria || 0)}%`} subtitle="Execução diária" accent="#7c3aed" />
              <StatCard title="NPS" value={fmt(kpis.nps || 0)} subtitle="Experiência do treinando" accent="#14b8a6" />
              <StatCard title="Qualidade" value={fmt(kpis.media_qualidade || 0)} subtitle="Aproveitamento médio" accent="#059669" />
            </div>
          </SectionCard>

          <SectionCard title="Capacidade e execução" subtitle="Leitura da capacidade planejada versus o que já foi executado e fechado na rotina.">
            <div style={gridSix}>
              <StatCard title="Treinandos previstos" value={fmt(kpis.participantes_previstos || 0)} subtitle="Capacidade planejada" accent="#6366f1" />
              <StatCard title="Carga horária" value={`${fmt(kpis.carga_horaria_total || 0)}h`} subtitle="Carga total planejada" accent="#06b6d4" />
              <StatCard title="Horas assistidas" value={`${fmt(kpis.horas_treinadas || 0)}h`} subtitle="Carga efetivamente executada" accent="#0ea5e9" />
              <StatCard title="Capacidade diária" value={fmt(kpis.capacidade_diaria_prevista || 0)} subtitle="Participantes × dias das turmas" accent="#8b5cf6" />
              <StatCard title="Gap diário" value={fmt(kpis.gap_diario || 0)} subtitle="Capacidade ainda sem registro" accent="#f97316" />
              <StatCard title="Pendentes" value={fmt(kpis.pendentes || 0)} subtitle="Registros em aberto" accent="#64748b" />
            </div>
          </SectionCard>

          <SectionCard title="Faróis gerenciais" subtitle="Leituras prontas para acompanhamento e tomada de decisão.">
            <div style={alertsGrid}>
              {leituraGerencial.map((item, index) => (
                <div key={`${item.title}-${index}`} style={{ ...alertItem, ...toneBox(item.tone) }}>
                  <div style={alertTitle}>{item.title}</div>
                  <div style={alertText}>{item.text}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          <div style={twoColumns}>
            <SectionCard title="Saúde por cliente" subtitle="Clientes com base ativa e leitura resumida de presença e operação.">
              <div style={clientGrid}>
                {clientesSaude.length ? (
                  clientesSaude.map((item) => {
                    const badgeStyle = getBadgeStyleByTax(item.taxa_presenca);
                    return (
                      <div key={item.cliente} style={clientCard}>
                        <div style={clientHeader}>
                          <div>
                            <div style={rowTitle}>{item.cliente}</div>
                            <div style={rowMeta}>{fmt(item.total_treinados)} treinando(s) • {fmt(item.presentes)} presentes • {fmt(item.ausentes)} ausentes</div>
                          </div>
                          <div style={{ ...pill, background: badgeStyle.background, color: badgeStyle.color, border: `1px solid ${badgeStyle.border}` }}>
                            {fmt(item.taxa_presenca)}%
                          </div>
                        </div>
                        <div style={clientFooter}>{badgeStyle.label} • {fmt(item.pendentes)} pendente(s) • {fmt(item.justificados)} justificado(s)</div>
                      </div>
                    );
                  })
                ) : (
                  <div style={emptyState}>Sem dados por cliente.</div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Ranking de instrutores" subtitle="Produtividade por turma e presença consolidada.">
              <div style={listGrid}>
                {rankingInstrutores.length ? (
                  rankingInstrutores.map((item) => {
                    const badgeStyle = getBadgeStyleByTax(item.taxa_presenca);
                    return (
                      <div key={item.instrutor} style={listRow}>
                        <div>
                          <div style={rowTitle}>{item.instrutor}</div>
                          <div style={rowMeta}>{fmt(item.total_turmas)} turma(s) • {fmt(item.total_treinados)} treinando(s) • {fmt(item.presentes)} presentes</div>
                        </div>
                        <div style={{ ...pill, background: badgeStyle.background, color: badgeStyle.color, border: `1px solid ${badgeStyle.border}` }}>
                          {fmt(item.taxa_presenca)}%
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={emptyState}>Sem dados de instrutores.</div>
                )}
              </div>
            </SectionCard>
          </div>

          <div style={twoColumns}>
            <SectionCard title="Satisfação por cliente" subtitle="Clientes com base de NPS já registrada.">
              <div style={listGrid}>
                {rankingNps.length ? (
                  rankingNps.map((item) => (
                    <div key={`${item.cliente}-${item.nps}`} style={listRow}>
                      <div>
                        <div style={rowTitle}>{item.cliente}</div>
                        <div style={rowMeta}>{fmt(item.respostas || 0)} resposta(s) de NPS</div>
                      </div>
                      <div style={{ ...pill, background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
                        {fmt(item.nps)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyState}>Sem dados de satisfação.</div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Últimas turmas" subtitle="Resumo operacional das turmas mais recentes.">
              {ultimasTurmas.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Turma</th>
                        <th style={th}>Cliente</th>
                        <th style={th}>Instrutor</th>
                        <th style={th}>Data</th>
                        <th style={th}>Base ativa</th>
                        <th style={th}>Presentes</th>
                        <th style={th}>Ausentes</th>
                        <th style={th}>Justificados</th>
                        <th style={th}>Pendentes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ultimasTurmas.map((item) => (
                        <tr key={item.id}>
                          <td style={td}>{item.tema || "-"}</td>
                          <td style={td}>{item.cliente || "-"}</td>
                          <td style={td}>{item.instrutor || "-"}</td>
                          <td style={td}>{formatDate(item.data)}</td>
                          <td style={td}>{fmt(item.treinados || 0)}</td>
                          <td style={td}>{fmt(item.presentes || 0)}</td>
                          <td style={td}>{fmt(item.ausentes || 0)}</td>
                          <td style={td}>{fmt(item.justificados || 0)}</td>
                          <td style={td}>{fmt(item.pendentes || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={emptyState}>Sem turmas recentes para exibir.</div>
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
  gridTemplateColumns: "1.35fr 1fr",
  gap: 14,
};

const heroMain = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 22,
  padding: 22,
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
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 10,
};

const heroTitle = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.1,
};

const heroText = {
  margin: "10px 0 0",
  color: "rgba(255,255,255,.86)",
  lineHeight: 1.6,
};

const heroMiniGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const heroMiniCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 18,
  display: "grid",
  gap: 6,
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)",
};

const gridSix = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 14,
};

const twoColumns = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const alertsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 10,
};

const alertItem = {
  borderRadius: 16,
  border: "1px solid",
  padding: 14,
  display: "grid",
  gap: 8,
};

const alertTitle = { fontWeight: 900, fontSize: 14 };
const alertText = { lineHeight: 1.55, fontSize: 13 };

const clientGrid = { display: "grid", gap: 12 };
const clientCard = {
  borderRadius: 18,
  border: "1px solid #e2e8f0",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  padding: 16,
  display: "grid",
  gap: 10,
};
const clientHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 };
const clientFooter = { color: "#64748b", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em" };

const listGrid = { display: "grid", gap: 12 };
const listRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "12px 0",
  borderBottom: "1px solid #f1f5f9",
};

const rowTitle = {
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 16,
};

const rowMeta = {
  marginTop: 4,
  color: "#64748b",
  lineHeight: 1.5,
};

const pill = {
  padding: "7px 10px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "1px solid #e2e8f0",
  color: "#475569",
  fontSize: 13,
};

const td = {
  padding: "12px 10px",
  borderBottom: "1px solid #f1f5f9",
  color: "#0f172a",
  fontSize: 14,
};

const emptyState = {
  padding: 16,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
  color: "#64748b",
  textAlign: "center",
};
