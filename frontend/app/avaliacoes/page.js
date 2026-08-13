"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell   from "../../components/PortalShell";
import PageHero      from "../../components/PageHero";
import StatCard      from "../../components/StatCard";
import { apiFetch, getStoredUser } from "../../services/api";
import { colors, chart }           from "../../lib/theme";

/* ═══════════════════════════════════════════════
   CLASSIFICAÇÃO
═══════════════════════════════════════════════ */
function notaFinal(item) {
  const prova = Number(item?.nota_prova || 0);
  const qual  = Number(item?.nota_qualidade || 0);
  return prova > 0 ? prova : qual;
}

function classificar(item) {
  const n = notaFinal(item);
  if (n === 0)  return "pendente";
  if (n >= 8)   return "Aprovado";
  if (n >= 6)   return "Atenção";
  return "Reforço";
}

const CLASSIF_STYLE = {
  pendente: { background: "#f1f5f9", color: "#64748b" },
  Aprovado: { background: colors.successLight, color: colors.successText },
  Atenção:  { background: colors.warningLight, color: colors.warningText },
  Reforço:  { background: colors.dangerLight,  color: colors.dangerText  },
};

const ORDEM_CLASSIF = { Reforço: 0, Atenção: 1, pendente: 2, Aprovado: 3 };

/* ═══════════════════════════════════════════════
   UTILITÁRIOS
═══════════════════════════════════════════════ */
function fmt(n) { return new Intl.NumberFormat("pt-BR").format(Number(n || 0)); }
function avg(arr, key) {
  const com = arr.filter((i) => Number(i?.[key] || 0) > 0);
  if (!com.length) return null;
  return (com.reduce((s, i) => s + Number(i[key]), 0) / com.length).toFixed(1);
}

function isInstrutor(user) {
  const p = String(user?.perfil || user?.role || "").toLowerCase();
  return p === "instrutor";
}

function nomeInstrutor(user) {
  return (user?.nome || user?.name || "").trim();
}

/* ═══════════════════════════════════════════════
   SUB-COMPONENTES
═══════════════════════════════════════════════ */
function Badge({ label }) {
  return (
    <span style={{ ...pill, ...CLASSIF_STYLE[label] || CLASSIF_STYLE.pendente }}>
      {label}
    </span>
  );
}

function InlineForm({ treinandoNome, treinamentoId, avaliacaoExistente, onSalvo, onCancelar }) {
  const [form, setForm] = useState({
    nota_prova:     String(avaliacaoExistente?.nota_prova     ?? ""),
    nota_qualidade: String(avaliacaoExistente?.nota_qualidade ?? ""),
    nota_nps:       String(avaliacaoExistente?.nota_nps       ?? ""),
    comentario:     avaliacaoExistente?.comentario || "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");

  function campo(k) { return (e) => setForm((p) => ({ ...p, [k]: e.target.value })); }

  async function salvar() {
    try {
      setSalvando(true); setErro("");
      const payload = {
        treinamento_id: Number(treinamentoId),
        treinando_nome: treinandoNome,
        nota_prova:      form.nota_prova     !== "" ? Number(form.nota_prova)     : null,
        nota_qualidade:  form.nota_qualidade !== "" ? Number(form.nota_qualidade) : null,
        nota_nps:        form.nota_nps       !== "" ? Number(form.nota_nps)       : null,
        comentario:      form.comentario     || null,
      };
      if (avaliacaoExistente?.id) {
        await apiFetch(`/avaliacoes/${avaliacaoExistente.id}`, {
          method: "PUT", body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/avaliacoes", {
          method: "POST", body: JSON.stringify(payload),
        });
      }
      onSalvo();
    } catch (e) {
      setErro(e.message || "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={inlineFormWrap}>
      {erro && <div style={errSmall}>{erro}</div>}
      <div style={inlineFormRow}>
        <MiniField label="Nota prova">
          <input type="number" min="0" max="10" step="0.1"
            value={form.nota_prova} onChange={campo("nota_prova")} style={miniInput} />
        </MiniField>
        <MiniField label="Qualidade">
          <input type="number" min="0" max="10" step="0.1"
            value={form.nota_qualidade} onChange={campo("nota_qualidade")} style={miniInput} />
        </MiniField>
        <MiniField label="NPS">
          <input type="number" min="0" max="10" step="0.1"
            value={form.nota_nps} onChange={campo("nota_nps")} style={miniInput} />
        </MiniField>
        <MiniField label="Comentário" wide>
          <input value={form.comentario} onChange={campo("comentario")}
            placeholder="Observação ou feedback" style={{ ...miniInput, width: "100%" }} />
        </MiniField>
        <div style={{ display: "flex", gap: 6, alignSelf: "flex-end" }}>
          <button style={btnSalvarInline} onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          <button style={btnCancelarInline} onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function MiniField({ label, children, wide = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: wide ? "1 1 180px" : "0 0 90px" }}>
      <span style={miniLabel}>{label}</span>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CARD DE TURMA
═══════════════════════════════════════════════ */
function TurmaAvaliacaoCard({ turma, avaliacoesDaTurma, usuario, onAvaliacaoSalva }) {
  const [expandido,   setExpandido]   = useState(false);
  const [participantes, setParticipantes] = useState(null); // null = não carregado
  const [carregando,  setCarregando]  = useState(false);
  const [editandoId,  setEditandoId]  = useState(null); // treinando_nome em edição
  const ehCoordenador = !isInstrutor(usuario);

  /* Kpis da turma (só das avaliações já existentes) */
  const kpi = useMemo(() => {
    const aprovados = avaliacoesDaTurma.filter((a) => classificar(a) === "Aprovado").length;
    const atencao   = avaliacoesDaTurma.filter((a) => classificar(a) === "Atenção").length;
    const reforco   = avaliacoesDaTurma.filter((a) => classificar(a) === "Reforço").length;
    return { total: avaliacoesDaTurma.length, aprovados, atencao, reforco };
  }, [avaliacoesDaTurma]);

  /* Carregar participantes ao expandir */
  async function expandir() {
    if (expandido) { setExpandido(false); return; }
    setExpandido(true);
    if (participantes !== null) return;
    try {
      setCarregando(true);
      const lista = await apiFetch(`/treinamentos/${turma.id}/participantes`).catch(() => []);
      setParticipantes(Array.isArray(lista) ? lista : []);
    } finally {
      setCarregando(false);
    }
  }

  /* Mesclar participantes + avaliações */
  const listaCompleta = useMemo(() => {
    if (!participantes) return [];
    const avalMap = {};
    avaliacoesDaTurma.forEach((a) => {
      const chave = String(a.treinando_nome || "").trim().toLowerCase();
      avalMap[chave] = a;
    });
    return participantes
      .map((p) => {
        const chave = String(p.nome || "").trim().toLowerCase();
        const aval  = avalMap[chave] || null;
        return { nome: p.nome, avaliacao: aval, classif: aval ? classificar(aval) : "pendente" };
      })
      .sort((a, b) => (ORDEM_CLASSIF[a.classif] ?? 99) - (ORDEM_CLASSIF[b.classif] ?? 99));
  }, [participantes, avaliacoesDaTurma]);

  const pendentes = listaCompleta.filter((t) => !t.avaliacao).length;
  const reforco   = listaCompleta.filter((t) => t.classif === "Reforço").length;
  const temAlerta = pendentes > 0 || reforco > 0;

  return (
    <div style={{ ...turmaCard, borderLeft: `4px solid ${temAlerta ? colors.danger : colors.success}` }}>

      {/* Cabeçalho clicável */}
      <div style={turmaCardHeader} onClick={expandir} role="button" tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && expandir()}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={turmaNome}>{turma.tema || "Turma"}</div>
          <div style={turmaMeta}>
            {[turma.cliente, turma.instrutor].filter(Boolean).join(" · ")}
          </div>
        </div>

        <div style={turmaKpis}>
          <KpiChip label="avaliados" value={kpi.total}    cor="#334155" />
          <KpiChip label="aprovados" value={kpi.aprovados} cor={colors.successText} />
          {kpi.atencao > 0 && <KpiChip label="atenção"  value={kpi.atencao} cor={colors.warningText} />}
          {kpi.reforco > 0 && <KpiChip label="reforço"  value={kpi.reforco} cor={colors.dangerText}  />}
        </div>

        <span style={chevron}>{expandido ? "▲" : "▼"}</span>
      </div>

      {/* Alerta de pendentes / reforço */}
      {temAlerta && (
        <div style={alertaStrip}>
          {pendentes > 0 && (
            <span>⚠️ {pendentes} treinando{pendentes !== 1 ? "s" : ""} sem avaliação</span>
          )}
          {reforco > 0 && (
            <span style={{ marginLeft: 12 }}>
              🔴 {reforco} em situação de reforço
            </span>
          )}
        </div>
      )}

      {/* Lista de treinandos (expandida) */}
      {expandido && (
        <div style={listaWrap}>
          {carregando && <p style={hint}>Carregando treinandos…</p>}

          {!carregando && listaCompleta.length === 0 && (
            <p style={hint}>Nenhum participante importado para esta turma.</p>
          )}

          {!carregando && listaCompleta.map((item) => {
            const emEdicao = editandoId === item.nome;
            const a        = item.avaliacao;

            return (
              <div key={item.nome} style={{
                ...treinandoRow,
                background: item.classif === "Reforço" ? colors.dangerLight : item.classif === "pendente" ? "#f8fafc" : "#fff",
              }}>
                <div style={treinandoInfo}>
                  <span style={treinandoNome}>{item.nome}</span>
                  <Badge label={item.classif} />
                </div>

                {a && !emEdicao && (
                  <div style={notasRow}>
                    {a.nota_prova     != null && <NotaChip label="P" value={a.nota_prova}     />}
                    {a.nota_qualidade != null && <NotaChip label="Q" value={a.nota_qualidade} />}
                    {a.nota_nps       != null && <NotaChip label="N" value={a.nota_nps}       />}
                    {a.comentario && (
                      <span style={comentarioTxt} title={a.comentario}>
                        💬 {a.comentario.length > 40 ? a.comentario.slice(0, 40) + "…" : a.comentario}
                      </span>
                    )}
                  </div>
                )}

                <div style={treinandoAcoes}>
                  {emEdicao ? null : (
                    <button
                      style={a ? btnEditar : btnLancar}
                      onClick={() => setEditandoId(item.nome)}
                    >
                      {a ? "Editar" : "Lançar nota"}
                    </button>
                  )}
                  {item.classif === "Reforço" && !emEdicao && (
                    <span style={reforcoTag}>Reforço necessário</span>
                  )}
                </div>

                {emEdicao && (
                  <InlineForm
                    treinandoNome={item.nome}
                    treinamentoId={turma.id}
                    avaliacaoExistente={a}
                    onSalvo={async () => {
                      setEditandoId(null);
                      await onAvaliacaoSalva();
                    }}
                    onCancelar={() => setEditandoId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiChip({ label, value, cor }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <span style={{ fontSize: 17, fontWeight: 800, color: cor, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

function NotaChip({ label, value }) {
  const n = Number(value || 0);
  const cor = n >= 8 ? colors.successText : n >= 6 ? colors.warningText : colors.dangerText;
  const bg  = n >= 8 ? colors.successLight : n >= 6 ? colors.warningLight : colors.dangerLight;
  return (
    <span style={{ fontSize: 13, fontWeight: 800, color: cor, background: bg,
      borderRadius: 6, padding: "2px 7px", display: "inline-flex", alignItems: "center", gap: 3 }}>
      <span style={{ fontSize: 10, opacity: .7 }}>{label}</span>{Number(value).toFixed(1)}
    </span>
  );
}

/* ═══════════════════════════════════════════════
   BUILDER DE PROVAS (somente coordenador)
═══════════════════════════════════════════════ */
function BuilderProvas({ treinamentos, onSalvo }) {
  const [aberto, setAberto] = useState(false);
  const [materiais, setMateriais] = useState([]);
  const [form, setForm] = useState({ treinamento_id: "", titulo: "", tipo: "prova",
    link_arquivo: "", descricao: "", nota_maxima: "", data_aplicacao: "" });
  const [questoes, setQuestoes] = useState([novaQuestao()]);
  const [editId, setEditId] = useState(null);
  const [erro,   setErro]   = useState("");
  const [ok,     setOk]     = useState("");

  useEffect(() => { if (aberto) carregar(); }, [aberto]);

  async function carregar() {
    const d = await apiFetch("/materiais-avaliativos").catch(() => []);
    setMateriais(Array.isArray(d) ? d : []);
  }

  function novaQuestao() {
    return { enunciado: "", alternativa_a: "", alternativa_b: "",
      alternativa_c: "", alternativa_d: "", correta: "A", peso: 1 };
  }

  function campo(k) { return (e) => setForm((p) => ({ ...p, [k]: e.target.value })); }

  function updQ(i, k, v) {
    setQuestoes((p) => p.map((q, idx) => idx === i ? { ...q, [k]: v } : q));
  }

  function limpar() {
    setEditId(null); setErro(""); setOk("");
    setForm({ treinamento_id: "", titulo: "", tipo: "prova",
      link_arquivo: "", descricao: "", nota_maxima: "", data_aplicacao: "" });
    setQuestoes([novaQuestao()]);
  }

  async function salvar() {
    try {
      setErro(""); setOk("");
      if (!form.treinamento_id || !form.titulo) {
        setErro("Turma e título são obrigatórios."); return;
      }
      const payload = { ...form, nota_maxima: form.nota_maxima || 0,
        questoes_json: JSON.stringify(questoes.filter((q) => q.enunciado)) };
      const url = editId ? `/materiais-avaliativos/${editId}` : "/materiais-avaliativos";
      await apiFetch(url, { method: editId ? "PUT" : "POST", body: JSON.stringify(payload) });
      setOk(editId ? "Material atualizado." : "Material salvo.");
      limpar(); carregar(); onSalvo?.();
    } catch (e) { setErro(e.message || "Erro ao salvar."); }
  }

  async function excluir(id) {
    if (!window.confirm("Excluir este material?")) return;
    await apiFetch(`/materiais-avaliativos/${id}`, { method: "DELETE" });
    carregar();
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button style={btnBuilder} onClick={() => setAberto((v) => !v)}>
        {aberto ? "▲ Fechar builder de provas e simulados" : "▼ Provas e simulados (biblioteca de materiais)"}
      </button>

      {aberto && (
        <div style={builderWrap}>
          {erro && <div style={errorBox}>{erro}</div>}
          {ok  && <div style={successBox}>{ok}</div>}

          <div style={builderGrid}>
            {/* Formulário */}
            <div>
              <div style={builderSecTitle}>{editId ? "Editar material" : "Novo material avaliativo"}</div>
              <div style={bGrid}>
                <BField label="Turma" full>
                  <select value={form.treinamento_id} onChange={campo("treinamento_id")} style={bInput}>
                    <option value="">Selecione a turma…</option>
                    {treinamentos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.tema || "Turma"} · {t.cliente || "—"}
                      </option>
                    ))}
                  </select>
                </BField>
                <BField label="Título"><input value={form.titulo} onChange={campo("titulo")} style={bInput} /></BField>
                <BField label="Tipo">
                  <select value={form.tipo} onChange={campo("tipo")} style={bInput}>
                    <option value="prova">Prova</option>
                    <option value="simulado">Simulado</option>
                  </select>
                </BField>
                <BField label="Nota máx."><input type="number" value={form.nota_maxima} onChange={campo("nota_maxima")} style={bInput} /></BField>
                <BField label="Aplicação"><input type="date" value={form.data_aplicacao} onChange={campo("data_aplicacao")} style={bInput} /></BField>
                <BField label="Link" full><input value={form.link_arquivo} onChange={campo("link_arquivo")} placeholder="URL do arquivo (opcional)" style={bInput} /></BField>
                <BField label="Descrição" full>
                  <textarea value={form.descricao} onChange={campo("descricao")} rows={2}
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
                  <textarea value={q.enunciado} onChange={(e) => updQ(i, "enunciado", e.target.value)}
                    placeholder="Enunciado" rows={2} style={{ ...bInput, height: "auto", padding: "8px 10px", marginBottom: 8 }} />
                  <div style={bGrid}>
                    {["a","b","c","d"].map((l) => (
                      <BField key={l} label={`Alt. ${l.toUpperCase()}`}>
                        <input value={q[`alternativa_${l}`]}
                          onChange={(e) => updQ(i, `alternativa_${l}`, e.target.value)} style={bInput} />
                      </BField>
                    ))}
                    <BField label="Correta">
                      <select value={q.correta} onChange={(e) => updQ(i, "correta", e.target.value)} style={bInput}>
                        {["A","B","C","D"].map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </BField>
                    <BField label="Peso">
                      <input type="number" min="1" value={q.peso}
                        onChange={(e) => updQ(i, "peso", e.target.value)} style={bInput} />
                    </BField>
                  </div>
                </div>
              ))}

              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button style={btnCoral} onClick={salvar}>{editId ? "Atualizar" : "Salvar material"}</button>
                <button style={btnGhost} onClick={limpar}>Limpar</button>
              </div>
            </div>

            {/* Lista de materiais */}
            <div>
              <div style={builderSecTitle}>Materiais cadastrados ({materiais.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {materiais.length === 0 && <p style={hint}>Nenhum material ainda.</p>}
                {materiais.map((m) => {
                  const t = treinamentos.find((tr) => String(tr.id) === String(m.treinamento_id));
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
                        {t?.tema || `Turma #${m.treinamento_id}`} · {nQ} questão(ões) · nota máx. {m.nota_maxima ?? 0}
                      </span>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button style={btnEditar} onClick={() => {
                          setEditId(m.id);
                          setForm({ treinamento_id: m.treinamento_id || "",
                            titulo: m.titulo || "", tipo: m.tipo || "prova",
                            link_arquivo: m.link_arquivo || "", descricao: m.descricao || "",
                            nota_maxima: m.nota_maxima || "", data_aplicacao: m.data_aplicacao ? String(m.data_aplicacao).slice(0,10) : "" });
                          try { const p = JSON.parse(m.questoes_json || "[]");
                            setQuestoes(p.length ? p : [novaQuestao()]); } catch { setQuestoes([novaQuestao()]); }
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}>Editar</button>
                        <button style={btnExcluir} onClick={() => excluir(m.id)}>Excluir</button>
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

/* ═══════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════ */
export default function AvaliacoesPage() {
  const [usuario,      setUsuario]      = useState(null);
  const [treinamentos, setTreinamentos] = useState([]);
  const [avaliacoes,   setAvaliacoes]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [erro,         setErro]         = useState("");
  const [busca,        setBusca]        = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const usuario_eh_instrutor = usuario ? isInstrutor(usuario) : false;

  useEffect(() => {
    const u = getStoredUser();
    setUsuario(u);
    carregar(u);
  }, []);

  async function carregar(u) {
    try {
      setLoading(true); setErro("");
      const [treinamentosData, avaliacoesData] = await Promise.all([
        apiFetch("/treinamentos").catch(() => []),
        apiFetch("/avaliacoes").catch(() => []),
      ]);
      setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
      setAvaliacoes(Array.isArray(avaliacoesData)   ? avaliacoesData   : []);
    } catch (e) {
      setErro(e.message || "Erro ao carregar avaliações.");
    } finally {
      setLoading(false);
    }
  }

  /* Filtrar turmas por instrutor se necessário */
  const turmasFiltradas = useMemo(() => {
    let lista = [...treinamentos];

    if (usuario_eh_instrutor) {
      const nomeUser = nomeInstrutor(usuario).toLowerCase();
      lista = lista.filter(
        (t) => String(t.instrutor || "").toLowerCase().includes(nomeUser)
      );
    }

    if (busca.trim()) {
      const t = busca.toLowerCase();
      lista = lista.filter((tr) =>
        [tr.tema, tr.cliente, tr.instrutor].join(" ").toLowerCase().includes(t)
      );
    }

    return lista;
  }, [treinamentos, usuario, usuario_eh_instrutor, busca]);

  /* Avaliações por turma */
  const avaliacoesPorTurma = useMemo(() => {
    const mapa = {};
    avaliacoes.forEach((a) => {
      const k = String(a.treinamento_id);
      if (!mapa[k]) mapa[k] = [];
      mapa[k].push(a);
    });
    return mapa;
  }, [avaliacoes]);

  /* KPIs globais (da visão do usuário) */
  const kpi = useMemo(() => {
    const ids  = new Set(turmasFiltradas.map((t) => String(t.id)));
    const avals = avaliacoes.filter((a) => ids.has(String(a.treinamento_id)));
    const aprovados = avals.filter((a) => classificar(a) === "Aprovado").length;
    const atencao   = avals.filter((a) => classificar(a) === "Atenção").length;
    const reforco   = avals.filter((a) => classificar(a) === "Reforço").length;
    return {
      total:    avals.length,
      aprovados, atencao, reforco,
      mediaProv: avg(avals, "nota_prova"),
      mediaQual: avg(avals, "nota_qualidade"),
      mediaNps:  avg(avals, "nota_nps"),
    };
  }, [turmasFiltradas, avaliacoes]);

  /* Filtro de status sobre turmas */
  const turmasVisiveis = useMemo(() => {
    if (filtroStatus === "todos") return turmasFiltradas;
    return turmasFiltradas.filter((t) => {
      const avals = avaliacoesPorTurma[String(t.id)] || [];
      if (filtroStatus === "pendentes") {
        // turmas que têm ao menos uma avaliação pendente (só saberemos ao expandir,
        // mas filtramos as que têm zero avaliações como proxy conservador)
        return avals.length === 0;
      }
      if (filtroStatus === "reforco") return avals.some((a) => classificar(a) === "Reforço");
      return true;
    });
  }, [turmasFiltradas, filtroStatus, avaliacoesPorTurma]);

  const heroTitle    = usuario_eh_instrutor ? "Minhas Turmas — Avaliações" : "Gestão de Avaliações";
  const heroSubtitle = usuario_eh_instrutor
    ? "Acompanhe e lance avaliações dos seus treinandos."
    : "Resultados por treinando agrupados por turma. Lançamento inline, alertas de reforço e pendentes.";

  return (
    <PortalShell>
      <div style={{ marginBottom: 20 }}>
        <PageHero eyebrow="Avaliações" title={heroTitle} subtitle={heroSubtitle} />
      </div>

      {loading && <div style={loadingBox}>Carregando avaliações…</div>}
      {erro    && <div style={errorBox}>{erro}</div>}

      {!loading && (
        <>
          {/* ── KPIs ── */}
          <div style={kpiGrid}>
            <StatCard title="Avaliações" value={fmt(kpi.total)}
              subtitle={`${turmasFiltradas.length} turma${turmasFiltradas.length !== 1 ? "s" : ""}`}
              accent={chart.blue} />
            <StatCard title="Aprovados"  value={fmt(kpi.aprovados)} subtitle="nota ≥ 8" accent={colors.success} />
            <StatCard title="Atenção"    value={fmt(kpi.atencao)}   subtitle="nota 6–7,9" accent={colors.warning} />
            <StatCard title="Reforço"    value={fmt(kpi.reforco)}   subtitle="nota < 6"
              accent={kpi.reforco > 0 ? colors.danger : colors.neutral} />
            {kpi.mediaProv && (
              <StatCard title="Média prova" value={kpi.mediaProv} subtitle="nota de prova" accent={chart.purple} />
            )}
          </div>

          {/* ── Builder de provas (coordenador) ── */}
          {!usuario_eh_instrutor && (
            <BuilderProvas treinamentos={treinamentos} onSalvo={() => carregar(usuario)} />
          )}

          {/* ── Barra de filtros ── */}
          <div style={filterBar}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                { key: "todos",    label: "Todas as turmas"  },
                { key: "pendentes",label: "Sem avaliação"   },
                { key: "reforco",  label: "Com reforço"     },
              ].map(({ key, label }) => (
                <button key={key}
                  onClick={() => setFiltroStatus(key)}
                  style={{
                    ...pillBtn,
                    background: filtroStatus === key ? colors.accent : "#fff",
                    color:      filtroStatus === key ? "#fff"         : "#475569",
                    border:     `1.5px solid ${filtroStatus === key ? colors.accent : "#e2e8f0"}`,
                    fontWeight: filtroStatus === key ? 800 : 600,
                  }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8"
                strokeWidth="2.2" strokeLinecap="round"
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar turma ou instrutor…"
                style={{ ...searchInput, paddingLeft: 32 }}
              />
            </div>

            <span style={{ fontSize: 13, color: "#94a3b8", marginLeft: "auto" }}>
              {turmasVisiveis.length} turma{turmasVisiveis.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* ── Cards de turma ── */}
          {turmasVisiveis.length === 0 ? (
            <div style={emptyState}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📋</div>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: 14 }}>
                {busca
                  ? "Nenhuma turma encontrada para a busca."
                  : usuario_eh_instrutor
                    ? "Você não tem turmas atribuídas com avaliações."
                    : "Nenhuma turma disponível."}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {turmasVisiveis.map((turma) => (
                <TurmaAvaliacaoCard
                  key={turma.id}
                  turma={turma}
                  avaliacoesDaTurma={avaliacoesPorTurma[String(turma.id)] || []}
                  usuario={usuario}
                  onAvaliacaoSalva={() => carregar(usuario)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </PortalShell>
  );
}

/* ── Estilos ── */
const kpiGrid  = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 };
const filterBar = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14, background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: "12px 14px" };
const pillBtn  = { height: 34, padding: "0 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" };
const searchInput = { height: 36, width: "100%", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 13, color: "#334155", outline: "none", paddingRight: 10, boxSizing: "border-box" };

const turmaCard       = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(15,23,42,.04)" };
const turmaCardHeader = { display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", cursor: "pointer", userSelect: "none" };
const turmaNome       = { fontSize: 15, fontWeight: 800, color: "#0f172a" };
const turmaMeta       = { fontSize: 12, color: "#64748b", marginTop: 2 };
const turmaKpis       = { display: "flex", gap: 16, marginLeft: "auto" };
const chevron         = { fontSize: 12, color: "#94a3b8", flexShrink: 0 };

const alertaStrip = { background: "#fff7ed", borderTop: "1px solid #fed7aa", padding: "7px 16px", fontSize: 12, fontWeight: 600, color: "#c2410c" };

const listaWrap = { borderTop: "1px solid #f1f5f9" };
const treinandoRow = { display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 16px", borderBottom: "1px solid #f8fafc", flexWrap: "wrap" };
const treinandoInfo = { display: "flex", alignItems: "center", gap: 8, minWidth: 200, flex: "1 1 200px" };
const treinandoNome = { fontSize: 13, fontWeight: 700, color: "#0f172a" };
const notasRow = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", flex: "1 1 auto" };
const treinandoAcoes = { display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" };

const reforcoTag = { fontSize: 11, fontWeight: 700, color: colors.dangerText, background: colors.dangerLight, borderRadius: 999, padding: "3px 8px" };
const comentarioTxt = { fontSize: 11, color: "#94a3b8", fontStyle: "italic" };
const pill = { display: "inline-block", borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 700 };

const inlineFormWrap = { width: "100%", background: "#f8fbff", border: "1px solid #dbeafe", borderRadius: 10, padding: "12px 14px", marginTop: 8 };
const inlineFormRow  = { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" };
const miniInput  = { height: 34, borderRadius: 8, border: "1px solid #e2e8f0", padding: "0 8px", fontSize: 13, color: "#334155", outline: "none", width: 80, boxSizing: "border-box" };
const miniLabel  = { fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase" };
const errSmall   = { fontSize: 12, color: colors.dangerText, fontWeight: 600, marginBottom: 8 };

const btnLancar       = { background: colors.accent,       color: "#fff",         border: 0, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const btnEditar       = { background: "#dbeafe",            color: "#1d4ed8",      border: 0, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const btnExcluir      = { background: colors.dangerLight,   color: colors.dangerText, border: 0, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const btnSalvarInline = { background: colors.accent,        color: "#fff",         border: 0, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const btnCancelarInline = { background: "#f1f5f9",          color: "#64748b",      border: 0, borderRadius: 8, padding: "7px 10px", cursor: "pointer", fontSize: 12 };

const btnBuilder = { width: "100%", background: "#f8fafc", border: "1px dashed #e2e8f0", borderRadius: 12, padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#334155", textAlign: "left", marginBottom: 2 };
const builderWrap = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 18, marginBottom: 16 };
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

const loadingBox = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, color: "#64748b" };
const errorBox   = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 12 };
const successBox = { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 12 };
const emptyState = { textAlign: "center", padding: "36px 16px", border: "1px dashed #e2e8f0", borderRadius: 14, background: "#fafafa" };
const hint       = { fontSize: 13, color: "#94a3b8", padding: "8px 16px" };
