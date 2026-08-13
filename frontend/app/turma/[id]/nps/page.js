"use client";

import { useEffect, useState }       from "react";
import { useParams }                  from "next/navigation";
import TurmaPageShell                 from "../../../../components/TurmaPageShell";
import { apiFetch, getStoredUser }    from "../../../../services/api";
import { colors }                     from "../../../../lib/theme";

function classificar(nota) {
  const n = Number(nota || 0);
  if (n >= 9) return "Promotor";
  if (n >= 7) return "Neutro";
  return "Detrator";
}

function corClassificacao(tipo) {
  if (tipo === "Promotor") return { background: colors.successLight, color: colors.successText };
  if (tipo === "Neutro")   return { background: colors.warningLight, color: colors.warningText };
  return                          { background: colors.dangerLight,  color: colors.dangerText  };
}

function npsColor(nps) {
  if (nps >= 50) return colors.success;
  if (nps >= 0)  return "#f59e0b";
  return colors.danger;
}

export default function NpsTurmaPage() {
  const { id } = useParams() || {};

  const [treinamento, setTreinamento] = useState(null);
  const [respostas,   setRespostas]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [erro,        setErro]        = useState("");
  const [usuario,     setUsuario]     = useState(null);

  useEffect(() => { setUsuario(getStoredUser()); carregar(); }, [id]);

  async function carregar() {
    if (!id) return;
    try {
      setLoading(true);
      // FIX: antes buscava /treinamentos (todos) e filtrava no frontend.
      // Agora usa /treinamentos/${id} — mais eficiente.
      const [treinamentoData, npsData] = await Promise.all([
        apiFetch(`/treinamentos/${id}`).catch(() => null),
        apiFetch("/avaliacoes-treinandos").catch(() => []),
      ]);
      setTreinamento(treinamentoData || null);
      setRespostas(
        (Array.isArray(npsData) ? npsData : []).filter(
          (r) => String(r.treinamento_id) === String(id) && r.nota_nps != null
        )
      );
      setErro("");
    } catch (e) {
      setErro(e.message || "Erro ao carregar NPS.");
    } finally {
      setLoading(false);
    }
  }

  const ehTreinando = usuario?.perfil === "treinando";
  const total       = respostas.length;
  const promotores  = respostas.filter((r) => Number(r.nota_nps) >= 9).length;
  const neutros     = respostas.filter((r) => Number(r.nota_nps) >= 7 && Number(r.nota_nps) <= 8).length;
  const detratores  = respostas.filter((r) => Number(r.nota_nps) <= 6).length;
  const nps         = total
    ? Math.round((promotores / total) * 100 - (detratores / total) * 100)
    : null;

  return (
    <TurmaPageShell id={id} treinamento={treinamento} loading={loading} abaAtiva="nps">

      {erro && <div style={errorBox}>{erro}</div>}

      {ehTreinando ? (
        <div style={cta}>
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "#334155" }}>
            Conte pra gente como foi sua experiência nesta turma.
          </p>
          <a href={`/responder-nps?treinamento_id=${id}`} style={linkBtn}>
            Responder NPS
          </a>
        </div>
      ) : (
        <>
          {/* ── Score NPS + breakdown ── */}
          <div style={kpiRow}>
            {/* Score principal */}
            <div style={{ ...kpiCard, flex: "0 0 auto", minWidth: 120, alignItems: "center", textAlign: "center" }}>
              <span style={kpiLabel}>NPS</span>
              <span style={{ fontSize: 40, fontWeight: 900, color: nps != null ? npsColor(nps) : "#94a3b8", lineHeight: 1 }}>
                {nps != null ? nps : "—"}
              </span>
              {total > 0 && (
                <span style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  {total} resposta{total !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Breakdown */}
            {[
              { label: "Promotores",  value: promotores, color: colors.success },
              { label: "Neutros",     value: neutros,    color: "#f59e0b"      },
              { label: "Detratores",  value: detratores, color: colors.danger  },
            ].map((c) => (
              <div key={c.label} style={kpiCard}>
                <span style={kpiLabel}>{c.label}</span>
                <span style={{ fontSize: 28, fontWeight: 800, color: c.color, lineHeight: 1 }}>
                  {c.value}
                </span>
                {total > 0 && (
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    {Math.round(c.value / total * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Barra de distribuição */}
          {total > 0 && (
            <div style={barraWrap}>
              <div style={{ ...barraSeg, flex: promotores, background: colors.success }} title={`Promotores: ${promotores}`} />
              <div style={{ ...barraSeg, flex: neutros,    background: "#f59e0b"      }} title={`Neutros: ${neutros}`}    />
              <div style={{ ...barraSeg, flex: detratores, background: colors.danger  }} title={`Detratores: ${detratores}`} />
            </div>
          )}

          {/* Lista de respostas */}
          {loading && <p style={hint}>Carregando…</p>}
          {!loading && respostas.length === 0 && (
            <div style={emptyState}>Ninguém respondeu o NPS desta turma ainda.</div>
          )}
          <div style={lista}>
            {respostas.map((r) => {
              const tipo = classificar(r.nota_nps);
              return (
                <div key={r.id} style={respostaItem}>
                  <div style={respostaNome}>{r.treinando_nome || "—"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {r.comentario && (
                      <span style={respostaComentario}>{r.comentario}</span>
                    )}
                    <span style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", minWidth: 24, textAlign: "right" }}>
                      {r.nota_nps}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 9px", ...corClassificacao(tipo) }}>
                      {tipo}
                    </span>
                  </div>
                </div>
              );
            })}
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
const kpiCard = { flex: "1 1 120px", background: "#fff", border: "1px solid #e9eef4", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4 };
const kpiLabel = { fontSize: 12, color: "#94a3b8", fontWeight: 600 };
const barraWrap = { display: "flex", height: 8, borderRadius: 999, overflow: "hidden", marginBottom: 16, gap: 2, background: "#f1f5f9" };
const barraSeg = { minWidth: 4, transition: "flex .3s" };
const hint = { fontSize: 13, color: "#94a3b8" };
const emptyState = { textAlign: "center", padding: "24px 16px", color: "#94a3b8", fontSize: 13, border: "1px dashed #e2e8f0", borderRadius: 12, marginBottom: 8 };
const lista = { display: "flex", flexDirection: "column", gap: 8 };
const respostaItem = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#fff", border: "1px solid #e9eef4", borderRadius: 12, padding: "12px 16px", flexWrap: "wrap" };
const respostaNome = { fontSize: 14, fontWeight: 600, color: "#0f172a" };
const respostaComentario = { fontSize: 12, color: "#64748b", fontStyle: "italic", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
