"use client";

/**
 * Peças compartilhadas pelo Dashboard R&S (/rs) e pelo Relatório (/rs/relatorio)
 * — 20/10/2026. Os números vêm sempre do mesmo cálculo no backend
 * (lib/rsRelatorios.js), então as duas telas e o Excel nunca divergem.
 */
import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import { colors } from "../lib/theme";

// ─── Helpers ───────────────────────────────────────────────────────
export const MES_ATUAL = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const MESES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONGO = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function mesLabel(mes, longo = false) {
  if (!mes) return "";
  const [ano, mm] = mes.split("-");
  const nomes = longo ? MESES_LONGO : MESES_CURTO;
  return `${nomes[Number(mm) - 1] || mm}${longo ? " " : "/"}${ano}`;
}

export function getMesesDisponiveis(n = 24) {
  const hoje = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

export const fmtNum = (v) => Number(v || 0).toLocaleString("pt-BR");
export const fmtTaxa = (v) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
export const fmtDias = (v) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`);

export function fmtDataBR(iso) {
  if (!iso) return "—";
  const s = String(iso).slice(0, 10);
  const [a, m, d] = s.split("-");
  return a && m && d ? `${d}/${m}/${a}` : "—";
}

/**
 * Variação em relação ao período anterior.
 * tipo "pct": volume (variação em %). tipo "pp": taxa (diferença em pontos percentuais).
 * melhor: "subir" (mais é bom), "descer" (mais é ruim) ou "neutro".
 */
export function Variacao({ valor, tipo = "pct", melhor = "neutro", rotulo = "vs período anterior" }) {
  if (valor === null || valor === undefined) {
    return <span style={{ fontSize: 11, color: colors.textMuted }}>sem base de comparação</span>;
  }
  const n = Number(valor);
  const seta = n > 0 ? "▲" : n < 0 ? "▼" : "•";
  let cor = colors.textMuted;
  if (n !== 0 && melhor !== "neutro") {
    const bom = (n > 0 && melhor === "subir") || (n < 0 && melhor === "descer");
    cor = bom ? colors.success : colors.danger;
  }
  const texto = tipo === "pp"
    ? `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`
    : `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: cor }}>
      {seta} {texto} <span style={{ fontWeight: 400, color: colors.textMuted }}>{rotulo}</span>
    </span>
  );
}

// ─── Filtros ───────────────────────────────────────────────────────
const labelSt = { display: "block", fontSize: 10, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase", marginBottom: 4 };
const selectSt = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: colors.textPrimary,
  padding: "7px 11px", fontSize: 12, outline: "none", cursor: "pointer", fontFamily: "inherit",
};
export const estiloSelect = selectSt;
export const estiloLabel = labelSt;

/** Lista de sites (do cadastro + os que já aparecem em RPs). */
export function useSitesRS() {
  const [sites, setSites] = useState([]);
  useEffect(() => {
    apiFetch("/rs/sites").then((l) => setSites((Array.isArray(l) ? l : []).map((s) => s.nome).filter(Boolean))).catch(() => setSites([]));
  }, []);
  return sites;
}

export function SetorToggle({ valor, onChange }) {
  return (
    <div>
      <label style={labelSt}>Setor</label>
      <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        {[{ v: "", l: "Todos" }, { v: "OPERACIONAL", l: "Operacional" }, { v: "ESTRATÉGICO", l: "Estratégico" }].map(({ v, l }) => (
          <button key={v} onClick={() => onChange(v)} style={{
            padding: "7px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
            background: valor === v ? colors.accent : "#f8fafc", color: valor === v ? "#fff" : colors.neutral,
          }}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function SiteSelect({ valor, onChange }) {
  const sites = useSitesRS();
  return (
    <div>
      <label style={labelSt}>Site</label>
      <select value={valor} onChange={(e) => onChange(e.target.value)} style={selectSt}>
        <option value="">Todos os sites</option>
        {sites.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

export function LimiteDiasSelect({ valor, onChange }) {
  return (
    <div>
      <label style={labelSt}>RP atrasada após</label>
      <select value={valor} onChange={(e) => onChange(Number(e.target.value))} style={selectSt}>
        {[7, 10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} dias</option>)}
      </select>
    </div>
  );
}

// ─── Cartões ───────────────────────────────────────────────────────
export const card = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
  padding: "20px 22px", boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
};
export const cardTitle = {
  margin: "0 0 16px", fontSize: 12, fontWeight: 800,
  textTransform: "uppercase", letterSpacing: ".06em", color: colors.accent,
};
const th = {
  padding: "10px 14px", fontSize: 11, fontWeight: 700, color: colors.textMuted, textTransform: "uppercase",
  letterSpacing: ".04em", borderBottom: "1px solid #e2e8f0", textAlign: "left", whiteSpace: "nowrap",
};
const td = { padding: "10px 14px", color: colors.textSecondary, fontSize: 13 };
const tdNum = { ...td, textAlign: "right" };
const tdTot = { padding: "11px 14px", textAlign: "right", fontWeight: 800, color: colors.textPrimary, fontSize: 13 };

/** Cor da taxa de entrega (farol): >= 85 verde, >= 60 laranja, abaixo vermelho. */
export function corTaxa(v) {
  if (v === null || v === undefined) return colors.textMuted;
  if (v >= 85) return colors.success;
  if (v >= 60) return colors.warning;
  return colors.danger;
}

/** Tabela de grupo (por site / produto / cargo) com taxas e pendentes. */
export function TabelaGrupo({ titulo, rotuloColuna, linhas, total, chave = "rotulo" }) {
  if (!linhas || linhas.length === 0) return null;
  return (
    <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: colors.accent }}>{titulo}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={th}>{rotuloColuna}</th>
              <th style={{ ...th, textAlign: "right" }}>RPs</th>
              <th style={{ ...th, textAlign: "right" }}>HC'S</th>
              <th style={{ ...th, textAlign: "right" }}>Aprovados</th>
              <th style={{ ...th, textAlign: "right" }}>Entregues</th>
              <th style={{ ...th, textAlign: "right" }}>Taxa entrega</th>
              <th style={{ ...th, textAlign: "right" }}>Pendentes</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((r, i) => (
              <tr key={`${r[chave]}-${i}`} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ ...td, color: colors.textPrimary, fontWeight: 600 }}>{r[chave] || "—"}</td>
                <td style={tdNum}>{fmtNum(r.total_rps)}</td>
                <td style={tdNum}>{fmtNum(r.hcs)}</td>
                <td style={tdNum}>{fmtNum(r.hcs_aprovados)}</td>
                <td style={{ ...tdNum, color: colors.success, fontWeight: 700 }}>{fmtNum(r.qtd_entregue)}</td>
                <td style={{ ...tdNum, fontWeight: 700, color: corTaxa(r.taxa_entrega) }}>{fmtTaxa(r.taxa_entrega)}</td>
                <td style={{ ...tdNum, color: r.pendentes > 0 ? colors.warning : colors.textMuted, fontWeight: r.pendentes > 0 ? 700 : 400 }}>{fmtNum(r.pendentes)}</td>
              </tr>
            ))}
            {total && (
              <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                <td style={{ padding: "11px 14px", fontWeight: 800, fontSize: 12, color: colors.accent, textTransform: "uppercase" }}>Total</td>
                <td style={tdTot}>{fmtNum(total.total_rps)}</td>
                <td style={tdTot}>{fmtNum(total.hcs)}</td>
                <td style={tdTot}>{fmtNum(total.hcs_aprovados)}</td>
                <td style={{ ...tdTot, color: colors.success }}>{fmtNum(total.qtd_entregue)}</td>
                <td style={{ ...tdTot, color: corTaxa(total.taxa_entrega) }}>{fmtTaxa(total.taxa_entrega)}</td>
                <td style={tdTot}>{fmtNum(total.pendentes)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Prazo médio (SLA): recebimento → etapa. */
export function CardPrazos({ sla }) {
  const linhas = [
    { l: "Operacional · recebimento → início da av. técnica", v: sla?.operacional?.ate_inicio, n: sla?.operacional?.n },
    { l: "Operacional · recebimento → final da av. técnica", v: sla?.operacional?.dias_medio, n: sla?.operacional?.n },
    { l: "Estratégico · recebimento → fechamento da vaga", v: sla?.estrategico?.dias_medio, n: sla?.estrategico?.n },
  ];
  return (
    <div style={card}>
      <p style={cardTitle}>Prazo médio (dias corridos)</p>
      <div style={{ display: "grid", gap: 12 }}>
        {linhas.map((x) => (
          <div key={x.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 13, color: colors.textSecondary }}>{x.l}</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: colors.textPrimary, whiteSpace: "nowrap" }}>
              {fmtDias(x.v)}
              <span style={{ fontSize: 10, fontWeight: 400, color: colors.textMuted }}> {x.n ? `(${x.n} RP${x.n > 1 ? "s" : ""})` : ""}</span>
            </span>
          </div>
        ))}
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 11, color: colors.textMuted }}>
        Só entram RPs que têm as duas datas preenchidas; canceladas ficam de fora.
      </p>
    </div>
  );
}

/** RPs em andamento (de qualquer mês), atrasadas primeiro. */
export function TabelaEmAndamento({ emAberto }) {
  const itens = emAberto?.itens || [];
  const limite = emAberto?.limite_dias;
  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: colors.accent }}>
          RPs em andamento (todos os meses)
        </span>
        <span style={{ fontSize: 12, color: colors.textSecondary }}>
          {fmtNum(emAberto?.total)} em aberto ·{" "}
          <strong style={{ color: emAberto?.atrasadas > 0 ? colors.danger : colors.success }}>
            {fmtNum(emAberto?.atrasadas)} atrasada{emAberto?.atrasadas === 1 ? "" : "s"}
          </strong>{" "}(mais de {limite} dias)
        </span>
      </div>
      {itens.length === 0 ? (
        <p style={{ padding: "24px 20px", margin: 0, fontSize: 13, color: colors.textMuted }}>Nenhuma RP em andamento com estes filtros.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={th}>Situação</th><th style={th}>Site</th><th style={th}>Setor</th><th style={th}>Produto / cargo</th>
                <th style={th}>Mês</th><th style={th}>Recebida em</th>
                <th style={{ ...th, textAlign: "right" }}>Dias</th><th style={{ ...th, textAlign: "right" }}>Pendentes</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((x, i) => (
                <tr key={x.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                  <td style={td}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999,
                      background: x.atrasada ? colors.dangerLight : colors.successLight,
                      color: x.atrasada ? colors.dangerText : colors.successText,
                    }}>{x.atrasada ? "Atrasada" : "No prazo"}</span>
                  </td>
                  <td style={td}>{x.site}</td>
                  <td style={td}>{x.setor}</td>
                  <td style={{ ...td, color: colors.textPrimary, fontWeight: 600 }}>{x.produto}{x.cargo ? ` · ${x.cargo}` : ""}</td>
                  <td style={td}>{mesLabel(x.mes)}</td>
                  <td style={td}>{fmtDataBR(x.data_recebimento)}</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: x.atrasada ? colors.danger : colors.textPrimary }}>{fmtNum(x.dias)}</td>
                  <td style={tdNum}>{fmtNum(x.pendentes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {emAberto?.total > itens.length && (
        <p style={{ margin: 0, padding: "10px 20px", fontSize: 11, color: colors.textMuted, borderTop: "1px solid #f1f5f9" }}>
          Mostrando as {itens.length} mais antigas de {emAberto.total}. A lista completa está na aba EM ANDAMENTO do Excel.
        </p>
      )}
    </div>
  );
}
