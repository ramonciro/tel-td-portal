"use client";

export default function SectionCard({ title, subtitle, children, action = null }) {
  return (
    <section style={card}>
      {(title || subtitle || action) ? (
        <div style={header}>
          <div style={{ minWidth: 0 }}>
            {title ? <h3 style={titleStyle}>{title}</h3> : null}
            {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
          </div>
          {action ? <div style={actionWrap}>{action}</div> : null}
        </div>
      ) : null}

      <div style={body}>{children}</div>
    </section>
  );
}

const card = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.04)",
  overflow: "hidden",
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  padding: "14px 16px 0",
  flexWrap: "wrap",
};

const titleStyle = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.15,
  color: "#0f172a",
  fontWeight: 800,
};

const subtitleStyle = {
  margin: "5px 0 0",
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.45,
};

const actionWrap = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const body = {
  padding: 16,
};
