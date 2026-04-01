"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import {
  formatDateBR,
  toDateInputLocal,
  parseLocalDate,
} from "../../lib/date";

function fmtNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function fmtHours(value) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function canonicalStatus(value) {
  const status = normalize(value);

  if (["ativa", "ativo"].includes(status)) return "ativo";
  if (["inativa", "inativo"].includes(status)) return "inativo";
  if (["concluida", "concluído", "concluido", "finalizada"].includes(status)) {
    return "concluido";
  }
  if (["planejada", "planejado"].includes(status)) return "planejado";
  if (["em_andamento", "em andamento"].includes(status)) return "em_andamento";
  if (["cancelada", "cancelado"].includes(status)) return "cancelado";

  return status || "planejado";
}

function displayStatus(value) {
  const status = canonicalStatus(value);

  const labels = {
    ativo: "Ativo",
    inativo: "Inativo",
    concluido: "Concluído",
    planejado: "Planejado",
    em_andamento: "Em andamento",
    cancelado: "Cancelado",
  };

  return labels[status] || value || "—";
}

function formatDate(value) {
  return formatDateBR(value);
}

function isValidDateRange(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return true;

  const inicio = parseLocalDate(dataInicio);
  const fim = parseLocalDate(dataFim);

  if (!inicio || !fim) return true;
  return fim >= inicio;
}

function extrairMensagemErro(error, fallback) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  if (error.error) return error.error;
  return fallback;
}

function getPrazoInfo(item) {
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

  const inicio = parseLocalDate(item.data_inicio);
  const fim = parseLocalDate(item.data_fim);
  const status = canonicalStatus(item.status);

  if (status === "concluido") {
    return { label: "Concluído", tone: "ok" };
  }

  if (!inicio && !fim) {
    return { label: "Sem data", tone: "neutral" };
  }

  if (fim && hojeLocal > fim && status !== "cancelado") {
    return { label: "Vencido", tone: "danger" };
  }

  if (inicio && hojeLocal < inicio) {
    return { label: "A iniciar", tone: "alert" };
  }

  return { label: "No prazo", tone: "ok" };
}

function badgeStyle(type) {
  const status = canonicalStatus(type);

  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
    whiteSpace: "nowrap",
    lineHeight: 1.1,
    border: "1px solid transparent",
    textTransform: "uppercase",
    letterSpacing: ".03em",
  };

  const map = {
    ativo: { background: "#ecfdf5", color: "#166534", borderColor: "#bbf7d0" },
    inativo: {
      background: "#f8fafc",
      color: "#475569",
      borderColor: "#e2e8f0",
    },
    concluido: {
      background: "#eff6ff",
      color: "#1d4ed8",
      borderColor: "#bfdbfe",
    },
    planejado: {
      background: "#faf5ff",
      color: "#7c3aed",
      borderColor: "#ddd6fe",
    },
    em_andamento: {
      background: "#fff7ed",
      color: "#c2410c",
      borderColor: "#fed7aa",
    },
    cancelado: {
      background: "#fef2f2",
      color: "#b91c1c",
      borderColor: "#fecaca",
    },
  };

  return {
    ...base,
    ...(map[status] || {
      background: "#f8fafc",
      color: "#334155",
      borderColor: "#e2e8f0",
    }),
  };
}

function attentionBadge(level) {
  const map = {
    alta: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    },
    media: {
      background: "#fff7ed",
      color: "#c2410c",
      border: "1px solid #fed7aa",
    },
    ok: {
      background: "#ecfeff",
      color: "#155e75",
      border: "1px solid #a5f3fc",
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
    lineHeight: 1.1,
    ...(map[level] || map.ok),
  };
}

function prazoBadge(tone) {
  const map = {
    ok: {
      background: "#ecfdf5",
      color: "#166534",
      border: "1px solid #bbf7d0",
    },
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    },
    neutral: {
      background: "#f8fafc",
      color: "#475569",
      border: "1px solid #e2e8f0",
    },
    alert: {
      background: "#fff7ed",
      color: "#c2410c",
      border: "1px solid #fed7aa",
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
    lineHeight: 1.1,
    ...(map[tone] || map.neutral),
  };
}

function sustentacaoTypeBadge(value) {
  const tipo = normalize(value);
  const map = {
    coaching: {
      background: "#eff6ff",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
      label: "Coaching",
    },
    mentoria: {
      background: "#f5f3ff",
      color: "#7c3aed",
      border: "1px solid #ddd6fe",
      label: "Mentoria",
    },
  };

  const item = map[tipo] || {
    background: "#f8fafc",
    color: "#475569",
    border: "1px solid #e2e8f0",
    label: value || "Sustentação",
  };

  return {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "5px 10px",
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 800,
      whiteSpace: "nowrap",
      lineHeight: 1.1,
      textTransform: "uppercase",
      letterSpacing: ".03em",
      background: item.background,
      color: item.color,
      border: item.border,
    },
    label: item.label,
  };
}

function getJourneyAttention(jornada, acoesDaJornada, coachingsDaJornada) {
  const prazo = getPrazoInfo(jornada);

  if (prazo.tone === "danger") {
    return { level: "alta", label: "Prazo vencido" };
  }

  if (!acoesDaJornada.length && !coachingsDaJornada.length) {
    return { level: "media", label: "Sem entregas vinculadas" };
  }

  return { level: "ok", label: "Monitorada" };
}

function getActionAttention(acao) {
  const prazo = getPrazoInfo(acao);

  if (prazo.tone === "danger") return { level: "alta", label: "Prazo vencido" };
  if (!acao.responsavel_id) return { level: "media", label: "Sem responsável" };
  if (
    Number(acao.participantes_realizados || 0) === 0 &&
    canonicalStatus(acao.status) === "em_andamento"
  ) {
    return { level: "media", label: "Sem realização" };
  }

  return { level: "ok", label: "Estável" };
}

function getCoachingAttention(item) {
  const prazo = getPrazoInfo(item);

  if (prazo.tone === "danger") return { level: "alta", label: "Prazo vencido" };
  if (!item.responsavel_id) {
    return { level: "media", label: "Sem responsável" };
  }
  if (
    Number(item.sessoes_realizadas || 0) === 0 &&
    canonicalStatus(item.status) === "em_andamento"
  ) {
    return { level: "media", label: "Sem sessões realizadas" };
  }

  return { level: "ok", label: "Monitorada" };
}

function inputStyle() {
  return {
    width: "100%",
    minWidth: 0,
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    background: "#fff",
    boxSizing: "border-box",
  };
}

function compactInputStyle() {
  return {
    ...inputStyle(),
    height: 44,
    padding: "10px 12px",
  };
}

function textareaStyle(minHeight = 88) {
  return {
    ...inputStyle(),
    minHeight,
    resize: "vertical",
    padding: "12px",
  };
}

function labelStyle() {
  return {
    display: "grid",
    gap: 6,
    fontSize: 13,
    color: "#334155",
    fontWeight: 700,
    minWidth: 0,
  };
}

function buttonPrimaryStyle(disabled = false) {
  return {
    border: "none",
    background: disabled ? "#93c5fd" : "#2563eb",
    color: "#fff",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : "0 8px 18px rgba(37,99,235,.22)",
  };
}

function buttonSecondaryStyle() {
  return {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  };
}

function buttonDangerStyle() {
  return {
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#b91c1c",
    borderRadius: 12,
    padding: "9px 12px",
    fontWeight: 700,
    cursor: "pointer",
  };
}

function emptyCard(message) {
  return (
    <div
      style={{
        border: "1px dashed #cbd5e1",
        borderRadius: 16,
        padding: 22,
        textAlign: "center",
        color: "#64748b",
        background: "#f8fafc",
      }}
    >
      {message}
    </div>
  );
}

const journeyInitial = {
  id: null,
  titulo: "",
  cliente: "",
  publico_alvo: "",
  objetivo: "",
  status: "planejada",
  data_inicio: "",
  data_fim: "",
};

const actionInitial = {
  id: null,
  jornada_id: "",
  titulo: "",
  descricao: "",
  responsavel_id: "",
  status: "planejada",
  data_inicio: "",
  data_fim: "",
  carga_horaria: "",
  participantes_previstos: "",
  quantidade_turmas_sessoes: "",
  participantes_realizados: "",
  horas_planejadas: "",
  horas_realizadas: "",
};

const coachingInitial = {
  id: null,
  jornada_id: "",
  acao_id: "",
  tipo_coaching: "coaching",
  titulo: "",
  publico_alvo: "",
  objetivo: "",
  responsavel_id: "",
  participantes_previstos: "",
  participantes_realizados: "",
  sessoes_previstas: "",
  sessoes_realizadas: "",
  carga_horaria_sessao: "",
  horas_totais: "",
  status: "planejado",
  data_inicio: "",
  data_fim: "",
};

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "planejado", label: "Planejado" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
];

export default function MapaDesenvolvimentoPage() {
  const [activeTab, setActiveTab] = useState("geral");

  const [jornadas, setJornadas] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [coachings, setCoachings] = useState([]);
  const [usuarios, setUsuarios] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [notice, setNotice] = useState("");

  const [filters, setFilters] = useState({
    jornada_id: "",
    status: "",
    busca: "",
  });

  const [jornadaForm, setJornadaForm] = useState(journeyInitial);
  const [acaoForm, setAcaoForm] = useState(actionInitial);
  const [coachingForm, setCoachingForm] = useState(coachingInitial);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setErro("");

    try {
      const [jornadasData, acoesData, coachingsData, usuariosData] =
        await Promise.all([
          apiFetch("/jornadas-desenvolvimento").catch(() => []),
          apiFetch("/acoes-desenvolvimento").catch(() => []),
          apiFetch("/coaching-planos").catch(() => []),
          apiFetch("/usuarios").catch(() => []),
        ]);

      setJornadas(Array.isArray(jornadasData) ? jornadasData : []);
      setAcoes(Array.isArray(
