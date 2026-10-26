"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";
import { colors, radius } from "../../lib/theme";

// Radar preventivo (Pacote 1, 26/10/2026).
// Duas perguntas que antecipam problema, com dado que o portal já guarda:
//  1) Prontidão: as turmas que começam nos próximos dias têm tudo o que precisam?
//  2) Risco de certificação: quem, nas turmas em andamento, ainda alcança a presença mínima?

const GRAV = {
  critica: { texto: "Crítica", cor: colors.dangerText, bg: colors.dangerLight },
  alta: { texto: "Alta", cor: colors.warningText, bg: colors.warningLight },
  media: { texto: "Atenção", cor: colors.textSecondary, bg: colors.neutralLight },
};

const NIVEL = {
  perdeu: { texto: "Já não alcança o mínimo", grav: "critica" },
  no_limite: { texto: "No limite", grav: "alta" },
  atencao: { texto: "Atenção", grav: "media" },
  faltas_seguidas: { texto: "Faltou 2 aulas seguidas", grav: "media" },
};

function fmtData(d) {
  if (!d) return "—";
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia}/${m}/${a.slice(2)}`;
}
function fmtPct(n) {
  return n === null || n === undefined ? "—" : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
function quando(dias) {
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

export default function RadarPage() {
  const [dias, setDias] = useState(7);
  const [pr, setPr] = useState(null);
  const [rc, setRc] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [a, b] = await Promise.all([
        apiFetch(`/preventivo/prontidao?dias=${dias}`),
        apiFetch(`/preventivo/risco-certificacao`),
      ]);
      setPr(a);
      setRc(b);
      setErro("");
    } catch (e) {
      setErro(e.message || "Não foi possível carregar o Radar.");
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const soProprias = !!(pr?.so_proprias || rc?.so_proprias);
  const rp = pr?.resumo;
  const rr = rc?.resumo;
  const tudoCerto = !carregando && !erro && pr && rc && !pr.turmas.length && !rc.turmas.length;
  const alternar = (k) => setAberta((o) => ({ ...o, [k]: !o[k] }));
  const filtroDias = useMemo(() => [3, 7, 14, 30], []);

  return (
    <PortalShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: colors.textPrimary }}>Radar</h1>
          <p style={{ fontSize: 13, color: colors.textSecondary, margin: "4px 0 0", maxWidth: 760 }}>
            O que vai dar errado se ninguém agir — e ainda dá tempo de agir. Aqui estão as turmas que começam em breve
            com algo faltando e as pessoas que estão perdendo a chance de certificar.
            {soProprias ? " Você vê apenas as suas turmas." : ""}
          </p>
        </div>

        {erro && <div style={alerta}>{erro}</div>}

        {tudoCerto && (
          <div style={ok}>
            Tudo em ordem: nenhuma turma dos próximos {pr.dias} dias com pendência e ninguém em risco de não certificar.
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Kpi rotulo={`Turmas com pendência (${dias} dias)`} valor={rp ? rp.turmas_com_pendencia : "—"} cor={rp?.criticas ? colors.dangerText : undefined}
            nota={rp ? `${rp.criticas} crítica(s) · ${rp.altas} alta(s)` : ""} />
          <Kpi rotulo="Já não alcançam a presença mínima" valor={rr ? rr.pessoas_perderam : "—"} cor={rr?.pessoas_perderam ? colors.dangerText : undefined} />
          <Kpi rotulo="No limite de faltas" valor={rr ? rr.pessoas_no_limite : "—"} cor={rr?.pessoas_no_limite ? colors.warningText : undefined} />
          <Kpi rotulo="Turmas em risco de certificação" valor={rr ? rr.turmas_em_risco : "—"} />
        </div>

        <SectionCard
          title="Prontidão das turmas"
          subtitle="Turmas que começam em breve e ainda não têm o que precisam: instrutor, sala ou local, cronograma, participantes, material, ou que têm conflito de sala ou de instrutor."
          action={
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {filtroDias.map((n) => (
                <button key={n} type="button" onClick={() => setDias(n)} style={{ ...chip, ...(dias === n ? chipOn : {}) }}>
                  {n} dias
                </button>
              ))}
            </div>
          }
        >
          {carregando && !pr ? <p style={vazio}>Carregando…</p> : !pr?.turmas?.length ? (
            <p style={vazio}>Nenhuma turma com pendência nos próximos {pr?.dias || dias} dias.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pr.turmas.map((t) => {
                const g = GRAV[t.gravidade] || GRAV.media;
                return (
                  <div key={t.id} style={{ ...caixa, borderLeft: `4px solid ${g.cor}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <a href={`/turma/${t.id}`} style={link}>{t.tema}</a>
                        <div style={mini}>
                          {t.cliente}{t.turma ? ` · ${t.turma}` : ""} · começa {quando(t.dias_para_inicio)} ({fmtData(t.data_inicio)}{t.hora_inicio ? ` às ${t.hora_inicio}` : ""})
                          · {t.instrutor || "sem instrutor"} · {t.participantes} participante(s)
                        </div>
                      </div>
                      <span style={{ ...badge, color: g.cor, background: g.bg }}>{g.texto}</span>
                    </div>
                    <ul style={{ margin: "10px 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                      {t.itens.map((i) => {
                        const gi = GRAV[i.gravidade] || GRAV.media;
                        return (
                          <li key={i.codigo} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", fontSize: 14 }}>
                            <span style={{ ...badgePeq, color: gi.cor, background: gi.bg }}>{i.titulo}</span>
                            <span style={{ color: colors.textPrimary }}>{i.detalhe}</span>
                            <span style={{ ...mini, marginTop: 0 }}>→ {i.acao}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Risco de certificação"
          subtitle={`Turmas em andamento: projeta a presença final de cada pessoa com as aulas que ainda faltam (mínima da turma, padrão ${rc?.turmas?.[0]?.presenca_minima_pct ?? 75}%; falta justificada fica fora da conta). Ainda dá tempo de contato ou reposição.`}
        >
          {carregando && !rc ? <p style={vazio}>Carregando…</p> : !rc?.turmas?.length ? (
            <p style={vazio}>Ninguém em risco de não certificar nas turmas em andamento.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rc.turmas.map((t) => {
                const g = GRAV[t.gravidade] || GRAV.media;
                const aberto = aberta[t.id] !== false; // abertas por padrão
                return (
                  <div key={t.id} style={{ ...caixa, borderLeft: `4px solid ${g.cor}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <a href={`/presenca-turma?turma=${t.id}`} style={link}>{t.tema}</a>
                        <div style={mini}>
                          {t.cliente}{t.turma ? ` · ${t.turma}` : ""} · {fmtData(t.data_inicio)} a {fmtData(t.data_fim)} · {t.instrutor || "sem instrutor"}
                          · presença média {fmtPct(t.pct_medio)} · mínima {fmtPct(t.presenca_minima_pct)} · {t.aulas_restantes} aula(s) a realizar
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {t.perderam > 0 && <span style={{ ...badge, color: colors.dangerText, background: colors.dangerLight }}>{t.perderam} já não alcança(m)</span>}
                        {t.no_limite > 0 && <span style={{ ...badge, color: colors.warningText, background: colors.warningLight }}>{t.no_limite} no limite</span>}
                        {t.em_atencao > 0 && <span style={{ ...badge, color: colors.textSecondary, background: colors.neutralLight }}>{t.em_atencao} em atenção</span>}
                        <button type="button" style={chip} onClick={() => alternar(t.id)}>{aberto ? "Ocultar pessoas" : "Ver pessoas"}</button>
                      </div>
                    </div>
                    {aberto && (
                      <div style={{ overflowX: "auto", marginTop: 10 }}>
                        <table style={tabela}>
                          <thead>
                            <tr>
                              <th style={th}>Participante</th>
                              <th style={th}>Situação</th>
                              <th style={th}>Presenças / faltas</th>
                              <th style={th}>Hoje</th>
                              <th style={th}>Melhor final possível</th>
                              <th style={th}>Faltas que ainda pode ter</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.participantes_em_risco.map((p) => {
                              const n = NIVEL[p.nivel] || NIVEL.atencao;
                              const gn = GRAV[n.grav];
                              return (
                                <tr key={p.nome}>
                                  <td style={td}><strong>{p.nome}</strong></td>
                                  <td style={td}>
                                    <span style={{ ...badgePeq, color: gn.cor, background: gn.bg }}>{n.texto}</span>
                                    {p.faltas_seguidas && p.nivel !== "faltas_seguidas" && <div style={mini}>faltou as 2 últimas aulas</div>}
                                  </td>
                                  <td style={td}>{p.presentes} / {p.ausentes}{p.pendentes ? <span style={mini}> · {p.pendentes} sem lançamento</span> : null}</td>
                                  <td style={td}>{fmtPct(p.pct_atual)}</td>
                                  <td style={{ ...td, color: p.melhor_final < t.presenca_minima_pct ? colors.dangerText : undefined, fontWeight: p.melhor_final < t.presenca_minima_pct ? 800 : 400 }}>
                                    {fmtPct(p.melhor_final)}
                                  </td>
                                  <td style={td}>{p.nivel === "perdeu" ? "nenhuma" : p.faltas_que_ainda_pode_ter}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </PortalShell>
  );
}

function Kpi({ rotulo, valor, cor, nota }) {
  return (
    <div style={{ flex: "1 1 190px", border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "12px 16px", background: "#fff" }}>
      <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>{rotulo}</p>
      <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 800, color: cor || colors.textPrimary }}>{valor}</p>
      {nota ? <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.textSecondary }}>{nota}</p> : null}
    </div>
  );
}

const alerta = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: radius.md, padding: "12px 16px", fontSize: 14 };
const ok = { background: colors.successLight, color: colors.successText, borderRadius: radius.md, padding: "12px 16px", fontSize: 14, fontWeight: 700 };
const caixa = { border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: "12px 16px", background: "#fff" };
const tabela = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const th = { textAlign: "left", padding: "9px 12px", fontSize: 11, color: colors.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", background: "#f8fafc", borderBottom: `1px solid ${colors.border}` };
const td = { padding: "9px 12px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "top" };
const mini = { fontSize: 12, color: colors.textSecondary, marginTop: 2 };
const vazio = { textAlign: "center", color: colors.textMuted, padding: "24px 16px", fontSize: 14, margin: 0 };
const badge = { padding: "5px 11px", borderRadius: radius.pill, fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", display: "inline-block" };
const badgePeq = { padding: "3px 9px", borderRadius: radius.pill, fontWeight: 800, fontSize: 11, whiteSpace: "nowrap", display: "inline-block" };
const link = { color: colors.primary, fontWeight: 700, textDecoration: "none", fontSize: 15 };
const chip = { padding: "6px 12px", borderRadius: radius.pill, border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary, fontWeight: 700, fontSize: 12, cursor: "pointer" };
const chipOn = { background: colors.navy, color: "#fff", borderColor: colors.navy };
