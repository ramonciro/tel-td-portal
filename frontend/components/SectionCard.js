export default function SectionCard({ title, subtitle, children, right }) {
  return (
    <section
      style={{
        background: "#fff",
        borderRadius: 24,
        padding: 24,
        border: "1px solid #e2e8f0",
        boxShadow: "0 12px 28px rgba(15,23,42,.06)",
      }}
    >
      {(title || subtitle || right) ? (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 18,
          }}
        >
          <div>
            {title ? <h2 style={{ margin: 0, fontSize: 24 }}>{title}</h2> : null}
            {subtitle ? (
              <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.6 }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}
