"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
}

function getBadgeStyleByTax(value) {
  const taxa = Number(value || 0);

  if (taxa >= 90) {
    return { background: "#dcfce7", color: "#166534" };
  }

  if (taxa >= 75) {
    return { background: "#fef3c7", color: "#92400e" };
  }

  return { background: "#fee2e2", color: "#b91c1c" };
}

function getResumoStatus(kpis) {
  const taxaExecucao = Number(kpis.taxa_execucao_diaria || 0);
  const taxaPresenca = Number(kpis.taxa_presenca || 0);
  const gapDiario = Number(kpis.gap_diario || 0);
  const pendentes = Number(kpis.pendentes || 0);

  if (gapDiario > 0 || pendentes > 0 || taxaExecucao < 85 || taxaPresenca < 80) {
    return {
      rotulo: "Crítico",
      texto:
        "Os indicadores apontam necessidade de atuação imediata na execução das turmas e no fechamento das chamadas diárias.",
      estilo: badgeCritico,
    };
  }

  if (taxaExecucao < 95 || taxaPresenca < 90) {
    return {
      rotulo: "Atenção",
      texto:
        "Os indicadores mostram avanço operacional, porém ainda existem pontos de ajuste para estabilizar a rotina.",
      estilo: badgeAtencao,
    };
  }

  return {
    rotulo: "Estável",
    texto:
      "A operação apresenta boa aderência entre capacidade diária, registros lançados e presença consolidada.",
    estilo: badgeEstavel,
  };
}

export default function InicioPage() {
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
        setErro(error.message || "Erro ao carregar painel inicial.");
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

  const resumo = useMemo(() => getResumoStatus(kpis), [kpis]);

  const focosImediatos = useMemo(() => {
    const itens = [];

    if (Number(kpis.gap_diario || 0) > 0) {
      itens.push(
        `${fmt(kpis.gap_diario)} registro(s) ainda faltam para fechar a capacidade diária prevista.`
      );
    }

    if (Number(kpis.pendentes || 0) > 0) {
      itens.push(
        `${fmt(kpis.pendentes)} registro(s) seguem pendentes na chamada diária.`
      );
    }

    if (Number(kpis.taxa_execucao_diaria || 0) < 90) {
      itens.push(
        `A taxa de execução diária está em ${fmt(kpis.taxa_execucao_diaria || 0)}%, abaixo do ideal operacional.`
      );
    }

    if (Number(kpis.taxa_presenca || 0) < 85) {
      itens.push(
        `A taxa de presença consolidada está em ${fmt(kpis.taxa_presenca || 0)}%, demandando acompanhamento.`
      );
    }

    if (!itens.length) {
      itens.push("Sem alertas críticos no momento. Acompanhar manutenção da rotina.");
    }

    return itens;
  }, [kpis]);

  return (
    <PortalShell
      title="Início"
      subtitle="Painel executivo da operação de Treinamento & Desenvolvimento."
    >
      {loading ? (
        <div style={loadingBox}>Carregando painel inicial...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <>
          <div style={heroWrap}>
            <div style={heroMain}>
              <div style={heroBadge}>Resumo executivo</div>
              <h2 style={heroTitle}>Panorama estratégico da área de T&D</h2>
              <p style={heroText}>
                Acompanhe execução, presença diária, satisfação e qualidade em uma
                visão pensada para acompanhamento gerencial e apresentação de resultados.
              </p>

              <div style={heroStatusRow}>
                <span style={resumo.estilo}>{resumo.rotulo}</span>
              </div>

              <p style={heroInsight}>{resumo.texto}</p>
            </div>

            <div style={heroSide}>
              <div style={sideCard}>
                <div style={sideTitle}>Taxa de execução diária</div>
                <div style={sideValue}>{fmt(kpis.taxa_execucao_diaria || 0)}%</div>
                <div style={sideText}>
                  relação entre registros lançados e capacidade diária prevista
                </div>
              </div>

              <div style={sideCard}>
                <div style={sideTitle}>Gap diário</div>
                <div style={sideValue}>{fmt(kpis.gap_diario || 0)}</div>
                <div style={sideText}>
                  diferença entre capacidade diária prevista e registros realizados
                </div>
              </div>

              <div style={sideCard}>
                <div style={sideTitle}>Carga efetiva</div>
                <div style={sideValue}>{fmt(kpis.horas_treinadas || 0)}h</div>
                <div style={sideText}>
                  horas realmente assistidas na base acompanhada
                </div>
              </div>
            </div>
          </div>

          <div style={gridFour}>
            <StatCard
              title="Turmas"
              value={fmt(kpis.treinamentos || 0)}
              subtitle="Volume consolidado"
              accent="#2563eb"
            />
            <StatCard
              title="Registros de chamada"
              value={fmt(kpis.treinados || 0)}
              subtitle="Base real diária"
              accent="#3b82f6"
            />
            <StatCard
              title="Presença"
              value={`${fmt(kpis.taxa_presenca || 0)}%`}
              subtitle="Presença diária consolidada"
              accent="#06b6d4"
            />
            <StatCard
              title="NPS"
              value={fmt(kpis.nps || 0)}
              subtitle="Satisfação do treinando"
              accent="#6366f1"
            />
          </div>

          <div style={gridFour}>
            <StatCard
              title="Presentes"
              value={fmt(kpis.presentes || 0)}
              subtitle="Presença confirmada"
              accent="#16a34a"
            />
            <StatCard
              title="Ausentes"
              value={fmt(kpis.ausentes || 0)}
              subtitle="Não compareceram"
              accent="#ef4444"
            />
            <StatCard
              title="Justificados"
              value={fmt(kpis.justificados || 0)}
              subtitle="Com justificativa"
              accent="#f59e0b"
            />
            <StatCard
              title="Pendentes"
              value={fmt(kpis.pendentes || 0)}
              subtitle="Chamada em aberto"
              accent="#64748b"
            />
          </div>

          <div style={gridFour}>
            <StatCard
              title="Capacidade planejada"
              value={fmt(kpis.participantes_previstos || 0)}
              subtitle="Base prevista"
              accent="#4f46e5"
            />
            <StatCard
              title="Capacidade diária"
              value={fmt(kpis.capacidade_diaria_prevista || 0)}
              subtitle="Participantes × dias das turmas"
              accent="#8b5cf6"
            />
            <StatCard
              title="Carga planejada"
              value={`${fmt(kpis.carga_horaria_total || 0)}h`}
              subtitle="Carga consolidada"
              accent="#0ea5e9"
            />
            <StatCard
              title="Horas assistidas"
              value={`${fmt(kpis.horas_treinadas || 0)}h`}
              subtitle="Execução real"
              accent="#14b8a6"
            />
          </div>

          <div style={twoColumns}>
            <SectionCard
              title="Narrativa executiva"
              subtitle="Leitura pronta para acompanhamento gerencial."
            >
              <div style={narrativaGrid}>
                <div style={narrativaRow}>
                  <strong>Clientes da carteira:</strong> {fmt(kpis.clientes_ativos || 0)}
                </div>
                <div style={narrativaRow}>
                  <strong>Clientes com treinamento:</strong>{" "}
                  {fmt(kpis.clientes_com_treinamento || 0)}
                </div>
                <div style={narrativaRow}>
                  <strong>Média por turma:</strong>{" "}
                  {fmt(kpis.media_participantes_por_turma || 0)}
                </div>
                <div style={narrativaRow}>
                  <strong>Respostas de NPS:</strong>{" "}
                  {fmt(kpis.respostas_nps || 0)}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Prioridades imediatas"
              subtitle="Focos de atuação para a rotina da área."
            >
              <div style={alertsGrid}>
                {focosImediatos.map((item, index) => (
                  <div key={`${item}-${index}`} style={alertItem}>
                    {item}
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div style={twoColumns}>
            <SectionCard
              title="Presença por cliente"
              subtitle="Leitura consolidada por cliente com base ativa."
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
                            {fmt(item.total_treinados)} treinando(s) •{" "}
                            {fmt(item.presentes)} presentes •{" "}
                            {fmt(item.ausentes)} ausentes •{" "}
                            {fmt(item.justificados)} justificados •{" "}
                            {fmt(item.pendentes)} pendentes
                          </div>
                        </div>

                        <div style={{ ...pill, ...badgeStyle }}>
                          {fmt(item.taxa_presenca)}%
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={emptyState}>Sem dados por cliente.</div>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Ranking de instrutores"
              subtitle="Produtividade por turma e presença consolidada."
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
                            {fmt(item.total_turmas)} turma(s) •{" "}
                            {fmt(item.total_treinados)} treinando(s) •{" "}
                            {fmt(item.presentes)} presentes
                          </div>
                        </div>

                        <div style={{ ...pill, ...badgeStyle }}>
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

          <SectionCard
            title="Últimas turmas"
            subtitle="Resumo operacional das turmas mais recentes."
          >
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
        </>
      )}
    </PortalShell>
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
  gridTemplateColumns: "1.5fr 1fr",
  gap: 14,
  marginBottom: 14,
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

const heroStatusRow = {
  marginTop: 18,
  marginBottom: 12,
};

const heroInsight = {
  margin: 0,
  color: "rgba(255,255,255,.95)",
  fontSize: 16,
  lineHeight: 1.6,
};

const heroSide = {
  display: "grid",
  gap: 12,
};

const sideCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 18,
  display: "grid",
  gap: 6,
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)",
};

const sideTitle = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "#475569",
};

const sideValue = {
  fontSize: 28,
  fontWeight: 800,
  color: "#0f172a",
};

const sideText = {
  color: "#64748b",
  lineHeight: 1.5,
};

const gridFour = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14,
  marginBottom: 14,
};

const twoColumns = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
  marginBottom: 14,
};

const narrativaGrid = {
  display: "grid",
  gap: 12,
};

const narrativaRow = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  color: "#334155",
};

const alertsGrid = {
  display: "grid",
  gap: 10,
};

const alertItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  color: "#334155",
  lineHeight: 1.5,
  fontWeight: 600,
};

const listGrid = {
  display: "grid",
  gap: 12,
};

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

const badgeCritico = {
  display: "inline-block",
  padding: "6px 12px",
  borderRadius: 999,
  background: "#fee2e2",
  color: "#b91c1c",
  fontWeight: 800,
};

const badgeAtencao = {
  display: "inline-block",
  padding: "6px 12px",
  borderRadius: 999,
  background: "#fef3c7",
  color: "#92400e",
  fontWeight: 800,
};

const badgeEstavel = {
  display: "inline-block",
  padding: "6px 12px",
  borderRadius: 999,
  background: "#dcfce7",
  color: "#166534",
  fontWeight: 800,
};
