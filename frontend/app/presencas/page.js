"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import StatCard from "../../components/StatCard";
import SectionCard from "../../components/SectionCard";
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
  const [presencas, setPresencas] = useState([]);
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

        const [treinamentosResult, presencasResult] = await Promise.allSettled([
          apiFetch("/treinamentos", { timeoutMs: 15000 }),
          apiFetch("/presencas", { timeoutMs: 15000 }),
        ]);

        let treinamentosData = [];
        let presencasData = [];
        const erros = [];

        if (treinamentosResult.status === "fulfilled") {
          treinamentosData = Array.isArray(treinamentosResult.value)
            ? treinamentosResult.value
            : [];
        } else {
          erros.push(`Treinamentos: ${treinamentosResult.reason?.message || "falha ao carregar"}`);
        }

        if (presencasResult.status === "fulfilled") {
          presencasData = Array.isArray(presencasResult.value)
            ? presencasResult.value
            : [];
        } else {
          erros.push(`Presenças: ${presencasResult.reason?.message || "falha ao carregar"}`);
        }

        setTreinamentos(treinamentosData);
        setPresencas(presencasData);

        if (erros.length) {
          setErro(erros.join(" | "));
        }
      } catch (error) {
        setErro(error.message || "Erro ao carregar gestão de turmas.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const turmas = useMemo(() => {
    return treinamentos
      .map((t) => {
        const registros = presencas.filter(
          (p) => String(p.treinamento_id) === String(t.id)
        );

        const presentes = registros.filter(
          (p) => normalizeStatus(p.status) === "presente"
        ).length;

        const ausentes = registros.filter(
          (p) => normalizeStatus(p.status) === "ausente"
        ).length;

        const justificados = registros.filter(
          (p) => normalizeStatus(p.status) === "justificado"
        ).length;

        const treinandos = Number(t.participantes || registros.length || 0);
        const totalLancados = presentes + ausentes + justificados;
        const pendentes = Math.max(treinandos - totalLancados, 0);
        const taxa = treinandos ? Math.round((presentes / treinandos) * 100) : 0;

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
          classificacao,
          statusTurma,
        };
      })
      .sort((a, b) => {
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
  }, [treinamentos, presencas]);

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
      semTreinandos,
      pendentes,
      andamento,
      concluidas,
    };
  }, [turmasFiltradas]);

  return (
    <PortalShell
      title="Gestão de Turmas"
      subtitle="Execução operacional das turmas, treinandos e acompanhamento consolidado da presença."
    >
      {loading ? (
        <div style={loadingBox}>Carregando gestão de turmas...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <>
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

          <div style={statsGrid}>
            <StatCard
              title="Turmas"
              value={fmt(resumo.turmasTotal)}
              subtitle="Consolidadas no filtro"
              accent="#2563eb"
            />
            <StatCard
              title="Treinandos"
              value={fmt(resumo.treinandos)}
              subtitle="Capacidade planejada"
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

          <div style={statusGrid}>
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

                  return (
                    <div key={item.id} style={turmaCard}>
                      <div style={cardTop}>
                        <span
                          style={
                            item.classificacao === "Crítico"
                              ? badgeCritico
                              : item.classificacao === "Atenção"
                              ? badgeAtencao
                              : badgeEstavel
                          }
                        >
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
                          <strong>Público:</strong> {item.publico || "-"}
                        </div>
                        <div>
                          <strong>Carga:</strong> {item.carga_horaria || "-"}
                        </div>
                        <div>
                          <strong>Supervisor:</strong> {item.supervisor || "-"}
                        </div>
                        <div>
                          <strong>Data-base:</strong> {fmtDate(item.data)}
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

const filtersGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1.4fr auto",
  gap: 12,
  alignItems: "end",
};

const fieldWrap = {
  display: "grid",
  gap: 6,
};

const label = {
  fontSize: 13,
  fontWeight: 700,
  color: "#334155",
};

const input = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontSize: 14,
  outline: "none",
};

const actionsWrap = {
  display: "flex",
  justifyContent: "flex-end",
};

const btnSecundario = {
  background: "#e2e8f0",
  color: "#0f172a",
  border: 0,
  borderRadius: 10,
  padding: "11px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14,
  marginBottom: 16,
};

const statusGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14,
  marginBottom: 16,
};

const cardsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 14,
};

const turmaCard = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 8px 22px rgba(15,23,42,.05)",
  display: "grid",
  gap: 10,
};

const cardTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const statusWrap = {
  marginTop: -2,
};

const badgeCritico = {
  background: "#fef2f2",
  color: "#b91c1c",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const badgeAtencao = {
  background: "#fff7ed",
  color: "#c2410c",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const badgeEstavel = {
  background: "#ecfdf5",
  color: "#047857",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const badgeTaxa = {
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const turmaTitulo = {
  fontSize: 20,
  fontWeight: 800,
  color: "#0f172a",
};

const turmaMeta = {
  color: "#64748b",
  fontSize: 14,
};

const miniLinha = {
  display: "flex",
  gap: 18,
  flexWrap: "wrap",
  color: "#64748b",
  fontSize: 13,
};

const infoBloco = {
  display: "grid",
  gap: 6,
  color: "#475569",
  fontSize: 14,
};

const acoesWrapCard = {
  marginTop: 4,
  display: "flex",
  justifyContent: "flex-end",
};

const btnPrimario = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const btnSecundarioAzul = {
  background: "#dbeafe",
  color: "#1d4ed8",
  border: 0,
  borderRadius: 10,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const btnAlerta = {
  background: "#fff7ed",
  color: "#c2410c",
  border: "1px solid #fdba74",
  borderRadius: 10,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
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
