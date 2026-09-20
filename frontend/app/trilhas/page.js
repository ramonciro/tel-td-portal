"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import StatCard    from "../../components/StatCard";
import { apiFetch, apiDownload, getStoredUser } from "../../services/api";
import { colors, radius } from "../../lib/theme";

/* ─── utils ──────────────────────────────────────────────────────────────────── */
function normalize(v) { return String(v || "").trim().toLowerCase(); }

// Restruturação (20/09/2026, pedido do Ramon): "trilhas devem ser
// independentes dos outros módulos" — o tipo de etapa "Turma" foi retirado
// (ele existia só pra vincular uma etapa a uma turma real da Treinamento,
// via /api/treinamentos, o que é exatamente o acoplamento que ele pediu pra
// tirar). Quem quiser ligar uma trilha a algo da jornada de desenvolvimento
// agora faz isso pelo lado de lá — "Trilha vinculada" no cadastro de Etapas
// da jornada, em Mapa de Desenvolvimento — não daqui.
function tipoLabel(tipo) {
  return { conteudo: "Conteúdo", avaliacao: "Avaliação", pratica: "Prática" }[tipo] || tipo;
}

function tipoCor(tipo) {
  return {
    conteudo:  { bg: colors.primaryLight, text: colors.primary },
    avaliacao: { bg: colors.warningLight, text: colors.warningText },
    pratica:   { bg: colors.successLight, text: colors.successText },
  }[tipo] || { bg: colors.surfaceMuted, text: colors.textSecondary };
}

// Melhoria: status agora é um campo real gravado no banco (trilha.status),
// escolhido pelo gestor no editor — antes era só um heurístico calculado
// aqui (>=5 etapas = "Estruturada"), sem nenhuma relação com o uso real.
const STATUS_TRILHA = {
  estruturacao: "Em estruturação",
  ativa:        "Ativa",
  estruturada:  "Estruturada",
};

function statusLabel(status) {
  return STATUS_TRILHA[status] || STATUS_TRILHA.estruturacao;
}

function statusCor(status) {
  if (status === "estruturada") return { bg: colors.successLight, text: colors.successText };
  if (status === "ativa")       return { bg: colors.primaryLight, text: colors.primary };
  return                               { bg: colors.warningLight, text: colors.warningText };
}

const TIPOS_ETAPA = ["conteudo", "avaliacao", "pratica"];

const etapaVazia = () => ({ titulo: "", descricao: "", tipo: "conteudo" });

/* ─── componente principal ──────────────────────────────────────────────────── */
export default function TrilhasPage() {
  const user = getStoredUser();
  const perfil = normalize(user?.perfil);
  // Módulo Metodologia e Desenvolvimento (16/09/2026): esta página só é
  // alcançável pelo perfil dedicado "metodologia" (ver PortalShell.js /
  // index.js) — coordenador/supervisor/instrutor/treinando perderam o
  // acesso, então a visão "gestor" é a única em uso agora. Mantido o check
  // por perfil (em vez de sempre `true`) para não quebrar se algum dia a
  // rota for reaberta para outro perfil de gestão.
  const isGestor = ["metodologia", "coordenador", "supervisor"].includes(perfil);

  const [trilhas,       setTrilhas]       = useState([]);
  const [progresso,     setProgresso]     = useState({});   // { [trilha_id]: { percentual, concluidas, total } }
  // Clientes da Metodologia (20/09/2026) — lista exclusiva, sem nenhum
  // vínculo com a Treinamento (ver migrate.js passo 42). Substitui o antigo
  // fetch de /treinamentos, que só existia pra alimentar o select de
  // "Vincular turma" removido junto com o tipo de etapa "Turma".
  const [metodologiaClientes, setMetodologiaClientes] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [exportando,    setExportando]    = useState(false);
  const [error,         setError]         = useState("");
  const [success,       setSuccess]       = useState("");

  // View state
  const [activeTab,     setActiveTab]     = useState("catalogo");  // 'catalogo' | 'editor'
  const [searchTerm,    setSearchTerm]    = useState("");
  const [filterCliente, setFilterCliente] = useState("todos");

  // Form state
  const [editingId,     setEditingId]     = useState(null);
  const [form,          setForm]          = useState({ cliente: "", titulo: "", descricao: "", status: "estruturacao" });
  const [etapas,        setEtapas]        = useState([etapaVazia()]);

  // Detail modal
  const [detalhe,       setDetalhe]       = useState(null);  // trilha em foco

  /* ─── load ──────────────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [tData, clientesData] = await Promise.all([
        apiFetch("/trilhas").catch(() => []),
        isGestor ? apiFetch("/metodologia-clientes").catch(() => []) : Promise.resolve([]),
      ]);
      setTrilhas(Array.isArray(tData) ? tData : []);
      setMetodologiaClientes(Array.isArray(clientesData) ? clientesData : []);

      // Melhoria: antes buscava o progresso de CADA trilha com uma requisição
      // paralela por trilha (Promise.allSettled em cima de todos os ids) —
      // escalava mal com o catálogo crescendo. Agora é uma única chamada em
      // lote que devolve o progresso de todas de uma vez.
      if (!isGestor) {
        const bulk = await apiFetch("/trilhas/progresso").catch(() => null);
        setProgresso(bulk?.progresso || {});
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

  // Só clientes ativos entram como opção no formulário — mesmo padrão usado
  // em mapa-desenvolvimento/page.js e tripulacao/page.js. Se o valor já
  // salvo na trilha não estiver mais na lista ativa (renomeado, desativado,
  // ou cadastrado antes desta lista existir), ele entra como opção extra
  // pra não sumir do <select> ao editar uma trilha antiga.
  const opcoesCliente = useMemo(() => {
    const nomes = metodologiaClientes
      .filter((item) => (item.status || "ativo") === "ativo")
      .map((item) => item.nome)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const atual = String(form.cliente || "").trim();
    if (atual && !nomes.includes(atual)) {
      return [...nomes, atual];
    }
    return nomes;
  }, [metodologiaClientes, form.cliente]);

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
    estruturadas:   trilhas.filter((t) => t.status === "estruturada").length,
    emEstruturacao: trilhas.filter((t) => (t.status || "estruturacao") === "estruturacao").length,
    totalEtapas:    trilhas.reduce((acc, t) => acc + (t.etapas?.length || 0), 0),
  }), [trilhas]);

  /* ─── form helpers ──────────────────────────────────────────────────────── */
  function abrirEditor(trilha = null) {
    if (trilha) {
      setEditingId(trilha.id);
      setForm({
        cliente: trilha.cliente || "",
        titulo: trilha.titulo || "",
        descricao: trilha.descricao || "",
        status: trilha.status || "estruturacao",
      });
      setEtapas(trilha.etapas?.length ? trilha.etapas.map((e) => ({ ...e })) : [etapaVazia()]);
    } else {
      setEditingId(null);
      setForm({ cliente: "", titulo: "", descricao: "", status: "estruturacao" });
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

  // Novo recurso: export de "quem concluiu o quê e quando" — pensado como
  // evidência de desenvolvimento (mesmo espírito do que se quer pro Oceano).
  async function handleExportarProgresso(trilha) {
    setExportando(true);
    try {
      await apiDownload(`/trilhas/${trilha.id}/progresso/exportar`, `trilha-${trilha.titulo}.xlsx`);
    } catch (err) {
      setError(err.message || "Erro ao exportar progresso.");
    } finally {
      setExportando(false);
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
          eyebrow="Ambiente Metodologia"
          title="Trilhas de Aprendizagem"
          subtitle="Catálogo de autoestudo — conteúdo, avaliação e prática — independente da jornada coletiva. Progresso é rastreado pelo login de quem acessa o portal."
        />

        {/* KPIs */}
        <div style={kpiGrid}>
          <StatCard title="Trilhas" value={kpis.total} accent={colors.primary} />
          <StatCard title="Estruturadas" value={kpis.estruturadas} accent={colors.success} />
          <StatCard title="Em estruturação" value={kpis.emEstruturacao} accent={colors.warning} />
          <StatCard title="Total de etapas" value={kpis.totalEtapas} accent={colors.accent} />
        </div>

        {/* Feedback */}
        {error   && <div style={alertErr}>{error}</div>}
        {success && <div style={alertOk}>{success}</div>}

        {/* Tabs */}
        {isGestor && (
          <div style={tabBar}>
            <button style={tab(activeTab === "catalogo")} onClick={() => setActiveTab("catalogo")}>Catálogo</button>
            <button style={tab(activeTab === "editor")}   onClick={() => abrirEditor()}>
              {editingId ? "Editando" : "+ Nova Trilha"}
            </button>
          </div>
        )}

        {/* ── CATÁLOGO ─────────────────────────────────────────────────────── */}
        {activeTab === "catalogo" && (
          <SectionCard
            title="Catálogo de trilhas"
            subtitle="Busque, filtre por cliente e acompanhe estruturação e progresso de cada trilha."
          >
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
                  const status = t.status || "estruturacao";
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
                        <span style={{ ...badge, background: sCor.bg, color: sCor.text }}>{statusLabel(status)}</span>
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
                            <span style={{ ...tipoChip, background: colors.surfaceMuted, color: colors.textSecondary }}>
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
          </SectionCard>
        )}

        {/* ── EDITOR ──────────────────────────────────────────────────────── */}
        {activeTab === "editor" && isGestor && (
          <SectionCard
            title={editingId ? "Editar trilha" : "Nova trilha"}
            subtitle="Etapas de conteúdo, avaliação ou prática — sem vínculo com turmas da Treinamento."
            action={<button style={btnSecundary} onClick={fecharEditor}>← Voltar ao catálogo</button>}
          >
            <div style={formGrid}>
              <div style={fieldFull}>
                <label style={lbl}>Título da trilha *</label>
                <input style={input} value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  placeholder="Ex.: Trilha de Onboarding Operacional" />
              </div>
              <div>
                <label style={lbl}>Cliente</label>
                <select style={input} value={form.cliente}
                  onChange={(e) => setForm({ ...form, cliente: e.target.value })}>
                  <option value="">Selecione</option>
                  {opcoesCliente.map((nome) => (
                    <option key={nome} value={nome}>{nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select style={input} value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(STATUS_TRILHA).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
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
                      <button style={{ ...iconBtn, color: colors.danger }} onClick={() => removeEtapa(idx)} title="Remover etapa">✕</button>
                    </div>
                  </div>
                  <textarea style={{ ...inputSm, minHeight: 52 }}
                    placeholder="Descrição da etapa (opcional)"
                    value={e.descricao || ""}
                    onChange={(ev) => updateEtapa(idx, "descricao", ev.target.value)} />
                </div>
              ))}
            </div>

            <div style={editorFooter}>
              <button style={btnSecundary} onClick={fecharEditor}>Cancelar</button>
              <button style={btnSave} onClick={handleSave} disabled={saving}>
                {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Criar trilha"}
              </button>
            </div>
          </SectionCard>
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
                <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
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
                          <div style={{ fontWeight: 700, color: concluido ? colors.textMuted : colors.textPrimary,
                            textDecoration: concluido ? "line-through" : "none", fontSize: 14 }}>
                            {e.titulo}
                          </div>
                          {e.descricao && <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>{e.descricao}</div>}
                        </div>
                        <span style={{ ...tipoChip, background: tc.bg, color: tc.text }}>{tipoLabel(e.tipo)}</span>
                        {!isGestor && (
                          <button
                            style={{ ...btnMinitoggle, background: concluido ? colors.successLight : colors.surfaceMuted,
                              color: concluido ? colors.successText : colors.textSecondary }}
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
                <button style={btnSecundary} onClick={() => handleExportarProgresso(detalhe)} disabled={exportando}>
                  {exportando ? "Exportando…" : "⬇ Exportar progresso"}
                </button>
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
const page       = { padding: "28px 32px", maxWidth: 1200, margin: "0 auto", display: "grid", gap: 20 };
const kpiGrid    = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 };
const alertErr   = { background: colors.dangerLight, color: colors.dangerText, border: `1px solid ${colors.dangerText}33`,
                     borderRadius: radius.sm, padding: "12px 16px", fontSize: 14, fontWeight: 700 };
const alertOk    = { background: colors.successLight, color: colors.successText, border: `1px solid ${colors.successText}33`,
                     borderRadius: radius.sm, padding: "12px 16px", fontSize: 14, fontWeight: 700 };
const tabBar     = { display: "flex", gap: 8 };
const tab        = (active) => ({
  padding: "10px 20px", borderRadius: radius.sm, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14,
  background: active ? colors.navy : colors.surfaceMuted, color: active ? "#fff" : colors.textSecondary,
});
const filterRow  = { display: "flex", gap: 12, marginBottom: 16 };
const search     = { flex: 1, padding: "10px 14px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 14 };
const sel        = { padding: "10px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 14, background: colors.surface };
const empty      = { textAlign: "center", color: colors.textMuted, padding: "48px 0", fontSize: 14 };
const grid       = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 20 };
const card       = { background: colors.surface, borderRadius: radius.lg, padding: 20,
                     boxShadow: "0 1px 4px rgba(0,0,0,.06)", border: `1px solid ${colors.surfaceMuted}` };
const cardTop    = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 };
const cardTitulo = { fontWeight: 800, fontSize: 15, color: colors.textPrimary };
const cardCliente = { fontSize: 12, color: colors.accent, fontWeight: 600, marginTop: 2 };
const cardDesc   = { fontSize: 13, color: colors.textSecondary, marginBottom: 12, lineHeight: 1.5 };
const badge      = { fontSize: 11, fontWeight: 800, padding: "4px 10px", borderRadius: radius.pill, whiteSpace: "nowrap" };
const etapasRow  = { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 };
const tipoChip   = { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: radius.sm };
const cardActions = { display: "flex", gap: 8, marginTop: 12 };
const progRow    = { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 };
const progBar    = { flex: 1, height: 6, background: colors.surfaceMuted, borderRadius: radius.pill };
const progFill   = { height: "100%", background: colors.accent, borderRadius: radius.pill, transition: "width .3s" };
const progPct    = { fontSize: 12, fontWeight: 700, color: colors.textSecondary, minWidth: 36 };

// Editor
const formGrid      = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 };
const fieldFull     = { gridColumn: "1 / -1" };
const lbl           = { display: "block", fontSize: 12, fontWeight: 700, color: colors.textSecondary, marginBottom: 6 };
const input         = { width: "100%", padding: "10px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.sm,
                        fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: colors.surface };
const inputSm       = { width: "100%", padding: "8px 10px", border: `1px solid ${colors.border}`, borderRadius: radius.sm,
                        fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const selSm         = { padding: "8px 10px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: 13,
                        background: colors.surface, width: "100%" };
const etapasEditor       = { marginBottom: 24 };
const etapasEditorHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 };
const etapasEditorTitle  = { fontSize: 15, fontWeight: 800, color: colors.textPrimary, margin: 0 };
const etapaCard     = { background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: 14,
                        marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 };
const etapaCardTop  = { display: "flex", alignItems: "center", gap: 10 };
const etapaControls = { display: "flex", gap: 4 };
const etapaNum      = { width: 28, height: 28, background: colors.navy, color: "#fff", borderRadius: radius.pill,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 900, flexShrink: 0 };
const iconBtn       = { padding: "4px 8px", border: `1px solid ${colors.border}`, borderRadius: radius.sm, cursor: "pointer",
                        background: colors.surface, fontSize: 14, lineHeight: 1 };
const editorFooter  = { display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 16,
                        borderTop: `1px solid ${colors.surfaceMuted}` };

// Modal
const overlay    = { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 9000,
                     display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
const modal      = { background: colors.surface, borderRadius: radius.lg, padding: 28, width: "100%", maxWidth: 640,
                     maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)" };
const modalHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      marginBottom: 16, gap: 16 };
const modalTitulo = { fontSize: 20, fontWeight: 900, color: colors.textPrimary, margin: 0 };
const modalDesc   = { color: colors.textSecondary, fontSize: 14, lineHeight: 1.6, marginBottom: 16 };
const modalClose  = { background: "none", border: "none", cursor: "pointer", fontSize: 20, color: colors.textMuted, padding: 4 };
const modalProgresso = { background: colors.surfaceMuted, borderRadius: radius.md, padding: "12px 16px", marginBottom: 16 };
const modalEtapas = { display: "flex", flexDirection: "column", gap: 8 };
const etapaItem   = { background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: 12 };
const etapaItemTop = { display: "flex", alignItems: "center", gap: 10 };
const etapaNumSm  = { width: 24, height: 24, background: colors.navy, color: "#fff", borderRadius: radius.pill,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, flexShrink: 0 };
const btnMinitoggle = { padding: "4px 10px", border: "none", borderRadius: radius.sm, cursor: "pointer",
                        fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" };
const modalFooter = { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20, paddingTop: 16,
                      borderTop: `1px solid ${colors.surfaceMuted}` };

// Buttons
const btnPrimary  = { padding: "9px 18px", background: colors.accent, color: "#fff", border: "none",
                      borderRadius: radius.sm, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnSecundary = { padding: "9px 18px", background: colors.surfaceMuted, color: colors.textSecondary, border: "none",
                       borderRadius: radius.sm, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnDanger   = { padding: "9px 18px", background: colors.dangerLight, color: colors.dangerText, border: "none",
                      borderRadius: radius.sm, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnSave     = { padding: "10px 24px", background: colors.navy, color: "#fff", border: "none",
                      borderRadius: radius.sm, cursor: "pointer", fontSize: 14, fontWeight: 800 };
