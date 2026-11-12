"use client";

// Resultado do ciclo (12/11/2026): resumo em uma frase, índice por tema com farol, afirmações, notas das áreas e perfil de quem respondeu.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/PortalShell";
import PageHero from "../../../../components/PageHero";
import { apiFetch } from "../../../../services/api";
import { colors } from "../../../../lib/theme";
import { st, Select, Abas, SeletorCiclo, useCiclos, FarolPill, BarraPNN, LegendaPNN, pct0, pct1, dec1, fmtN, fmtDia, NOME_PERFIL, COR_RH } from "../../../../components/RhUi";

export default function ResultadoCicloPage() {
  const { ciclos, cicloId, setCicloId, erro: erroCiclos } = useCiclos();
  const [r, setR] = useState(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState("temas");
  const [aberto, setAberto] = useState(null);
  const [filtroTema, setFiltroTema] = useState("");
  const [ordem, setOrdem] = useState("pior");

  useEffect(() => {
    if (!cicloId) { setR(null); return; }
    setR(null); setErro(""); setAberto(null);
    apiFetch(`/rh/clima/ciclos/${cicloId}`).then(setR).catch((e) => setErro(e.message || "Não foi possível carregar o resultado."));
  }, [cicloId]);

  const temasOrdenados = useMemo(() => (r ? [...r.temas].sort((a, b) => (b.pos_pct ?? -1) - (a.pos_pct ?? -1)) : []), [r]);
  const nomeTema = useMemo(() => new Map((r?.temas || []).map((t) => [t.id, t.nome])), [r]);
  const afirmacoes = useMemo(() => {
    if (!r) return [];
    let l = r.perguntas.filter((p) => !filtroTema || String(p.tema_id) === filtroTema);
    l = [...l].sort((a, b) => (ordem === "pior" ? (a.pos_pct ?? 101) - (b.pos_pct ?? 101) : (b.pos_pct ?? -1) - (a.pos_pct ?? -1)));
    return l;
  }, [r, filtroTema, ordem]);

  const vazio = ciclos && !ciclos.length;
  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas · Clima organizacional" title="Resultado do ciclo" subtitle={r ? `${r.ciclo.nome}${r.ciclo.cliente ? ` · ${r.ciclo.cliente}` : ""} · ${fmtN(r.n)} respondentes · respostas de ${fmtDia(r.ciclo.data_ini)} a ${fmtDia(r.ciclo.data_fim)}` : "Escolha uma pesquisa"} />
      {erroCiclos || erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erroCiclos || erro}</div> : null}
      {vazio ? <div style={{ ...st.card, marginTop: 16 }}><p style={st.vazio}>Nenhuma pesquisa importada. <Link href="/rh/clima" style={{ color: "#9d174d", fontWeight: 800 }}>Importar agora</Link></p></div> : null}

      {ciclos?.length ? (
        <div style={{ ...st.filtros, marginTop: 16 }}>
          <SeletorCiclo ciclos={ciclos} valor={cicloId} onChange={setCicloId} />
          {r ? <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <Link href={`/rh/clima/recortes?ciclo=${r.ciclo.id}`} style={{ ...st.btnGhost, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Ver recortes</Link>
            <Link href={`/rh/relatorios?ciclo=${r.ciclo.id}`} style={{ ...st.btn, background: COR_RH, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Gerar relatório</Link>
          </div> : null}
        </div>
      ) : null}

      {cicloId && !r && !erro ? <p style={{ color: colors.textMuted }}>Carregando…</p> : null}

      {r ? (
        <>
          <div style={{ ...st.card, borderLeft: `5px solid ${COR_RH}` }}>
            <h3 style={st.cardTitle}>Em uma frase</h3>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{r.resumo}</p>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 14 }}>
              {[["Positivas", pct1(r.geral.pos_pct)], ["Neutras", pct1(r.geral.neu_pct)], ["Negativas", pct1(r.geral.neg_pct)], ["Nota média das áreas", `${dec1(r.nota_media)} de 10`]].map(([k, v]) => (
                <div key={k}><div style={{ fontSize: 11.5, color: colors.textSecondary, fontWeight: 700 }}>{k}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div></div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <Abas valor={aba} onChange={setAba} abas={[{ value: "temas", label: "Temas" }, { value: "afirmacoes", label: `Afirmações (${r.perguntas.length})` }, { value: "areas", label: "Áreas de apoio" }, { value: "perfil", label: "Quem respondeu" }]} />
          </div>

          {aba === "temas" ? (
            <div style={st.card}>
              <h3 style={st.cardTitle}>Índice por tema, do melhor para o pior</h3>
              <LegendaPNN />
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={st.th}>Tema</th><th style={st.th}>Distribuição das respostas</th><th style={{ ...st.th, textAlign: "right" }}>Positivas</th><th style={{ ...st.th, textAlign: "right" }}>Negativas</th><th style={st.th}>Farol</th></tr></thead>
                  <tbody>
                    {temasOrdenados.map((t) => {
                      const abre = aberto === t.id;
                      return (
                        <FragmentoTema key={t.id} t={t} abre={abre} onToggle={() => setAberto(abre ? null : t.id)} perguntas={r.perguntas.filter((p) => p.tema_id === t.id)} />
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12, color: colors.textMuted, margin: "10px 0 0" }}>
                O índice do tema é a média dos percentuais de cada afirmação (peso igual). Farol: verde a partir de {r.limites.farol_verde_min}% positivo, amarelo a partir de {r.limites.farol_amarelo_min}%, vermelho abaixo. Clique num tema para ver as afirmações dele.
              </p>
            </div>
          ) : null}

          {aba === "afirmacoes" ? (
            <div style={st.card}>
              <div style={st.filtros}>
                <div style={{ minWidth: 260 }}><label style={st.label}>Tema</label><Select value={filtroTema} onChange={setFiltroTema} vazio="Todos os temas" opcoes={r.temas.map((t) => ({ value: String(t.id), label: t.nome }))} /></div>
                <div style={{ minWidth: 200 }}><label style={st.label}>Ordem</label><Select value={ordem} onChange={setOrdem} vazio={null} opcoes={[{ value: "pior", label: "Menos positivas primeiro" }, { value: "melhor", label: "Mais positivas primeiro" }]} /></div>
              </div>
              <LegendaPNN />
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={st.th}>Nº</th><th style={st.th}>Afirmação</th><th style={st.th}>Tema</th><th style={st.th}>Distribuição</th><th style={{ ...st.th, textAlign: "right" }}>Positivas</th><th style={{ ...st.th, textAlign: "right" }}>Negativas</th></tr></thead>
                  <tbody>
                    {afirmacoes.map((p) => (
                      <tr key={p.numero}>
                        <td style={st.td}>{p.numero}</td><td style={st.td}>{p.texto}</td><td style={{ ...st.td, color: colors.textSecondary, fontSize: 12 }}>{nomeTema.get(p.tema_id) || "Sem tema"}</td>
                        <td style={{ ...st.td, width: 200 }}><BarraPNN pos={p.pos_pct} neu={p.neu_pct} neg={p.neg_pct} altura={9} /></td>
                        <td style={{ ...st.td, textAlign: "right", fontWeight: 800 }}>{pct1(p.pos_pct)}</td><td style={{ ...st.td, textAlign: "right" }}>{pct1(p.neg_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {aba === "areas" ? (
            <div style={st.card}>
              <h3 style={st.cardTitle}>Nota das áreas de apoio (0 a 10)</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={st.th}>Área</th><th style={st.th}>Nota média</th><th style={{ ...st.th, textAlign: "right" }}>Notas 9 e 10</th><th style={{ ...st.th, textAlign: "right" }}>Notas até 6</th></tr></thead>
                  <tbody>
                    {[...r.notas].sort((a, b) => (b.media ?? -1) - (a.media ?? -1)).map((a) => (
                      <tr key={a.area}>
                        <td style={st.td}><strong>{a.area}</strong></td>
                        <td style={{ ...st.td, width: "46%" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ flex: 1, height: 12, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}><div style={{ width: `${(a.media ?? 0) * 10}%`, height: "100%", background: a.media >= 7.5 ? "#22c55e" : a.media >= 6 ? "#f59e0b" : "#ef4444" }} /></div>
                            <strong style={{ width: 40, textAlign: "right" }}>{dec1(a.media)}</strong>
                          </div>
                        </td>
                        <td style={{ ...st.td, textAlign: "right" }}>{pct0(a.pct_9_10)}</td><td style={{ ...st.td, textAlign: "right" }}>{pct0(a.pct_0_6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 12, color: colors.textMuted, margin: "10px 0 0" }}>Nota média até 5,9 em vermelho, de 6,0 a 7,4 em amarelo e a partir de 7,5 em verde.</p>
            </div>
          ) : null}

          {aba === "perfil" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
              {Object.entries(r.perfil).map(([k, itens]) => {
                const max = Math.max(...itens.map((i) => i.n), 1);
                return (
                  <div key={k} style={st.card}>
                    <h3 style={st.cardTitle}>{NOME_PERFIL[k] || k}</h3>
                    {itens.map((i) => (
                      <div key={i.rotulo} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12.5 }}>
                        <div style={{ width: 150, flexShrink: 0 }}>{i.rotulo}</div>
                        <div style={{ flex: 1, height: 10, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}><div style={{ width: `${(i.n / max) * 100}%`, height: "100%", background: "#f472b6" }} /></div>
                        <div style={{ width: 86, textAlign: "right", fontWeight: 700 }}>{fmtN(i.n)} · {pct0(i.pct)}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
              <p style={{ gridColumn: "1 / -1", fontSize: 12, color: colors.textMuted, margin: 0 }}>Categorias com menos de {r.limites.min_recorte} pessoas não aparecem separadas.</p>
            </div>
          ) : null}
        </>
      ) : null}
    </PortalShell>
  );
}

function FragmentoTema({ t, abre, onToggle, perguntas }) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer", background: abre ? "#fdf2f8" : undefined }}>
        <td style={st.td}><strong>{abre ? "▾" : "▸"} {t.nome}</strong><div style={{ fontSize: 11, color: colors.textMuted }}>{t.n_afirmacoes} {t.n_afirmacoes === 1 ? "afirmação" : "afirmações"}</div></td>
        <td style={{ ...st.td, width: "34%" }}><BarraPNN pos={t.pos_pct} neu={t.neu_pct} neg={t.neg_pct} /></td>
        <td style={{ ...st.td, textAlign: "right", fontWeight: 800 }}>{pct1(t.pos_pct)}</td><td style={{ ...st.td, textAlign: "right" }}>{pct1(t.neg_pct)}</td>
        <td style={st.td}><FarolPill farol={t.farol} /></td>
      </tr>
      {abre ? perguntas.map((p) => (
        <tr key={p.numero} style={{ background: "#fffafc" }}>
          <td style={{ ...st.td, paddingLeft: 28, fontSize: 12.5 }}>{p.texto}</td>
          <td style={st.td}><BarraPNN pos={p.pos_pct} neu={p.neu_pct} neg={p.neg_pct} altura={8} /></td>
          <td style={{ ...st.td, textAlign: "right", fontSize: 12.5 }}>{pct1(p.pos_pct)}</td><td style={{ ...st.td, textAlign: "right", fontSize: 12.5 }}>{pct1(p.neg_pct)}</td><td style={st.td}></td>
        </tr>
      )) : null}
    </>
  );
}
