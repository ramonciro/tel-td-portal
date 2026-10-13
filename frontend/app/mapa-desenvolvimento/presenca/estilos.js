import { colors, radius } from "../../../lib/theme";

// Estilos compartilhados da tela de presença (Mapa de Desenvolvimento →
// Encontros e presença, 13/10/2026).

export const btnPrimario = { padding: "9px 18px", background: colors.accent, color: "#fff", border: "none", borderRadius: radius.sm, cursor: "pointer", fontSize: 13, fontWeight: 700 };
export const btnSecundario = { padding: "9px 18px", background: colors.surfaceMuted, color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, cursor: "pointer", fontSize: 13, fontWeight: 700 };
export const btnPerigo = { ...btnSecundario, color: colors.dangerText, borderColor: "#fecaca", background: colors.dangerLight };
export const btnMini = { padding: "3px 8px", background: colors.surfaceMuted, color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: radius.sm, cursor: "pointer", fontSize: 11, fontWeight: 700 };
export const entrada = { padding: "9px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 14, fontFamily: "inherit", background: colors.surface, color: colors.textPrimary, boxSizing: "border-box", width: "100%" };
export const rotulo = { display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary, minWidth: 0 };
export const gradeForm = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 };
export const painel = { background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: 16, display: "grid", gap: 12 };
export const dica = { fontSize: 12, color: colors.textSecondary, lineHeight: 1.5 };
export const acoes = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
export const vazio = { textAlign: "center", color: colors.textMuted, padding: "40px 0", fontSize: 14 };
export const aviso = { padding: "10px 14px", borderRadius: radius.md, fontSize: 13, fontWeight: 600 };
export const avisoErro = { ...aviso, background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca" };
export const avisoOk = { ...aviso, background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0" };
export const selo = { fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: radius.pill, whiteSpace: "nowrap", display: "inline-block" };

export const SITUACAO = {
  presente: { letra: "P", label: "Presente", bg: "#dcfce7", cor: "#166534", borda: "#86efac" },
  justificado: { letra: "J", label: "Justificado", bg: "#fef3c7", cor: "#92400e", borda: "#fcd34d" },
  ausente: { letra: "F", label: "Ausente", bg: "#fee2e2", cor: "#b91c1c", borda: "#fca5a5" },
};

export const FAROL = {
  verde: { label: "Dentro do mínimo", bg: colors.successLight, cor: colors.successText },
  vermelho: { label: "Abaixo do mínimo", bg: colors.dangerLight, cor: colors.dangerText },
  cinza: { label: "Sem dados", bg: colors.neutralLight, cor: colors.neutral },
};

export const RECICLAGEM = {
  em_dia: { label: "Em dia", bg: colors.successLight, cor: colors.successText },
  vence_em_breve: { label: "Vence em breve", bg: colors.warningLight, cor: colors.warningText },
  vencida: { label: "Vencida", bg: colors.dangerLight, cor: colors.dangerText },
  sem_registro: { label: "Sem registro", bg: colors.neutralLight, cor: colors.neutral },
  incompleto: { label: "Meta não atingida", bg: colors.warningLight, cor: colors.warningText },
};

export const fmtNum = (v, casas = 1) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: casas }));
