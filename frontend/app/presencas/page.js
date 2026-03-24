"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import StatCard from "../../components/StatCard";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function parseDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const text = String(value).slice(0, 10);
  const parts = text.split("-");

  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    if (year && month && day) {
      return new Date(year, month - 1, day, 12, 0, 0);
    }
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function fmtDate(value) {
  if (!value) return "-";
  const d = parseDateSafe(value);
  if (!d) return String(value).slice(0, 10);
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

function getStatusTurma({
  treinandos,
  diasPlanejados,
  presencasLancadas,
  pendentes,
  usaCronograma,
}) {
  if (treinandos === 0) return "Sem treinandos";
  if (usaCronograma && diasPlanejados === 0) return "Sem cronograma";
  if (presencasLancadas === 0) return "Chamada pendente";
  if (pendentes > 0) return "Em andamento";
  return "Concluída";
}

function getClassificacao({ taxa, treinandos, pendentes, statusTurma }) {
  if (statusTurma === "Sem treinandos" || statusTurma === "Sem cronograma") {
    return "Crítico";
  }
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

  if (status === "Sem treinandos" || status === "Sem cronograma") {
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

function getActionConfig(statusTurma, usaCronograma) {
  if (statusTurma === "Sem treinandos") {
    return {
      label: "Importar treinandos",
      style: btnAlerta,
    };
  }

  if (usaCronograma && statusTurma === "Sem cronograma") {
    return {
      label: "Gerar cronograma",
      style: btnAlerta,
    };
  }

  if (statusTurma === "Chamada pendente" || statusTurma === "Em andamento") {
    return {
      label: usaCronograma ? "Abrir gestão da turma" : "Abrir chamada",
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

        const [treinamentosData, presencasData] = await Promise.all([
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/presencas").catch(() => []),
        ]);

        const listaTreinamentos = Array.isArray(treinamentosData)
          ? treinamentosData
          : [];
        const listaPresencas = Array.isArray(presencasData) ? presencasData : [];

        const turmasEnriquecidas = await Promise.all(
          listaTreinamentos.map(async (t) => {
            const [participantes, aulas] = await Promise.all([
              apiFetch(`/treinamentos/${t.id}/participantes`).catch(() => []),
              apiFetch(`/turma-aulas?treinamento_id=${t.id}`).catch(() => []),
            ]);

            const listaParticipantes = Array.isArray(participantes)
              ? participantes
              : [];
            const listaAulas = Array.isArray(aulas) ? aulas : [];

            const treinandos = Number(
              t.participantes || listaParticipantes.length || 0
            );
            const diasPlanejados = listaAulas.length;
            const usaCronograma = diasPlanejados > 0;

            let presentes = 0;
            let ausentes = 0;
            let justificados = 0;
            let pendentes = 0;
            let baseEsperada = 0;
            let origemFrequencia = "legado";

            if (usaCronograma) {
              origemFrequencia = "cronograma";

              const resumos = await Promise.all(
                listaAulas.map((aula) =>
                  apiFetch(`/presenca-aulas/resumo/${aula.id}`).catch(() => null)
                )
              );

              for (const item of resumos) {
                const resumo = item?.resumo || {};
                presentes += Number(resumo.presentes || 0);
                ausentes += Number(resumo.ausentes || 0);
                justificados += Number(resumo.justificados || 0);
                pendentes += Number(resumo.pendentes || 0);
              }

              baseEsperada = treinandos * diasPlanejados;
            } else {
              const presencasTurma = listaPresencas.filter(
                (p) => Number(p.treinamento_id) === Number(t.id)
              );

              presentes = presencasTurma.filter(
                (p) => normalizeStatus(p.status) === "presente"
              ).length;

              ausentes = presencasTurma.filter(
                (p) => normalizeStatus(p.status) === "ausente"
              ).length;

              justificados = presencasTurma.filter(
                (p) => normalizeStatus(p.status) === "justificado"
              ).length;

              pendentes = presencasTurma.filter(
                (p) =>
                  !p.status ||
                  normalizeStatus(p.status) === "" ||
                  normalizeStatus(p.status) === "pendente"
              ).length;

              // No legado, a base do percentual passa a ser o total lançado
              const totalLancadoLegado =
                presentes + ausentes + justificados + pendentes;

              baseEsperada =
                totalLancadoLegado > 0 ? totalLancadoLegado : treinandos;
            }

            const presencasLancadas =
              presentes + ausentes + justificados + pendentes;

            const taxa =
              baseEsperada > 0
                ? Math.round((presentes / baseEsperada) * 100)
                : 0;

            const statusTurma = getStatusTurma({
              treinandos,
              diasPlanejados,
              presencasLancadas,
              pendentes,
              usaCronograma,
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
              diasPlanejados,
              baseEsperada,
              presentes,
              ausentes,
              justificados,
              pendentes,
              taxa,
              classificacao,
              statusTurma,
              usaCronograma,
              origemFrequencia,
            };
          })
        );

        setTreinamentos(turmasEnriquecidas);
        setErro("");
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
        "Sem cronograma": 2,
        "Chamada pendente": 3,
        "Em andamento": 4,
        Concluída: 5,
      };

      const aOrdem = ordemStatus[a.statusTurma] || 99;
      const bOrdem = ordemStatus[b.statusTurma] || 99;

      if (aOrdem !== bOrdem) return aOrdem - bOrdem;
      return a.taxa - b.taxa;
    });
  }, [treinamentos]);

  const clientesOptions = useMemo(() => {
    const lista = [...new Set(turmas.map((item) => item.cliente).filter(Boolean))];
    return lista.sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
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
    const semCronograma = turmasFiltradas.filter(
      (item) => item.statusTurma === "Sem cronograma"
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
      semCronograma,
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
                  <option value="Sem cronograma">Sem cronograma</option>
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
              title="Sem cronograma"
              value={fmt(resumo.semCronograma)}
              subtitle="Sem aulas geradas"
              accent="#b91c1c"
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
          </div>

          <SectionCard
            title="Painel das turmas"
            subtitle="Leitura híbrida: turmas novas usam cronograma; turmas antigas usam histórico com percentual sobre lançamentos."
          >
            {turmasFiltradas.length ? (
              <div style={cardsGrid}>
                {turmasFiltradas.map((item) => {
                  const action = getActionConfig(item.statusTurma, item.usaCronograma);

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
                        <span>{fmt(item.diasPlanejados)} aula(s)</span>
                        <span>{fmt(item.presentes)} pres.</span>
                        <span>{fmt(item.ausentes)} aus.</span>
                        <span>{fmt(item.justificados)} just.</span>
                        <span>{fmt(item.pendentes)} pend.</span>
                      </div>

                      <div style={origemWrap}>
                        <span
                          style={
                            item.origemFrequencia === "cronograma"
                              ? origemBadgeNovo
                              : origemBadgeLegado
                          }
                        >
                          {item.origemFrequencia === "cronograma"
                            ? "Base: cronograma"
                            : "Base: histórico legado"}
                        </span>
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
                          <strong>Base do cálculo:</strong> {fmt(item.baseEsperada)}
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

const origemWrap = {
  marginTop: -2,
};

const origemBadgeNovo = {
  display: "inline-block",
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const origemBadgeLegado = {
  display: "inline-block",
  background: "#f8fafc",
  color: "#475569",
  border: "1px solid #cbd5e1",
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
