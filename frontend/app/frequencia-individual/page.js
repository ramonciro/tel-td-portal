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

function riscoInfo(freq) {
  const valor = Number(freq || 0);

  if (valor < 75) {
    return {
      label: "Crítico",
      style: {
        background: "#fee2e2",
        color: "#b91c1c",
      },
    };
  }

  if (valor < 90) {
    return {
      label: "Atenção",
      style: {
        background: "#fef3c7",
        color: "#92400e",
      },
    };
  }

  return {
    label: "Estável",
    style: {
      background: "#dcfce7",
      color: "#166534",
    },
  };
}

export default function FrequenciaIndividualPage() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        setErro("");
        setLoading(true);

        const response = await apiFetch("/frequencia-individual");
        setDados(response || null);
      } catch (error) {
        setErro(error.message || "Erro ao carregar frequência individual.");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const kpis = dados?.kpis || {};
  const itens = dados?.itens || [];

  const destaques = useMemo(() => {
    const criticos = itens.filter(
      (item) => Number(item.frequencia_percentual || 0) < 75
    );

    const alerta = itens.filter((item) => {
      const freq = Number(item.frequencia_percentual || 0);
      return freq >= 75 && freq < 90;
    });

    return {
      criticos: criticos.slice(0, 5),
      alerta: alerta.slice(0, 5),
    };
  }, [itens]);

  return (
    <PortalShell
      title="Frequência Individual"
      subtitle="Acompanhamento da frequência real por treinando, com leitura de risco e consolidado por chamadas diárias."
    >
      {loading ? (
        <div style={loadingBox}>Carregando frequência individual...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={gridCards}>
            <StatCard
              title="Treinandos"
              value={fmt(kpis.treinandos || 0)}
              subtitle="Base acompanhada"
              accent="#2563eb"
            />
            <StatCard
              title="Média de frequência"
              value={`${kpis.media_frequencia || 0}%`}
              subtitle="Presença média consolidada"
              accent="#06b6d4"
            />
            <StatCard
              title="Estáveis"
              value={fmt(kpis.estaveis || 0)}
              subtitle="Frequência ≥ 90%"
              accent="#16a34a"
            />
            <StatCard
              title="Atenção"
              value={fmt(kpis.atencao || 0)}
              subtitle="Entre 75% e 89,9%"
              accent="#f59e0b"
            />
            <StatCard
              title="Críticos"
              value={fmt(kpis.criticos || 0)}
              subtitle="Frequência < 75%"
              accent="#dc2626"
            />
          </div>

          <div style={twoCol}>
            <SectionCard
              title="Maior risco"
              subtitle="Treinandos com menor frequência."
            >
              <div style={listGrid}>
                {destaques.criticos.length ? (
                  destaques.criticos.map((item, index) => {
                    const risco = riscoInfo(item.frequencia_percentual);
                    return (
                      <div key={index} style={listItem}>
                        <div style={itemHeader}>
                          <div style={itemTitle}>{item.treinando_nome}</div>
                          <div style={{ ...badgeBase, ...risco.style }}>
                            {risco.label}
                          </div>
                        </div>
                        <div style={itemMeta}>
                          {item.tema || "Turma"} • {item.cliente || "Sem cliente"}
                        </div>
                        <div style={itemMeta}>
                          Frequência: {item.frequencia_percentual || 0}% • Presentes:{" "}
                          {fmt(item.presentes || 0)} • Ausentes: {fmt(item.ausentes || 0)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={emptyText}>Sem treinandos em risco crítico.</div>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Acompanhamento"
              subtitle="Treinandos que precisam de observação."
            >
              <div style={listGrid}>
                {destaques.alerta.length ? (
                  destaques.alerta.map((item, index) => {
                    const risco = riscoInfo(item.frequencia_percentual);
                    return (
                      <div key={index} style={listItem}>
                        <div style={itemHeader}>
                          <div style={itemTitle}>{item.treinando_nome}</div>
                          <div style={{ ...badgeBase, ...risco.style }}>
                            {risco.label}
                          </div>
                        </div>
                        <div style={itemMeta}>
                          {item.tema || "Turma"} • {item.cliente || "Sem cliente"}
                        </div>
                        <div style={itemMeta}>
                          Frequência: {item.frequencia_percentual || 0}% • Justificados:{" "}
                          {fmt(item.justificados || 0)} • Pendentes: {fmt(item.pendentes || 0)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={emptyText}>Sem treinandos em faixa de atenção.</div>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Base detalhada de frequência"
            subtitle="Leitura individual por turma e por treinando."
          >
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Treinando</th>
                    <th style={th}>Turma</th>
                    <th style={th}>Cliente</th>
                    <th style={th}>Dias</th>
                    <th style={th}>Presentes</th>
                    <th style={th}>Ausentes</th>
                    <th style={th}>Justificados</th>
                    <th style={th}>Pendentes</th>
                    <th style={th}>Frequência</th>
                    <th style={th}>Risco</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.length ? (
                    itens.map((item, index) => {
                      const risco = riscoInfo(item.frequencia_percentual);

                      return (
                        <tr key={`${item.treinando_nome}-${item.treinamento_id}-${index}`}>
                          <td style={td}>
                            <div style={cellTitle}>{item.treinando_nome || "-"}</div>
                            <div style={cellSub}>
                              {formatDate(item.primeira_chamada)} até{" "}
                              {formatDate(item.ultima_chamada)}
                            </div>
                          </td>
                          <td style={td}>{item.tema || "-"}</td>
                          <td style={td}>{item.cliente || "-"}</td>
                          <td style={td}>{fmt(item.dias_registrados || 0)}</td>
                          <td style={td}>{fmt(item.presentes || 0)}</td>
                          <td style={td}>{fmt(item.ausentes || 0)}</td>
                          <td style={td}>{fmt(item.justificados || 0)}</td>
                          <td style={td}>{fmt(item.pendentes || 0)}</td>
                          <td style={td}>{item.frequencia_percentual || 0}%</td>
                          <td style={td}>
                            <span style={{ ...badgeBase, ...risco.style }}>
                              {risco.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td style={tdEmpty} colSpan={10}>
                        Nenhum registro de frequência encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      )}
    </PortalShell>
  );
}

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

const gridCards = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
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

const emptyText = {
  color: "#64748b",
};

const badgeBase = {
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const tableWrap = {
  overflowX: "auto",
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
  verticalAlign: "top",
};

const tdEmpty = {
  padding: "16px 10px",
  color: "#64748b",
  textAlign: "center",
};

const cellTitle = {
  fontWeight: 800,
};

const cellSub = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 12,
};
