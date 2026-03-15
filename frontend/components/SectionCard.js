export default function SectionCard({ title, subtitle, children, right }) {
  return (
    <section style={wrap}>
      {(title || subtitle || right) ? (
        <div style={header}>
          <div>
            {title ? <h2 style={titleStyle}>{title}</h2> : null}
            {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
          </div>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const wrap = {
  background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  borderRadius: 24,
  padding: 24,
  border: "1px solid #e2e8f0",
  boxShadow: "0 16px 34px rgba(15,23,42,.06)"
};

const header = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 18
};

const titleStyle = {
  margin: 0,
  fontSize: 22,
  color: "#0f172a"
};

const subtitleStyle = {
  margin: "8px 0 0",
  color: "#64748b",
  lineHeight: 1.6,
  maxWidth: 720
};
