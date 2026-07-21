"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import TurmaTabs from "../../../../components/TurmaTabs";
import { apiFetch, getStoredUser } from "../../../../services/api";
import { colors, radius, corDoCliente } from "../../../../lib/theme";


export default function AvaliacoesTurmaPage() {
  const params = useParams();
  const id = params?.id;

  const [treinamento, setTreinamento] = useState(null);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [usuario, setUsuario] = useState(null);

  const [editandoId, setEditandoId] = useState(null);
  const [notaEdicao, setNotaEdicao] = useState("");

  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoTreinando, setNovoTreinando] = useState("");
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    setUsuario(getStoredUser());
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function carregar() {
    if (!id) return;
    try {
      setLoading(true);
      const [treinamentoData, avaliacoesData] = await Promise.all([
        apiFetch(`/treinamentos`).then((lista) => (Array.isArray(lista) ? lista.find((t) => String(t.id) === String(id)) : null)).catch(() => null),
        apiFetch("/avaliacoes").catch(() => []),
      ]);
      setTreinamento(treinamentoData || null);
      const daTurma = (Array.isArray(avaliacoesData) ? avaliacoesData : []).filter(
        (a) => String(a.treinamento_id) === String(id)
      );
      setAvaliacoes(daTurma);
      setErro("");
    } catch (error) {
      setErro(error.message || "Erro ao carregar avaliações.");
    } finally {
      setLoading(false);
    }
  }

  async function criarAvaliacao() {
    if (!novoTitulo.trim() || !novoTreinando.trim()) return;
    try {
      setCriando(true);
      await apiFetch("/avaliacoes", {
        method: "POST",
        body: JSON.stringify({
          treinamento_id: Number(id),
          titulo: novoTitulo.trim(),
          treinando_nome: novoTreinando.trim(),
        }),
      });
      setNovoTitulo("");
      setNovoTreinando("");
      await carregar();
    } catch (error) {
      setErro(error.message || "Erro ao lançar avaliação.");
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
    } catch (error) {
      setErro(error.message || "Erro ao salvar nota.");
    }
  }

  async function excluirAvaliacao(avaliacaoId) {
    if (!window.confirm("Excluir esta avaliação?")) return;
    try {
      await apiFetch(`/avaliacoes/${avaliacaoId}`, { method: "DELETE" });
      await carregar();
    } catch (error) {
      setErro(error.message || "Erro ao excluir avaliação.");
    }
  }

  const cor = corDoCliente(treinamento?.cliente);
  const ehTreinando = usuario?.perfil === "treinando";
  const mediaTurma = avaliacoes.length
    ? (avaliacoes.reduce((acc, a) => acc + Number(a.nota_prova || 0), 0) / avaliacoes.length).toFixed(1)
    : "-";
  const pendentesCorrigir = avaliacoes.filter((a) => a.nota_prova === null || a.nota_prova === undefined).length;

  return (
    <div style={{ minHeight: "100vh", background: colors.surfaceMuted, padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ background: cor.bg, borderRadius: radius.md, padding: "16px 20px" }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: cor.text, fontWeight: 600 }}>{treinamento?.cliente || "—"}</p>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.textPrimary }}>
            {treinamento?.tema || (loading ? "Carregando..." : "Turma")}
          </h1>
        </div>

        <TurmaTabs id={id} ativa="avaliacoes" />

        {erro && (
          <div style={{ background: colors.dangerLight, color: colors.dangerText, borderRadius: radius.sm, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
            {erro}
          </div>
        )}

        {ehTreinando ? (
          <div style={{ borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: 20, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: colors.textPrimary, margin: "0 0 12px" }}>
              Você tem avaliações pendentes desta turma para responder.
            </p>
            <a
              href={`/responder-avaliacao?treinamento_id=${id}`}
              style={{ display: "inline-block", padding: "10px 18px", borderRadius: radius.sm, background: colors.primary, color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
            >
              Responder avaliação
            </a>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1, borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: "12px 16px" }}>
                <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>Média da turma</p>
                <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: colors.primary }}>{mediaTurma}</p>
              </div>
              <div style={{ flex: 1, borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: "12px 16px" }}>
                <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>Aguardando correção</p>
                <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: pendentesCorrigir > 0 ? colors.warning : colors.success }}>{pendentesCorrigir}</p>
              </div>
            </div>

            <div style={{ borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: 16, marginBottom: 16 }}>
              <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>Lançar nova avaliação</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={novoTitulo}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                  placeholder="Título (ex: Avaliação final)"
                  style={{ flex: "2 1 200px", padding: "8px 10px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, fontSize: 13 }}
                />
                <input
                  value={novoTreinando}
                  onChange={(e) => setNovoTreinando(e.target.value)}
                  placeholder="Nome do treinando"
                  style={{ flex: "1 1 160px", padding: "8px 10px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, fontSize: 13 }}
                />
                <button
                  onClick={criarAvaliacao}
                  disabled={criando || !novoTitulo.trim() || !novoTreinando.trim()}
                  style={{ padding: "0 16px", borderRadius: radius.sm, border: "none", background: colors.primary, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  {criando ? "Lançando..." : "Lançar"}
                </button>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 11, color: colors.textMuted }}>
                Para criar provas com questões, use a <a href="/avaliacoes" style={{ color: colors.primary }}>biblioteca de avaliações</a>.
              </p>
            </div>

            {loading && <p style={{ fontSize: 13, color: colors.textSecondary }}>Carregando...</p>}
            {!loading && avaliacoes.length === 0 && (
              <p style={{ fontSize: 13, color: colors.textMuted }}>Nenhuma avaliação lançada para esta turma ainda.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {avaliacoes.map((a) => (
                <div key={a.id} style={{ borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{a.titulo || "Avaliação"}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.textSecondary }}>{a.treinando_nome || "-"}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {editandoId === a.id ? (
                      <>
                        <input
                          type="number"
                          value={notaEdicao}
                          onChange={(e) => setNotaEdicao(e.target.value)}
                          style={{ width: 60, padding: "6px 8px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, fontSize: 13 }}
                        />
                        <button onClick={() => salvarNota(a.id)} style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: colors.primary, border: "none", borderRadius: radius.sm, padding: "6px 12px", cursor: "pointer" }}>Salvar</button>
                        <button onClick={() => setEditandoId(null)} style={{ fontSize: 12, color: colors.textSecondary, background: "none", border: "none", cursor: "pointer" }}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 16, fontWeight: 800, color: a.nota_prova != null ? colors.textPrimary : colors.textMuted }}>
                          {a.nota_prova != null ? Number(a.nota_prova).toFixed(1) : "—"}
                        </span>
                        <button
                          onClick={() => { setEditandoId(a.id); setNotaEdicao(a.nota_prova ?? ""); }}
                          style={{ fontSize: 12, color: colors.primary, background: "none", border: "none", cursor: "pointer" }}
                        >
                          {a.nota_prova != null ? "corrigir" : "lançar nota"}
                        </button>
                        <button onClick={() => excluirAvaliacao(a.id)} style={{ fontSize: 12, color: colors.dangerText, background: "none", border: "none", cursor: "pointer" }}>excluir</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
