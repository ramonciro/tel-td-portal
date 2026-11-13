"use client";

// Comparativo do Canguru entre dois períodos (13/11/2026): o que mudou nas avaliações de 30, 60 e 90 dias, por site e por serviço.
// Serve à equipe do RH (/rh/canguru/comparativo, com filtro de site e serviço) e ao cliente (/rh/cliente/canguru/comparativo,
// já limitado aos serviços que o RH liberou). Só números agregados; menos de 5 novatos não é comparado.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "./PortalShell";
import PageHero from "./PageHero";
import StatCard from "./StatCard";
import { apiFetch, apiDownload } from "../services/api";
import { colors } from "../lib/theme";
import { st, Campo, Select, pct1, dec1, fmtN, fmtDia, COR_RH } from "./RhUi";
import { RiscoPill } from "./CangaruUi";

const sinal = (v, casas = 1) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`);
const TEND = {
  melhorou: { txt: "Melhorou", seta: "▲", cor: colors.successText, bg: colors.successLight },
  piorou: { txt: "Piorou", seta: "▼", cor: colors.dangerText, bg: colors.dangerLight },
  estavel: { txt: "Estável", seta: "●", cor: colors.textSecondary, bg: colors.neutralLight },
};
function Variacao({ d, t, un = "p.p.", casas = 1 }) {
  if (d === null || d === undefined) return <span style={{ color: colors.textMuted }}>—</span>;
  const x = TEND[t] || TEND.estavel;
  return <span title={x.txt} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 999, background: x.bg, color: x.cor, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}><span aria-hidden="true">{x.seta}</span>{sinal(d, casas)} {un}<span style={{ fontWeight: 600 }}>· {x.txt}</span></span>;
}
// "antes → depois" mais a variação logo abaixo
function Par({ m, fmt, un, casas }) {
  if (!m || (m.a === null && m.b === null)) return <span style={{ color: colors.textMuted }}>—</span>;
  return <div><div style={{ fontSize: 13 }}>{fmt(m.a)} → <strong>{fmt(m.b)}</strong></div><div style={{ marginTop: 3 }}><Variacao d={m.delta} t={m.tendencia} un={un} casas={casas} /></div></div>;
}

export default function CangaruComparativo({ cliente = false }) {
  const base = cliente ? "/rh/cliente/canguru/comparativo" : "/rh/canguru/comparativo";
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [f, setF] = useState({ a_de: "", a_ate: "", b_de: "", b_ate: "", site: "", servico: "" });
  const [opcoes, setOpcoes] = useState({ sites: [], servicos: [] });

  const qs = (x) => { const p = new URLSearchParams(); Object.entries(x).forEach(([k, v]) => { if (v) p.set(k, v); }); return p.toString(); };
  const carregar = useCallback(async (x) => {
    setCarregando(true); setErro("");
    try {
      const r = await apiFetch(`${base}?${qs(x)}`);
      setD(r);
      setF((o) => ({ ...o, a_de: r.periodo_a.de, a_ate: r.periodo_a.ate, b_de: r.periodo_b.de, b_ate: r.periodo_b.ate }));
      if (r.filtros) setOpcoes(r.filtros);
    } catch (e) { setErro(e.message || "Não foi possível comparar os períodos."); }
    finally { setCarregando(false); }
  }, [base]);
  useEffect(() => { carregar({}); }, [carregar]);

  const mudar = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const comparar = () => carregar(f);
  const padrao = () => { const n = { a_de: "", a_ate: "", b_de: "", b_ate: "", site: f.site, servico: f.servico }; setF(n); carregar(n); };
  const g = d?.geral;
  const etapaCol = [["Expectativas atendidas", "expectativas", pct1, "p.p.", 1], ["Acolhidos", "acolhimento", pct1, "p.p.", 1], ["Líder bom gestor", "lideranca", pct1, "p.p.", 1], ["Com sinal de atenção", "com_sinal", pct1, "p.p.", 1], ["Nota atividades", "nota_atividades", dec1, "pt", 2], ["Nota apoio", "nota_apoio", dec1, "pt", 2], ["Nota clima com colegas", "nota_clima", dec1, "pt", 2]];
  const blocos = d ? [["Por site", d.por_site], ["Por serviço", d.por_servico]].filter(([, l]) => l?.length) : [];

  return (
    <PortalShell>
      <PageHero eyebrow={cliente ? "Relações Humanas · Projeto Canguru" : "Relações Humanas · Projeto Canguru"} title="Comparar períodos do Canguru" subtitle="O que mudou nas avaliações dos novatos entre dois períodos."
        actions={d && !cliente ? <button type="button" style={{ ...st.btnGhost, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }} onClick={() => apiDownload(`${base}/exportar?${qs(f)}`, "comparativo_canguru.xlsx").catch((e) => setErro(e.message))}>Exportar Excel</button> : null} />
      {cliente ? <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}><Link href="/rh/cliente/canguru" style={{ ...st.btnGhost, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Voltar ao Canguru</Link></div> : null}
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}

      <div style={{ ...st.card, marginTop: 16 }}>
        <div style={st.filtros}>
          <Campo label="Período anterior: de" minWidth={150}><input style={st.input} type="date" value={f.a_de} onChange={(e) => mudar("a_de", e.target.value)} /></Campo>
          <Campo label="até" minWidth={150}><input style={st.input} type="date" value={f.a_ate} onChange={(e) => mudar("a_ate", e.target.value)} /></Campo>
          <Campo label="Período atual: de" minWidth={150}><input style={st.input} type="date" value={f.b_de} onChange={(e) => mudar("b_de", e.target.value)} /></Campo>
          <Campo label="até" minWidth={150}><input style={st.input} type="date" value={f.b_ate} onChange={(e) => mudar("b_ate", e.target.value)} /></Campo>
          {!cliente ? <Campo label="Site" minWidth={170}><Select value={f.site} onChange={(v) => mudar("site", v)} vazio="Todos os sites" opcoes={(opcoes.sites || []).map((s) => ({ value: s.valor, label: s.rotulo }))} /></Campo> : null}
          {!cliente ? <Campo label="Serviço" minWidth={200}><Select value={f.servico} onChange={(v) => mudar("servico", v)} vazio="Todos os serviços" opcoes={(opcoes.servicos || []).map((s) => ({ value: s, label: s }))} /></Campo> : null}
          <div style={{ alignSelf: "flex-end", display: "flex", gap: 8 }}>
            <button type="button" style={{ ...st.btn, background: COR_RH }} onClick={comparar} disabled={carregando}>{carregando ? "Comparando…" : "Comparar"}</button>
            <button type="button" style={st.btnGhost} onClick={padrao} disabled={carregando}>Últimos 30 dias</button>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: colors.textSecondary }}>Conta as avaliações pela data em que foram respondidas. Os dois períodos não podem se sobrepor.</p>
      </div>

      {!d && carregando ? <p style={{ marginTop: 16, color: colors.textMuted }}>Carregando…</p> : null}
      {d ? (
        <>
          <div style={{ ...st.card, marginTop: 16 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
              <strong>{fmtDia(d.periodo_a.de)} a {fmtDia(d.periodo_a.ate)}</strong> comparado com <strong>{fmtDia(d.periodo_b.de)} a {fmtDia(d.periodo_b.ate)}</strong>. {g.poucos ? "Há poucos novatos em um dos períodos para comparar com segurança." : d.resumo}
            </p>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12.5, color: colors.textSecondary }}>{(d.avisos || []).map((a) => <li key={a}>{a}</li>)}</ul>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginTop: 16 }}>
            <StatCard title="Novatos avaliados" value={`${fmtN(g.a.novatos)} → ${fmtN(g.b.novatos)}`} subtitle="anterior → atual" accent="#2563eb" />
            <StatCard title="Avaliações respondidas" value={`${fmtN(g.a.avaliacoes)} → ${fmtN(g.b.avaliacoes)}`} subtitle="anterior → atual" accent="#7c3aed" />
            <StatCard title="Com sinal de atenção" value={g.poucos ? "—" : `${pct1(g.a.com_sinal_pct)} → ${pct1(g.b.com_sinal_pct)}`} subtitle={g.poucos ? "Poucos dados" : `${sinal(g.delta_sinal)} p.p. · ${(TEND[g.tendencia] || TEND.estavel).txt}`} accent="#f59e0b" />
            <StatCard title="Sinal recorrente" value={`${fmtN(g.a.recorrentes)} → ${fmtN(g.b.recorrentes)}`} subtitle="novatos com sinal em 2+ avaliações" accent="#dc2626" />
          </div>

          <div style={{ ...st.card, marginTop: 16 }}>
            <h3 style={st.cardTitle}>Por avaliação (30, 60 e 90 dias)</h3>
            <p style={{ margin: "-6px 0 10px", fontSize: 12.5, color: colors.textSecondary }}>Em “Com sinal de atenção”, número menor é melhor. Etapas com poucas respostas não são comparadas.</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead><tr><th style={st.th}>Avaliação</th><th style={st.th}>Respostas</th>{etapaCol.map(([t]) => <th key={t} style={st.th}>{t}</th>)}</tr></thead>
                <tbody>
                  {d.etapas.map((e) => (
                    <tr key={e.tipo}>
                      <td style={st.td}><strong>{e.tipo} dias</strong></td>
                      <td style={st.td}>{fmtN(e.a_respostas)} → <strong>{fmtN(e.b_respostas)}</strong></td>
                      {e.poucos ? <td style={{ ...st.td, color: colors.textMuted }} colSpan={etapaCol.length}>Poucos dados em um dos períodos para comparar.</td>
                        : etapaCol.map(([t, k, fmt, un, casas]) => <td key={k} style={st.td}><Par m={e[k]} fmt={fmt} un={un} casas={casas} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {blocos.map(([titulo, linhas]) => (
            <div key={titulo} style={{ ...st.card, marginTop: 16 }}>
              <h3 style={st.cardTitle}>{titulo} (% de novatos com sinal de atenção)</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                  <thead><tr><th style={st.th}>{titulo === "Por site" ? "Site" : "Serviço"}</th><th style={{ ...st.th, textAlign: "right" }}>Novatos (ant. → atual)</th><th style={st.th}>Anterior</th><th style={st.th}>Atual</th><th style={st.th}>Variação</th><th style={st.th}>Risco atual</th></tr></thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.rotulo}>
                        <td style={st.td}><strong>{l.rotulo}</strong></td>
                        <td style={{ ...st.td, textAlign: "right" }}>{fmtN(l.a_novatos)} → {fmtN(l.b_novatos)}</td>
                        <td style={st.td}>{l.a_sinal_pct === null || l.a_sinal_pct === undefined ? <span style={{ color: colors.textMuted }}>Poucos dados</span> : pct1(l.a_sinal_pct)}</td>
                        <td style={st.td}>{l.b_sinal_pct === null || l.b_sinal_pct === undefined ? <span style={{ color: colors.textMuted }}>Poucos dados</span> : <strong>{pct1(l.b_sinal_pct)}</strong>}</td>
                        <td style={st.td}><Variacao d={l.delta} t={l.tendencia} /></td>
                        <td style={st.td}>{l.b_risco ? <RiscoPill risco={l.b_risco} /> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      ) : null}
    </PortalShell>
  );
}
