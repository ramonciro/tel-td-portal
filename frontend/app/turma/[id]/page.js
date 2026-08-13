"use client";

import { useEffect, useMemo, useState }   from "react";
import { useParams, useSearchParams }      from "next/navigation";
import TurmaPageShell                      from "../../../components/TurmaPageShell";
import StatCard                            from "../../../components/StatCard";
import { apiFetch }                        from "../../../services/api";
import { colors, chart, estiloBadgeStatus } from "../../../lib/theme";
import { compareLocalDatesAsc, formatDateBR, parseLocalDate } from "../../../lib/date";

function formatDate(v) { return formatDateBR(v); }

function calcularStatusTurma({ totalAulas, aulasComPresenca, aderenciaMedia, dataInicio, dataFim }) {
  const hoje = new Date();
  const hojeLocal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12, 0, 0);
  const hojeISO = [
    hoje.getFullYear(),
    String(hoje.getMonth() + 1).padStart(2, "0"),
    String(hoje.getDate()).padStart(2, "0"),
  ].join("-");
  const dataFimISO = dataFim ? String(dataFim).slice(0, 10) : null;
  const fimPassou  = dataFimISO != null && hojeISO > dataFimISO;
  const inicio     = parseLocalDate(dataInicio);

  if (fimPassou) {
    return aderenciaMedia >= 80 || totalAulas === 0
      ? { label: "Concluída",           tone: "success" }
      : { label: "Concluída com atenção", tone: "danger" };
  }
  if (inicio && !Number.isNaN(inicio.getTime()) && hojeLocal < inicio) {
    return { label: "Planejada", tone: "warning" };
  }
  if (!totalAulas)         return { label: "Sem cronograma", tone: "neutral" };
  if (!aulasComPresenca)   return { label: "Não iniciada",   tone: "warning" };
  if (aulasComPresenca < totalAulas) return { label: "Em andamento", tone: "info" };
  if (aderenciaMedia >= 80) return { label: "Concluída",     tone: "success" };
  return { label: "Concluída com atenção", tone: "danger" };
}

function statusExecucaoLabel(v) {
  return {
    planejada: "Planejada", em_andamento: "Em andamento",
    concluida: "Concluída", cancelada: "Cancelada",
  }[String(v || "").toLowerCase()] || "Planejada";
}

export default function GestaoTurmaPage() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const id           = params?.id;
  const turmaAulaId  = searchParams.get("turma_aula_id");
  const dataAula     = searchParams.get("data_aula");

  const [treinamento,         setTreinamento]         = useState(null);
  const [participantes,       setParticipantes]       = useState([]);
  const [aulas,               setAulas]               = useState([]);
  const [resumoAulaSelecionada, setResumoAulaSelecionada] = useState(null);
  const [loading,             setLoading]             = useState(true);
  const [erro,                setErro]                = useState("");

  useEffect(() => { carregarTudo(); }, [id, turmaAulaId, dataAula]);

  async function carregarTudo() {
    if (!id) return;
    try {
      setLoading(true);
      setErro("");
      const [dadosTreinamento, listaParticipantes, listaAulas] = await Promise.all([
        apiFetch(`/treinamentos/${id}`),
        apiFetch(`/treinamentos/${id}/participantes`).catch(() => []),
        apiFetch(`/turma-aulas?treinamento_id=${id}`).catch(() => []),
      ]);
      setTreinamento(dadosTreinamento || null);
      setParticipantes(Array.isArray(listaParticipantes) ? listaParticipantes : []);
      setAulas(Array.isArray(listaAulas) ? listaAulas : []);

      if (turmaAulaId) {
        const resumo = await apiFetch(`/presenca-aulas/resumo/${turmaAulaId}`).catch(() => null);
        setResumoAulaSelecionada(resumo
          ? {
              total:      Number(resumo.total      || 0),
              presentes:  Number(resumo.presentes  || 0),
              ausentes:   Number(resumo.ausentes   || 0),
              justificados: Number(resumo.justificados || 0),
              pendentes:  Number(resumo.pendentes  || 0),
              percentual: Number(resumo.percentual || 0),
            }
          : null
        );
      } else {
        setResumoAulaSelecionada(null);
      }
    } catch (err) {
      setErro(err.message || "Erro ao carregar a gestão da turma.");
    } finally {
      setLoading(false);
    }
  }

  const resumo = useMemo(() => {
    const totalAulas        = aulas.length;
    const aulasComPresenca  = aulas.filter((a) =>
      ["concluida", "em_andamento"].includes(String(a.status_execucao || "").toLowerCase())
    ).length;
    const pendencias        = aulas.filter(
      (a) => String(a.status_execucao || "planejada").toLowerCase() === "planejada"
    ).length;
    const aderenciaMedia    = totalAulas > 0
      ? Math.round((aulasComPresenca / totalAulas) * 100) : 0;

    const status = calcularStatusTurma({
      totalAulas, aulasComPresenca, aderenciaMedia,
      dataInicio: treinamento?.data_inicio || treinamento?.data,
      dataFim:    treinamento?.data_fim || null,
    });

    const proximaAula = aulas
      .filter((a) => String(a.status_execucao || "planejada").toLowerCase() === "planejada")
      .sort((a, b) => compareLocalDatesAsc(a.data_aula, b.data_aula))[0] || null;

    return { totalAulas, aulasComPresenca, pendencias, aderenciaMedia, status, proximaAula };
  }, [aulas, treinamento]);

  const aulaSelecionada = useMemo(
    () => aulas.find((a) => String(a.id) === String(turmaAulaId)) || null,
    [aulas, turmaAulaId]
  );

  /* ── Ações ── */
  function ir(path) { window.location.href = path; }

  function abrirPresencaAula() {
    // FIX: antes redirecionava para a própria página (turma/${id}?...)
    // Agora vai corretamente para /turma/${id}/chamada
    if (!turmaAulaId || !dataAula) {
      setErro("Selecione uma aula pelo cronograma para abrir a chamada.");
      return;
    }
    ir(`/turma/${id}/chamada?turma_aula_id=${turmaAulaId}&data_aula=${dataAula}`);
  }

  const toneColors = {
    success: { bg: colors.successLight, text: colors.successText },
    info:    { bg: "#dbeafe",           text: "#1d4ed8" },
    warning: { bg: colors.warningLight, text: colors.warningText },
    danger:  { bg: colors.dangerLight,  text: colors.dangerText },
    neutral: { bg: colors.neutralLight, text: colors.neutral },
  };
  const toneStyle = toneColors[resumo.status.tone] || toneColors.neutral;

  return (
    <TurmaPageShell id={id} treinamento={treinamento} loading={loading} abaAtiva="visao">

      {erro && <div style={errorBox}>{erro}</div>}

      {/* ── KPIs ── */}
      <div style={kpiGrid}>
        <StatCard
          title="Treinandos"
          value={participantes.length}
          subtitle="na base da turma"
          accent={chart.blue}
        />
        <StatCard
          title="Aulas planejadas"
          value={resumo.totalAulas}
          subtitle="no cronograma"
          accent={chart.cyan}
        />
        <StatCard
          title="Aderência"
          value={`${resumo.aderenciaMedia}%`}
          subtitle={`${resumo.aulasComPresenca} de ${resumo.totalAulas} concluídas`}
          accent={colors.success}
        />
        <StatCard
          title="Pendências"
          value={resumo.pendencias}
          subtitle="aulas sem chamada"
          accent={resumo.pendencias > 0 ? colors.warning : colors.neutral}
        />
      </div>

      {/* ── Status + próxima aula ── */}
      <div style={infoRow}>
        <div style={statusCard}>
          <span style={infoLabel}>Status da turma</span>
          <span style={{ ...statusBadge, background: toneStyle.bg, color: toneStyle.text }}>
            {resumo.status.label}
          </span>
        </div>
        {resumo.proximaAula && (
          <div style={statusCard}>
            <span style={infoLabel}>Próxima aula</span>
            <span style={{ ...statusBadge, background: "#f1f5f9", color: "#334155" }}>
              {formatDate(resumo.proximaAula.data_aula)}
              {resumo.proximaAula.titulo ? ` · ${resumo.proximaAula.titulo}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* ── Ações rápidas ── */}
      <div style={acoes}>
        <div style={acoesLabel}>Ações rápidas</div>
        <div style={acoesRow}>
          <button style={btnCoral} onClick={() => ir(`/turma/${id}/mural`)}>
            Mural da turma
          </button>
          <button style={btnOutline} onClick={() => ir(`/turma/${id}/cronograma`)}>
            Cronograma
          </button>
          <button style={btnOutline} onClick={() => ir(`/turma/${id}/participantes`)}>
            Pessoas
          </button>
          {turmaAulaId ? (
            <button style={btnCoral} onClick={abrirPresencaAula}>
              Abrir chamada da aula
            </button>
          ) : (
            <button style={btnOutline} onClick={() => ir(`/turma/${id}/cronograma`)}>
              Selecionar aula para chamada
            </button>
          )}
          <button style={btnGhost} onClick={carregarTudo}>
            Atualizar
          </button>
        </div>
      </div>

      {/* ── Resumo da aula selecionada (opcional) ── */}
      {aulaSelecionada && resumoAulaSelecionada && (
        <div style={aulaCard}>
          <div style={aulaHeader}>
            <div>
              <div style={aulaTitle}>
                {aulaSelecionada.titulo || `Aula ${aulaSelecionada.dia_numero || ""}`}
              </div>
              <div style={aulaMeta}>
                {formatDate(aulaSelecionada.data_aula)} ·{" "}
                {statusExecucaoLabel(aulaSelecionada.status_execucao)} ·{" "}
                {aulaSelecionada.instrutor_responsavel || treinamento?.instrutor || "—"}
              </div>
            </div>
          </div>
          <div style={aulaKpis}>
            {[
              { label: "Total",       value: resumoAulaSelecionada.total       },
              { label: "Presentes",   value: resumoAulaSelecionada.presentes   },
              { label: "Ausentes",    value: resumoAulaSelecionada.ausentes    },
              { label: "Justificados",value: resumoAulaSelecionada.justificados},
              { label: "Pendentes",   value: resumoAulaSelecionada.pendentes   },
            ].map(({ label, value }) => (
              <div key={label} style={aulaStat}>
                <span style={aulaStatVal}>{value}</span>
                <span style={aulaStatLabel}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </TurmaPageShell>
  );
}

/* ── Estilos ────────────────────────────── */
const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14,
  marginBottom: 14,
};

const infoRow = {
  display: "flex",
  gap: 12,
  marginBottom: 14,
  flexWrap: "wrap",
};

const statusCard = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "#fff",
  border: "1px solid #e9eef4",
  borderRadius: 12,
  padding: "10px 16px",
  flexShrink: 0,
};

const infoLabel = {
  fontSize: 13,
  color: "#64748b",
  fontWeight: 600,
};

const statusBadge = {
  borderRadius: 999,
  padding: "4px 12px",
  fontSize: 13,
  fontWeight: 800,
};

const acoes = {
  background: "#fff",
  border: "1px solid #e9eef4",
  borderRadius: 14,
  padding: "14px 16px",
  marginBottom: 14,
};

const acoesLabel = {
  fontSize: 12,
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: ".05em",
  marginBottom: 10,
};

const acoesRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const btnCoral = {
  background: colors.accent,
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "9px 16px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
  boxShadow: `0 4px 12px rgba(255,107,74,.25)`,
};

const btnOutline = {
  background: "#fff",
  color: "#334155",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "9px 16px",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const btnGhost = {
  background: "#f8fafc",
  color: "#94a3b8",
  border: "1px solid #e9eef4",
  borderRadius: 10,
  padding: "9px 14px",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const aulaCard = {
  background: "#fff",
  border: "1px solid #e9eef4",
  borderRadius: 14,
  padding: 16,
  marginBottom: 14,
};

const aulaHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 14,
};

const aulaTitle = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
};

const aulaMeta = {
  fontSize: 13,
  color: "#64748b",
  marginTop: 3,
};

const aulaKpis = {
  display: "flex",
  gap: 20,
  flexWrap: "wrap",
  paddingTop: 12,
  borderTop: "1px solid #f1f5f9",
};

const aulaStat = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
};

const aulaStatVal = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1,
};

const aulaStatLabel = {
  fontSize: 11,
  color: "#94a3b8",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const errorBox = {
  background: colors.dangerLight,
  border: `1px solid #fecaca`,
  color: colors.dangerText,
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 14,
};
