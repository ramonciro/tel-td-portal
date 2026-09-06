"use client";

import { useEffect, useMemo, useState }    from "react";
import { useParams }                       from "next/navigation";
import TurmaPageShell                      from "../../../../components/TurmaPageShell";
import { apiFetch, getStoredUser }         from "../../../../services/api";
import { colors, chart }                   from "../../../../lib/theme";

// Consolidação (set/2026): a página global /avaliacoes foi removida — ela
// tinha saído do menu principal há um tempo e duplicava, com layout
// diferente, o mesmo lançamento de nota que já existia aqui. A única coisa
// exclusiva de lá era o builder de provas/simulados com questões (usado por
// /responder-avaliacao); ele foi trazido pra cá, filtrado pela turma atual.

function novaQuestao() {
  return {
    enunciado: "", alternativa_a: "", alternativa_b: "",
    alternativa_c: "", alternativa_d: "", correta: "A", peso: 1,
  };
}

export default function AvaliacoesTurmaPage() {
  const { id } = useParams() || {};

  const [treinamento,   setTreinamento]   = useState(null);
  const [avaliacoes,    setAvaliacoes]    = useState([]);
  const [participantes, setParticipantes] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [erro,          setErro]          = useState("");
  const [usuario,       setUsuario]       = useState(null);

  const [editandoId,    setEditandoId]    = useState(null);
  const [notaEdicao,    setNotaEdicao]    = useState("");

  const [novoTitulo,    setNovoTitulo]    = useState("");
  const [novoTreinando, setNovoTreinando] = useState("");
  const [criando,       setCriando]       = useState(false);

  // ── Builder de provas/simulados (trazido de /avaliacoes) ──
  const [builderAberto, setBuilderAberto] = useState(false);
  const [materiais,     setMateriais]     = useState([]);
  const [materialForm,  setMaterialForm]  = useState({
    titulo: "", tipo: "prova", link_arquivo: "", descricao: "",
    nota_maxima: "", data_aplicacao: "",
  });
  const [questoes,      setQuestoes]      = useState([novaQuestao()]);
  const [editMaterialId, setEditMaterialId] = useState(null);
  const [builderErro,   setBuilderErro]   = useState("");
  const [builderOk,     setBuilderOk]     = useState("");

  useEffect(() => {
    setUsuario(getStoredUser());
    carregar();
  }, [id]);

  useEffect(() => {
    if (builderAberto) carregarMateriais();
  }, [builderAberto]);

  async function carregar() {
    if (!id) return;
    try {
      setLoading(true);
      // FIX: antes buscava /treinamentos (todos) e filtrava no frontend.
      // Agora usa o endpoint específico /treinamentos/${id} — mais eficiente
      // e sem risco de confundir dados de turmas diferentes.
      const [treinamentoData, avaliacoesData, participantesData] = await Promise.all([
        apiFetch(`/treinamentos/${id}`).catch(() => null),
        apiFetch("/avaliacoes").catch(() => []),
        apiFetch(`/treinamentos/${id}/participantes`).catch(() => []),
      ]);
      setTreinamento(treinamentoData || null);
      const daTurma = (Array.isArray(avaliacoesData) ? avaliacoesData : []).filter(
        (a) => String(a.treinamento_id) === String(id)
      );
      setAvaliacoes(daTurma);
      setParticipantes(Array.isArray(participantesData) ? participantesData : []);
      setErro("");
    } catch (e) {
      setErro(e.message || "Erro ao carregar avaliações.");
    } finally {
      setLoading(false);
    }
  }

  async function criarAvaliacao(nomeSugerido) {
    const nome = (nomeSugerido ?? novoTreinando).trim();
    if (!novoTitulo.trim() || !nome) return;
    try {
      setCriando(true);
      await apiFetch("/avaliacoes", {
        method: "POST",
        body: JSON.stringify({
          treinamento_id: Number(id),
          titulo: novoTitulo.trim(),
          treinando_nome: nome,
        }),
      });
      setNovoTitulo(""); setNovoTreinando("");
      await carregar();
    } catch (e) {
      setErro(e.message || "Erro ao lançar avaliação.");
    } finally {
      setCriando(false);
    }
  }

  async function salvarNota(avaliacaoId) {
    try {
      await apiFetch(`/avaliacoes/${avaliacaoId}`, {
        method: "PUT",
        body: JSON.stringify({ nota_prova: Number(notaEdicao) }),
      });
      setEditandoId(null);
      await carregar();
    } catch (e) { setErro(e.message || "Erro ao salvar nota."); }
  }

  async function excluir(avaliacaoId) {
    if (!window.confirm("Excluir esta avaliação?")) return;
    try {
      await apiFetch(`/avaliacoes/${avaliacaoId}`, { method: "DELETE" });
      await carregar();
    } catch (e) { setErro(e.message || "Erro ao excluir."); }
  }

  // ── Builder de provas/simulados ──
  async function carregarMateriais() {
    const d = await apiFetch("/materiais-avaliativos").catch(() => []);
    const lista = Array.isArray(d) ? d : [];
    setMateriais(lista.filter((m) => String(m.treinamento_id) === String(id)));
  }

  function limparMaterial() {
    setEditMaterialId(null); setBuilderErro(""); setBuilderOk("");
    setMaterialForm({ titulo: "", tipo: "prova", link_arquivo: "", descricao: "",
      nota_maxima: "", data_aplicacao: "" });
    setQuestoes([novaQuestao()]);
  }

  function campoMaterial(k) { return (e) => setMaterialForm((p) => ({ ...p, [k]: e.target.value })); }

  function updQuestao(i, k, v) {
    setQuestoes((p) => p.map((q, idx) => idx === i ? { ...q, [k]: v } : q));
  }

  async function salvarMaterial() {
    try {
      setBuilderErro(""); setBuilderOk("");
      if (!materialForm.titulo.trim()) {
        setBuilderErro("Título é obrigatório."); return;
      }
      const payload = {
        ...materialForm,
        treinamento_id: Number(id),
        nota_maxima: materialForm.nota_maxima || 0,
        questoes_json: JSON.stringify(questoes.filter((q) => q.enunciado)),
      };
      const url = editMaterialId ? `/materiais-avaliativos/${editMaterialId}` : "/materiais-avaliativos";
      await apiFetch(url, { method: editMaterialId ? "PUT" : "POST", body: JSON.stringify(payload) });
      setBuilderOk(editMaterialId ? "Material atualizado." : "Material salvo.");
      limparMaterial();
      carregarMateriais();
    } catch (e) { setBuilderErro(e.message || "Erro ao salvar."); }
  }

  async function excluirMaterial(materialId) {
    if (!window.confirm("Excluir este material?")) return;
    try {
      await apiFetch(`/materiais-avaliativos/${materialId}`, { method: "DELETE" });
      carregarMateriais();
    } catch (e) { setBuilderErro(e.message || "Erro ao excluir."); }
  }

  function editarMaterial(m) {
    setEditMaterialId(m.id);
    setMaterialForm({
      titulo: m.titulo || "", tipo: m.tipo || "prova",
      link_arquivo: m.link_arquivo || "", descricao: m.descricao || "",
      nota_maxima: m.nota_maxima || "",
      data_aplicacao: m.data_aplicacao ? String(m.data_aplicacao).slice(0, 10) : "",
    });
    try {
      const p = JSON.parse(m.questoes_json || "[]");
      setQuestoes(p.length ? p : [novaQuestao()]);
    } catch { setQuestoes([novaQuestao()]); }
  }

  const ehTreinando = usuario?.perfil === "treinando";
  const media       = avaliacoes.length
    ? (avaliacoes.reduce((acc, a) => acc + Number(a.nota_prova || 0), 0) / avaliacoes.length).toFixed(1)
    : null;
  const pendentesCorrecao = avaliacoes.filter((a) => a.nota_prova == null).length;

  // FIX: antes, "pendente" era calculado só sobre as avaliações já lançadas
  // (nota_prova == null). Isso não pegava o caso mais comum de pendência —
  // treinando da turma que ainda não teve NENHUMA avaliação lançada. Agora
  // cruza com a lista real de participantes da turma.
  const semAvaliacao = useMemo(() => {
    const avaliados = new Set(
      avaliacoes.map((a) => String(a.treinando_nome || "").trim().toLowerCase())
    );
    return participantes
      .map((p) => p.nome)
      .filter(Boolean)
      .filter((nome) => !avaliados.has(String(nome).trim().toLowerCase()));
  }, [participantes, avaliacoes]);

  return (
    <TurmaPageShell id={id} treinamento={treinamento} loading={loading} abaAtiva="avaliacoes">

      {erro && <div style={errorBox}>{erro}</div>}

      {ehTreinando ? (
        <div style={cta}>
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#334155" }}>
            Você tem avaliações pendentes desta turma para responder.
          </p>
          <a href={`/responder-avaliacao?treinamento_id=${id}`} style={linkBtn}>
            Responder avaliação
          </a>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={kpiRow}>
            <div style={kpiCard}>
              <span style={kpiLabel}>Média da turma</span>
              <span style={{ ...kpiValue, color: media ? colors.primary : "#94a3b8" }}>
                {media ?? "—"}
              </span>
            </div>
            <div style={kpiCard}>
              <span style={kpiLabel}>Sem avaliação lançada</span>
              <span style={{ ...kpiValue, color: semAvaliacao.length > 0 ? colors.warning : colors.success }}>
                {semAvaliacao.length}
              </span>
            </div>
            <div style={kpiCard}>
              <span style={kpiLabel}>Aguardando correção</span>
              <span style={{ ...kpiValue, color: pendentesCorrecao > 0 ? colors.warning : colors.success }}>
                {pendentesCorrecao}
              </span>
            </div>
            <div style={kpiCard}>
              <span style={kpiLabel}>Total lançado</span>
              <span style={{ ...kpiValue, color: "#334155" }}>{avaliacoes.length}</span>
            </div>
          </div>

          {/* Treinandos sem avaliação lançada */}
          {semAvaliacao.length > 0 && (
            <div style={alertaCard}>
              <span style={alertaTitulo}>⚠️ {semAvaliacao.length} treinando{semAvaliacao.length !== 1 ? "s" : ""} sem nenhuma avaliação lançada</span>
              <div style={alertaLista}>
                {semAvaliacao.map((nome) => (
                  <button key={nome} style={alertaChip} onClick={() => setNovoTreinando(nome)}>
                    {nome} <span style={alertaChipAcao}>lançar</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Formulário de lançamento */}
          <div style={formCard}>
            <div style={formTitle}>Lançar nova avaliação</div>
            <div style={formRow}>
              <input
                value={novoTitulo}
                onChange={(e) => setNovoTitulo(e.target.value)}
                placeholder="Título (ex: Avaliação final)"
                style={{ ...inputBase, flex: "2 1 200px" }}
              />
              <input
                value={novoTreinando}
                onChange={(e) => setNovoTreinando(e.target.value)}
                placeholder="Nome do treinando"
                style={{ ...inputBase, flex: "1 1 160px" }}
              />
              <button
                onClick={() => criarAvaliacao()}
                disabled={criando || !novoTitulo.trim() || !novoTreinando.trim()}
                style={{
                  ...btnLancar,
                  opacity: (!novoTitulo.trim() || !novoTreinando.trim()) ? .5 : 1,
                  cursor:  (!novoTitulo.trim() || !novoTreinando.trim()) ? "default" : "pointer",
                }}
              >
                {criando ? "Lançando…" : "Lançar"}
              </button>
            </div>
          </div>

          {/* Lista */}
          {loading && <p style={hint}>Carregando…</p>}
          {!loading && avaliacoes.length === 0 && (
            <div style={emptyState}>Nenhuma avaliação lançada para esta turma ainda.</div>
          )}
          <div style={lista}>
            {avaliacoes.map((a) => (
              <div key={a.id} style={avaliacaoItem}>
                <div style={avaliacaoInfo}>
                  <span style={avaliacaoTitulo}>{a.titulo || "Avaliação"}</span>
                  <span style={avaliacaoTreinando}>{a.treinando_nome || "—"}</span>
                </div>
                <div style={avaliacaoAcoes}>
                  {editandoId === a.id ? (
                    <>
                      <input
                        type="number"
                        value={notaEdicao}
                        onChange={(e) => setNotaEdicao(e.target.value)}
                        style={{ ...inputBase, width: 70, textAlign: "center" }}
                        autoFocus
                      />
                      <button onClick={() => salvarNota(a.id)} style={btnSalvarNota}>Salvar</button>
                      <button onClick={() => setEditandoId(null)} style={btnCancelar}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <span style={{
                        fontSize: 20, fontWeight: 800,
                        color: a.nota_prova != null ? "#0f172a" : "#94a3b8",
                        minWidth: 36, textAlign: "right",
                      }}>
                        {a.nota_prova != null ? Number(a.nota_prova).toFixed(1) : "—"}
                      </span>
                      <button
                        onClick={() => { setEditandoId(a.id); setNotaEdicao(a.nota_prova ?? ""); }}
                        style={btnLink}
                      >
                        {a.nota_prova != null ? "corrigir" : "lançar nota"}
                      </button>
                      <button onClick={() => excluir(a.id)} style={{ ...btnLink, color: colors.dangerText }}>
                        excluir
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Builder de provas/simulados (com questões), filtrado pra esta turma */}
          <div style={{ marginTop: 16 }}>
            <button style={btnBuilder} onClick={() => setBuilderAberto((v) => !v)}>
              {builderAberto ? "▲ Fechar provas e simulados desta turma" : "▼ Provas e simulados desta turma (com questões)"}
            </button>

            {builderAberto && (
              <div style={builderWrap}>
                {builderErro && <div style={errorBox}>{builderErro}</div>}
                {builderOk   && <div style={successBox}>{builderOk}</div>}

                <div style={builderGrid}>
                  {/* Formulário */}
                  <div>
                    <div style={builderSecTitle}>{editMaterialId ? "Editar material" : "Novo material avaliativo"}</div>
                    <div style={bGrid}>
                      <BField label="Título" full><input value={materialForm.titulo} onChange={campoMaterial("titulo")} style={bInput} /></BField>
                      <BField label="Tipo">
                        <select value={materialForm.tipo} onChange={campoMaterial("tipo")} style={bInput}>
                          <option value="prova">Prova</option>
                          <option value="simulado">Simulado</option>
                        </select>
                      </BField>
                      <BField label="Nota máx."><input type="number" value={materialForm.nota_maxima} onChange={campoMaterial("nota_maxima")} style={bInput} /></BField>
                      <BField label="Aplicação"><input type="date" value={materialForm.data_aplicacao} onChange={campoMaterial("data_aplicacao")} style={bInput} /></BField>
                      <BField label="Link" full><input value={materialForm.link_arquivo} onChange={campoMaterial("link_arquivo")} placeholder="URL do arquivo (opcional)" style={bInput} /></BField>
                      <BField label="Descrição" full>
                        <textarea value={materialForm.descricao} onChange={campoMaterial("descricao")} rows={2}
                          style={{ ...bInput, height: "auto", padding: "8px 10px" }} />
                      </BField>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "14px 0 8px" }}>
                      <span style={builderSecTitle}>Questões</span>
                      <button style={btnAddQ} onClick={() => setQuestoes((p) => [...p, novaQuestao()])}>+ Questão</button>
                    </div>
                    {questoes.map((q, i) => (
                      <div key={i} style={questaoCard}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Questão {i + 1}</span>
                          {questoes.length > 1 && (
                            <button style={btnRemQ} onClick={() => setQuestoes((p) => p.filter((_, j) => j !== i))}>Remover</button>
                          )}
                        </div>
                        <textarea value={q.enunciado} onChange={(e) => updQuestao(i, "enunciado", e.target.value)}
                          placeholder="Enunciado" rows={2} style={{ ...bInput, height: "auto", padding: "8px 10px", marginBottom: 8 }} />
                        <div style={bGrid}>
                          {["a", "b", "c", "d"].map((l) => (
                            <BField key={l} label={`Alt. ${l.toUpperCase()}`}>
                              <input value={q[`alternativa_${l}`]}
                                onChange={(e) => updQuestao(i, `alternativa_${l}`, e.target.value)} style={bInput} />
                            </BField>
                          ))}
                          <BField label="Correta">
                            <select value={q.correta} onChange={(e) => updQuestao(i, "correta", e.target.value)} style={bInput}>
                              {["A", "B", "C", "D"].map((l) => <option key={l} value={l}>{l}</option>)}
                            </select>
                          </BField>
                          <BField label="Peso">
                            <input type="number" min="1" value={q.peso}
                              onChange={(e) => updQuestao(i, "peso", e.target.value)} style={bInput} />
                          </BField>
                        </div>
                      </div>
                    ))}

                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <button style={btnCoral} onClick={salvarMaterial}>{editMaterialId ? "Atualizar" : "Salvar material"}</button>
                      <button style={btnGhost} onClick={limparMaterial}>Limpar</button>
                    </div>
                  </div>

                  {/* Lista de materiais desta turma */}
                  <div>
                    <div style={builderSecTitle}>Materiais desta turma ({materiais.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                      {materiais.length === 0 && <p style={hint}>Nenhum material ainda.</p>}
                      {materiais.map((m) => {
                        let nQ = 0;
                        try { nQ = JSON.parse(m.questoes_json || "[]").length; } catch { nQ = 0; }
                        return (
                          <div key={m.id} style={materialItem}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{m.titulo}</span>
                              <span style={{ fontSize: 11, background: "#dbeafe", color: "#1d4ed8",
                                borderRadius: 999, padding: "2px 8px", fontWeight: 700 }}>{m.tipo}</span>
                            </div>
                            <span style={{ fontSize: 12, color: "#64748b" }}>
                              {nQ} questão(ões) · nota máx. {m.nota_maxima ?? 0}
                            </span>
                            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                              <button style={btnEditar} onClick={() => editarMaterial(m)}>Editar</button>
                              <button style={btnExcluir} onClick={() => excluirMaterial(m.id)}>Excluir</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </TurmaPageShell>
  );
}

function BField({ label, children, full = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: full ? "1 / -1" : "auto" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{label}</span>
      {children}
    </div>
  );
}

/* ── Estilos ── */
const errorBox = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14 };
const successBox = { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14 };
const cta = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 20, textAlign: "center" };
const linkBtn = { display: "inline-block", padding: "10px 20px", borderRadius: 10, background: colors.accent, color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none" };
const kpiRow = { display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" };
const kpiCard = { flex: "1 1 140px", background: "#fff", border: "1px solid #e9eef4", borderRadius: 12, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 4 };
const kpiLabel = { fontSize: 12, color: "#94a3b8", fontWeight: 600 };
const kpiValue = { fontSize: 26, fontWeight: 800, lineHeight: 1 };

const alertaCard = { background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: "12px 14px", marginBottom: 14 };
const alertaTitulo = { fontSize: 13, fontWeight: 700, color: "#c2410c" };
const alertaLista = { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 };
const alertaChip = { background: "#fff", border: "1px solid #fed7aa", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 600, color: "#9a3412", cursor: "pointer" };
const alertaChipAcao = { fontSize: 10, fontWeight: 700, color: "#c2410c", marginLeft: 4, textTransform: "uppercase" };

const formCard = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 16, marginBottom: 14 };
const formTitle = { fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 10 };
const formRow = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
const inputBase = { padding: "8px 10px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13, color: "#334155", outline: "none", height: 38, boxSizing: "border-box" };
const btnLancar = { height: 38, padding: "0 18px", borderRadius: 10, border: "none", background: colors.accent, color: "#fff", fontWeight: 700, fontSize: 13 };
const hint = { fontSize: 13, color: "#94a3b8" };
const emptyState = { textAlign: "center", padding: "24px 16px", color: "#94a3b8", fontSize: 13, border: "1px dashed #e2e8f0", borderRadius: 12, marginBottom: 8 };
const lista = { display: "flex", flexDirection: "column", gap: 8 };
const avaliacaoItem = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#fff", border: "1px solid #e9eef4", borderRadius: 12, padding: "12px 16px", flexWrap: "wrap" };
const avaliacaoInfo = { display: "flex", flexDirection: "column", gap: 2 };
const avaliacaoTitulo = { fontSize: 14, fontWeight: 700, color: "#0f172a" };
const avaliacaoTreinando = { fontSize: 12, color: "#64748b" };
const avaliacaoAcoes = { display: "flex", alignItems: "center", gap: 10 };
const btnSalvarNota = { background: colors.accent, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const btnCancelar = { background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12 };
const btnLink = { background: "none", border: "none", color: colors.primary, cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 };

const btnBuilder = { width: "100%", background: "#f8fafc", border: "1px dashed #e2e8f0", borderRadius: 12, padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#334155", textAlign: "left" };
const builderWrap = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 18, marginTop: 10 };
const builderGrid = { display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 18 };
const builderSecTitle = { fontSize: 14, fontWeight: 800, color: "#0f172a", marginBottom: 8, display: "block" };
const bGrid  = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 };
const bInput = { height: 36, borderRadius: 9, border: "1px solid #e2e8f0", padding: "0 10px", fontSize: 13, color: "#334155", outline: "none", width: "100%", boxSizing: "border-box" };
const questaoCard = { background: "#f8fafc", border: "1px solid #e9eef4", borderRadius: 12, padding: 12, marginBottom: 8 };
const materialItem = { background: "#f8fafc", border: "1px solid #e9eef4", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 4 };
const btnAddQ  = { background: colors.accent, color: "#fff", border: 0, borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const btnRemQ  = { background: colors.dangerLight, color: colors.dangerText, border: 0, borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 };
const btnCoral = { background: colors.accent, color: "#fff", border: 0, borderRadius: 10, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 };
const btnGhost = { background: "#f8fafc", color: "#64748b", border: "1px solid #e9eef4", borderRadius: 10, padding: "9px 14px", cursor: "pointer", fontSize: 13 };
const btnEditar = { background: "#dbeafe", color: "#1d4ed8", border: 0, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const btnExcluir = { background: colors.dangerLight, color: colors.dangerText, border: 0, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
