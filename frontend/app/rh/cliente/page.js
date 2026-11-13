"use client";

// Área do cliente (13/11/2026): o usuário com perfil "Cliente (RH)" só vê as pesquisas de clima que o coordenador do RH liberou
// para o cliente dele. Somente leitura.
import { useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import { apiFetch } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { st, fmtN, fmtDia } from "../../../components/RhUi";

export default function MinhasPesquisasPage() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    apiFetch("/rh/cliente/ciclos").then(setD).catch((e) => setErro(e.message || "Não foi possível carregar as pesquisas."));
  }, []);

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas" title="Minhas pesquisas" subtitle={d?.clientes?.length ? `Resultados liberados para ${d.clientes.join(", ")}` : "Resultados das pesquisas de clima liberados para você"} />
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}
      {!d && !erro ? <p style={{ marginTop: 16, color: colors.textMuted }}>Carregando…</p> : null}
      {d && !d.ciclos.length ? (
        <div style={{ ...st.card, marginTop: 16, textAlign: "center", padding: 32 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Nenhuma pesquisa liberada ainda</h3>
          <p style={{ margin: 0, color: colors.textSecondary, fontSize: 13.5 }}>Quando o RH liberar um resultado para o seu cliente, ele aparece aqui.</p>
        </div>
      ) : null}
      {d?.ciclos?.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, marginTop: 16 }}>
          {d.ciclos.map((c) => (
            <div key={c.id} style={st.card}>
              <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>{c.nome}</h3>
              <p style={{ margin: "0 0 10px", fontSize: 12.5, color: colors.textSecondary }}>{c.cliente ? `${c.cliente} · ` : ""}Respostas de {fmtDia(c.data_ini)} a {fmtDia(c.data_fim)}</p>
              <p style={{ margin: "0 0 12px", fontSize: 13 }}><strong>{fmtN(c.n_respondentes)}</strong> respondentes{c.planos ? <> · <strong>{c.planos}</strong> {c.planos === 1 ? "plano de ação" : "planos de ação"}</> : null}</p>
              <Link href={`/rh/cliente/ciclo?id=${c.id}`} style={{ ...st.btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Abrir resultado</Link>
            </div>
          ))}
        </div>
      ) : null}
    </PortalShell>
  );
}
