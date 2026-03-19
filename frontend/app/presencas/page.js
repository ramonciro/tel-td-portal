"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function fmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toLocaleDateString("pt-BR");
}

function parseHoras(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).replace(",", ".").trim();
  const match = text.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

function normalizeStatus(value) {
  return String(value || "").toLowerCase().trim();
}

function getDiasPeriodo(item) {
  const inicio = item.data_inicio || item.data;
  const fim = item.data_fim || item.data_inicio || item.data;

  if (!inicio || !fim) return 1;

  const d1 = new Date(inicio);
  const d2 = new Date(fim);

  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 1;

  const a = new Date(d1);
  const b = new Date(d2);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);

  const diffMs = b - a;
  const dias = Math.floor(diffMs / 86400000) + 1;

  return dias > 0 ? dias : 1;
}

function getStatusTurma({ treinandos, presentes, ausentes, justificados, pendentes }) {
  const totalLancados = presentes + ausentes + justificados;

  if (treinandos === 0) return "Sem treinandos";
  if (totalLancados === 0) return "Chamada pendente";
  if (pendentes > 0) return "Em andamento";
  return "Concluída";
}

function getClassificacao({ taxa, treinandos, pendentes, statusTurma }) {
  if (statusTurma === "Sem treinandos") return "Crítico";
  if (statusTurma === "Chamada pendente") return "Atenção";
  if (pendentes > 0) return "Atenção";
  if (treinandos > 0 && taxa < 85) return "Crítico";
  return "Estável";
}

function getStatusBadgeStyle(status) {
  const base = {
    display: "inline-block",
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
  };

  if (status === "Sem treinandos") {
    return { ...base, background: "#fef2f2", color: "#b91c1c" };
  }

  if (status === "Chamada pendente") {
    return { ...base, background: "#fff7ed", color: "#c2410c" };
  }

  if (status === "Em andamento") {
    return { ...base, background: "#eff6ff", color: "#1d4ed8" };
  }

  return { ...base, background: "#ecfdf5", color: "#047857" };
}

function getClassificacaoStyle(classificacao) {
  if (classificacao === "Crítico") {
    return {
      background: "#fee2e2",
      color: "#b91c1c",
    };
  }

  if (classificacao === "Atenção") {
    return {
      background: "#fef3c7",
      color: "#92400e",
    };
  }

  return {
    background: "#dcfce7",
    color: "#166534",
  };
}

function getActionConfig(statusTurma) {
  if (statusTurma === "Sem treinandos") {
    return {
      label: "Importar treinandos",
      style: btnAlerta,
    };
  }

  if (statusTurma === "Chamada pendente" || statusTurma === "Em andamento") {
    return {
      label: "Abrir chamada",
      style: btnPrimario,
    };
  }

  return {
    label: "Ver gestão da turma",
    style: btnSecundarioAzul,
  };
}

export default function GestaoTurmasPage() {
  const [treinamentos, setTreinamentos] = useState([]);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setErro("");

        const treinamentosData = await apiFetch("/treinamentos", {
          timeoutMs: 15000,
        }).catch(() => []);

        const lista = Array.isArray(treinamentosData) ? treinamentosData : [];

        const turmasComBase = await Promise.all(
          lista.map(async (t) => {
            const participantes = await apiFetch(
              `/treinamentos/${t.id}/participantes`,
              { timeoutMs: 15000 }
            ).catch(() => []);

            const registros = Array.isArray(participantes) ? participantes : [];

            const presentes = registros.filter(
              (p) => normalizeStatus(p.status_presenca) === "presente"
            ).length;

            const ausentes = registros.filter(
              (p) => normalizeStatus(p.status_presenca) === "ausente"
            ).length;

            const justificados = registros.filter(
              (p) => normalizeStatus(p.status_presenca) === "justificado"
            ).length;

            const treinandos = registros.length || Number(t.participantes || 0);
            const totalLancados = presentes + ausentes + justificados;
            const pendentes = Math.max(treinandos - totalLancados, 0);
            const taxa = treinandos ? Math.round((presentes / treinandos) * 100) : 0;

            const dias = getDiasPeriodo(t);
            const capacidadeDiaria = treinandos * dias;

            const statusTurma = getStatusTurma({
              treinandos,
              presentes,
              ausentes,
              justificados,
              pendentes,
            });

            const classificacao = getClassificacao({
              taxa,
              treinandos,
              pendentes,
              statusTurma,
            });

            return {
              ...t,
              treinandos,
              presentes,
              ausentes,
              justificados,
              pendentes,
              taxa,
              dias,
              capacidadeDiaria,
              classificacao,
              statusTurma,
            };
          })
        );

        setTreinamentos(turmasComBase);
      } catch (error) {
        setErro(error.message || "Erro ao carregar gestão de turmas.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const turmas = useMemo(() => {
    return [...treinamentos].sort((a, b) => {
      const ordemStatus = {
        "Sem treinandos": 1,
        "Chamada pendente": 2,
        "Em andamento": 3,
        "Concluída": 4,
      };

      const aOrdem = ordemStatus[a.statusTurma] || 99;
      const bOrdem = ordemStatus[b.statusTurma] || 99;

      if (aOrdem !== bOrdem) return aOrdem - bOrdem;
      return a.taxa - b.taxa;
    });
  }, [treinamentos]);

  const clientesOptions = useMemo(() => {
    const lista = [...new Set(turmas.map((item) => item.cliente).filter(Boolean))];
    return lista.sort((a, b) => String(a).localeCompare(String(b)));
  }, [turmas]);

  const turmasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return turmas.filter((item) => {
      const matchStatus =
        filtroStatus === "todos" || item.statusTurma === filtroStatus;

      const matchCliente =
        filtroCliente === "todos" || String(item.cliente || "") === filtroCliente;

      const alvoBusca = [
        item.tema,
        item.cliente,
        item.instrutor,
        item.supervisor,
        item.publico,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchBusca = !termo || alvoBusca.includes(termo);

      return matchStatus && matchCliente && matchBusca;
    });
  }, [turmas, filtroStatus, filtroCliente, busca]);

  const resumo = useMemo(() => {
    const turmasTotal = turmasFiltradas.length;
    const treinandos = turmasFiltradas.reduce(
      (acc, item) => acc + Number(item.treinandos || 0),
      0
    );
    const presentes = turmasFiltradas.reduce(
      (acc, item) => acc + Number(item.presentes || 0),
      0
    );
    const horas = turmasFiltradas.reduce(
      (acc, item) => acc + parseHoras(item.carga_horaria),
      0
    );
    const capacidadeDiaria = turmasFiltradas.reduce(
      (acc, item) => acc + Number(item.capacidadeDiaria || 0),
      0
    );

    const semTreinandos = turmasFiltradas.filter(
      (item) => item.statusTurma === "Sem treinandos"
    ).length;
    const pendentes = turmasFiltradas.filter(
      (item) => item.statusTurma === "Chamada pendente"
    ).length;
    const andamento = turmasFiltradas.filter(
      (item) => item.statusTurma === "Em andamento"
    ).length;
    const concluidas = turmasFiltradas.filter(
      (item) => item.statusTurma === "Concluída"
    ).length;

    return {
      turmasTotal,
      treinandos,
      presentes,
      horas,
      capacidadeDiaria,
      semTreinandos,
      pendentes,
      andamento,
      concluidas,
    };
  }, [turmasFiltradas]);

  return (
    <PortalShell
      title="Gestão de Turmas"
      subtitle="Visão operacional das turmas, períodos e chamadas diárias."
    >
      {loading ? (
        <div style={loadingBox}>Carregando gestão de turmas...</div>
      ) : erro ? (
        <div style={errorBox}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            Não foi possível concluir o carregamento da Gestão de Turmas.
          </div>
          <div style={{ marginBottom: 12 }}>{erro}</div>
          <button style={btnPrimario} onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <div style={heroWrap}>
            <div style={heroMain}>
              <div style={heroBadge}>Operação de turmas</div>
              <h2 style={heroTitle}>Acompanhamento tático da execução</h2>
              <p style={heroText}>
                Monitore base ativa, presença, capacidade diária e andamento das
                turmas em um formato mais compatível com o portal.
              </p>
            </div>

            <div style={heroSide}>
              <div style={sideCard}>
                <div style={sideTitle}>Turmas no filtro</div>
                <div style={sideValue}>{fmt(resumo.turmasTotal)}</div>
                <div style={sideText}>volume consolidado da visualização</div>
              </div>

              <div style={sideCard}>
                <div style={sideTitle}>Treinandos ativos</div>
                <div style={sideValue}>{fmt(resumo.treinandos)}</div>
                <div style={sideText}>base ativa vinculada às turmas</div>
              </div>

              <div style={sideCard}>
                <div style={sideTitle}>Capacidade diária</div>
                <div style={sideValue}>{fmt(resumo.capacidadeDiaria)}</div>
                <div style={sideText}>participantes × dias dos treinamentos</div>
              </div>
            </div>
          </div>

          <SectionCard
            title="Filtros"
            subtitle="Refine a visualização por status, cliente ou palavras-chave."
          >
            <div style={filtersGrid}>
              <div style={fieldWrap}>
                <label style={label}>Status da turma</label>
                <select
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                  style={input}
                >
                  <option value="todos">Todos</option>
                  <option value="Sem treinandos">Sem treinandos</option>
                  <option value="Chamada pendente">Chamada pendente</option>
                  <option value="Em andamento">Em andamento</option>
                  <option value="Concluída">Concluída</option>
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
                  placeholder="Buscar por turma, cliente, instrutor..."
                  style={input}
                />
              </div>

              <div style={actionsWrap}>
                <button
                  style={btnSecundario}
                  onClick={() => {
                    setFiltroStatus("todos");
                    setFiltroCliente("todos");
                    setBusca("");
                  }}
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          </SectionCard>

          <div style={gridFour}>
            <StatCard
              title="Turmas"
              value={fmt(resumo.turmasTotal)}
              subtitle="Consolidadas no filtro"
              accent="#2563eb"
            />
            <StatCard
              title="Treinandos"
              value={fmt(resumo.treinandos)}
              subtitle="Base ativa vinculada"
              accent="#38bdf8"
            />
            <StatCard
              title="Presentes"
              value={fmt(resumo.presentes)}
              subtitle="Participações confirmadas"
              accent="#16a34a"
            />
            <StatCard
              title="Carga horária"
              value={`${fmt(resumo.horas)}h`}
              subtitle="Carga consolidada"
              accent="#7c3aed"
            />
          </div>

          <div style={gridFour}>
            <StatCard
              title="Sem treinandos"
              value={fmt(resumo.semTreinandos)}
              subtitle="Turmas sem base vinculada"
              accent="#dc2626"
            />
            <StatCard
              title="Chamada pendente"
              value={fmt(resumo.pendentes)}
              subtitle="Sem lançamento iniciado"
              accent="#f59e0b"
            />
            <StatCard
              title="Em andamento"
              value={fmt(resumo.andamento)}
              subtitle="Com pendências operacionais"
              accent="#2563eb"
            />
            <StatCard
              title="Concluídas"
              value={fmt(resumo.concluidas)}
              subtitle="Turmas com chamada finalizada"
              accent="#16a34a"
            />
          </div>

          <SectionCard
            title="Painel das turmas"
            subtitle="Leitura rápida das turmas com maior necessidade de acompanhamento."
          >
            {turmasFiltradas.length ? (
              <div style={cardsGrid}>
                {turmasFiltradas.map((item) => {
                  const action = getActionConfig(item.statusTurma);
                  const classificacaoStyle = getClassificacaoStyle(item.classificacao);

                  return (
                    <div key={item.id} style={turmaCard}>
                      <div style={cardTop}>
                        <span style={{ ...badgeBase, ...classificacaoStyle }}>
                          {item.classificacao}
                        </span>
                        <span style={badgeTaxa}>{item.taxa}%</span>
                      </div>

                      <div style={statusWrap}>
                        <span style={getStatusBadgeStyle(item.statusTurma)}>
                          {item.statusTurma}
                        </span>
                      </div>

                      <div style={turmaTitulo}>{item.tema || "Turma"}</div>

                      <div style={turmaMeta}>
                        {(item.cliente || "Sem cliente") +
                          " • " +
                          (item.instrutor || "Sem instrutor")}
                      </div>

                      <div style={miniLinha}>
                        <span>{fmt(item.treinandos)} treinandos</span>
                        <span>{fmt(item.presentes)} pres.</span>
                        <span>{fmt(item.ausentes)} aus.</span>
                        <span>{fmt(item.justificados)} just.</span>
                        <span>{fmt(item.pendentes)} pend.</span>
                      </div>

                      <div style={infoBloco}>
                        <div>
                          <strong>Período:</strong>{" "}
                          {fmtDate(item.data_inicio || item.data)} até{" "}
                          {fmtDate(item.data_fim || item.data_inicio || item.data)}
                        </div>
                        <div>
                          <strong>Público:</strong> {item.publico || "-"}
                        </div>
                        <div>
                          <strong>Carga:</strong> {item.carga_horaria || "-"}
                        </div>
                        <div>
                          <strong>Supervisor:</strong> {item.supervisor || "-"}
                        </div>
                        <div>
                          <strong>Capacidade diária:</strong> {fmt(item.capacidadeDiaria)}
                        </div>
                      </div>

                      <div style={acoesWrapCard}>
                        <button
                          style={action.style}
                          onClick={() => {
                            window.location.href = `/turma/${item.id}`;
                          }}
                        >
                          {action.label}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={emptyText}>
                Nenhuma turma encontrada para os filtros aplicados.
              </div>
            )}
          </SectionCard>
        </>
      )}
    </PortalShell>
  );
}

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

const gridFour = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14,
  marginTop: 14,
};

const cardsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 14,
};

const turmaCard = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 14,
  display: "grid",
  gap: 10,
};

const cardTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
};

const statusWrap = {
  display: "flex",
  justifyContent: "flex-start",
};

const badgeBase = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 11,
};

const badgeTaxa = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 12,
};

const turmaTitulo = {
  fontSize: 18,
  fontWeight: 800,
  color: "#0f172a",
};

const turmaMeta = {
  color: "#64748b",
  fontSize: 13,
};

const miniLinha = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  color: "#334155",
  fontSize: 13,
  fontWeight: 600,
};

const infoBloco = {
  display: "grid",
  gap: 4,
  color: "#334155",
  fontSize: 13,
};

const acoesWrapCard = {
  marginTop: 4,
};

const btnPrimario = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#2563eb",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
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

const btnSecundarioAzul = {
  border: "1px solid #bfdbfe",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
  cursor: "pointer",
};

const btnAlerta = {
  border: "1px solid #fed7aa",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#fff7ed",
  color: "#c2410c",
  fontWeight: 800,
  cursor: "pointer",
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

const emptyText = {
  color: "#64748b",
};
