"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { formatDateBR, parseLocalDate } from "../../lib/date";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function parseDateSafe(value) {
  return parseLocalDate(value);
}

function formatDate(value) {
  return formatDateBR(value, "-");
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

  const [busca, setBusca] = useState("");
  const [filtroRisco, setFiltroRisco] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("todos");

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
  const itens = Array.isArray(dados?.itens) ? dados.itens : [];

  const clientesOptions = useMemo(() => {
    const lista = [...new Set(itens.map((item) => item.cliente).filter(Boolean))];
    return lista.sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
  }, [itens]);

  const itensFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return itens.filter((item) => {
      const risco = riscoInfo(item.frequencia_percentual).label;

      const matchRisco = filtroRisco === "todos" || risco === filtroRisco;
      const matchCliente =
        filtroCliente === "todos" || String(item.cliente || "") === filtroCliente;

      const alvoBusca = [
        item.treinando_nome,
        item.tema,
        item.cliente,
        item.instrutor,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchBusca = !termo || alvoBusca.includes(termo);

      return matchRisco && matchCliente && matchBusca;
    });
  }, [itens, busca, filtroRisco, filtroCliente]);

  const destaques = useMemo(() => {
    const criticos = itensFiltrados.filter(
      (item) => Number(item.frequencia_percentual || 0) < 75
    );

    const alerta = itensFiltrados.filter((item) => {
      const freq = Number(item.frequencia_percentual || 0);
      return freq >= 75 && freq < 90;
    });

    const estaveis = itensFiltrados.filter(
      (item) => Number(item.frequencia_percentual || 0) >= 90
    );

    return {
      criticos: criticos.slice(0, 5),
      alerta: alerta.slice(0, 5),
      estaveis: estaveis.slice(0, 5),
    };
  }, [itensFiltrados]);

  const resumo = useMemo(() => {
    const total = itensFiltrados.length;
    const media =
      total > 0
        ? (
            itensFiltrados.reduce(
              (acc, item) => acc + Number(item.frequencia_percentual || 0),
              0
            ) / total
          ).toFixed(1)
        : 0;

    const criticos = itensFiltrados.filter(
      (item) => Number(item.frequencia_percentual || 0) < 75
    ).length;

    const atencao = itensFiltrados.filter((item) => {
      const freq = Number(item.frequencia_percentual || 0);
      return freq >= 75 && freq < 90;
    }).length;

    const estaveis = itensFiltrados.filter(
      (item) => Number(item.frequencia_percentual || 0) >= 90
    ).length;

    const presentes = itensFiltrados.reduce(
      (acc, item) => acc + Number(item.presentes || 0),
      0
    );

    const ausentes = itensFiltrados.reduce(
      (acc, item) => acc + Number(item.ausentes || 0),
      0
    );

    const justificados = itensFiltrados.reduce(
      (acc, item) => acc + Number(item.justificados || 0),
      0
    );

    const pendentes = itensFiltrados.reduce(
      (acc, item) => acc + Number(item.pendentes || 0),
      0
    );

    return {
      total,
      media,
      criticos,
      atencao,
      estaveis,
      presentes,
      ausentes,
      justificados,
      pendentes,
    };
  }, [itensFiltrados]);

  return (
    <PortalShell
      title="Frequência Individual"
      subtitle="Leitura consolidada por treinando, com visão de risco, recorrência e apoio à tomada de decisão."
    >
      {loading ? (
        <div style={loadingBox}>Carregando frequência individual...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={heroWrap}>
            <div style={heroMain}>
              <div style={heroBadge}>Acompanhamento individual</div>
              <h2 style={heroTitle}>Leitura de risco por treinando</h2>
              <p style={heroText}>
                Identifique rapidamente quem está estável, em atenção ou crítico,
                com base nas chamadas registradas e no histórico real de presença.
              </p>
            </div>

            <div style={heroSide}>
              <div style={sideCard}>
                <div style={sideTitle}>Base no filtro</div>
                <div style={sideValue}>{fmt(resumo.total)}</div>
                <div style={sideText}>treinandos/turmas considerados</div>
              </div>

              <div style={sideCard}>
                <div style={sideTitle}>Média de frequência</div>
                <div style={sideValue}>{resumo.media}%</div>
                <div style={sideText}>visão consolidada do conjunto filtrado</div>
              </div>

              <div style={sideCard}>
                <div style={sideTitle}>Pendências</div>
                <div style={sideValue}>{fmt(resumo.pendentes)}</div>
                <div style={sideText}>chamadas ainda não concluídas</div>
              </div>
            </div>
          </div>

          <SectionCard
            title="Filtros"
            subtitle="Refine a leitura por risco, cliente ou palavra-chave."
          >
            <div style={filtersGrid}>
              <div style={fieldWrap}>
                <label style={label}>Risco</label>
                <select
                  value={filtroRisco}
                  onChange={(e) => setFiltroRisco(e.target.value)}
                  style={input}
                >
                  <option value="todos">Todos</option>
                  <option value="Crítico">Crítico</option>
                  <option value="Atenção">Atenção</option>
                  <option value="Estável">Estável</option>
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={label}>Cliente</label>
                <select
                  value={filtroCliente}
                  onChange={(e) => setFiltroCliente(e.target.value)}
                  style={input}
                >
                  <option value="todos">Todos</option>
                  {clientesOptions.map((cliente) => (
                    <option key={cliente} value={cliente}>
                      {cliente}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={label}>Busca</label>
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por treinando, turma, cliente..."
                  style={input}
                />
              </div>

              <div style={actionsWrap}>
                <button
                  style={btnSecundario}
                  onClick={() => {
                    setBusca("");
                    setFiltroRisco("todos");
                    setFiltroCliente("todos");
                  }}
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          </SectionCard>

          <div style={gridCards}>
            <StatCard
              title="Treinandos"
              value={fmt(resumo.total || 0)}
              subtitle="Base acompanhada"
              accent="#2563eb"
            />
            <StatCard
              title="Média de frequência"
              value={`${resumo.media || 0}%`}
              subtitle="Presença média consolidada"
              accent="#06b6d4"
            />
            <StatCard
              title="Estáveis"
              value={fmt(resumo.estaveis || 0)}
              subtitle="Frequência ≥ 90%"
              accent="#16a34a"
            />
            <StatCard
              title="Atenção"
              value={fmt(resumo.atencao || 0)}
              subtitle="Entre 75% e 89,9%"
              accent="#f59e0b"
            />
            <StatCard
              title="Críticos"
              value={fmt(resumo.criticos || 0)}
              subtitle="Frequência < 75%"
              accent="#dc2626"
            />
          </div>

          <div style={gridCards}>
            <StatCard
              title="Presentes"
              value={fmt(resumo.presentes || 0)}
              subtitle="Participações confirmadas"
              accent="#16a34a"
            />
            <StatCard
              title="Ausentes"
              value={fmt(resumo.ausentes || 0)}
              subtitle="Ausências registradas"
              accent="#ef4444"
            />
            <StatCard
              title="Justificados"
              value={fmt(resumo.justificados || 0)}
              subtitle="Ausências justificadas"
              accent="#f59e0b"
            />
            <StatCard
              title="Pendentes"
              value={fmt(resumo.pendentes || 0)}
              subtitle="Chamadas em aberto"
              accent="#475569"
            />
          </div>

          <div style={threeCol}>
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
              subtitle="Treinandos que pedem observação."
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

            <SectionCard
              title="Base saudável"
              subtitle="Treinandos com presença estável."
            >
              <div style={listGrid}>
                {destaques.estaveis.length ? (
                  destaques.estaveis.map((item, index) => {
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
                          {fmt(item.presentes || 0)} • Pendentes: {fmt(item.pendentes || 0)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={emptyText}>Sem base estável no filtro atual.</div>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Base detalhada de frequência"
            subtitle="Leitura individual por turma e por treinando."
          >
            {itensFiltrados.length ? (
              <div style={cardsGridDetalhado}>
                {itensFiltrados.map((item, index) => {
                  const risco = riscoInfo(item.frequencia_percentual);

                  return (
                    <div
                      key={`${item.treinando_nome}-${item.treinamento_id}-${index}`}
                      style={cardDetalhado}
                    >
                      <div style={cardDetalhadoTop}>
                        <div>
                          <div style={cardDetalhadoNome}>
                            {item.treinando_nome || "-"}
                          </div>
                          <div style={cardDetalhadoMeta}>
                            {item.tema || "Turma"} • {item.cliente || "Sem cliente"}
                          </div>
                        </div>

                        <div style={{ ...badgeBase, ...risco.style }}>
                          {risco.label}
                        </div>
                      </div>

                      <div style={cardDetalhadoPeriodo}>
                        {formatDate(item.primeira_chamada)} até{" "}
                        {formatDate(item.ultima_chamada)}
                      </div>

                      <div style={miniGrid}>
                        <div style={miniBox}>
                          <span style={miniLabel}>Dias</span>
                          <strong style={miniValue}>
                            {fmt(item.dias_registrados || 0)}
                          </strong>
                        </div>

                        <div style={miniBox}>
                          <span style={miniLabel}>Presentes</span>
                          <strong style={miniValue}>
                            {fmt(item.presentes || 0)}
                          </strong>
                        </div>

                        <div style={miniBox}>
                          <span style={miniLabel}>Ausentes</span>
                          <strong style={miniValue}>
                            {fmt(item.ausentes || 0)}
                          </strong>
                        </div>

                        <div style={miniBox}>
                          <span style={miniLabel}>Justificados</span>
                          <strong style={miniValue}>
                            {fmt(item.justificados || 0)}
                          </strong>
                        </div>

                        <div style={miniBox}>
                          <span style={miniLabel}>Pendentes</span>
                          <strong style={miniValue}>
                            {fmt(item.pendentes || 0)}
                          </strong>
                        </div>

                        <div style={miniBoxDestaque}>
                          <span style={miniLabel}>Frequência</span>
                          <strong style={miniValue}>
                            {item.frequencia_percentual || 0}%
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={emptyText}>Nenhum registro de frequência encontrado.</div>
            )}
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

const heroWrap = {
  display: "grid",
  gridTemplateColumns: "1.5fr 1fr",
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

const filtersGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1.4fr auto",
  gap: 12,
};

const fieldWrap = {
  display: "grid",
  gap: 6,
};

const label = {
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 14,
};

const input = {
  width: "100%",
  height: 42,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
  boxSizing: "border-box",
};

const actionsWrap = {
  display: "flex",
  alignItems: "flex-end",
};

const btnSecundario = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#fff",
  color: "#334155",
  fontWeight: 800,
  cursor: "pointer",
};

const gridCards = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

const threeCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
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

const cardsGridDetalhado = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 14,
};

const cardDetalhado = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 16,
  display: "grid",
  gap: 12,
};

const cardDetalhadoTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const cardDetalhadoNome = {
  fontWeight: 800,
  fontSize: 18,
  color: "#0f172a",
  lineHeight: 1.2,
};

const cardDetalhadoMeta = {
  marginTop: 6,
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.45,
};

const cardDetalhadoPeriodo = {
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.45,
};

const miniGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const miniBox = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 4,
};

const miniBoxDestaque = {
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 4,
};

const miniLabel = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 700,
};

const miniValue = {
  color: "#0f172a",
  fontSize: 18,
  fontWeight: 800,
};
