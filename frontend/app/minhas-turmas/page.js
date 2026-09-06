"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import { apiFetch, getStoredUser } from "../../services/api";
import { formatDateBR } from "../../lib/date";
import { colors } from "../../lib/theme";

/* ─── utils ───────────────────────────────────────────────────────────────── */
function normalize(v) { return String(v || "").trim().toLowerCase(); }
function fmtDate(v) { return formatDateBR(v, "—"); }
function fmtCH(v) { return v ? `${v}h` : null; }

function corFreq(n) {
  if (n === null || n === undefined) return { bg: "#f3f4f6", text: "#9ca3af" };
  if (n >= 90) return { bg: "#dcfce7", text: "#166534" };
  if (n >= 75) return { bg: "#fef3c7", text: "#92400e" };
  return              { bg: "#fef2f2", text: "#991b1b" };
}

function statusStyle(status) {
  const s = normalize(status);
  if (["concluído", "concluido", "concluida", "concluída"].includes(s))
    return { bg: "#dcfce7", text: "#166534" };
  if (["em andamento", "andamento", "ativo", "ativa"].includes(s))
    return { bg: "#dbeafe", text: "#1d4ed8" };
  if (["planejado", "planejada", "agendado"].includes(s))
    return { bg: "#f3f4f6", text: "#6b7280" };
  return { bg: "#fef3c7", text: "#92400e" };
}

/* ─── componente principal ────────────────────────────────────────────────── */
export default function MinhasTurmasPage() {
  const router = useRouter();
  const user   = getStoredUser();
  const perfil = normalize(user?.perfil);
  const isGestor = ["coordenador", "supervisor"].includes(perfil);

  const [turmas,      setTurmas]      = useState([]);
  const [frequencias, setFrequencias] = useState({});  // { [treinamento_id]: { percentual } }
  const [certs,       setCerts]       = useState({});   // { [treinamento_id]: cert }
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [emitindo,    setEmitindo]    = useState(null); // treinamento_id em progresso
  const [certMsg,     setCertMsg]     = useState("");

  const [search,      setSearch]      = useState("");
  const [filterStatus,setFilterStatus]= useState("todos");

  /* ─── load ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const data = await apiFetch("/minhas-turmas");
        const lista = Array.isArray(data) ? data : [];
        setTurmas(lista);

        // Busca frequências individuais em paralelo para não-gestores
        if (!isGestor && lista.length) {
          const freqResults = await Promise.allSettled(
            lista.map((t) =>
              apiFetch(`/frequencia-individual?treinamento_id=${t.id}`)
            )
          );
          const freqMap = {};
          lista.forEach((t, i) => {
            const r = freqResults[i];
            if (r.status === "fulfilled") {
              const item = (r.value?.itens || []).find(
                (it) => normalize(it.treinando_nome) === normalize(user?.nome)
              );
              if (item) freqMap[t.id] = item;
            }
          });
          setFrequencias(freqMap);

          // Certificados emitidos
          const certData = await apiFetch("/certificados").catch(() => []);
          const certMap  = {};
          (Array.isArray(certData) ? certData : []).forEach((c) => {
            certMap[c.treinamento_id] = c;
          });
          setCerts(certMap);
        }
      } catch (err) {
        setError(err.message || "Erro ao carregar turmas.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isGestor, user?.nome]);

  /* ─── emit certificado ────────────────────────────────────────────────── */
  async function emitirCert(turma) {
    setEmitindo(turma.id);
    setCertMsg("");
    try {
      const res = await apiFetch("/certificados/emitir", {
        method: "POST",
        body: JSON.stringify({ treinamento_id: turma.id }),
      });
      setCerts((prev) => ({ ...prev, [turma.id]: res.certificado }));
      setCertMsg(`Certificado emitido para "${turma.tema}"! ✓`);
    } catch (err) {
      setCertMsg(`Erro: ${err.message}`);
    } finally {
      setEmitindo(null);
    }
  }

  /* ─── derived ─────────────────────────────────────────────────────────── */
  const statuses = useMemo(() => {
    const vals = [...new Set(turmas.map((t) => t.status || "—"))].sort();
    return vals;
  }, [turmas]);

  const filtradas = useMemo(() => {
    const term = normalize(search);
    return turmas.filter((t) => {
      const matchStatus = filterStatus === "todos" || normalize(t.status) === normalize(filterStatus);
      const matchSearch = !term || [t.tema, t.cliente, t.instrutor, t.status]
        .join(" ").toLowerCase().includes(term);
      return matchStatus && matchSearch;
    });
  }, [turmas, filterStatus, search]);

  const kpis = useMemo(() => {
    const concluidas = turmas.filter((t) =>
      ["concluído", "concluido", "concluída", "concluida"].includes(normalize(t.status))
    ).length;
    const certificados = Object.keys(certs).length;
    return { total: turmas.length, concluidas, certificados };
  }, [turmas, certs]);

  /* ─── render ─────────────────────────────────────────────────────────── */
  const heroTitle    = isGestor ? "Visão Geral de Turmas" : "Minhas Turmas";
  const heroSubtitle = isGestor
    ? "Todas as turmas do ambiente — frequências, status e certificados"
    : "Suas turmas, frequência e certificados de conclusão";

  return (
    <PortalShell>
      <div style={page}>
        <PageHero title={heroTitle} subtitle={heroSubtitle} icon="🎓" />

        {/* KPIs */}
        <div style={kpiRow}>
          <div style={kpiCard}>
            <div style={kpiValue}>{kpis.total}</div>
            <div style={kpiLabel}>{isGestor ? "Turmas no ambiente" : "Minhas turmas"}</div>
          </div>
          <div style={kpiCard}>
            <div style={kpiValue}>{kpis.concluidas}</div>
            <div style={kpiLabel}>Concluídas</div>
          </div>
          {!isGestor && (
            <div style={kpiCard}>
              <div style={{ ...kpiValue, color: colors.accent }}>{kpis.certificados}</div>
              <div style={kpiLabel}>Certificados emitidos</div>
            </div>
          )}
        </div>

        {/* Feedback */}
        {error   && <div style={alertErr}>{error}</div>}
        {certMsg && (
          <div style={certMsg.startsWith("Erro") ? alertErr : alertOk}>{certMsg}</div>
        )}

        {/* Filtros */}
        <div style={filterRow}>
          <input
            style={searchInput}
            placeholder="Buscar turma…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select style={sel} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="todos">Todos os status</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Lista */}
        {loading ? (
          <div style={empty}>Carregando turmas…</div>
        ) : filtradas.length === 0 ? (
          <div style={empty}>
            {turmas.length === 0
              ? "Você ainda não está inscrito em nenhuma turma."
              : "Nenhuma turma corresponde aos filtros."}
          </div>
        ) : (
          <div style={lista}>
            {filtradas.map((t) => {
              const freq       = frequencias[t.id];
              const freqPct    = freq?.frequencia_percentual ?? null;
              const freqCor    = corFreq(freqPct !== null ? Number(freqPct) : null);
              const sCor       = statusStyle(t.status);
              const cert       = certs[t.id];
              const concluida  = ["concluído", "concluido", "concluída", "concluida"].includes(normalize(t.status));

              return (
                <div key={t.id} style={turmaCard}>
                  <div style={turmaCardLeft}>
                    {/* Cabeçalho */}
                    <div style={turmaTopo}>
                      <div style={{ flex: 1 }}>
                        <div style={turmaTema}>{t.tema}</div>
                        <div style={turmaMeta}>
                          {[t.cliente, t.instrutor, fmtCH(t.carga_horaria)].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <span style={{ ...statusBadge, background: sCor.bg, color: sCor.text }}>
                        {t.status || "—"}
                      </span>
                    </div>

                    {/* Datas */}
                    {(t.data_inicio || t.data) && (
                      <div style={turmaDatas}>
                        📅 {fmtDate(t.data_inicio || t.data)}
                        {t.data_fim ? ` → ${fmtDate(t.data_fim)}` : ""}
                      </div>
                    )}

                    {/* Frequência (treinandos) */}
                    {!isGestor && freqPct !== null && (
                      <div style={freqRow}>
                        <span style={freqLabel}>Frequência</span>
                        <div style={freqBar}>
                          <div style={{ ...freqFill, width: `${Math.min(Number(freqPct), 100)}%`,
                            background: freqPct >= 75 ? "#22c55e" : "#ef4444" }} />
                        </div>
                        <span style={{ ...freqBadge, background: freqCor.bg, color: freqCor.text }}>
                          {Number(freqPct).toFixed(0)}%
                        </span>
                      </div>
                    )}

                    {/* Nota */}
                    {freq?.nota_prova != null && (
                      <div style={notaRow}>
                        <span style={notaLabel}>Nota</span>
                        <span style={notaVal}>{Number(freq.nota_prova).toFixed(1)}</span>
                      </div>
                    )}
                  </div>

                  {/* Ações */}
                  <div style={turmaCardRight}>
                    <button
                      style={btnVerTurma}
                      onClick={() => router.push(`/turma/${t.id}`)}>
                      Ver turma →
                    </button>

                    {/* Certificado (treinandos/instrutores em turmas concluídas) */}
                    {!isGestor && concluida && (
                      cert ? (
                        <div style={certEmitido}>
                          <div style={certIcon}>🏆</div>
                          <div style={certInfo}>
                            <div style={certLabel}>Certificado emitido</div>
                            <div style={certData}>
                              {new Date(cert.emitido_em).toLocaleDateString("pt-BR")}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          style={btnEmitir}
                          disabled={emitindo === t.id}
                          onClick={() => emitirCert(t)}>
                          {emitindo === t.id ? "Emitindo…" : "🏆 Emitir certificado"}
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Link para certificados */}
        {!isGestor && kpis.certificados > 0 && (
          <div style={certLink}>
            <button style={btnCertLink} onClick={() => router.push("/certificados")}>
              Ver todos os meus certificados ({kpis.certificados}) →
            </button>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

/* ─── styles ─────────────────────────────────────────────────────────────── */
const page        = { padding: "28px 32px", maxWidth: 1100, margin: "0 auto" };
const kpiRow      = { display: "flex", gap: 16, margin: "24px 0" };
const kpiCard     = { flex: 1, background: "#fff", borderRadius: 12, padding: "18px 20px",
                      boxShadow: "0 1px 4px rgba(0,0,0,.06)", textAlign: "center" };
const kpiValue    = { fontSize: 32, fontWeight: 900, color: "#0B1220" };
const kpiLabel    = { fontSize: 12, color: "#6b7280", marginTop: 4, fontWeight: 600 };
const alertErr    = { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca",
                      borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 };
const alertOk     = { background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0",
                      borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 };
const filterRow   = { display: "flex", gap: 12, marginBottom: 20 };
const searchInput = { flex: 1, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14 };
const sel         = { padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, background: "#fff" };
const empty       = { textAlign: "center", color: "#9ca3af", padding: "60px 0", fontSize: 14 };
const lista       = { display: "flex", flexDirection: "column", gap: 16 };
const turmaCard   = { background: "#fff", borderRadius: 14, padding: "20px 24px",
                      boxShadow: "0 1px 4px rgba(0,0,0,.06)", border: "1px solid #f3f4f6",
                      display: "flex", alignItems: "flex-start", gap: 24 };
const turmaCardLeft  = { flex: 1 };
const turmaCardRight = { display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end", minWidth: 160 };
const turmaTopo   = { display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      gap: 12, marginBottom: 6 };
const turmaTema   = { fontWeight: 800, fontSize: 16, color: "#0B1220" };
const turmaMeta   = { fontSize: 13, color: "#6b7280", marginTop: 2 };
const turmaDatas  = { fontSize: 13, color: "#9ca3af", marginBottom: 10 };
const statusBadge = { fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 999,
                      whiteSpace: "nowrap", flexShrink: 0 };
const freqRow     = { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 };
const freqLabel   = { fontSize: 12, fontWeight: 700, color: "#374151", minWidth: 72 };
const freqBar     = { flex: 1, height: 6, background: "#f3f4f6", borderRadius: 999 };
const freqFill    = { height: "100%", borderRadius: 999, transition: "width .3s" };
const freqBadge   = { fontSize: 12, fontWeight: 800, padding: "3px 8px", borderRadius: 6, minWidth: 44,
                      textAlign: "center" };
const notaRow     = { display: "flex", alignItems: "center", gap: 8 };
const notaLabel   = { fontSize: 12, color: "#9ca3af", fontWeight: 600 };
const notaVal     = { fontSize: 16, fontWeight: 900, color: "#0B1220" };
const certEmitido = { display: "flex", alignItems: "center", gap: 8, background: "#f0fdf4",
                      border: "1px solid #bbf7d0", borderRadius: 10, padding: "8px 12px" };
const certIcon    = { fontSize: 20 };
const certInfo    = {};
const certLabel   = { fontSize: 12, fontWeight: 800, color: "#166534" };
const certData    = { fontSize: 11, color: "#6b7280" };
const certLink    = { marginTop: 32, textAlign: "center" };
const btnVerTurma = { padding: "9px 16px", background: "#0B1220", color: "#fff", border: "none",
                      borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, width: "100%" };
const btnEmitir   = { padding: "9px 16px", background: colors.accent, color: "#fff", border: "none",
                      borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, width: "100%" };
const btnCertLink = { background: "none", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 20px",
                      cursor: "pointer", fontSize: 14, color: "#374151", fontWeight: 600 };
