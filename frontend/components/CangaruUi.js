"use client";

// Peças compartilhadas das telas do Projeto Canguru (12/11/2026): situação do novato, etapas 30/60/90,
// barra dos 90 dias, risco por site e o relatório de resultado (tela e impressão).
import { colors } from "../lib/theme";
import { st, fmtN, fmtDia, pct0, pct1, dec1, FAROL } from "./RhUi";

export const CANGURU_ROTA = "/rh/canguru";

export const SITUACAO = {
  pede_acao: { rotulo: "Pede ação", bg: colors.dangerLight, cor: colors.dangerText, ponto: "#ef4444" },
  atencao: { rotulo: "Vencendo", bg: colors.warningLight, cor: colors.warningText, ponto: "#f59e0b" },
  em_dia: { rotulo: "Em dia", bg: colors.successLight, cor: colors.successText, ponto: "#22c55e" },
  concluido: { rotulo: "Concluído", bg: "#dbeafe", cor: "#1d4ed8", ponto: "#3b82f6" },
  sem_admissao: { rotulo: "Sem admissão", bg: colors.neutralLight, cor: colors.textSecondary, ponto: "#94a3b8" },
};
export const OPCOES_SITUACAO = Object.entries(SITUACAO).map(([value, v]) => ({ value, label: v.rotulo }));

export const STATUS_ETAPA = {
  respondida: { rotulo: "Respondida", ponto: "#22c55e" },
  vencendo: { rotulo: "Vencendo", ponto: "#f59e0b" },
  sem_resposta: { rotulo: "Sem resposta", ponto: "#ef4444" },
  futura: { rotulo: "A vencer", ponto: "#cbd5e1" },
  anterior: { rotulo: "Antes do período", ponto: "#cbd5e1" },
  sem_admissao: { rotulo: "Sem admissão", ponto: "#cbd5e1" },
};

export const RISCO = {
  baixo: { rotulo: "Risco baixo", ...FAROL.verde },
  moderado: { rotulo: "Risco moderado", ...FAROL.amarelo },
  alto: { rotulo: "Risco alto", ...FAROL.vermelho },
};

export const PASSO_NOME = ["Identificar", "Compartilhar com a supervisão", "Analisar", "Alinhar com o novato", "Acompanhar"];
export const STATUS_PONTO = { aberto: "Aberto", em_andamento: "Em andamento", resolvido: "Resolvido", arquivado: "Arquivado" };

export const fmtDataHora = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

export function Pilula({ bg, cor, ponto, children, titulo }) {
  return (
    <span title={titulo} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: bg, color: cor, fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap" }}>
      {ponto ? <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: ponto }} /> : null}
      {children}
    </span>
  );
}

export function SituacaoPill({ situacao }) {
  const s = SITUACAO[situacao];
  if (!s) return <span style={{ color: colors.textMuted }}>—</span>;
  return <Pilula bg={s.bg} cor={s.cor} ponto={s.ponto}>{s.rotulo}</Pilula>;
}

export function RiscoPill({ risco, poucos }) {
  if (poucos) return <Pilula bg={colors.neutralLight} cor={colors.textSecondary} titulo="Grupo pequeno: o risco não é calculado">Grupo pequeno</Pilula>;
  const r = RISCO[risco];
  if (!r) return <span style={{ color: colors.textMuted }}>—</span>;
  return <Pilula bg={r.bg} cor={r.cor} ponto={r.barra}>{r.rotulo}</Pilula>;
}

export function Marca({ children, tom = "neutro", titulo }) {
  const t = tom === "perigo" ? { bg: colors.dangerLight, cor: colors.dangerText } : tom === "aviso" ? { bg: colors.warningLight, cor: colors.warningText } : { bg: colors.neutralLight, cor: colors.textSecondary };
  return <span title={titulo} style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, background: t.bg, color: t.cor, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".03em", whiteSpace: "nowrap" }}>{children}</span>;
}

/** Barra dos 90 dias: preenchida até o dia de hoje, com uma marca em cada avaliação (25, 40 e 85). */
export function BarraDias({ dia, etapas, max = 90 }) {
  const teto = Math.max(max, ...(etapas || []).map((e) => e.dia_prazo + 2));
  const pos = (d) => `${Math.min(100, Math.max(0, (d / teto) * 100))}%`;
  const preenchido = dia === null || dia === undefined ? 0 : Math.min(dia, teto);
  const resumo = (etapas || []).map((e) => `${e.tipo} dias: ${STATUS_ETAPA[e.status]?.rotulo || e.status}`).join("; ");
  return (
    <div role="img" aria-label={`Dia ${dia ?? "sem data"} de ${teto}. ${resumo}`} title={`Dia ${dia ?? "—"} · ${resumo}`} style={{ position: "relative", height: 16, minWidth: 150 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 6, height: 4, borderRadius: 999, background: "#e5e7eb" }} />
      <div style={{ position: "absolute", left: 0, top: 6, height: 4, borderRadius: 999, background: "#be185d", width: pos(preenchido) }} />
      {(etapas || []).map((e) => (
        <span key={e.tipo} aria-hidden="true" style={{ position: "absolute", left: pos(e.dia_prazo), top: 1, width: 14, height: 14, marginLeft: -7, borderRadius: 999, background: STATUS_ETAPA[e.status]?.ponto || "#cbd5e1", border: "2px solid #fff", boxShadow: "0 0 0 1px #94a3b8", boxSizing: "border-box" }} />
      ))}
    </div>
  );
}

/** Três etapas em texto curto: "30 Respondida · 60 Vencendo · 90 A vencer". */
export function ChipsEtapas({ etapas }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {(etapas || []).map((e) => {
        const s = STATUS_ETAPA[e.status] || {};
        const sinal = e.sinais > 0;
        return (
          <span key={e.tipo} title={`${e.tipo} dias · ${s.rotulo || e.status}${e.respondida_em ? ` · respondida em ${fmtDia(e.respondida_em)}` : ""}${sinal ? ` · ${e.sinais} sinal(is) de atenção` : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 999, border: `1px solid ${sinal ? "#fca5a5" : colors.border}`, background: sinal ? colors.dangerLight : "#fff", fontSize: 11.5, fontWeight: 700, color: colors.textPrimary, whiteSpace: "nowrap" }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: s.ponto || "#cbd5e1" }} />
            {e.tipo}d · {s.rotulo || e.status}{sinal ? " · atenção" : ""}
          </span>
        );
      })}
    </div>
  );
}

// ── Resultado (tela e impressão) ──────────────────────────────────────
const titulo = { fontSize: 15, fontWeight: 800, margin: "18px 0 8px", color: "#0f172a" };
const caixa = { border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", minWidth: 130 };

function BarraSimples({ pct, cor = "#be185d" }) {
  return (
    <div style={{ height: 8, borderRadius: 999, background: "#e5e7eb", minWidth: 80 }} aria-hidden="true">
      <div style={{ height: 8, borderRadius: 999, background: cor, width: `${Math.min(100, Math.max(0, pct || 0))}%` }} />
    </div>
  );
}

function TabelaGrupo({ bloco, rotuloColuna, etapas }) {
  if (!bloco) return null;
  const linhas = bloco.linhas || [];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
        <thead>
          <tr>
            <th style={st.th}>{rotuloColuna}</th>
            <th style={{ ...st.th, textAlign: "right" }}>Novatos</th>
            <th style={{ ...st.th, textAlign: "right" }}>Respostas</th>
            <th style={{ ...st.th, textAlign: "right" }}>Com sinal</th>
            {etapas.map((e) => <th key={e.tipo} style={{ ...st.th, textAlign: "right" }}>{e.tipo}d</th>)}
            <th style={st.th}>Risco</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.valor || l.rotulo}>
              <td style={st.td}>{l.rotulo}</td>
              <td style={{ ...st.td, textAlign: "right" }}>{fmtN(l.novatos)}</td>
              <td style={{ ...st.td, textAlign: "right" }}>{fmtN(l.respostas)}</td>
              <td style={{ ...st.td, textAlign: "right", fontWeight: 800 }}>{l.poucos ? "—" : pct1(l.com_sinal_pct)}</td>
              {etapas.map((e) => {
                const x = l.por_etapa?.[String(e.tipo)];
                return <td key={e.tipo} style={{ ...st.td, textAlign: "right" }}>{l.poucos || !x || !x.respostas ? "—" : pct0(x.com_sinal_pct)}</td>;
              })}
              <td style={st.td}><RiscoPill risco={l.risco} poucos={l.poucos} /></td>
            </tr>
          ))}
          {bloco.demais ? (
            <tr style={{ background: "#f8fafc" }}>
              <td style={st.td}>Demais (grupos pequenos)</td>
              <td style={{ ...st.td, textAlign: "right" }}>{fmtN(bloco.demais.novatos)}</td>
              <td style={{ ...st.td, textAlign: "right" }}>{fmtN(bloco.demais.respostas)}</td>
              <td style={{ ...st.td, textAlign: "right", fontWeight: 800 }}>{pct1(bloco.demais.com_sinal_pct)}</td>
              {etapas.map((e) => <td key={e.tipo} style={{ ...st.td, textAlign: "right" }}>—</td>)}
              <td style={st.td}><RiscoPill risco={bloco.demais.risco} /></td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {bloco.ocultos ? <p style={{ fontSize: 11.5, color: "#64748b", margin: "6px 0 0" }}>{bloco.ocultos} {bloco.ocultos === 1 ? "grupo com poucos novatos não aparece" : "grupos com poucos novatos não aparecem"} (mínimo de {bloco.minimo || 5}).</p> : null}
    </div>
  );
}

export function CangaruRelatorio({ r }) {
  if (!r) return null;
  const g = r.geral;
  const etapas = r.config.dias;
  const cartoes = [
    ["Novatos", fmtN(g.novatos)],
    ["Avaliações respondidas", fmtN(g.avaliacoes)],
    ["Com algum sinal de atenção", `${fmtN(g.novatos_com_sinal)} (${pct1(g.novatos_com_sinal_pct)})`],
    ["Sinal em 2 ou mais avaliações", fmtN(g.recorrentes)],
    ["Sinal nas 3 avaliações", fmtN(g.nas_tres)],
    ...(g.prioritarios !== null && g.prioritarios !== undefined ? [["Relatos prioritários", fmtN(g.prioritarios)]] : []),
  ];
  const ev = r.evolucao;
  return (
    <div>
      <section className="rel-secao">
        <h2 style={titulo}>Resumo</h2>
        <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.5 }}>{r.leitura}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {cartoes.map(([k, v]) => (
            <div key={k} className="rel-cartao" style={caixa}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{k}</div><div style={{ fontSize: 17, fontWeight: 800 }}>{v}</div></div>
          ))}
        </div>
      </section>

      <section className="rel-secao">
        <h2 style={titulo}>Resultado por avaliação</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
            <thead>
              <tr>
                <th style={st.th}>Avaliação</th><th style={{ ...st.th, textAlign: "right" }}>Respostas</th>
                <th style={{ ...st.th, textAlign: "right" }}>Expectativas atendidas</th><th style={{ ...st.th, textAlign: "right" }}>Acolhidos</th><th style={{ ...st.th, textAlign: "right" }}>Líder bom gestor</th>
                <th style={{ ...st.th, textAlign: "right" }}>Nota atividades</th><th style={{ ...st.th, textAlign: "right" }}>Nota apoio</th><th style={{ ...st.th, textAlign: "right" }}>Nota clima</th>
                <th style={{ ...st.th, textAlign: "right" }}>Com sinal</th>
              </tr>
            </thead>
            <tbody>
              {r.etapas.map((e) => (
                <tr key={e.tipo}>
                  <td style={st.td}><strong>{e.tipo} dias</strong><div style={{ fontSize: 11, color: "#94a3b8" }}>aplicada no {e.dia}º dia</div></td>
                  <td style={{ ...st.td, textAlign: "right" }}>{fmtN(e.respostas)}</td>
                  <td style={{ ...st.td, textAlign: "right" }}>{pct1(e.expectativas_pct)}</td>
                  <td style={{ ...st.td, textAlign: "right" }}>{pct1(e.acolhimento_pct)}</td>
                  <td style={{ ...st.td, textAlign: "right" }}>{pct1(e.lideranca_pct)}</td>
                  <td style={{ ...st.td, textAlign: "right" }}>{dec1(e.nota_atividades)}</td>
                  <td style={{ ...st.td, textAlign: "right" }}>{dec1(e.nota_apoio)}</td>
                  <td style={{ ...st.td, textAlign: "right" }}>{dec1(e.nota_clima)}</td>
                  <td style={{ ...st.td, textAlign: "right", fontWeight: 800 }}>{fmtN(e.com_sinal)} ({pct1(e.com_sinal_pct)})</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11.5, color: "#64748b", margin: "6px 0 0" }}>Sinal de atenção: resposta “Não” em expectativas, acolhimento ou liderança, ou nota até {r.config.nota_sinal_max} em atividades, áreas de apoio ou clima com os colegas (escala de 0 a 5).</p>
      </section>

      {ev && ev.novatos_com_duas_ou_mais ? (
        <section className="rel-secao">
          <h2 style={titulo}>Evolução entre a primeira e a última avaliação</h2>
          <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "#475569" }}>Considera os {fmtN(ev.novatos_com_duas_ou_mais)} novatos com duas ou mais avaliações.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[["Saíram do sinal", fmtN(ev.saiu_do_sinal)], ["Entraram no sinal", fmtN(ev.entrou_no_sinal)], ["Mantiveram o sinal", fmtN(ev.manteve_sinal)], ["Sem sinal", fmtN(ev.sem_sinal)],
              ["Variação da nota de atividades", sinalDec(ev.variacao_nota_atividades)], ["Variação da nota de apoio", sinalDec(ev.variacao_nota_apoio)], ["Variação da nota de clima", sinalDec(ev.variacao_nota_clima)]].map(([k, v]) => (
              <div key={k} className="rel-cartao" style={caixa}><div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>{k}</div><div style={{ fontSize: 17, fontWeight: 800 }}>{v}</div></div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rel-secao">
        <h2 style={titulo}>Motivos mais citados</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {[["Insatisfação com as atividades", r.motivos.insatisfacao_atividades], ["Liderança", r.motivos.lideranca], ["Acolhimento: onde faltou", r.motivos.acolhimento_area]].map(([t, itens]) => (
            <div key={t} className="rel-cartao" style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>{t}</div>
              {!itens?.length ? <div style={{ fontSize: 12, color: "#94a3b8" }}>Sem registros.</div> : itens.map((m) => (
                <div key={m.motivo} style={{ padding: "4px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5 }}><span>{m.motivo}</span><strong>{fmtN(m.n)}</strong></div>
                  <BarraSimples pct={m.pct} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="rel-secao">
        <h2 style={titulo}>Por site</h2>
        <TabelaGrupo bloco={r.por_site} rotuloColuna="Site" etapas={etapas} />
        <p style={{ fontSize: 11.5, color: "#64748b", margin: "6px 0 0" }}>Risco pelo percentual de novatos com sinal: baixo abaixo de {r.config.risco_moderado_min}%, moderado até {r.config.risco_alto_min}%, alto a partir de {r.config.risco_alto_min}%.</p>
      </section>
      <section className="rel-secao">
        <h2 style={titulo}>Por serviço</h2>
        <TabelaGrupo bloco={r.por_servico} rotuloColuna="Serviço" etapas={etapas} />
      </section>
      <p style={{ fontSize: 11.5, color: "#64748b", marginTop: 16 }}>Grupos com menos de {r.config.min_grupo} novatos não têm o risco calculado nem aparecem nos relatórios para fora do RH. Relatório para: {r.publico_rotulo || "RH"}.</p>
    </div>
  );
}

function sinalDec(v) {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
