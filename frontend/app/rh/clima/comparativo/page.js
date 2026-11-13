"use client";

// Comparativo entre duas pesquisas de clima (13/11/2026): evolução por tema, por afirmação, por nota de área e, se quiser, por recorte.
// Só números agregados. Variação menor que o limiar (2 pontos percentuais) é lida como "estável".
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/PortalShell";
import PageHero from "../../../../components/PageHero";
import StatCard from "../../../../components/StatCard";
import { apiFetch, apiDownload } from "../../../../services/api";
import { colors } from "../../../../lib/theme";
import { st, Campo, Select, FarolPill, pct1, fmtN, fmtDia, dec1, perfilRh, ehOperacaoRh } from "../../../../components/RhUi";

const sinal = (v) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`);
const TEND = {
  melhorou: { txt: "Melhorou", seta: "▲", cor: colors.successText, bg: colors.successLight },
  piorou: { txt: "Piorou", seta: "▼", cor: colors.dangerText, bg: colors.dangerLight },
  estavel: { txt: "Estável", seta: "●", cor: colors.textSecondary, bg: colors.neutralLight },
};
function Variacao({ d, t, un = "p.p." }) {
  if (d === null || d === undefined) return <span style={{ color: colors.textMuted }}>—</span>;
  const x = TEND[t] || TEND.estavel;
  return <span title={x.txt} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 999, background: x.bg, color: x.cor, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}><span aria-hidden="true">{x.seta}</span>{sinal(d)} {un}<span style={{ fontWeight: 600 }}>· {x.txt}</span></span>;
}
function BarraDupla({ a, b }) {
  const w = (v) => `${Math.max(0, Math.min(100, v || 0))}%`;
  return (
    <div role="img" aria-label={`Anterior ${pct1(a)}, atual ${pct1(b)}`} style={{ minWidth: 130 }}>
      <div style={{ height: 6, borderRadius: 999, background: "#e5e7eb", marginBottom: 3 }}><div style={{ width: w(a), height: "100%", borderRadius: 999, background: "#94a3b8" }} /></div>
      <div style={{ height: 6, borderRadius: 999, background: "#e5e7eb" }}><div style={{ width: w(b), height: "100%", borderRadius: 999, background: "#be185d" }} /></div>
    </div>
  );
}

export default function ComparativoPage() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState({ a: "", b: "", recorte: "" });
  const [verAfirmacoes, setVerAfirmacoes] = useState(false);
  const operacao = ehOperacaoRh(perfilRh());

  const carregar = useCallback(async (s) => {
    const p = new URLSearchParams(); Object.entries(s).forEach(([k, v]) => { if (v) p.set(k, v); });
    try { const r = await apiFetch(`/rh/clima/comparativo?${p.toString()}`); setD(r); setErro(""); setSel((x) => ({ ...x, a: String(r.a.id), b: String(r.b.id) })); }
    catch (e) { setErro(e.message || "Não foi possível comparar."); setD(null); }
  }, []);
  useEffect(() => { carregar({}); }, [carregar]);
  const mudar = (k, v) => { const n = { ...sel, [k]: v }; setSel(n); carregar(n); };
  const qsExport = () => { const p = new URLSearchParams(); Object.entries(sel).forEach(([k, v]) => { if (v) p.set(k, v); }); return p.toString(); };

  const g = d?.geral;
  const ciclosOp = (d?.ciclos || []).map((c) => ({ value: String(c.id), label: `${c.nome}${c.data_fim ? ` (${fmtDia(c.data_fim)})` : ""}` }));
  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas · Pesquisa de clima" title="Comparar pesquisas" subtitle="Veja o que melhorou e o que piorou entre duas pesquisas, tema a tema."
        actions={d ? <button type="button" style={{ ...st.btnGhost, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.35)" }} onClick={() => apiDownload(`/rh/clima/comparativo/exportar?${qsExport()}`, "comparativo_clima.xlsx").catch((e) => setErro(e.message))}>Exportar Excel</button> : null} />
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro} {erro.includes("pelo menos duas") && operacao ? <Link href="/rh/clima" style={{ color: "#9d174d", fontWeight: 800 }}>Importar uma pesquisa →</Link> : null}</div> : null}
      {!d && !erro ? <p style={{ marginTop: 16, color: colors.textMuted }}>Carregando…</p> : null}

      {d ? (
        <>
          <div style={{ ...st.card, marginTop: 16 }}>
            <div style={st.filtros}>
              <Campo label="Pesquisa anterior (base)" minWidth={240}><Select value={sel.a} onChange={(v) => mudar("a", v)} opcoes={ciclosOp.filter((o) => o.value !== sel.b)} vazio={null} /></Campo>
              <Campo label="Pesquisa atual" minWidth={240}><Select value={sel.b} onChange={(v) => mudar("b", v)} opcoes={ciclosOp.filter((o) => o.value !== sel.a)} vazio={null} /></Campo>
              <Campo label="Recorte (opcional)" minWidth={200}><Select value={sel.recorte} onChange={(v) => mudar("recorte", v)} opcoes={d.recortes_disponiveis.map((t) => ({ value: t.tipo, label: t.nome }))} vazio="Sem recorte" /></Campo>
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{d.resumo}</p>
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12.5, color: colors.textSecondary }}>{d.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 16 }}>
            <StatCard title="Respondentes" value={`${fmtN(g.a.n)} → ${fmtN(g.b.n)}`} subtitle={g.delta_n === 0 ? "Mesmo número" : `${g.delta_n > 0 ? "+" : "−"}${fmtN(Math.abs(g.delta_n))} pessoas`} accent="#2563eb" />
            <StatCard title="Respostas positivas" value={`${pct1(g.a.pos_pct)} → ${pct1(g.b.pos_pct)}`} subtitle={`${sinal(g.delta_pos)} p.p. · ${(TEND[g.tendencia] || TEND.estavel).txt}`} accent="#16a34a" />
            <StatCard title="Respostas negativas" value={`${pct1(g.a.neg_pct)} → ${pct1(g.b.neg_pct)}`} subtitle={`${sinal(g.delta_neg)} p.p.`} accent="#dc2626" />
            <StatCard title="Nota média das áreas" value={`${dec1(g.a.nota_media)} → ${dec1(g.b.nota_media)}`} subtitle={g.delta_nota === null ? "—" : `${sinal(g.delta_nota)} ponto(s)`} accent="#f59e0b" />
          </div>

          {(d.destaques.saiu_do_vermelho.length || d.destaques.entrou_no_vermelho.length || d.destaques.melhoras.length || d.destaques.quedas.length) ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 16 }}>
              <div style={st.card}>
                <h3 style={st.cardTitle}>O que avançou</h3>
                {d.destaques.melhoras.length ? d.destaques.melhoras.map((t) => <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: `1px solid ${colors.border}`, fontSize: 13.5 }}><strong>{t.nome}</strong><Variacao d={t.delta} t={t.tendencia} /></div>) : <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>Nenhum tema avançou {d.limiar} p.p. ou mais.</p>}
                {d.destaques.saiu_do_vermelho.length ? <p style={{ margin: "10px 0 0", fontSize: 12.5 }}><strong>Saíram do vermelho:</strong> {d.destaques.saiu_do_vermelho.join(", ")}</p> : null}
              </div>
              <div style={st.card}>
                <h3 style={st.cardTitle}>O que recuou</h3>
                {d.destaques.quedas.length ? d.destaques.quedas.map((t) => <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: `1px solid ${colors.border}`, fontSize: 13.5 }}><strong>{t.nome}</strong><Variacao d={t.delta} t={t.tendencia} /></div>) : <p style={{ margin: 0, fontSize: 13, color: colors.textMuted }}>Nenhum tema recuou {d.limiar} p.p. ou mais.</p>}
                {d.destaques.entrou_no_vermelho.length ? <p style={{ margin: "10px 0 0", fontSize: 12.5 }}><strong>Entraram no vermelho:</strong> {d.destaques.entrou_no_vermelho.join(", ")}</p> : null}
                {operacao && (d.destaques.quedas.length || d.destaques.entrou_no_vermelho.length) ? <p style={{ margin: "10px 0 0" }}><Link href="/rh/planos" style={{ color: "#9d174d", fontWeight: 800, fontSize: 12.5 }}>Criar planos de ação →</Link></p> : null}
              </div>
            </div>
          ) : null}

          <div style={{ ...st.card, marginTop: 16 }}>
            <h3 style={st.cardTitle}>Por tema (% de respostas positivas)</h3>
            <p style={{ margin: "-6px 0 10px", fontSize: 12.5, color: colors.textSecondary }}>Barra cinza: {d.a.nome}. Barra rosa: {d.b.nome}.</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead><tr><th style={st.th}>Tema</th><th style={st.th}>Anterior</th><th style={st.th}>Atual</th><th style={st.th} /><th style={st.th}>Variação</th></tr></thead>
                <tbody>
                  {d.temas.map((t) => (
                    <tr key={t.id}>
                      <td style={st.td}><strong>{t.nome}</strong></td>
                      <td style={st.td}><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{pct1(t.a_pos)}<FarolPill farol={t.a_farol} /></span></td>
                      <td style={st.td}><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><strong>{pct1(t.b_pos)}</strong><FarolPill farol={t.b_farol} /></span></td>
                      <td style={st.td}><BarraDupla a={t.a_pos} b={t.b_pos} /></td>
                      <td style={st.td}><Variacao d={t.delta} t={t.tendencia} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {d.recorte ? (
            <div style={{ ...st.card, marginTop: 16 }}>
              <h3 style={st.cardTitle}>Por {d.recorte.nome.toLowerCase()}</h3>
              <p style={{ margin: "-6px 0 10px", fontSize: 12.5, color: colors.textSecondary }}>Só grupos com {d.recorte.minimo} pessoas ou mais na pesquisa atual. “Sem anterior” = o grupo não atingiu o mínimo (ou não existia) na pesquisa anterior.</p>
              {d.recorte.grupos.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                    <thead><tr><th style={st.th}>{d.recorte.nome}</th><th style={{ ...st.th, textAlign: "right" }}>Pessoas (ant. → atual)</th><th style={st.th}>% positivo anterior</th><th style={st.th}>% positivo atual</th><th style={st.th}>Variação</th></tr></thead>
                    <tbody>{d.recorte.grupos.map((x) => (
                      <tr key={x.rotulo}><td style={st.td}><strong>{x.rotulo}</strong></td><td style={{ ...st.td, textAlign: "right" }}>{x.a_n === null ? "—" : fmtN(x.a_n)} → {fmtN(x.b_n)}</td>
                        <td style={st.td}>{x.a_pos === null ? <span style={{ color: colors.textMuted }}>Sem anterior</span> : pct1(x.a_pos)}</td><td style={st.td}><strong>{pct1(x.b_pos)}</strong></td><td style={st.td}><Variacao d={x.delta} t={x.tendencia} /></td></tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p style={st.vazio}>Nenhum grupo com o mínimo de pessoas na pesquisa atual.</p>}
            </div>
          ) : null}

          <div style={{ ...st.card, marginTop: 16 }}>
            <h3 style={st.cardTitle}>Notas das áreas de apoio (0 a 10)</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead><tr><th style={st.th}>Área</th><th style={st.th}>Anterior</th><th style={st.th}>Atual</th><th style={st.th}>Variação</th></tr></thead>
                <tbody>{d.notas.map((n) => <tr key={n.area}><td style={st.td}>{n.area}</td><td style={st.td}>{dec1(n.a_media)}</td><td style={st.td}><strong>{dec1(n.b_media)}</strong></td><td style={st.td}>{n.delta === null ? "—" : <Variacao d={n.delta} t={n.delta >= 0.3 ? "melhorou" : n.delta <= -0.3 ? "piorou" : "estavel"} un="pt" />}</td></tr>)}</tbody>
              </table>
            </div>
          </div>

          <div style={{ ...st.card, marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 style={{ ...st.cardTitle, margin: 0 }}>Por afirmação ({d.afirmacoes.length})</h3>
              <button type="button" style={st.btnGhost} onClick={() => setVerAfirmacoes((v) => !v)}>{verAfirmacoes ? "Esconder" : "Ver todas"}</button>
            </div>
            {d.destaques.afirmacoes_melhoras.length || d.destaques.afirmacoes_quedas.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginTop: 12 }}>
                {[["Maiores avanços", d.destaques.afirmacoes_melhoras], ["Maiores quedas", d.destaques.afirmacoes_quedas]].map(([tit, lista]) => (
                  <div key={tit}><div style={{ ...st.label, marginBottom: 6 }}>{tit}</div>
                    {lista.length ? lista.map((q) => <div key={q.numero} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "5px 0", borderTop: `1px solid ${colors.border}`, fontSize: 13 }}><span>{q.texto}</span><Variacao d={q.delta} t={q.tendencia} /></div>) : <span style={{ fontSize: 13, color: colors.textMuted }}>—</span>}
                  </div>
                ))}
              </div>
            ) : null}
            {verAfirmacoes ? (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead><tr><th style={st.th}>Nº</th><th style={st.th}>Afirmação</th><th style={st.th}>Anterior</th><th style={st.th}>Atual</th><th style={st.th}>Variação</th></tr></thead>
                  <tbody>{d.afirmacoes.map((q) => <tr key={q.numero}><td style={st.td}>{q.numero}</td><td style={st.td}>{q.texto}</td><td style={st.td}>{pct1(q.a_pos)}</td><td style={st.td}><strong>{pct1(q.b_pos)}</strong></td><td style={st.td}><Variacao d={q.delta} t={q.tendencia} /></td></tr>)}</tbody>
                </table>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </PortalShell>
  );
}
