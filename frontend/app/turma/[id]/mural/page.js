"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import TurmaTabs from "../../../../components/TurmaTabs";
import { apiFetch } from "../../../../services/api";
import { formatDateBR } from "../../../../lib/date";
import { colors, radius, corDoCliente } from "../../../../lib/theme";

const ICONE_POR_TIPO = {
  publicacao: "📌",
  avaliacao: "📝",
  material: "📚",
  chamada: "✅",
};

function formatDataHora(value) {
  if (!value) return "data não registrada";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "data não registrada";
  return d.toLocaleDateString("pt-BR");
}

export default function MuralTurmaPage() {
  const params = useParams();
  const id = params?.id;

  const [treinamento, setTreinamento] = useState(null);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [fixado, setFixado] = useState(false);
  const [publicando, setPublicando] = useState(false);

  const [editandoId, setEditandoId] = useState(null);
  const [edicaoConteudo, setEdicaoConteudo] = useState("");

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function carregar() {
    if (!id) return;
    try {
      setLoading(true);
      const resposta = await apiFetch(`/turma-mural/${id}`);
      setTreinamento(resposta?.treinamento || null);
      setFeed(Array.isArray(resposta?.feed) ? resposta.feed : []);
      setErro("");
    } catch (error) {
      setErro(error.message || "Erro ao carregar o mural.");
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
      setTitulo("");
      setConteudo("");
      setFixado(false);
      await carregar();
    } catch (error) {
      setErro(error.message || "Erro ao publicar aviso.");
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
    } catch (error) {
      setErro(error.message || "Erro ao editar aviso.");
    }
  }

  async function excluir(itemId) {
    if (!window.confirm("Excluir este aviso do mural?")) return;
    try {
      await apiFetch(`/turma-mural/publicacao/${itemId}`, { method: "DELETE" });
      await carregar();
    } catch (error) {
      setErro(error.message || "Erro ao excluir aviso.");
    }
  }

  const cor = corDoCliente(treinamento?.cliente);

  return (
    <div style={{ minHeight: "100vh", background: colors.surfaceMuted, padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ background: cor.bg, borderRadius: radius.md, padding: "16px 20px" }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: cor.text, fontWeight: 600 }}>
            {treinamento?.cliente || "—"}
          </p>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.textPrimary }}>
            {treinamento?.tema || (loading ? "Carregando..." : "Turma")}
          </h1>
          <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, color: colors.textSecondary }}>
            <span>{treinamento?.participantes || 0} treinandos</span>
            <span>{treinamento?.instrutor || "-"}</span>
            <span>{formatDateBR(treinamento?.data_inicio || treinamento?.data)}{treinamento?.data_fim ? ` até ${formatDateBR(treinamento.data_fim)}` : ""}</span>
          </div>
        </div>

        <TurmaTabs id={id} ativa="mural" />

        {erro && (
          <div style={{ background: colors.dangerLight, color: colors.dangerText, borderRadius: radius.sm, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
            {erro}
          </div>
        )}

        <div style={{ borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: 16, marginBottom: 16 }}>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título (opcional)"
            style={{ width: "100%", border: "none", outline: "none", fontSize: 14, fontWeight: 600, marginBottom: 8 }}
          />
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            placeholder="Publicar um aviso para a turma..."
            rows={3}
            style={{ width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: 10, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.textSecondary }}>
              <input type="checkbox" checked={fixado} onChange={(e) => setFixado(e.target.checked)} />
              Fixar no topo
            </label>
            <button
              onClick={publicar}
              disabled={publicando || !conteudo.trim()}
              style={{
                height: 34, padding: "0 16px", fontSize: 13, fontWeight: 700, borderRadius: radius.sm,
                background: conteudo.trim() ? colors.primary : colors.neutralLight,
                color: conteudo.trim() ? "#fff" : colors.textMuted,
                border: "none", cursor: conteudo.trim() ? "pointer" : "default",
              }}
            >
              {publicando ? "Publicando..." : "Publicar"}
            </button>
          </div>
        </div>

        {loading && <p style={{ fontSize: 13, color: colors.textSecondary }}>Carregando mural...</p>}
        {!loading && feed.length === 0 && (
          <p style={{ fontSize: 13, color: colors.textMuted }}>
            Nada por aqui ainda. Avaliações publicadas, materiais adicionados e chamadas concluídas vão aparecer automaticamente.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {feed.map((item) => (
            <div key={item.id} style={{ borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: "14px 16px" }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: colors.surfaceMuted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>
                  {ICONE_POR_TIPO[item.tipo] || "•"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editandoId === item.id ? (
                    <div>
                      <textarea
                        value={edicaoConteudo}
                        onChange={(e) => setEdicaoConteudo(e.target.value)}
                        rows={3}
                        style={{ width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.sm, padding: 8, fontSize: 13, fontFamily: "inherit" }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <button onClick={() => salvarEdicao(item.registro_id)} style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: colors.primary, border: "none", borderRadius: radius.sm, padding: "6px 12px", cursor: "pointer" }}>Salvar</button>
                        <button onClick={() => setEditandoId(null)} style={{ fontSize: 12, color: colors.textSecondary, background: "none", border: "none", cursor: "pointer" }}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p style={{ margin: 0, fontSize: 13, color: colors.textPrimary }}>
                        <span style={{ fontWeight: 600 }}>{item.titulo}</span>
                        {item.fixado && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: colors.warningText, background: colors.warningLight, borderRadius: radius.pill, padding: "2px 8px" }}>
                            fixado
                          </span>
                        )}
                      </p>
                      {item.descricao && (
                        <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.textSecondary }}>{item.descricao}</p>
                      )}
                      <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 12, color: colors.textMuted }}>
                        <span>{item.autor || "Sistema"} · {formatDataHora(item.data)}</span>
                        {item.editavel && (
                          <>
                            <button
                              onClick={() => { setEditandoId(item.registro_id); setEdicaoConteudo(item.descricao || ""); }}
                              style={{ background: "none", border: "none", color: colors.primary, cursor: "pointer", fontSize: 12, padding: 0 }}
                            >
                              editar
                            </button>
                            <button
                              onClick={() => excluir(item.registro_id)}
                              style={{ background: "none", border: "none", color: colors.dangerText, cursor: "pointer", fontSize: 12, padding: 0 }}
                            >
                              excluir
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
