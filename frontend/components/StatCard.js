"use client";

export default function StatCard({
  title,
  value,
  subtitle,
  accent = "#2563eb",
  helper = "",
}) {
  return (
    <div style={card}>
      <div style={{ ...topLine, background: accent }} />
      <div style={content}>
        <div style={titleStyle}>{title}</div>
        <div style={valueStyle}>{value}</div>
        {subtitle ? <div style={subtitleStyle}>{subtitle}</div> : null}
        {helper ? <div style={{ ...helperStyle, color: accent }}>{helper}</div> : null}
      </div>
    </div>
  );
}

const card = {
  background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)",
  overflow: "hidden",
  minHeight: 118,
};

const topLine = {
  height: 4,
  width: "100%",
};

const content = {
  padding: 14,
  display: "grid",
  gap: 6,
};

const titleStyle = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "#64748b",
};

const valueStyle = {
  fontSize: 28,
  lineHeight: 1,
  fontWeight: 900,
  color: "#0f172a",
};

const subtitleStyle = {
  fontSize: 13,
  lineHeight: 1.35,
  color: "#475569",
};

const helperStyle = {
  marginTop: 2,
  fontSize: 11,
  fontWeight: 800,
};
