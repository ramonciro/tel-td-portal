import { colors, radius } from "../../lib/theme";

// Peças compartilhadas pelas abas do Radar (26/10/2026).
export const GRAV = {
  critica: { texto: "Crítica", cor: colors.dangerText, bg: colors.dangerLight },
  alta: { texto: "Alta", cor: colors.warningText, bg: colors.warningLight },
  media: { texto: "Atenção", cor: colors.textSecondary, bg: colors.neutralLight },
};

export function fmtData(d) {
  if (!d) return "—";
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia}/${m}/${a.slice(2)}`;
}
export function fmtPct(n) {
  return n === null || n === undefined ? "—" : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
export function quando(dias) {
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

export function Kpi({ rotulo, valor, cor, nota }) {
  return (
    <div style={{ flex: "1 1 190px", border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "12px 16px", background: "#fff" }}>
      <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>{rotulo}</p>
      <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 800, color: cor || colors.textPrimary }}>{valor}</p>
      {nota ? <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.textSecondary }}>{nota}</p> : null}
    </div>
  );
}

export const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
export const ok = { background: colors.successLight, color: colors.successText, borderRadius: radius.md, padding: "12px 16px", fontSize: 14, fontWeight: 700 };
export const caixa = { border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "12px 16px", background: "#fff" };
export const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
export const th = { textAlign: "left", padding: "9px 12px", fontSize: 11, color: colors.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", background: "#f8fafc", borderBottom: `1px solid ${colors.border}` };
export const td = { padding: "9px 12px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "top" };
export const mini = { fontSize: 12, color: colors.textSecondary, marginTop: 2 };
export const vazio = { textAlign: "center", color: colors.textMuted, padding: "24px 16px", fontSize: 14, margin: 0 };
export const badge = { alignSelf: "flex-start", padding: "5px 11px", borderRadius: radius.pill, fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", display: "inline-block" };
export const badgePeq = { padding: "3px 9px", borderRadius: radius.pill, fontWeight: 800, fontSize: 11, whiteSpace: "nowrap", display: "inline-block" };
export const link = { color: colors.primary, fontWeight: 700, textDecoration: "none", fontSize: 15 };
export const chip = { padding: "6px 12px", borderRadius: radius.pill, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 12, cursor: "pointer" };
export const chipOn = { background: colors.navy, color: "#fff", borderColor: colors.navy };
