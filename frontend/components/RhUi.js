"use client";

// Peças compartilhadas das telas do módulo RH (12/11/2026): perfis, farol, barras de positivo/neutro/negativo,
// seletor de ciclo e o relatório em tela/impressão. Os estilos básicos vêm de NuspUi (mesma cara dos módulos do portal).

import { useEffect, useState } from "react";
import { colors, radius } from "../lib/theme";
import { getStoredUser, apiFetch } from "../services/api";
import { st, Select } from "./NuspUi";

export { st, Campo, Select, Modal, Badge, Paginacao } from "./NuspUi";

export const PERFIL_COORD = "coordenador_rh";
export const PERFIL_ANALISTA = "analista_rh";
export const PERFIL_GESTOR = "gestor_rh";
export const perfilRh = () => String(getStoredUser()?.perfil || "").toLowerCase();
export const ehOperacaoRh = (perfil) => perfil === PERFIL_COORD || perfil === PERFIL_ANALISTA;

export const COR_RH = "#be185d"; // rosa do Relações Humanas (destaques do módulo)

export const FAROL = {
  verde: { rotulo: "Verde", bg: colors.successLight, cor: colors.successText, barra: "#22c55e" },
  amarelo: { rotulo: "Amarelo", bg: colors.warningLight, cor: colors.warningText, barra: "#f59e0b" },
  vermelho: { rotulo: "Vermelho", bg: colors.dangerLight, cor: colors.dangerText, barra: "#ef4444" },
};

export const pct0 = (v) => (v === null || v === undefined ? "—" : `${Math.round(v).toLocaleString("pt-BR")}%`);
export const pct1 = (v) => (v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
export const dec1 = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
export const fmtN = (v) => Number(v || 0).toLocaleString("pt-BR");
export const fmtDia = (iso) => {
  if (!iso) return "—";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "—";
};

export function FarolPill({ farol, texto }) {
  const f = FAROL[farol];
  if (!f) return <span style={{ color: colors.textMuted }}>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: f.bg, color: f.cor, fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: f.barra }} />
      {texto || f.rotulo}
    </span>
  );
}

/** Barra empilhada: positivo (verde), neutro (cinza), negativo (vermelho). */
export function BarraPNN({ pos, neu, neg, altura = 12, titulo }) {
  const p = Math.max(0, pos || 0), n = Math.max(0, neu || 0), g = Math.max(0, neg || 0);
  const t = p + n + g || 1;
  return (
    <div role="img" aria-label={titulo || `Positivas ${pct0(pos)}, neutras ${pct0(neu)}, negativas ${pct0(neg)}`} title={titulo || `Positivas ${pct1(pos)} · Neutras ${pct1(neu)} · Negativas ${pct1(neg)}`}
      style={{ display: "flex", height: altura, borderRadius: 999, overflow: "hidden", background: "#e5e7eb", minWidth: 120 }}>
      <div style={{ width: `${(p / t) * 100}%`, background: "#22c55e" }} />
      <div style={{ width: `${(n / t) * 100}%`, background: "#cbd5e1" }} />
      <div style={{ width: `${(g / t) * 100}%`, background: "#ef4444" }} />
    </div>
  );
}

export function LegendaPNN() {
  const item = (cor, rot) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginRight: 14, fontSize: 12, color: colors.textSecondary }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: cor }} />{rot}
    </span>
  );
  return <div style={{ marginBottom: 10 }}>{item("#22c55e", "Positivas (Concordo e Concordo totalmente)")}{item("#cbd5e1", "Neutras (inclui Não sei)")}{item("#ef4444", "Negativas (Discordo e Discordo totalmente)")}</div>;
}

export function Abas({ abas, valor, onChange }) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
      {abas.map((a) => {
        const ativa = a.value === valor;
        return (
          <button key={a.value} type="button" role="tab" aria-selected={ativa} onClick={() => onChange(a.value)}
            style={{ height: 36, padding: "0 14px", borderRadius: 10, border: `1px solid ${ativa ? COR_RH : colors.border}`, background: ativa ? "#fce7f3" : "#fff", color: ativa ? "#9d174d" : colors.textSecondary, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            {a.label}
          </button>
        );
      })}
    </div>
  );
}

/** Carrega a lista de ciclos e controla o ciclo escolhido (?ciclo=ID na URL; senão o mais recente). */
export function useCiclos() {
  const [ciclos, setCiclos] = useState(null);
  const [cicloId, setCicloIdState] = useState("");
  const [erro, setErro] = useState("");
  useEffect(() => {
    let vivo = true;
    apiFetch("/rh/clima/ciclos")
      .then((r) => {
        if (!vivo) return;
        setCiclos(r.ciclos || []);
        const pedido = new URLSearchParams(window.location.search).get("ciclo");
        const valido = (r.ciclos || []).find((c) => String(c.id) === String(pedido));
        setCicloIdState(valido ? String(valido.id) : r.ciclos?.[0] ? String(r.ciclos[0].id) : "");
      })
      .catch((e) => { if (vivo) { setErro(e.message || "Não foi possível carregar os ciclos."); setCiclos([]); } });
    return () => { vivo = false; };
  }, []);
  const setCicloId = (id) => {
    setCicloIdState(String(id));
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("ciclo", id);
      window.history.replaceState(null, "", u.toString());
    } catch (_) { /* sem URL */ }
  };
  return { ciclos, cicloId, setCicloId, erro };
}

export function SeletorCiclo({ ciclos, valor, onChange }) {
  if (!ciclos?.length) return null;
  return (
    <div style={{ minWidth: 260, maxWidth: 420 }}>
      <label style={st.label}>Pesquisa (ciclo)</label>
      <Select value={valor} onChange={onChange} vazio={null} opcoes={ciclos.map((c) => ({ value: String(c.id), label: `${c.nome}${c.cliente ? ` · ${c.cliente}` : ""} (${fmtN(c.n_respondentes)} resp.)` }))} />
    </div>
  );
}

export const NOME_PERFIL = { tempo: "Tempo de casa", faixa: "Faixa etária", genero: "Gênero", escolaridade: "Escolaridade", estado_civil: "Estado civil", cargo: "Cargo/posição", servico: "Serviço" };

// ── Relatório (usado na prévia em tela e na página de impressão) ──────
const tituloSecao = { fontSize: 15, fontWeight: 800, margin: "18px 0 8px", color: "#0f172a" };
export function RhRelatorio({ r }) {
  if (!r) return null;
  const tema = new Map((r.tema_nomes || []).map((t) => [t.id, t.nome]));
  return (
    <div>
      {r.resumo ? (
        <section className="rel-secao">
          <h2 style={tituloSecao}>Resumo</h2>
          <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.5 }}>{r.resumo.texto}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[["Respondentes", fmtN(r.ciclo.n_respondentes)], ["Positivas", pct1(r.resumo.geral.pos_pct)], ["Negativas", pct1(r.resumo.geral.neg_pct)], ["Nota média das áreas (0 a 10)", dec1(r.resumo.nota_media)], ["Temas em vermelho", `${r.resumo.temas_vermelhos} de ${r.resumo.total_temas}`]].map(([k, v]) => (
              <div key={k} className="rel-cartao" style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", minWidth: 130 }}>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{k}</div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{v}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {r.temas ? (
        <section className="rel-secao">
          <h2 style={tituloSecao}>Resultado por tema</h2>
          <LegendaPNN />
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={st.th}>Tema</th><th style={st.th}>Distribuição</th><th style={{ ...st.th, textAlign: "right" }}>Positivas</th><th style={st.th}>Farol</th></tr></thead>
            <tbody>
              {r.temas.map((t) => (
                <tr key={t.id}>
                  <td style={st.td}>{t.nome}</td>
                  <td style={{ ...st.td, width: "38%" }}><BarraPNN pos={t.pos_pct} neu={t.neu_pct} neg={t.neg_pct} /></td>
                  <td style={{ ...st.td, textAlign: "right", fontWeight: 800 }}>{pct1(t.pos_pct)}</td>
                  <td style={st.td}><FarolPill farol={t.farol} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p style={{ fontSize: 11.5, color: "#64748b", margin: "6px 0 0" }}>
            Farol: verde a partir de {r.limites.farol_verde_min}% de respostas positivas, amarelo a partir de {r.limites.farol_amarelo_min}%, vermelho abaixo.
          </p>
        </section>
      ) : null}
      {r.afirmacoes ? (
        <section className="rel-secao">
          <h2 style={tituloSecao}>Afirmações mais e menos bem avaliadas</h2>
          {[["Mais bem avaliadas", r.afirmacoes.melhores], ["Menos bem avaliadas", r.afirmacoes.piores]].map(([titulo, itens]) => (
            <div key={titulo} className="rel-cartao" style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "#475569", marginBottom: 4 }}>{titulo}</div>
              <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {itens.map((p) => (
                    <tr key={p.numero}>
                      <td style={st.td}>{p.texto}<div style={{ fontSize: 11, color: "#94a3b8" }}>{tema.get(p.tema_id) || ""}</div></td>
                      <td style={{ ...st.td, width: "30%" }}><BarraPNN pos={p.pos_pct} neu={p.neu_pct} neg={p.neg_pct} altura={9} /></td>
                      <td style={{ ...st.td, textAlign: "right", fontWeight: 800, width: 70 }}>{pct1(p.pos_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          ))}
        </section>
      ) : null}
      {r.notas ? (
        <section className="rel-secao">
          <h2 style={tituloSecao}>Nota das áreas de apoio (0 a 10)</h2>
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={st.th}>Área</th><th style={{ ...st.th, textAlign: "right" }}>Nota média</th><th style={{ ...st.th, textAlign: "right" }}>Notas 9 e 10</th><th style={{ ...st.th, textAlign: "right" }}>Notas até 6</th></tr></thead>
            <tbody>
              {[...r.notas].sort((a, b) => (b.media ?? -1) - (a.media ?? -1)).map((a) => (
                <tr key={a.area}><td style={st.td}>{a.area}</td><td style={{ ...st.td, textAlign: "right", fontWeight: 800 }}>{dec1(a.media)}</td><td style={{ ...st.td, textAlign: "right" }}>{pct0(a.pct_9_10)}</td><td style={{ ...st.td, textAlign: "right" }}>{pct0(a.pct_0_6)}</td></tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      ) : null}
      {r.perfil ? (
        <section className="rel-secao">
          <h2 style={tituloSecao}>Quem respondeu</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {Object.entries(r.perfil).map(([k, itens]) => (
              <div key={k} className="rel-cartao" style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>{NOME_PERFIL[k] || k}</div>
                {itens.map((i) => (
                  <div key={i.rotulo} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "2px 0" }}>
                    <span>{i.rotulo}</span><span style={{ fontWeight: 700 }}>{fmtN(i.n)} ({pct0(i.pct)})</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {(r.recortes || []).map((rc) => (
        <section key={rc.tipo} className="rel-secao">
          <h2 style={tituloSecao}>Por {rc.nome.toLowerCase()}</h2>
          <TabelaRecorte rc={rc} compacto />
        </section>
      ))}
      <p style={{ fontSize: 11.5, color: "#64748b", marginTop: 16 }}>
        Pesquisa anônima. Grupos com menos de {r.limites.min_recorte} pessoas não aparecem. Relatório para: {r.publico_rotulo}.
      </p>
    </div>
  );
}

const corCelula = (farol) => (FAROL[farol] ? { background: FAROL[farol].bg, color: FAROL[farol].cor } : {});

/** Tabela de um recorte: uma linha por grupo, uma coluna por tema, célula colorida pelo farol. */
export function TabelaRecorte({ rc, compacto = false }) {
  const linhas = [{ rotulo: "Geral", n: rc.geral.n, pos_pct: rc.geral.pos_pct, farol: rc.geral.farol, temas: rc.geral.temas, geral: true }, ...rc.grupos];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: compacto ? 720 : 760, tableLayout: compacto ? "fixed" : "auto" }}>
        {compacto ? <colgroup><col style={{ width: "14%" }} /><col style={{ width: "6%" }} /><col style={{ width: "8%" }} />{rc.temas.map((t) => <col key={t.id} />)}</colgroup> : null}
        <thead>
          <tr>
            <th style={{ ...st.th, ...(compacto ? { whiteSpace: "normal", padding: "6px 4px", fontSize: 9 } : {}) }}>{rc.nome}</th>
            <th style={{ ...st.th, textAlign: "right", ...(compacto ? { padding: "6px 4px", fontSize: 9 } : {}) }}>Resp.</th>
            <th style={{ ...st.th, textAlign: "right", ...(compacto ? { padding: "6px 4px", fontSize: 9 } : {}) }}>Positivas</th>
            {rc.temas.map((t) => <th key={t.id} style={{ ...st.th, textAlign: "center", fontSize: compacto ? 8 : 10.5, lineHeight: 1.15, minWidth: compacto ? 0 : 84, whiteSpace: "normal", padding: compacto ? "6px 2px" : undefined, textTransform: compacto ? "none" : undefined, letterSpacing: compacto ? 0 : undefined, wordBreak: "break-word" }}>{t.nome}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((g) => (
            <tr key={g.rotulo} style={g.geral ? { background: "#f8fafc", fontWeight: 800 } : undefined}>
              <td style={{ ...st.td, ...(compacto ? { fontSize: 10.5, padding: "5px 4px" } : {}) }}>{g.rotulo}</td>
              <td style={{ ...st.td, textAlign: "right", ...(compacto ? { fontSize: 10.5, padding: "5px 4px" } : {}) }}>{fmtN(g.n)}</td>
              <td style={{ ...st.td, textAlign: "right", fontWeight: 800, ...(compacto ? { fontSize: 10.5, padding: "5px 4px" } : {}), ...corCelula(g.farol) }}>{pct1(g.pos_pct)}</td>
              {rc.temas.map((t) => {
                const x = g.temas.find((y) => y.id === t.id);
                return <td key={t.id} style={{ ...st.td, textAlign: "center", fontSize: compacto ? 10.5 : 12.5, padding: compacto ? "5px 2px" : undefined, ...corCelula(x?.farol) }}>{x ? pct0(x.pos_pct) : "—"}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
