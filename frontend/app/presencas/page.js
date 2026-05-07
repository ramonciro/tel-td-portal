"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

import PortalShell from "../../components/PortalShell";
import StatCard from "../../components/StatCard";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";
import { formatDateBR, parseLocalDate, todayLocal } from "../../lib/date";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function parseDateSafe(value) {
  return parseLocalDate(value);
}

function fmtDate(value) {
  return formatDateBR(value, "-");
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
  statusOficial,
  treinandos,
  diasPlanejados,
  presencasLancadas,
  pendentes,
  usaCronograma,
  dataInicio,
  dataFim,
}) {
  const status = String(statusOficial || "").trim().toLowerCase();

  if (["cancelada", "cancelado"].includes(status)) {
    return "Cancelada";
  }

  if (["concluida", "concluído", "concluido"].includes(status)) {
    return "Concluída";
  }

  if (["em_andamento", "em andamento"].includes(status)) {
    return "Em andamento";
  }

  if (["planejada", "planejado"].includes(status)) {
    return "Planejada";
  }

  const hoje = todayLocal();

  const inicio = parseDateSafe(dataInicio);

  const fim = parseDateSafe(dataFim);

  if (treinandos === 0) return "Sem treinandos";

  if (usaCronograma && diasPlanejados === 0) {
    return "Sem cronograma";
  }

  if (presencasLancadas === 0) {
    return "Chamada pendente";
  }

  if (fim && !Number.isNaN(fim.getTime()) && hoje > fim) {
    return "Concluída";
  }

  if (inicio && !Number.isNaN(inicio.getTime()) && hoje < inicio) {
    return "Planejada";
  }

  if (pendentes > 0) {
    return "Em andamento";
  }

  return "Concluída";
}

function getClassificacao({
  taxa,
  treinandos,
  pendentes,
  statusTurma,
}) {
  if (
    statusTurma === "Sem treinandos" ||
    statusTurma === "Sem cronograma" ||
    statusTurma === "Cancelada"
  ) {
    return "Crítico";
  }

  if (statusTurma === "Planejada") {
    return "Atenção";
  }

  if (statusTurma === "Chamada pendente") {
    return "Atenção";
  }

  if (
    statusTurma === "Em andamento" &&
    pendentes > 0
  ) {
    return "Atenção";
  }

  if (
    treinandos > 0 &&
    taxa < 85 &&
    statusTurma !== "Concluída"
  ) {
    return "Crítico";
  }

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

  if (
    status === "Sem treinandos" ||
    status === "Sem cronograma"
  ) {
    return {
      ...base,
      background: "#fef2f2",
      color: "#b91c1c",
    };
  }

  if (status === "Planejada") {
    return {
      ...base,
      background: "#fef3c7",
      color: "#92400e",
    };
  }

  if (status === "Chamada pendente") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#c2410c",
    };
  }

  if (status === "Em andamento") {
    return {
      ...base,
      background: "#eff6ff",
      color: "#1d4ed8",
    };
  }

  if (status === "Cancelada") {
    return {
      ...base,
      background: "#fee2e2",
      color: "#b91c1c",
    };
  }

  return {
    ...base,
    background: "#ecfdf5",
    color: "#047857",
  };
}

function getActionConfig(statusTurma, usaCronograma) {
  if (statusTurma === "Sem treinandos") {
    return {
      label: "Importar treinandos",
      style: btnAlerta,
      hrefType: "turma",
    };
  }

  if (
    usaCronograma &&
    statusTurma === "Sem cronograma"
  ) {
    return {
      label: "Gerir turma",
      style: btnAlerta,
      hrefType: "turma",
    };
  }

  if (statusTurma === "Planejada") {
    return {
      label: "Gerir turma",
      style: btnAlerta,
      hrefType: "turma",
    };
  }

  if (statusTurma === "Cancelada") {
    return {
      label: "Ver gestão da turma",
      style: btnSecundarioAzul,
      hrefType: "turma",
    };
  }

  if (
    statusTurma === "Chamada pendente" ||
    statusTurma === "Em andamento"
  ) {
    return {
      label: usaCronograma
        ? "Gerir turma"
        : "Abrir chamada",
      style: btnPrimario,
      hrefType: "turma",
    };
  }

  return {
    label: "Ver gestão da turma",
    style: btnSecundarioAzul,
    hrefType: "turma",
  };
}

export default function GestaoTurmasPage() {
  const [treinamentos, setTreinamentos] = useState([]);

  const [erro, setErro] = useState("");

  const [loading, setLoading] = useState(true);

  const [filtroStatus, setFiltroStatus] =
    useState("todos");

  const [filtroCliente, setFiltroCliente] =
    useState("todos");

  const [busca, setBusca] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        const [treinamentosData, presencasData] =
          await Promise.all([
            apiFetch("/treinamentos").catch(() => []),
            apiFetch("/presencas").catch(() => []),
          ]);

        const listaTreinamentos = Array.isArray(
          treinamentosData
        )
          ? treinamentosData
          : [];

        const listaPresencas = Array.isArray(
          presencasData
        )
          ? presencasData
          : [];

        const turmasEnriquecidas =
          await Promise.all(
            listaTreinamentos.map(async (t) => {
              const [participantes, aulas] =
                await Promise.all([
                  apiFetch(
                    `/treinamentos/${t.id}/participantes`
                  ).catch(() => []),

                  apiFetch(
                    `/turma-aulas?treinamento_id=${t.id}`
                  ).catch(() => []),
                ]);

              const listaParticipantes =
                Array.isArray(participantes)
                  ? participantes
                  : [];

              const listaAulas = Array.isArray(aulas)
                ? aulas
                : [];

              const treinandos = Number(
                t.participantes ||
                  listaParticipantes.length ||
                  0
              );

              const diasPlanejados =
                listaAulas.length;

              const usaCronograma =
                diasPlanejados > 0;

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
                    apiFetch(
                      `/presenca-aulas/resumo/${aula.id}`
                    ).catch(() => null)
                  )
                );

                for (const item of resumos) {
                  const resumo = item?.resumo || {};

                  presentes += Number(
                    resumo.presentes || 0
                  );

                  ausentes += Number(
                    resumo.ausentes || 0
                  );

                  justificados += Number(
                    resumo.justificados || 0
                  );

                  pendentes += Number(
                    resumo.pendentes || 0
                  );
                }

                baseEsperada =
                  treinandos * diasPlanejados;
              } else {
                const presencasTurma =
                  listaPresencas.filter(
                    (p) =>
                      Number(p.treinamento_id) ===
                      Number(t.id)
                  );

                presentes =
                  presencasTurma.filter(
                    (p) =>
                      normalizeStatus(p.status) ===
                      "presente"
                  ).length;

                ausentes =
                  presencasTurma.filter(
                    (p) =>
                      normalizeStatus(p.status) ===
                      "ausente"
                  ).length;

                justificados =
                  presencasTurma.filter(
                    (p) =>
                      normalizeStatus(p.status) ===
                      "justificado"
                  ).length;

                pendentes =
                  presencasTurma.filter(
                    (p) =>
                      !p.status ||
                      normalizeStatus(p.status) ===
                        "" ||
                      normalizeStatus(p.status) ===
                        "pendente"
                  ).length;

                const totalLancadoLegado =
                  presentes +
                  ausentes +
                  justificados +
                  pendentes;

                baseEsperada =
                  totalLancadoLegado > 0
                    ? totalLancadoLegado
                    : treinandos;
              }

              const presencasLancadas =
                presentes +
                ausentes +
                justificados +
                pendentes;

              const taxa =
                baseEsperada > 0
                  ? Math.round(
                      (presentes / baseEsperada) *
                        100
                    )
                  : 0;

              const statusTurma = getStatusTurma({
                statusOficial: t.status,
                treinandos,
                diasPlanejados,
                presencasLancadas,
                pendentes,
                usaCronograma,
                dataInicio:
                  t.data_inicio || t.data,
                dataFim:
                  t.data_fim ||
                  t.data_inicio ||
                  t.data,
              });

              const classificacao =
                getClassificacao({
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
        setErro(
          error.message ||
            "Erro ao carregar gestão de turmas."
        );
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
        Planejada: 3,
        "Chamada pendente": 4,
        "Em andamento": 5,
        Concluída: 6,
        Cancelada: 7,
      };

      const aOrdem =
        ordemStatus[a.statusTurma] || 99;

      const bOrdem =
        ordemStatus[b.statusTurma] || 99;

      if (aOrdem !== bOrdem) {
        return aOrdem - bOrdem;
      }

      return a.taxa - b.taxa;
    });
  }, [treinamentos]);

  const clientesOptions = useMemo(() => {
    const lista = [
      ...new Set(
        turmas
          .map((item) => item.cliente)
          .filter(Boolean)
      ),
    ];

    return lista.sort((a, b) =>
      String(a).localeCompare(
        String(b),
        "pt-BR"
      )
    );
  }, [turmas]);

  const turmasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return turmas.filter((item) => {
      const matchStatus =
        filtroStatus === "todos" ||
        item.statusTurma === filtroStatus;

      const matchCliente =
        filtroCliente === "todos" ||
        String(item.cliente || "") ===
          filtroCliente;

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

      const matchBusca =
        !termo || alvoBusca.includes(termo);

      return (
        matchStatus &&
        matchCliente &&
        matchBusca
      );
    });
  }, [
    turmas,
    filtroStatus,
    filtroCliente,
    busca,
  ]);

  function calcularCHRealizada(item) {
    const carga = parseHoras(
      item.carga_horaria
    );

    if (item.statusTurma === "Concluída") {
      return carga;
    }

    if (
      item.statusTurma === "Planejada" ||
      item.statusTurma === "Cancelada" ||
      item.statusTurma ===
        "Sem treinandos" ||
      item.statusTurma ===
        "Sem cronograma"
    ) {
      return 0;
    }

    if (item.diasPlanejados > 0) {
      const aulasConcluidas =
        item.diasPlanejados -
        Number(item.pendentes || 0);

      return Number(
        (
          (carga / item.diasPlanejados) *
          aulasConcluidas
        ).toFixed(1)
      );
    }

    return 0;
  }

  function exportarRelatorio() {
    const dados = turmasFiltradas.map(
      (item) => ({
        Turma: item.tema || "-",

        Cliente: item.cliente || "-",

        Status: item.statusTurma || "-",

        Inicio: fmtDate(
          item.data_inicio || item.data
        ),

        Fim: fmtDate(
          item.data_fim || item.data
        ),

        Treinandos: Number(
          item.treinandos || 0
        ),

        "Carga horária":
          item.carga_horaria || "0h",

        "CH realizada": `${calcularCHRealizada(
          item
        )}h`,
      })
    );

    const worksheet =
      XLSX.utils.json_to_sheet(dados);

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Relatório Presença"
    );

    const hoje = new Date();

    const dataArquivo = `${hoje.getFullYear()}-${String(
      hoje.getMonth() + 1
    ).padStart(2, "0")}-${String(
      hoje.getDate()
    ).padStart(2, "0")}`;

    XLSX.writeFile(
      workbook,
      `relatorio_presenca_${dataArquivo}.xlsx`
    );
  }

  const resumo = useMemo(() => {
    const turmasTotal =
      turmasFiltradas.length;

    const treinandos =
      turmasFiltradas.reduce(
        (acc, item) =>
          acc +
          Number(item.treinandos || 0),
        0
      );

    const presentes =
      turmasFiltradas.reduce(
        (acc, item) =>
          acc +
          Number(item.presentes || 0),
        0
      );

    const horas = turmasFiltradas.reduce(
      (acc, item) =>
        acc + parseHoras(item.carga_horaria),
      0
    );

    return {
      turmasTotal,
      treinandos,
      presentes,
      horas,
    };
  }, [turmasFiltradas]);

  function abrirTurma(item) {
    window.location.href = `/turma/${item.id}`;
  }

  return (
    <PortalShell
      title="Gestão de Turmas"
      subtitle="Execução operacional das turmas, treinandos e acompanhamento consolidado da presença."
    >
      {loading ? (
        <div style={loadingBox}>
          Carregando gestão de turmas...
        </div>
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
                <label style={label}>
                  Status da turma
                </label>

                <select
                  value={filtroStatus}
                  onChange={(e) =>
                    setFiltroStatus(
                      e.target.value
                    )
                  }
                  style={input}
                >
                  <option value="todos">
                    Todos
                  </option>

                  <option value="Sem treinandos">
                    Sem treinandos
                  </option>

                  <option value="Sem cronograma">
                    Sem cronograma
                  </option>

                  <option value="Planejada">
                    Planejada
                  </option>

                  <option value="Chamada pendente">
                    Chamada pendente
                  </option>

                  <option value="Em andamento">
                    Em andamento
                  </option>

                  <option value="Concluída">
                    Concluída
                  </option>

                  <option value="Cancelada">
                    Cancelada
                  </option>
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={label}>
                  Cliente
                </label>

                <select
                  value={filtroCliente}
                  onChange={(e) =>
                    setFiltroCliente(
                      e.target.value
                    )
                  }
                  style={input}
                >
                  <option value="todos">
                    Todos
                  </option>

                  {clientesOptions.map(
                    (cliente) => (
                      <option
                        key={cliente}
                        value={cliente}
                      >
                        {cliente}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={label}>
                  Busca
                </label>

                <input
                  type="text"
                  value={busca}
                  onChange={(e) =>
                    setBusca(e.target.value)
                  }
                  placeholder="Buscar por turma, cliente, instrutor..."
                  style={input}
                />
              </div>

              <div style={actionsWrap}>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                  }}
                >
                  <button
                    style={btnSecundario}
                    onClick={() => {
                      setFiltroStatus(
                        "todos"
                      );

                      setFiltroCliente(
                        "todos"
                      );

                      setBusca("");
                    }}
                  >
                    Limpar filtros
                  </button>

                  <button
                    style={btnPrimario}
                    onClick={
                      exportarRelatorio
                    }
                  >
                    Exportar relatório
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>
        </>
      )}
    </PortalShell>
  );
}

const filtersGrid = {
  display: "grid",
  gridTemplateColumns:
    "1fr 1fr 1.4fr auto",
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

const btnPrimario = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "11px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const btnSecundarioAzul = {
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
  borderRadius: 12,
  padding: "11px 16px",
  cursor: "pointer",
  fontWeight: 800,
};

const btnAlerta = {
  background: "#fff7ed",
  color: "#c2410c",
  border: "1px solid #fed7aa",
  borderRadius: 12,
  padding: "11px 16px",
  cursor: "pointer",
  fontWeight: 800,
};

const loadingBox = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 18,
  color: "#334155",
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 18,
  padding: 18,
  color: "#b91c1c",
  fontWeight: 700,
};
