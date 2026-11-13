"use client";

// Apresentação em slides (13/11/2026): monta os slides de Clima e do Canguru a partir do mesmo relatório que já existe para
// cada público (cliente, diretoria, RH). Nada novo é calculado aqui, então os números batem com a tela e com o Excel.
// Palco fixo de 1280x720 que se ajusta à janela; no PDF cada slide vira uma página em paisagem.
import { useCallback, useEffect, useRef, useState } from "react";
import { BarraPNN, FarolPill, pct0, pct1, dec1, fmtN, fmtDia, NOME_PERFIL } from "./RhUi";
import { RISCO } from "./CangaruUi";

const COR = "#be185d";
const ROTULO_RISCO = { baixo: "Risco baixo", moderado: "Risco moderado", alto: "Risco alto" };
const W = 1280, H = 720;
const base = { width: W, height: H, boxSizing: "border-box", padding: "48px 64px", background: "#fff", color: "#0f172a", fontFamily: "Arial, Helvetica, sans-serif", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" };

function Slide({ titulo, sub, children, n, total, rodape }) {
  return (
    <div className="slide" style={base}>
      <div style={{ borderLeft: `8px solid ${COR}`, paddingLeft: 18, marginBottom: 22 }}>
        <h2 style={{ margin: 0, fontSize: 34, fontWeight: 800 }}>{titulo}</h2>
        {sub ? <div style={{ fontSize: 17, color: "#475569", marginTop: 4 }}>{sub}</div> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#94a3b8", marginTop: 8 }}><span>{rodape}</span><span>{n} / {total}</span></div>
    </div>
  );
}
const Cartao = ({ k, v, cor }) => (
  <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 20px", flex: "1 1 200px", minWidth: 190, boxSizing: "border-box" }}>
    <div style={{ fontSize: 14, color: "#64748b", fontWeight: 700 }}>{k}</div>
    <div style={{ fontSize: 38, fontWeight: 800, color: cor || "#0f172a", marginTop: 4 }}>{v}</div>
  </div>
);
const Capa = ({ eyebrow, titulo, sub, linha }) => (
  <div className="slide" style={{ ...base, background: "linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#9d174d 100%)", color: "#fff", justifyContent: "center" }}>
    <div style={{ fontSize: 18, letterSpacing: ".18em", textTransform: "uppercase", opacity: 0.8 }}>{eyebrow}</div>
    <h1 style={{ fontSize: 60, margin: "14px 0 10px", lineHeight: 1.1, fontWeight: 800, maxWidth: 1000 }}>{titulo}</h1>
    <div style={{ fontSize: 24, opacity: 0.9 }}>{sub}</div>
    <div style={{ fontSize: 17, opacity: 0.7, marginTop: 40 }}>{linha}</div>
  </div>
);

// ── Clima ─────────────────────────────────────────────────────────
export function slidesClima(r, planos) {
  const rod = `${r.ciclo.nome} · Relatório para ${r.publico_rotulo}`;
  const tema = new Map((r.tema_nomes || []).map((t) => [t.id, t.nome]));
  const out = [];
  out.push((i, t) => <Capa key="capa" eyebrow="Relações Humanas · Clima organizacional" titulo={r.ciclo.nome} sub={r.ciclo.cliente || ""} linha={`Respostas de ${fmtDia(r.ciclo.data_ini)} a ${fmtDia(r.ciclo.data_fim)} · ${fmtN(r.ciclo.n_respondentes)} respondentes · Relatório para ${r.publico_rotulo}`} />);
  if (r.resumo) out.push((i, t) => (
    <Slide key="resumo" titulo="Em uma frase" n={i} total={t} rodape={rod}>
      <p style={{ fontSize: 26, lineHeight: 1.45, margin: "0 0 28px", maxWidth: 1100 }}>{r.resumo.texto}</p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Cartao k="Respondentes" v={fmtN(r.ciclo.n_respondentes)} />
        <Cartao k="Respostas positivas" v={pct1(r.resumo.geral.pos_pct)} cor="#16a34a" />
        <Cartao k="Respostas negativas" v={pct1(r.resumo.geral.neg_pct)} cor="#dc2626" />
        <Cartao k="Nota média das áreas (0 a 10)" v={dec1(r.resumo.nota_media)} />
        <Cartao k="Temas em vermelho" v={`${r.resumo.temas_vermelhos} de ${r.resumo.total_temas}`} cor={COR} />
      </div>
    </Slide>));
  if (r.temas?.length) out.push((i, t) => (
    <Slide key="temas" titulo="Resultado por tema" sub="Share de respostas positivas, neutras e negativas" n={i} total={t} rodape={rod}>
      {r.temas.slice(0, 11).map((x) => (
        <div key={x.id} style={{ display: "grid", gridTemplateColumns: "360px 1fr 90px 120px", gap: 16, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{x.nome}</span>
          <BarraPNN pos={x.pos_pct} neu={x.neu_pct} neg={x.neg_pct} altura={16} />
          <span style={{ fontSize: 20, fontWeight: 800, textAlign: "right" }}>{pct1(x.pos_pct)}</span>
          <FarolPill farol={x.farol} />
        </div>
      ))}
      <div style={{ fontSize: 13, color: "#64748b", marginTop: 10 }}>Farol: verde a partir de {r.limites.farol_verde_min}% positivas, amarelo a partir de {r.limites.farol_amarelo_min}%, vermelho abaixo.</div>
    </Slide>));
  if (r.afirmacoes) out.push((i, t) => (
    <Slide key="afirm" titulo="O que mais e o que menos agrada" sub="Afirmações com maior e menor percentual de respostas positivas" n={i} total={t} rodape={rod}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        {[["Mais bem avaliadas", r.afirmacoes.melhores, "#16a34a"], ["Menos bem avaliadas", r.afirmacoes.piores, "#dc2626"]].map(([titulo, itens, cor]) => (
          <div key={titulo}>
            <div style={{ fontSize: 20, fontWeight: 800, color: cor, marginBottom: 8 }}>{titulo}</div>
            {itens.map((p) => (
              <div key={p.numero} style={{ padding: "9px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 18 }}><span>{p.texto}</span><strong>{pct1(p.pos_pct)}</strong></div>
                <div style={{ fontSize: 12.5, color: "#94a3b8" }}>{tema.get(p.tema_id) || ""}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Slide>));
  if (r.notas?.length) out.push((i, t) => (
    <Slide key="notas" titulo="Nota das áreas de apoio" sub="Média de 0 a 10 e quem deu nota alta ou baixa" n={i} total={t} rodape={rod}>
      {[...r.notas].sort((a, b) => (b.media ?? -1) - (a.media ?? -1)).map((a) => (
        <div key={a.area} style={{ display: "grid", gridTemplateColumns: "330px 1fr 80px 150px 150px", gap: 14, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f1f5f9", fontSize: 18 }}>
          <span style={{ fontWeight: 700 }}>{a.area}</span>
          <div style={{ height: 14, borderRadius: 999, background: "#e5e7eb" }}><div style={{ width: `${Math.max(0, Math.min(10, a.media || 0)) * 10}%`, height: "100%", borderRadius: 999, background: COR }} /></div>
          <strong style={{ textAlign: "right", fontSize: 22 }}>{dec1(a.media)}</strong>
          <span style={{ color: "#16a34a" }}>9 e 10: {pct0(a.pct_9_10)}</span><span style={{ color: "#dc2626" }}>até 6: {pct0(a.pct_0_6)}</span>
        </div>
      ))}
    </Slide>));
  if (r.perfil) out.push((i, t) => (
    <Slide key="perfil" titulo="Quem respondeu" n={i} total={t} rodape={rod}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
        {Object.entries(r.perfil).filter(([k]) => ["tempo", "faixa", "genero", "servico", "escolaridade", "cargo"].includes(k)).slice(0, 6).map(([k, itens]) => (
          <div key={k} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{NOME_PERFIL[k] || k}</div>
            {itens.slice(0, 6).map((x) => <div key={x.rotulo} style={{ display: "flex", justifyContent: "space-between", fontSize: 15, padding: "3px 0" }}><span>{x.rotulo}</span><strong>{fmtN(x.n)} ({pct0(x.pct)})</strong></div>)}
          </div>
        ))}
      </div>
    </Slide>));
  (r.recortes || []).forEach((rc) => out.push((i, t) => {
    const linhas = [{ rotulo: "Geral", ...rc.geral, geral: true }, ...rc.grupos].slice(0, 9);
    const extremos = (g) => { const ok = (g.temas || []).filter((x) => x.pos_pct !== null && x.pos_pct !== undefined); if (!ok.length) return ["—", "—"]; const mx = ok.reduce((a, b) => (b.pos_pct > a.pos_pct ? b : a)); const mn = ok.reduce((a, b) => (b.pos_pct < a.pos_pct ? b : a)); return [`${tema.get(mx.id) || ""} (${pct0(mx.pos_pct)})`, `${tema.get(mn.id) || ""} (${pct0(mn.pos_pct)})`]; };
    return (
      <Slide key={"rc" + rc.tipo} titulo={`Por ${rc.nome.toLowerCase()}`} sub="Respostas positivas por grupo; grupos pequenos não aparecem" n={i} total={t} rodape={rod}>
        <div style={{ display: "grid", gridTemplateColumns: "250px 90px 100px 130px 1fr 1fr", gap: 10, fontSize: 13, fontWeight: 800, color: "#64748b", paddingBottom: 6, borderBottom: "2px solid #e2e8f0" }}><span>{rc.nome}</span><span style={{ textAlign: "right" }}>Resp.</span><span style={{ textAlign: "right" }}>Positivas</span><span>Farol</span><span>Ponto mais forte</span><span>Ponto mais fraco</span></div>
        {linhas.map((g) => { const [mx, mn] = extremos(g); return (
          <div key={g.rotulo} style={{ display: "grid", gridTemplateColumns: "250px 90px 100px 130px 1fr 1fr", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f1f5f9", fontSize: 15, background: g.geral ? "#f8fafc" : undefined, fontWeight: g.geral ? 800 : 500 }}>
            <span>{g.rotulo}</span><span style={{ textAlign: "right" }}>{fmtN(g.n)}</span><span style={{ textAlign: "right", fontWeight: 800 }}>{pct1(g.pos_pct)}</span><span><FarolPill farol={g.farol} /></span><span style={{ fontSize: 13.5 }}>{mx}</span><span style={{ fontSize: 13.5 }}>{mn}</span>
          </div>); })}
      </Slide>);
  }));
  if (planos?.length) out.push((i, t) => (
    <Slide key="planos" titulo="Plano de ação" sub="O que o RH assumiu fazer a partir desta pesquisa" n={i} total={t} rodape={rod}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px 130px 150px", gap: 12, fontSize: 13, fontWeight: 800, color: "#64748b", paddingBottom: 6, borderBottom: "2px solid #e2e8f0" }}><span>Ação</span><span>Tema</span><span>Prazo</span><span>Situação</span></div>
      {planos.slice(0, 8).map((p) => (
        <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr 220px 130px 150px", gap: 12, padding: "9px 0", borderBottom: "1px solid #f1f5f9", fontSize: 16, alignItems: "center" }}>
          <span><strong>{p.titulo}</strong></span><span>{p.tema || "—"}</span><span>{fmtDia(p.prazo)}</span><span>{p.status_rotulo}{p.situacao === "atrasado" ? " · atrasado" : ""}</span>
        </div>
      ))}
    </Slide>));
  out.push((i, t) => (
    <Slide key="ler" titulo="Como ler os números" n={i} total={t} rodape={rod}>
      <ul style={{ fontSize: 22, lineHeight: 1.6, margin: 0, paddingLeft: 26 }}>
        <li><strong>Positivo</strong> = Concordo + Concordo totalmente. <strong>Negativo</strong> = Discordo + Discordo totalmente. Neutro inclui “Não sei”.</li>
        <li>Farol: verde a partir de {r.limites.farol_verde_min}% positivas, amarelo a partir de {r.limites.farol_amarelo_min}%, vermelho abaixo.</li>
        <li>A pesquisa é anônima: grupos com menos de {r.limites.min_recorte} pessoas não aparecem e entram em “Demais”.</li>
        <li>Nota das áreas de apoio vai de 0 a 10.</li>
      </ul>
    </Slide>));
  return out;
}

// ── Canguru ───────────────────────────────────────────────────────
export function slidesCanguru(r) {
  const g = r.geral;
  const rod = `Projeto Canguru · Relatório para ${r.publico_rotulo || ""}`;
  const out = [];
  out.push((i, t) => <Capa key="capa" eyebrow="Relações Humanas · Projeto Canguru" titulo="Acompanhamento dos novatos" sub="Avaliações de 30, 60 e 90 dias" linha={`${fmtN(g.novatos)} novatos · ${fmtN(g.avaliacoes)} avaliações respondidas · Relatório para ${r.publico_rotulo || ""}`} />);
  out.push((i, t) => (
    <Slide key="resumo" titulo="Em uma frase" n={i} total={t} rodape={rod}>
      <p style={{ fontSize: 26, lineHeight: 1.45, margin: "0 0 28px", maxWidth: 1100 }}>{r.leitura}</p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Cartao k="Novatos" v={fmtN(g.novatos)} />
        <Cartao k="Avaliações respondidas" v={fmtN(g.avaliacoes)} />
        <Cartao k="Com algum sinal de atenção" v={`${fmtN(g.novatos_com_sinal)} (${pct0(g.novatos_com_sinal_pct)})`} cor="#b45309" />
        <Cartao k="Sinal em 2 ou mais avaliações" v={fmtN(g.recorrentes)} />
        <Cartao k="Sinal nas 3 avaliações" v={fmtN(g.nas_tres)} cor="#dc2626" />
      </div>
    </Slide>));
  out.push((i, t) => (
    <Slide key="etapas" titulo="Resultado por avaliação" n={i} total={t} rodape={rod}>
      <div style={{ display: "grid", gridTemplateColumns: "170px repeat(7, 1fr)", gap: 8, fontSize: 13, fontWeight: 800, color: "#64748b", paddingBottom: 6, borderBottom: "2px solid #e2e8f0" }}>{["Avaliação", "Respostas", "Expectativas atendidas", "Acolhidos", "Líder bom gestor", "Nota atividades", "Nota apoio", "Com sinal"].map((h) => <span key={h}>{h}</span>)}</div>
      {r.etapas.map((e) => (
        <div key={e.tipo} style={{ display: "grid", gridTemplateColumns: "170px repeat(7, 1fr)", gap: 8, padding: "14px 0", borderBottom: "1px solid #f1f5f9", fontSize: 20, alignItems: "center" }}>
          <strong>{e.tipo} dias</strong><span>{fmtN(e.respostas)}</span><span>{pct1(e.expectativas_pct)}</span><span>{pct1(e.acolhimento_pct)}</span><span>{pct1(e.lideranca_pct)}</span><span>{dec1(e.nota_atividades)}</span><span>{dec1(e.nota_apoio)}</span><strong style={{ color: "#b45309" }}>{pct1(e.com_sinal_pct)}</strong>
        </div>
      ))}
      <div style={{ fontSize: 13, color: "#64748b", marginTop: 12 }}>Sinal de atenção: resposta “Não” em expectativas, acolhimento ou liderança, ou nota baixa em atividades, apoio ou clima com os colegas.</div>
    </Slide>));
  if (r.evolucao?.novatos_com_duas_ou_mais) out.push((i, t) => (
    <Slide key="evol" titulo="Evolução entre a primeira e a última avaliação" sub={`${fmtN(r.evolucao.novatos_com_duas_ou_mais)} novatos com duas ou mais avaliações`} n={i} total={t} rodape={rod}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Cartao k="Saíram do sinal" v={fmtN(r.evolucao.saiu_do_sinal)} cor="#16a34a" />
        <Cartao k="Entraram no sinal" v={fmtN(r.evolucao.entrou_no_sinal)} cor="#dc2626" />
        <Cartao k="Mantiveram o sinal" v={fmtN(r.evolucao.manteve_sinal)} cor="#b45309" />
        <Cartao k="Sem sinal" v={fmtN(r.evolucao.sem_sinal)} />
      </div>
    </Slide>));
  out.push((i, t) => (
    <Slide key="motivos" titulo="Motivos mais citados" n={i} total={t} rodape={rod}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
        {[["Insatisfação com as atividades", r.motivos.insatisfacao_atividades], ["Liderança", r.motivos.lideranca], ["Acolhimento: onde faltou", r.motivos.acolhimento_area]].map(([titulo, itens]) => (
          <div key={titulo} style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{titulo}</div>
            {!itens?.length ? <div style={{ color: "#94a3b8" }}>Sem registros.</div> : itens.slice(0, 6).map((m) => (
              <div key={m.motivo} style={{ padding: "5px 0" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 15 }}><span>{m.motivo}</span><strong>{fmtN(m.n)}</strong></div><div style={{ height: 6, borderRadius: 999, background: "#e5e7eb" }}><div style={{ width: `${Math.min(100, m.pct || 0)}%`, height: "100%", borderRadius: 999, background: COR }} /></div></div>
            ))}
          </div>
        ))}
      </div>
    </Slide>));
  [["Por site", r.por_site, "Site"], ["Por serviço", r.por_servico, "Serviço"]].forEach(([titulo, bloco, col]) => {
    if (!bloco?.linhas?.length) return;
    out.push((i, t) => (
      <Slide key={titulo} titulo={titulo} sub="Percentual de novatos com sinal de atenção e risco" n={i} total={t} rodape={rod}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 110px 130px 150px", gap: 10, fontSize: 13, fontWeight: 800, color: "#64748b", paddingBottom: 6, borderBottom: "2px solid #e2e8f0" }}><span>{col}</span><span style={{ textAlign: "right" }}>Novatos</span><span style={{ textAlign: "right" }}>Respostas</span><span style={{ textAlign: "right" }}>Com sinal</span><span>Risco</span></div>
        {bloco.linhas.slice(0, 10).map((l) => { const rk = RISCO[l.risco]; return (
          <div key={l.valor || l.rotulo} style={{ display: "grid", gridTemplateColumns: "1fr 100px 110px 130px 150px", gap: 10, padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: 16, alignItems: "center" }}>
            <span>{l.rotulo}</span><span style={{ textAlign: "right" }}>{fmtN(l.novatos)}</span><span style={{ textAlign: "right" }}>{fmtN(l.respostas)}</span><strong style={{ textAlign: "right" }}>{l.poucos ? "—" : pct1(l.com_sinal_pct)}</strong>
            <span style={{ fontWeight: 800, color: rk?.cor || "#475569" }}>{l.poucos ? "Poucos dados" : ROTULO_RISCO[l.risco] || "—"}</span>
          </div>); })}
        {bloco.linhas.length > 10 ? <div style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>Mostrando 10 de {bloco.linhas.length}. O Excel traz a lista completa.</div> : null}
      </Slide>));
  });
  return out;
}

// ── Visualizador ──────────────────────────────────────────────────
export function Apresentador({ construtores, titulo }) {
  const total = construtores.length;
  const [i, setI] = useState(0);
  const [escala, setEscala] = useState(1);
  const palco = useRef(null);
  const ajustar = useCallback(() => setEscala(Math.min(window.innerWidth / W, (window.innerHeight - 46) / H)), []);
  useEffect(() => { ajustar(); window.addEventListener("resize", ajustar); return () => window.removeEventListener("resize", ajustar); }, [ajustar]);
  useEffect(() => {
    const k = (e) => {
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); setI((x) => Math.min(total - 1, x + 1)); }
      else if (["ArrowLeft", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
      else if (e.key === "Home") setI(0); else if (e.key === "End") setI(total - 1);
      else if (e.key === "f" || e.key === "F") { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.(); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [total]);

  const btn = { height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" };
  return (
    <div style={{ background: "#0b1220", minHeight: "100vh" }}>
      <style>{`
        @media print { @page { size: ${W}px ${H}px; margin: 0; } body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } .tela { display: none !important; } .impressao { display: block !important; } .impressao .slide { break-after: page; page-break-after: always; } }
        @media screen { .impressao { display: none; } }
      `}</style>
      <div className="no-print" style={{ height: 46, display: "flex", alignItems: "center", gap: 10, padding: "0 14px", color: "#cbd5e1", fontSize: 13 }}>
        <button type="button" style={btn} onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>← Anterior</button>
        <button type="button" style={btn} onClick={() => setI((x) => Math.min(total - 1, x + 1))} disabled={i === total - 1}>Próximo →</button>
        <span>{i + 1} / {total}</span>
        <span style={{ flex: 1, textAlign: "center", opacity: 0.7 }}>{titulo}</span>
        <button type="button" style={btn} onClick={() => document.documentElement.requestFullscreen?.()}>Tela cheia (F)</button>
        <button type="button" style={{ ...btn, background: COR, borderColor: COR }} onClick={() => window.print()}>Salvar PDF</button>
      </div>
      <div className="tela no-print-hide" ref={palco} style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ width: W * escala, height: H * escala }}>
          <div style={{ width: W, height: H, transform: `scale(${escala})`, transformOrigin: "top left", boxShadow: "0 10px 40px rgba(0,0,0,.45)" }}>{construtores[i](i + 1, total)}</div>
        </div>
      </div>
      <div className="impressao">{construtores.map((c, k) => <div key={k}>{c(k + 1, total)}</div>)}</div>
    </div>
  );
}
