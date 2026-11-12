"use client";

// Painel do RH (12/11/2026): ciclo de clima em andamento, números que importam, temas que pedem atenção e histórico.
import { useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { colors } from "../../lib/theme";
import { st, FarolPill, BarraPNN, LegendaPNN, pct0, pct1, dec1, fmtN, fmtDia, perfilRh, ehOperacaoRh, FAROL } from "../../components/RhUi";

export default function PainelRhPage() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const operacao = ehOperacaoRh(perfilRh());

  useEffect(() => {
    apiFetch("/rh/painel").then(setD).catch((e) => setErro(e.message || "Não foi possível carregar o painel."));
  }, []);

  const a = d?.atual;
  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas" title="Painel do RH" subtitle={a ? `Pesquisa de clima: ${a.ciclo.nome}${a.ciclo.cliente ? ` · ${a.ciclo.cliente}` : ""}` : "Clima organizacional e acompanhamento das pessoas"} />
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}
      {!d && !erro ? <p style={{ marginTop: 16, color: colors.textMuted }}>Carregando…</p> : null}

      {d && !a ? (
        <div style={{ ...st.card, marginTop: 16, textAlign: "center", padding: 32 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Nenhuma pesquisa de clima importada ainda</h3>
          <p style={{ margin: "0 0 14px", color: colors.textSecondary, fontSize: 13.5 }}>Importe a planilha do Prime RH para ver o resultado por tema, os recortes e gerar o relatório.</p>
          {operacao ? <Link href="/rh/clima" style={{ ...st.btn, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Importar a pesquisa</Link> : <p style={{ color: colors.textMuted, fontSize: 13 }}>O RH ainda não importou nenhuma pesquisa.</p>}
        </div>
      ) : null}

      {a ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginTop: 16 }}>
            <StatCard title="Respondentes" value={fmtN(a.kpis.respondentes)} subtitle={`${fmtDia(a.ciclo.data_ini)} a ${fmtDia(a.ciclo.data_fim)}`} accent="#2563eb" />
            <StatCard title="Respostas positivas" value={pct1(a.kpis.pos_pct)} subtitle="Concordo e Concordo totalmente" accent="#16a34a" />
            <StatCard title="Respostas negativas" value={pct1(a.kpis.neg_pct)} subtitle={`Neutras e Não sei: ${pct1(a.kpis.neu_pct)}`} accent="#dc2626" />
            <StatCard title="Nota média das áreas" value={dec1(a.kpis.nota_media)} subtitle="Escala de 0 a 10" accent="#f59e0b" />
            <StatCard title="Temas em vermelho" value={`${a.kpis.temas_vermelhos} de ${a.kpis.total_temas}`} subtitle={`Vermelho abaixo de ${a.limites.farol_amarelo_min}% positivo`} accent="#be185d" />
          </div>

          <div style={{ ...st.card, marginTop: 16 }}>
            <h3 style={st.cardTitle}>Em uma frase</h3>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: colors.textPrimary }}>{a.resumo}</p>
            <div style={{ marginTop: 12 }}>
              <Link href={`/rh/clima/resultado?ciclo=${a.ciclo.id}`} style={{ ...st.btnGhost, display: "inline-flex", alignItems: "center", textDecoration: "none", marginRight: 8 }}>Ver o resultado completo</Link>
              <Link href={`/rh/relatorios?ciclo=${a.ciclo.id}`} style={{ ...st.btnGhost, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Gerar relatório</Link>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginTop: 16 }}>
            <div style={st.card}>
              <h3 style={st.cardTitle}>Pedem atenção</h3>
              <p style={{ margin: "-6px 0 10px", fontSize: 12.5, color: colors.textSecondary }}>Os três temas com menos respostas positivas.</p>
              <LegendaPNN />
              {a.atencao.map((t) => (
                <div key={t.id} style={{ padding: "8px 0", borderTop: `1px solid ${colors.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5, alignItems: "center" }}>
                    <strong style={{ fontSize: 13.5 }}>{t.nome}</strong>
                    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><span style={{ fontWeight: 800 }}>{pct1(t.pos_pct)}</span><FarolPill farol={t.farol} /></span>
                  </div>
                  <BarraPNN pos={t.pos_pct} neu={t.neu_pct} neg={t.neg_pct} />
                </div>
              ))}
            </div>
            <div style={st.card}>
              <h3 style={st.cardTitle}>Pontos fortes</h3>
              <p style={{ margin: "-6px 0 10px", fontSize: 12.5, color: colors.textSecondary }}>Os três temas mais bem avaliados.</p>
              {a.melhores.map((t) => (
                <div key={t.id} style={{ padding: "8px 0", borderTop: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <strong style={{ fontSize: 13.5 }}>{t.nome}</strong>
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><span style={{ fontWeight: 800 }}>{pct1(t.pos_pct)}</span><FarolPill farol={t.farol} /></span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...st.card, marginTop: 16 }}>
            <h3 style={st.cardTitle}>Histórico de pesquisas</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={st.th}>Pesquisa</th><th style={st.th}>Cliente</th><th style={st.th}>Período</th><th style={{ ...st.th, textAlign: "right" }}>Respondentes</th><th style={st.th}></th></tr></thead>
                <tbody>
                  {d.historico.map((c) => (
                    <tr key={c.id}>
                      <td style={st.td}><strong>{c.nome}</strong></td><td style={st.td}>{c.cliente || "—"}</td>
                      <td style={st.td}>{fmtDia(c.data_ini)} a {fmtDia(c.data_fim)}</td><td style={{ ...st.td, textAlign: "right" }}>{fmtN(c.n_respondentes)}</td>
                      <td style={st.td}><Link href={`/rh/clima/resultado?ciclo=${c.id}`} style={{ color: "#9d174d", fontWeight: 800, fontSize: 12.5 }}>Abrir</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {d ? (
        <div style={{ ...st.card, marginTop: 16 }}>
          <h3 style={st.cardTitle}>Frentes do setor</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            <div style={{ border: `1px solid ${FAROL.verde.barra}`, borderRadius: 12, padding: 14 }}>
              <strong>Clima organizacional</strong>
              <p style={{ margin: "4px 0 0", fontSize: 12.5, color: colors.textSecondary }}>Em uso: importação do Prime RH, resultado por tema, recortes e relatórios.</p>
            </div>
            <div style={{ border: `1px dashed ${colors.border}`, borderRadius: 12, padding: 14, color: colors.textMuted }}>
              <strong>Projeto Canguru</strong>
              <p style={{ margin: "4px 0 0", fontSize: 12.5 }}>Acompanhamento dos novatos até os 90 dias. Chega nos próximos pacotes.</p>
            </div>
          </div>
        </div>
      ) : null}
    </PortalShell>
  );
}
