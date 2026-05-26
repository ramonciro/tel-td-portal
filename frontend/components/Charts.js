"use client";

// ─── Paleta ────────────────────────────────────────────────────────────────
export const CORES = [
  "#3b82f6","#16a34a","#f59e0b","#ef4444","#8b5cf6",
  "#0ea5e9","#f97316","#14b8a6","#ec4899","#64748b",
];

function fmt(n) {
  return Number(n || 0).toLocaleString("pt-BR");
}

// ─── Barra horizontal ──────────────────────────────────────────────────────
export function BarraHorizontal({ dados = [], labelKey, valueKey, cor = "#3b82f6", sufixo = "", maxItens = 8 }) {
  const lista = [...dados].sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0)).slice(0, maxItens);
  const max = Math.max(...lista.map((d) => Number(d[valueKey] || 0)), 1);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {lista.map((d, i) => {
        const val = Number(d[valueKey] || 0);
        const pct = Math.round((val / max) * 100);
        return (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, color: "var(--color-text-primary)" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{d[labelKey] || "—"}</span>
              <span style={{ fontWeight: 700, color: cor }}>{fmt(val)}{sufixo}</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "var(--color-background-secondary)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: cor, borderRadius: 999, transition: "width .4s ease" }} />
            </div>
          </div>
        );
      })}
      {!lista.length && <p style={{ fontSize: 13, color: "var(--color-text-secondary)", textAlign: "center", padding: "16px 0" }}>Sem dados no período</p>}
    </div>
  );
}

// ─── Donut ─────────────────────────────────────────────────────────────────
export function Donut({ fatias = [], total }) {
  const soma = fatias.reduce((a, f) => a + Number(f.valor || 0), 0);
  const base = total ?? soma;
  if (!soma) return <p style={{ fontSize: 13, color: "var(--color-text-secondary)", textAlign: "center", padding: "24px 0" }}>Sem dados</p>;

  let angulo = -90;
  const R = 52, cx = 70, cy = 70, strokeW = 18;
  const circunferencia = 2 * Math.PI * R;

  const arcos = fatias.map((f) => {
    const pct = Number(f.valor || 0) / soma;
    const dashArray = `${pct * circunferencia} ${circunferencia}`;
    const rotate = angulo;
    angulo += pct * 360;
    return { ...f, dashArray, rotate };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={140} height={140} style={{ flexShrink: 0 }}>
        {arcos.map((a, i) => (
          <circle key={i} cx={cx} cy={cy} r={R}
            fill="none" stroke={a.cor} strokeWidth={strokeW}
            strokeDasharray={a.dashArray}
            strokeDashoffset={0}
            transform={`rotate(${a.rotate} ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray .5s ease" }}
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: 20, fontWeight: 800, fill: "var(--color-text-primary)" }}>{fmt(base)}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 11, fill: "var(--color-text-secondary)" }}>total</text>
      </svg>
      <div style={{ display: "grid", gap: 8, flex: 1, minWidth: 120 }}>
        {fatias.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: f.cor, flexShrink: 0 }} />
            <span style={{ flex: 1, color: "var(--color-text-secondary)" }}>{f.label}</span>
            <span style={{ fontWeight: 700, color: f.cor }}>{fmt(f.valor)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Linha (evolução mensal) ───────────────────────────────────────────────
export function GraficoLinha({ dados = [], linhas = [], eixoX = "mes" }) {
  if (!dados.length) return <p style={{ fontSize: 13, color: "var(--color-text-secondary)", textAlign: "center", padding: "24px 0" }}>Sem dados no período</p>;

  const W = 480, H = 160, padL = 32, padR = 12, padT = 12, padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const allVals = dados.flatMap((d) => linhas.map((l) => Number(d[l.key] || 0)));
  const maxVal = Math.max(...allVals, 1);

  const xPos = (i) => padL + (i / Math.max(dados.length - 1, 1)) * innerW;
  const yPos = (v) => padT + innerH - (v / maxVal) * innerH;

  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const label = (mes) => {
    const [, m] = String(mes || "").split("-");
    return meses[Number(m || 1) - 1] || mes;
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 280 }}>
        {/* grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padT + innerH * (1 - t)} y2={padT + innerH * (1 - t)}
            stroke="var(--color-border-tertiary)" strokeWidth={0.5} />
        ))}
        {/* lines */}
        {linhas.map((l) => {
          const pts = dados.map((d, i) => `${xPos(i)},${yPos(Number(d[l.key] || 0))}`).join(" ");
          return (
            <g key={l.key}>
              <polyline points={pts} fill="none" stroke={l.cor} strokeWidth={2} strokeLinejoin="round" />
              {dados.map((d, i) => (
                <circle key={i} cx={xPos(i)} cy={yPos(Number(d[l.key] || 0))} r={3.5} fill={l.cor}>
                  <title>{`${label(d[eixoX])}: ${fmt(d[l.key])}${l.sufixo || ""}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {/* x labels */}
        {dados.map((d, i) => (
          <text key={i} x={xPos(i)} y={H - 6} textAnchor="middle" style={{ fontSize: 10, fill: "var(--color-text-secondary)" }}>
            {label(d[eixoX])}
          </text>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
        {linhas.map((l) => (
          <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--color-text-secondary)" }}>
            <span style={{ width: 16, height: 3, background: l.cor, borderRadius: 2, display: "inline-block" }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Funil ─────────────────────────────────────────────────────────────────
export function Funil({ etapas = [] }) {
  const max = Math.max(...etapas.map((e) => Number(e.valor || 0)), 1);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {etapas.map((e, i) => {
        const pct = Math.round((Number(e.valor || 0) / max) * 100);
        const pctReal = i === 0 ? 100 : Math.round((Number(e.valor || 0) / Number(etapas[0].valor || 1)) * 100);
        return (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: "var(--color-text-secondary)" }}>{e.label}</span>
              <span style={{ fontWeight: 700, color: e.cor }}>{fmt(e.valor)} <span style={{ color: "var(--color-text-secondary)", fontWeight: 400 }}>({pctReal}%)</span></span>
            </div>
            <div style={{ height: 20, borderRadius: 6, background: "var(--color-background-secondary)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: e.cor, borderRadius: 6, transition: "width .5s ease", display: "flex", alignItems: "center", paddingLeft: 8 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Faróis visuais ────────────────────────────────────────────────────────
export function FarolGrid({ farois = [] }) {
  const tone = (t) => ({
    verde: { bg: "#dcfce7", border: "#16a34a", text: "#15803d" },
    amarelo: { bg: "#fef9c3", border: "#ca8a04", text: "#92400e" },
    vermelho: { bg: "#fee2e2", border: "#dc2626", text: "#991b1b" },
  }[t] || { bg: "var(--color-background-secondary)", border: "var(--color-border-secondary)", text: "var(--color-text-secondary)" });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
      {farois.map((f, i) => {
        const s = tone(f.tom || f.tone || f.cor);
        return (
          <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: s.text, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}>{f.titulo || f.title}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.text }}>{f.valor ?? f.value}</div>
            {f.detalhe || f.detail ? <div style={{ fontSize: 12, color: s.text, marginTop: 3, opacity: .8 }}>{f.detalhe || f.detail}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
