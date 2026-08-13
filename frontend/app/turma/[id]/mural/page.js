"use client";

import { useEffect, useState }   from "react";
import { useParams }              from "next/navigation";
import TurmaPageShell             from "../../../../components/TurmaPageShell";
import { apiFetch }               from "../../../../services/api";
import { formatDateBR }           from "../../../../lib/date";
import { colors }                 from "../../../../lib/theme";

const TIPO_CONFIG = {
  publicacao: { icone: "📌", label: "Aviso"       },
  avaliacao:  { icone: "📝", label: "Avaliação"   },
  material:   { icone: "📚", label: "Material"    },
  chamada:    { icone: "✅", label: "Chamada"     },
};

function formatDataHora(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function MuralTurmaPage() {
  const { id } = useParams() || {};

  const [treinamento, setTreinamento] = useState(null);
  const [feed,        setFeed]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [erro,        setErro]        = useState("");

  const [titulo,     setTitulo]     = useState("");
  const [conteudo,   setConteudo]   = useState("");
  const [fixado,     setFixado]     = useState(false);
  const [publicando, setPublicando] = useState(false);

  const [editandoId,      setEditandoId]      = useState(null);
  const [edicaoConteudo,  setEdicaoConteudo]  = useState("");

  useEffect(() => { carregar(); }, [id]);

  async function carregar() {
    if (!id) return;
    try {
      setLoading(true);
      const r = await apiFetch(`/turma-mural/${id}`);
      setTreinamento(r?.treinamento || null);
      setFeed(Array.isArray(r?.feed) ? r.feed : []);
      setErro("");
    } catch (e) {
      setErro(e.message || "Erro ao carregar o mural.");
    } finally {
      setLoading(false);
    }
  }

  async function publicar() {
    if (!conteudo.trim()) return;
    try {
      setPublicando(true);
      await apiFetch(`/turma-mural/${id}`, {
        method: "POST",
        body: JSON.stringify({ titulo: titulo.trim() || null, conteudo: conteudo.trim(), fixado }),
      });
      setTitulo(""); setConteudo(""); setFixado(false);
      await carregar();
    } catch (e) {
      setErro(e.message || "Erro ao publicar aviso.");
    } finally {
      setPublicando(false);
    }
  }

  async function salvarEdicao(itemId) {
    try {
      await apiFetch(`/turma-mural/publicacao/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ conteudo: edicaoConteudo }),
      });
      setEditandoId(null);
      await carregar();
    } catch (e) { setErro(e.message || "Erro ao editar."); }
  }

  async function excluir(itemId) {
    if (!window.confirm("Excluir este aviso do mural?")) return;
    try {
      await apiFetch(`/turma-mural/publicacao/${itemId}`, { method: "DELETE" });
      await carregar();
    } catch (e) { setErro(e.message || "Erro ao excluir."); }
  }

  const fixados = feed.filter((i) => i.fixado);
  const resto   = feed.filter((i) => !i.fixado);

  return (
    <TurmaPageShell id={id} treinamento={treinamento} loading={loading} abaAtiva="mural">

      {erro && <div style={errorBox}>{erro}</div>}

      {/* ── Formulário de publicação ── */}
      <div style={postForm}>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título (opcional)"
          style={titleInput}
        />
        <textarea
          value={conteudo}
          onChange={(e) => setConteudo(e.target.value)}
          placeholder="Escreva um aviso para a turma…"
          rows={3}
          style={textArea}
        />
        <div style={postFooter}>
          <label style={checkLabel}>
            <input
              type="checkbox"
              checked={fixado}
              onChange={(e) => setFixado(e.target.checked)}
              style={{ accentColor: colors.accent }}
            />
            Fixar no topo
          </label>
          <button
            onClick={publicar}
            disabled={publicando || !conteudo.trim()}
            style={{
              ...btnPublicar,
              background: conteudo.trim() ? colors.accent : "#e2e8f0",
              color:      conteudo.trim() ? "#fff"         : "#94a3b8",
              cursor:     conteudo.trim() ? "pointer"      : "default",
            }}
          >
            {publicando ? "Publicando…" : "Publicar"}
          </button>
        </div>
      </div>

      {/* ── Feed ── */}
      {loading && <p style={hint}>Carregando mural…</p>}
      {!loading && feed.length === 0 && (
        <div style={emptyState}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📋</div>
          <p style={{ margin: 0, fontSize: 14, color: "#94a3b8" }}>
            Nada aqui ainda. Avisos, chamadas concluídas e avaliações publicadas vão aparecer automaticamente.
          </p>
        </div>
      )}

      {[...fixados, ...resto].map((item) => {
        const cfg = TIPO_CONFIG[item.tipo] || { icone: "•", label: item.tipo || "" };
        return (
          <div key={item.id} style={{ ...feedItem, borderLeft: item.fixado ? `3px solid ${colors.accent}` : "3px solid transparent" }}>
            <div style={feedIcon}>{cfg.icone}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {editandoId === item.id ? (
                <>
                  <textarea
                    value={edicaoConteudo}
                    onChange={(e) => setEdicaoConteudo(e.target.value)}
                    rows={3}
                    style={{ ...textArea, marginBottom: 8 }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => salvarEdicao(item.registro_id)} style={btnSalvar}>Salvar</button>
                    <button onClick={() => setEditandoId(null)} style={btnCancelar}>Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={feedTitle}>
                    {item.titulo}
                    {item.fixado && <span style={fixadoPill}>fixado</span>}
                    <span style={tipoPill}>{cfg.label}</span>
                  </div>
                  {item.descricao && <p style={feedDesc}>{item.descricao}</p>}
                  <div style={feedMeta}>
                    <span>{item.autor || "Sistema"} · {formatDataHora(item.data)}</span>
                    {item.editavel && (
                      <span style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={() => { setEditandoId(item.registro_id); setEdicaoConteudo(item.descricao || ""); }}
                          style={btnLink}
                        >editar</button>
                        <button onClick={() => excluir(item.registro_id)} style={{ ...btnLink, color: colors.dangerText }}>
                          excluir
                        </button>
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </TurmaPageShell>
  );
}

/* ── Estilos ── */
const errorBox = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14 };
const postForm = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 16, marginBottom: 16 };
const titleInput = { width: "100%", boxSizing: "border-box", border: "none", outline: "none", fontSize: 14, fontWeight: 600, color: "#0f172a", padding: "4px 0 8px", borderBottom: "1px solid #f1f5f9", marginBottom: 10 };
const textArea = { width: "100%", boxSizing: "border-box", border: "1px solid #e9eef4", borderRadius: 10, padding: "10px 12px", fontSize: 13, resize: "vertical", fontFamily: "inherit", color: "#334155", outline: "none" };
const postFooter = { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 };
const checkLabel = { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#64748b", cursor: "pointer" };
const btnPublicar = { height: 36, padding: "0 18px", fontSize: 13, fontWeight: 700, borderRadius: 10, border: "none" };
const emptyState = { textAlign: "center", padding: "32px 16px", border: "1px dashed #e2e8f0", borderRadius: 12, background: "#fafafa" };
const hint = { fontSize: 13, color: "#94a3b8" };
const feedItem = { display: "flex", gap: 12, background: "#fff", border: "1px solid #e9eef4", borderRadius: 12, padding: "14px 16px", marginBottom: 8 };
const feedIcon = { width: 34, height: 34, borderRadius: "50%", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 };
const feedTitle = { fontSize: 14, fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" };
const feedDesc = { margin: "4px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.5 };
const feedMeta = { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "#94a3b8", flexWrap: "wrap", gap: 6 };
const fixadoPill = { background: colors.warningLight, color: colors.warningText, fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px" };
const tipoPill = { background: "#f1f5f9", color: "#64748b", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "2px 8px" };
const btnLink = { background: "none", border: "none", color: colors.primary, cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 };
const btnSalvar = { background: colors.accent, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const btnCancelar = { background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12 };
