"use client";

// Mapa de Desenvolvimento — estilos e pequenos componentes visuais
// compartilhados entre as abas, extraídos de page.js (22/09/2026, pedido do
// Ramon: quebrar o arquivo em componentes menores). Nada foi alterado de
// valor ou comportamento, só movido pra fora do arquivo principal.

import { colors, radius } from "../../../lib/theme";

export function inputStyle() {
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

export function compactInputStyle() {
  return {
    ...inputStyle(),
    height: 44,
    padding: "10px 12px",
  };
}

export function textareaStyle(minHeight = 88) {
  return {
    ...inputStyle(),
    minHeight,
    resize: "vertical",
    padding: "12px",
  };
}

export function labelStyle() {
  return {
    display: "grid",
    gap: 6,
    fontSize: 13,
    color: "#334155",
    fontWeight: 700,
    minWidth: 0,
  };
}

export function buttonPrimaryStyle(disabled = false) {
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

export function buttonSecondaryStyle() {
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

export function buttonDangerStyle() {
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

export function emptyCard(message) {
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

export function MetricBox({ label, value }) {
  return (
    <div style={metricBox}>
      <div style={metricBoxLabel}>{label}</div>
      <div style={metricBoxValue}>{value}</div>
    </div>
  );
}

export function MiniExecutive({ label, value }) {
  return (
    <div style={miniExecutive}>
      <div style={miniExecutiveLabel}>{label}</div>
      <div style={miniExecutiveValue}>{value}</div>
    </div>
  );
}

export function tabButton(active) {
  return {
    border: active ? `1px solid ${colors.primary}` : `1px solid ${colors.border}`,
    background: active ? colors.primaryLight : colors.surface,
    color: active ? colors.primary : colors.textSecondary,
    borderRadius: radius.pill,
    padding: "10px 14px",
    fontWeight: 700,
    fontSize: 13.5,
    cursor: "pointer",
  };
}

export const fieldSpan = {
  md: { gridColumn: "span 1" },
  lg: { gridColumn: "span 2" },
  xl: { gridColumn: "span 2" },
  xxl: { gridColumn: "span 3" },
  full: { gridColumn: "1 / -1" },
};

export const tabBar = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 6,
};

export const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

export const filtersPanel = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
};

export const errorAlert = {
  background: "linear-gradient(180deg, #fff5f5 0%, #fff1f2 100%)",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  padding: "12px 14px",
  borderRadius: 16,
  fontWeight: 700,
  boxShadow: "0 10px 24px rgba(185,28,28,.08)",
};

export const successAlert = {
  background: "linear-gradient(180deg, #f5fff8 0%, #f0fdf4 100%)",
  color: "#166534",
  border: "1px solid #bbf7d0",
  padding: "12px 14px",
  borderRadius: 16,
  fontWeight: 700,
  boxShadow: "0 10px 24px rgba(22,101,52,.07)",
};

export const clienteGroupHeader = {
  fontSize: 14,
  fontWeight: 700,
  color: "#0f172a",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  paddingBottom: 6,
  borderBottom: "2px solid #dbeafe",
};

export const clienteGroupCount = {
  fontWeight: 500,
  color: "#64748b",
  textTransform: "none",
  letterSpacing: 0,
};

export const journeyFlowCard = {
  border: "1px solid #d9e8f9",
  borderRadius: 30,
  padding: 22,
  background: "linear-gradient(180deg, #ffffff 0%, #f7fbff 58%, #f3fbff 100%)",
  boxShadow: "0 20px 42px rgba(15,23,42,.06)",
  display: "grid",
  gap: 18,
};

export const journeyFlowHeader = {
  display: "grid",
  gridTemplateColumns: "1.3fr .8fr",
  gap: 14,
  alignItems: "start",
};

export const journeyFlowTitle = {
  fontSize: 24,
  fontWeight: 900,
  color: "#0f172a",
};

export const journeyFlowMeta = {
  fontSize: 13,
  color: "#475569",
  lineHeight: 1.5,
};

export const journeyFlowSummary = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

export const metricBox = {
  borderRadius: 18,
  padding: 16,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  border: "1px solid #d9e3f0",
  display: "grid",
  gap: 6,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.75)",
};

export const metricBoxLabel = {
  fontSize: 11,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
};

export const metricBoxValue = {
  fontSize: 20,
  fontWeight: 900,
  color: "#0f172a",
};

export const journeyProgressBarWrap = {
  display: "grid",
  gap: 8,
};

export const journeyProgressBarTrack = {
  width: "100%",
  height: 12,
  borderRadius: 999,
  background: "#e0f2fe",
  overflow: "hidden",
};

export const journeyProgressBarFill = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, #06b6d4 0%, #2563eb 100%)",
};

export const detailsCard = {
  border: "1px solid #dbeafe",
  borderRadius: 18,
  padding: 14,
  background: "#f8fbff",
};

export const detailsSummary = {
  cursor: "pointer",
  fontWeight: 900,
  color: "#0f172a",
};

export const formGrid = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
};

export const buttonRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

export const cardsGrid = {
  display: "grid",
  gap: 18,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
};

export const execCard = {
  borderRadius: 28,
  border: "1px solid #dbe8f6",
  background: "linear-gradient(180deg, #ffffff 0%, #f9fcff 100%)",
  boxShadow: "0 16px 34px rgba(15,23,42,.05)",
  padding: 20,
  display: "grid",
  gap: 16,
};

export const execHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "start",
  gap: 12,
  flexWrap: "wrap",
};

export const execTitle = {
  fontSize: 20,
  fontWeight: 900,
  color: "#0f172a",
};

export const execSubtitle = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 13,
};

export const execBody = {
  display: "grid",
  gap: 12,
};

export const execText = {
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.6,
};

export const miniExecutiveBand = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
};

export const miniExecutive = {
  borderRadius: 20,
  border: "1px solid #dce6f2",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  padding: 14,
  minHeight: 92,
  display: "grid",
  alignContent: "space-between",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.85)",
};

export const miniExecutiveLabel = {
  fontSize: 10,
  fontWeight: 900,
  color: "#64748b",
  textTransform: "uppercase",
  lineHeight: 1.25,
  letterSpacing: ".04em",
  whiteSpace: "normal",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

export const miniExecutiveValue = {
  fontSize: 24,
  fontWeight: 900,
  color: "#0f172a",
  marginTop: 8,
};

export const tripulacaoGrid = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "1.15fr .85fr",
  alignItems: "start",
};

export const importHintCard = {
  borderRadius: 16,
  border: "1px dashed #bfdbfe",
  background: "linear-gradient(180deg, #ffffff 0%, #f5faff 100%)",
  padding: 14,
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.5,
};

export const crewJourneyCard = {
  borderRadius: 24,
  border: "1px solid #dbe8f6",
  background: "linear-gradient(180deg, #ffffff 0%, #f7fbff 100%)",
  boxShadow: "0 14px 30px rgba(15,23,42,.045)",
  padding: 18,
  display: "grid",
  gap: 14,
};

export const crewJourneyHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

export const crewJourneyTitle = {
  fontSize: 20,
  fontWeight: 900,
  color: "#0f172a",
};

export const crewJourneyMeta = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 13,
};

export const crewListGrid = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

export const crewListCard = {
  borderRadius: 20,
  border: "1px solid #dce8f7",
  background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  padding: 14,
  display: "grid",
  gap: 8,
  boxShadow: "0 10px 22px rgba(15,23,42,.04)",
};

export const crewListName = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
};

export const crewListMeta = {
  fontSize: 12,
  color: "#64748b",
};

export const crewPillRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

export const crewPill = {
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  padding: "8px 12px",
  display: "grid",
  gap: 2,
};

export const crewPillName = {
  fontSize: 12,
  fontWeight: 800,
  color: "#0f172a",
};

export const crewPillMeta = {
  fontSize: 10,
  color: "#64748b",
};

export const timelineWrap = {
  display: "grid",
  gap: 8,
  paddingTop: 8,
  borderTop: "1px dashed #e2e8f0",
};

export const timelineLabel = {
  fontSize: 11,
  fontWeight: 900,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

export const timelineItems = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

export const timelineItem = {
  borderRadius: 14,
  border: "1px solid #dbeafe",
  background: "#f0f6ff",
  padding: "8px 12px",
  display: "grid",
  gap: 2,
};

export const timelineItemTitle = {
  fontSize: 13,
  fontWeight: 800,
  color: "#1e3a8a",
};

export const timelineItemMeta = {
  fontSize: 11,
  color: "#475569",
};

export const timelineEmpty = {
  fontSize: 12,
  color: "#94a3b8",
  fontStyle: "italic",
};
