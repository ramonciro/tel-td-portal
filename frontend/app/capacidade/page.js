"use client";
 
import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { colors } from "../../lib/theme";
 
function fmt(n) { return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(Number(n || 0)); }
function fmtPct(n) { return n == null ? "—" : `${fmt(n)}%`; }
 
const STATUS_LABEL = {
  ocioso: "Ociosa",
  saudavel: "Saudável",
  atencao: "Atenção",
  sobrecarga: "Sobrecarga",
  sem_capacidade: "Sem capacidade definida",
};
 
export default function CapacidadePage() {
  const [operacoes, setOperacoes] = useState([]);
  const [operacaoFiltro, setOperacaoFiltro] = useState("");
  const [painel, setPainel] = useState(null);
  const [capacity, setCapacity] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [distribuicao, setDistribuicao] = useState(null);
  const [temas, setTemas] = useState([]);
  const [alertas, setAlertas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
 
  useEffect(() => { apiFetch("/capacidade/operacoes").then((r) => setOperacoes(r?.operacoes || [])).catch(() => {}); }, []);
  useEffect(() => { carregar(); }, [operacaoFiltro]);
 
  async function carregar() {
    try {
      setLoading(true); setErro("");
      const qs = operacaoFiltro ? `?cliente=${encodeURIComponent(operacaoFiltro)}` : "";
      const [p, c, r, t, a] = await Promise.all([
        apiFetch(`/capacidade/painel${qs}`),
        apiFetch(`/capacidade/capacity-consumido${qs}`),
        apiFetch(`/capacidade/ranking${qs}`),
        apiFetch(`/capacidade/aderencia-por-tema${qs}`),
        apiFetch("/capacidade/alertas"),
      ]);
      // distribuição por operação não recebe o próprio filtro de operação (é o gráfico que mostra todas)
      const d = await apiFetch("/capacidade/distribuicao-por-operacao");
      setPainel(p); setCapacity(c); setRanking(r?.itens || []);
      setDistribuicao(d); setTemas(t?.itens || []); setAlertas(a);
    } catch (e) {
      setErro(
        e.message?.includes("404") || e.message?.includes("Erro 404")
          ? "Essas rotas ainda não existem no backend que está no ar — é preciso publicar o backend atualizado (deste pacote) antes desta tela funcionar."
          : e.message || "Erro ao carregar indicadores de capacidade."
      );
    } finally { setLoading(false); }
  }
 
  const ind = painel?.indicadores || {};
 
  const rankingComMedalha = useMemo(() => {
    const medalhas = ["🥇", "🥈", "🥉"];
    return ranking.map((r) => ({ ...r, medalha: medalhas[r.posicao - 1] || "▫️" }));
  }, [ranking]);
 
  return (
    <PortalShell>
      <div style={{ marginBottom: 20 }}>
        <PageHero
          eyebrow="CH por instrutor · CH efetiva do time"
          title="Capacidade x Realizado"
          subtitle="Calculado automaticamente a partir das turmas e do cronograma já registrados no sistema — nada aqui exige lançamento manual adicional do time."
          actions={
            <select value={operacaoFiltro} onChange={(e) => setOperacaoFiltro(e.target.value)} style={selectFiltro}>
              <option value="">Todas as operações</option>
              {operacoes.map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
          }
        />
      </div>
 
      {erro && <div style={errBox}>{erro}</div>}
      {loading ? (
        <p style={{ color: "#64748b" }}>Carregando indicadores…</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
            <StatCard title="Capacidade nominal (período)" value={`${fmt(ind.capacidade_nominal_periodo)}h`} accent={colors.neutral} />
            <StatCard title="Capacidade mensal do time" value={`${fmt(ind.capacidade_mensal_time)}h`} accent={colors.info} />
            <StatCard title="Capacidade / instrutor (mês)" value={`${fmt(ind.capacidade_por_instrutor)}h`} accent={colors.info} />
            <StatCard title="CH programada (turmas)" value={`${fmt(ind.hc_programado_periodo)}h`} accent={colors.primary} />
            <StatCard title="CH efetiva realizada" value={`${fmt(ind.hc_realizado_periodo)}h`} accent={colors.success} />
            <StatCard title="Aderência geral" value={fmtPct(ind.aderencia_geral_pct)} accent={colors.accent} />
            <StatCard title="Ocupação do time" value={fmtPct(ind.ocupacao_time_pct)} accent={colors.navy} />
          </div>
 
          <div style={card}>
            <div style={cardTitle}>Capacity mensal do time × consumido</div>
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr style={theadRow}>
                    <th style={th}>Mês</th>
                    <th style={{ ...th, textAlign: "right" }}>Capacidade (h)</th>
                    <th style={{ ...th, textAlign: "right" }}>CH Realizada (h)</th>
                    <th style={{ ...th, textAlign: "right" }}>Desvio</th>
                    <th style={{ ...th, textAlign: "right" }}>% Ocupação</th>
                    <th style={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(painel?.por_mes || []).map((m) => (
                    <tr key={m.mes} style={tr}>
                      <td style={td}>{m.mes_extenso}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(m.capacidade_nominal)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(m.hc_realizado)}</td>
                      <td style={{ ...td, textAlign: "right", color: m.desvio < 0 ? colors.dangerText : colors.successText }}>{fmt(m.desvio)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmtPct(m.ocupacao_pct)}</td>
                      <td style={td}>{m.status_emoji}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
 
          <div style={{ ...card, marginTop: 20 }}>
            <div style={cardTitle}>Capacity x consumido — por instrutor (90 dias)</div>
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr style={theadRow}>
                    <th style={th}>Instrutor</th>
                    {(capacity?.meses || []).map((m) => <th key={m} style={{ ...th, textAlign: "right" }}>{m}</th>)}
                    <th style={{ ...th, textAlign: "right" }}>Total 90d</th>
                    <th style={{ ...th, textAlign: "right" }}>Cap. 90d</th>
                    <th style={{ ...th, textAlign: "right" }}>% Ocupação</th>
                  </tr>
                </thead>
                <tbody>
                  {(capacity?.itens || []).map((row) => (
                    <tr key={row.instrutor} style={tr}>
                      <td style={{ ...td, fontWeight: 700 }}>{row.instrutor}</td>
                      {(capacity?.meses || []).map((m) => <td key={m} style={{ ...td, textAlign: "right" }}>{fmt(row.meses[m] || 0)}</td>)}
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmt(row.total_90d)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(row.capacidade_90d)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmtPct(row.ocupacao_pct)}</td>
                    </tr>
                  ))}
                  {(!capacity?.itens || capacity.itens.length === 0) && (
                    <tr><td style={td} colSpan={99}>Nenhuma turma ou cronograma encontrado para o período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
 
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20, marginTop: 20, alignItems: "start" }}>
            <div style={card}>
              <div style={cardTitle}>Ranking de instrutores — CH realizada (90 dias)</div>
              <table style={table}>
                <thead>
                  <tr style={theadRow}>
                    <th style={th}>#</th><th style={th}>Instrutor</th>
                    <th style={{ ...th, textAlign: "right" }}>CH Realizada (h)</th>
                    <th style={{ ...th, textAlign: "right" }}>% da capacidade</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingComMedalha.map((r) => (
                    <tr key={r.instrutor} style={tr}>
                      <td style={td}>{r.medalha}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{r.instrutor}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(r.horas_realizadas)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmtPct(r.pct_capacidade)}</td>
                    </tr>
                  ))}
                  {rankingComMedalha.length === 0 && <tr><td style={td} colSpan={4}>Sem CH realizada no período.</td></tr>}
                </tbody>
              </table>
            </div>
 
            <div style={card}>
              <div style={cardTitle}>Alertas de ocupação (mês atual)</div>
              {(alertas?.itens || []).length === 0 ? (
                <p style={{ color: "#64748b", fontSize: 13 }}>Nenhum instrutor fora da faixa saudável (40%–100%) neste momento.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {alertas.itens.map((a) => (
                    <div key={a.instrutor} style={alertRow}>
                      <span>{a.status_emoji} <strong>{a.instrutor}</strong></span>
                      <span>{fmtPct(a.ocupacao_pct)} — {STATUS_LABEL[a.status] || a.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
 
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20, alignItems: "start" }}>
            <div style={card}>
              <div style={cardTitle}>Distribuição por operação (todos os clientes)</div>
              <table style={table}>
                <thead>
                  <tr style={theadRow}><th style={th}>Operação</th><th style={{ ...th, textAlign: "right" }}>Horas</th><th style={{ ...th, textAlign: "right" }}>% do total</th></tr>
                </thead>
                <tbody>
                  {(distribuicao?.itens || []).map((c) => (
                    <tr key={c.operacao} style={tr}>
                      <td style={td}>{c.operacao}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(c.horas)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmtPct(c.pct_sobre_total)}</td>
                    </tr>
                  ))}
                  {(!distribuicao?.itens || distribuicao.itens.length === 0) && <tr><td style={td} colSpan={3}>Sem turmas registradas ainda.</td></tr>}
                </tbody>
              </table>
            </div>
 
            <div style={card}>
              <div style={cardTitle}>Aderência por tema {operacaoFiltro ? `— ${operacaoFiltro}` : "(todas as operações)"}</div>
              <table style={table}>
                <thead>
                  <tr style={theadRow}>
                    <th style={th}>Tema</th><th style={{ ...th, textAlign: "right" }}>Turmas</th>
                    <th style={{ ...th, textAlign: "right" }}>Programado</th><th style={{ ...th, textAlign: "right" }}>Realizado</th>
                    <th style={{ ...th, textAlign: "right" }}>Aderência</th>
                  </tr>
                </thead>
                <tbody>
                  {temas.slice(0, 12).map((t) => (
                    <tr key={t.tema} style={tr}>
                      <td style={td}>{t.tema}</td>
                      <td style={{ ...td, textAlign: "right" }}>{t.qtd_turmas}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(t.hc_programado)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmt(t.hc_realizado)}</td>
                      <td style={{ ...td, textAlign: "right" }}>{fmtPct(t.aderencia_pct)}</td>
                    </tr>
                  ))}
                  {temas.length === 0 && <tr><td style={td} colSpan={5}>Sem turmas registradas ainda.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </PortalShell>
  );
}
 
/* ─── estilos ─────────────────────────────────── */
const card = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, boxShadow: "0 8px 18px rgba(15,23,42,.04)" };
const cardTitle = { fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 14 };
const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const theadRow = { textAlign: "left", color: "#64748b", fontSize: 11, textTransform: "uppercase" };
const th = { padding: "8px 10px" };
const tr = { borderBottom: "1px solid #eef2f7" };
const td = { padding: "8px 10px", color: "#334155" };
const errBox = { background: colors.dangerLight, color: colors.dangerText, padding: "10px 14px", borderRadius: 10, marginBottom: 16, fontSize: 13 };
const alertRow = { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 10px", background: "#f8fafc", borderRadius: 10 };
const selectFiltro = { height: 38, borderRadius: 10, border: "1px solid rgba(255,255,255,.4)", padding: "0 10px", fontSize: 13, background: "rgba(255,255,255,.12)", color: "#fff" };
