"use client";

import { useEffect, useState }             from "react";
import { useParams }                       from "next/navigation";
import TurmaPageShell                      from "../../../../components/TurmaPageShell";
import { apiFetch, getStoredUser }         from "../../../../services/api";
import { colors, chart }                   from "../../../../lib/theme";

export default function AvaliacoesTurmaPage() {
  const { id } = useParams() || {};

  const [treinamento,   setTreinamento]   = useState(null);
  const [avaliacoes,    setAvaliacoes]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [erro,          setErro]          = useState("");
  const [usuario,       setUsuario]       = useState(null);

  const [editandoId,    setEditandoId]    = useState(null);
  const [notaEdicao,    setNotaEdicao]    = useState("");

  const [novoTitulo,    setNovoTitulo]    = useState("");
  const [novoTreinando, setNovoTreinando] = useState("");
  const [criando,       setCriando]       = useState(false);

  useEffect(() => {
    setUsuario(getStoredUser());
    carregar();
  }, [id]);

  async function carregar() {
    if (!id) return;
    try {
      setLoading(true);
      // FIX: antes buscava /treinamentos (todos) e filtrava no frontend.
      // Agora usa o endpoint específico /treinamentos/${id} — mais eficiente
      // e sem risco de confundir dados de turmas diferentes.
      const [treinamentoData, avaliacoesData] = await Promise.all([
        apiFetch(`/treinamentos/${id}`).catch(() => null),
        apiFetch("/avaliacoes").catch(() => []),
      ]);
      setTreinamento(treinamentoData || null);
      const daTurma = (Array.isArray(avaliacoesData) ? avaliacoesData : []).filter(
        (a) => String(a.treinamento_id) === String(id)
      );
      setAvaliacoes(daTurma);
      setErro("");
    } catch (e) {
      setErro(e.message || "Erro ao carregar avaliações.");
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

  const ehTreinando = usuario?.perfil === "treinando";
  const media       = avaliacoes.length
    ? (avaliacoes.reduce((acc, a) => acc + Number(a.nota_prova || 0), 0) / avaliacoes.length).toFixed(1)
    : null;
  const pendentes   = avaliacoes.filter((a) => a.nota_prova == null).length;

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
              <span style={kpiLabel}>Aguardando correção</span>
              <span style={{ ...kpiValue, color: pendentes > 0 ? colors.warning : colors.success }}>
                {pendentes}
              </span>
            </div>
            <div style={kpiCard}>
              <span style={kpiLabel}>Total lançado</span>
              <span style={{ ...kpiValue, color: "#334155" }}>{avaliacoes.length}</span>
            </div>
          </div>

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
                onClick={criarAvaliacao}
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
            <p style={formHint}>
              Para provas com questões, use a{" "}
              <a href="/avaliacoes" style={{ color: colors.primary }}>biblioteca de avaliações</a>.
            </p>
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
        </>
      )}
    </TurmaPageShell>
  );
}

/* ── Estilos ── */
const errorBox = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14 };
const cta = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 20, textAlign: "center" };
const linkBtn = { display: "inline-block", padding: "10px 20px", borderRadius: 10, background: colors.accent, color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none" };
const kpiRow = { display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" };
const kpiCard = { flex: "1 1 140px", background: "#fff", border: "1px solid #e9eef4", borderRadius: 12, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 4 };
const kpiLabel = { fontSize: 12, color: "#94a3b8", fontWeight: 600 };
const kpiValue = { fontSize: 26, fontWeight: 800, lineHeight: 1 };
const formCard = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 16, marginBottom: 14 };
const formTitle = { fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 10 };
const formRow = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
const inputBase = { padding: "8px 10px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13, color: "#334155", outline: "none", height: 38, boxSizing: "border-box" };
const btnLancar = { height: 38, padding: "0 18px", borderRadius: 10, border: "none", background: colors.accent, color: "#fff", fontWeight: 700, fontSize: 13 };
const formHint = { margin: "8px 0 0", fontSize: 11, color: "#94a3b8" };
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
