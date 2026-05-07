"use client";

import { useEffect, useMemo, useState } from "react";
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

  if (["cancelada", "cancelado"].includes(status)) return "Cancelada";
  if (["concluida", "concluído", "concluido"].includes(status)) return "Concluída";
  if (["em_andamento", "em andamento"].includes(status)) return "Em andamento";
  if (["planejada", "planejado"].includes(status)) return "Planejada";

  const hoje = todayLocal();
  const inicio = parseDateSafe(dataInicio);
  const fim = parseDateSafe(dataFim);

  if (treinandos === 0) return "Sem treinandos";
  if (usaCronograma && diasPlanejados === 0) return "Sem cronograma";
  if (presencasLancadas === 0) return "Chamada pendente";

  if (fim && !Number.isNaN(fim.getTime()) && hoje > fim) {
    return "Concluída";
  }

  if (inicio && !Number.isNaN(inicio.getTime()) && hoje < inicio) {
    return "Planejada";
  }

  if (pendentes > 0) return "Em andamento";
  return "Concluída";
}

function getClassificacao({ taxa, treinandos, pendentes, statusTurma }) {
  if (
    statusTurma === "Sem treinandos" ||
    statusTurma === "Sem cronograma" ||
    statusTurma === "Cancelada"
  ) {
    return "Crítico";
  }

  if (statusTurma === "Planejada") return "Atenção";
  if (statusTurma === "Chamada pendente") return "Atenção";
  if (statusTurma === "Em andamento" && pendentes > 0) return "Atenção";
  if (treinandos > 0 && taxa < 85 && statusTurma !== "Concluída") return "Crítico";

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

  if (status === "Planejada") {
    return { ...base, background: "#fef3c7", color: "#92400e" };
  }

  if (status === "Chamada pendente") {
    return { ...base, background: "#fff7ed", color: "#c2410c" };
  }

  if (status === "Em andamento") {
    return { ...base, background: "#eff6ff", color: "#1d4ed8" };
  }

  if (status === "Cancelada") {
    return { ...base, background: "#fee2e2", color: "#b91c1c" };
  }

  return { ...base, background: "#ecfdf5", color: "#047857" };
}

function getActionConfig(statusTurma, usaCronograma) {
  if (statusTurma === "Sem treinandos") {
    return {
      label: "Importar treinandos",
      style: btnAlerta,
      hrefType: "turma",
    };
  }

  if (usaCronograma && statusTurma === "Sem cronograma") {
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

  if (statusTurma === "Chamada pendente" || statusTurma === "Em andamento") {
    return {
      label: usaCronograma ? "Gerir turma" : "Abrir chamada",
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
              statusOficial: t.status,
              treinandos,
              diasPlanejados,
              presencasLancadas,
              pendentes,
              usaCronograma,
              dataInicio: t.data_inicio || t.data,
              dataFim: t.data_fim || t.data_inicio || t.data,
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
        Planejada: 3,
        "Chamada pendente": 4,
        "Em andamento": 5,
        Concluída: 6,
        Cancelada: 7,
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
    const planejadas = turmasFiltradas.filter(
      (item) => item.statusTurma === "Planejada"
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
    const canceladas = turmasFiltradas.filter(
      (item) => item.statusTurma === "Cancelada"
    ).length;

    return {
      turmasTotal,
      treinandos,
      presentes,
      horas,
      semTreinandos,
      semCronograma,
      planejadas,
      pendentes,
      andamento,
      concluidas,
      canceladas,
    };
  }, [turmasFiltradas]);

  function abrirTurma(item) {
    window.location.href = `/turma/${item.id}`;
  }

  function exportarRelatorio() {
    const cabecalhos = [
      "Turma",
      "Cliente",
      "Status",
      "Inicio",
      "Fim",
      "Treinandos",
      "Carga horária",
      "CH realizada"
    ];

    const linhas = turmasFiltradas.map(turma => [
      turma.tema || "",
      turma.cliente || "",
      turma.statusTurma || "",
      turma.data_inicio || turma.data || "",
      turma.data_fim || turma.data_inicio || turma.data || "",
      turma.treinandos || 0,
      turma.carga_horaria || 0,
      turma.horas_realizadas || 0
    ]);

    const conteudoCSV = [cabecalhos.join(";"), ...linhas.map(l => l.join(";"))].join("\n");

    const blob = new Blob([conteudoCSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio_presenca_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <PortalShell
