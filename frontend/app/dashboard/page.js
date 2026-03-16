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
    const taxaConclusao = Number(kpis.taxa_conclusao_chamada || 0);
    const pendentes = Number(kpis.pendentes || 0);
    const treinamentos = Number(kpis.treinamentos || 0);
    const treinados = Number(kpis.treinados || 0);

    const alertas = [];

    if (treinamentos === 0) {
      alertas.push("Ainda não há treinamentos cadastrados no portal.");
    }

    if (treinados === 0 && treinamentos > 0) {
      alertas.push("Existem turmas cadastradas sem treinandos vinculados.");
    }

    if (taxaConclusao < 100 && pendentes > 0) {
      alertas.push(
        `${fmt(pendentes)} treinando(s) ainda estão com chamada pendente.`
      );
    }

    if (taxaPresenca < 85 && treinados > 0) {
      alertas.push(
        `A taxa geral de presença está em ${taxaPresenca}%, abaixo do patamar ideal.`
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
                Acompanhe volume de turmas, treinandos vinculados, presença real,
                pendências de chamada e desempenho por cliente e instrutor.
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
                <span>taxa geral de presença</span>
              </div>
            </div>
          </div>

          <div style={gridFour}>
            <StatCard
              title="Treinamentos"
              value={fmt(kpis.treinamentos || 0)}
              subtitle="Base total"
              accent="#2563eb"
            />
            <StatCard
              title="Treinados"
              value={fmt(kpis.treinados || 0)}
              subtitle="Base real das turmas"
              accent="#06b6d4"
            />
            <StatCard
              title="Previstos"
              value={fmt(kpis.participantes_previstos || 0)}
              subtitle="Capacidade planejada"
              accent="#7c3aed"
            />
            <StatCard
              title="Carga horária"
              value={`${fmt(kpis.carga_horaria_total || 0)}h`}
              subtitle="Carga consolidada"
              accent="#0f766e"
            />
          </div>

          <div style={{ ...gridFour, marginTop: 14 }}>
            <StatCard
              title="Presentes"
              value={fmt(kpis.presentes || 0)}
              subtitle="Participação confirmada"
              accent="#16a34a"
            />
            <StatCard
              title="Ausentes"
              value={fmt(kpis.ausentes || 0)}
              subtitle="Não compareceram"
              accent="#dc2626"
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

          <div style={{ ...gridFour, marginTop: 14 }}>
            <StatCard
              title="Tx. presença"
              value={`${kpis.taxa_presenca || 0}%`}
              subtitle="Indicador geral"
              accent="#0891b2"
            />
            <StatCard
              title="Tx. conclusão"
              value={`${kpis.taxa_conclusao_chamada || 0}%`}
              subtitle="Chamada registrada"
              accent="#9333ea"
            />
            <StatCard
              title="Média por turma"
              value={fmt(kpis.media_participantes_por_turma || 0)}
              subtitle="Participantes/turma"
              accent="#475569"
            />
            <StatCard
              title="Horas treinadas"
              value={`${fmt(kpis.horas_treinadas || 0)}h`}
              subtitle="Carga efetiva"
              accent="#ea580c"
            />
          </div>

          <div style={twoCol}>
            <SectionCard
              title="Presença por cliente"
              subtitle="Leitura consolidada das operações com maior volume."
            >
              {presencaPorCliente.length ? (
                <div style={listGrid}>
                  {presencaPorCliente.map((item, index) => (
                    <div key={index} style={listItem}>
                      <div style={itemHeader}>
                        <div style={itemTitle}>{item.cliente || "Sem cliente"}</div>
                        <div style={itemBadgeBlue}>
                          {Number(item.taxa_presenca || 0)}%
                        </div>
                      </div>

                      <div style={itemMeta}>
                        {fmt(item.total_treinados || 0)} treinados •{" "}
                        {fmt(item.presentes || 0)} presentes •{" "}
                        {fmt(item.ausentes || 0)} ausentes •{" "}
                        {fmt(item.justificados || 0)} justificados
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyText}>Sem dados por cliente no momento.</div>
              )}
            </SectionCard>

            <SectionCard
              title="Ranking de instrutores"
              subtitle="Produtividade por volume de turmas e presença."
            >
              {rankingInstrutores.length ? (
                <div style={listGrid}>
                  {rankingInstrutores.map((item, index) => (
                    <div key={index} style={listItem}>
                      <div style={itemHeader}>
                        <div style={itemTitle}>
                          {item.instrutor || "Sem instrutor"}
                        </div>
                        <div style={itemBadgePurple}>
                          {Number(item.taxa_presenca || 0)}%
                        </div>
                      </div>

                      <div style={itemMeta}>
                        {fmt(item.total_turmas || 0)} turma(s) •{" "}
                        {fmt(item.total_treinados || 0)} treinados •{" "}
                        {fmt(item.presentes || 0)} presentes
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyText}>Sem dados de instrutores no momento.</div>
              )}
            </SectionCard>
          </div>

          <div style={{ ...twoCol, marginTop: 14 }}>
            <SectionCard
              title="Últimas turmas"
              subtitle="Acompanhamento das turmas mais recentes."
            >
              {ultimasTurmas.length ? (
                <div style={listGrid}>
                  {ultimasTurmas.map((item) => (
                    <div key={item.id} style={listItem}>
                      <div style={itemHeader}>
                        <div style={itemTitle}>{item.tema || "Treinamento"}</div>
                        <div style={itemBadgeGray}>#{item.id}</div>
                      </div>

                      <div style={itemMeta}>
                        {(item.cliente || "Sem cliente") +
                          " • " +
                          (item.instrutor || "Sem instrutor")}
                      </div>

                      <div style={{ ...itemMeta, marginTop: 6 }}>
                        {formatDate(item.data)} • {item.carga_horaria || "-"} •{" "}
                        previstos: {fmt(item.participantes || 0)} • treinados:{" "}
                        {fmt(item.treinados || 0)}
                      </div>

                      <div style={statusLine}>
                        <span style={pillGreen}>
                          Presentes: {fmt(item.presentes || 0)}
                        </span>
                        <span style={pillRed}>
                          Ausentes: {fmt(item.ausentes || 0)}
                        </span>
                        <span style={pillYellow}>
                          Justificados: {fmt(item.justificados || 0)}
                        </span>
                        <span style={pillGray}>
                          Pendentes: {fmt(item.pendentes || 0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyText}>Nenhuma turma encontrada.</div>
              )}
            </SectionCard>

            <SectionCard
              title="Leitura gerencial"
              subtitle="Resumo pronto para reuniões e apresentações."
            >
              <div style={alertGrid}>
                {leituraGerencial.map((item, index) => (
                  <div key={index} style={alertItem}>
                    {item}
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </PortalShell>
  );
}

const heroWrap = {
  display: "grid",
  gridTemplateColumns: "1.5fr .9fr",
  gap: 14,
  marginBottom: 14,
};

const heroMain = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 20,
  padding: 22,
  color: "#fff",
  boxShadow: "0 16px 30px rgba(29,78,216,.18)",
};

const heroBadge = {
  display: "inline-block",
  background: "rgba(255,255,255,.14)",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const heroTitle = {
  margin: "14px 0 8px",
  fontSize: 30,
  lineHeight: 1.05,
};

const heroText = {
  margin: 0,
  color: "rgba(255,255,255,.84)",
  lineHeight: 1.6,
};

const heroMiniGrid = {
  display: "grid",
  gap: 10,
};

const heroMiniCard = {
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid #dbeafe",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 10px 22px rgba(15,23,42,.05)",
  display: "grid",
  gap: 4,
};

const gridFour = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
  marginTop: 16,
};

const listGrid = {
  display: "grid",
  gap: 10,
};

const listItem = {
  background: "#f8fafc",
  padding: 12,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
};

const itemHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const itemTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const itemMeta = {
  marginTop: 5,
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.45,
};

const itemBadgeBlue = {
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const itemBadgePurple = {
  background: "#ede9fe",
  color: "#6d28d9",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const itemBadgeGray = {
  background: "#e2e8f0",
  color: "#334155",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const statusLine = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 10,
};

const pillGreen = {
  background: "#dcfce7",
  color: "#166534",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
};

const pillRed = {
  background: "#fee2e2",
  color: "#b91c1c",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
};

const pillYellow = {
  background: "#fef3c7",
  color: "#92400e",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
};

const pillGray = {
  background: "#e2e8f0",
  color: "#475569",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
};

const alertGrid = {
  display: "grid",
  gap: 10,
};

const alertItem = {
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
  borderRadius: 12,
  padding: 12,
  fontWeight: 600,
};

const emptyText = {
  color: "#64748b",
};

const loadingBox = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 18,
  color: "#475569",
  fontWeight: 700,
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 16,
  padding: 16,
  fontWeight: 700,
};
