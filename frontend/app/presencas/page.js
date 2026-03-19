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

  const leituraGerencial = useMemo(() => {
    const taxaPresenca = Number(kpis.taxa_presenca || 0);
    const taxaExecucao = Number(kpis.taxa_execucao_diaria || 0);
    const gapDiario = Number(kpis.gap_diario || 0);
    const pendentes = Number(kpis.pendentes || 0);
    const treinamentos = Number(kpis.treinamentos || 0);
    const registros = Number(kpis.treinados || 0);

    const alertas = [];

    if (treinamentos === 0) {
      alertas.push("Ainda não há treinamentos cadastrados no portal.");
    }

    if (registros === 0 && treinamentos > 0) {
      alertas.push("Existem turmas cadastradas sem chamada diária registrada.");
    }

    if (gapDiario > 0) {
      alertas.push(
        `${fmt(gapDiario)} registro(s) ainda faltam para fechar a capacidade diária planejada.`
      );
    }

    if (pendentes > 0) {
      alertas.push(
        `${fmt(pendentes)} registro(s) seguem pendentes na chamada diária.`
      );
    }

    if (taxaExecucao < 90 && Number(kpis.capacidade_diaria_prevista || 0) > 0) {
      alertas.push(
        `A taxa de execução diária está em ${taxaExecucao}%, abaixo do ideal operacional.`
      );
    }

    if (taxaPresenca < 85 && registros > 0) {
      alertas.push(
        `A taxa geral de presença está em ${taxaPresenca}%, abaixo do patamar esperado.`
      );
    }

    if (!alertas.length) {
      alertas.push("Indicadores estáveis e sem desvios críticos no momento.");
    }

    return alertas;
  }, [kpis]);

  return (
    <PortalShell
      title="Dashboard"
      subtitle="Painel executivo de Treinamento & Desenvolvimento com leitura blindada das turmas e participações."
    >
      {loading ? (
        <div style={loadingBox}>Carregando dashboard...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <>
          <div style={heroWrap}>
            <div style={heroMain}>
              <div style={heroBadge}>Visão estratégica</div>
              <h2 style={heroTitle}>Painel de execução de treinamentos</h2>
              <p style={heroText}>
                Acompanhe volume de turmas, base diária real, presença,
                capacidade planejada e desempenho por cliente e instrutor.
              </p>
            </div>

            <div style={heroMiniGrid}>
              <div style={heroMiniCard}>
                <strong>{fmt(kpis.clientes_ativos || 0)}</strong>
                <span>clientes da carteira</span>
              </div>
              <div style={heroMiniCard}>
                <strong>{fmt(kpis.clientes_com_treinamento || 0)}</strong>
                <span>clientes com treinamento</span>
              </div>
              <div style={heroMiniCard}>
                <strong>{kpis.taxa_presenca || 0}%</strong>
                <span>presença diária consolidada</span>
              </div>
            </div>
          </div>

          <div style={gridFour}>
            <StatCard
              title="Turmas"
              value={fmt(kpis.treinamentos || 0)}
              subtitle="Base total cadastrada"
              accent="#2563eb"
            />
            <StatCard
              title="Registros de chamada"
              value={fmt(kpis.treinados || 0)}
              subtitle="Base real diária"
              accent="#3b82f6"
            />
            <StatCard
              title="Treinandos previstos"
              value={fmt(kpis.participantes_previstos || 0)}
              subtitle="Capacidade planejada"
              accent="#6366f1"
            />
            <StatCard
              title="Carga horária"
              value={`${fmt(kpis.carga_horaria_total || 0)}h`}
              subtitle="Carga total planejada"
              accent="#06b6d4"
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
              subtitle="Ausências registradas"
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
              subtitle="Registros em aberto"
              accent="#64748b"
            />
          </div>

          <div style={gridFour}>
            <StatCard
              title="TX. Presença"
              value={`${fmt(kpis.taxa_presenca || 0)}%`}
              subtitle="Presença diária consolidada"
              accent="#4f46e5"
            />
            <StatCard
              title="TX. Execução"
              value={`${fmt(kpis.taxa_execucao_diaria || 0)}%`}
              subtitle="Relação entre registros e capacidade diária"
              accent="#7c3aed"
            />
            <StatCard
              title="Média por turma"
              value={fmt(kpis.media_participantes_por_turma || 0)}
              subtitle="Previstos por turma"
              accent="#3b82f6"
            />
            <StatCard
              title="Horas assistidas"
              value={`${fmt(kpis.horas_treinadas || 0)}h`}
              subtitle="Carga efetivamente executada"
              accent="#0ea5e9"
            />
          </div>

          <div style={gridFour}>
            <StatCard
              title="Capacidade diária"
              value={fmt(kpis.capacidade_diaria_prevista || 0)}
              subtitle="Participantes × dias das turmas"
              accent="#8b5cf6"
            />
            <StatCard
              title="Gap diário"
              value={fmt(kpis.gap_diario || 0)}
              subtitle="Capacidade planejada ainda não registrada"
              accent="#f97316"
            />
            <StatCard
              title="NPS"
              value={fmt(kpis.nps || 0)}
              subtitle="Satisfação do treinando"
              accent="#14b8a6"
            />
            <StatCard
              title="Respostas de NPS"
              value={fmt(kpis.respostas_nps || 0)}
              subtitle="Base de satisfação"
              accent="#10b981"
            />
          </div>

          <SectionCard
            title="Narrativa executiva"
            subtitle="Leitura pronta para acompanhamento gerencial."
          >
            <div style={alertsGrid}>
              {leituraGerencial.map((item, index) => (
                <div key={`${item}-${index}`} style={alertItem}>
                  {item}
                </div>
              ))}
            </div>
          </SectionCard>

          <div style={twoColumns}>
            <SectionCard
              title="Presença por cliente"
              subtitle="Leitura consolidada por operação com base ativa."
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
  gap: 6,
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)",
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
