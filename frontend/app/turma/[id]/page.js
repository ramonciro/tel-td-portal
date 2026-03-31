"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "../../../services/api";
import { compareLocalDatesAsc, formatDateBR, parseLocalDate, todayLocal } from "../../../lib/date";
import { compareLocalDatesAsc, formatDateBR, parseLocalDate } from "../../../lib/date";

function formatDate(value) {
  return formatDateBR(value);
}

function calcPercentual(parte, total) {
  if (!total) return 0;
  return Math.round((Number(parte || 0) / Number(total || 0)) * 100);
}

function normalizarStatusTurma(status) {
  const key = String(status || "").trim().toLowerCase();

  if (["cancelada", "cancelado"].includes(key)) {
    return { label: "Cancelada", tone: "danger" };
  }

  if (["concluida", "concluído", "concluido"].includes(key)) {
    return { label: "Concluída", tone: "success" };
  }

  if (["em_andamento", "em andamento"].includes(key)) {
    return { label: "Em andamento", tone: "info" };
  }

  if (["planejada", "planejado"].includes(key)) {
    return { label: "Planejada", tone: "warning" };
  }

  return null;
}

function calcularStatusTurma({ totalAulas, aulasComPresenca, aderenciaMedia, dataInicio, dataFim }) {
const hoje = new Date();
const hojeLocal = new Date(
  hoje.getFullYear(),
  hoje.getMonth(),
  hoje.getDate(),
  12,
  0,
  0,
  0
);

const inicio = parseLocalDate(dataInicio);
const fim = parseLocalDate(dataFim);

if (fim && !Number.isNaN(fim.getTime()) && hojeLocal > fim) {
    if (aderenciaMedia >= 80 || totalAulas === 0) {
      return { label: "Concluída", tone: "success" };
    }
    return { label: "Concluída com atenção", tone: "danger" };
  }

if (inicio && !Number.isNaN(inicio.getTime()) && hojeLocal < inicio) {
    return { label: "Planejada", tone: "warning" };
  }

  if (!totalAulas) return { label: "Sem cronograma", tone: "neutral" };
  if (!aulasComPresenca) return { label: "Não iniciada", tone: "warning" };
  if (aulasComPresenca < totalAulas) return { label: "Em andamento", tone: "info" };
  if (aderenciaMedia >= 80) return { label: "Concluída", tone: "success" };
  return { label: "Concluída com atenção", tone: "danger" };
}

function getToneStyle(tone) {
  const map = {
    success: {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #bbf7d0",
    },
    info: {
      background: "#dbeafe",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
    },
    warning: {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fde68a",
    },
    danger: {
      background: "#fee2e2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    },
    neutral: {
      background: "#f1f5f9",
      color: "#334155",
      border: "1px solid #cbd5e1",
    },
  };

  return map[tone] || map.neutral;
}



function parseTurmaMetadata(descricao) {
  const text = String(descricao || "");
  return {
    modalidade: text.match(/\[modalidade:([^\]]+)\]/i)?.[1]?.trim() || "",
    sala: text.match(/\[sala:([^\]]*)\]/i)?.[1]?.trim() || "",
    descricaoLimpa: text
      .replace(/\[modalidade:[^\]]+\]\s*/gi, "")
      .replace(/\[sala:[^\]]*\]\s*/gi, "")
      .trim(),
  };
}

function statusExecucaoLabel(value) {
  const mapa = {
    planejada: "Planejada",
    em_andamento: "Em andamento",
    concluida: "Concluída",
    reprogramada: "Reprogramada",
    cancelada: "Cancelada",
  };
  return mapa[String(value || "").toLowerCase()] || "Planejada";
}

export default function GestaoTurmaPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const id = params?.id;
  const turmaAulaId = searchParams.get("turma_aula_id");
  const dataAula = searchParams.get("data_aula");
  const origem = searchParams.get("origem");

  const [treinamento, setTreinamento] = useState(null);
  const [participantes, setParticipantes] = useState([]);
  const [aulas, setAulas] = useState([]);
  const [resumoAulaSelecionada, setResumoAulaSelecionada] = useState(null);

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    carregarTudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, turmaAulaId, dataAula]);

  async function carregarTudo() {
    try {
      if (!id) return;

      setLoading(true);
      setErro("");
      setSucesso("");

      const [dadosTreinamento, listaParticipantes, listaAulas] = await Promise.all([
        apiFetch(`/treinamentos/${id}`),
        apiFetch(`/treinamentos/${id}/participantes`).catch(() => []),
        apiFetch(`/turma-aulas?treinamento_id=${id}`).catch(() => []),
      ]);

      const treinamentoSafe = dadosTreinamento || null;
      const participantesSafe = Array.isArray(listaParticipantes) ? listaParticipantes : [];
      const aulasSafe = Array.isArray(listaAulas) ? listaAulas : [];

      setTreinamento(treinamentoSafe);
      setParticipantes(participantesSafe);
      setAulas(aulasSafe);

      if (turmaAulaId) {
        const resumo = await apiFetch(`/presenca-aulas/resumo/${turmaAulaId}`).catch(
          () => null
        );
        if (resumo) {
          setResumoAulaSelecionada({
            total: Number(resumo.total || 0),
            presentes: Number(resumo.presentes || 0),
            ausentes: Number(resumo.ausentes || 0),
            justificados: Number(resumo.justificados || 0),
            pendentes: Number(resumo.pendentes || 0),
            percentual: Number(resumo.percentual || 0),
          });
        } else {
          setResumoAulaSelecionada(null);
        }
      } else {
        setResumoAulaSelecionada(null);
      }
    } catch (err) {
      setErro(err.message || "Erro ao carregar a gestão da turma.");
    } finally {
      setLoading(false);
    }
  }

  const resumoGeral = useMemo(() => {
    const totalAulas = aulas.length;
    const treinandosPrevistos = participantes.length;

    const aulasMapeadas = aulas.length;

    const aulasComPresenca = aulas.filter((aula) =>
      ["concluida", "em_andamento"].includes(
        String(aula.status_execucao || "").toLowerCase()
      )
    ).length;

    const pendencias = aulas.filter(
      (aula) => String(aula.status_execucao || "planejada").toLowerCase() === "planejada"
    ).length;

    const percentualMedio =
      totalAulas > 0 ? calcPercentual(aulasComPresenca, totalAulas) : 0;

const statusOficial = normalizarStatusTurma(treinamento?.status);

const status =
  statusOficial ||
  calcularStatusTurma({
    totalAulas,
    aulasComPresenca,
    aderenciaMedia: percentualMedio,
    dataInicio: treinamento?.data_inicio || treinamento?.data,
    dataFim: treinamento?.data_fim || treinamento?.data_inicio || treinamento?.data,
  });

const proximaAula =
  aulas
    .filter(
      (aula) =>
        String(aula.status_execucao || "planejada").toLowerCase() === "planejada"
    )
    .sort((a, b) => compareLocalDatesAsc(a.data_aula, b.data_aula))[0] || null;

    return {
      treinandosPrevistos,
      totalAulas,
      aulasMapeadas,
      aulasComPresenca,
      pendencias,
      percentualMedio,
      status,
      proximaAula,
    };
  }, [aulas, participantes, treinamento]);

  const metadataTurma = useMemo(
    () => parseTurmaMetadata(treinamento?.descricao),
    [treinamento?.descricao]
  );

  const aulaSelecionada = useMemo(() => {
    if (!turmaAulaId) return null;
    return (
      aulas.find((item) => String(item.id) === String(turmaAulaId)) || null
    );
  }, [aulas, turmaAulaId]);

  function voltar() {
    window.location.href = "/treinamentos";
  }

  function abrirCronograma() {
    window.location.href = `/turma/${id}/cronograma`;
  }

  function abrirParticipantes() {
    window.location.href = `/turma/${id}/participantes`;
  }

  function abrirPresencaAula() {
    if (!turmaAulaId || !dataAula) {
      setErro("Selecione uma aula pelo cronograma para abrir a presença.");
      return;
    }

    window.location.href = `/turma/${id}?turma_aula_id=${turmaAulaId}&data_aula=${dataAula}&origem=${origem || "cronograma"}`;
  }

  if (loading) {
    return <div style={loadingWrap}>Carregando gestão da turma...</div>;
  }

  const toneStyle = getToneStyle(resumoGeral.status.tone);

  return (
    <div style={page}>
      <div style={topBar}>
        <button style={btnVoltar} onClick={voltar}>
          ← Voltar
        </button>
      </div>

      <div style={hero}>
        <div style={heroBadge}>Gestão da turma</div>
        <h1 style={heroTitle}>{treinamento?.tema || "Turma"}</h1>
        <p style={heroSubtitle}>
          Visão consolidada da turma, seus dados principais e atalhos de acompanhamento.
        </p>

        <div style={heroGrid}>
          <InfoCard label="Turma" value={treinamento?.tema || "-"} />
          <InfoCard label="Cliente" value={treinamento?.cliente || "-"} />
          <InfoCard label="Instrutor" value={treinamento?.instrutor || "-"} />
          <InfoCard
            label="Período"
            value={`${formatDate(
              treinamento?.data_inicio || treinamento?.data
            )} até ${formatDate(
              treinamento?.data_fim || treinamento?.data_inicio || treinamento?.data
            )}`}
          />
        </div>
      </div>

      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={statsGrid}>
        <StatCard title="Treinandos previstos" value={resumoGeral.treinandosPrevistos} />
        <StatCard title="Aulas planejadas" value={resumoGeral.totalAulas} />
        <StatCard title="Aulas mapeadas" value={resumoGeral.aulasMapeadas} />
        <StatCard title="Pendências" value={resumoGeral.pendencias} />
        <StatCard title="Percentual médio" value={`${resumoGeral.percentualMedio}%`} />
      </div>

      <div style={statusCard}>
        <div style={statusLabel}>Status geral da turma</div>
        <div style={{ ...statusBadge, ...toneStyle }}>
          {resumoGeral.status.label}
        </div>
      </div>

      <div style={sectionCard}>
        <h2 style={sectionTitle}>Ações rápidas</h2>
        <p style={sectionSubtitle}>
          Navegação rápida para acompanhamento da turma e atualização operacional.
        </p>

        <div style={actionsRow}>
          <button style={btnSecondary} onClick={abrirCronograma}>
            Abrir cronograma
          </button>

          <button style={btnSecondary} onClick={abrirParticipantes}>
            Base da turma
          </button>

          <button style={btnSecondary} onClick={carregarTudo}>
            Atualizar dados
          </button>

          <button style={btnPrimary} onClick={abrirPresencaAula}>
            {turmaAulaId ? "Reabrir presença da aula" : "Salvar presença da aula"}
          </button>
        </div>
      </div>

      <div style={sectionCard}>
        <h2 style={sectionTitle}>Resumo gerencial</h2>
        <p style={sectionSubtitle}>
          Leitura consolidada da turma a partir das aulas planejadas e presenças lançadas.
        </p>

        <div style={summaryGrid}>
          <SummaryItem label="Turma" value={treinamento?.tema || "-"} />
          <SummaryItem label="Instrutor" value={treinamento?.instrutor || "-"} />
          <SummaryItem
            label="Presenças acumuladas"
            value={`${resumoAulaSelecionada?.presentes ?? 0} de ${resumoAulaSelecionada?.total ?? 0}`}
          />
          <SummaryItem
            label="Ausências acumuladas"
            value={String(resumoAulaSelecionada?.ausentes ?? 0)}
          />
          <SummaryItem
            label="Justificados"
            value={String(resumoAulaSelecionada?.justificados ?? 0)}
          />
          <SummaryItem
            label="Próxima aula prevista"
            value={
              resumoGeral.proximaAula
                ? formatDate(resumoGeral.proximaAula.data_aula)
                : "-"
            }
          />
        </div>
      </div>

      {aulaSelecionada ? (
        <div style={sectionCard}>
          <h2 style={sectionTitle}>Resumo da aula</h2>
          <p style={sectionSubtitle}>
            Indicadores consolidados do lançamento da aula selecionada.
          </p>

          <div style={statsGrid}>
            <StatCard title="Total" value={resumoAulaSelecionada?.total ?? 0} />
            <StatCard title="Presentes" value={resumoAulaSelecionada?.presentes ?? 0} />
            <StatCard title="Ausentes" value={resumoAulaSelecionada?.ausentes ?? 0} />
            <StatCard
              title="Justificados"
              value={resumoAulaSelecionada?.justificados ?? 0}
            />
            <StatCard title="Pendentes" value={resumoAulaSelecionada?.pendentes ?? 0} />
          </div>

          <div style={aulaInfoBox}>
            <div><strong>Aula:</strong> {aulaSelecionada.titulo || "-"}</div>
            <div><strong>Dia:</strong> {aulaSelecionada.dia_numero || "-"}</div>
            <div><strong>Data:</strong> {formatDate(aulaSelecionada.data_aula)}</div>
            <div>
              <strong>Status:</strong> {statusExecucaoLabel(aulaSelecionada.status_execucao)}
            </div>
            <div>
              <strong>Instrutor:</strong> {aulaSelecionada.instrutor_responsavel || treinamento?.instrutor || "-"}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div style={infoCard}>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value}</div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div style={statCard}>
      <div style={statTitle}>{title}</div>
      <div style={statValue}>{value}</div>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div style={summaryItem}>
      <div style={summaryLabel}>{label}</div>
      <div style={summaryValue}>{value}</div>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  background: "#f8fafc",
  padding: 24,
};

const loadingWrap = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  color: "#334155",
  fontWeight: 700,
  background: "#f8fafc",
};

const topBar = {
  marginBottom: 14,
};

const btnVoltar = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  color: "#0f172a",
  borderRadius: 10,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const hero = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 22,
  padding: 24,
  color: "#fff",
  boxShadow: "0 18px 36px rgba(29,78,216,.18)",
};

const heroBadge = {
  display: "inline-block",
  width: "fit-content",
  background: "rgba(255,255,255,.14)",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 10,
};

const heroTitle = {
  margin: 0,
  fontSize: 34,
  lineHeight: 1.05,
};

const heroSubtitle = {
  margin: "8px 0 0",
  color: "rgba(255,255,255,.84)",
  lineHeight: 1.6,
};

const heroGrid = {
  marginTop: 18,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const infoCard = {
  background: "rgba(255,255,255,.10)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 14,
  padding: 14,
};

const infoLabel = {
  fontSize: 12,
  textTransform: "uppercase",
  color: "rgba(255,255,255,.68)",
};

const infoValue = {
  marginTop: 6,
  fontWeight: 800,
  fontSize: 18,
};

const statsGrid = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const statCard = {
  background: "#fff",
  borderRadius: 16,
  padding: 16,
  border: "1px solid #e2e8f0",
};

const statTitle = {
  color: "#64748b",
  fontSize: 13,
};

const statValue = {
  marginTop: 6,
  fontSize: 30,
  fontWeight: 800,
  color: "#0f172a",
};

const statusCard = {
  marginTop: 16,
  background: "#fff",
  borderRadius: 20,
  padding: 20,
  border: "1px solid #e2e8f0",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const statusLabel = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
};

const statusBadge = {
  borderRadius: 999,
  padding: "10px 14px",
  fontSize: 14,
  fontWeight: 800,
};

const sectionCard = {
  marginTop: 16,
  background: "#fff",
  borderRadius: 20,
  padding: 20,
  border: "1px solid #e2e8f0",
};

const sectionTitle = {
  margin: 0,
  fontSize: 24,
  color: "#0f172a",
};

const sectionSubtitle = {
  margin: "6px 0 0",
  color: "#64748b",
  lineHeight: 1.5,
};

const actionsRow = {
  marginTop: 16,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const btnPrimary = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 12,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: 800,
};

const btnSecondary = {
  background: "#ffffff",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: 700,
};

const summaryGrid = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const summaryItem = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  background: "#fff",
};

const summaryLabel = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#64748b",
};

const summaryValue = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.3,
};

const aulaInfoBox = {
  marginTop: 16,
  display: "grid",
  gap: 8,
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 16,
  background: "#f8fafc",
  color: "#334155",
};

const errorBox = {
  marginTop: 16,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};

const successBox = {
  marginTop: 16,
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};
