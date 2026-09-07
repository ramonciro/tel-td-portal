"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
import { ContadorAnimado, BarraHorizontal, GraficoLinha, Donut } from "../../components/Charts";
import { apiFetch, apiDownload } from "../../services/api";
import { colors, chart, card as cardStyle } from "../../lib/theme";

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function fmtH(v)   { return v != null ? `${Number(v).toLocaleString("pt-BR")}h` : "—"; }
function fmtN(v)   { return v != null ? Number(v).toLocaleString("pt-BR") : "—"; }
function fmtPct(v) { return v != null ? `${v}%` : "—"; }
function fmtR(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/* ─── NPS gauge — mantido como componente especializado (valor único com
   faixa -100/+100), não é um dos tipos de gráfico da biblioteca ─────────── */
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

  // Cascata de entrada — replay a cada troca de aba (mesmo padrão de
  // /inicio, /rs e /dashboard). Reseta quando a aba muda ou recarrega, e só
  // dispara quando os dados da aba já chegaram.
  const [revelado, setRevelado] = useState(false);
  useEffect(() => {
    setRevelado(false);
    if (loading || !d) return;
    const id = requestAnimationFrame(() => setRevelado(true));
    return () => cancelAnimationFrame(id);
  }, [activeTab, loading, d]);

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

  // Tendência de horas — últimos 12 meses, no formato "AAAA-MM" que o
  // GraficoLinha espera para extrair o rótulo do mês.
  const tendenciaHoras = activeTab === "horas" && d?.por_mes ? (() => {
    const agora = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const dt = new Date(agora.getFullYear(), agora.getMonth() - 11 + i, 1);
      const found = d.por_mes.find(
        (m) => Number(m.ano) === dt.getFullYear() && Number(m.mes) === dt.getMonth() + 1
      );
      return { mes: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`, horas: found?.horas || 0 };
    });
  })() : [];

  // Tendência de NPS — últimos 6 meses, mesmo formato.
  const tendenciaNps = activeTab === "nps" && d?.tendencia
    ? d.tendencia.map((t) => ({
        mes: `${t.ano || new Date().getFullYear()}-${String(Number(t.mes) || 1).padStart(2, "0")}`,
        media: Number(Number(t.media || 0).toFixed(1)),
      }))
    : [];

  // NPS por turma — junta tema+cliente num único rótulo pro BarraHorizontal
  // (que espera uma única chave de label).
  const turmasNps = activeTab === "nps" && d?.por_turma
    ? d.por_turma.map((t) => ({ ...t, rotulo: `${t.tema}${t.cliente ? ` · ${t.cliente}` : ""}` }))
    : [];

  // Volume de aprendizagem (ROI) — cada métrica tem seu próprio teto
  // ("previsto"), então normaliza pra % do previsto antes de escalar todas
  // no mesmo BarraHorizontal (maxValor=100), preservando os números reais
  // no subtítulo.
  const volumeAprendizagem = activeTab === "roi" && d ? [
    { label: "Horas realizadas",   valor: d.horas_realizadas,   max: d.horas_previstas,   suf: "h" },
    { label: "Pessoas impactadas", valor: d.pessoas_impactadas, max: d.pessoas_previstas, suf: "" },
    { label: "Turmas concluídas",  valor: d.turmas_concluidas,  max: d.turmas_total,      suf: "" },
  ].map((item) => {
    const max = item.max || item.valor || 1;
    const pct = Math.min(Math.round((Number(item.valor || 0) / max) * 100), 100);
    return { ...item, pct, display: `${fmtN(item.valor)}${item.suf} / ${item.max ?? "?"}${item.suf}` };
  }) : [];

  return (
    <PortalShell>
      {/* Cascata de entrada — mesmo padrão de /inicio, /rs e /dashboard. */}
      <style>{`
        @keyframes indCascade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .ind-cascade { opacity: 0; }
        .ind-cascade.ind-play { animation: indCascade .5s cubic-bezier(.16,1,.3,1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .ind-cascade, .ind-cascade.ind-play { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

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

              {/* Nota sobre `decimais` no ContadorAnimado abaixo: horas e taxas
                 aqui saem do backend com 1-2 casas decimais (ex.: 87,3% de
                 aprovação, 12,4h realizadas) — sem informar `decimais`, o
                 contador arredonda pra inteiro ao terminar de animar e o
                 valor exibido muda, não só a forma. Contagens simples
                 (nº de clientes/instrutores/pessoas) continuam sem isso. */}
              {/* ── HORAS ──────────────────────────────────────────────── */}
              {activeTab === "horas" && (
                <>
                  <div className={`ind-cascade ${revelado ? "ind-play" : ""}`} style={kpiRow}>
                    <StatCard title="Horas realizadas"
                      value={d.total != null ? <ContadorAnimado valor={d.total} decimais={2} sufixo="h" revelado={revelado} /> : "—"}
                      subtitle="turmas concluídas"
                      accent={colors.accent} />
                    <StatCard title="Clientes / operações"
                      value={<ContadorAnimado valor={d.por_cliente?.length || 0} revelado={revelado} />} />
                    <StatCard title="Instrutores"
                      value={<ContadorAnimado valor={d.por_instrutor?.length || 0} revelado={revelado} />} />
                  </div>

                  {tendenciaHoras.length > 0 && (
                    <div className={`ind-cascade ${revelado ? "ind-play" : ""}`} style={{ ...section, animationDelay: ".05s" }}>
                      <p style={sectionTitle}>Horas treinadas — últimos 12 meses</p>
                      <GraficoLinha
                        dados={tendenciaHoras}
                        linhas={[{ key: "horas", label: "Horas", cor: chart.blue, sufixo: "h" }]}
                        revelado={revelado}
                      />
                    </div>
                  )}

                  <div className={`ind-cascade ${revelado ? "ind-play" : ""}`} style={{ ...twoCol, animationDelay: ".1s" }}>
                    <div style={section}>
                      <p style={sectionTitle}>Por cliente / operação</p>
                      <BarraHorizontal
                        dados={d.por_cliente || []}
                        labelKey="cliente" valueKey="horas" sufixo="h"
                        cor={chart.blue} maxItens={8} revelado={revelado}
                      />
                    </div>
                    <div style={section}>
                      <p style={sectionTitle}>Por instrutor</p>
                      <BarraHorizontal
                        dados={d.por_instrutor || []}
                        labelKey="instrutor" valueKey="horas" sufixo="h"
                        cor={colors.navy} maxItens={8} revelado={revelado}
                      />
                    </div>
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
                  <div className={`ind-cascade ${revelado ? "ind-play" : ""}`} style={twoCol}>
                    <div style={section}>
                      <p style={sectionTitle}>Score NPS</p>
                      <NpsGauge score={d.score} total={d.total} />
                      {d.total > 0 && (
                        <div style={{ marginTop: 20 }}>
                          <Donut
                            fatias={[
                              { label: "Promotores (9–10)", valor: Number(d.promotores || 0), cor: colors.success },
                              { label: "Neutros (7–8)",     valor: Number(d.neutros || 0),    cor: colors.warning },
                              { label: "Detratores (0–6)",  valor: Number(d.detratores || 0), cor: colors.danger },
                            ]}
                            total={d.total}
                            revelado={revelado}
                          />
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {tendenciaNps.length > 0 && (
                        <div style={section}>
                          <p style={sectionTitle}>Tendência — últimos 6 meses</p>
                          <GraficoLinha
                            dados={tendenciaNps}
                            linhas={[{ key: "media", label: "NPS médio", cor: chart.blue }]}
                            revelado={revelado}
                          />
                        </div>
                      )}
                      {turmasNps.length > 0 && (
                        <div style={section}>
                          <p style={sectionTitle}>NPS por turma</p>
                          <BarraHorizontal
                            dados={turmasNps}
                            labelKey="rotulo" valueKey="media" maxValor={10}
                            cor={colors.accent} maxItens={6} revelado={revelado}
                            subtitulo={(t) => `${t.respostas} resp.`}
                          />
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
                  <div className={`ind-cascade ${revelado ? "ind-play" : ""}`} style={kpiRow}>
                    <StatCard title="Taxa de aprovação"
                      value={d.taxa_aprovacao != null ? <ContadorAnimado valor={d.taxa_aprovacao} decimais={1} sufixo="%" revelado={revelado} /> : "—"}
                      subtitle={`${fmtN(d.total_avaliados)} avaliados`}
                      accent={colors.success} />
                    <StatCard title="Nota média (prova)"
                      value={d.media_prova != null ? String(d.media_prova) : "—"} />
                    <StatCard title="Taxa de presença"
                      value={d.presenca?.taxa != null ? <ContadorAnimado valor={d.presenca.taxa} decimais={1} sufixo="%" revelado={revelado} /> : "—"}
                      subtitle={d.presenca?.total > 0
                        ? `${fmtN(d.presenca.presentes)} presenças`
                        : "sem registros"}
                      accent={d.presenca?.taxa >= 75 ? colors.success : colors.warning} />
                  </div>

                  {d.por_cliente?.length > 0 && (
                    <div className={`ind-cascade ${revelado ? "ind-play" : ""}`} style={{ ...section, animationDelay: ".05s" }}>
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
                  <div className={`ind-cascade ${revelado ? "ind-play" : ""}`} style={kpiRow}>
                    <StatCard title="Horas realizadas"
                      value={d.horas_realizadas != null ? <ContadorAnimado valor={d.horas_realizadas} decimais={2} sufixo="h" revelado={revelado} /> : "—"}
                      subtitle={`de ${fmtH(d.horas_previstas)} previstas`}
                      accent={colors.accent} />
                    <StatCard title="Pessoas impactadas"
                      value={d.pessoas_impactadas != null ? <ContadorAnimado valor={d.pessoas_impactadas} revelado={revelado} /> : "—"}
                      subtitle={d.alcance_percentual
                        ? `${d.alcance_percentual}% do previsto` : ""} />
                    <StatCard title="Taxa de conclusão"
                      value={d.taxa_conclusao != null ? <ContadorAnimado valor={d.taxa_conclusao} decimais={1} sufixo="%" revelado={revelado} /> : "—"}
                      subtitle={`${fmtN(d.turmas_concluidas)} de ${fmtN(d.turmas_total)} turmas`}
                      accent={d.taxa_conclusao >= 70 ? colors.success : colors.warning} />
                    <StatCard title="Custo estimado*"
                      value={d.custo_estimado != null ? <ContadorAnimado valor={d.custo_estimado} formatar={fmtR} revelado={revelado} /> : "—"} />
                  </div>

                  <div className={`ind-cascade ${revelado ? "ind-play" : ""}`} style={{ ...twoCol, animationDelay: ".05s" }}>
                    <div style={section}>
                      <p style={sectionTitle}>Volume de aprendizagem</p>
                      <BarraHorizontal
                        dados={volumeAprendizagem}
                        labelKey="label" valueKey="pct" maxValor={100} sufixo="%"
                        cor={colors.accent} revelado={revelado}
                        subtitulo={(item) => item.display}
                      />
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
