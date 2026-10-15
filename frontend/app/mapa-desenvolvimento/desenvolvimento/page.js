"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import SectionCard from "../../../components/SectionCard";
import StatCard from "../../../components/StatCard";
import EditorEtapa from "./EditorEtapa";
import PainelPessoa from "./PainelPessoa";
import { apiFetch } from "../../../services/api";
import { colors, radius } from "../../../lib/theme";
import { STATUS_ETAPA, AVALIACAO, FAROL_COR, btnPrimario, btnSecundario, entrada, rotulo, painel, dica, acoes, vazio, avisoErro, avisoOk, selo, fmtNum } from "./estilos";

// Mapa de Desenvolvimento → Desenvolvimento por etapa (Fase 2, 16/10/2026).
// Matriz participante × etapas da jornada: status, avaliação, horas e % da
// jornada; painel da pessoa com linha do tempo de evolução. Só a Metodologia
// lança. Horas vêm só da presença (sem ajuste manual). Backend:
// /api/jornada-desenvolvimento.

export default function DesenvolvimentoJornadasPage() {
  const [jornadas, setJornadas] = useState([]);
  const [jornadaId, setJornadaId] = useState("");
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [filtros, setFiltros] = useState({ busca: "", turma: "" });
  const [sel, setSel] = useState(null); // { tipo: "celula", pid, eid } | { tipo: "pessoa", pid }
  const [previa, setPrevia] = useState(null);

  useEffect(() => {
    if (!erro && !aviso) return undefined;
    const t = window.setTimeout(() => {
      setErro("");
      setAviso("");
    }, 7000);
    return () => window.clearTimeout(t);
  }, [erro, aviso]);

  useEffect(() => {
    (async () => {
      try {
        const lista = await apiFetch("/jornadas-desenvolvimento");
        setJornadas(lista);
        const pedido = new URLSearchParams(window.location.search).get("jornada");
        const alvo = lista.find((j) => String(j.id) === pedido) || lista.find((j) => j.status === "em_andamento") || lista[0];
        if (alvo) setJornadaId(String(alvo.id));
        else setCarregando(false);
      } catch (e) {
        setErro(e.message || "Erro ao carregar as jornadas.");
        setCarregando(false);
      }
    })();
  }, []);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!jornadaId) return;
      if (!silencioso) setCarregando(true);
      try {
        setDados(await apiFetch(`/jornada-desenvolvimento/jornadas/${jornadaId}/matriz`));
      } catch (e) {
        setErro(e.message || "Erro ao carregar o desenvolvimento da jornada.");
      } finally {
        setCarregando(false);
      }
    },
    [jornadaId]
  );

  useEffect(() => {
    setDados(null);
    setSel(null);
    setPrevia(null);
    carregar();
  }, [carregar]);

  const jornadaAtual = jornadas.find((j) => String(j.id) === jornadaId);
  const turmas = useMemo(() => (dados ? Array.from(new Set(dados.participantes.map((p) => p.turma).filter(Boolean))).sort() : []), [dados]);
  const linhas = useMemo(() => {
    if (!dados) return [];
    const b = filtros.busca.trim().toLowerCase();
    return dados.participantes.filter((p) => (!b || `${p.nome} ${p.matricula || ""}`.toLowerCase().includes(b)) && (!filtros.turma || p.turma === filtros.turma));
  }, [dados, filtros]);

  async function verPrevia() {
    setErro("");
    try {
      const r = await apiFetch(`/jornada-desenvolvimento/jornadas/${jornadaId}/aplicar-sugestoes`, { method: "POST", body: JSON.stringify({}) });
      if (!r.total) setAviso("Nenhuma sugestão pendente: todas as células com presença já têm lançamento.");
      else setPrevia(r);
    } catch (e) {
      setErro(e.message || "Não foi possível calcular as sugestões.");
    }
  }

  async function aplicar() {
    setErro("");
    try {
      const r = await apiFetch(`/jornada-desenvolvimento/jornadas/${jornadaId}/aplicar-sugestoes`, { method: "POST", body: JSON.stringify({ confirmar: true }) });
      setPrevia(null);
      setAviso(`${r.aplicadas} célula(s) preenchida(s) pela presença (${r.concluida} concluída(s), ${r.em_andamento} em andamento). Lançamentos manuais não foram alterados.`);
      carregar(true);
    } catch (e) {
      setErro(e.message || "Não foi possível aplicar as sugestões.");
    }
  }

  const participanteSel = dados && sel ? dados.participantes.find((p) => p.id === sel.pid) : null;
  const etapaSel = dados && sel?.tipo === "celula" ? dados.etapas.find((e) => e.id === sel.eid) : null;

  return (
    <PortalShell>
      <div style={{ display: "grid", gap: 16 }}>
        <PageHero
          eyebrow="Mapa de Desenvolvimento"
          title="Desenvolvimento por etapa"
          subtitle="Status e avaliação de cada pessoa em cada etapa da jornada, % da jornada e anotações de evolução. As horas vêm das presenças lançadas em Encontros e presença."
          actions={
            <>
              <Link href="/mapa-desenvolvimento" style={{ ...btnSecundario, textDecoration: "none", display: "inline-block" }}>
                ← Mapa
              </Link>
              <Link href={`/mapa-desenvolvimento/presenca${jornadaId ? `?jornada=${jornadaId}` : ""}`} style={{ ...btnSecundario, textDecoration: "none", display: "inline-block" }}>
                Encontros e presença
              </Link>
            </>
          }
        />

        {erro && <div style={avisoErro}>{erro}</div>}
        {aviso && <div style={avisoOk}>{aviso}</div>}

        <SectionCard
          title="Jornada"
          subtitle={jornadaAtual ? [jornadaAtual.cliente, jornadaAtual.status === "em_andamento" ? "Em andamento" : null].filter(Boolean).join(" · ") : undefined}
          action={
            dados && dados.etapas.length > 0 ? (
              <button style={btnSecundario} onClick={verPrevia}>
                Preencher pela presença
              </button>
            ) : null
          }
        >
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ ...rotulo, maxWidth: 520 }}>
              Escolha a jornada
              <select style={entrada} value={jornadaId} onChange={(e) => setJornadaId(e.target.value)}>
                {jornadas.length === 0 && <option value="">Nenhuma jornada cadastrada</option>}
                {jornadas.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nome}
                    {j.cliente ? ` — ${j.cliente}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {previa && (
              <div style={painel}>
                <strong style={{ fontSize: 14 }}>Preencher pela presença</strong>
                <div style={dica}>
                  Serão preenchidas {previa.total} célula(s) que ainda não têm lançamento: {previa.concluida} como <strong>Concluída</strong> (todos os encontros da etapa já aconteceram, foram lançados e a presença atinge o mínimo) e {previa.em_andamento} como <strong>Em andamento</strong>.
                  Células que você já lançou não são alteradas, e você pode ajustar qualquer uma depois.
                </div>
                <div style={acoes}>
                  <button style={btnPrimario} onClick={aplicar}>
                    Preencher {previa.total} célula(s)
                  </button>
                  <button style={btnSecundario} onClick={() => setPrevia(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </SectionCard>

        {dados && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
            <StatCard title="Participantes" value={dados.totais.participantes} subtitle={`${dados.totais.etapas} etapa(s) na jornada`} accent={colors.primary} />
            <StatCard title="% médio da jornada" value={dados.totais.pct_medio_jornada === null ? "—" : `${fmtNum(dados.totais.pct_medio_jornada)}%`} subtitle={dados.totais.carga_prevista ? `carga prevista ${fmtNum(dados.totais.carga_prevista)} h` : "sem carga prevista — usa etapas concluídas"} accent={colors.success} />
            <StatCard title="Concluíram todas as etapas" value={dados.totais.concluiram_todas} subtitle={`de ${dados.totais.participantes} participantes`} accent={colors.success} />
            <StatCard title="Sem nenhum lançamento" value={dados.totais.sem_lancamento} subtitle={dados.totais.sugestoes_pendentes ? `${dados.totais.sugestoes_pendentes} sugestão(ões) pela presença` : "—"} accent={dados.totais.sem_lancamento ? colors.warning : colors.neutral} />
          </div>
        )}

        {dados && dados.etapas.length === 0 && (
          <SectionCard title="Etapas">
            <div style={vazio}>
              Esta jornada ainda não tem etapas cadastradas. Cadastre-as em Mapa de Desenvolvimento → aba Jornadas → Etapas da jornada (portos).
            </div>
          </SectionCard>
        )}

        {dados && dados.etapas.length > 0 && (
          <SectionCard title="Participantes × etapas" subtitle="Clique numa célula para lançar status e avaliação; clique no nome para abrir o painel da pessoa com a evolução.">
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <input style={{ ...entrada, maxWidth: 280 }} placeholder="Buscar por nome ou matrícula" value={filtros.busca} onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })} />
                {turmas.length > 0 && (
                  <select style={{ ...entrada, maxWidth: 220 }} value={filtros.turma} onChange={(e) => setFiltros({ ...filtros, turma: e.target.value })}>
                    <option value="">Todas as turmas</option>
                    {turmas.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ overflow: "auto", maxHeight: "70vh", border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
                <table style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: 13, minWidth: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thBase, ...fixaEsq, zIndex: 4, minWidth: 220 }}>Participante</th>
                      {dados.etapas.map((e) => (
                        <th key={e.id} style={{ ...thBase, textAlign: "center", minWidth: 150 }}>
                          <div style={{ textTransform: "none", letterSpacing: 0, fontSize: 12, color: colors.textPrimary, fontWeight: 800 }}>{e.nome}</div>
                          <div style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500, fontSize: 11 }}>{e.carga_horaria_prevista ? `${fmtNum(e.carga_horaria_prevista)} h previstas` : "sem carga prevista"}</div>
                        </th>
                      ))}
                      <th style={{ ...thBase, textAlign: "center", minWidth: 100 }}>% jornada</th>
                      <th style={{ ...thBase, textAlign: "center", minWidth: 90 }}>Horas</th>
                      <th style={{ ...thBase, textAlign: "center", minWidth: 100 }}>Presença</th>
                      <th style={{ ...thBase, textAlign: "center", minWidth: 80 }}>Evolução</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((p) => {
                      const farol = FAROL_COR[p.farol] || FAROL_COR.cinza;
                      return (
                        <tr key={p.id}>
                          <td style={{ ...tdBase, ...fixaEsq, background: "#fff" }}>
                            <button type="button" onClick={() => setSel({ tipo: "pessoa", pid: p.id })} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontWeight: 700, color: colors.primary, fontSize: 13 }}>
                              {p.nome}
                            </button>
                            <div style={{ fontSize: 11, color: colors.textSecondary }}>{[p.matricula, p.turma].filter(Boolean).join(" · ")}</div>
                          </td>
                          {dados.etapas.map((e) => {
                            const c = p.etapas[e.id];
                            const st = STATUS_ETAPA[c.status];
                            const ativo = sel?.tipo === "celula" && sel.pid === p.id && sel.eid === e.id;
                            return (
                              <td key={e.id} style={{ ...tdBase, textAlign: "center", padding: 4 }}>
                                <button
                                  type="button"
                                  onClick={() => setSel({ tipo: "celula", pid: p.id, eid: e.id })}
                                  title={c.sugestao && !c.lancado ? `Sugestão pela presença: ${STATUS_ETAPA[c.sugestao].label}` : "Lançar status e avaliação"}
                                  style={{ width: "100%", minHeight: 52, borderRadius: radius.sm, cursor: "pointer", padding: 6, display: "grid", gap: 2, justifyItems: "center", alignContent: "center", background: c.lancado ? st.bg : "#fff", border: `2px ${c.lancado ? "solid" : "dashed"} ${ativo ? colors.primary : c.lancado ? st.cor : colors.border}`, color: c.lancado ? st.cor : colors.textMuted }}
                                >
                                  <span style={{ fontSize: 12, fontWeight: 800 }}>{c.lancado ? st.label : c.sugestao ? `Sugestão: ${STATUS_ETAPA[c.sugestao].label}` : "—"}</span>
                                  {c.avaliacao && <span style={{ ...selo, fontSize: 10, background: AVALIACAO[c.avaliacao].bg, color: AVALIACAO[c.avaliacao].cor }}>{AVALIACAO[c.avaliacao].label}{c.nota !== null ? ` · ${fmtNum(c.nota)}` : ""}</span>}
                                  <span style={{ fontSize: 10.5, fontWeight: 600, color: colors.textSecondary }}>{c.encontros ? `${fmtNum(c.horas)} h${c.pct_presenca === null ? "" : ` · ${fmtNum(c.pct_presenca, 0)}%`}` : "sem encontros"}</span>
                                </button>
                              </td>
                            );
                          })}
                          <td style={{ ...tdBase, textAlign: "center", fontWeight: 800 }} title={p.base_pct_jornada === "horas" ? "Horas realizadas ÷ carga prevista das etapas" : "Etapas concluídas ÷ etapas"}>
                            {p.pct_jornada === null ? "—" : `${fmtNum(p.pct_jornada)}%`}
                          </td>
                          <td style={{ ...tdBase, textAlign: "center" }}>{fmtNum(p.horas)} h</td>
                          <td style={{ ...tdBase, textAlign: "center", fontWeight: 700, color: farol.cor }}>{p.pct_presenca === null ? "—" : `${fmtNum(p.pct_presenca)}%`}</td>
                          <td style={{ ...tdBase, textAlign: "center" }}>{p.evolucao_total ? `${p.evolucao_total} nota(s)` : "—"}</td>
                        </tr>
                      );
                    })}
                    {linhas.length === 0 && (
                      <tr>
                        <td style={{ ...tdBase, textAlign: "center", color: colors.textMuted }} colSpan={dados.etapas.length + 5}>
                          Nenhum participante encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {sel?.tipo === "celula" && participanteSel && etapaSel && (
                <EditorEtapa
                  key={`${sel.pid}:${sel.eid}:${participanteSel.etapas[sel.eid].atualizado_em || "novo"}`}
                  participante={participanteSel}
                  etapa={etapaSel}
                  celula={participanteSel.etapas[sel.eid]}
                  hoje={dados.hoje}
                  setErro={setErro}
                  setAviso={setAviso}
                  onFechar={() => setSel(null)}
                  onSalvou={() => {
                    setSel(null);
                    carregar(true);
                  }}
                />
              )}
              {sel?.tipo === "pessoa" && participanteSel && (
                <PainelPessoa key={sel.pid} participanteId={sel.pid} hoje={dados.hoje} setErro={setErro} setAviso={setAviso} onFechar={() => setSel(null)} onMudou={() => carregar(true)} />
              )}
            </div>
          </SectionCard>
        )}

        {carregando && !dados && <div style={vazio}>Carregando...</div>}
      </div>
    </PortalShell>
  );
}

const thBase = { position: "sticky", top: 0, zIndex: 2, background: colors.surfaceMuted, color: colors.textSecondary, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", padding: "8px 10px", borderBottom: `1px solid ${colors.border}`, textAlign: "left", verticalAlign: "bottom" };
const tdBase = { padding: "6px 10px", borderBottom: `1px solid ${colors.border}`, verticalAlign: "middle" };
const fixaEsq = { position: "sticky", left: 0, zIndex: 3, borderRight: `1px solid ${colors.border}` };
