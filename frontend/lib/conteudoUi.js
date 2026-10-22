// conteudoUi.js — Produção de conteúdo (22/10/2026)
// Rótulos, cores e formatadores compartilhados entre /conteudo e /conteudo/[id].
import { colors } from "./theme";

export const STATUS = {
  a_fazer: { rotulo: "A fazer", cor: colors.textSecondary, bg: colors.neutralLight },
  em_criacao: { rotulo: "Em criação", cor: "#1d4ed8", bg: colors.primaryLight },
  em_validacao: { rotulo: "Em validação", cor: "#6d28d9", bg: "#ede9fe" },
  em_ajustes: { rotulo: "Em ajustes", cor: colors.warningText, bg: colors.warningLight },
  validado: { rotulo: "Validado", cor: colors.successText, bg: colors.successLight },
  em_postagem: { rotulo: "Em postagem", cor: "#0f766e", bg: "#ccfbf1" },
  concluido: { rotulo: "Concluído", cor: colors.successText, bg: colors.successLight },
  cancelado: { rotulo: "Cancelado", cor: colors.textMuted, bg: colors.neutralLight },
};

export const FAROL = {
  verde: { cor: colors.success, texto: "No prazo" },
  ambar: { cor: colors.accentBright, texto: "Atenção" },
  vermelho: { cor: colors.danger, texto: "Atrasado" },
  espera: { cor: "#6d28d9", texto: "Com o cliente" },
  neutro: { cor: colors.textMuted, texto: "—" },
};

export const ETAPA_ROTULO = { criacao: "Criação", validacao: "Validação", postagem: "Postagem / aplicação" };

export const ACAO = {
  assumir: { rotulo: "Assumir pedido", tom: "sec" },
  iniciar_criacao: { rotulo: "Iniciar criação", tom: "pri" },
  concluir_criacao: { rotulo: "Concluir criação", tom: "pri" },
  iniciar_ajustes: { rotulo: "Iniciar ajustes", tom: "pri" },
  aprovar: { rotulo: "Aprovou", tom: "ok" },
  pedir_ajustes: { rotulo: "Pediu ajustes", tom: "warn" },
  iniciar_postagem: { rotulo: "Iniciar postagem", tom: "pri" },
  concluir_postagem: { rotulo: "Concluir postagem", tom: "pri" },
  concluir_sem_postagem: { rotulo: "Concluir sem postagem", tom: "sec" },
  lembrar: { rotulo: "Lembrar em 2 dias", tom: "sec" },
  cancelar: { rotulo: "Cancelar pedido", tom: "perigo" },
  reabrir: { rotulo: "Reabrir pedido", tom: "sec" },
};

/** Botão principal de cada cartão da fila (ações simples, de um clique). */
export const ACAO_RAPIDA = ["iniciar_criacao", "concluir_criacao", "iniciar_ajustes", "iniciar_postagem", "concluir_postagem"];

export function fmtDataHora(s) {
  if (!s) return "—";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return String(s);
  return `${m[3]}/${m[2]}/${m[1].slice(2)} ${m[4]}:${m[5]}`;
}

export function fmtData(s) {
  if (!s) return "—";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s);
}

/** 0.5 -> "30 min"; 2.5 -> "2,5 h"; 26 -> "26 h". */
export function fmtHoras(h) {
  if (h === null || h === undefined || Number.isNaN(Number(h))) return "—";
  const n = Number(h);
  if (n === 0) return "0 h";
  if (n < 1) return `${Math.round(n * 60)} min`;
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}

export function fmtDias(d) {
  if (d === null || d === undefined) return "";
  return d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`;
}

/** valor de <input type="datetime-local"> para "agora - 0 min" no fuso do navegador. */
export function agoraLocalInput() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const estiloBtn = {
  base: { padding: "9px 16px", borderRadius: 10, fontWeight: 800, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" },
  pri: { background: colors.navy, color: "#fff", border: `1px solid ${colors.navy}` },
  ok: { background: colors.success, color: "#fff", border: `1px solid ${colors.success}` },
  warn: { background: colors.warningLight, color: colors.warningText, border: "1px solid #fdba74" },
  sec: { background: "#fff", color: colors.textPrimary, border: `1px solid ${colors.border}` },
  perigo: { background: "#fff", color: colors.dangerText, border: "1px solid #fecaca" },
};
