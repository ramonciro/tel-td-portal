"use client";

import { colors, radius } from "../lib/theme";

// Cabeçalho de página padrão do portal — mesma identidade da Início (navy +
// coral). Usar no topo de qualquer tela no lugar de um <h1> solto. Stats são
// opcionais: passe um array [{ label, value }] pra mostrar números rápidos
// dentro do próprio cabeçalho, sem precisar de StatCards separados embaixo.
export default function PageHero({ eyebrow, title, subtitle, actions, stats }) {
  return (
    <div style={hero}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          {eyebrow && <p style={eyebrowStyle}>{eyebrow}</p>}
          <h1 style={titleStyle}>{title}</h1>
          {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div>}
      </div>

      {stats && stats.length > 0 && (
        <div style={{ display: "flex", gap: 22, marginTop: 18, flexWrap: "wrap" }}>
          {stats.map((s) => (
            <div key={s.label}>
              <p style={statValue}>{s.value}</p>
              <p style={statLabel}>{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const hero = {
  background: `linear-gradient(135deg, ${colors.navy} 0%, ${colors.navySoft} 100%)`,
  borderRadius: radius.lg,
  padding: "22px 26px",
  color: "#fff",
  boxShadow: "0 18px 36px rgba(11,18,32,.18)",
};

const eyebrowStyle = {
  margin: "0 0 4px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "#8B93A7",
};

const titleStyle = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: "-.01em",
};

const subtitleStyle = {
  margin: "6px 0 0",
  fontSize: 13.5,
  color: "#C7CCDA",
  maxWidth: 520,
  lineHeight: 1.5,
};

const statValue = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: "-.01em",
};

const statLabel = {
  margin: "2px 0 0",
  fontSize: 11.5,
  color: "#8B93A7",
};
