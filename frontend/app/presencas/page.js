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

  const hoje = todayLocal(); // "YYYY-MM-DD" string
  const inicio = parseDateSafe(dataInicio);
  const fim = parseDateSafe(dataFim);

  // converte fim para ISO string antes de comparar — hoje é string, fim é Date,
  // comparar direto sempre resulta em false por coerção de tipo
  const fimISO = fim && !Number.isNaN(fim.getTime())
    ? [
        fim.getFullYear(),
        String(fim.getMonth() + 1).padStart(2, "0"),
        String(fim.getDate()).padStart(2, "0"),
      ].join("-")
    : null;
  const fimPassou = fimISO != null && hoje > fimISO;

  // Cancelada é definitivo — sempre respeita o status oficial
  if (["cancelada", "cancelado"].includes(status)) return "Cancelada";

  // Concluída é definitivo — sempre respeita o status oficial
  if (["concluida", "concluído", "concluido"].includes(status)) return "Concluída";

  // data_fim vencida tem prioridade sobre qualquer status operacional
  // se o período acabou, a turma está concluída — chamadas pendentes são backlog administrativo
  if (fimPassou) return "Concluída";

  if (treinandos === 0) return "Sem treinandos";
  if (usaCronograma && diasPlanejados === 0) return "Sem cronograma";
  if (presencasLancadas === 0) return "Chamada pendente";

  if (["em_andamento", "em andamento"].includes(status)) return "Em andamento";
  if (["planejada", "planejado"].includes(status)) return "Planejada";

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
  // turmas concluídas com baixa frequência devem ser sinalizadas retroativamente
  if (statusTurma === "Concluída") {
    if (treinandos > 0 && taxa > 0 && taxa < 75) return "Crítico";
    if (treinandos > 0 && taxa > 0 && taxa < 85) return "Atenção";
    return "Estável";
  }

  // classificação baseada na frequência real (presentes / lançados), não na execução de chamada
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

            // FIX: fallback inteligente entre cronograma e legado.
            // Só faz fallback pro legado se:
            //   1. cronograma não tiver lançamentos reais (presentes+ausentes+just = 0)
            //   2. E a tabela presencas (legado) tiver dados para essa turma
            // Isso preserva chamadas inicializadas-mas-pendentes no cronograma
            // e ainda assim mostra os dados do legado quando a chamada foi
            // feita pela tabela presencas (sistema antigo).
            let usarLegado = false;

            if (usaCronograma) {
              const resumos = await Promise.all(
                listaAulas.map((aula) =>
                  apiFetch(`/presenca-aulas/resumo/${aula.id}`).catch(() => null)
                )
              );

              let pTmp = 0, aTmp = 0, jTmp = 0, pndTmp = 0;
              for (const item of resumos) {
                const resumo = item?.resumo || {};
                pTmp += Number(resumo.presentes || 0);
                aTmp += Number(resumo.ausentes || 0);
                jTmp += Number(resumo.justificados || 0);
                pndTmp += Number(resumo.pendentes || 0);
              }

              const totalRealCronograma = pTmp + aTmp + jTmp;
              const temLegadoParaEssaTurma = listaPresencas.some(
                (p) => Number(p.treinamento_id) === Number(t.id)
              );

              if (totalRealCronograma === 0 && temLegadoParaEssaTurma) {
                usarLegado = true;
              } else {
                origemFrequencia = "cronograma";
                presentes = pTmp;
                ausentes = aTmp;
                justificados = jTmp;
                pendentes = pndTmp;
                baseEsperada = treinandos * diasPlanejados;
              }
            }

            if (!usaCronograma || usarLegado) {
              // "legado" só quando: fallback de cronograma OU sem treinandos
              // Turma com treinandos mas sem cronograma usa presencas normalmente
              origemFrequencia =
                usarLegado || treinandos === 0 ? "legado" : "presencas";
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

            const totalRealizado =
              presentes + ausentes + justificados;

            // taxa de execução: % de chamadas lançadas sobre a base esperada
            const taxaExecucao =
              baseEsperada > 0
                ? Math.round((totalRealizado / baseEsperada) * 100)
                : 0;

            // taxa de frequência real: % de presentes sobre os lançamentos confirmados
            // (exclui pendentes do denominador — só conta quem teve chamada lançada)
            const taxaPresenca =
              totalRealizado > 0
                ? Math.round((presentes / totalRealizado) * 100)
                : 0;

            // mantém taxa = taxaPresenca para compatibilidade com ordenação e classificação
            const taxa = taxaPresenca;

            const statusTurma = getStatusTurma({
              statusOficial: t.status,
              treinandos,
              diasPlanejados,
              presencasLancadas,
              pendentes,
              usaCronograma,
              dataInicio: t.data_inicio || t.data,
              dataFim: t.data_fim || null, // não usa data_inicio como fallback — turma sem data_fim não é automaticamente concluída
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
              taxaPresenca,
              taxaExecucao,
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

    // participações: soma bruta de presenças confirmadas (multi-sessão para cronograma)
    const participacoes = turmasFiltradas.reduce(
      (acc, item) => acc + Number(item.presentes || 0),
      0
    );

    // taxa média ponderada: média da taxaPresenca apenas das turmas com lançamentos reais
    const turmasComDados = turmasFiltradas.filter(
      (item) => (item.presentes + item.ausentes + item.justificados) > 0
    );
    const taxaMedia =
      turmasComDados.length > 0
        ? Math.round(
            turmasComDados.reduce((acc, item) => acc + item.taxaPresenca, 0) /
              turmasComDados.length
          )
        : null;

    // carga horária realizada (usa calcularCHRealizada para turmas Em andamento)
    const horas = turmasFiltradas.reduce(
      (acc, item) => acc + calcularCHRealizada(item),
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
      participacoes,
      taxaMedia,
      turmasComDados: turmasComDados.length,
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


function calcularCHRealizada(item) {
  const carga = parseHoras(item.carga_horaria);

  if (item.statusTurma === "Concluída") {
    return carga;
  }

  if (
    item.statusTurma === "Planejada" ||
    item.statusTurma === "Cancelada" ||
    item.statusTurma === "Sem treinandos" ||
    item.statusTurma === "Sem cronograma"
  ) {
    return 0;
  }

  if (item.diasPlanejados > 0) {
    // proxy correto: proporção de lançamentos confirmados sobre a base esperada
    // (pendentes são participantes, não aulas — não pode subtrair direto de diasPlanejados)
    const baseEsperada = Number(item.baseEsperada || 0);
    const confirmados = Number(item.presentes || 0) +
      Number(item.ausentes || 0) +
      Number(item.justificados || 0);

    const proporcaoRealizada = baseEsperada > 0
      ? Math.min(confirmados / baseEsperada, 1)
      : 0;

    return Number((carga * proporcaoRealizada).toFixed(1));
  }

  return 0;
}

function exportarRelatorio() {
  const dados = turmasFiltradas.map((item) => ({
    Turma: item.tema || "-",
    Cliente: item.cliente || "-",
    Status: item.statusTurma || "-",
    Inicio: fmtDate(item.data_inicio || item.data),
    Fim: fmtDate(
      item.data_fim ||
      item.data_inicio ||
      item.data
    ),
    Treinandos: Number(item.treinandos || 0),
    "Carga horária":
      item.carga_horaria || "0h",
    "CH realizada": `${calcularCHRealizada(item)}h`,
  }));

  const worksheet =
    XLSX.utils.json_to_sheet(dados);

  const workbook =
    XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Relatório Presença"
  );

  XLSX.writeFile(
    workbook,
    "relatorio_presenca.xlsx"
  );
}


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
                  <option value="Planejada">Planejada</option>
                  <option value="Chamada pendente">Chamada pendente</option>
                  <option value="Em andamento">Em andamento</option>
                  <option value="Concluída">Concluída</option>
                  <option value="Cancelada">Cancelada</option>
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
                <div style={{ display: "flex", gap: 10 }}>
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

                  <button
                    style={btnPrimario}
                    onClick={exportarRelatorio}
                  >
                    Exportar relatório
                  </button>
                </div>
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
              title={resumo.taxaMedia !== null ? "Freq. Média" : "Participações"}
              value={
                resumo.taxaMedia !== null
                  ? `${resumo.taxaMedia}%`
                  : fmt(resumo.participacoes)
              }
              subtitle={
                resumo.taxaMedia !== null
                  ? `Média de ${resumo.turmasComDados} turma${resumo.turmasComDados !== 1 ? "s" : ""} com dados`
                  : "Registros confirmados"
              }
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
              title="Planejadas"
              value={fmt(resumo.planejadas)}
              subtitle="Ainda não iniciadas"
              accent="#d97706"
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
              subtitle="Turmas finalizadas"
              accent="#16a34a"
            />
            <StatCard
              title="Canceladas"
              value={fmt(resumo.canceladas)}
              subtitle="Encerradas sem execução"
              accent="#dc2626"
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

                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                          {/* freq: só mostra % quando há lançamentos confirmados; senão "S/D" */}
                          {item.taxaExecucao === 0 && item.pendentes === 0 ? (
                            <span style={{ ...badgeTaxa, background: "#f3f4f6", color: "#6b7280" }} title="Sem chamadas registradas">
                              <span style={{ fontSize: 10, fontWeight: 600, opacity: .75 }}>freq. </span>S/D
                            </span>
                          ) : item.taxaExecucao === 0 ? (
                            <span style={{ ...badgeTaxa, background: "#fef9c3", color: "#92400e" }} title="Chamada inicializada mas não confirmada">
                              <span style={{ fontSize: 10, fontWeight: 600, opacity: .75 }}>freq. </span>pend.
                            </span>
                          ) : (
                            <span style={{ ...badgeTaxa, background: "#ecfdf5", color: "#047857" }} title="Taxa de frequência: presentes / chamadas lançadas">
                              <span style={{ fontSize: 10, fontWeight: 600, opacity: .75 }}>freq. </span>{item.taxaPresenca}%
                            </span>
                          )}
                          {/* exec: só exibe se há base esperada */}
                          {item.baseEsperada > 0 && (
                            <span style={{ ...badgeTaxa, background: "#eff6ff", color: "#1d4ed8", fontSize: 11 }} title="Taxa de execução: chamadas lançadas / base esperada">
                              <span style={{ fontSize: 10, fontWeight: 600, opacity: .75 }}>exec. </span>{item.taxaExecucao}%
                            </span>
                          )}
                        </div>
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
                        {item.origemFrequencia !== "presencas" && (
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
                        )}
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
                          onClick={() => abrirTurma(item)}
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
  gap: 4,
  fontSize: 14,
  color: "#334155",
};

const acoesWrapCard = {
  display: "flex",
  justifyContent: "flex-end",
  marginTop: 2,
};

const btnPrimario = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 12,
  padding: "11px 16px",
  cursor: "pointer",
  fontWeight: 800,
  boxShadow: "0 8px 18px rgba(37,99,235,.25)",
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

const emptyText = {
  color: "#64748b",
  fontSize: 14,
  padding: "8px 2px",
};
