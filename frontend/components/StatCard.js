export default function StatCard({ title, value, subtitle, accent = "#2563eb", helper }) {
  return (
    <div style={card(accent)}>
      <div style={glow(accent)} />
      <div style={headerRow}>
        <div style={titleStyle}>{title}</div>
        <div style={chip(accent)} />
      </div>
      <div style={valueStyle}>{value}</div>
      <div style={subtitleStyle}>{subtitle}</div>
      {helper ? <div style={helperStyle(accent)}>{helper}</div> : null}
    </div>
  );
}

const card = (accent) => ({
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  borderRadius: 24,
  padding: 22,
  boxShadow: "0 16px 34px rgba(15, 23, 42, 0.08)",
  border: "1px solid #e2e8f0",
  minHeight: 154,
  position: "relative",
  overflow: "hidden",
  isolation: "isolate",
  borderTop: `5px solid ${accent}`
});

const glow = (accent) => ({
  position: "absolute",
  right: -30,
  top: -30,
  width: 110,
  height: 110,
  borderRadius: "50%",
  background: `${accent}18`,
  zIndex: -1
});

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12
};

const titleStyle = {
  fontSize: 15,
  color: "#475569",
  fontWeight: 800
};

const chip = (accent) => ({
  width: 14,
  height: 14,
  borderRadius: 999,
  background: accent,
  boxShadow: `0 0 0 6px ${accent}18`
});

const valueStyle = {
  marginTop: 16,
  fontSize: 42,
  lineHeight: 1,
  fontWeight: 900,
  color: "#0f172a",
  letterSpacing: "-0.03em"
};

const subtitleStyle = {
  marginTop: 10,
  fontSize: 14,
  color: "#64748b",
  lineHeight: 1.5
};

const helperStyle = (accent) => ({
  marginTop: 16,
  display: "inline-block",
  fontSize: 12,
  fontWeight: 800,
  color: accent,
  background: `${accent}12`,
  padding: "6px 10px",
  borderRadius: 999
});
