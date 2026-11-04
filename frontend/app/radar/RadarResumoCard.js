"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../services/api";
import { colors, radius } from "../../lib/theme";
import { GRAV, fmtData } from "./ui";

// Cartão do Radar da semana para o Dashboard (Pacote 3, 26/10/2026). Some sozinho se o perfil não tem acesso.
// `dados` opcional: o Dashboard já busca o Radar uma vez e passa pronto (evita pedir duas vezes
// e garante que o cartão e os faróis mostrem o mesmo número).
export default function RadarResumoCard({ dados } = {}) {
  const [proprio, setD] = useState(null);
  useEffect(() => {
    if (dados !== undefined) return undefined;
    let vivo = true;
    apiFetch("/preventivo/radar-semanal").then((r) => { if (vivo) setD(r); }).catch(() => {});
    return () => { vivo = false; };
  }, [dados]);
  const dd = dados !== undefined ? dados : proprio;
  if (!dd) return null;
  const topo = dd.top5.slice(0, 3);
  const d = dd;
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.lg || radius.md, background: "#fff", padding: "14px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <strong style={{ fontSize: 16, color: colors.textPrimary }}>Radar da semana</strong>
          <span style={{ fontSize: 13, color: colors.textSecondary, marginLeft: 10 }}>
            {d.abertos ? `${d.abertos} risco(s) aberto(s), ${d.por_gravidade.critica} crítico(s)` : "nenhum risco aberto"}
            {d.mudancas.tem_historico ? ` · ${d.mudancas.novos} novo(s), ${d.mudancas.resolvidos} resolvido(s)` : ""}
            {d.prevencao.percentual !== null ? ` · ${d.prevencao.percentual}% tratados a tempo` : ""}
          </span>
        </div>
        <a href="/radar" style={{ color: colors.primary, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Abrir o Radar →</a>
      </div>
      {topo.length > 0 && (
        <ul style={{ margin: "10px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
          {topo.map((i) => {
            const g = GRAV[i.gravidade] || GRAV.media;
            return (
              <li key={i.id} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 14 }}>
                <span style={{ padding: "3px 9px", borderRadius: 999, fontWeight: 800, fontSize: 11, color: g.cor, background: g.bg }}>{g.texto}</span>
                <span style={{ color: colors.textPrimary }}>{i.titulo}</span>
                {i.prazo && <span style={{ fontSize: 12, color: colors.textSecondary }}>prazo {fmtData(i.prazo)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
