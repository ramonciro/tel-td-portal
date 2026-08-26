"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import KpiStrip from "../../components/KpiStrip";
import ProgressStat from "../../components/ProgressStat";
import { BarraHorizontal, GraficoLinha } from "../../components/Charts";
import { apiFetch } from "../../services/api";
import { colors, radius, chart } from "../../lib/theme";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function fmt1(n) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(n || 0));
}

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function corOcupacao(pct) {
  const v = Number(pct);
  if (!Number.isFinite(v)) return colors.neutral;
  if (v >= 95) return colors.danger;
  if (v >= 75) return colors.success;
  if (v >= 40) return colors.warning;
  return colors.info;
}

export default function CapacidadePage() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [instrutorFiltro, setInstrutorFiltro] = useState("");

  const [itens, setItens] = useState([]);
  const [totais, setTotais] = useState({ horas_realizadas: 0, capacidade_horas: 0, ocupacao_pct: null });
  const [instrutores, setInstrutores] = useState([]);
  const [regra, setRegra] = useState({ horas_dia_padrao: 6, hc_dia_padrao: 30, considerar_domingo: 0 });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  // histórico (últimos 6 meses) para o gráfico de evolução
  const [historico, setHistorico] = useState([]);
  const [historicoLoading, setHistoricoLoading] = useState(true);

  // painel de configuração da regra automática
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [formRegra, setFormRegra] = useState({ horas_dia_padrao: 6, hc_dia_padrao: 30, considerar_domingo: false });
  const [salvandoRegra, setSalvandoRegra] = useState(false);

  // painel de override manual
  const [mostrarOverride, setMostrarOverride] = useState(false);
  const [formOverride, setFormOverride] = useState({ instrutor: "", ano: hoje.getFullYear(), mes: hoje.getMonth() + 1, horas_capacidade: "", hc_capacidade: "", observacoes: "" });
  const [salvandoOverride, setSalvandoOverride] = useState(false);
  const [overrides, setOverrides] = useState([]);

  async function carregar() {
    try {
      setErro("");
      setLoading(true);
      const params = new URLSearchParams({ ano: String(ano), mes: String(mes) });
      if (instrutorFiltro) params.set("instrutor", instrutorFiltro);
      const [capData, regraData, overridesData] = await Promise.all([
        apiFetch(`/capacidade?${params.toString()}`),
        apiFetch("/capacidade/regra"),
        apiFetch(`/capacidade/overrides?ano=${ano}`),
      ]);
      setItens(Array.isArray(capData?.itens) ? capData.itens : []);
      setTotais(capData?.totais || { horas_realizadas: 0, capacidade_horas: 0, ocupacao_pct: null });
      if (regraData?.regra) {
        setRegra(regraData.regra);
        setFormRegra({
          horas_dia_padrao: Number(regraData.regra.horas_dia_padrao),
          hc_dia_padrao: Number(regraData.regra.hc_dia_padrao),
          considerar_domingo: !!Number(regraData.regra.considerar_domingo),
        });
      }
      setOverrides(Array.isArray(overridesData?.itens) ? overridesData.itens : []);
    } catch (error) {
      setErro(error.message || "Erro ao carregar capacidade.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarInstrutores() {
    try {
      const data = await apiFetch("/capacidade/instrutores");
      setInstrutores(Array.isArray(data?.instrutores) ? data.instrutores : []);
    } catch {
      // opcional — filtros seguem funcionando sem a lista
    }
  }

  async function carregarHistorico() {
    try {
      setHistoricoLoading(true);
      // últimos 6 meses (incluindo o filtrado) — uma chamada por mês,
      // reaproveitando o mesmo endpoint sem instrutor pra ter o total geral
      const meses = [];
      let refAno = ano;
      let refMes = mes;
      for (let i = 5; i >= 0; i--) {
        let a = refAno, m = refMes - i;
        while (m <= 0) { m += 12; a -= 1; }
        meses.push({ ano: a, mes: m });
      }
      const respostas = await Promise.all(
        meses.map((item) => apiFetch(`/capacidade?ano=${item.ano}&mes=${item.mes}${instrutorFiltro ? `&instrutor=${encodeURIComponent(instrutorFiltro)}` : ""}`).catch(() => null))
      );
      const serie = meses.map((item, idx) => {
        const totaisMes = respostas[idx]?.totais || { horas_realizadas: 0, capacidade_horas: 0 };
        return {
          mes: `${item.ano}-${String(item.mes).padStart(2, "0")}`,
          horas_realizadas: Number(totaisMes.horas_realizadas || 0),
          capacidade_horas: Number(totaisMes.capacidade_horas || 0),
        };
      });
      setHistorico(serie);
    } catch {
      setHistorico([]);
    } finally {
      setHistoricoLoading(false);
    }
  }

  useEffect(() => {
    carregarInstrutores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregar();
    carregarHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, mes, instrutorFiltro]);

  async function salvarRegra(e) {
    e.preventDefault();
    try {
      setSalvandoRegra(true);
      await apiFetch("/capacidade/regra", {
        method: "PUT",
        body: JSON.stringify({
          horas_dia_padrao: Number(formRegra.horas_dia_padrao),
          hc_dia_padrao: Number(formRegra.hc_dia_padrao),
          considerar_domingo: !!formRegra.considerar_domingo,
        }),
      });
      setMostrarConfig(false);
      await carregar();
    } catch (error) {
      alert(error.message || "Erro ao salvar regra padrão.");
    } finally {
      setSalvandoRegra(false);
    }
  }

  async function salvarOverride(e) {
    e.preventDefault();
    if (!formOverride.instrutor) {
      alert("Selecione ou informe o instrutor.");
      return;
    }
    try {
      setSalvandoOverride(true);
      await apiFetch("/capacidade/overrides", {
        method: "POST",
        body: JSON.stringify({
          instrutor: formOverride.instrutor,
          ano: Number(formOverride.ano),
          mes: Number(formOverride.mes),
          horas_capacidade: Number(formOverride.horas_capacidade || 0),
          hc_capacidade: Number(formOverride.hc_capacidade || 0),
          observacoes: formOverride.observacoes || null,
        }),
      });
      setMostrarOverride(false);
      setFormOverride({ instrutor: "", ano, mes, horas_capacidade: "", hc_capacidade: "", observacoes: "" });
      await carregar();
    } catch (error) {
      alert(error.message || "Erro ao salvar capacidade manual.");
    } finally {
      setSalvandoOverride(false);
    }
  }

  async function removerOverride(id) {
    if (!window.confirm("Remover esta capacidade manual? O instrutor volta a usar a regra automática neste mês.")) return;
    try {
      await apiFetch(`/capacidade/overrides/${id}`, { method: "DELETE" });
      await carregar();
    } catch (error) {
      alert(error.message || "Erro ao remover.");
    }
  }

  const itensOrdenados = useMemo(
    () => [...itens].sort((a, b) => Number(b.horas_realizadas || 0) - Number(a.horas_realizadas || 0)),
    [itens]
  );

  const barrasRealizado = useMemo(
    () => itensOrdenados.map((item) => ({ instrutor: item.instrutor, horas: Number(item.horas_realizadas || 0) })),
    [itensOrdenados]
  );

  const ocupacaoGeral = totais.ocupacao_pct != null ? Number(totais.ocupacao_pct) : null;

  return (
    <PortalShell>
      <div style={{ display: "grid", gap: 18 }}>
        <PageHero
          eyebrow="Capacidade de treinamento"
          title="Capacidade x Realizado — visão do coordenador por instrutor e mês."
          subtitle="Compare quanto cada instrutor tem de capacidade disponível (automática ou ajustada manualmente) com o que foi efetivamente realizado no período."
          stats={[
            { label: "horas realizadas no mês", value: `${fmt1(totais.horas_realizadas)}h` },
            { label: "capacidade do mês", value: `${fmt1(totais.capacidade_horas)}h` },
            { label: "ocupação geral", value: ocupacaoGeral != null ? `${fmt1(ocupacaoGeral)}%` : "—" },
          ]}
          actions={
            <>
              <button type="button" style={buttonSecondary} onClick={() => setMostrarConfig((v) => !v)}>
                ⚙️ Regra automática
              </button>
              <button type="button" style={buttonPrimary} onClick={() => setMostrarOverride((v) => !v)}>
                + Ajustar capacidade manual
              </button>
            </>
          }
        />

        <SectionCard
          title="Filtros"
          subtitle="Escolha o mês e, se quiser, um instrutor específico para aprofundar a leitura."
        >
          <div style={filtersGrid}>
            <label style={fieldLabel}>
              Ano
              <input type="number" style={inputStyle} value={ano} onChange={(e) => setAno(Number(e.target.value) || hoje.getFullYear())} />
            </label>
            <label style={fieldLabel}>
              Mês
              <select style={inputStyle} value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                {MESES.map((label, idx) => (
                  <option key={label} value={idx + 1}>{label}</option>
                ))}
              </select>
            </label>
            <label style={fieldLabel}>
              Instrutor
              <select style={inputStyle} value={instrutorFiltro} onChange={(e) => setInstrutorFiltro(e.target.value)}>
                <option value="">Todos os instrutores</option>
                {instrutores.map((nome) => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </select>
            </label>
          </div>
        </SectionCard>

        {mostrarConfig ? (
          <SectionCard
            title="Regra automática padrão"
            subtitle="Usada sempre que não houver um ajuste manual cadastrado para o instrutor no mês. Dia útil = todo dia da semana, exceto domingo (a menos que marcado abaixo)."
          >
            <form onSubmit={salvarRegra} style={filtersGrid}>
              <label style={fieldLabel}>
                Horas por dia
                <input
                  type="number" step="0.5" style={inputStyle}
                  value={formRegra.horas_dia_padrao}
                  onChange={(e) => setFormRegra((prev) => ({ ...prev, horas_dia_padrao: e.target.value }))}
                />
              </label>
              <label style={fieldLabel}>
                HC por dia
                <input
                  type="number" style={inputStyle}
                  value={formRegra.hc_dia_padrao}
                  onChange={(e) => setFormRegra((prev) => ({ ...prev, hc_dia_padrao: e.target.value }))}
                />
              </label>
              <label style={{ ...fieldLabel, display: "flex", flexDirection: "row", alignItems: "center", gap: 8, marginTop: 22 }}>
                <input
                  type="checkbox"
                  checked={formRegra.considerar_domingo}
                  onChange={(e) => setFormRegra((prev) => ({ ...prev, considerar_domingo: e.target.checked }))}
                />
                Considerar domingo como dia útil
              </label>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <button type="submit" style={buttonPrimary} disabled={salvandoRegra}>
                  {salvandoRegra ? "Salvando..." : "Salvar regra"}
                </button>
              </div>
            </form>
            <p style={helperText}>
              Regra atual: {fmt1(regra.horas_dia_padrao)}h/dia e {fmt(regra.hc_dia_padrao)} HC/dia
              {Number(regra.considerar_domingo) ? " (domingo contando como dia útil)" : " (domingo não conta como dia útil)"}.
            </p>
          </SectionCard>
        ) : null}

        {mostrarOverride ? (
          <SectionCard
            title="Ajustar capacidade manual"
            subtitle="Use para casos específicos (férias, afastamento, pico de demanda). Este ajuste sempre tem prioridade sobre a regra automática para o instrutor e mês escolhidos."
          >
            <form onSubmit={salvarOverride} style={filtersGrid}>
              <label style={fieldLabel}>
                Instrutor
                <input
                  type="text" list="lista-instrutores" style={inputStyle}
                  value={formOverride.instrutor}
                  onChange={(e) => setFormOverride((prev) => ({ ...prev, instrutor: e.target.value }))}
                  placeholder="Nome do instrutor"
                />
                <datalist id="lista-instrutores">
                  {instrutores.map((nome) => <option key={nome} value={nome} />)}
                </datalist>
              </label>
              <label style={fieldLabel}>
                Ano
                <input
                  type="number" style={inputStyle}
                  value={formOverride.ano}
                  onChange={(e) => setFormOverride((prev) => ({ ...prev, ano: e.target.value }))}
                />
              </label>
              <label style={fieldLabel}>
                Mês
                <select style={inputStyle} value={formOverride.mes} onChange={(e) => setFormOverride((prev) => ({ ...prev, mes: e.target.value }))}>
                  {MESES.map((label, idx) => (
                    <option key={label} value={idx + 1}>{label}</option>
                  ))}
                </select>
              </label>
              <label style={fieldLabel}>
                Capacidade em horas
                <input
                  type="number" step="0.5" style={inputStyle}
                  value={formOverride.horas_capacidade}
                  onChange={(e) => setFormOverride((prev) => ({ ...prev, horas_capacidade: e.target.value }))}
                />
              </label>
              <label style={fieldLabel}>
                Capacidade em HC
                <input
                  type="number" style={inputStyle}
                  value={formOverride.hc_capacidade}
                  onChange={(e) => setFormOverride((prev) => ({ ...prev, hc_capacidade: e.target.value }))}
                />
              </label>
              <label style={{ ...fieldLabel, gridColumn: "span 2" }}>
                Observações (opcional)
                <input
                  type="text" style={inputStyle}
                  value={formOverride.observacoes}
                  onChange={(e) => setFormOverride((prev) => ({ ...prev, observacoes: e.target.value }))}
                  placeholder="Ex.: instrutor de férias na segunda quinzena"
                />
              </label>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <button type="submit" style={buttonPrimary} disabled={salvandoOverride}>
                  {salvandoOverride ? "Salvando..." : "Salvar ajuste"}
                </button>
              </div>
            </form>

            {overrides.length > 0 ? (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: colors.textSecondary, margin: "0 0 8px" }}>
                  Ajustes manuais cadastrados em {ano}
                </p>
                <div style={{ display: "grid", gap: 8 }}>
                  {overrides.map((ov) => (
                    <div key={ov.id} style={overrideRow}>
                      <span style={{ fontWeight: 700 }}>{ov.instrutor}</span>
                      <span>{MESES[ov.mes - 1]}/{ov.ano}</span>
                      <span>{fmt1(ov.horas_capacidade)}h · {fmt(ov.hc_capacidade)} HC</span>
                      {ov.observacoes ? <span style={{ color: colors.textMuted, fontSize: 12 }}>{ov.observacoes}</span> : <span />}
                      <button type="button" style={buttonDanger} onClick={() => removerOverride(ov.id)}>Remover</button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </SectionCard>
        ) : null}

        {loading ? (
          <div style={loadingBox}>Carregando capacidade...</div>
        ) : erro ? (
          <div style={errorBox}>{erro}</div>
        ) : (
          <>
            <KpiStrip
              items={[
                { icon: "⏱️", label: "Horas realizadas", value: `${fmt1(totais.horas_realizadas)}h`, bg: chart.cyan + "22", color: chart.cyan },
                { icon: "📦", label: "Capacidade total", value: `${fmt1(totais.capacidade_horas)}h`, bg: colors.primaryLight, color: colors.primary },
                { icon: "📈", label: "Ocupação geral", value: ocupacaoGeral != null ? `${fmt1(ocupacaoGeral)}%` : "—", bg: colors.successLight, color: colors.successText },
                { icon: "👥", label: "Instrutores no recorte", value: fmt(itens.length), bg: colors.warningLight, color: colors.warningText },
              ]}
            />

            <div style={twoColumns}>
              <SectionCard
                title="Capacidade x Realizado — Instrutor x Mês"
                subtitle={`${MESES[mes - 1]}/${ano} · barra de ocupação por instrutor (verde = saudável, laranja = atenção, vermelho = no limite)`}
              >
                {itensOrdenados.length ? (
                  <div style={{ display: "grid", gap: 14 }}>
                    {itensOrdenados.map((item) => (
                      <ProgressStat
                        key={`${item.instrutor}-${item.chave_mes}`}
                        label={`${item.instrutor}${item.origem_capacidade === "manual" ? " · ajuste manual" : ""}`}
                        value={`${fmt1(item.horas_realizadas)}h / ${fmt1(item.capacidade_horas)}h`}
                        percent={item.ocupacao_horas_pct}
                        color={corOcupacao(item.ocupacao_horas_pct)}
                        helper={
                          item.dias_previstos != null
                            ? `${fmt(item.dias_praticados)} de ${fmt(item.dias_previstos)} dia(s) praticados · saldo ${fmt1(item.saldo_horas)}h`
                            : `saldo ${fmt1(item.saldo_horas)}h${item.estimado ? " · turma sem cronograma detalhado (estimado)" : ""}`
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p style={emptyText}>Nenhum instrutor com dados para este recorte.</p>
                )}
              </SectionCard>

              <SectionCard
                title="Realizado por instrutor"
                subtitle="Ranking de horas realizadas no mês filtrado."
              >
                {barrasRealizado.length ? (
                  <BarraHorizontal dados={barrasRealizado} labelKey="instrutor" valueKey="horas" cor={chart.blue} sufixo="h" maxItens={10} />
                ) : (
                  <p style={emptyText}>Sem dados no período.</p>
                )}
              </SectionCard>
            </div>

            <SectionCard
              title="Evolução — últimos 6 meses"
              subtitle={`Horas realizadas x capacidade total${instrutorFiltro ? ` (filtrado por ${instrutorFiltro})` : " (todos os instrutores)"}`}
            >
              {historicoLoading ? (
                <p style={emptyText}>Carregando histórico...</p>
              ) : historico.length ? (
                <GraficoLinha
                  dados={historico}
                  eixoX="mes"
                  linhas={[
                    { key: "horas_realizadas", label: "Horas realizadas", cor: chart.blue },
                    { key: "capacidade_horas", label: "Capacidade", cor: chart.orange },
                  ]}
                />
              ) : (
                <p style={emptyText}>Sem histórico disponível.</p>
              )}
            </SectionCard>

            <SectionCard title="Detalhamento por instrutor" subtitle="Tabela completa do recorte atual, incluindo origem da capacidade.">
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={th}>Instrutor</th>
                      <th style={th}>Horas previstas</th>
                      <th style={th}>Horas realizadas</th>
                      <th style={th}>Dias praticados</th>
                      <th style={th}>Capacidade (h)</th>
                      <th style={th}>Capacidade (HC)</th>
                      <th style={th}>Origem</th>
                      <th style={th}>Ocupação</th>
                      <th style={th}>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensOrdenados.map((item) => (
                      <tr key={`${item.instrutor}-${item.chave_mes}-row`}>
                        <td style={td}>{item.instrutor}</td>
                        <td style={td}>{fmt1(item.horas_previstas)}h</td>
                        <td style={td}>{fmt1(item.horas_realizadas)}h</td>
                        <td style={td}>{item.dias_praticados != null ? `${fmt(item.dias_praticados)}/${fmt(item.dias_previstos)}` : "—"}</td>
                        <td style={td}>{fmt1(item.capacidade_horas)}h</td>
                        <td style={td}>{fmt(item.capacidade_hc)}</td>
                        <td style={td}>
                          <span style={badgeOrigem(item.origem_capacidade)}>
                            {item.origem_capacidade === "manual" ? "Manual" : "Automática"}
                          </span>
                        </td>
                        <td style={td}>
                          {item.ocupacao_horas_pct != null ? (
                            <span style={{ fontWeight: 800, color: corOcupacao(item.ocupacao_horas_pct) }}>{fmt1(item.ocupacao_horas_pct)}%</span>
                          ) : "—"}
                        </td>
                        <td style={td}>{fmt1(item.saldo_horas)}h</td>
                      </tr>
                    ))}
                    {!itensOrdenados.length ? (
                      <tr><td style={td} colSpan={9}>Nenhum registro no recorte atual.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </PortalShell>
  );
}

function badgeOrigem(origem) {
  const base = { display: "inline-block", padding: "3px 9px", borderRadius: radius.pill, fontSize: 11, fontWeight: 700 };
  if (origem === "manual") return { ...base, background: colors.warningLight, color: colors.warningText };
  return { ...base, background: colors.infoLight, color: "#0369a1" };
}

const loadingBox = { background: "#ffffff", border: `1px solid ${colors.border}`, borderRadius: 18, padding: 18, color: colors.textSecondary, fontWeight: 700 };
const errorBox = { background: colors.dangerLight, border: "1px solid #fecaca", color: colors.dangerText, borderRadius: 18, padding: 16, fontWeight: 700 };
const emptyText = { fontSize: 13, color: colors.textMuted, textAlign: "center", padding: "18px 0", margin: 0 };
const filtersGrid = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 };
const fieldLabel = { display: "grid", gap: 6, color: "#334155", fontSize: 13, fontWeight: 700 };
const inputStyle = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 12, padding: "10px 12px", background: "#fff", color: "#0f172a" };
const buttonSecondary = { border: `1px solid ${colors.border}`, background: "rgba(255,255,255,0.08)", color: "#fff", borderRadius: 12, padding: "10px 14px", fontWeight: 700, cursor: "pointer" };
const buttonPrimary = { border: "none", background: colors.accent, color: "#fff", borderRadius: 12, padding: "10px 14px", fontWeight: 700, cursor: "pointer" };
const buttonDanger = { border: "1px solid #fecaca", background: colors.dangerLight, color: colors.dangerText, borderRadius: 10, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontSize: 12 };
const twoColumns = { display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 16 };
const helperText = { marginTop: 10, fontSize: 12.5, color: colors.textMuted };
const overrideRow = { display: "grid", gridTemplateColumns: "1fr auto auto 1fr auto", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: colors.surfaceMuted, fontSize: 13 };
const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = { textAlign: "left", padding: "8px 10px", borderBottom: `2px solid ${colors.border}`, color: colors.textSecondary, fontWeight: 800, fontSize: 12, textTransform: "uppercase", letterSpacing: ".03em", whiteSpace: "nowrap" };
const td = { padding: "8px 10px", borderBottom: `1px solid ${colors.border}`, color: colors.textPrimary, whiteSpace: "nowrap" };
