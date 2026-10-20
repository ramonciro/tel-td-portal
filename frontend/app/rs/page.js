"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
import { ContadorAnimado, Donut, BarraHorizontal, GraficoLinha, Funil } from "../../components/Charts";
import {
  MES_ATUAL, mesLabel, getMesesDisponiveis, fmtNum, fmtTaxa, Variacao, SetorToggle, SiteSelect,
  LimiteDiasSelect, estiloSelect, estiloLabel, card, cardTitle, corTaxa, TabelaGrupo, CardPrazos, TabelaEmAndamento,
} from "../../components/RSRelatorios";
import { apiFetch } from "../../services/api";
import { colors } from "../../lib/theme";

// ─── Status (usado no Donut) ────────────────────────────────────────
const STATUS_CORES = {
  entregue:     colors.success,
  em_andamento: colors.primary,
  nao_entregue: colors.danger,
  cancelada:    colors.neutral,
};
const STATUS_LABELS = {
  entregue:     "Entregue",
  em_andamento: "Em Andamento",
  nao_entregue: "Não Entregue",
  cancelada:    "Cancelada",
};

// ─── Card de breakdown por setor ───────────────────────────────────
function SetorCard({ titulo, dados, cor }) {
  return (
    <div style={{
      background: "#fff", border: `1px solid #e2e8f0`,
      borderLeft: `4px solid ${cor}`, borderRadius: 14,
      padding: "18px 22px", flex: 1,
      boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
    }}>
      <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                  letterSpacing: ".06em", color: cor }}>{titulo}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {[
          { l: "RPs",       v: dados?.rps           },
          { l: "HC'S",      v: dados?.hcs           },
          { l: "Aprovados", v: dados?.hcs_aprovados },
          { l: "Entregue",  v: dados?.qtd_entregue  },
        ].map(({ l, v }) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: colors.textPrimary }}>{fmtNum(v)}</div>
            <div style={{ fontSize: 10, color: colors.textMuted, marginTop: 2,
                          textTransform: "uppercase", letterSpacing: ".04em" }}>{l}</div>
          </div>
        ))}
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 11, color: colors.textMuted, textAlign: "center" }}>
        Taxa de entrega{" "}
        <strong style={{ color: corTaxa(dados?.taxa_entrega) }}>{fmtTaxa(dados?.taxa_entrega)}</strong>
        {" "}· Pendentes <strong style={{ color: colors.textPrimary }}>{fmtNum(dados?.pendentes)}</strong>
      </p>
    </div>
  );
}

// ─── Página ────────────────────────────────────────────────────────
export default function RSDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [mes, setMes] = useState(MES_ATUAL());
  const [site, setSite] = useState("");
  const [setor, setSetor] = useState("");
  const [limite, setLimite] = useState(15);

  // Cascata de entrada: só liga depois que os KPIs terminam de carregar pela
  // primeira vez — mesmo padrão já aprovado em /inicio.
  const [revelado, setRevelado] = useState(false);
  useEffect(() => {
    if (loading) return;
    const id = requestAnimationFrame(() => setRevelado(true));
    return () => cancelAnimationFrame(id);
  }, [loading]);

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const p = new URLSearchParams({ mes, limite_dias: String(limite) });
      if (site) p.set("site", site);
      if (setor) p.set("setor", setor);
      setData(await apiFetch(`/rs/dashboard?${p}`));
    } catch (e) { setData(null); setErro(e.message || "Erro ao carregar o dashboard."); }
    finally { setLoading(false); }
  }, [mes, site, setor, limite]);

  useEffect(() => { carregar(); }, [carregar]);

  const topRight = (
    <Link href={`/rs/relatorio?mes=${mes}${site ? `&site=${encodeURIComponent(site)}` : ""}${setor ? `&setor=${encodeURIComponent(setor)}` : ""}`}
      style={{ padding: "9px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
               fontSize: 13, fontWeight: 600, color: colors.textSecondary, textDecoration: "none", whiteSpace: "nowrap" }}>
      Relatório completo →
    </Link>
  );

  const K = data?.kpis;
  const V = data?.variacao || {};
  const fatiasStatus = data
    ? Object.keys(STATUS_LABELS).map((k) => ({
        label: STATUS_LABELS[k],
        valor: Number(data.por_status?.[k]?.count || 0),
        cor: STATUS_CORES[k],
      }))
    : [];
  const atrasadas = data?.em_aberto?.atrasadas || 0;
  const semDados = data && K.total_rps === 0;

  const cascata = (atraso = 0) => ({ className: `rs-cascade ${revelado ? "rs-play" : ""}`, style: { animationDelay: `${atraso}s` } });

  return (
    <PortalShell
      title="Dashboard R&S"
      subtitle={`Visão consolidada · ${mesLabel(mes)}${site ? ` · ${site}` : ""}${setor ? ` · ${setor}` : ""}`}
      topRight={topRight}
    >
      <style>{`
        @keyframes rsCascade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .rs-cascade { opacity: 0; }
        .rs-cascade.rs-play { animation: rsCascade .5s cubic-bezier(.16,1,.3,1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .rs-cascade, .rs-cascade.rs-play { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
        .rs-grid-5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        .rs-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .rs-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 1100px) { .rs-grid-5 { grid-template-columns: repeat(2, 1fr); } .rs-grid-3 { grid-template-columns: 1fr; } .rs-grid-2 { grid-template-columns: 1fr; } }
      `}</style>

      <PageHero
        eyebrow="Recrutamento & Seleção"
        title="Indicadores do Período"
        subtitle="Volume, taxas, prazos e RPs atrasadas — comparados ao mês anterior. RPs canceladas não entram nos totais de HC'S."
      />

      {/* Filtros */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", margin: "16px 0 14px" }}>
        <div>
          <label style={estiloLabel}>Mês</label>
          <select value={mes} onChange={(e) => setMes(e.target.value)} style={estiloSelect}>
            {getMesesDisponiveis().map((m) => <option key={m} value={m}>{mesLabel(m, true)}</option>)}
          </select>
        </div>
        <SiteSelect valor={site} onChange={setSite} />
        <SetorToggle valor={setor} onChange={setSetor} />
        <LimiteDiasSelect valor={limite} onChange={setLimite} />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: colors.textMuted }}>Carregando dados...</div>
      ) : !data ? (
        <div style={{ textAlign: "center", padding: 60, color: colors.danger }}>{erro || "Não foi possível carregar os dados."}</div>
      ) : (
        <div>
          {semDados && (
            <div style={{ ...card, marginBottom: 14, color: colors.textSecondary, fontSize: 13 }}>
              Nenhuma RP em {mesLabel(mes, true)} com estes filtros. As RPs em andamento de meses anteriores aparecem mais abaixo.
            </div>
          )}

          {/* Linha 1: volume (cada card compara com o mês anterior) */}
          <div {...cascata(0)} className={`rs-cascade ${revelado ? "rs-play" : ""} rs-grid-5`} style={{ marginBottom: 12 }}>
            <StatCard title="RPs recebidas" value={<ContadorAnimado valor={K.total_rps} revelado={revelado} />} accent={colors.accent}
              helper={<Variacao valor={V.total_rps} melhor="neutro" rotulo="vs mês anterior" />} />
            <StatCard title="HC'S solicitados" value={<ContadorAnimado valor={K.hcs} revelado={revelado} />} accent={colors.primary}
              helper={<Variacao valor={V.hcs} melhor="neutro" rotulo="vs mês anterior" />} />
            <StatCard title="HC'S aprovados" value={<ContadorAnimado valor={K.hcs_aprovados} revelado={revelado} />} accent={colors.purple || "#7c3aed"}
              helper={<Variacao valor={V.hcs_aprovados} melhor="subir" rotulo="vs mês anterior" />} />
            <StatCard title="HC'S entregues" value={<ContadorAnimado valor={K.qtd_entregue} revelado={revelado} />} accent={colors.success}
              helper={<Variacao valor={V.qtd_entregue} melhor="subir" rotulo="vs mês anterior" />} />
            <StatCard title="Vagas pendentes" value={<ContadorAnimado valor={K.pendentes} revelado={revelado} />} accent={colors.warning}
              subtitle="RPs em andamento"
              helper={<Variacao valor={V.pendentes} melhor="descer" rotulo="vs mês anterior" />} />
          </div>

          {/* Linha 2: taxas e atrasos */}
          <div {...cascata(0.05)} className={`rs-cascade ${revelado ? "rs-play" : ""} rs-grid-3`} style={{ marginBottom: 14 }}>
            <StatCard title="Taxa de aprovação" value={fmtTaxa(K.taxa_aprovacao)} accent={colors.purple || "#7c3aed"}
              subtitle="aprovados ÷ solicitados"
              helper={<Variacao valor={V.taxa_aprovacao} tipo="pp" melhor="subir" rotulo="vs mês anterior" />} />
            <StatCard title="Taxa de entrega" value={<span style={{ color: corTaxa(K.taxa_entrega) }}>{fmtTaxa(K.taxa_entrega)}</span>} accent={corTaxa(K.taxa_entrega)}
              subtitle="entregues ÷ solicitados"
              helper={<Variacao valor={V.taxa_entrega} tipo="pp" melhor="subir" rotulo="vs mês anterior" />} />
            <StatCard title="RPs atrasadas" value={<span style={{ color: atrasadas > 0 ? colors.danger : colors.success }}>{fmtNum(atrasadas)}</span>}
              accent={atrasadas > 0 ? colors.danger : colors.success}
              subtitle={`de ${fmtNum(data.em_aberto.total)} em andamento (mais de ${data.em_aberto.limite_dias} dias)`}
              helper={atrasadas > 0 ? "Veja a lista no fim da página" : "Tudo dentro do prazo"} />
          </div>

          {/* Acumulado do ano */}
          <div {...cascata(0.08)} className={`rs-cascade ${revelado ? "rs-play" : ""}`} style={{ ...card, padding: "14px 22px", marginBottom: 14, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: colors.accent }}>
              Acumulado {data.acumulado_ano.periodo.ate.slice(0, 4)} (jan a {mesLabel(data.acumulado_ano.periodo.ate).slice(0, 3).toLowerCase()})
            </span>
            {[
              ["RPs", fmtNum(data.acumulado_ano.kpis.total_rps)],
              ["HC'S solicitados", fmtNum(data.acumulado_ano.kpis.hcs)],
              ["Aprovados", fmtNum(data.acumulado_ano.kpis.hcs_aprovados)],
              ["Entregues", fmtNum(data.acumulado_ano.kpis.qtd_entregue)],
              ["Taxa de entrega", fmtTaxa(data.acumulado_ano.kpis.taxa_entrega)],
            ].map(([l, v]) => (
              <span key={l} style={{ fontSize: 13, color: colors.textSecondary }}>{l}: <strong style={{ color: colors.textPrimary }}>{v}</strong></span>
            ))}
          </div>

          {/* Operacional vs Estratégico */}
          <div {...cascata(0.1)} className={`rs-cascade ${revelado ? "rs-play" : ""}`} style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <SetorCard titulo="Operacional" dados={data.operacional} cor={colors.primary} />
            <SetorCard titulo="Estratégico" dados={data.estrategico} cor={colors.purple || "#7c3aed"} />
          </div>

          {/* Funil + status */}
          <div className="rs-grid-2" style={{ marginBottom: 14 }}>
            <div {...cascata(0.12)} className={`rs-cascade ${revelado ? "rs-play" : ""}`} style={{ ...card, animationDelay: ".12s" }}>
              <p style={cardTitle}>Do pedido à entrega (HC'S)</p>
              <Funil revelado={revelado} etapas={[
                { label: "Solicitados", valor: K.hcs, cor: colors.primary },
                { label: "Aprovados", valor: K.hcs_aprovados, cor: colors.purple || "#7c3aed" },
                { label: "Entregues", valor: K.qtd_entregue, cor: colors.success },
              ]} />
            </div>
            <div {...cascata(0.14)} className={`rs-cascade ${revelado ? "rs-play" : ""}`} style={{ ...card, animationDelay: ".14s" }}>
              <p style={cardTitle}>Situação das RPs</p>
              <Donut fatias={fatiasStatus} revelado={revelado} />
            </div>
          </div>

          {/* Rankings */}
          <div className="rs-grid-2" style={{ marginBottom: 14 }}>
            <div {...cascata(0.16)} className={`rs-cascade ${revelado ? "rs-play" : ""}`} style={{ ...card, animationDelay: ".16s" }}>
              <p style={cardTitle}>Top produtos · operacional (HC'S)</p>
              {(data.top_produtos || []).length === 0 ? <p style={vazio}>Sem RPs operacionais no período.</p> : (
                <BarraHorizontal dados={data.top_produtos} labelKey="produto" valueKey="hcs" cor={colors.primary} revelado={revelado}
                  subtitulo={(d) => `Entregues: ${fmtNum(d.qtd_entregue)} · Taxa: ${fmtTaxa(d.taxa_entrega)}`} />
              )}
            </div>
            <div {...cascata(0.18)} className={`rs-cascade ${revelado ? "rs-play" : ""}`} style={{ ...card, animationDelay: ".18s" }}>
              <p style={cardTitle}>Top cargos · estratégico (HC'S)</p>
              {(data.top_cargos || []).length === 0 ? <p style={vazio}>Sem RPs estratégicas no período.</p> : (
                <BarraHorizontal dados={data.top_cargos} labelKey="cargo" valueKey="hcs" cor={colors.purple || "#7c3aed"} revelado={revelado}
                  subtitulo={(d) => `Entregues: ${fmtNum(d.qtd_entregue)} · Taxa: ${fmtTaxa(d.taxa_entrega)}`} />
              )}
            </div>
          </div>

          {/* Tendência: dois gráficos, cada um com uma única unidade (HC'S e %) */}
          <div className="rs-grid-2" style={{ marginBottom: 14 }}>
            <div {...cascata(0.2)} className={`rs-cascade ${revelado ? "rs-play" : ""}`} style={{ ...card, animationDelay: ".2s" }}>
              <p style={cardTitle}>Tendência · HC'S (últimos 6 meses)</p>
              <GraficoLinha dados={data.tendencia} eixoX="mes" revelado={revelado} linhas={[
                { key: "hcs", label: "HC'S solicitados", cor: colors.primary },
                { key: "qtd_entregue", label: "HC'S entregues", cor: colors.accent },
              ]} />
            </div>
            <div {...cascata(0.22)} className={`rs-cascade ${revelado ? "rs-play" : ""}`} style={{ ...card, animationDelay: ".22s" }}>
              <p style={cardTitle}>Tendência · taxas (últimos 6 meses)</p>
              <GraficoLinha dados={data.tendencia} eixoX="mes" revelado={revelado} linhas={[
                { key: "taxa_aprovacao", label: "Taxa de aprovação", cor: colors.purple || "#7c3aed", sufixo: "%" },
                { key: "taxa_entrega", label: "Taxa de entrega", cor: colors.success, sufixo: "%" },
              ]} />
            </div>
          </div>

          <CardPrazosEPor data={data} />

          <div style={{ marginTop: 14 }}>
            <TabelaEmAndamento emAberto={data.em_aberto} />
          </div>
        </div>
      )}
    </PortalShell>
  );
}

function CardPrazosEPor({ data }) {
  return (
    <div className="rs-grid-2" style={{ alignItems: "start" }}>
      <CardPrazos sla={data.sla} />
      <div>
        <TabelaGrupo titulo="Por site" rotuloColuna="Site" linhas={data.por_site} total={data.kpis} chave="site" />
      </div>
    </div>
  );
}

const vazio = { fontSize: 13, color: colors.textMuted, margin: 0 };
