"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import { apiFetch, getStoredUser } from "../../services/api";
import { colors } from "../../lib/theme";

/* ─── utils ──────────────────────────────────────────────────────────────────── */
function normalize(v) { return String(v || "").trim().toLowerCase(); }

function tipoLabel(tipo) {
  return { conteudo: "Conteúdo", turma: "Turma", avaliacao: "Avaliação", pratica: "Prática" }[tipo] || tipo;
}

function tipoCor(tipo) {
  return {
    conteudo:  { bg: "#dbeafe", text: "#1d4ed8" },
    turma:     { bg: "#dcfce7", text: "#166534" },
    avaliacao: { bg: "#fef3c7", text: "#92400e" },
    pratica:   { bg: "#fce7f3", text: "#9d174d" },
  }[tipo] || { bg: "#f3f4f6", text: "#374151" };
}

function statusDaTrilha(etapas) {
  if (!etapas?.length) return "Em estruturação";
  if (etapas.length >= 5) return "Estruturada";
  return "Ativa";
}

function statusCor(status) {
  if (status === "Estruturada") return { bg: "#dcfce7", text: "#166534" };
  if (status === "Ativa")       return { bg: "#dbeafe", text: "#1d4ed8" };
  return                               { bg: "#ffedd5", text: "#9a3412" };
}

const TIPOS_ETAPA = ["conteudo", "turma", "avaliacao", "pratica"];

const etapaVazia = () => ({ titulo: "", descricao: "", tipo: "conteudo", turma_id: "" });

/* ─── componente principal ──────────────────────────────────────────────────── */
export default function TrilhasPage() {
  const user = getStoredUser();
  const perfil = normalize(user?.perfil);
  const isGestor = ["coordenador", "supervisor"].includes(perfil);

  const [trilhas,       setTrilhas]       = useState([]);
  const [progresso,     setProgresso]     = useState({});   // { [trilha_id]: { percentual, concluidas, total } }
  const [treinamentos,  setTreinamentos]  = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState("");
  const [success,       setSuccess]       = useState("");

  // View state
  const [activeTab,     setActiveTab]     = useState("catalogo");  // 'catalogo' | 'editor'
  const [searchTerm,    setSearchTerm]    = useState("");
  const [filterCliente, setFilterCliente] = useState("todos");

  // Form state
  const [editingId,     setEditingId]     = useState(null);
  const [form,          setForm]          = useState({ cliente: "", titulo: "", descricao: "" });
  const [etapas,        setEtapas]        = useState([etapaVazia()]);

  // Detail modal
  const [detalhe,       setDetalhe]       = useState(null);  // trilha em foco

  /* ─── load ──────────────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [tData, trData] = await Promise.all([
        apiFetch("/trilhas").catch(() => []),
        isGestor ? apiFetch("/treinamentos").catch(() => []) : Promise.resolve([]),
      ]);
      setTrilhas(Array.isArray(tData) ? tData : []);
      setTreinamentos(Array.isArray(trData) ? trData : []);

      // Carrega progresso para treinandos/instrutores
      if (!isGestor) {
        const ids = (Array.isArray(tData) ? tData : []).map((t) => t.id);
        const progResults = await Promise.allSettled(
          ids.map((id) => apiFetch(`/trilhas/${id}/progresso`))
        );
        const progMap = {};
        ids.forEach((id, i) => {
          if (progResults[i].status === "fulfilled") {
            progMap[id] = progResults[i].value;
          }
        });
        setProgresso(progMap);
      }
    } catch (err) {
      setError(err.message || "Erro ao carregar trilhas.");
    } finally {
      setLoading(false);
    }
  }, [isGestor]);

  useEffect(() => { load(); }, [load]);

  /* ─── derived ───────────────────────────────────────────────────────────── */
  const clients = useMemo(() => {
    const vals = [...new Set(trilhas.map((t) => t.cliente || "GLOBAL"))].sort();
    return vals;
  }, [trilhas]);

  const filtradas = useMemo(() => {
    const term = normalize(searchTerm);
    return trilhas.filter((t) => {
      const matchCliente = filterCliente === "todos" || (t.cliente || "GLOBAL") === filterCliente;
      const matchSearch  = !term || [t.titulo, t.descricao, t.cliente]
        .concat((t.etapas || []).map((e) => e.titulo))
        .join(" ").toLowerCase().includes(term);
      return matchCliente && matchSearch;
    });
  }, [trilhas, filterCliente, searchTerm]);

  const kpis = useMemo(() => ({
    total:          trilhas.length,
    estruturadas:   trilhas.filter((t) => statusDaTrilha(t.etapas) === "Estruturada").length,
    emEstruturacao: trilhas.filter((t) => statusDaTrilha(t.etapas) === "Em estruturação").length,
    totalEtapas:    trilhas.reduce((acc, t) => acc + (t.etapas?.length || 0), 0),
  }), [trilhas]);

  /* ─── form helpers ──────────────────────────────────────────────────────── */
  function abrirEditor(trilha = null) {
    if (trilha) {
      setEditingId(trilha.id);
      setForm({ cliente: trilha.cliente || "", titulo: trilha.titulo || "", descricao: trilha.descricao || "" });
      setEtapas(trilha.etapas?.length ? trilha.etapas.map((e) => ({ ...e })) : [etapaVazia()]);
    } else {
      setEditingId(null);
      setForm({ cliente: "", titulo: "", descricao: "" });
      setEtapas([etapaVazia()]);
    }
    setActiveTab("editor");
    setError("");
    setSuccess("");
  }

  function fecharEditor() {
    setActiveTab("catalogo");
    setEditingId(null);
    setError("");
    setSuccess("");
  }

  function addEtapa() { setEtapas((prev) => [...prev, etapaVazia()]); }

  function removeEtapa(idx) {
    setEtapas((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveEtapa(idx, dir) {
    setEtapas((prev) => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return next;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  function updateEtapa(idx, field, value) {
    setEtapas((prev) => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  }

  /* ─── save ──────────────────────────────────────────────────────────────── */
  async function handleSave() {
    if (!form.titulo.trim()) { setError("Título é obrigatório."); return; }
    const etapasValidas = etapas.filter((e) => e.titulo.trim());
    if (!etapasValidas.length) { setError("Adicione pelo menos uma etapa com título."); return; }

    setSaving(true);
    setError("");
    try {
      const body = { ...form, etapas: etapasValidas.map((e, i) => ({ ...e, ordem: i })) };
      if (editingId) {
        await apiFetch(`/trilhas/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
        setSuccess("Trilha atualizada.");
      } else {
        await apiFetch("/trilhas", { method: "POST", body: JSON.stringify(body) });
        setSuccess("Trilha criada.");
      }
      await load();
      fecharEditor();
    } catch (err) {
      setError(err.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Excluir esta trilha e todas as suas etapas?")) return;
    try {
      await apiFetch(`/trilhas/${id}`, { method: "DELETE" });
      await load();
      if (detalhe?.id === id) setDetalhe(null);
    } catch (err) {
      setError(err.message || "Erro ao excluir.");
    }
  }

  /* ─── progresso (treinando) ─────────────────────────────────────────────── */
  async function handleConcluirEtapa(trilhaId, etapaId, concluido) {
    try {
      await apiFetch(`/trilhas/${trilhaId}/etapas/${etapaId}/concluir`, {
        method: "POST",
        body: JSON.stringify({ concluido }),
      });
      const updated = await apiFetch(`/trilhas/${trilhaId}/progresso`);
      setProgresso((prev) => ({ ...prev, [trilhaId]: updated }));
      if (detalhe?.id === trilhaId) {
        setDetalhe((prev) => ({
          ...prev,
          etapas: (prev.etapas || []).map((e) =>
            e.id === etapaId ? { ...e, concluido, concluido_em: concluido ? new Date().toISOString() : null } : e
          ),
        }));
      }
    } catch (err) {
      setError(err.message || "Erro ao marcar etapa.");
    }
  }

  /* ─── abrir detalhe ─────────────────────────────────────────────────────── */
  async function abrirDetalhe(trilha) {
    try {
      const full = await apiFetch(`/trilhas/${trilha.id}`);
      if (!isGestor) {
        const prog = await apiFetch(`/trilhas/${trilha.id}/progresso`);
        const progMap = {};
        (prog.etapas || []).forEach((e) => { progMap[e.id] = e; });
        full.etapas = (full.etapas || []).map((e) => ({
          ...e,
          concluido:    progMap[e.id]?.concluido ?? false,
          concluido_em: progMap[e.id]?.concluido_em ?? null,
        }));
        setProgresso((prev) => ({ ...prev, [trilha.id]: prog }));
      }
      setDetalhe(full);
    } catch {
      setDetalhe(trilha);
    }
  }

  /* ─── render ────────────────────────────────────────────────────────────── */
  return (
    <PortalShell>
      <div style={page}>
        <PageHero
          title="Trilhas de Aprendizagem"
          subtitle="Jornadas estruturadas de desenvolvimento — etapas, progresso e conclusão"
          icon="🧭"
        />

        {/* KPIs */}
        <div style={kpiRow}>
          {[
            { label: "Trilhas", value: kpis.total },
            { label: "Estruturadas", value: kpis.estruturadas },
            { label: "Em estruturação", value: kpis.emEstruturacao },
            { label: "Total de etapas", value: kpis.totalEtapas },
          ].map(({ label, value }) => (
            <div key={label} style={kpiCard}>
              <div style={kpiValue}>{value}</div>
              <div style={kpiLabel}>{label}</div>
            </div>
          ))}
        </div>

        {/* Feedback */}
        {error   && <div style={alertErr}>{error}</div>}
        {success && <div style={alertOk}>{success}</div>}

        {/* Tabs */}
        {isGestor && (
          <div style={tabBar}>
            <button style={tab(activeTab === "catalogo")} onClick={() => setActiveTab("catalogo")}>Catálogo</button>
            <button style={tab(activeTab === "editor")}   onClick={() => abrirEditor()}>
              {editingId ? "✏️ Editando" : "+ Nova Trilha"}
            </button>
          </div>
        )}

        {/* ── CATÁLOGO ─────────────────────────────────────────────────────── */}
        {activeTab === "catalogo" && (
          <div>
            {/* Filtros */}
            <div style={filterRow}>
              <input
                style={search}
                placeholder="Buscar trilha…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <select style={sel} value={filterCliente} onChange={(e) => setFilterCliente(e.target.value)}>
                <option value="todos">Todos os clientes</option>
                {clients.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {loading ? (
              <div style={empty}>Carregando trilhas…</div>
            ) : filtradas.length === 0 ? (
              <div style={empty}>
                {isGestor ? "Nenhuma trilha cadastrada. Clique em \"+ Nova Trilha\" para começar." : "Nenhuma trilha disponível."}
              </div>
            ) : (
              <div style={grid}>
                {filtradas.map((t) => {
                  const etapas = t.etapas || [];
                  const status = statusDaTrilha(etapas);
                  const sCor   = statusCor(status);
                  const prog   = progresso[t.id];
                  const pct    = prog?.percentual ?? null;

                  return (
                    <div key={t.id} style={card}>
                      <div style={cardTop}>
                        <div style={{ flex: 1 }}>
                          <div style={cardTitulo}>{t.titulo}</div>
                          {t.cliente && <div style={cardCliente}>{t.cliente}</div>}
                        </div>
                        <span style={{ ...badge, background: sCor.bg, color: sCor.text }}>{status}</span>
                      </div>

                      {t.descricao && <div style={cardDesc}>{t.descricao}</div>}

                      {/* Progresso bar (treinandos) */}
                      {pct !== null && (
                        <div style={progRow}>
                          <div style={progBar}>
                            <div style={{ ...progFill, width: `${pct}%` }} />
                          </div>
                          <span style={progPct}>{pct}%</span>
                        </div>
                      )}

                      {/* Etapas chips */}
                      {etapas.length > 0 && (
                        <div style={etapasRow}>
                          {etapas.slice(0, 4).map((e, i) => {
                            const tc = tipoCor(e.tipo);
                            return (
                              <span key={i} style={{ ...tipoChip, background: tc.bg, color: tc.text }}>
                                {i + 1}. {e.titulo.length > 22 ? e.titulo.slice(0, 22) + "…" : e.titulo}
                              </span>
                            );
                          })}
                          {etapas.length > 4 && (
                            <span style={{ ...tipoChip, background: "#f3f4f6", color: "#6b7280" }}>
                              +{etapas.length - 4}
                            </span>
                          )}
                        </div>
                      )}

                      <div style={cardActions}>
                        <button style={btnSecundary} onClick={() => abrirDetalhe(t)}>
                          {isGestor ? "Ver detalhes" : "Abrir trilha"}
                        </button>
                        {isGestor && (
                          <>
                            <button style={btnPrimary} onClick={() => abrirEditor(t)}>Editar</button>
                            <button style={btnDanger}  onClick={() => handleDelete(t.id)}>Excluir</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── EDITOR ──────────────────────────────────────────────────────── */}
        {activeTab === "editor" && isGestor && (
          <div style={editorWrap}>
            <div style={editorHeader}>
              <h2 style={editorTitle}>{editingId ? "Editar Trilha" : "Nova Trilha"}</h2>
              <button style={btnSecundary} onClick={fecharEditor}>← Voltar ao catálogo</button>
            </div>

            <div style={formGrid}>
              <div style={fieldFull}>
                <label style={lbl}>Título da trilha *</label>
                <input style={input} value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  placeholder="Ex.: Trilha de Onboarding Operacional" />
              </div>
              <div>
                <label style={lbl}>Cliente / Operação</label>
                <input style={input} value={form.cliente}
                  onChange={(e) => setForm({ ...form, cliente: e.target.value })}
                  placeholder="Ex.: Agibank" />
              </div>
              <div style={fieldFull}>
                <label style={lbl}>Descrição</label>
                <textarea style={{ ...input, minHeight: 72 }} value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Objetivo da trilha, público-alvo e competências desenvolvidas…" />
              </div>
            </div>

            {/* Etapas */}
            <div style={etapasEditor}>
              <div style={etapasEditorHeader}>
                <h3 style={etapasEditorTitle}>Etapas ({etapas.length})</h3>
                <button style={btnPrimary} onClick={addEtapa}>+ Adicionar etapa</button>
              </div>

              {etapas.map((e, idx) => (
                <div key={idx} style={etapaCard}>
                  <div style={etapaCardTop}>
                    <span style={etapaNum}>{idx + 1}</span>
                    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr auto", gap: 12 }}>
                      <input style={inputSm} placeholder="Título da etapa *"
                        value={e.titulo} onChange={(ev) => updateEtapa(idx, "titulo", ev.target.value)} />
                      <select style={selSm} value={e.tipo}
                        onChange={(ev) => updateEtapa(idx, "tipo", ev.target.value)}>
                        {TIPOS_ETAPA.map((t) => <option key={t} value={t}>{tipoLabel(t)}</option>)}
                      </select>
                    </div>
                    <div style={etapaControls}>
                      <button style={iconBtn} onClick={() => moveEtapa(idx, -1)} disabled={idx === 0} title="Mover para cima">↑</button>
                      <button style={iconBtn} onClick={() => moveEtapa(idx, 1)} disabled={idx === etapas.length - 1} title="Mover para baixo">↓</button>
                      <button style={{ ...iconBtn, color: colors.danger || "#ef4444" }} onClick={() => removeEtapa(idx)} title="Remover etapa">✕</button>
                    </div>
                  </div>
                  <textarea style={{ ...inputSm, minHeight: 52 }}
                    placeholder="Descrição da etapa (opcional)"
                    value={e.descricao || ""}
                    onChange={(ev) => updateEtapa(idx, "descricao", ev.target.value)} />
                  {e.tipo === "turma" && (
                    <select style={selSm} value={e.turma_id || ""}
                      onChange={(ev) => updateEtapa(idx, "turma_id", ev.target.value)}>
                      <option value="">— Vincular turma (opcional) —</option>
                      {treinamentos.map((t) => (
                        <option key={t.id} value={t.id}>{t.tema} ({t.cliente || "?"})</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>

            <div style={editorFooter}>
              <button style={btnSecundary} onClick={fecharEditor}>Cancelar</button>
              <button style={btnSave} onClick={handleSave} disabled={saving}>
                {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Criar trilha"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL DETALHE ──────────────────────────────────────────────── */}
      {detalhe && (
        <div style={overlay} onClick={() => setDetalhe(null)}>
          <div style={modal} onClick={(ev) => ev.stopPropagation()}>
            <div style={modalHeader}>
              <div>
                <h2 style={modalTitulo}>{detalhe.titulo}</h2>
                {detalhe.cliente && <div style={cardCliente}>{detalhe.cliente}</div>}
              </div>
              <button style={modalClose} onClick={() => setDetalhe(null)}>✕</button>
            </div>

            {detalhe.descricao && <p style={modalDesc}>{detalhe.descricao}</p>}

            {/* Progresso geral */}
            {progresso[detalhe.id] && (
              <div style={modalProgresso}>
                <div style={progRow}>
                  <div style={progBar}>
                    <div style={{ ...progFill, width: `${progresso[detalhe.id].percentual}%` }} />
                  </div>
                  <span style={progPct}>{progresso[detalhe.id].percentual}%</span>
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  {progresso[detalhe.id].concluidas} de {progresso[detalhe.id].total} etapas concluídas
                </div>
              </div>
            )}

            {/* Etapas */}
            <div style={modalEtapas}>
              {(detalhe.etapas || []).length === 0 ? (
                <div style={empty}>Nenhuma etapa cadastrada.</div>
              ) : (
                (detalhe.etapas || []).map((e, idx) => {
                  const tc        = tipoCor(e.tipo);
                  const concluido = !!e.concluido;
                  return (
                    <div key={e.id || idx} style={{ ...etapaItem, opacity: concluido ? 0.7 : 1 }}>
                      <div style={etapaItemTop}>
                        <span style={etapaNumSm}>{idx + 1}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: concluido ? "#6b7280" : "#0B1220",
                            textDecoration: concluido ? "line-through" : "none", fontSize: 14 }}>
                            {e.titulo}
                          </div>
                          {e.descricao && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{e.descricao}</div>}
                        </div>
                        <span style={{ ...tipoChip, background: tc.bg, color: tc.text }}>{tipoLabel(e.tipo)}</span>
                        {!isGestor && (
                          <button
                            style={{ ...btnMinitoggle, background: concluido ? "#dcfce7" : "#f3f4f6",
                              color: concluido ? "#166534" : "#374151" }}
                            onClick={() => handleConcluirEtapa(detalhe.id, e.id, !concluido)}>
                            {concluido ? "✓ Concluída" : "Marcar"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {isGestor && (
              <div style={modalFooter}>
                <button style={btnPrimary} onClick={() => { setDetalhe(null); abrirEditor(detalhe); }}>
                  Editar trilha
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </PortalShell>
  );
}

/* ─── styles ──────────────────────────────────────────────────────────────── */
const page       = { padding: "28px 32px", maxWidth: 1200, margin: "0 auto" };
const kpiRow     = { display: "flex", gap: 16, margin: "24px 0" };
const kpiCard    = { flex: 1, background: "#fff", borderRadius: 12, padding: "18px 20px",
                     boxShadow: "0 1px 4px rgba(0,0,0,.06)", textAlign: "center" };
const kpiValue   = { fontSize: 32, fontWeight: 900, color: "#0B1220" };
const kpiLabel   = { fontSize: 12, color: "#6b7280", marginTop: 4, fontWeight: 600 };
const alertErr   = { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca",
                     borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 };
const alertOk    = { background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0",
                     borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 14 };
const tabBar     = { display: "flex", gap: 8, marginBottom: 24 };
const tab        = (active) => ({
  padding: "10px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14,
  background: active ? "#0B1220" : "#f3f4f6", color: active ? "#fff" : "#374151",
});
const filterRow  = { display: "flex", gap: 12, marginBottom: 20 };
const search     = { flex: 1, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14 };
const sel        = { padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, background: "#fff" };
const empty      = { textAlign: "center", color: "#9ca3af", padding: "48px 0", fontSize: 14 };
const grid       = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 20 };
const card       = { background: "#fff", borderRadius: 14, padding: 20,
                     boxShadow: "0 1px 4px rgba(0,0,0,.06)", border: "1px solid #f3f4f6" };
const cardTop    = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 };
const cardTitulo = { fontWeight: 800, fontSize: 15, color: "#0B1220" };
const cardCliente = { fontSize: 12, color: colors.accent, fontWeight: 600, marginTop: 2 };
const cardDesc   = { fontSize: 13, color: "#6b7280", marginBottom: 12, lineHeight: 1.5 };
const badge      = { fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" };
const etapasRow  = { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 };
const tipoChip   = { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 };
const cardActions = { display: "flex", gap: 8, marginTop: 12 };
const progRow    = { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 };
const progBar    = { flex: 1, height: 6, background: "#f3f4f6", borderRadius: 999 };
const progFill   = { height: "100%", background: colors.accent, borderRadius: 999, transition: "width .3s" };
const progPct    = { fontSize: 12, fontWeight: 700, color: "#374151", minWidth: 36 };

// Editor
const editorWrap    = { background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,.08)" };
const editorHeader  = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 };
const editorTitle   = { fontSize: 20, fontWeight: 900, color: "#0B1220", margin: 0 };
const formGrid      = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 };
const fieldFull     = { gridColumn: "1 / -1" };
const lbl           = { display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 };
const input         = { width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8,
                        fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const inputSm       = { width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8,
                        fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const selSm         = { padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13,
                        background: "#fff", width: "100%" };
const etapasEditor       = { marginBottom: 24 };
const etapasEditorHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 };
const etapasEditorTitle  = { fontSize: 15, fontWeight: 800, color: "#0B1220", margin: 0 };
const etapaCard     = { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 14,
                        marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 };
const etapaCardTop  = { display: "flex", alignItems: "center", gap: 10 };
const etapaControls = { display: "flex", gap: 4 };
const etapaNum      = { width: 28, height: 28, background: "#0B1220", color: "#fff", borderRadius: 999,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 900, flexShrink: 0 };
const iconBtn       = { padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer",
                        background: "#fff", fontSize: 14, lineHeight: 1 };
const editorFooter  = { display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 16,
                        borderTop: "1px solid #f3f4f6" };

// Modal
const overlay    = { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 9000,
                     display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
const modal      = { background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 640,
                     maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)" };
const modalHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      marginBottom: 16, gap: 16 };
const modalTitulo = { fontSize: 20, fontWeight: 900, color: "#0B1220", margin: 0 };
const modalDesc   = { color: "#6b7280", fontSize: 14, lineHeight: 1.6, marginBottom: 16 };
const modalClose  = { background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9ca3af", padding: 4 };
const modalProgresso = { background: "#f9fafb", borderRadius: 10, padding: "12px 16px", marginBottom: 16 };
const modalEtapas = { display: "flex", flexDirection: "column", gap: 8 };
const etapaItem   = { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 };
const etapaItemTop = { display: "flex", alignItems: "center", gap: 10 };
const etapaNumSm  = { width: 24, height: 24, background: "#0B1220", color: "#fff", borderRadius: 999,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, flexShrink: 0 };
const btnMinitoggle = { padding: "4px 10px", border: "none", borderRadius: 6, cursor: "pointer",
                        fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" };
const modalFooter = { display: "flex", justifyContent: "flex-end", marginTop: 20, paddingTop: 16,
                      borderTop: "1px solid #f3f4f6" };

// Buttons
const btnPrimary  = { padding: "9px 18px", background: colors.accent, color: "#fff", border: "none",
                      borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnSecundary = { padding: "9px 18px", background: "#f3f4f6", color: "#374151", border: "none",
                       borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnDanger   = { padding: "9px 18px", background: "#fef2f2", color: "#dc2626", border: "none",
                      borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnSave     = { padding: "10px 24px", background: "#0B1220", color: "#fff", border: "none",
                      borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 800 };
