export function StatsGrid({ items = [] }) {
  return (
    <div style={grid}>
      {items.map((item) => (
        <div key={item.label} style={card}>
          <div style={iconWrap}>{item.icon || "•"}</div>
          <div style={{ flex: 1 }}>
            <div style={label}>{item.label}</div>
            <div style={value}>{item.value}</div>
            {item.helper ? <div style={helper}>{item.helper}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 20 };
const card = { background: "#fff", borderRadius: 18, padding: 18, display: "flex", gap: 14, alignItems: "center", boxShadow: "0 8px 24px rgba(15,23,42,.05)", border: "1px solid #eef2f7" };
const iconWrap = { width: 52, height: 52, borderRadius: 16, display: "grid", placeItems: "center", background: "#eff6ff", fontSize: 22 };
const label = { fontSize: 13, color: "#64748b", marginBottom: 6 };
const value = { fontSize: 30, color: "#0f172a", fontWeight: 700, lineHeight: 1 };
const helper = { marginTop: 8, fontSize: 12, color: "#94a3b8" };
