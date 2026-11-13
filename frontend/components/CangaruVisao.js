"use client";

// Visão do Canguru: Operador (o que o novato respondeu) ou Supervisor (o que o supervisor avaliou do novato).
// A escolha fica na mesma página (alternador no topo), na URL (?visao=supervisor) e na lembrança do navegador, sem telas nem links extras.
import { useCallback, useEffect, useState } from "react";
import { colors } from "../lib/theme";
import { st, fmtN, pct1 } from "./RhUi";
import { RiscoPill } from "./CangaruUi";

const CHAVE = "canguru_visao";
export const VISOES = [
  { value: "operador", rotulo: "Operador (novato)", titulo: "Visão do operador", cor: "#9d174d", fundo: "#fdf2f8", borda: "#f9a8d4", ajuda: "Quem responde é o próprio novato (operador).", detalhe: "O novato responde sobre a empresa: expectativas, acolhimento, liderança, atividades, áreas de apoio e clima com os colegas." },
  { value: "supervisor", rotulo: "Supervisor", titulo: "Visão do supervisor", cor: "#3730a3", fundo: "#eef2ff", borda: "#a5b4fc", ajuda: "Quem responde é o supervisor, avaliando o novato.", detalhe: "O supervisor dá notas de 0 a 5 ao novato em sete requisitos (negociação, relacionamento, resolução, empatia, conduta, responsabilidade e ética), aos 30, 60 e 85 dias." },
];
export const ehSupervisor = (v) => v === "supervisor";
export const REQ_ROTULO = { neg: "Negociação", rel: "Relacionamento interpessoal", res: "Resolução", emp: "Empatia", cond: "Conduta", resp: "Responsabilidade", etica: "Ética" };

/** [visao, setVisao, pronto]. Lê ?visao= da URL, depois o que ficou lembrado; grava nos dois quando muda. `pronto` evita buscar dados da visão errada antes de ler a escolha. */
export function useVisaoCanguru() {
  const [visao, setVisaoEstado] = useState("operador");
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    try {
      const url = new URLSearchParams(window.location.search).get("visao");
      const lembrada = window.localStorage.getItem(CHAVE);
      const v = url === "supervisor" || url === "operador" ? url : lembrada === "supervisor" ? "supervisor" : "operador";
      setVisaoEstado(v);
    } catch (_) { /* sem armazenamento: fica no padrão */ }
    setPronto(true);
  }, []);
  const setVisao = useCallback((v) => {
    const novo = v === "supervisor" ? "supervisor" : "operador";
    setVisaoEstado(novo);
    try {
      window.localStorage.setItem(CHAVE, novo);
      const u = new URL(window.location.href);
      u.searchParams.set("visao", novo);
      window.history.replaceState(null, "", u.toString());
    } catch (_) { /* ignora */ }
  }, []);
  return [visao, setVisao, pronto];
}

/** Alternador de visão. `escuro` = sobre o fundo colorido do cabeçalho da página. */
export function SeletorVisao({ visao, onChange, escuro = false }) {
  const atual = VISOES.find((v) => v.value === visao) || VISOES[0];
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4, maxWidth: "calc(100vw - 72px)" }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: escuro ? "rgba(255,255,255,.9)" : colors.textSecondary }}>Ver respostas de</span>
      <div role="group" aria-label="Visão do Canguru" style={{ display: "inline-flex", padding: 3, borderRadius: 999, background: escuro ? "rgba(255,255,255,.18)" : "#f1f5f9", border: escuro ? "1px solid rgba(255,255,255,.35)" : `1px solid ${colors.border}` }}>
        {VISOES.map((v) => {
          const ativo = v.value === visao;
          return (
            <button key={v.value} type="button" aria-pressed={ativo} title={v.ajuda} onClick={() => onChange(v.value)}
              style={{ border: 0, cursor: "pointer", padding: "6px 16px", borderRadius: 999, fontSize: 13, fontWeight: 800, background: ativo ? "#fff" : "transparent", color: ativo ? v.cor : escuro ? "#fff" : colors.textSecondary, boxShadow: ativo ? "0 1px 3px rgba(0,0,0,.18)" : "none" }}>
              {v.rotulo}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: escuro ? "#fff" : colors.textMuted, maxWidth: "min(360px, 100%)" }}>{atual.ajuda}</span>
    </div>
  );
}

/** Faixa que diz, sem dúvida, qual visão está na tela e quem responde nela. */
export function FaixaVisao({ visao }) {
  const v = VISOES.find((x) => x.value === visao) || VISOES[0];
  const outra = VISOES.find((x) => x.value !== v.value);
  return (
    <div role="status" style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: v.fundo, border: `1px solid ${v.borda}`, borderLeft: `5px solid ${v.cor}`, color: "#0f172a", fontSize: 13, lineHeight: 1.5 }}>
      <strong style={{ color: v.cor }}>Você está na {v.titulo.toLowerCase()}.</strong> {v.ajuda} {v.detalhe}
      <div style={{ marginTop: 3, fontSize: 12, color: colors.textSecondary }}>Para ver a {outra.titulo.toLowerCase()}, troque no seletor “Ver respostas de”, no topo da página.</div>
    </div>
  );
}

const fmt2 = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const sinalDec = (v) => (v === null || v === undefined ? "—" : `${Number(v) > 0 ? "+" : ""}${fmt2(v)}`);
const titulo = { fontSize: 15, fontWeight: 800, margin: "18px 0 8px", color: "#0f172a" };
const caixa = { border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", minWidth: 130 };
const nomeEtapa = (tipo) => (tipo === 90 ? 85 : tipo);

// Nota média em um "termômetro" simples de 0 a 5
function BarraNota({ v }) {
  const cor = v === null || v === undefined ? "#cbd5e1" : v >= 4 ? "#16a34a" : v >= 3 ? "#f59e0b" : "#dc2626";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 130 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 999, background: "#e5e7eb" }} aria-hidden="true"><div style={{ height: 8, borderRadius: 999, background: cor, width: `${Math.min(100, Math.max(0, ((v || 0) / 5) * 100))}%` }} /></div>
      <strong style={{ fontSize: 13, minWidth: 34, textAlign: "right" }}>{fmt2(v)}</strong>
    </div>
  );
}

function TabelaGrupoSup({ bloco, rotuloColuna, etapas }) {
  if (!bloco) return null;
  const linhas = bloco.linhas || [];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
        <thead>
          <tr>
            <th style={st.th}>{rotuloColuna}</th><th style={{ ...st.th, textAlign: "right" }}>Novatos</th><th style={{ ...st.th, textAlign: "right" }}>Avaliações</th>
            <th style={{ ...st.th, textAlign: "right" }}>Nota média</th><th style={{ ...st.th, textAlign: "right" }}>Com sinal</th>
            {etapas.map((e) => <th key={e.tipo} style={{ ...st.th, textAlign: "right" }}>Nota {nomeEtapa(e.tipo)}d</th>)}
            <th style={st.th}>Risco</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.valor || l.rotulo}>
              <td style={st.td}>{l.rotulo}</td>
              <td style={{ ...st.td, textAlign: "right" }}>{fmtN(l.novatos)}</td>
              <td style={{ ...st.td, textAlign: "right" }}>{fmtN(l.respostas)}</td>
              <td style={{ ...st.td, textAlign: "right", fontWeight: 800 }}>{l.poucos ? "—" : fmt2(l.media)}</td>
              <td style={{ ...st.td, textAlign: "right", fontWeight: 800 }}>{l.poucos ? "—" : pct1(l.com_sinal_pct)}</td>
              {etapas.map((e) => { const x = l.por_etapa?.[String(e.tipo)]; return <td key={e.tipo} style={{ ...st.td, textAlign: "right" }}>{l.poucos || !x || !x.respostas ? "—" : fmt2(x.media)}</td>; })}
              <td style={st.td}><RiscoPill risco={l.risco} poucos={l.poucos} /></td>
            </tr>
          ))}
          {bloco.demais ? (
            <tr style={{ background: "#f8fafc" }}>
              <td style={st.td}>Demais (grupos pequenos)</td>
              <td style={{ ...st.td, textAlign: "right" }}>{fmtN(bloco.demais.novatos)}</td><td style={{ ...st.td, textAlign: "right" }}>{fmtN(bloco.demais.respostas)}</td>
              <td style={{ ...st.td, textAlign: "right", fontWeight: 800 }}>{fmt2(bloco.demais.media)}</td><td style={{ ...st.td, textAlign: "right", fontWeight: 800 }}>{pct1(bloco.demais.com_sinal_pct)}</td>
              {etapas.map((e) => <td key={e.tipo} style={{ ...st.td, textAlign: "right" }}>—</td>)}
              <td style={st.td}><RiscoPill risco={bloco.demais.risco} /></td>
            </tr>
          ) : null}
          {!linhas.length && !bloco.demais ? <tr><td colSpan={7 + etapas.length - 2} style={st.vazio}>Nenhum grupo com o mínimo de novatos.</td></tr> : null}
        </tbody>
      </table>
      {bloco.ocultos ? <p style={{ fontSize: 11.5, color: "#64748b", margin: "6px 0 0" }}>{bloco.ocultos} {bloco.ocultos === 1 ? "grupo com poucos novatos não aparece" : "grupos com poucos novatos não aparecem"}.</p> : null}
    </div>
  );
}

/** Resultado da visão do supervisor (tela e impressão). */
export function CangaruRelatorioSupervisor({ r }) {
  if (!r) return null;
  const g = r.geral; const etapas = r.config.dias; const ev = r.evolucao;
  const cartoes = [
    ["Novatos avaliados", fmtN(g.novatos)], ["Avaliações", fmtN(g.avaliacoes)], ["Nota média (0 a 5)", fmt2(g.media)],
    ["Com algum requisito baixo", `${fmtN(g.novatos_com_sinal)} (${pct1(g.novatos_com_sinal_pct)})`], ["Baixo em 2 ou mais avaliações", fmtN(g.recorrentes)],
    ["Avaliação zerada (abandono/falta)", fmtN(g.zeradas)], ...(g.prioritarios !== null && g.prioritarios !== undefined ? [["Relatos prioritários", fmtN(g.prioritarios)]] : []),
  ];
  return (
    <div>
      <section className="rel-secao">
        <h2 style={titulo}>Resumo · avaliação do supervisor</h2>
        <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.5 }}>{r.leitura}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {cartoes.map(([k, v]) => <div key={k} className="rel-cartao" style={caixa}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{k}</div><div style={{ fontSize: 17, fontWeight: 800 }}>{v}</div></div>)}
        </div>
      </section>

      <section className="rel-secao">
        <h2 style={titulo}>Nota média por requisito</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "6px 24px" }}>
          {r.requisitos.map((q) => (
            <div key={q.chave} style={{ padding: "6px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}><span>{q.rotulo}</span><span style={{ color: "#64748b" }}>{pct1(q.baixa_pct)} com nota baixa · {fmtN(q.respostas)} avaliações</span></div>
              <BarraNota v={q.media} />
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: "#64748b", margin: "6px 0 0" }}>Nota baixa = {r.config.nota_sinal_max} ou menos. Conduta entra a partir da avaliação de 60 dias; Responsabilidade e Ética, na de 85 dias. Avaliações com todas as notas zeradas ficam fora das médias.</p>
      </section>

      <section className="rel-secao">
        <h2 style={titulo}>Resultado por avaliação</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr>
                <th style={st.th}>Avaliação</th><th style={{ ...st.th, textAlign: "right" }}>Avaliações</th><th style={{ ...st.th, textAlign: "right" }}>Nota média</th>
                {Object.keys(REQ_ROTULO).map((k) => <th key={k} style={{ ...st.th, textAlign: "right" }}>{REQ_ROTULO[k].replace("Relacionamento interpessoal", "Relacionamento")}</th>)}
                <th style={{ ...st.th, textAlign: "right" }}>Com sinal</th>
              </tr>
            </thead>
            <tbody>
              {r.etapas.map((e) => (
                <tr key={e.tipo}>
                  <td style={st.td}><strong>{nomeEtapa(e.tipo)} dias</strong>{e.zeradas ? <div style={{ fontSize: 11, color: "#b91c1c" }}>{e.zeradas} zerada(s)</div> : null}</td>
                  <td style={{ ...st.td, textAlign: "right" }}>{fmtN(e.respostas)}</td>
                  <td style={{ ...st.td, textAlign: "right", fontWeight: 800 }}>{fmt2(e.media)}</td>
                  {Object.keys(REQ_ROTULO).map((k) => <td key={k} style={{ ...st.td, textAlign: "right" }}>{e.por_requisito?.[k] === null || e.por_requisito?.[k] === undefined ? "—" : fmt2(e.por_requisito[k])}</td>)}
                  <td style={{ ...st.td, textAlign: "right", fontWeight: 800 }}>{pct1(e.com_sinal_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {ev && ev.novatos_com_duas_ou_mais ? (
        <section className="rel-secao">
          <h2 style={titulo}>Evolução entre a primeira e a última avaliação</h2>
          <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "#475569" }}>Considera os {fmtN(ev.novatos_com_duas_ou_mais)} novatos com duas ou mais avaliações do supervisor.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[["Saíram do sinal", fmtN(ev.saiu_do_sinal)], ["Entraram no sinal", fmtN(ev.entrou_no_sinal)], ["Mantiveram o sinal", fmtN(ev.manteve_sinal)], ["Sem sinal", fmtN(ev.sem_sinal)], ["Variação da nota média", sinalDec(ev.variacao_media)]].map(([k, v]) => (
              <div key={k} className="rel-cartao" style={caixa}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{k}</div><div style={{ fontSize: 17, fontWeight: 800 }}>{v}</div></div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rel-secao">
        <h2 style={titulo}>Motivos mais citados nas notas baixas</h2>
        {!r.motivos?.length ? <p style={{ fontSize: 12.5, color: "#94a3b8", margin: 0 }}>Sem registros.</p> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "4px 24px" }}>
            {r.motivos.map((m) => (
              <div key={m.motivo} style={{ padding: "4px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}><span>{m.motivo}</span><strong>{fmtN(m.n)}</strong></div>
                <div style={{ height: 8, borderRadius: 999, background: "#e5e7eb" }} aria-hidden="true"><div style={{ height: 8, borderRadius: 999, background: "#be185d", width: `${Math.min(100, m.pct || 0)}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rel-secao"><h2 style={titulo}>Por site</h2><TabelaGrupoSup bloco={r.por_site} rotuloColuna="Site" etapas={etapas} />
        <p style={{ fontSize: 11.5, color: "#64748b", margin: "6px 0 0" }}>Risco pelo percentual de novatos com algum requisito baixo: baixo abaixo de {r.config.risco_moderado_min}%, moderado até {r.config.risco_alto_min}%, alto a partir de {r.config.risco_alto_min}%.</p></section>
      <section className="rel-secao"><h2 style={titulo}>Por serviço</h2><TabelaGrupoSup bloco={r.por_servico} rotuloColuna="Serviço" etapas={etapas} /></section>
      {r.por_supervisor ? (
        <section className="rel-secao"><h2 style={titulo}>Por supervisor (só RH interno)</h2><TabelaGrupoSup bloco={r.por_supervisor} rotuloColuna="Supervisor" etapas={etapas} />
          <p style={{ fontSize: 11.5, color: "#64748b", margin: "6px 0 0" }}>Serve para ver se algum supervisor avalia muito acima ou abaixo dos demais. Não envie para fora do RH.</p></section>
      ) : null}
      <p style={{ fontSize: 11.5, color: "#64748b", marginTop: 16 }}>Grupos com menos de {r.config.min_grupo} novatos não têm o risco calculado nem aparecem nos relatórios para fora do RH. Relatório para: {r.publico_rotulo || "RH"}.</p>
    </div>
  );
}
