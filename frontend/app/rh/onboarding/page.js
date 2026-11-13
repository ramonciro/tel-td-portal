"use client";

// Onboarding dos novatos (13/11/2026): o RH acompanha a conversa de boas-vindas (padrão); o coordenador pode incluir etapas próprias, com prazo contado da admissão.
// A equipe do RH marca o que foi feito, em lote ou novato a novato; o coordenador ajusta as etapas. O gestor do RH vê só números de grupos com o mínimo de novatos.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import StatCard from "../../../components/StatCard";
import { Barra, Grade, Aviso, TabelaGrupo } from "../../../components/RhRetencaoUi";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { st, Campo, Select, Modal, Abas, Badge, perfilRh, ehOperacaoRh, PERFIL_COORD, pct1, fmtN, fmtDia, COR_RH } from "../../../components/RhUi";

const hojeIso = () => new Date().toISOString().slice(0, 10);

function EtapasConfig({ onFechar, onMudou }) {
  const [lista, setLista] = useState([]);
  const [novo, setNovo] = useState({ nome: "", prazo_dias: 7 });
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => apiFetch("/rh/onboarding/etapas").then((r) => setLista(r.etapas)).catch((e) => setErro(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);
  const salvar = async (id, corpo) => { setErro(""); try { await apiFetch(`/rh/onboarding/etapas/${id}`, { method: "PUT", body: JSON.stringify(corpo) }); await carregar(); onMudou(); } catch (e) { setErro(e.message); } };
  const criar = async () => { setErro(""); try { await apiFetch("/rh/onboarding/etapas", { method: "POST", body: JSON.stringify({ nome: novo.nome, prazo_dias: Number(novo.prazo_dias) }) }); setNovo({ nome: "", prazo_dias: 7 }); await carregar(); onMudou(); } catch (e) { setErro(e.message); } };
  return (
    <Modal titulo="Etapas do onboarding" onClose={onFechar} largura={720}>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: colors.textSecondary }}>O prazo conta em dias a partir da admissão. Etapa desativada some do painel, mas o que já foi marcado fica guardado.</p>
      {erro ? <div style={{ ...st.erro, marginBottom: 10 }}>{erro}</div> : null}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
          <thead><tr><th style={st.th}>Etapa</th><th style={st.th}>Prazo (dias)</th><th style={st.th}>Situação</th></tr></thead>
          <tbody>{lista.map((e) => (
            <tr key={e.id} style={{ opacity: e.ativa ? 1 : 0.55 }}>
              <td style={st.td}><input style={st.input} defaultValue={e.nome} maxLength={120} onBlur={(ev) => { if (ev.target.value.trim() && ev.target.value.trim() !== e.nome) salvar(e.id, { nome: ev.target.value }); }} /></td>
              <td style={{ ...st.td, width: 110 }}><input style={st.input} type="number" min={0} max={365} defaultValue={e.prazo_dias} onBlur={(ev) => { if (Number(ev.target.value) !== e.prazo_dias) salvar(e.id, { prazo_dias: Number(ev.target.value) }); }} /></td>
              <td style={st.td}><button type="button" style={e.ativa ? st.btnMiniDanger : st.btnMini} onClick={() => salvar(e.id, { ativa: !e.ativa })}>{e.ativa ? "Desativar" : "Reativar"}</button></td>
            </tr>))}</tbody>
        </table>
      </div>
      <h4 style={{ margin: "16px 0 6px", fontSize: 14 }}>Nova etapa</h4>
      <div style={st.filtros}>
        <Campo label="Nome" flex={3} minWidth={220}><input style={st.input} value={novo.nome} maxLength={120} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Visita ao posto de trabalho" /></Campo>
        <Campo label="Prazo (dias)" minWidth={110}><input style={st.input} type="number" min={0} max={365} value={novo.prazo_dias} onChange={(e) => setNovo({ ...novo, prazo_dias: e.target.value })} /></Campo>
        <div style={{ alignSelf: "flex-end" }}><button type="button" style={st.btn} onClick={criar}>Adicionar</button></div>
      </div>
    </Modal>
  );
}

export default function OnboardingPage() {
  const [perfil, setPerfil] = useState("");
  const [aba, setAba] = useState("resumo");
  const [f, setF] = useState({ de: "", ate: "", servico: "", site: "" });
  const [d, setD] = useState(null);
  const [op, setOp] = useState(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [sel, setSel] = useState([]);
  const [lote, setLote] = useState({ etapa_id: "", status: "feito", feito_em: hojeIso() });
  const [config, setConfig] = useState(false);
  const [busca, setBusca] = useState("");
  const [soAtrasados, setSoAtrasados] = useState(false);
  useEffect(() => { setPerfil(perfilRh()); }, []);
  const operacao = ehOperacaoRh(perfil);

  const qs = useMemo(() => { const p = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); }); return p.toString(); }, [f]);
  const carregar = useCallback(async () => {
    setCarregando(true);
    try { const r = await apiFetch(`/rh/onboarding?${qs}`); setD(r); setErro(""); setSel([]); } catch (e) { setErro(e.message || "Não foi possível carregar o onboarding."); } finally { setCarregando(false); }
  }, [qs]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { apiFetch("/rh/onboarding/opcoes").then(setOp).catch(() => {}); }, []);

  const baixar = () => apiDownload(`/rh/onboarding/exportar?${qs}`, `onboarding_${hojeIso()}.xlsx`).catch((e) => setErro(e.message || "Não foi possível baixar o Excel."));
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return (d?.novatos_lista || []).filter((n) => (!soAtrasados || n.atrasadas > 0) && (!b || String(n.nome || "").toLowerCase().includes(b) || String(n.matricula || "").toLowerCase().includes(b)));
  }, [d, busca, soAtrasados]);
  const marcar = async (ids, etapaId, status, feitoEm) => {
    setErro(""); setMsg("");
    try {
      const r = await apiFetch("/rh/onboarding/marcar", { method: "POST", body: JSON.stringify({ novato_ids: ids, etapa_id: Number(etapaId), status, feito_em: status === "feito" ? feitoEm : undefined }) });
      setMsg(`Etapa “${r.etapa}” atualizada para ${r.novatos} novato(s).`); await carregar();
    } catch (e) { setErro(e.message || "Não foi possível marcar."); }
  };
  const alternar = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const g = d?.geral;
  const abas = [{ value: "resumo", label: "Resumo" }, ...(operacao ? [{ value: "novatos", label: "Novatos e etapas" }] : [])];
  const filtrando = Boolean(f.de || f.ate || f.servico || f.site);
  const CEL = { feito: ["#dcfce7", "#166534", "✓"], na: ["#f1f5f9", "#64748b", "n/a"], pendente: ["#fff", "#64748b", "·"], atrasada: ["#fee2e2", "#991b1b", "!"] };

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas" title="Onboarding" subtitle={d?.periodo ? `Admissões de ${fmtDia(d.periodo.de)} a ${fmtDia(d.periodo.ate)}` : "Conversa de boas-vindas dos novatos"}
        actions={perfil === PERFIL_COORD ? <button type="button" style={st.btnGhost} onClick={() => setConfig(true)}>Etapas</button> : null} />
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}
      {msg ? <div style={{ ...st.ok, marginTop: 14 }}>{msg}</div> : null}
      <div style={{ ...st.card, marginTop: 16 }}>
        <div style={st.filtros}>
          <Campo label="Admitidos de" minWidth={140}><input style={st.input} type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} /></Campo>
          <Campo label="até" minWidth={140}><input style={st.input} type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} /></Campo>
          <Campo label="Serviço" minWidth={200}><Select value={f.servico} onChange={(v) => setF({ ...f, servico: v })} vazio="Todos os serviços" opcoes={(op?.servicos || []).map((s) => ({ value: s, label: s }))} /></Campo>
          <Campo label="Site" minWidth={170}><Select value={f.site} onChange={(v) => setF({ ...f, site: v })} vazio="Todos os sites" opcoes={(op?.sites || []).map((s) => ({ value: s.valor, label: s.rotulo }))} /></Campo>
          {filtrando ? <div style={{ alignSelf: "flex-end" }}><button type="button" style={st.btnGhost} onClick={() => setF({ de: "", ate: "", servico: "", site: "" })}>Limpar filtros</button></div> : null}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={{ ...st.btnGhost, opacity: d && !carregando ? 1 : 0.5 }} disabled={!d || carregando} onClick={baixar}>Baixar Excel</button>
          <span style={{ fontSize: 12, color: colors.textMuted }}>Sem datas, mostra quem foi admitido nos últimos 60 dias. A lista de novatos vem do Projeto Canguru.</span>
        </div>
      </div>
      <div style={{ marginTop: 16 }}><Abas abas={abas} valor={aba} onChange={setAba} /></div>

      {d?.poucos ? <div style={{ ...st.card, textAlign: "center", padding: 28 }}><p style={{ margin: 0, color: colors.textSecondary }}>{d.mensagem}</p></div> : null}
      {!d && !erro ? <p style={st.vazio}>Carregando…</p> : null}

      {d && !d.poucos && aba === "resumo" ? (
        <div style={{ opacity: carregando ? 0.6 : 1 }}>
          {g.novatos === 0 ? <div style={{ ...st.card, textAlign: "center", padding: 28 }}><p style={{ margin: 0, color: colors.textSecondary }}>Nenhum novato com data de admissão nesse período. Importe as avaliações ou as admissões no Projeto Canguru.</p></div> : (
            <>
              <Grade>
                <StatCard title="Novatos acompanhados" value={fmtN(g.novatos)} subtitle="Admitidos no período, sem os já desligados" accent={COR_RH} />
                <StatCard title="Etapas concluídas" value={g.pct_concluido !== null ? pct1(g.pct_concluido) : "—"} subtitle={`${fmtN(g.feitas)} de ${fmtN(g.etapas_aplicaveis)} etapas`} accent="#16a34a" />
                <StatCard title="Etapas atrasadas" value={fmtN(g.atrasadas)} subtitle={`${fmtN(g.com_atraso)} novato(s) com algum atraso`} accent="#dc2626" />
                <StatCard title="Feitas no prazo" value={g.pct_no_prazo !== null ? pct1(g.pct_no_prazo) : "—"} subtitle="Entre as etapas já concluídas" accent="#2563eb" />
              </Grade>
              <div style={{ ...st.card, marginTop: 16 }}>
                <h3 style={st.cardTitle}>Por etapa</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                    <thead><tr><th style={st.th}>Etapa</th><th style={st.th}>Prazo</th><th style={st.th}>Concluída</th><th style={st.th}>Atrasadas</th><th style={st.th}>No prazo</th></tr></thead>
                    <tbody>{d.por_etapa.map((e) => (
                      <tr key={e.id}>
                        <td style={st.td}><strong>{e.nome}</strong></td><td style={st.td}>D+{e.prazo_dias}</td>
                        <td style={{ ...st.td, minWidth: 170 }}><div style={{ fontSize: 12, marginBottom: 3 }}>{e.pct_feitas !== null ? pct1(e.pct_feitas) : "—"} <span style={{ color: colors.textMuted }}>({fmtN(e.feitas)}/{fmtN(e.aplicaveis)})</span></div><Barra valor={e.pct_feitas || 0} cor="#16a34a" titulo={e.nome} /></td>
                        <td style={st.td}>{e.atrasadas ? <Badge tom="atrasado">{fmtN(e.atrasadas)}</Badge> : "—"}</td><td style={st.td}>{e.pct_no_prazo !== null ? pct1(e.pct_no_prazo) : "—"}</td>
                      </tr>))}</tbody>
                  </table>
                </div>
              </div>
              {(() => {
                const cols = [
                  { titulo: "Novatos", render: (l) => fmtN(l.novatos) }, { titulo: "Concluído", render: (l) => (l.pct_concluido !== null ? pct1(l.pct_concluido) : "—") },
                  { titulo: "Atrasadas", render: (l) => fmtN(l.atrasadas) }, { titulo: "No prazo", render: (l) => (l.pct_no_prazo !== null ? pct1(l.pct_no_prazo) : "—") },
                ];
                return <><TabelaGrupo titulo="Por serviço" grupo={d.por_servico} colunas={cols} /><TabelaGrupo titulo="Por site" grupo={d.por_site} colunas={cols} /></>;
              })()}
              <div style={{ ...st.card, marginTop: 16 }}><Aviso lista={d.avisos} /><p style={{ margin: "10px 0 0", fontSize: 12.5 }}><Link href="/rh/planos?novo=onboarding&tema=Onboarding" style={{ color: "#9d174d", fontWeight: 800 }}>{operacao ? "Abrir um plano de ação →" : "Planos de ação →"}</Link></p></div>
            </>
          )}
        </div>
      ) : null}

      {d && !d.poucos && aba === "novatos" && operacao ? (
        <div style={{ ...st.card, opacity: carregando ? 0.6 : 1 }}>
          <h3 style={st.cardTitle}>Novatos e etapas</h3>
          <p style={{ margin: "-6px 0 12px", fontSize: 12.5, color: colors.textMuted }}>Uso interno do RH: cada abertura desta lista fica registrada. Marque os novatos na caixa e use a barra abaixo para atualizar uma etapa de vários de uma vez.</p>
          <div style={st.filtros}>
            <Campo label="Buscar (nome ou matrícula)" minWidth={220}><input style={st.input} value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, alignSelf: "flex-end", height: 38 }}><input type="checkbox" checked={soAtrasados} onChange={(e) => setSoAtrasados(e.target.checked)} /> Só com atraso</label>
          </div>
          <div style={{ background: "#fdf2f8", border: "1px solid #fbcfe8", borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={st.filtros}>
              <Campo label={`Marcar ${sel.length ? sel.length : "os selecionados"}`} flex={2} minWidth={220}>
                <Select value={lote.etapa_id} onChange={(v) => setLote({ ...lote, etapa_id: v })} vazio="Escolha a etapa" opcoes={d.etapas.map((e) => ({ value: String(e.id), label: `${e.nome} (D+${e.prazo_dias})` }))} />
              </Campo>
              <Campo label="Como" minWidth={150}><Select value={lote.status} onChange={(v) => setLote({ ...lote, status: v })} vazio={null} opcoes={[{ value: "feito", label: "Feita" }, { value: "na", label: "Não se aplica" }, { value: "pendente", label: "Voltar a pendente" }]} /></Campo>
              {lote.status === "feito" ? <Campo label="Feita em" minWidth={140}><input style={st.input} type="date" max={hojeIso()} value={lote.feito_em} onChange={(e) => setLote({ ...lote, feito_em: e.target.value })} /></Campo> : null}
              <div style={{ alignSelf: "flex-end", display: "flex", gap: 8 }}>
                <button type="button" style={{ ...st.btn, opacity: sel.length && lote.etapa_id ? 1 : 0.45 }} disabled={!sel.length || !lote.etapa_id} onClick={() => marcar(sel, lote.etapa_id, lote.status, lote.feito_em)}>Aplicar</button>
                <button type="button" style={st.btnGhost} onClick={() => setSel(sel.length === lista.length ? [] : lista.map((n) => n.id))}>{sel.length === lista.length && lista.length ? "Limpar seleção" : `Selecionar todos (${lista.length})`}</button>
              </div>
            </div>
          </div>
          {!lista.length ? <p style={st.vazio}>Nenhum novato com esses filtros.</p> : (
            <div style={{ overflowX: "auto", maxHeight: 640, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead><tr><th style={st.th} /><th style={st.th}>Novato</th><th style={st.th}>Admissão</th><th style={st.th}>%</th>{d.etapas.map((e) => <th key={e.id} style={{ ...st.th, textAlign: "center" }} title={`${e.nome} (D+${e.prazo_dias})`}>D+{e.prazo_dias}<div style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, fontSize: 10.5, maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.nome}</div></th>)}</tr></thead>
                <tbody>{lista.slice(0, 300).map((n) => (
                  <tr key={n.id}>
                    <td style={st.td}><input type="checkbox" checked={sel.includes(n.id)} onChange={() => alternar(n.id)} aria-label={`Selecionar ${n.nome || n.matricula}`} /></td>
                    <td style={st.td}><strong>{n.nome || "—"}</strong><div style={{ fontSize: 11.5, color: colors.textMuted }}>{n.matricula || "—"} · {n.servico || "sem serviço"}</div></td>
                    <td style={st.td}>{fmtDia(n.data_admissao)}<div style={{ fontSize: 11.5, color: colors.textMuted }}>dia {n.dia}</div></td>
                    <td style={st.td}>{n.pct !== null ? pct1(n.pct) : "—"}</td>
                    {n.cels.map((c) => {
                      const k = c.status === "pendente" && c.atrasada ? "atrasada" : c.status; const [bg, cor, t] = CEL[k];
                      return <td key={c.etapa_id} style={{ ...st.td, textAlign: "center", padding: 4 }}><button type="button" title={c.status === "feito" ? `Feita em ${fmtDia(c.feito_em)}${c.no_prazo === false ? " (fora do prazo)" : ""}` : `Prazo ${fmtDia(c.prazo)}. Clique para marcar como feita hoje`}
                        onClick={() => marcar([n.id], c.etapa_id, c.status === "feito" ? "pendente" : "feito", hojeIso())} style={{ minWidth: 40, height: 30, borderRadius: 8, border: `1px solid ${colors.border}`, background: bg, color: cor, fontWeight: 800, cursor: "pointer" }}>{t}</button></td>;
                    })}
                  </tr>))}</tbody>
              </table>
            </div>
          )}
          {lista.length > 300 ? <p style={{ fontSize: 12, color: colors.textMuted, margin: "8px 0 0" }}>Mostrando 300 de {fmtN(lista.length)}. Use os filtros para chegar nos demais (a seleção em lote vale para toda a lista filtrada).</p> : null}
          <p style={{ fontSize: 12, color: colors.textMuted, margin: "8px 0 0" }}>✓ feita · ! atrasada · n/a não se aplica · · pendente no prazo. Clicar numa caixinha alterna entre feita (hoje) e pendente.</p>
        </div>
      ) : null}
      {config ? <EtapasConfig onFechar={() => setConfig(false)} onMudou={carregar} /> : null}
    </PortalShell>
  );
}
