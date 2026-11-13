"use client";

// Peças compartilhadas das telas de Turnover, Pesquisa de desligamento e Onboarding (13/11/2026).
import { colors } from "../lib/theme";
import { st, fmtN, pct1, COR_RH } from "./RhUi";

export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloMes = (ym) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

/** Barra horizontal simples (valor em % de 0 a 100 ou relativa ao máximo). */
export function Barra({ valor, max = 100, cor = COR_RH, altura = 10, titulo }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (valor / max) * 100)) : 0;
  return (
    <div title={titulo} style={{ background: "#f1f5f9", borderRadius: 999, height: altura, width: "100%", overflow: "hidden" }}>
      <div style={{ width: `${w}%`, height: "100%", background: cor, borderRadius: 999 }} />
    </div>
  );
}

/** Colunas por mês: quantidade de saídas e, quando há quadro, a taxa. */
export function SerieMensal({ mensal }) {
  const max = Math.max(1, ...mensal.map((m) => m.desligamentos));
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, minWidth: Math.max(320, mensal.length * 54), height: 170, paddingTop: 18 }}>
        {mensal.map((m) => (
          <div key={m.mes} title={`${rotuloMes(m.mes)}: ${m.desligamentos} saída(s)${m.taxa !== null ? ` · ${pct1(m.taxa)}` : ""}`} style={{ flex: 1, minWidth: 40, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: colors.textPrimary }}>{fmtN(m.desligamentos)}</div>
            <div style={{ width: "100%", maxWidth: 38, height: `${Math.max(3, (m.desligamentos / max) * 100)}px`, minHeight: 3, background: COR_RH, borderRadius: "5px 5px 0 0", marginTop: 3, maxHeight: 110 }} />
            <div style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }}>{rotuloMes(m.mes)}</div>
            <div style={{ fontSize: 10.5, color: colors.textMuted, height: 14 }}>{m.taxa !== null ? pct1(m.taxa) : ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const Grade = ({ children, min = 190 }) => <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 14, marginTop: 16 }}>{children}</div>;

export function Aviso({ lista }) {
  if (!lista?.length) return null;
  return <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12.5, color: colors.textSecondary }}>{lista.map((a) => <li key={a}>{a}</li>)}</ul>;
}

/** Tabela por serviço/site (genérica): colunas = [{ titulo, render }]. */
export function TabelaGrupo({ titulo, grupo, colunas, vazio = "Sem dados no período." }) {
  return (
    <div style={{ ...st.card, marginTop: 16 }}>
      <h3 style={st.cardTitle}>{titulo}</h3>
      {grupo?.linhas?.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead><tr><th style={st.th}>Grupo</th>{colunas.map((c) => <th key={c.titulo} style={st.th}>{c.titulo}</th>)}</tr></thead>
            <tbody>{grupo.linhas.map((l) => <tr key={l.rotulo}><td style={st.td}><strong>{l.rotulo}</strong></td>{colunas.map((c) => <td key={c.titulo} style={st.td}>{c.render(l)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <p style={st.vazio}>{vazio}</p>}
      {grupo?.ocultos ? <p style={{ fontSize: 12, color: colors.textMuted, margin: "8px 0 0" }}>{grupo.ocultos} grupo(s) com poucas pessoas não aparecem, para não identificar ninguém.</p> : null}
    </div>
  );
}
