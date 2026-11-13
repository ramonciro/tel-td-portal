"use client";

// Resultado de uma pesquisa para o cliente (13/11/2026): relatório no formato "para o cliente", planos de ação que o RH
// marcou como visíveis, Excel e impressão. Somente leitura.
import { useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/PortalShell";
import PageHero from "../../../../components/PageHero";
import { apiFetch, apiDownload } from "../../../../services/api";
import { colors } from "../../../../lib/theme";
import { st, RhRelatorio, COR_RH, fmtN, fmtDia } from "../../../../components/RhUi";

const COR_SITUACAO = { atrasado: "#b91c1c", vence_em_breve: "#b45309" };
const ROTULO_SITUACAO = { atrasado: "Atrasado", vence_em_breve: "Vence em breve" };

export default function ResultadoClientePage() {
  const [id, setId] = useState(null);
  const [rel, setRel] = useState(null);
  const [planos, setPlanos] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("id");
    setId(v && /^\d+$/.test(v) ? v : "");
  }, []);
  useEffect(() => {
    if (id === null) return;
    if (!id) { setErro("Pesquisa não informada."); return; }
    apiFetch(`/rh/cliente/ciclos/${id}/relatorio`).then(setRel).catch((e) => setErro(e.message || "Não foi possível abrir esta pesquisa."));
    apiFetch(`/rh/cliente/ciclos/${id}/planos`).then((r) => setPlanos(r.planos)).catch(() => setPlanos([]));
  }, [id]);

  const baixar = async () => {
    try { await apiDownload(`/rh/cliente/ciclos/${id}/exportar`, `clima_${new Date().toISOString().slice(0, 10)}.xlsx`); }
    catch (e) { setErro(e.message || "Não foi possível baixar o Excel."); }
  };

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas · Minhas pesquisas" title={rel ? rel.ciclo.nome : "Resultado da pesquisa"} subtitle={rel ? `${rel.ciclo.cliente ? `${rel.ciclo.cliente} · ` : ""}${fmtN(rel.ciclo.n_respondentes)} respondentes · respostas de ${fmtDia(rel.ciclo.data_ini)} a ${fmtDia(rel.ciclo.data_fim)}` : ""} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <Link href="/rh/cliente" style={{ ...st.btnGhost, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Voltar</Link>
        {rel ? <button type="button" style={{ ...st.btn, background: COR_RH }} onClick={baixar}>Baixar Excel</button> : null}
        {rel ? <button type="button" style={st.btnGhost} onClick={() => window.open(`/rh/cliente/impressao?id=${id}`, "_blank", "noopener")}>Imprimir / PDF</button> : null}
      </div>
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}
      {!rel && !erro ? <p style={{ marginTop: 16, color: colors.textMuted }}>Carregando…</p> : null}
      {rel ? <div style={{ ...st.card, marginTop: 16 }}><RhRelatorio r={rel} /></div> : null}

      {planos?.length ? (
        <div style={{ ...st.card, marginTop: 16 }}>
          <h3 style={st.cardTitle}>Planos de ação</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={st.th}>Ação</th><th style={st.th}>Tema</th><th style={st.th}>Responsável</th><th style={st.th}>Prazo</th><th style={st.th}>Situação</th></tr></thead>
              <tbody>
                {planos.map((p) => (
                  <tr key={p.id}>
                    <td style={st.td}><strong>{p.titulo}</strong><div style={{ fontSize: 12.5, color: colors.textSecondary }}>{p.acao}</div>{p.resultado ? <div style={{ fontSize: 12.5, marginTop: 4 }}><strong>Resultado:</strong> {p.resultado}</div> : null}</td>
                    <td style={st.td}>{p.tema || "—"}</td>
                    <td style={st.td}>{p.responsavel}</td>
                    <td style={st.td}>{fmtDia(p.prazo)}</td>
                    <td style={st.td}>{p.status_rotulo}{ROTULO_SITUACAO[p.situacao] ? <div style={{ fontSize: 11.5, fontWeight: 800, color: COR_SITUACAO[p.situacao] }}>{ROTULO_SITUACAO[p.situacao]}</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </PortalShell>
  );
}
