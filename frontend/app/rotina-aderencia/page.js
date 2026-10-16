"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import { apiFetch, apiDownload } from "../../services/api";
import { colors, radius } from "../../lib/theme";

// Painel de aderência da Rotina do instrutor (Fase 3, 16/10/2026).
// Mostra, por turma e por instrutor, o que está em dia e o que está pendente
// (checklist, responsabilidades com prazo, diário de bordo, revisão do plano,
// avaliação individual e provas em papel paradas) e, por operação, as atividades
// do mês contra a referência de ritmo (referência, não meta).

const FAROL = {
  vermelho: { texto: "Atrasada", cor: colors.dangerText, bg: colors.dangerLight },
  amarelo: { texto: "Atenção", cor: colors.warningText, bg: colors.warningLight },
  verde: { texto: "Em dia", cor: colors.successText, bg: colors.successLight },
  cinza: { texto: "Ainda não começou", cor: colors.textSecondary, bg: colors.neutralLight },
};

const MODELO = { avaliacao_tecnica: "Avaliação Técnica", formacao_continuada: "Formação continuada" };

function mesAtual() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 7);
}
function fmtData(d) {
  if (!d) return "—";
  const [, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia}/${m}`;
}
function fmtPct(n) {
  return n === null || n === undefined ? "—" : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
function fmtH(n) {
  return `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}

export default function RotinaAderenciaPage() {
  const [mes, setMes] = useState(mesAtual());
  const [cliente, setCliente] = useState("");
  const [instrutor, setInstrutor] = useState("");
  const [situacao, setSituacao] = useState("todas");
  const [d, setD] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (mes) p.set("mes", mes);
    if (cliente) p.set("cliente", cliente);
    if (instrutor) p.set("instrutor", instrutor);
    return p.toString();
  }, [mes, cliente, instrutor]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setD(await apiFetch(`/rotina/aderencia?${query}`));
      setErro("");
    } catch (e) {
      setErro(e.message || "Não foi possível carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }, [query]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function exportar() {
    try {
      await apiDownload(`/rotina/aderencia/exportar?${query}`, `aderencia-rotina-${mes}.xlsx`);
    } catch (e) {
      setErro(e.message || "Não foi possível exportar.");
    }
  }

  const turmas = (d?.turmas || []).filter((t) => situacao === "todas" || t.farol === situacao);
  const r = d?.resumo;

  return (
    <PortalShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: colors.textPrimary }}>Aderência da rotina do instrutor</h1>
            <p style={{ fontSize: 13, color: colors.textSecondary, margin: "4px 0 0", maxWidth: 720 }}>
              Acompanhe se as turmas estão com a rotina em dia: checklist, responsabilidades com prazo, diário de bordo,
              revisão do plano de aula, avaliação individual e provas em papel.
              {d?.so_proprias ? " Você vê apenas as suas turmas." : ""}
            </p>
          </div>
          <button type="button" style={btnSec} onClick={exportar}>Exportar Excel</button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={lab}>Mês
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value || mesAtual())} style={campo} />
          </label>
          <label style={lab}>Operação
            <select value={cliente} onChange={(e) => setCliente(e.target.value)} style={campo}>
              <option value="">Todas</option>
              {(d?.filtros?.clientes || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {!d?.so_proprias && (
            <label style={lab}>Instrutor
              <select value={instrutor} onChange={(e) => setInstrutor(e.target.value)} style={campo}>
                <option value="">Todos</option>
                {(d?.filtros?.instrutores || []).map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </label>
          )}
        </div>

        {erro && <div style={alerta}>{erro}</div>}

        {r && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Kpi rotulo="Turmas no mês" valor={r.turmas} />
            <Kpi rotulo="Em dia" valor={r.verdes} cor={colors.successText} />
            <Kpi rotulo="Atenção" valor={r.amarelas} cor={colors.warningText} />
            <Kpi rotulo="Atrasadas" valor={r.vermelhas} cor={r.vermelhas ? colors.dangerText : colors.textPrimary} />
            <Kpi rotulo="Pendências abertas" valor={r.pendencias} />
          </div>
        )}

        <SectionCard title="Por instrutor" subtitle="Aderência = itens do checklist respondidos + responsabilidades feitas, sobre o que já era devido (turmas de Avaliação Técnica).">
          {carregando && !d ? <p style={vazio}>Carregando…</p> : !d?.instrutores?.length ? (
            <p style={vazio}>Nenhuma turma neste recorte.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tabela}>
                <thead>
                  <tr>
                    <th style={th}>Instrutor</th>
                    <th style={th}>Turmas</th>
                    <th style={{ ...th, minWidth: 170 }}>Aderência</th>
                    <th style={th}>Atrasadas</th>
                    <th style={th}>Atenção</th>
                    <th style={th}>Em dia</th>
                    <th style={th}>Pendências</th>
                  </tr>
                </thead>
                <tbody>
                  {d.instrutores.map((i) => (
                    <tr key={i.instrutor}>
                      <td style={td}><strong>{i.instrutor}</strong></td>
                      <td style={td}>{i.turmas}</td>
                      <td style={td}><Barra pct={i.aderencia_pct} /></td>
                      <td style={{ ...td, color: i.vermelhas ? colors.dangerText : undefined, fontWeight: i.vermelhas ? 800 : 400 }}>{i.vermelhas}</td>
                      <td style={td}>{i.amarelas}</td>
                      <td style={td}>{i.verdes}</td>
                      <td style={td}>{i.pendencias}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Turmas"
          action={
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[["todas", "Todas"], ["vermelho", "Atrasadas"], ["amarelo", "Atenção"], ["verde", "Em dia"]].map(([k, t]) => (
                <button key={k} type="button" onClick={() => setSituacao(k)} style={{ ...chip, ...(situacao === k ? chipOn : {}) }}>{t}</button>
              ))}
            </div>
          }
        >
          {!turmas.length ? <p style={vazio}>Nenhuma turma para mostrar.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={tabela}>
                <thead>
                  <tr>
                    <th style={th}>Situação</th>
                    <th style={th}>Turma</th>
                    <th style={th}>Instrutor</th>
                    <th style={th}>Período</th>
                    <th style={{ ...th, minWidth: 150 }}>Aderência</th>
                    <th style={th}>Pendências</th>
                  </tr>
                </thead>
                <tbody>
                  {turmas.map((t) => {
                    const f = FAROL[t.farol] || FAROL.cinza;
                    return (
                      <tr key={t.id}>
                        <td style={td}><span style={{ ...badge, color: f.cor, background: f.bg }}>{f.texto}</span></td>
                        <td style={td}>
                          <a href={`/turma/${t.id}/rotina`} style={link}>{t.tema}</a>
                          <div style={mini}>{t.cliente} · {MODELO[t.modo]}</div>
                        </td>
                        <td style={td}>{t.instrutor || "—"}</td>
                        <td style={td}>{fmtData(t.inicio)} a {fmtData(t.fim)}</td>
                        <td style={td}>
                          {t.modo === "avaliacao_tecnica" ? (
                            <>
                              <Barra pct={t.aderencia_pct} />
                              <div style={mini}>
                                {t.checklist.total ? `checklist ${t.checklist.respondidos}/${t.checklist.total}` : "rotina não aberta"}
                                {t.tarefas.total ? ` · tarefas ${t.tarefas.feitas}/${t.tarefas.total}` : ""}
                              </div>
                            </>
                          ) : <span style={mini}>não se aplica</span>}
                        </td>
                        <td style={td}>
                          {t.pendencias.length === 0 ? <span style={{ color: colors.textMuted }}>—</span> : (
                            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
                              {t.pendencias.map((p, i) => (
                                <li key={i} style={{ color: p.severidade === "vermelho" ? colors.dangerText : colors.textPrimary }}>{p.texto}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Atividades por operação no mês"
          subtitle="Referência de ritmo, não meta: pelo menos 1 vídeo por mês e card semanal por operação. Mostra o que foi registrado, sem cobrar nota."
        >
          {!d?.atividades?.length ? <p style={vazio}>Nenhuma atividade registrada neste recorte.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={tabela}>
                <thead>
                  <tr>
                    <th style={th}>Operação</th>
                    <th style={th}>Atividades</th>
                    <th style={th}>Horas</th>
                    <th style={th}>Vídeos</th>
                    <th style={th}>Cards</th>
                    <th style={th}>Por tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.atividades.map((o) => {
                    const v = o.ritmo.find((x) => x.tipo === "Vídeo");
                    const c = o.ritmo.find((x) => x.tipo.startsWith("Card"));
                    return (
                      <tr key={o.cliente}>
                        <td style={td}><strong>{o.cliente}</strong></td>
                        <td style={td}>{o.atividades_qtd}</td>
                        <td style={td}>{fmtH(o.horas)}</td>
                        <td style={td}><Ritmo item={v} /></td>
                        <td style={td}><Ritmo item={c} /></td>
                        <td style={{ ...td, fontSize: 13, color: colors.textSecondary }}>
                          {o.por_tipo.length ? o.por_tipo.map((p) => `${p.tipo}: ${p.qtd} (${fmtH(p.horas)})`).join(" · ") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </PortalShell>
  );
}

function Kpi({ rotulo, valor, cor }) {
  return (
    <div style={{ flex: "1 1 150px", border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "12px 16px", background: "#fff" }}>
      <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>{rotulo}</p>
      <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 800, color: cor || colors.textPrimary }}>{valor}</p>
    </div>
  );
}

// Barra única com o valor escrito ao lado (nunca só a cor): verde a partir de 80%, âmbar 50–79%, vermelho abaixo.
function Barra({ pct }) {
  if (pct === null || pct === undefined) return <span style={{ color: colors.textMuted }}>—</span>;
  const cor = pct >= 80 ? colors.success : pct >= 50 ? colors.warning : colors.danger;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }} title={`Aderência ${fmtPct(pct)}`}>
      <div style={{ flex: 1, minWidth: 70, height: 8, background: colors.neutralLight, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: cor }} />
      </div>
      <strong style={{ fontSize: 13, minWidth: 44 }}>{fmtPct(pct)}</strong>
    </div>
  );
}

function Ritmo({ item }) {
  if (!item) return <span style={{ color: colors.textMuted }}>—</span>;
  return (
    <span>
      <strong>{item.qtd}</strong>
      <span style={{ ...mini, marginLeft: 6 }}>ref. {item.referencia}{item.abaixo ? " · abaixo" : ""}</span>
    </span>
  );
}

const lab = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700, color: colors.textSecondary };
const campo = { padding: "8px 10px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, fontSize: 14, background: "#fff", minWidth: 150 };
const btnSec = { padding: "9px 16px", borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: "#fff", color: colors.navy, fontWeight: 700, fontSize: 14, cursor: "pointer" };
const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const th = { textAlign: "left", padding: "10px 14px", fontSize: 11, color: colors.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", background: "#f8fafc", borderBottom: `1px solid ${colors.border}` };
const td = { padding: "11px 14px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "top" };
const mini = { fontSize: 12, color: colors.textSecondary, marginTop: 2 };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "28px 16px", fontSize: 14, margin: 0 };
const badge = { padding: "5px 11px", borderRadius: radius.pill, fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", display: "inline-block" };
const link = { color: colors.primary, fontWeight: 700, textDecoration: "none" };
const chip = { padding: "6px 12px", borderRadius: radius.pill, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 12, cursor: "pointer" };
const chipOn = { background: colors.navy, color: "#fff", borderColor: colors.navy };
