"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../components/PortalShell";
import { apiFetch, getStoredUser } from "../../services/api";

function normalize(v) { return String(v || "").trim().toLowerCase(); }
function fmtH(v) { return v != null ? `${Number(v).toLocaleString("pt-BR")}h` : "—"; }
function fmtN(v) { return v != null ? Number(v).toLocaleString("pt-BR") : "—"; }
function fmtPct(v) { return v != null ? `${v}%` : "—"; }

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

/* ─── Barra simples ─────────────────────────────────────────────────────────── */
function MiniBar({ label, value, max, color = "#FF6B4A" }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12,
        color: "#374151", marginBottom: 3 }}>
        <span style={{ maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ fontWeight: 700 }}>{fmtH(value)}</span>
      </div>
      <div style={{ height: 6, background: "#f3f4f6", borderRadius: 999 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color,
          borderRadius: 999, transition: "width .4s" }} />
      </div>
    </div>
  );
}

/* ─── KPI Card ──────────────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, color = "#0B1220", icon }) {
  return (
    <div style={kpiCard}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {icon && <span style={{ fontSize: 24, lineHeight: 1 }}>{icon}</span>}
        <div>
          <div style={{ fontSize: 30, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, marginTop: 4 }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

/* ─── NPS Badge ─────────────────────────────────────────────────────────────── */
function NpsBadge({ score }) {
  if (score == null) return <span style={{ color: "#9ca3af", fontSize: 13 }}>Sem dados</span>;
  const color = score >= 50 ? "#166534" : score >= 0 ? "#92400e" : "#991b1b";
  const bg    = score >= 50 ? "#dcfce7" : score >= 0 ? "#fef3c7" : "#fef2f2";
  const label = score >= 75 ? "Excelente" : score >= 50 ? "Ótimo" : score >= 25 ? "Bom" : score >= 0 ? "Regular" : "Crítico";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ fontSize: 42, fontWeight: 900, color }}>{score}</div>
      <div>
        <span style={{ background: bg, color, fontSize: 11, fontWeight: 800,
          padding: "3px 8px", borderRadius: 999 }}>{label}</span>
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>escala -100 a 100</div>
      </div>
    </div>
  );
}

/* ─── main ──────────────────────────────────────────────────────────────────── */
export default function InicioPage() {
  const router = useRouter();
  const user   = getStoredUser();
  const perfil = normalize(user?.perfil);
  const isGestor = ["coordenador", "supervisor", "superintendente", "super_admin"].includes(perfil);

  const [resumo,  setResumo]  = useState(null);
  const [horas,   setHoras]   = useState(null);
  const [turmas,  setTurmas]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState("");

  useEffect(() => {
    async function load() {
      try {
        if (isGestor) {
          const [r, h, t] = await Promise.all([
            apiFetch("/analytics/resumo").catch(() => null),
            apiFetch("/analytics/horas").catch(() => null),
            apiFetch("/treinamentos").catch(() => []),
          ]);
          setResumo(r);
          setHoras(h);
          setTurmas(Array.isArray(t) ? t.slice(0, 8) : []);
        } else {
          const t = await apiFetch("/minhas-turmas").catch(() => []);
          setTurmas(Array.isArray(t) ? t.slice(0, 8) : []);
        }
      } catch (err) {
        setErro(err.message || "Erro ao carregar dados.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isGestor]);

  /* Gráfico de horas por mês ─────────────────────────────── */
  const chartMeses = useMemo(() => {
    if (!horas?.por_mes?.length) return [];
    const mapa = {};
    horas.por_mes.forEach((m) => { mapa[`${m.ano}-${m.mes}`] = m.horas; });
    const agora = new Date();
    const result = [];
    for (let i = 11; i >= 0; i--) {
      const d   = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      result.push({ label: MESES[d.getMonth()], horas: mapa[key] || 0 });
    }
    return result;
  }, [horas]);

  const maxHorasMes = useMemo(
    () => Math.max(...chartMeses.map((m) => m.horas), 1),
    [chartMeses]
  );

  const porStatus = useMemo(() => {
    if (!resumo?.por_status) return [];
    return Object.entries(resumo.por_status)
      .sort((a, b) => b[1] - a[1]);
  }, [resumo]);

  /* ─── render ─────────────────────────────────────────────── */
  return (
    <PortalShell>
      <div style={page}>
        {/* Header */}
        <div style={pageHeader}>
          <div>
            <h1 style={titulo}>
              Bom dia, {user?.nome?.split(" ")[0] || "bem-vindo"} 👋
            </h1>
            <p style={sub}>
              {isGestor
                ? "Visão executiva do Portal T&D — indicadores do seu ambiente"
                : "Suas turmas e atividades"}
            </p>
          </div>
          {isGestor && (
            <button style={btnIndicadores} onClick={() => router.push("/indicadores")}>
              📊 Ver indicadores completos →
            </button>
          )}
        </div>

        {erro && <div style={alertErr}>{erro}</div>}

        {loading ? (
          <div style={empty}>Carregando dashboard…</div>
        ) : (
          <>
            {/* KPIs — só para gestores */}
            {isGestor && resumo && (
              <div style={kpiGrid}>
                <KpiCard
                  icon="⏱"
                  label="Horas treinadas"
                  value={fmtH(resumo.horas_total)}
                  sub={`de ${fmtH(resumo.horas_previstas)} previstas`}
                  color="#FF6B4A"
                />
                <KpiCard
                  icon="🎓"
                  label="Turmas"
                  value={fmtN(resumo.turmas_total)}
                  sub={`${fmtN(resumo.turmas_concluidas)} concluídas`}
                />
                <KpiCard
                  icon="👥"
                  label="Participantes únicos"
                  value={fmtN(resumo.participantes_unicos)}
                />
                <KpiCard
                  icon="⭐"
                  label="NPS médio"
                  value={resumo.nps_score != null ? resumo.nps_score : "—"}
                  sub={resumo.taxa_presenca != null ? `Presença: ${fmtPct(resumo.taxa_presenca)}` : ""}
                  color={resumo.nps_score >= 50 ? "#166534" : resumo.nps_score >= 0 ? "#92400e" : "#0B1220"}
                />
              </div>
            )}

            <div style={contentGrid}>
              {/* Gráfico de horas por mês */}
              {isGestor && chartMeses.length > 0 && (
                <div style={card}>
                  <h3 style={cardTitle}>Horas treinadas — últimos 12 meses</h3>
                  <div style={barChart}>
                    {chartMeses.map((m, i) => (
                      <div key={i} style={barCol}>
                        <div style={barColInner}>
                          <div
                            style={{
                              ...bar,
                              height: `${maxHorasMes > 0 ? Math.round((m.horas / maxHorasMes) * 100) : 0}%`,
                              background: m.horas > 0 ? "#FF6B4A" : "#f3f4f6",
                            }}
                            title={`${m.label}: ${m.horas}h`}
                          />
                        </div>
                        <div style={barLabel}>{m.label}</div>
                        {m.horas > 0 && <div style={barValue}>{m.horas}h</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top clientes por horas */}
              {isGestor && horas?.por_cliente?.length > 0 && (
                <div style={card}>
                  <h3 style={cardTitle}>Horas por cliente / operação</h3>
                  <div style={{ paddingTop: 8 }}>
                    {horas.por_cliente.slice(0, 6).map((c) => (
                      <MiniBar
                        key={c.cliente}
                        label={c.cliente}
                        value={c.horas}
                        max={horas.por_cliente[0]?.horas || 1}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Turmas por status */}
              {isGestor && porStatus.length > 0 && (
                <div style={card}>
                  <h3 style={cardTitle}>Turmas por status</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 8 }}>
                    {porStatus.map(([status, total]) => {
                      const maxVal = porStatus[0][1];
                      const pct = maxVal > 0 ? Math.round((total / maxVal) * 100) : 0;
                      const cor = normalize(status).includes("conclui") ? "#22c55e"
                        : normalize(status).includes("andamento") ? "#3b82f6"
                        : "#9ca3af";
                      return (
                        <div key={status}>
                          <div style={{ display: "flex", justifyContent: "space-between",
                            fontSize: 12, marginBottom: 3 }}>
                            <span style={{ color: "#374151" }}>{status}</span>
                            <span style={{ fontWeight: 700, color: "#0B1220" }}>{total}</span>
                          </div>
                          <div style={{ height: 6, background: "#f3f4f6", borderRadius: 999 }}>
                            <div style={{ height: "100%", width: `${pct}%`,
                              background: cor, borderRadius: 999 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Últimas turmas */}
              <div style={{ ...card, gridColumn: isGestor ? "1 / -1" : "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 14 }}>
                  <h3 style={{ ...cardTitle, margin: 0 }}>
                    {isGestor ? "Turmas recentes" : "Minhas turmas"}
                  </h3>
                  <button style={btnLink}
                    onClick={() => router.push(isGestor ? "/treinamentos" : "/minhas-turmas")}>
                    Ver todas →
                  </button>
                </div>
                {turmas.length === 0 ? (
                  <div style={emptySmall}>Nenhuma turma encontrada.</div>
                ) : (
                  <div style={turmaList}>
                    {turmas.map((t) => {
                      const conc = normalize(t.status).includes("conclui");
                      const and  = normalize(t.status).includes("andamento");
                      const cor  = conc ? "#22c55e" : and ? "#3b82f6" : "#9ca3af";
                      return (
                        <div key={t.id} style={turmaRow}
                          onClick={() => router.push(`/turma/${t.id}`)}
                          onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "#0B1220" }}>{t.tema}</div>
                            <div style={{ fontSize: 12, color: "#9ca3af" }}>
                              {[t.cliente, t.instrutor].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px",
                            borderRadius: 999, background: `${cor}20`, color: cor,
                            whiteSpace: "nowrap" }}>
                            {t.status || "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </PortalShell>
  );
}

/* ─── styles ────────────────────────────────────────────────────────────────── */
const page        = { padding: "28px 32px", maxWidth: 1200, margin: "0 auto" };
const pageHeader  = { display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start", marginBottom: 28 };
const titulo      = { fontSize: 26, fontWeight: 900, color: "#0B1220", margin: 0 };
const sub         = { fontSize: 14, color: "#9ca3af", marginTop: 4 };
const alertErr    = { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca",
                      borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 };
const empty       = { textAlign: "center", color: "#9ca3af", padding: "60px 0", fontSize: 14 };
const emptySmall  = { textAlign: "center", color: "#9ca3af", padding: "20px 0", fontSize: 13 };
const kpiGrid     = { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 };
const kpiCard     = { background: "#fff", borderRadius: 14, padding: "18px 20px",
                      boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const contentGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 20 };
const card        = { background: "#fff", borderRadius: 14, padding: "20px 22px",
                      boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const cardTitle   = { fontSize: 14, fontWeight: 800, color: "#0B1220", margin: "0 0 14px" };

// Bar chart
const barChart    = { display: "flex", alignItems: "flex-end", gap: 6, height: 110,
                      paddingTop: 8 };
const barCol      = { flex: 1, display: "flex", flexDirection: "column",
                      alignItems: "center" };
const barColInner = { width: "100%", height: 80, display: "flex",
                      alignItems: "flex-end" };
const bar         = { width: "100%", borderRadius: "4px 4px 0 0",
                      minHeight: 2, transition: "height .4s" };
const barLabel    = { fontSize: 9, color: "#9ca3af", marginTop: 3 };
const barValue    = { fontSize: 9, color: "#FF6B4A", fontWeight: 700 };

// Turmas
const turmaList   = { display: "flex", flexDirection: "column", gap: 4 };
const turmaRow    = { display: "flex", alignItems: "center", gap: 12, padding: "10px 8px",
                      borderRadius: 8, cursor: "pointer", transition: "background .15s" };

// Buttons
const btnIndicadores = { padding: "10px 18px", background: "#0B1220", color: "#fff",
                          border: "none", borderRadius: 8, cursor: "pointer",
                          fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" };
const btnLink        = { background: "none", border: "none", color: "#FF6B4A",
                          cursor: "pointer", fontSize: 13, fontWeight: 700,
                          padding: 0 };
