"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
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

export default function TurmasPage() {
  const [treinamentos, setTreinamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [treinamentosData, presencasData] = await Promise.all([
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/presencas").catch(() => []),
        ]);

        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
        setPresencas(Array.isArray(presencasData) ? presencasData : []);
        setErro("");
      } catch (error) {
        setErro(error.message || "Erro ao carregar turmas.");
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

        const presentes = registros.filter((p) =>
          ["presente", "Presente"].includes(String(p.status || ""))
        ).length;

        const ausentes = registros.filter((p) =>
          ["ausente", "Ausente"].includes(String(p.status || ""))
        ).length;

        const justificados = registros.filter((p) =>
          ["justificado", "Justificado"].includes(String(p.status || ""))
        ).length;

        const previstos = Number(t.participantes || registros.length || 0);
        const taxa = previstos ? Math.round((presentes / previstos) * 100) : 0;
        const risco = taxa < 85 ? "Crítico" : taxa < 92 ? "Atenção" : "Saudável";

        return {
          id: t.id,
          nome: t.tema || t.titulo || t.turma || "Turma",
          cliente: t.cliente || "Sem cliente",
          instrutor: t.instrutor || "Sem instrutor",
          supervisor: t.supervisor || "-",
          publico: t.publico || "Operação",
          cargaHoraria: Number(t.carga_horaria || 0),
          data: fmtDate(t.data),
          previstos,
          presentes,
          ausentes,
          justificados,
          taxa,
          risco,
        };
      })
      .sort((a, b) => a.taxa - b.taxa || b.previstos - a.previstos);
  }, [treinamentos, presencas]);

  const resumo = useMemo(() => {
    const previstos = turmas.reduce((acc, item) => acc + item.previstos, 0);
    const presentes = turmas.reduce((acc, item) => acc + item.presentes, 0);
    const ausentes = turmas.reduce((acc, item) => acc + item.ausentes, 0);
    const media = previstos ? Math.round((presentes / previstos) * 100) : 0;

    return {
      totalTurmas: turmas.length,
      previstos,
      presentes,
      ausentes,
      media,
    };
  }, [turmas]);

  return (
    <PortalShell
      title="Turmas"
      subtitle="Acompanhamento consolidado das turmas."
    >
      {erro ? <div style={errorBox}>{erro}</div> : null}

      <div style={statsGrid}>
        <StatCard
          title="Turmas"
          value={fmt(resumo.totalTurmas)}
          subtitle="Consolidadas no portal"
          accent="#2563eb"
        />
        <StatCard
          title="Participantes"
          value={fmt(resumo.previstos)}
          subtitle="Capacidade planejada"
          accent="#06b6d4"
        />
        <StatCard
          title="Presentes"
          value={fmt(resumo.presentes)}
          subtitle="Participações confirmadas"
          accent="#16a34a"
        />
        <StatCard
          title="Presença média"
          value={`${resumo.media}%`}
          subtitle="Leitura geral"
          accent="#7c3aed"
        />
      </div>

      <div style={panel}>
        <div style={panelHeader}>
          <h3 style={panelTitle}>Painel das turmas</h3>
          <div style={panelCount}>{turmas.length} registro(s)</div>
        </div>

        <div style={turmaGrid}>
          {turmas.map((item) => (
            <div key={item.id} style={turmaCard}>
              <div style={topRow}>
                <span style={riskBadge(item.risco)}>{item.risco}</span>
                <span style={presenceBadge}>{item.taxa}%</span>
              </div>

              <div style={title}>{item.nome}</div>
              <div style={meta}>
                {item.cliente} • {item.instrutor}
              </div>

              <div style={metricGrid}>
                <div style={metricItem}>
                  <strong>{fmt(item.previstos)}</strong>
                  <span>prev.</span>
                </div>
                <div style={metricItem}>
                  <strong>{fmt(item.presentes)}</strong>
                  <span>pres.</span>
                </div>
                <div style={metricItem}>
                  <strong>{fmt(item.ausentes)}</strong>
                  <span>aus.</span>
                </div>
                <div style={metricItem}>
                  <strong>{fmt(item.justificados)}</strong>
                  <span>just.</span>
                </div>
              </div>

              <div style={infoList}>
                <div><strong>Público:</strong> {item.publico}</div>
                <div><strong>Carga:</strong> {item.cargaHoraria}h</div>
                <div><strong>Supervisor:</strong> {item.supervisor}</div>
                <div><strong>Data-base:</strong> {item.data}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PortalShell>
  );
}

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
  marginBottom: 12,
};

const panel = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 8px 20px rgba(15,23,42,.04)",
};

const panelHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 10,
  flexWrap: "wrap",
};

const panelTitle = {
  margin: 0,
  fontSize: 15,
  color: "#0f172a",
};

const panelCount = {
  fontSize: 12,
  fontWeight: 800,
  color: "#64748b",
};

const turmaGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 10,
};

const turmaCard = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 12,
  background: "#ffffff",
  boxShadow: "0 6px 14px rgba(15,23,42,.03)",
};

const topRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
};

const riskBadge = (label) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "5px 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  background:
    label === "Crítico"
      ? "#fee2e2"
      : label === "Atenção"
      ? "#ffedd5"
      : "#dcfce7",
  color:
    label === "Crítico"
      ? "#991b1b"
      : label === "Atenção"
      ? "#9a3412"
      : "#166534",
});

const presenceBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "5px 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  background: "#dbeafe",
  color: "#1d4ed8",
};

const title = {
  fontSize: 16,
  lineHeight: 1.15,
  fontWeight: 800,
  color: "#0f172a",
  marginBottom: 4,
};

const meta = {
  color: "#64748b",
  fontSize: 12,
  marginBottom: 10,
};

const metricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 6,
  marginBottom: 10,
};

const metricItem = {
  border: "1px solid #eef2f7",
  borderRadius: 10,
  padding: "8px 6px",
  textAlign: "center",
  background: "#fff",
  fontSize: 10,
  color: "#64748b",
  lineHeight: 1.15,
};

const infoList = {
  display: "grid",
  gap: 5,
  fontSize: 12,
  color: "#475569",
  lineHeight: 1.35,
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
  marginBottom: 12,
};
