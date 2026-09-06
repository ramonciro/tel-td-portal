"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
import { apiFetch, apiDownload } from "../../services/api";
import { colors, card as cardStyle } from "../../lib/theme";

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function fmtH(v)   { return v != null ? `${Number(v).toLocaleString("pt-BR")}h` : "—"; }
function fmtN(v)   { return v != null ? Number(v).toLocaleString("pt-BR") : "—"; }
function fmtPct(v) { return v != null ? `${v}%` : "—"; }
function fmtR(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

/* ─── HBar — barra horizontal idêntica ao padrão do portal ───────────────── */
function HBar({ label, value, max, cor = colors.accent, direita }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between",
        fontSize: 12.5, color: colors.textPrimary, marginBottom: 4, fontWeight: 500 }}>
        <span style={{ maxWidth: "65%", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontWeight: 700, color: cor }}>{direita ?? value}</span>
      </div>
      <div style={{ height: 6, background: colors.borderLight ?? "#f0f2f5", borderRadius: 999 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cor,
          borderRadius: 999, transition: "width .4s" }} />
      </div>
    </div>
  );
}

/* ─── Barras verticais inline ─────────────────────────────────────────────── */
function VBars({ items, cor = colors.accent }) {
  const max = Math.max(...items.map((i) => i.v || 0), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6,
      height: 100, paddingTop: 4, overflowX: "auto" }}>
      {items.map((item, i) => {
        const pct = Math.round(((item.v || 0) / max) * 100);
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column",
            alignItems: "center", minWidth: 28, flex: 1 }}>
            <div style={{ fontSize: 9, color: cor, fontWeight: 700,
              height: 12, textAlign: "center" }}>
              {item.v > 0 ? item.v : ""}
            </div>
            <div style={{ width: "100%", height: 72, display: "flex",
              alignItems: "flex-end" }}>
              <div style={{ width: "100%",
                height: `${pct}%`, minHeight: item.v > 0 ? 2 : 0,
                background: item.v > 0 ? cor : colors.borderLight ?? "#f0f2f5",
                borderRadius: "3px 3px 0 0", transition: "height .4s" }} />
            </div>
            <div style={{ fontSize: 8.5, color: colors.textSecondary,
              marginTop: 3, textAlign: "center" }}>
              {item.l}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── NPS gauge ───────────────────────────────────────────────────────────── */
function NpsGauge({ score, total }) {
  if (score == null) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0",
        color: colors.textSecondary, fontSize: 13 }}>
        Nenhuma avaliação NPS registrada ainda.
      </div>
    );
  }
  const cor = score >= 50 ? colors.success : score >= 0 ? colors.warning : colors.danger;
  const pct = Math.round(((score + 100) / 200) * 100);
  const cat = score >= 75 ? "Excelente" : score >= 50 ? "Ótimo"
            : score >= 25 ? "Bom"       : score >= 0  ? "Regular" : "Crítico";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 60, fontWeight: 900, color: cor, lineHeight: 1 }}>{score}</div>
      <div style={{ fontSize: 12, color: colors.textSecondary, margin: "4px 0 16px" }}>
        NPS Score · {total} respostas
      </div>
      <div style={{ position: "relative", height: 10, maxWidth: 260, margin: "0 auto",
        background: "linear-gradient(to right, #ef4444, #f97316, #f59e0b, #84cc16, #22c55e)",
        borderRadius: 999 }}>
        <div style={{ position: "absolute", top: -5, left: `${pct}%`,
          transform: "translateX(-50%)", width: 20, height: 20,
          borderRadius: 999, background: "#fff",
          border: `3px solid ${cor}`, boxShadow: "0 2px 6px rgba(0,0,0,.15)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between",
        maxWidth: 260, margin: "5px auto 12px", fontSize: 10, color: colors.textSecondary }}>
        <span>-100</span><span>0</span><span>+100</span>
      </div>
      <span style={{ display: "inline-block", padding: "5px 14px",
        background: `${cor}20`, color: cor, fontWeight: 800,
        fontSize: 12, borderRadius: 999 }}>{cat}</span>
    </div>
  );
}

/* ─── TABS ─────────────────────────────────────────────────────────────────── */
const TABS = [
  { id: "horas",        label: "Horas treinadas", endpoint: "/analytics/horas" },
  { id: "nps",          label: "NPS",             endpoint: "/analytics/nps" },
  { id: "efetividade",  label: "Efetividade",     endpoint: "/analytics/efetividade" },
  { id: "roi",          label: "ROI",             endpoint: "/analytics/roi" },
];

/* ─── main ─────────────────────────────────────────────────────────────────── */
export default function IndicadoresPage() {
  const [resumo,    setResumo]    = useState(null);
  const [activeTab, setActiveTab] = useState("horas");
  const [tabData,   setTabData]   = useState({});
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [exportando, setExportando] = useState(false);

  // Filtro de recorte (cliente/operação e período) — antes a tela não tinha
  // nenhum filtro, então não dava pra isolar "NPS do último trimestre" ou
  // "efetividade só do cliente X" sem sair da tela.
  const [filtros, setFiltros] = useState({ cliente: "", data_inicio: "", data_fim: "" });

  function queryString() {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }

  // Carrega resumo global para o PageHero (e a lista de clientes do filtro)
  useEffect(() => {
    const qs = queryString();
    apiFetch(qs ? `/analytics/resumo?${qs}` : "/analytics/resumo")
      .then(setResumo)
      .catch(() => null);
  }, [filtros]);

  // Muda o filtro → invalida o cache das abas, pra todas recarregarem com o
  // novo recorte na próxima vez que forem abertas.
  useEffect(() => {
    setTabData({});
  }, [filtros]);

  // Carrega dados da aba ativa (com cache por aba+filtro)
  useEffect(() => {
    const tab = TABS.find((t) => t.id === activeTab);
    if (!tab || tabData[activeTab]) return;
    setLoading(true);
    setError("");
    const qs = queryString();
    apiFetch(qs ? `${tab.endpoint}?${qs}` : tab.endpoint)
      .then((d) => setTabData((prev) => ({ ...prev, [activeTab]: d })))
      .catch((err) => setError(err.message || "Erro ao carregar dados."))
      .finally(() => setLoading(false));
  }, [activeTab, tabData, filtros]);

  async function handleExportar() {
    try {
      setExportando(true);
      const qs = queryString();
      const params = qs ? `aba=${activeTab}&${qs}` : `aba=${activeTab}`;
      await apiDownload(`/analytics/exportar?${params}`, `indicadores-${activeTab}.xlsx`);
    } catch (err) {
      setError(err.message || "Erro ao exportar indicadores.");
    } finally {
      setExportando(false);
    }
  }

  const d = tabData[activeTab];

  // Faróis acionáveis — turmas/clientes que merecem atenção primeiro, para
  // não depender de olhar tabela por tabela pra achar o que está fora da
  // curva (mesmo espírito dos faróis já usados no Dashboard).
  const farolNps = activeTab === "nps" && d?.por_turma
    ? d.por_turma.filter((t) => Number(t.media) < 6).slice(0, 4)
    : [];
  const farolEfetividade = activeTab === "efetividade" && d?.por_cliente
    ? d.por_cliente.filter((c) => {
        const avaliados = Number(c.avaliados) || 0;
        const aprovados = Number(c.aprovados) || 0;
        return avaliados >= 3 && Math.round((aprovados / avaliados) * 100) < 70;
      }).slice(0, 4)
    : [];

  return (
    <PortalShell>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 0 40px" }}>

        <PageHero
          eyebrow="T&D · Analytics"
          title="Indicadores"
          subtitle="Horas treinadas, NPS, efetividade e ROI do seu ambiente"
          stats={resumo ? [
            { label: "Horas realizadas", value: fmtH(resumo.horas_total) },
            { label: "Participantes",    value: fmtN(resumo.participantes_unicos) },
            { label: "NPS",              value: resumo.nps_score != null ? String(resumo.nps_score) : "—" },
            { label: "Presença média",   value: fmtPct(resumo.taxa_presenca) },
          ] : []}
        />

        <div style={{ padding: "0 24px" }}>

          {/* Filtro de recorte */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end",
            margin: "20px 0 0" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary }}>
              Cliente / operação
              <select value={filtros.cliente}
                onChange={(e) => setFiltros((prev) => ({ ...prev, cliente: e.target.value }))}
                style={filtroInput}>
                <option value="">Todos</option>
                {(resumo?.clientes || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary }}>
              De
              <input type="date" style={filtroInput} value={filtros.data_inicio}
                onChange={(e) => setFiltros((prev) => ({ ...prev, data_inicio: e.target.value }))} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary }}>
              Até
              <input type="date" style={filtroInput} value={filtros.data_fim}
                onChange={(e) => setFiltros((prev) => ({ ...prev, data_fim: e.target.value }))} />
            </label>
            {(filtros.cliente || filtros.data_inicio || filtros.data_fim) && (
              <button type="button" onClick={() => setFiltros({ cliente: "", data_inicio: "", data_fim: "" })}
                style={btnLimparFiltro}>
                Limpar filtros
              </button>
            )}
            <button type="button" onClick={handleExportar} disabled={exportando || !d} style={btnExportar}>
              {exportando ? "Exportando..." : "Exportar Excel"}
            </button>
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 4, margin: "16px 0 20px",
            borderBottom: `2px solid ${colors.borderLight ?? "#f0f2f5"}`,
            paddingBottom: 0 }}>
            {TABS.map((t) => {
              const active = activeTab === t.id;
              return (
                <button key={t.id}
                  onClick={() => { setActiveTab(t.id); setError(""); }}
                  style={{ padding: "10px 18px", border: "none", cursor: "pointer",
                    fontWeight: active ? 800 : 600, fontSize: 13.5,
                    background: "transparent",
                    color: active ? colors.accent : colors.textSecondary,
                    borderBottom: active ? `2px solid ${colors.accent}` : "2px solid transparent",
                    marginBottom: -2, borderRadius: "6px 6px 0 0",
                    transition: "color .15s" }}>
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: "#fef2f2", color: "#991b1b",
              border: "1px solid #fecaca", borderRadius: 8,
              padding: "12px 16px", marginBottom: 16, fontSize: 13.5 }}>
              {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: "center", color: colors.textSecondary,
              padding: "48px 0", fontSize: 13 }}>
              Carregando…
            </div>
          )}

          {!loading && d && (
            <div>

              {/* ── HORAS ──────────────────────────────────────────────── */}
              {activeTab === "horas" && (
                <>
                  <div style={kpiRow}>
                    <StatCard title="Horas realizadas"
                      value={fmtH(d.total)}
                      subtitle="turmas concluídas"
                      accent={colors.accent} />
                    <StatCard title="Clientes / operações"
                      value={String(d.por_cliente?.length ?? "—")} />
                    <StatCard title="Instrutores"
                      value={String(d.por_instrutor?.length ?? "—")} />
                  </div>

                  {d.por_mes?.length > 0 && (
                    <div style={section}>
                      <p style={sectionTitle}>Horas treinadas — últimos 12 meses</p>
                      <VBars cor={colors.accent}
                        items={(() => {
                          const agora = new Date();
                          return Array.from({ length: 12 }, (_, i) => {
                            const dt = new Date(agora.getFullYear(), agora.getMonth() - 11 + i, 1);
                            const found = d.por_mes.find(
                              (m) => Number(m.ano) === dt.getFullYear() &&
                                     Number(m.mes) === dt.getMonth() + 1
                            );
                            return { l: MESES_ABREV[dt.getMonth()], v: found?.horas || 0 };
                          });
                        })()}
                      />
                    </div>
                  )}

                  <div style={twoCol}>
                    {d.por_cliente?.length > 0 && (
                      <div style={section}>
                        <p style={sectionTitle}>Por cliente / operação</p>
                        {d.por_cliente.slice(0, 8).map((r) => (
                          <HBar key={r.cliente} label={r.cliente}
                            value={r.horas} max={d.por_cliente[0].horas}
                            direita={fmtH(r.horas)} />
                        ))}
                      </div>
                    )}
                    {d.por_instrutor?.length > 0 && (
                      <div style={section}>
                        <p style={sectionTitle}>Por instrutor</p>
                        {d.por_instrutor.slice(0, 8).map((r) => (
                          <HBar key={r.instrutor} label={r.instrutor}
                            value={r.horas} max={d.por_instrutor[0].horas}
                            cor={colors.navy ?? "#0B1220"}
                            direita={fmtH(r.horas)} />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── NPS ────────────────────────────────────────────────── */}
              {activeTab === "nps" && (
                <>
                  {farolNps.length > 0 && (
                    <div style={farolBox}>
                      <p style={farolTitulo}>Turmas com NPS crítico — vale olhar primeiro</p>
                      {farolNps.map((t) => (
                        <div key={t.tema} style={farolLinha}>
                          {t.tema}{t.cliente ? ` · ${t.cliente}` : ""} — nota média {t.media} ({t.respostas} resposta{t.respostas === 1 ? "" : "s"})
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={twoCol}>
                    <div style={section}>
                      <p style={sectionTitle}>Score NPS</p>
                      <NpsGauge score={d.score} total={d.total} />
                      {d.total > 0 && (
                        <div style={{ marginTop: 20, display: "flex",
                          flexDirection: "column", gap: 10 }}>
                          {[
                            { l: "Promotores (9–10)", v: d.promotores, cor: colors.success },
                            { l: "Neutros (7–8)",     v: d.neutros,    cor: colors.warning },
                            { l: "Detratores (0–6)",  v: d.detratores, cor: colors.danger },
                          ].map((item) => (
                            <HBar key={item.l} label={item.l} value={item.v}
                              max={d.total} cor={item.cor}
                              direita={`${item.v} (${d.total > 0 ? Math.round((item.v/d.total)*100) : 0}%)`}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {d.tendencia?.length > 0 && (
                        <div style={section}>
                          <p style={sectionTitle}>Tendência — últimos 6 meses</p>
                          <VBars cor="#3b82f6"
                            items={d.tendencia.map((t) => ({
                              l: MESES_ABREV[(Number(t.mes) || 1) - 1],
                              v: Number((t.media || 0).toFixed(1)),
                            }))}
                          />
                        </div>
                      )}
                      {d.por_turma?.length > 0 && (
                        <div style={section}>
                          <p style={sectionTitle}>NPS por turma</p>
                          {d.por_turma.slice(0, 6).map((t) => (
                            <HBar key={t.tema}
                              label={`${t.tema}${t.cliente ? ` · ${t.cliente}` : ""}`}
                              value={Number(t.media)} max={10}
                              cor={colors.accent}
                              direita={`${t.media} (${t.respostas} resp.)`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ── EFETIVIDADE ────────────────────────────────────────── */}
              {activeTab === "efetividade" && (
                <>
                  {farolEfetividade.length > 0 && (
                    <div style={farolBox}>
                      <p style={farolTitulo}>Clientes com aprovação abaixo de 70% — vale olhar primeiro</p>
                      {farolEfetividade.map((c) => (
                        <div key={c.cliente} style={farolLinha}>
                          {c.cliente} — {Math.round((Number(c.aprovados) / Number(c.avaliados)) * 100)}% de aprovação ({c.avaliados} avaliados)
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={kpiRow}>
                    <StatCard title="Taxa de aprovação"
                      value={fmtPct(d.taxa_aprovacao)}
                      subtitle={`${fmtN(d.total_avaliados)} avaliados`}
                      accent={colors.success} />
                    <StatCard title="Nota média (prova)"
                      value={d.media_prova != null ? String(d.media_prova) : "—"} />
                    <StatCard title="Taxa de presença"
                      value={fmtPct(d.presenca?.taxa)}
                      subtitle={d.presenca?.total > 0
                        ? `${fmtN(d.presenca.presentes)} presenças`
                        : "sem registros"}
                      accent={d.presenca?.taxa >= 75 ? colors.success : colors.warning} />
                  </div>

                  {d.por_cliente?.length > 0 && (
                    <div style={section}>
                      <p style={sectionTitle}>Efetividade por cliente / operação</p>
                      <div style={{ overflowX: "auto" }}>
                        <table style={tbl}>
                          <thead>
                            <tr>
                              {["Cliente", "Turmas", "Avaliados", "Nota média", "% Aprovados"].map((h) => (
                                <th key={h} style={th}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {d.por_cliente.map((r) => {
                              const taxa = r.avaliados > 0
                                ? Math.round((r.aprovados / r.avaliados) * 100) : null;
                              const taxaCor = taxa == null ? colors.textSecondary
                                : taxa >= 70 ? colors.success : colors.danger;
                              return (
                                <tr key={r.cliente}
                                  style={{ borderBottom: `1px solid ${colors.borderLight ?? "#f0f2f5"}` }}>
                                  <td style={td}>{r.cliente}</td>
                                  <td style={{ ...td, textAlign: "center" }}>{r.turmas}</td>
                                  <td style={{ ...td, textAlign: "center" }}>{r.avaliados || "—"}</td>
                                  <td style={{ ...td, textAlign: "center" }}>{r.media_prova || "—"}</td>
                                  <td style={{ ...td, textAlign: "center",
                                    fontWeight: 700, color: taxaCor }}>
                                    {taxa != null ? `${taxa}%` : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── ROI ────────────────────────────────────────────────── */}
              {activeTab === "roi" && (
                <>
                  <div style={kpiRow}>
                    <StatCard title="Horas realizadas"
                      value={fmtH(d.horas_realizadas)}
                      subtitle={`de ${fmtH(d.horas_previstas)} previstas`}
                      accent={colors.accent} />
                    <StatCard title="Pessoas impactadas"
                      value={fmtN(d.pessoas_impactadas)}
                      subtitle={d.alcance_percentual
                        ? `${d.alcance_percentual}% do previsto` : ""} />
                    <StatCard title="Taxa de conclusão"
                      value={fmtPct(d.taxa_conclusao)}
                      subtitle={`${fmtN(d.turmas_concluidas)} de ${fmtN(d.turmas_total)} turmas`}
                      accent={d.taxa_conclusao >= 70 ? colors.success : colors.warning} />
                    <StatCard title="Custo estimado*"
                      value={fmtR(d.custo_estimado)} />
                  </div>

                  <div style={twoCol}>
                    <div style={section}>
                      <p style={sectionTitle}>Volume de aprendizagem</p>
                      {[
                        { l: "Horas realizadas",    v: d.horas_realizadas,   max: d.horas_previstas,    suf: "h" },
                        { l: "Pessoas impactadas",  v: d.pessoas_impactadas, max: d.pessoas_previstas,  suf: "" },
                        { l: "Turmas concluídas",   v: d.turmas_concluidas,  max: d.turmas_total,       suf: "" },
                      ].map((item) => (
                        <HBar key={item.l} label={item.l}
                          value={item.v} max={item.max || item.v || 1}
                          direita={`${item.v}${item.suf} / ${item.max ?? "?"}${item.suf}`}
                        />
                      ))}
                    </div>

                    <div style={section}>
                      <p style={sectionTitle}>Referência de custo</p>
                      <p style={{ fontSize: 13, color: colors.textSecondary,
                        lineHeight: 1.6, margin: "0 0 12px" }}>
                        O custo estimado usa <strong>{fmtR(d.custo_por_hora)}/h por participante</strong>{d.custo_por_hora === 150
                          ? " como referência de mercado (T&D Brasil 2024)."
                          : ", valor configurado para este tenant."}
                      </p>
                      {[
                        { l: "Horas × participantes", v: `${fmtH(d.horas_realizadas)} × ${fmtN(d.pessoas_impactadas)}` },
                        { l: "Custo total estimado",  v: fmtR(d.custo_estimado) },
                        { l: "Alcance da meta",       v: fmtPct(d.alcance_percentual) },
                      ].map((item) => (
                        <div key={item.l} style={{ display: "flex", justifyContent: "space-between",
                          padding: "8px 0",
                          borderBottom: `1px solid ${colors.borderLight ?? "#f0f2f5"}`,
                          fontSize: 13 }}>
                          <span style={{ color: colors.textSecondary }}>{item.l}</span>
                          <span style={{ fontWeight: 700, color: colors.textPrimary }}>{item.v}</span>
                        </div>
                      ))}
                      <p style={{ fontSize: 11, color: colors.textSecondary, marginTop: 12 }}>
                        * Configurável em Admin → tenant → "Custo por hora de treinamento".
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

/* ─── styles ─────────────────────────────────────────────────────────────── */
const kpiRow     = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, marginBottom: 20 };
const section    = { background: "#fff", borderRadius: 14, padding: "20px 22px", boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };
const sectionTitle = { fontSize: 13, fontWeight: 700, color: "#374151", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: ".04em" };
const twoCol     = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 };
const tbl        = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th         = { textAlign: "left", padding: "8px 12px", background: "#f9fafb", fontWeight: 700, color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 };
const td         = { padding: "10px 12px", color: "#374151" };
const filtroInput = { border: "1px solid #cbd5e1", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "#fff", color: "#0f172a", minWidth: 160 };
const btnLimparFiltro = { border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", borderRadius: 10, padding: "8px 12px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" };
const btnExportar = { border: "1px solid #cbd5e1", background: "#fff", color: colors.accent, borderRadius: 10, padding: "8px 12px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", marginLeft: "auto" };
const farolBox = { borderRadius: 14, border: "1px solid #fecaca", background: "#fff1f2", padding: "12px 16px", marginBottom: 16 };
const farolTitulo = { fontSize: 12, fontWeight: 800, color: "#991b1b", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 };
const farolLinha = { fontSize: 13, color: "#7f1d1d", padding: "4px 0" };
