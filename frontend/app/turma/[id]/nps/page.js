"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import TurmaTabs from "../../../../components/TurmaTabs";
import { apiFetch, getStoredUser } from "../../../../services/api";
import { colors, radius, corDoCliente } from "../../../../lib/theme";


function classificar(nota) {
  const valor = Number(nota || 0);
  if (valor >= 9) return "Promotor";
  if (valor >= 7) return "Neutro";
  return "Detrator";
}

function corClassificacao(tipo) {
  if (tipo === "Promotor") return { background: colors.successLight, color: colors.successText };
  if (tipo === "Neutro") return { background: colors.warningLight, color: colors.warningText };
  return { background: colors.dangerLight, color: colors.dangerText };
}

export default function NpsTurmaPage() {
  const params = useParams();
  const id = params?.id;

  const [treinamento, setTreinamento] = useState(null);
  const [respostas, setRespostas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    setUsuario(getStoredUser());
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function carregar() {
    if (!id) return;
    try {
      setLoading(true);
      const [treinamentoData, npsData] = await Promise.all([
        apiFetch(`/treinamentos`).then((lista) => (Array.isArray(lista) ? lista.find((t) => String(t.id) === String(id)) : null)).catch(() => null),
        apiFetch("/avaliacoes-treinandos").catch(() => []),
      ]);
      setTreinamento(treinamentoData || null);
      const daTurma = (Array.isArray(npsData) ? npsData : []).filter(
        (r) => String(r.treinamento_id) === String(id) && r.nota_nps != null
      );
      setRespostas(daTurma);
      setErro("");
    } catch (error) {
      setErro(error.message || "Erro ao carregar NPS.");
    } finally {
      setLoading(false);
    }
  }

  const cor = corDoCliente(treinamento?.cliente);
  const ehTreinando = usuario?.perfil === "treinando";

  const total = respostas.length;
  const promotores = respostas.filter((r) => Number(r.nota_nps) >= 9).length;
  const neutros = respostas.filter((r) => Number(r.nota_nps) >= 7 && Number(r.nota_nps) <= 8).length;
  const detratores = respostas.filter((r) => Number(r.nota_nps) <= 6).length;
  const nps = total ? Math.round((promotores / total) * 100 - (detratores / total) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", background: colors.surfaceMuted, padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ background: cor.bg, borderRadius: radius.md, padding: "16px 20px" }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: cor.text, fontWeight: 600 }}>{treinamento?.cliente || "—"}</p>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.textPrimary }}>
            {treinamento?.tema || (loading ? "Carregando..." : "Turma")}
          </h1>
        </div>

        <TurmaTabs id={id} ativa="nps" />

        {erro && (
          <div style={{ background: colors.dangerLight, color: colors.dangerText, borderRadius: radius.sm, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
            {erro}
          </div>
        )}

        {ehTreinando ? (
          <div style={{ borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: 20, textAlign: "center" }}>
            <p style={{ fontSize: 14, color: colors.textPrimary, margin: "0 0 12px" }}>
              Conte pra gente como foi sua experiência nesta turma.
            </p>
            <a
              href={`/responder-nps?treinamento_id=${id}`}
              style={{ display: "inline-block", padding: "10px 18px", borderRadius: radius.sm, background: colors.primary, color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
            >
              Responder NPS
            </a>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                { label: "NPS", value: nps, color: colors.primary },
                { label: "Promotores", value: promotores, color: colors.success },
                { label: "Neutros", value: neutros, color: colors.warning },
                { label: "Detratores", value: detratores, color: colors.danger },
              ].map((c) => (
                <div key={c.label} style={{ flex: "1 1 140px", borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: "12px 16px" }}>
                  <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>{c.label}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</p>
                </div>
              ))}
            </div>

            {loading && <p style={{ fontSize: 13, color: colors.textSecondary }}>Carregando...</p>}
            {!loading && respostas.length === 0 && (
              <p style={{ fontSize: 13, color: colors.textMuted }}>Ninguém respondeu o NPS desta turma ainda.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {respostas.map((r) => {
                const tipo = classificar(r.nota_nps);
                return (
                  <div key={r.id} style={{ borderRadius: radius.md, border: `0.5px solid ${colors.border}`, padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{r.treinando_nome || "-"}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16, fontWeight: 800 }}>{r.nota_nps}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: radius.pill, padding: "3px 9px", ...corClassificacao(tipo) }}>{tipo}</span>
                      </div>
                    </div>
                    {r.comentario && <p style={{ margin: "6px 0 0", fontSize: 12, color: colors.textSecondary }}>{r.comentario}</p>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
