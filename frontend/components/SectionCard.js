export default function SectionCard({ title, subtitle, children }) {
  return (
    <section style={card}>
      <div style={header}>
        <div>
          <h3 style={titleStyle}>{title}</h3>
          {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
        </div>
      </div>
      <div>{children}</div>
    </section>
  );
}

const card = { background: "#fff", borderRadius: 20, padding: 22, marginBottom: 20, boxShadow: "0 8px 30px rgba(15,23,42,.05)", border: "1px solid #eef2f7" };
const header = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 };
const titleStyle = { margin: 0, fontSize: 24, color: "#0f172a" };
const subtitleStyle = { margin: "8px 0 0", color: "#64748b", lineHeight: 1.5 };
