"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
import { apiFetch, apiDownload } from "../../services/api";
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

const MESES_OPCOES = [3, 6, 12];

export default function CapacidadePage() {
  const [operacoes, setOperacoes] = useState([]);
  const [operacaoFiltro, setOperacaoFiltro] = useState("");
  const [mesesFiltro, setMesesFiltro] = useState(3);
  const [painel, setPainel] = useState(null);
  const [capacity, setCapacity] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [distribuicao, setDistribuicao] = useState(null);
  const [temas, setTemas] = useState([]);
  const [alertas, setAlertas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  // ── Configuração (regra automática + overrides manuais) ──
  const [configAberta,   setConfigAberta]   = useState(false);
  const [instrutores,    setInstrutores]    = useState([]);
  const [regra,          setRegra]          = useState(null);
  const [regraForm,      setRegraForm]      = useState({ horas_dia_padrao: "", hc_dia_padrao: "", considerar_domingo: false });
  const [regraSalvando,  setRegraSalvando]  = useState(false);
  const [regraMsg,       setRegraMsg]       = useState({ tipo: "", texto: "" });

  const [overrides,      setOverrides]      = useState([]);
  const anoAtual = new Date().getFullYear();
  const [overrideForm,   setOverrideForm]   = useState({
    instrutor: "", ano: String(anoAtual), mes: "", horas_capacidade: "", hc_capacidade: "", observacoes: "",
  });
  const [overrideSalvando, setOverrideSalvando] = useState(false);
  const [overrideMsg,      setOverrideMsg]      = useState({ tipo: "", texto: "" });

  // ── Aba "Scorecard por instrutor" (CH + frequência + avaliação + NPS) ──
  const [aba, setAba] = useState("time"); // "time" | "instrutor"
  const [scInstrutoresOpcoes, setScInstrutoresOpcoes] = useState([]);
  const [scPeriodoTipo, setScPeriodoTipo] = useState("mensal"); // "mensal" | "trimestral"
  const hoje = new Date();
  const [scAno,       setScAno]       = useState(String(hoje.getFullYear()));
  const [scMes,       setScMes]       = useState(String(hoje.getMonth() + 1));
  const [scTrimestre, setScTrimestre] = useState(String(Math.floor(hoje.getMonth() / 3) + 1));
  const [scInstrutor, setScInstrutor] = useState("");
  const [scDados,     setScDados]     = useState(null);
  const [scLoading,   setScLoading]   = useState(false);
  const [scErro,      setScErro]      = useState("");
  const [scExportando, setScExportando] = useState(false);

  useEffect(() => { apiFetch("/capacidade/operacoes").then((r) => setOperacoes(r?.operacoes || [])).catch(() => {}); }, []);
  useEffect(() => { carregar(); }, [operacaoFiltro, mesesFiltro]);
  useEffect(() => { if (configAberta) carregarConfig(); }, [configAberta]);

  // Lazy: só busca a lista de instrutores e o scorecard quando a aba é aberta
  // pela primeira vez — não tem sentido carregar isso pra quem só usa a
  // visão do time.
  useEffect(() => {
    if (aba !== "instrutor") return;
    if (!scInstrutoresOpcoes.length) {
      apiFetch("/capacidade/instrutores").then((r) => setScInstrutoresOpcoes(r?.instrutores || [])).catch(() => {});
    }
    carregarScorecard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, scPeriodoTipo, scAno, scMes, scTrimestre, scInstrutor]);

  function scQueryString() {
    const params = new URLSearchParams();
    params.set("periodo", scPeriodoTipo);
    params.set("ano", scAno);
    if (scPeriodoTipo === "trimestral") params.set("trimestre", scTrimestre);
    else params.set("mes", scMes);
    if (scInstrutor) params.set("instrutor", scInstrutor);
    return params.toString();
  }

  async function carregarScorecard() {
    try {
      setScLoading(true); setScErro("");
      const r = await apiFetch(`/desempenho-instrutor?${scQueryString()}`);
      setScDados(r);
    } catch (e) {
      setScErro(e.message || "Erro ao carregar desempenho por instrutor.");
    } finally { setScLoading(false); }
  }

  async function exportarScorecard() {
    try {
      setScExportando(true);
      await apiDownload(`/desempenho-instrutor/exportar?${scQueryString()}`, "desempenho-instrutor.xlsx");
    } catch (e) {
      setScErro(e.message || "Erro ao exportar.");
    } finally { setScExportando(false); }
  }

  async function carregar() {
    try {
      setLoading(true); setErro("");
      const params = new URLSearchParams();
      if (operacaoFiltro) params.set("cliente", operacaoFiltro);
      if (mesesFiltro) params.set("meses", mesesFiltro);
      const qs = params.toString() ? `?${params.toString()}` : "";

      const qsDist = mesesFiltro ? `?meses=${mesesFiltro}` : "";
      const qsTema = operacaoFiltro ? `?cliente=${encodeURIComponent(operacaoFiltro)}` : "";

      const [p, c, r, t, a] = await Promise.all([
        apiFetch(`/capacidade/painel${qs}`),
        apiFetch(`/capacidade/capacity-consumido${qs}`),
        apiFetch(`/capacidade/ranking${qs}`),
        apiFetch(`/capacidade/aderencia-por-tema${qsTema}`),
        apiFetch("/capacidade/alertas"),
      ]);
      // distribuição por operação não recebe o filtro de operação (é o gráfico que mostra todas)
      const d = await apiFetch(`/capacidade/distribuicao-por-operacao${qsDist}`);
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

  async function carregarConfig() {
    try {
      const [instrData, regraData, overridesData] = await Promise.all([
        apiFetch("/capacidade/instrutores").catch(() => ({ instrutores: [] })),
        apiFetch("/capacidade/regra").catch(() => null),
        apiFetch("/capacidade/overrides").catch(() => ({ itens: [] })),
      ]);
      setInstrutores(instrData?.instrutores || []);
      if (regraData?.regra) {
        setRegra(regraData.regra);
        setRegraForm({
          horas_dia_padrao: String(regraData.regra.horas_dia_padrao ?? ""),
          hc_dia_padrao: String(regraData.regra.hc_dia_padrao ?? ""),
          considerar_domingo: !!regraData.regra.considerar_domingo,
        });
      }
      setOverrides(overridesData?.itens || []);
    } catch (_) { /* painel de config é auxiliar — falha aqui não deve travar a tela principal */ }
  }

  async function salvarRegra() {
    try {
      setRegraSalvando(true); setRegraMsg({ tipo: "", texto: "" });
      if (regraForm.horas_dia_padrao === "" || regraForm.hc_dia_padrao === "") {
        setRegraMsg({ tipo: "erro", texto: "Informe horas/dia e HC/dia." });
        return;
      }
      await apiFetch("/capacidade/regra", {
        method: "PUT",
        body: JSON.stringify({
          horas_dia_padrao: Number(regraForm.horas_dia_padrao),
          hc_dia_padrao: Number(regraForm.hc_dia_padrao),
          considerar_domingo: regraForm.considerar_domingo,
        }),
      });
      setRegraMsg({ tipo: "ok", texto: "Regra padrão atualizada." });
      await carregarConfig();
      await carregar();
    } catch (e) {
      setRegraMsg({ tipo: "erro", texto: e.message || "Erro ao salvar regra." });
    } finally { setRegraSalvando(false); }
  }

  async function salvarOverride() {
    try {
      setOverrideSalvando(true); setOverrideMsg({ tipo: "", texto: "" });
      const { instrutor, ano, mes, horas_capacidade, hc_capacidade, observacoes } = overrideForm;
      if (!instrutor || !ano || !mes) {
        setOverrideMsg({ tipo: "erro", texto: "Selecione instrutor, ano e mês." });
        return;
      }
      await apiFetch("/capacidade/overrides", {
        method: "POST",
        body: JSON.stringify({
          instrutor, ano: Number(ano), mes: Number(mes),
          horas_capacidade: Number(horas_capacidade || 0),
          hc_capacidade: Number(hc_capacidade || 0),
          observacoes: observacoes || null,
        }),
      });
      setOverrideMsg({ tipo: "ok", texto: "Capacidade do instrutor salva." });
      setOverrideForm({ instrutor: "", ano: String(anoAtual), mes: "", horas_capacidade: "", hc_capacidade: "", observacoes: "" });
      await carregarConfig();
      await carregar();
    } catch (e) {
      setOverrideMsg({ tipo: "erro", texto: e.message || "Erro ao salvar override." });
    } finally { setOverrideSalvando(false); }
  }

  async function excluirOverride(id) {
    if (!window.confirm("Remover este ajuste manual? O instrutor volta a usar a regra automática nesse mês.")) return;
    try {
      await apiFetch(`/capacidade/overrides/${id}`, { method: "DELETE" });
      await carregarConfig();
      await carregar();
    } catch (e) { setOverrideMsg({ tipo: "erro", texto: e.message || "Erro ao remover." }); }
  }

  const ind = painel?.indicadores || {};
  const janela = mesesFiltro === 3 ? "90 dias" : `${mesesFiltro} meses`;

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
            <div style={{ display: "flex", gap: 8 }}>
              <select value={mesesFiltro} onChange={(e) => setMesesFiltro(Number(e.target.value))} style={selectFiltro}>
                {MESES_OPCOES.map((m) => <option key={m} value={m}>Últimos {m} meses</option>)}
              </select>
              <select value={operacaoFiltro} onChange={(e) => setOperacaoFiltro(e.target.value)} style={selectFiltro}>
                <option value="">Todas as operações</option>
                {operacoes.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
            </div>
          }
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button style={aba === "time" ? abaBtnAtiva : abaBtn} onClick={() => setAba("time")}>Visão do time</button>
        <button style={aba === "instrutor" ? abaBtnAtiva : abaBtn} onClick={() => setAba("instrutor")}>Scorecard por instrutor</button>
      </div>

      {aba === "time" && (
      <>
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
            <div style={cardTitle}>Capacity x consumido — por instrutor ({janela})</div>
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr style={theadRow}>
                    <th style={th}>Instrutor</th>
                    {(capacity?.meses || []).map((m) => <th key={m} style={{ ...th, textAlign: "right" }}>{m}</th>)}
                    <th style={{ ...th, textAlign: "right" }}>Total {mesesFiltro}m</th>
                    <th style={{ ...th, textAlign: "right" }}>Cap. {mesesFiltro}m</th>
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
              <div style={cardTitle}>Ranking de instrutores — CH realizada ({janela})</div>
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

          {/* ── Configuração: regra automática + overrides manuais ── */}
          <div style={{ marginTop: 20 }}>
            <button style={btnConfig} onClick={() => setConfigAberta((v) => !v)}>
              {configAberta ? "▲ Fechar configuração de capacidade" : "⚙ Configurar regra automática e exceções por instrutor"}
            </button>

            {configAberta && (
              <div style={{ ...card, marginTop: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 24 }}>

                  {/* Regra padrão */}
                  <div>
                    <div style={cardTitle}>Regra automática padrão</div>
                    <p style={{ fontSize: 12, color: "#64748b", marginTop: -8, marginBottom: 12 }}>
                      Usada para calcular a capacidade de todo instrutor que não tem um ajuste manual no mês.
                    </p>
                    {regraMsg.texto && (
                      <div style={regraMsg.tipo === "erro" ? msgErro : msgOk}>{regraMsg.texto}</div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <CField label="Horas por dia">
                        <input type="number" step="0.5" value={regraForm.horas_dia_padrao}
                          onChange={(e) => setRegraForm((p) => ({ ...p, horas_dia_padrao: e.target.value }))}
                          style={cInput} />
                      </CField>
                      <CField label="HC (turmas) por dia">
                        <input type="number" step="1" value={regraForm.hc_dia_padrao}
                          onChange={(e) => setRegraForm((p) => ({ ...p, hc_dia_padrao: e.target.value }))}
                          style={cInput} />
                      </CField>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155" }}>
                        <input type="checkbox" checked={regraForm.considerar_domingo}
                          onChange={(e) => setRegraForm((p) => ({ ...p, considerar_domingo: e.target.checked }))} />
                        Considerar domingo como dia útil
                      </label>
                      <button style={btnCoral} onClick={salvarRegra} disabled={regraSalvando}>
                        {regraSalvando ? "Salvando…" : "Salvar regra padrão"}
                      </button>
                      {regra?.atualizado_em && (
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>
                          Última atualização: {new Date(regra.atualizado_em).toLocaleString("pt-BR")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Overrides manuais */}
                  <div>
                    <div style={cardTitle}>Ajuste manual por instrutor/mês</div>
                    <p style={{ fontSize: 12, color: "#64748b", marginTop: -8, marginBottom: 12 }}>
                      Use quando um instrutor específico tem capacidade diferente da regra padrão num mês (ex: carga reduzida, licença parcial).
                    </p>
                    {overrideMsg.texto && (
                      <div style={overrideMsg.tipo === "erro" ? msgErro : msgOk}>{overrideMsg.texto}</div>
                    )}
                    <div style={overrideFormGrid}>
                      <CField label="Instrutor" full>
                        <select value={overrideForm.instrutor}
                          onChange={(e) => setOverrideForm((p) => ({ ...p, instrutor: e.target.value }))} style={cInput}>
                          <option value="">Selecione…</option>
                          {instrutores.map((i) => <option key={i} value={i}>{i}</option>)}
                        </select>
                      </CField>
                      <CField label="Ano">
                        <input type="number" value={overrideForm.ano}
                          onChange={(e) => setOverrideForm((p) => ({ ...p, ano: e.target.value }))} style={cInput} />
                      </CField>
                      <CField label="Mês">
                        <select value={overrideForm.mes}
                          onChange={(e) => setOverrideForm((p) => ({ ...p, mes: e.target.value }))} style={cInput}>
                          <option value="">—</option>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </CField>
                      <CField label="Capacidade (h)">
                        <input type="number" value={overrideForm.horas_capacidade}
                          onChange={(e) => setOverrideForm((p) => ({ ...p, horas_capacidade: e.target.value }))} style={cInput} />
                      </CField>
                      <CField label="Capacidade (HC)">
                        <input type="number" value={overrideForm.hc_capacidade}
                          onChange={(e) => setOverrideForm((p) => ({ ...p, hc_capacidade: e.target.value }))} style={cInput} />
                      </CField>
                      <CField label="Observações" full>
                        <input value={overrideForm.observacoes}
                          onChange={(e) => setOverrideForm((p) => ({ ...p, observacoes: e.target.value }))}
                          placeholder="Opcional" style={cInput} />
                      </CField>
                    </div>
                    <button style={{ ...btnCoral, marginTop: 10 }} onClick={salvarOverride} disabled={overrideSalvando}>
                      {overrideSalvando ? "Salvando…" : "Salvar ajuste"}
                    </button>

                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 8 }}>
                        Ajustes cadastrados ({overrides.length})
                      </div>
                      {overrides.length === 0 && <p style={{ fontSize: 13, color: "#94a3b8" }}>Nenhum ajuste manual cadastrado.</p>}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {overrides.map((o) => (
                          <div key={o.id} style={overrideItem}>
                            <div>
                              <strong>{o.instrutor}</strong> — {String(o.mes).padStart(2, "0")}/{o.ano}
                              <span style={{ color: "#64748b" }}> · {fmt(o.horas_capacidade)}h / {fmt(o.hc_capacidade)} HC</span>
                              {o.observacoes && <div style={{ fontSize: 12, color: "#94a3b8" }}>{o.observacoes}</div>}
                            </div>
                            <button style={btnExcluirOverride} onClick={() => excluirOverride(o.id)}>remover</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
      </>
      )}

      {aba === "instrutor" && (
        <ScorecardInstrutor
          periodoTipo={scPeriodoTipo} setPeriodoTipo={setScPeriodoTipo}
          ano={scAno} setAno={setScAno}
          mes={scMes} setMes={setScMes}
          trimestre={scTrimestre} setTrimestre={setScTrimestre}
          instrutor={scInstrutor} setInstrutor={setScInstrutor}
          opcoesInstrutor={scInstrutoresOpcoes}
          dados={scDados} loading={scLoading} erro={scErro}
          exportando={scExportando} onExportar={exportarScorecard}
        />
      )}
    </PortalShell>
  );
}

function ScorecardInstrutor({
  periodoTipo, setPeriodoTipo, ano, setAno, mes, setMes, trimestre, setTrimestre,
  instrutor, setInstrutor, opcoesInstrutor, dados, loading, erro, exportando, onExportar,
}) {
  const itens = dados?.itens || [];
  const medias = dados?.medias_time;
  const vendoTodos = !instrutor;
  const item = !vendoTodos ? itens.find((i) => i.instrutor === instrutor) : null;

  return (
    <>
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <CField label="Período">
              <select value={periodoTipo} onChange={(e) => setPeriodoTipo(e.target.value)} style={cInput}>
                <option value="mensal">Mensal</option>
                <option value="trimestral">Trimestral</option>
              </select>
            </CField>
            <CField label="Ano">
              <input type="number" value={ano} onChange={(e) => setAno(e.target.value)} style={{ ...cInput, width: 90 }} />
            </CField>
            {periodoTipo === "mensal" ? (
              <CField label="Mês">
                <select value={mes} onChange={(e) => setMes(e.target.value)} style={cInput}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
                </select>
              </CField>
            ) : (
              <CField label="Trimestre">
                <select value={trimestre} onChange={(e) => setTrimestre(e.target.value)} style={cInput}>
                  {[1, 2, 3, 4].map((t) => <option key={t} value={t}>{t}º (T{t})</option>)}
                </select>
              </CField>
            )}
            <CField label="Instrutor">
              <select value={instrutor} onChange={(e) => setInstrutor(e.target.value)} style={cInput}>
                <option value="">Todos (ranking)</option>
                {opcoesInstrutor.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </CField>
          </div>
          <button style={btnCoral} onClick={onExportar} disabled={exportando || loading || !dados}>
            {exportando ? "Exportando…" : "⭳ Exportar"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 10, marginBottom: 0 }}>
          Índice geral pondera frequência (peso maior) e NPS — a nota de avaliação aparece à parte, com a cobertura de lançamento, porque não tem uma escala fixa hoje (a "nota máx." de cada prova é livre).
        </p>
      </div>

      {erro && <div style={errBox}>{erro}</div>}
      {loading ? (
        <p style={{ color: "#64748b" }}>Carregando desempenho…</p>
      ) : !dados ? null : vendoTodos ? (
        <>
          {medias && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
              <StatCard title="Índice geral (média do time)" value={medias.indice_geral ?? "—"} accent={colors.accent} />
              <StatCard title="Frequência média do time" value={fmtPct(medias.frequencia_pct)} accent={colors.primary} />
              <StatCard title="NPS médio do time" value={medias.nps_score ?? "—"} accent={colors.info} />
              <StatCard title="Ocupação média do time" value={fmtPct(medias.ocupacao_pct)} accent={colors.navy} />
            </div>
          )}
          <div style={card}>
            <div style={cardTitle}>Ranking — índice geral por instrutor</div>
            <div style={{ overflowX: "auto" }}>
              <table style={table}>
                <thead>
                  <tr style={theadRow}>
                    <th style={th}>#</th><th style={th}>Instrutor</th>
                    <th style={{ ...th, textAlign: "right" }}>Índice geral</th>
                    <th style={{ ...th, textAlign: "right" }}>Frequência</th>
                    <th style={{ ...th, textAlign: "right" }}>NPS</th>
                    <th style={{ ...th, textAlign: "right" }}>Avaliação (cobertura)</th>
                    <th style={{ ...th, textAlign: "right" }}>Ocupação CH</th>
                  </tr>
                </thead>
                <tbody>
                  {itens
                    .slice()
                    .sort((a, b) => (b.indice_geral ?? -Infinity) - (a.indice_geral ?? -Infinity))
                    .map((i) => (
                      <tr key={i.instrutor} style={tr}>
                        <td style={td}>{i.posicao_no_time ?? "—"}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{i.instrutor}</td>
                        <td style={{ ...td, textAlign: "right" }}>{i.indice_geral ?? "—"}</td>
                        <td style={{ ...td, textAlign: "right" }}>{fmtPct(i.frequencia.media_pct)}</td>
                        <td style={{ ...td, textAlign: "right" }}>{i.nps.nps_score ?? "—"}</td>
                        <td style={{ ...td, textAlign: "right" }}>
                          {i.avaliacao.nota_prova_media != null ? fmt(i.avaliacao.nota_prova_media) : "—"}
                          {" "}
                          <span style={{ color: "#94a3b8" }}>({i.avaliacao.turmas_com_avaliacao}/{i.avaliacao.turmas_no_periodo})</span>
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>{fmtPct(i.ch.ocupacao_pct)}</td>
                      </tr>
                    ))}
                  {itens.length === 0 && <tr><td style={td} colSpan={7}>Nenhum instrutor com atividade nesse período.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : !item ? (
        <p style={{ color: "#64748b" }}>Sem dados para esse instrutor no período selecionado.</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
            <StatCard
              title="Índice geral"
              value={item.indice_geral ?? "—"}
              accent={colors.accent}
            />
            <StatCard title="Posição no time" value={item.posicao_no_time ? `${item.posicao_no_time}º de ${item.total_no_ranking}` : "—"} accent={colors.navy} />
            <StatCard title="Frequência das turmas" value={fmtPct(item.frequencia.media_pct)} accent={colors.primary} />
            <StatCard title="Ocupação (CH)" value={fmtPct(item.ch.ocupacao_pct)} accent={colors.info} />
            <StatCard title="NPS score" value={item.nps.nps_score ?? "—"} accent={colors.success} />
          </div>

          {medias && (
            <p style={{ fontSize: 12, color: "#64748b", marginTop: -8, marginBottom: 16 }}>
              Média do time no período: índice geral {medias.indice_geral ?? "—"}, frequência {fmtPct(medias.frequencia_pct)}, NPS {medias.nps_score ?? "—"}, ocupação {fmtPct(medias.ocupacao_pct)}.
            </p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={card}>
              <div style={cardTitle}>Avaliação de turma</div>
              {item.avaliacao.turmas_no_periodo === 0 ? (
                <p style={{ fontSize: 13, color: "#94a3b8" }}>Nenhuma turma no período.</p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: "#334155", margin: "4px 0" }}>
                    Nota de prova (média): <strong>{item.avaliacao.nota_prova_media != null ? fmt(item.avaliacao.nota_prova_media) : "—"}</strong>
                  </p>
                  <p style={{ fontSize: 13, color: "#334155", margin: "4px 0" }}>
                    Nota de qualidade (média): <strong>{item.avaliacao.nota_qualidade_media != null ? fmt(item.avaliacao.nota_qualidade_media) : "—"}</strong>
                  </p>
                  <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                    Cobertura: {item.avaliacao.turmas_com_avaliacao} de {item.avaliacao.turmas_no_periodo} turmas com avaliação lançada ({fmtPct(item.avaliacao.cobertura_pct)}) — lançamento não é obrigatório, então cobertura baixa não é necessariamente desempenho ruim.
                  </p>
                </>
              )}
            </div>
            <div style={card}>
              <div style={cardTitle}>NPS</div>
              {item.nps.total_respostas === 0 ? (
                <p style={{ fontSize: 13, color: "#94a3b8" }}>Nenhuma resposta de NPS no período.</p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: "#334155", margin: "4px 0" }}>
                    Nota média: <strong>{fmt(item.nps.nota_media)}</strong> · {item.nps.total_respostas} resposta(s)
                  </p>
                  <p style={{ fontSize: 13, color: "#334155", margin: "4px 0" }}>
                    Promotores {item.nps.promotores} · Neutros {item.nps.neutros} · Detratores {item.nps.detratores}
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function CField({ label, children, full = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: full ? "1 / -1" : "auto" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{label}</span>
      {children}
    </div>
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

const btnConfig = { width: "100%", background: "#f8fafc", border: "1px dashed #e2e8f0", borderRadius: 12, padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#334155", textAlign: "left" };
const cInput = { height: 36, borderRadius: 9, border: "1px solid #e2e8f0", padding: "0 10px", fontSize: 13, color: "#334155", outline: "none", width: "100%", boxSizing: "border-box" };
const overrideFormGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 };
const btnCoral = { background: colors.accent, color: "#fff", border: 0, borderRadius: 10, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 };
const msgErro = { background: colors.dangerLight, color: colors.dangerText, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 600, marginBottom: 10 };
const msgOk = { background: colors.successLight, color: colors.successText, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontWeight: 600, marginBottom: 10 };
const overrideItem = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, background: "#f8fafc", border: "1px solid #e9eef4", borderRadius: 10, padding: "8px 12px", fontSize: 13 };
const btnExcluirOverride = { background: "none", border: "none", color: colors.dangerText, cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" };
const abaBtn = { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 10, padding: "9px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13 };
const abaBtnAtiva = { ...abaBtn, background: colors.accent, color: "#fff", border: `1px solid ${colors.accent}` };
