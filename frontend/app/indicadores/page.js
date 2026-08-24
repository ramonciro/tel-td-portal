"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import { apiFetch, getStoredUser } from "../../services/api";

/* ─── utils ───────────────────────────────────────────────────────────────── */
function fmtH(v)   { return v != null ? `${Number(v).toLocaleString("pt-BR")}h` : "—"; }
function fmtN(v)   { return v != null ? Number(v).toLocaleString("pt-BR") : "—"; }
function fmtPct(v) { return v != null ? `${v}%` : "—"; }
function fmtR(v)   {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

/* ─── Mini componentes visuais ─────────────────────────────────────────────── */
function Kpi({ label, value, sub, color = "#0B1220", destaque }) {
  return (
    <div style={{ ...kpiCard, ...(destaque ? { borderTop: `3px solid ${color}` } : {}) }}>
      <div style={{ fontSize: 32, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginTop: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function HBar({ label, value, max, color = "#FF6B4A", right }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between",
        fontSize: 12, color: "#374151", marginBottom: 3 }}>
        <span style={{ maxWidth: "65%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        <span style={{ fontWeight: 700, color }}>{right || value}</span>
      </div>
      <div style={{ height: 7, background: "#f3f4f6", borderRadius: 999 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color,
          borderRadius: 999, transition: "width .4s" }} />
      </div>
    </div>
  );
}

function VBarChart({ data, labelKey, valueKey, color = "#FF6B4A", unit = "h" }) {
  const max = Math.max(...data.map((d) => d[valueKey] || 0), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, overflowX: "auto" }}>
      {data.map((d, i) => {
        const pct = Math.round(((d[valueKey] || 0) / max) * 100);
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column",
            alignItems: "center", minWidth: 32, flex: 1 }}>
            <div style={{ fontSize: 9, color: "#FF6B4A", fontWeight: 700, height: 14 }}>
              {d[valueKey] > 0 ? `${d[valueKey]}${unit}` : ""}
            </div>
            <div style={{ width: "100%", height: 88, display: "flex", alignItems: "flex-end" }}>
              <div style={{ width: "100%", height: `${pct}%`, minHeight: d[valueKey] > 0 ? 2 : 0,
                background: d[valueKey] > 0 ? color : "#f3f4f6",
                borderRadius: "4px 4px 0 0", transition: "height .4s" }} />
            </div>
            <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2, textAlign: "center" }}>
              {d[labelKey]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NpsGauge({ score }) {
  if (score == null) return <div style={emptyMsg}>Sem avaliações NPS cadastradas.</div>;
  const pct  = Math.round(((score + 100) / 200) * 100);
  const cor  = score >= 50 ? "#22c55e" : score >= 25 ? "#84cc16"
             : score >= 0  ? "#f59e0b" : score >= -25 ? "#f97316" : "#ef4444";
  const cat  = score >= 75 ? "Excelente" : score >= 50 ? "Ótimo" : score >= 25 ? "Bom"
             : score >= 0  ? "Regular"   : "Crítico";
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{ fontSize: 64, fontWeight: 900, color: cor, lineHeight: 1 }}>{score}</div>
      <div style={{ fontSize: 14, color: "#6b7280", margin: "6px 0 16px" }}>NPS Score</div>
      <div style={{ height: 12, background: "linear-gradient(to right,#ef4444,#f97316,#f59e0b,#84cc16,#22c55e)",
        borderRadius: 999, position: "relative", maxWidth: 280, margin: "0 auto" }}>
        <div style={{ position: "absolute", top: -4, left: `${pct}%`, transform: "translateX(-50%)",
          width: 20, height: 20, borderRadius: 999, background: "#fff",
          border: `3px solid ${cor}`, boxShadow: "0 2px 6px rgba(0,0,0,.15)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", maxWidth: 280,
        margin: "6px auto 0", fontSize: 10, color: "#9ca3af" }}>
        <span>-100</span><span>0</span><span>+100</span>
      </div>
      <div style={{ marginTop: 14, display: "inline-block", padding: "6px 16px",
        background: `${cor}20`, color: cor, fontWeight: 800, fontSize: 13,
        borderRadius: 999 }}>{cat}</div>
    </div>
  );
}

/* ─── Tabs ─────────────────────────────────────────────────────────────────── */
const TABS = [
  { id: "horas",       label: "⏱ Horas",       endpoint: "/analytics/horas" },
  { id: "nps",         label: "⭐ NPS",         endpoint: "/analytics/nps" },
  { id: "efetividade", label: "📈 Efetividade", endpoint: "/analytics/efetividade" },
  { id: "roi",         label: "💡 ROI",         endpoint: "/analytics/roi" },
];

/* ─── main ──────────────────────────────────────────────────────────────────── */
export default function IndicadoresPage() {
  const user = getStoredUser();
  const [activeTab, setActiveTab] = useState("horas");
  const [data,      setData]      = useState({});
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  useEffect(() => {
    const tab = TABS.find((t) => t.id === activeTab);
    if (!tab || data[activeTab]) return;

    setLoading(true);
    setError("");
    apiFetch(tab.endpoint)
      .then((d) => setData((prev) => ({ ...prev, [activeTab]: d })))
      .catch((err) => setError(err.message || "Erro ao carregar dados."))
      .finally(() => setLoading(false));
  }, [activeTab]);

  const d = data[activeTab];

  return (
    <PortalShell>
      <div style={page}>
        <PageHero
          title="Indicadores & Analytics"
          subtitle="Horas treinadas, NPS, efetividade e ROI — todos os indicadores do seu ambiente"
          icon="📊"
        />

        {/* Tab bar */}
        <div style={tabBar}>
          {TABS.map((t) => (
            <button key={t.id} style={tabBtn(activeTab === t.id)}
              onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {error && <div style={alertErr}>{error}</div>}

        {loading ? (
          <div style={emptyMsg}>Carregando…</div>
        ) : !d ? null : (

          <>
            {/* ── HORAS ─────────────────────────────────────────────────── */}
            {activeTab === "horas" && (
              <div>
                <div style={kpiRow}>
                  <Kpi label="Horas treinadas (concluídas)" value={fmtH(d.total)}
                    color="#FF6B4A" destaque />
                  <Kpi label="Clientes / operações ativos"
                    value={d.por_cliente?.length ?? "—"} />
                  <Kpi label="Instrutores ativos"
                    value={d.por_instrutor?.length ?? "—"} />
                </div>

                {d.por_mes?.length > 0 && (
                  <div style={section}>
                    <h3 style={sectionTitle}>Horas treinadas — últimos 12 meses</h3>
                    <VBarChart
                      data={(() => {
                        const agora = new Date();
                        const result = [];
                        for (let i = 11; i >= 0; i--) {
                          const dt  = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
                          const key = `${dt.getFullYear()}-${dt.getMonth() + 1}`;
                          const found = d.por_mes.find(
                            (m) => `${m.ano}-${m.mes}` === key
                          );
                          result.push({ label: MESES[dt.getMonth()], horas: found?.horas || 0 });
                        }
                        return result;
                      })()}
                      labelKey="label" valueKey="horas" color="#FF6B4A"
                    />
                  </div>
                )}

                <div style={twoCol}>
                  {d.por_cliente?.length > 0 && (
                    <div style={section}>
                      <h3 style={sectionTitle}>Por cliente / operação</h3>
                      {d.por_cliente.map((c) => (
                        <HBar key={c.cliente} label={c.cliente} value={c.horas}
                          max={d.por_cliente[0]?.horas} right={fmtH(c.horas)} />
                      ))}
                    </div>
                  )}
                  {d.por_instrutor?.length > 0 && (
                    <div style={section}>
                      <h3 style={sectionTitle}>Por instrutor</h3>
                      {d.por_instrutor.map((r) => (
                        <HBar key={r.instrutor} label={r.instrutor} value={r.horas}
                          max={d.por_instrutor[0]?.horas} right={fmtH(r.horas)}
                          color="#0B1220" />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── NPS ───────────────────────────────────────────────────── */}
            {activeTab === "nps" && (
              <div>
                <div style={npsLayout}>
                  <div style={section}>
                    <h3 style={sectionTitle}>Score NPS</h3>
                    <NpsGauge score={d.score} />
                    {d.total > 0 && (
                      <div style={npsBreakdown}>
                        {[
                          { label: "Promotores (9-10)", value: d.promotores, cor: "#22c55e" },
                          { label: "Neutros (7-8)",     value: d.neutros,    cor: "#f59e0b" },
                          { label: "Detratores (0-6)",  value: d.detratores, cor: "#ef4444" },
                        ].map((item) => (
                          <div key={item.label} style={npsItem}>
                            <div style={{ ...npsDot, background: item.cor }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", justifyContent: "space-between",
                                fontSize: 12 }}>
                                <span style={{ color: "#374151" }}>{item.label}</span>
                                <span style={{ fontWeight: 700, color: item.cor }}>
                                  {item.value} ({d.total > 0 ? Math.round((item.value/d.total)*100) : 0}%)
                                </span>
                              </div>
                              <div style={{ height: 5, background: "#f3f4f6", borderRadius: 999, marginTop: 4 }}>
                                <div style={{ height: "100%", borderRadius: 999,
                                  background: item.cor,
                                  width: `${d.total > 0 ? Math.round((item.value/d.total)*100) : 0}%` }} />
                              </div>
                            </div>
                          </div>
                        ))}
                        <div style={{ textAlign: "center", fontSize: 12, color: "#9ca3af",
                          marginTop: 8 }}>{d.total} respostas no total</div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {d.tendencia?.length > 0 && (
                      <div style={section}>
                        <h3 style={sectionTitle}>Tendência (6 meses)</h3>
                        <VBarChart data={d.tendencia.map((t) => ({
                          label: MESES[(t.mes || 1) - 1],
                          media: Number((t.media || 0).toFixed(1)),
                        }))} labelKey="label" valueKey="media" color="#3b82f6" unit="" />
                      </div>
                    )}

                    {d.por_turma?.length > 0 && (
                      <div style={section}>
                        <h3 style={sectionTitle}>NPS por turma</h3>
                        {d.por_turma.slice(0, 6).map((t) => (
                          <HBar key={t.tema} label={`${t.tema} (${t.cliente || "?"})`}
                            value={Number(t.media)} max={10}
                            right={`${t.media} / ${t.respostas} resp.`}
                            color="#3b82f6" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── EFETIVIDADE ───────────────────────────────────────────── */}
            {activeTab === "efetividade" && (
              <div>
                <div style={kpiRow}>
                  <Kpi label="Taxa de aprovação" color="#22c55e" destaque
                    value={fmtPct(d.taxa_aprovacao)}
                    sub={`${fmtN(d.total_avaliados)} avaliados`} />
                  <Kpi label="Nota média (prova)"
                    value={d.media_prova != null ? d.media_prova : "—"} />
                  <Kpi label="Taxa de presença"
                    value={fmtPct(d.presenca?.taxa)}
                    color={d.presenca?.taxa >= 75 ? "#22c55e" : "#f59e0b"}
                    sub={d.presenca?.total > 0 ? `${fmtN(d.presenca.presentes)} de ${fmtN(d.presenca.total)} registros` : ""} />
                </div>

                {d.por_cliente?.length > 0 && (
                  <div style={section}>
                    <h3 style={sectionTitle}>Efetividade por cliente / operação</h3>
                    <div style={tableWrap}>
                      <table style={table}>
                        <thead>
                          <tr>
                            {["Cliente","Turmas","Avaliados","Média prova","Média qualidade","% Aprovados"].map((h) => (
                              <th key={h} style={th}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {d.por_cliente.map((c) => {
                            const taxa = c.avaliados > 0
                              ? Math.round((c.aprovados / c.avaliados) * 100) : null;
                            return (
                              <tr key={c.cliente}>
                                <td style={td}>{c.cliente}</td>
                                <td style={{ ...td, textAlign: "center" }}>{c.turmas}</td>
                                <td style={{ ...td, textAlign: "center" }}>{c.avaliados || "—"}</td>
                                <td style={{ ...td, textAlign: "center" }}>{c.media_prova || "—"}</td>
                                <td style={{ ...td, textAlign: "center" }}>{c.media_qualidade || "—"}</td>
                                <td style={{ ...td, textAlign: "center" }}>
                                  {taxa != null ? (
                                    <span style={{ color: taxa >= 70 ? "#166534" : "#991b1b",
                                      fontWeight: 700 }}>{taxa}%</span>
                                  ) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── ROI ───────────────────────────────────────────────────── */}
            {activeTab === "roi" && (
              <div>
                <div style={kpiRow}>
                  <Kpi label="Horas realizadas" value={fmtH(d.horas_realizadas)}
                    color="#FF6B4A" destaque sub={`de ${fmtH(d.horas_previstas)} previstas`} />
                  <Kpi label="Pessoas impactadas" value={fmtN(d.pessoas_impactadas)}
                    sub={d.alcance_percentual ? `${d.alcance_percentual}% do previsto` : ""} />
                  <Kpi label="Taxa de conclusão" value={fmtPct(d.taxa_conclusao)}
                    color={d.taxa_conclusao >= 70 ? "#22c55e" : "#f59e0b"}
                    sub={`${fmtN(d.turmas_concluidas)} de ${fmtN(d.turmas_total)} turmas`} />
                  <Kpi label="Custo estimado*" value={fmtR(d.custo_estimado)}
                    sub="R$ 150/h por participante" />
                </div>

                <div style={roiCards}>
                  {[
                    {
                      icon: "⏱", label: "Horas × Pessoas",
                      value: `${fmtH(d.horas_realizadas)} × ${fmtN(d.pessoas_impactadas)}`,
                      desc: "Volume total de aprendizagem entregue",
                    },
                    {
                      icon: "🎯", label: "Alcance da meta",
                      value: d.alcance_percentual ? `${d.alcance_percentual}%` : "—",
                      desc: "Participantes reais vs. previstos",
                    },
                    {
                      icon: "✅", label: "Turmas concluídas",
                      value: `${fmtN(d.turmas_concluidas)} / ${fmtN(d.turmas_total)}`,
                      desc: "Execução do planejamento",
                    },
                  ].map((item) => (
                    <div key={item.label} style={roiCard}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#0B1220" }}>{item.value}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#374151",
                        margin: "4px 0 2px" }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>{item.desc}</div>
                    </div>
                  ))}
                </div>

                <div style={{ ...alertInfo }}>
                  * O custo estimado usa R$ 150/h por participante como referência de mercado
                  (T&D Brasil 2024). Configure um valor real nas preferências do sistema para
                  cálculos mais precisos.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PortalShell>
  );
}

/* ─── styles ────────────────────────────────────────────────────────────────── */
const page        = { padding: "28px 32px", maxWidth: 1200, margin: "0 auto" };
const tabBar      = { display: "flex", gap: 8, margin: "24px 0 20px", flexWrap: "wrap" };
const tabBtn      = (a) => ({
  padding: "10px 18px", border: "none", borderRadius: 8, cursor: "pointer",
  fontWeight: 700, fontSize: 13,
  background: a ? "#0B1220" : "#f3f4f6",
  color: a ? "#fff" : "#374151",
});
const alertErr    = { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca",
                      borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 };
const alertInfo   = { background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd",
                      borderRadius: 8, padding: "12px 16px", marginTop: 20, fontSize: 13 };
const emptyMsg    = { textAlign: "center", color: "#9ca3af", padding: "40px 0", fontSize: 14 };
const kpiRow      = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))",
                      gap: 16, marginBottom: 24 };
const kpiCard     = { background: "#fff", borderRadius: 12, padding: "18px 20px",
                      boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const section     = { background: "#fff", borderRadius: 14, padding: "20px 22px",
                      boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };
const sectionTitle = { fontSize: 14, fontWeight: 800, color: "#0B1220", margin: "0 0 16px" };
const twoCol      = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };
// NPS
const npsLayout   = { display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 };
const npsBreakdown = { marginTop: 16, display: "flex", flexDirection: "column", gap: 12 };
const npsItem     = { display: "flex", alignItems: "center", gap: 10 };
const npsDot      = { width: 10, height: 10, borderRadius: 999, flexShrink: 0 };
// Table
const tableWrap   = { overflowX: "auto" };
const table       = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th          = { textAlign: "left", padding: "8px 12px", background: "#f9fafb",
                      fontWeight: 700, color: "#6b7280", fontSize: 11,
                      textTransform: "uppercase", letterSpacing: 0.5,
                      borderBottom: "1px solid #e5e7eb" };
const td          = { padding: "10px 12px", borderBottom: "1px solid #f3f4f6",
                      color: "#374151" };
// ROI
const roiCards    = { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 16 };
const roiCard     = { background: "#fff", borderRadius: 14, padding: "22px 24px",
                      boxShadow: "0 1px 4px rgba(0,0,0,.06)", textAlign: "center" };
