"use client";

// Turnover (13/11/2026): saídas por mês, tempo de casa, motivos, serviço e site. Quem importa e vê a lista nominal é a equipe do RH;
// o gestor do RH vê só números de grupos com o mínimo de pessoas. Taxa = saídas ÷ headcount médio do quadro mensal.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import StatCard from "../../../components/StatCard";
import RhImportador from "../../../components/RhImportador";
import RhCadastralImportador from "../../../components/RhCadastralImportador";
import { SerieMensal, Barra, Grade, Aviso, TabelaGrupo } from "../../../components/RhRetencaoUi";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { st, Campo, Select, Abas, perfilRh, ehOperacaoRh, PERFIL_COORD, pct1, fmtN, fmtDia, COR_RH } from "../../../components/RhUi";

export default function TurnoverPage() {
  const [perfil, setPerfil] = useState("");
  const [aba, setAba] = useState("resultado");
  const [f, setF] = useState({ de: "", ate: "", servico: "", site: "" });
  const [t, setT] = useState(null);
  const [op, setOp] = useState(null);
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [carregando, setCarregando] = useState(true);
  useEffect(() => { setPerfil(perfilRh()); }, []);
  const operacao = ehOperacaoRh(perfil);

  const qs = useMemo(() => { const p = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); }); return p.toString(); }, [f]);
  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setT(await apiFetch(`/rh/turnover?${qs}`)); setErro(""); } catch (e) { setErro(e.message || "Não foi possível carregar o turnover."); } finally { setCarregando(false); }
  }, [qs]);
  const carregarOpcoes = useCallback(() => { apiFetch("/rh/turnover/opcoes").then(setOp).catch(() => {}); }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { carregarOpcoes(); }, [carregarOpcoes]);
  useEffect(() => {
    if (aba !== "lista" || !operacao) return;
    apiFetch(`/rh/turnover/lista?${qs}`).then(setLista).catch((e) => setErro(e.message || "Não foi possível carregar a lista."));
  }, [aba, qs, operacao]);

  const baixar = () => apiDownload(`/rh/turnover/exportar?${qs}`, `turnover_${new Date().toISOString().slice(0, 10)}.xlsx`).catch((e) => setErro(e.message || "Não foi possível baixar o Excel."));
  const apagar = async (l) => {
    if (!window.confirm(`Apagar o desligamento da matrícula ${l.matricula} (${fmtDia(l.data_desligamento)})? A resposta da pesquisa, se houver, continua guardada.`)) return;
    try { await apiFetch(`/rh/turnover/desligamentos/${l.id}`, { method: "DELETE" }); setMsg("Desligamento apagado."); setLista(null); carregar(); carregarOpcoes(); apiFetch(`/rh/turnover/lista?${qs}`).then(setLista).catch(() => {}); }
    catch (e) { setErro(e.message || "Não foi possível apagar."); }
  };
  const g = t?.geral;
  const abas = [{ value: "resultado", label: "Resultado" }, ...(operacao ? [{ value: "lista", label: "Lista nominal" }, { value: "importar", label: "Importar planilhas" }] : [])];
  const filtrando = Boolean(f.de || f.ate || f.servico || f.site);

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas" title="Turnover" subtitle={t?.periodo ? `${fmtDia(t.periodo.de)} a ${fmtDia(t.periodo.ate)}` : "Saídas, tempo de casa e motivos"} />
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}
      {msg ? <div style={{ ...st.ok, marginTop: 14 }}>{msg}</div> : null}
      <div style={{ ...st.card, marginTop: 16 }}>
        <div style={st.filtros}>
          <Campo label="Saídas de" minWidth={140}><input style={st.input} type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} /></Campo>
          <Campo label="até" minWidth={140}><input style={st.input} type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} /></Campo>
          <Campo label="Serviço" minWidth={200}><Select value={f.servico} onChange={(v) => setF({ ...f, servico: v })} vazio="Todos os serviços" opcoes={(op?.servicos || []).map((s) => ({ value: s, label: s }))} /></Campo>
          <Campo label="Site" minWidth={170}><Select value={f.site} onChange={(v) => setF({ ...f, site: v })} vazio="Todos os sites" opcoes={(op?.sites || []).map((s) => ({ value: s.valor, label: s.rotulo }))} /></Campo>
          {filtrando ? <div style={{ alignSelf: "flex-end" }}><button type="button" style={st.btnGhost} onClick={() => setF({ de: "", ate: "", servico: "", site: "" })}>Limpar filtros</button></div> : null}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={{ ...st.btnGhost, opacity: t && !carregando ? 1 : 0.5 }} disabled={!t || carregando} onClick={baixar}>Baixar Excel</button>
          <span style={{ fontSize: 12, color: colors.textMuted }}>{operacao ? "O Excel do RH inclui a lista nominal. Não envie para fora do RH." : "Sem nomes. Grupos pequenos não aparecem."} Sem datas, mostra os últimos 12 meses.</span>
        </div>
      </div>

      <div style={{ marginTop: 16 }}><Abas abas={abas} valor={aba} onChange={setAba} /></div>

      {aba === "resultado" ? (
        <div style={{ opacity: carregando ? 0.6 : 1 }}>
          {!t && !erro ? <p style={st.vazio}>Carregando…</p> : null}
          {t?.poucos ? <div style={{ ...st.card, textAlign: "center", padding: 28 }}><p style={{ margin: 0, color: colors.textSecondary }}>{t.mensagem}</p></div> : null}
          {t && !t.poucos && g.desligamentos === 0 ? (
            <div style={{ ...st.card, textAlign: "center", padding: 28 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Nenhum desligamento nesse período</h3>
              <p style={{ margin: "0 0 12px", color: colors.textSecondary, fontSize: 13.5 }}>{operacao ? "Importe a planilha de desligamentos (e o quadro mensal, para ter o percentual)." : "Quando o RH importar os desligamentos, eles aparecem aqui."}</p>
              {operacao ? <button type="button" style={st.btn} onClick={() => setAba("importar")}>Importar planilhas</button> : null}
            </div>
          ) : null}
          {t && !t.poucos && g.desligamentos > 0 ? (
            <>
              <Grade>
                <StatCard title="Saídas no período" value={fmtN(g.desligamentos)} subtitle={`${fmtN(g.voluntarios)} pedidos de demissão · ${fmtN(g.involuntarios)} por iniciativa da empresa`} accent={COR_RH} />
                <StatCard title="Taxa do período" value={g.taxa_periodo !== null ? pct1(g.taxa_periodo) : "—"} subtitle={g.headcount_medio ? `Headcount médio ${fmtN(g.headcount_medio)} · ${pct1(g.taxa_mensal_media)} ao mês` : "Importe o quadro mensal para ver o percentual"} accent="#dc2626" />
                <StatCard title="Saída precoce" value={g.saida_precoce_pct !== null ? pct1(g.saida_precoce_pct) : "—"} subtitle={`${fmtN(g.saida_precoce)} de ${fmtN(g.com_admissao)} saíram com até 90 dias de casa`} accent="#f59e0b" />
                {t.canguru ? <StatCard title="Sinal no Canguru" value={t.canguru.com_sinal_pct !== null ? pct1(t.canguru.com_sinal_pct) : "—"} subtitle={`${fmtN(t.canguru.com_sinal)} de ${fmtN(t.canguru.precoces_no_canguru)} saídas precoces já tinham sinal de atenção`} accent="#2563eb" /> : null}
              </Grade>
              <div style={{ ...st.card, marginTop: 16 }}><h3 style={st.cardTitle}>Saídas por mês</h3><SerieMensal mensal={t.mensal} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 16 }}>
                <div style={st.card}>
                  <h3 style={st.cardTitle}>Tempo de casa na saída</h3>
                  {t.faixas_tempo.map((x) => (
                    <div key={x.rotulo} style={{ marginBottom: 9 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span>{x.rotulo}</span><strong>{fmtN(x.n)}{x.pct !== null ? ` · ${pct1(x.pct)}` : ""}</strong></div>
                      <Barra valor={x.pct || 0} titulo={x.rotulo} />
                    </div>
                  ))}
                </div>
                <div style={st.card}>
                  <h3 style={st.cardTitle}>Motivos mais citados</h3>
                  {t.motivos.length ? t.motivos.map((x) => (
                    <div key={x.rotulo} style={{ marginBottom: 9 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, gap: 8 }}><span>{x.rotulo}</span><strong>{fmtN(x.n)} · {pct1(x.pct)}</strong></div>
                      <Barra valor={x.pct || 0} cor="#7c3aed" titulo={x.rotulo} />
                    </div>
                  )) : <p style={st.vazio}>Nenhum motivo informado na planilha.</p>}
                </div>
              </div>
              {(() => {
                const cols = [
                  { titulo: "Saídas", render: (l) => fmtN(l.desligamentos) },
                  { titulo: "Pedidos de demissão", render: (l) => fmtN(l.voluntarios) },
                  { titulo: "Saída precoce", render: (l) => (l.saida_precoce_pct !== null ? `${fmtN(l.saida_precoce)} (${pct1(l.saida_precoce_pct)})` : "—") },
                  { titulo: "Headcount médio", render: (l) => (l.headcount_medio !== null ? fmtN(l.headcount_medio) : "—") },
                  { titulo: "Taxa do período", render: (l) => (l.taxa_periodo !== null ? pct1(l.taxa_periodo) : "—") },
                ];
                return <><TabelaGrupo titulo="Por serviço" grupo={t.por_servico} colunas={cols} /><TabelaGrupo titulo="Por site" grupo={t.por_site} colunas={cols} /></>;
              })()}
              <div style={{ ...st.card, marginTop: 16 }}>
                <Aviso lista={t.avisos} />
                <p style={{ margin: "10px 0 0", fontSize: 12.5 }}>
                  <Link href="/rh/desligamento" style={{ color: "#9d174d", fontWeight: 800 }}>Ver a pesquisa de desligamento →</Link>{" "}
                  <Link href={"/rh/planos?novo=turnover&tema=Turnover"} style={{ color: "#9d174d", fontWeight: 800, marginLeft: 12 }}>{operacao ? "Abrir um plano de ação →" : "Planos de ação →"}</Link>
                </p>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {aba === "lista" && operacao ? (
        <div style={st.card}>
          <h3 style={st.cardTitle}>Lista nominal de desligamentos</h3>
          <p style={{ margin: "-6px 0 12px", fontSize: 12.5, color: colors.textMuted }}>Uso interno do RH: cada abertura desta lista fica registrada.</p>
          {!lista ? <p style={st.vazio}>Carregando…</p> : !lista.desligamentos.length ? <p style={st.vazio}>Nenhum desligamento nesse período.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
                <thead><tr><th style={st.th}>Matrícula</th><th style={st.th}>Nome</th><th style={st.th}>Serviço</th><th style={st.th}>Admissão</th><th style={st.th}>Saída</th><th style={st.th}>Dias</th><th style={st.th}>Tipo</th><th style={st.th}>Motivo</th><th style={st.th}>Pesquisa</th>{perfil === PERFIL_COORD ? <th style={st.th} /> : null}</tr></thead>
                <tbody>{lista.desligamentos.map((l) => (
                  <tr key={l.id}>
                    <td style={st.td}>{l.matricula}</td><td style={st.td}>{l.nome || "—"}</td><td style={st.td}>{l.servico || "—"}</td><td style={st.td}>{l.data_admissao ? fmtDia(l.data_admissao) : "—"}</td><td style={st.td}>{fmtDia(l.data_desligamento)}</td>
                    <td style={st.td}>{l.dias_de_casa !== null ? fmtN(l.dias_de_casa) : "—"}</td><td style={st.td}>{l.tipo_rotulo}</td><td style={st.td}>{l.motivo || "—"}</td><td style={st.td}>{l.respondeu_pesquisa ? "Respondeu" : "—"}</td>
                    {perfil === PERFIL_COORD ? <td style={st.td}><button type="button" style={st.btnMiniDanger} onClick={() => apagar(l)}>Apagar</button></td> : null}
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {aba === "importar" && operacao ? (
        <>
          <RhCadastralImportador onGravado={() => { carregar(); carregarOpcoes(); }} />
          <p style={{ margin: "18px 0 0", fontSize: 12.5, color: colors.textMuted }}>Ou envie planilhas separadas (menores que 15 MB):</p>
          <RhImportador titulo="1. Desligamentos" modelo="desligamentos" modeloNome="modelo_desligamentos.xlsx" endpoint="/rh/turnover/desligamentos/importar" onGravado={() => { carregar(); carregarOpcoes(); }}
            ajuda="Uma linha por pessoa que saiu. Obrigatórias: Matrícula e Data do desligamento. Opcionais: nome, cargo, serviço, site, coordenador, supervisor, data de admissão, tipo (pedido de demissão ou iniciativa da empresa), motivo e se é recontratável. Importar de novo a mesma matrícula e data atualiza, não duplica."
            campos={(r) => [["Pedidos de demissão", r.resumo.voluntarios], ["Iniciativa da empresa", r.resumo.involuntarios], ["Saída precoce", r.resumo.saida_precoce], ["Ligados ao Canguru", r.resumo.ligados_ao_canguru]]} />
          <RhImportador titulo="2. Quadro mensal (para o percentual)" modelo="quadro" modeloNome="modelo_quadro_mensal.xlsx" endpoint="/rh/turnover/quadro/importar" onGravado={() => { carregar(); carregarOpcoes(); }}
            ajuda="Quantas pessoas havia em cada mês: Competência (mês/ano) e Headcount. Serviço e site são opcionais; com serviço, o turnover por serviço também sai em percentual."
            campos={(r) => [["Meses", r.resumo.meses], ["De", r.resumo.de || "—"], ["Até", r.resumo.ate || "—"]]} />
          {op?.base ? <p style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 10 }}>Na base hoje: {fmtN(op.base.desligamentos)} desligamento(s){op.base.de ? ` (de ${fmtDia(op.base.de)} a ${fmtDia(op.base.ate)})` : ""} e {fmtN(op.base.quadro_linhas)} linha(s) de quadro.</p> : null}
        </>
      ) : null}
    </PortalShell>
  );
}
