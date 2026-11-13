"use client";

// Pesquisa de desligamento (13/11/2026): por que as pessoas saem, nas palavras delas. Notas de 1 a 5, motivo principal, "recomendaria" e "voltaria".
// Comentários só para a equipe do RH, sem nome; gestor do RH vê só números de grupos com o mínimo de respostas.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/PortalShell";
import PageHero from "../../../components/PageHero";
import StatCard from "../../../components/StatCard";
import RhImportador from "../../../components/RhImportador";
import { Barra, Grade, Aviso, TabelaGrupo } from "../../../components/RhRetencaoUi";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors } from "../../../lib/theme";
import { st, Campo, Select, Abas, Badge, perfilRh, ehOperacaoRh, pct1, dec1, fmtN, fmtDia, COR_RH } from "../../../components/RhUi";

export default function DesligamentoPage() {
  const [perfil, setPerfil] = useState("");
  const [aba, setAba] = useState("resultado");
  const [f, setF] = useState({ de: "", ate: "", servico: "", site: "" });
  const [p, setP] = useState(null);
  const [op, setOp] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  useEffect(() => { setPerfil(perfilRh()); }, []);
  const operacao = ehOperacaoRh(perfil);

  const qs = useMemo(() => { const q = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => { if (v) q.set(k, v); }); return q.toString(); }, [f]);
  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setP(await apiFetch(`/rh/desligamento?${qs}`)); setErro(""); } catch (e) { setErro(e.message || "Não foi possível carregar a pesquisa."); } finally { setCarregando(false); }
  }, [qs]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { apiFetch("/rh/turnover/opcoes").then(setOp).catch(() => {}); }, []);
  const baixar = () => apiDownload(`/rh/desligamento/exportar?${qs}`, `pesquisa_desligamento_${new Date().toISOString().slice(0, 10)}.xlsx`).catch((e) => setErro(e.message || "Não foi possível baixar o Excel."));
  const abas = [{ value: "resultado", label: "Resultado" }, ...(operacao ? [{ value: "importar", label: "Importar planilha" }] : [])];
  const filtrando = Boolean(f.de || f.ate || f.servico || f.site);
  const corNota = (n) => (n === null ? "#94a3b8" : n >= 4 ? "#16a34a" : n >= 3 ? "#f59e0b" : "#dc2626");

  return (
    <PortalShell>
      <PageHero eyebrow="Relações Humanas" title="Pesquisa de desligamento" subtitle={p?.periodo ? `Respostas de ${fmtDia(p.periodo.de)} a ${fmtDia(p.periodo.ate)}` : "Por que as pessoas saem"} />
      {erro ? <div style={{ ...st.erro, marginTop: 14 }}>{erro}</div> : null}
      <div style={{ ...st.card, marginTop: 16 }}>
        <div style={st.filtros}>
          <Campo label="Respostas de" minWidth={140}><input style={st.input} type="date" value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} /></Campo>
          <Campo label="até" minWidth={140}><input style={st.input} type="date" value={f.ate} onChange={(e) => setF({ ...f, ate: e.target.value })} /></Campo>
          <Campo label="Serviço" minWidth={200}><Select value={f.servico} onChange={(v) => setF({ ...f, servico: v })} vazio="Todos os serviços" opcoes={(op?.servicos || []).map((s) => ({ value: s, label: s }))} /></Campo>
          <Campo label="Site" minWidth={170}><Select value={f.site} onChange={(v) => setF({ ...f, site: v })} vazio="Todos os sites" opcoes={(op?.sites || []).map((s) => ({ value: s.valor, label: s.rotulo }))} /></Campo>
          {filtrando ? <div style={{ alignSelf: "flex-end" }}><button type="button" style={st.btnGhost} onClick={() => setF({ de: "", ate: "", servico: "", site: "" })}>Limpar filtros</button></div> : null}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" style={{ ...st.btnGhost, opacity: p && !carregando ? 1 : 0.5 }} disabled={!p || carregando} onClick={baixar}>Baixar Excel</button>
          <span style={{ fontSize: 12, color: colors.textMuted }}>{operacao ? "O Excel do RH inclui os comentários (sem nome). Uso interno." : "Sem comentários. Grupos pequenos não aparecem."} Sem datas, mostra os últimos 12 meses.</span>
        </div>
      </div>
      <div style={{ marginTop: 16 }}><Abas abas={abas} valor={aba} onChange={setAba} /></div>

      {aba === "resultado" ? (
        <div style={{ opacity: carregando ? 0.6 : 1 }}>
          {!p && !erro ? <p style={st.vazio}>Carregando…</p> : null}
          {p?.poucos ? <div style={{ ...st.card, textAlign: "center", padding: 28 }}><p style={{ margin: 0, color: colors.textSecondary }}>{p.mensagem}</p></div> : null}
          {p && !p.poucos && p.respostas === 0 ? (
            <div style={{ ...st.card, textAlign: "center", padding: 28 }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Nenhuma resposta nesse período</h3>
              <p style={{ margin: "0 0 12px", color: colors.textSecondary, fontSize: 13.5 }}>{operacao ? "Importe a planilha da pesquisa de desligamento (importe os desligamentos antes, para ligar cada resposta ao serviço e ao site)." : "Quando o RH importar as respostas, elas aparecem aqui."}</p>
              {operacao ? <button type="button" style={st.btn} onClick={() => setAba("importar")}>Importar planilha</button> : null}
            </div>
          ) : null}
          {p && !p.poucos && p.respostas > 0 ? (
            <>
              <Grade>
                <StatCard title="Respostas" value={fmtN(p.respostas)} subtitle={p.cobertura_pct !== null ? `${pct1(p.cobertura_pct)} dos ${fmtN(p.desligamentos_no_periodo)} desligamentos do período` : "Cobertura indisponível"} accent={COR_RH} />
                <StatCard title="Recomendaria a empresa" value={p.recomendaria.pct !== null ? pct1(p.recomendaria.pct) : "—"} subtitle={`${fmtN(p.recomendaria.sim)} de ${fmtN(p.recomendaria.n)} responderam sim`} accent="#16a34a" />
                <StatCard title="Voltaria a trabalhar aqui" value={p.voltaria.pct !== null ? pct1(p.voltaria.pct) : "—"} subtitle={`${fmtN(p.voltaria.sim)} de ${fmtN(p.voltaria.n)} responderam sim`} accent="#2563eb" />
                {operacao && p.prioritarios ? <StatCard title="Comentários prioritários" value={fmtN(p.prioritarios)} subtitle="Citam termos de atenção (assédio, ameaça, saúde...)" accent="#dc2626" /> : null}
              </Grade>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 16 }}>
                <div style={st.card}>
                  <h3 style={st.cardTitle}>Nota média por assunto (1 a 5)</h3>
                  {p.notas.map((n) => (
                    <div key={n.id} style={{ marginBottom: 9 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span>{n.nome}</span><strong>{n.media !== null ? dec1(n.media) : "—"} <span style={{ fontWeight: 500, color: colors.textMuted }}>({fmtN(n.n)})</span></strong></div>
                      <Barra valor={n.media || 0} max={5} cor={corNota(n.media)} titulo={n.nome} />
                    </div>
                  ))}
                </div>
                <div style={st.card}>
                  <h3 style={st.cardTitle}>Motivo principal</h3>
                  {p.motivos.length ? p.motivos.map((x) => (
                    <div key={x.rotulo} style={{ marginBottom: 9 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, gap: 8 }}><span>{x.rotulo}</span><strong>{fmtN(x.n)} · {pct1(x.pct)}</strong></div>
                      <Barra valor={x.pct || 0} cor="#7c3aed" titulo={x.rotulo} />
                    </div>
                  )) : <p style={st.vazio}>Nenhum motivo informado.</p>}
                </div>
              </div>
              {(() => {
                const cols = [
                  { titulo: "Respostas", render: (l) => fmtN(l.respostas) },
                  { titulo: "Nota média", render: (l) => (l.nota_media !== null ? dec1(l.nota_media) : "—") },
                  { titulo: "Recomendaria", render: (l) => (l.recomendaria_pct !== null ? pct1(l.recomendaria_pct) : "—") },
                  { titulo: "Motivo mais citado", render: (l) => l.motivo_principal || "—" },
                ];
                return <><TabelaGrupo titulo="Por serviço" grupo={p.por_servico} colunas={cols} /><TabelaGrupo titulo="Por site" grupo={p.por_site} colunas={cols} /></>;
              })()}
              {operacao && p.comentarios?.length ? (
                <div style={{ ...st.card, marginTop: 16 }}>
                  <h3 style={st.cardTitle}>O que as pessoas escreveram</h3>
                  <p style={{ margin: "-6px 0 12px", fontSize: 12.5, color: colors.textMuted }}>Sem nome e sem matrícula. Uso interno do RH: cada abertura fica registrada. Os prioritários vêm primeiro.</p>
                  <div style={{ display: "grid", gap: 10 }}>
                    {p.comentarios.map((c) => (
                      <div key={c.id} style={{ border: `1px solid ${c.prioritario ? "#fecaca" : colors.border}`, background: c.prioritario ? "#fef2f2" : "#fff", borderRadius: 12, padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 11.5, color: colors.textSecondary, marginBottom: 4 }}>
                          {c.prioritario ? <Badge tom="atrasado">Prioritário</Badge> : null}
                          <span>{fmtDia(c.data)}</span>{c.servico ? <span>· {c.servico}</span> : null}{c.site ? <span>· {c.site}</span> : null}{c.motivo ? <span>· Motivo: {c.motivo}</span> : null}
                        </div>
                        <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{c.texto}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div style={{ ...st.card, marginTop: 16 }}>
                <Aviso lista={p.avisos} />
                <p style={{ margin: "10px 0 0", fontSize: 12.5 }}>
                  <Link href="/rh/turnover" style={{ color: "#9d174d", fontWeight: 800 }}>Ver o turnover →</Link>
                  <Link href={"/rh/planos?novo=desligamento&tema=Pesquisa%20de%20desligamento"} style={{ color: "#9d174d", fontWeight: 800, marginLeft: 12 }}>{operacao ? "Abrir um plano de ação →" : "Planos de ação →"}</Link>
                </p>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {aba === "importar" && operacao ? (
        <RhImportador titulo="Pesquisa de desligamento" modelo="pesquisa" modeloNome="modelo_pesquisa_desligamento.xlsx" endpoint="/rh/desligamento/importar" onGravado={carregar}
          ajuda="Uma linha por resposta. Obrigatória: Matrícula (a data da resposta pode ficar em branco: vale a do desligamento importado). Opcionais: motivo principal, notas de 1 a 5 (liderança, remuneração, ambiente, carreira, atividades, condições), recomendaria e voltaria (sim/não) e comentário. Comentário com código de doença (CID) não é gravado."
          campos={(r) => [["Ligadas a desligamento", r.resumo.ligadas_ao_desligamento], ["Sem desligamento", r.resumo.sem_desligamento], ["Comentários prioritários", r.resumo.prioritarias]]} />
      ) : null}
    </PortalShell>
  );
}
