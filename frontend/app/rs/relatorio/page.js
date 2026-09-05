"use client";

import { useState, useEffect, useCallback } from "react";
import PortalShell from "../../../components/PortalShell";
import PageHero    from "../../../components/PageHero";
import StatCard    from "../../../components/StatCard";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors } from "../../../lib/theme";

// ─── Helpers ───────────────────────────────────────────────────────

const MES_ATUAL = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const MESES_NOME = {
  "01":"Janeiro","02":"Fevereiro","03":"Março","04":"Abril","05":"Maio","06":"Junho",
  "07":"Julho","08":"Agosto","09":"Setembro","10":"Outubro","11":"Novembro","12":"Dezembro",
};

function mesLabel(mes) {
  if (!mes) return "";
  const [ano, mm] = mes.split("-");
  return `${MESES_NOME[mm] || mm} ${ano}`;
}

function getMesesDisponiveis() {
  const hoje = new Date();
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

const fmtNum = (v) => Number(v || 0).toLocaleString("pt-BR");

// ─── Distribuição de status com barras ─────────────────────────────
const STATUS_CORES = {
  "ENTREGUE":     colors.success,
  "EM ANDAMENTO": "#2563eb",
  "NÃO ENTREGUE": colors.danger,
  "CANCELADA":    colors.neutral,
};

function StatusBars({ dados }) {
  if (!dados || dados.length === 0) return null;
  const total = dados.reduce((s, r) => s + r.total, 0);
  return (
    <div>
      {dados.map(r => {
        const cor = STATUS_CORES[r.status] || colors.neutral;
        return (
          <div key={r.status} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: cor }} />
                <span style={{ fontSize: 13, color: colors.textSecondary }}>{r.status}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
                {r.total}{" "}
                <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 400 }}>({r.pct}%)</span>
              </span>
            </div>
            <div style={{ height: 6, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${r.pct}%`, background: cor,
                            borderRadius: 4, transition: "width .5s ease" }} />
            </div>
          </div>
        );
      })}
      <p style={{ margin: "8px 0 0", fontSize: 11, color: colors.textMuted, textAlign: "right" }}>
        Total: {total} RP{total !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// ─── Tabela pivot (por produto ou por cargo) ────────────────────────
function PivotTable({ titulo, linhas, colKey, colLabel }) {
  if (!linhas || linhas.length === 0) return null;
  const totHcs  = linhas.reduce((s, r) => s + (Number(r.hcs)           || 0), 0);
  const totTo   = linhas.reduce((s, r) => s + (Number(r.hcs_com_to)    || 0), 0);
  const totAprov= linhas.reduce((s, r) => s + (Number(r.hcs_aprovados) || 0), 0);
  const totEntr = linhas.reduce((s, r) => s + (Number(r.qtd_entregue)  || 0), 0);

  return (
    <div style={{
      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
      overflow: "hidden", marginBottom: 14,
      boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
    }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                       letterSpacing: ".06em", color: colors.accent }}>{titulo}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={thSt}>{colLabel}</th>
              <th style={{ ...thSt, textAlign: "right" }}>HC'S</th>
              <th style={{ ...thSt, textAlign: "right" }}>HC'S com TO</th>
              <th style={{ ...thSt, textAlign: "right" }}>HC'S Aprovados</th>
              <th style={{ ...thSt, textAlign: "right" }}>QTD Entregue</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((r, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc",
                                   borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 18px", color: colors.textPrimary, fontWeight: 500 }}>
                  {r[colKey] || "—"}
                </td>
                <td style={{ padding: "10px 18px", textAlign: "right", color: colors.textSecondary }}>{fmtNum(r.hcs)}</td>
                <td style={{ padding: "10px 18px", textAlign: "right", color: colors.textMuted }}>{fmtNum(r.hcs_com_to)}</td>
                <td style={{ padding: "10px 18px", textAlign: "right", color: colors.textSecondary }}>{fmtNum(r.hcs_aprovados)}</td>
                <td style={{ padding: "10px 18px", textAlign: "right", color: colors.success, fontWeight: 700 }}>{fmtNum(r.qtd_entregue)}</td>
              </tr>
            ))}
            <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
              <td style={{ padding: "11px 18px", fontWeight: 800, fontSize: 12,
                           color: colors.accent, textTransform: "uppercase", letterSpacing: ".04em" }}>TOTAL</td>
              <td style={tdTot}>{fmtNum(totHcs)}</td>
              <td style={tdTot}>{fmtNum(totTo)}</td>
              <td style={tdTot}>{fmtNum(totAprov)}</td>
              <td style={{ ...tdTot, color: colors.success, fontSize: 15 }}>{fmtNum(totEntr)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tabela por site ────────────────────────────────────────────────
function SiteCards({ por_site }) {
  if (!por_site || por_site.length === 0) return null;
  const total = por_site.reduce((s, r) => s + r.total_rps, 0);
  return (
    <div style={{
      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
      padding: "18px 22px", marginBottom: 14,
      boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
    }}>
      <p style={cardTitleSt}>RPs por Site</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {por_site.map(s => (
          <div key={s.site} style={{
            background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
            padding: "12px 18px", textAlign: "center", minWidth: 120,
          }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: colors.textPrimary }}>{s.total_rps}</div>
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 3,
                          textTransform: "uppercase", letterSpacing: ".04em" }}>{s.site}</div>
          </div>
        ))}
        <div style={{
          background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10,
          padding: "12px 18px", textAlign: "center", minWidth: 120,
        }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: colors.accent }}>{total}</div>
          <div style={{ fontSize: 10, color: colors.accent, marginTop: 3,
                        textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 700 }}>Total</div>
        </div>
      </div>
    </div>
  );
}

// ─── Página ────────────────────────────────────────────────────────
export default function RSRelatorioPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [mes, setMes] = useState(MES_ATUAL());
  const [setor, setSetor] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ mes });
      if (setor) p.set("setor", setor);
      const d = await apiFetch(`/rs/relatorio?${p}`);
      setData(d);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [mes, setor]);

  useEffect(() => { carregar(); }, [carregar]);

  // Usa apiDownload — já cuida de token, filename e download automático
  const handleExportar = async () => {
    setExportando(true);
    try {
      await apiDownload(
        `/rs/exportar?mes=${mes}`,
        `relatorio_rs_${mes.replace("-", "_")}.xlsx`
      );
    } catch (e) { alert("Erro ao exportar: " + (e.message || "Tente novamente.")); }
    finally { setExportando(false); }
  };

  const showOper = !setor || setor === "OPERACIONAL";
  const showEstr = !setor || setor === "ESTRATÉGICO";

  const topRight = (
    <button onClick={handleExportar} disabled={exportando || loading}
      style={{
        background: exportando ? "#f1f5f9" : colors.accent,
        color: exportando ? colors.textMuted : "#fff",
        border: "none", borderRadius: 10, padding: "10px 20px",
        fontWeight: 700, fontSize: 13, cursor: exportando ? "not-allowed" : "pointer",
      }}>
      {exportando ? "⏳ Gerando..." : "⬇ Exportar Excel"}
    </button>
  );

  return (
    <PortalShell
      title="Relatório Mensal"
      subtitle={`${mesLabel(mes)} · ${setor || "Todos os setores"}`}
      topRight={topRight}
    >
      <PageHero
        eyebrow="Recrutamento & Seleção"
        title="Relatório de RPs"
        subtitle="Equivalente digital das abas de dashboard da planilha — por produto, cargo e status."
        stats={
          data?.kpis ? [
            { label: "Total de RPs",    value: fmtNum(data.kpis.total_rps)           },
            { label: "HC'S Solicitados",value: fmtNum(data.kpis.total_hcs)           },
            { label: "HC'S Aprovados",  value: fmtNum(data.kpis.total_hcs_aprovados) },
            { label: "QTD Entregue",    value: fmtNum(data.kpis.total_entregue)      },
          ] : []
        }
      />

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", margin: "16px 0 14px" }}>
        <div>
          <label style={filterLabelSt}>Mês</label>
          <select value={mes} onChange={e => setMes(e.target.value)} style={filterSelectSt}>
            {getMesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </select>
        </div>
        <div>
          <label style={filterLabelSt}>Setor</label>
          <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
            {[{ v: "", l: "Todos" }, { v: "OPERACIONAL", l: "Operacional" }, { v: "ESTRATÉGICO", l: "Estratégico" }]
              .map(({ v, l }) => (
                <button key={v} onClick={() => setSetor(v)} style={{
                  padding: "7px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                  background: setor === v ? colors.accent : "#f8fafc",
                  color:      setor === v ? "#fff"        : colors.neutral,
                }}>{l}</button>
              ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: colors.textMuted }}>Gerando relatório...</div>
      ) : !data ? (
        <div style={{ textAlign: "center", padding: 60, color: colors.textMuted }}>Sem dados para {mesLabel(mes)}.</div>
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 14 }}>
            <StatCard title="Total RPs"      value={fmtNum(data.kpis?.total_rps)}           accent={colors.accent}  />
            <StatCard title="HC'S Solicit."  value={fmtNum(data.kpis?.total_hcs)}           accent="#2563eb"        />
            <StatCard title="HC'S com TO"    value={fmtNum(data.kpis?.total_hcs_to)}        accent={colors.neutral} />
            <StatCard title="HC'S Aprovados" value={fmtNum(data.kpis?.total_hcs_aprovados)} accent="#7c3aed"        />
            <StatCard title="QTD Entregue"   value={fmtNum(data.kpis?.total_entregue)}      accent={colors.success} />
          </div>

          {/* Por Site */}
          <SiteCards por_site={data.por_site} />

          {/* Por Produto — Operacional */}
          {showOper && (
            <PivotTable
              titulo="Operacional — HC'S por Produto / Cliente"
              linhas={data.por_produto}
              colKey="produto"
              colLabel="Produto / Cliente"
            />
          )}

          {/* Por Cargo — Estratégico */}
          {showEstr && (
            <PivotTable
              titulo="Estratégico — HC'S por Cargo"
              linhas={data.por_cargo}
              colKey="cargo"
              colLabel="Cargo"
            />
          )}

          {/* Distribuição de Status */}
          {data.por_status && data.por_status.length > 0 && (
            <div style={{
              background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
              padding: "20px 22px", boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
            }}>
              <p style={cardTitleSt}>Distribuição de Status</p>
              <StatusBars dados={data.por_status} />
            </div>
          )}
        </>
      )}
    </PortalShell>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────
const thSt = {
  padding: "10px 18px", fontSize: 11, fontWeight: 700, color: colors.textMuted,
  textTransform: "uppercase", letterSpacing: ".04em",
  borderBottom: "1px solid #e2e8f0", textAlign: "left", whiteSpace: "nowrap",
};
const tdTot = {
  padding: "11px 18px", textAlign: "right", fontWeight: 700,
  color: colors.textPrimary, fontSize: 14,
};
const filterLabelSt = {
  display: "block", fontSize: 10, fontWeight: 700, color: colors.textMuted,
  textTransform: "uppercase", marginBottom: 4,
};
const filterSelectSt = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
  color: colors.textPrimary, padding: "7px 11px",
  fontSize: 12, outline: "none", cursor: "pointer", fontFamily: "inherit",
};
const cardTitleSt = {
  margin: "0 0 16px", fontSize: 11, fontWeight: 800,
  textTransform: "uppercase", letterSpacing: ".06em", color: colors.accent,
};
