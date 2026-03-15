export default function StatCard({ title, value, subtitle, accent = "#2563eb", helper }) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 22,
        padding: 22,
        boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)",
        border: "1px solid #e2e8f0",
        minHeight: 136,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 5,
          background: accent,
        }}
      />
      <div style={{ fontSize: 15, color: "#475569", fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 14, fontSize: 36, fontWeight: 800, color: "#0f172a" }}>{value}</div>
      <div style={{ marginTop: 8, fontSize: 14, color: "#64748b", lineHeight: 1.45 }}>{subtitle}</div>
      {helper ? (
        <div
          style={{
            marginTop: 14,
            display: "inline-block",
            fontSize: 12,
            fontWeight: 700,
            color: accent,
            background: "#eff6ff",
            padding: "6px 10px",
            borderRadius: 999,
          }}
        >
          {helper}
        </div>
      ) : null}
    </div>
  );
}
