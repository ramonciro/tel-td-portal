"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
import { ContadorAnimado, Donut, BarraHorizontal, GraficoLinha } from "../../components/Charts";
import { apiFetch } from "../../services/api";
import { colors } from "../../lib/theme";

// ─── Helpers ───────────────────────────────────────────────────────

const MES_ATUAL = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const MESES_NOME = {
  "01":"Jan","02":"Fev","03":"Mar","04":"Abr","05":"Mai","06":"Jun",
  "07":"Jul","08":"Ago","09":"Set","10":"Out","11":"Nov","12":"Dez",
};

function mesLabel(mes) {
  if (!mes) return "";
  const [ano, mm] = mes.split("-");
  return `${MESES_NOME[mm] || mm}/${ano}`;
}

function getMesesDisponiveis() {
  const hoje = new Date();
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

// 6 meses em ordem cronológica (mais antigo -> mais novo), terminando no mês
// selecionado no filtro — assim a tendência acompanha o mesmo período que o
// resto do painel, e dá pra "olhar pra trás" trocando o seletor de mês.
function getUltimos6Meses(mesFinal) {
  const [ano, mm] = mesFinal.split("-").map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const offset = 5 - i;
    const d = new Date(ano, mm - 1 - offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

const fmtNum = (v) => Number(v || 0).toLocaleString("pt-BR");

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
    </div>
  );
}

// ─── Página ────────────────────────────────────────────────────────
export default function RSDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(MES_ATUAL());

  // Tendência dos últimos 6 meses — puramente do lado do front, chamando o
  // mesmo endpoint /rs/dashboard uma vez por mês em paralelo (o backend já
  // filtra por `mes` com DATE_FORMAT(mes_referencia,'%Y-%m'), não precisou
  // mudar nada lá). Estado separado do KPI do mês atual porque tem seu
  // próprio ciclo de carregamento (6 requisições em vez de 1).
  const [tendencia, setTendencia] = useState([]);
  const [loadingTendencia, setLoadingTendencia] = useState(true);

  // Cascata de entrada: só liga depois que os KPIs do mês terminam de
  // carregar pela primeira vez — mesmo padrão já aprovado em /inicio.
  const [revelado, setRevelado] = useState(false);
  useEffect(() => {
    if (loading) return;
    const id = requestAnimationFrame(() => setRevelado(true));
    return () => cancelAnimationFrame(id);
  }, [loading]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`/rs/dashboard?mes=${mes}`);
      setData(d);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [mes]);

  const carregarTendencia = useCallback(async () => {
    setLoadingTendencia(true);
    try {
      const meses = getUltimos6Meses(mes);
      const resultados = await Promise.all(
        meses.map((m) => apiFetch(`/rs/dashboard?mes=${m}`).catch(() => null))
      );
      setTendencia(
        meses.map((m, i) => ({
          mes: m,
          rps: Number(resultados[i]?.total_rps || 0),
          entregue: Number(resultados[i]?.total_entregue || 0),
        }))
      );
    } finally {
      setLoadingTendencia(false);
    }
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { carregarTendencia(); }, [carregarTendencia]);

  const selectorMes = (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <select value={mes} onChange={e => setMes(e.target.value)}
        style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
                 color: colors.textPrimary, padding: "9px 12px", fontSize: 13, cursor: "pointer" }}>
        {getMesesDisponiveis().map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
      </select>
      <Link href="/rs/relatorio"
        style={{ padding: "9px 16px", background: "#f8fafc", border: "1px solid #e2e8f0",
                 borderRadius: 8, fontSize: 13, fontWeight: 600, color: colors.textSecondary,
                 textDecoration: "none", whiteSpace: "nowrap" }}>
        Relatório completo →
      </Link>
    </div>
  );

  const fatiasStatus = data
    ? Object.keys(STATUS_LABELS).map((k) => ({
        label: STATUS_LABELS[k],
        valor: Number(data.por_status?.[k]?.count || 0),
        cor: STATUS_CORES[k],
      }))
    : [];

  return (
    <PortalShell
      title="Dashboard R&S"
      subtitle={`Visão consolidada · ${mesLabel(mes)}`}
      topRight={selectorMes}
    >
      {/* Cascata de entrada — mesmo padrão de /inicio (revisão setembro/2026,
          a pedido do Ramon: "melhorar os gráficos e permitir animações").
          prefers-reduced-motion desliga tudo pra quem pediu menos movimento
          no sistema operacional. */}
      <style>{`
        @keyframes rsCascade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .rs-cascade { opacity: 0; }
        .rs-cascade.rs-play { animation: rsCascade .5s cubic-bezier(.16,1,.3,1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .rs-cascade, .rs-cascade.rs-play { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      <PageHero
        eyebrow="Recrutamento & Seleção"
        title="Indicadores do Mês"
        subtitle="Acompanhamento em tempo real das requisições por site e setor."
        stats={
          data ? [
            { label: "Total de RPs",    value: fmtNum(data.total_rps) },
            { label: "HC'S Solicitados",value: fmtNum(data.total_hcs) },
            { label: "HC'S Aprovados",  value: fmtNum(data.total_hcs_aprovados) },
            { label: "QTD Entregue",    value: fmtNum(data.total_entregue) },
          ] : []
        }
      />

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: colors.textMuted }}>Carregando dados...</div>
      ) : !data ? (
        <div style={{ textAlign: "center", padding: 60, color: colors.textMuted }}>
          Nenhum dado encontrado para {mesLabel(mes)}.
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>

          {/* KPI cards — números "contando" até o valor real ao revelar,
              mesma sensação de "painel vivo" apontada como diferencial dos
              concorrentes de LMS no benchmark. */}
          <div className={`rs-cascade ${revelado ? "rs-play" : ""}`}
               style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
            <StatCard title="Total de RPs"     value={<ContadorAnimado valor={data.total_rps} revelado={revelado} />}           accent={colors.accent}  />
            <StatCard title="HC'S Solicitados" value={<ContadorAnimado valor={data.total_hcs} revelado={revelado} />}           accent={colors.primary} />
            <StatCard title="HC'S Aprovados"   value={<ContadorAnimado valor={data.total_hcs_aprovados} revelado={revelado} />} accent={colors.purple || "#7c3aed"} />
            <StatCard title="QTD Entregue"     value={<ContadorAnimado valor={data.total_entregue} revelado={revelado} />}      accent={colors.success} />
          </div>

          {/* Operacional vs Estratégico */}
          <div className={`rs-cascade ${revelado ? "rs-play" : ""}`}
               style={{ display: "flex", gap: 12, marginBottom: 14, animationDelay: ".05s" }}>
            <SetorCard titulo="Operacional" dados={data.operacional} cor={colors.primary} />
            <SetorCard titulo="Estratégico" dados={data.estrategico} cor={colors.purple || "#7c3aed"} />
          </div>

          {/* Status (donut) + Top produtos (ranking de magnitude, uma cor só) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div className={`rs-cascade ${revelado ? "rs-play" : ""}`} style={{ ...card, animationDelay: ".1s" }}>
              <p style={cardTitle}>Distribuição de Status</p>
              <Donut fatias={fatiasStatus} revelado={revelado} />
            </div>

            <div className={`rs-cascade ${revelado ? "rs-play" : ""}`} style={{ ...card, animationDelay: ".15s" }}>
              <p style={cardTitle}>Top Produtos por HC'S</p>
              <BarraHorizontal
                dados={data.top_produtos || []}
                labelKey="produto"
                valueKey="hcs"
                cor={colors.primary}
                revelado={revelado}
                subtitulo={(d) => `Entregue: ${fmtNum(d.qtd_entregue)}`}
              />
            </div>
          </div>

          {/* Tendência — últimos 6 meses (novo: não existia antes). RPs
              recebidos x quantidade entregue, lado a lado, pra enxergar se a
              entrega está acompanhando a demanda. Paleta azul/laranja
              validada no dataviz (CVD e contraste OK nas duas direções). */}
          <div className={`rs-cascade ${revelado ? "rs-play" : ""}`} style={{ ...card, marginBottom: 14, animationDelay: ".2s" }}>
            <p style={cardTitle}>Tendência (últimos 6 meses)</p>
            {loadingTendencia ? (
              <p style={{ fontSize: 13, color: colors.textMuted, textAlign: "center", padding: "24px 0" }}>Carregando tendência...</p>
            ) : (
              <GraficoLinha
                dados={tendencia}
                linhas={[
                  { key: "rps",      label: "Total de RPs",   cor: colors.primary },
                  { key: "entregue", label: "Qtd. Entregue",  cor: colors.accent },
                ]}
                eixoX="mes"
                revelado={revelado}
              />
            )}
          </div>

          {/* Por site */}
          {data.por_site && data.por_site.length > 0 && (
            <div className={`rs-cascade ${revelado ? "rs-play" : ""}`} style={{ ...card, animationDelay: ".25s" }}>
              <p style={cardTitle}>RPs por Site</p>
              <BarraHorizontal
                dados={data.por_site}
                labelKey="site"
                valueKey="total_rps"
                cor={colors.accent}
                revelado={revelado}
                maxItens={10}
              />
            </div>
          )}
        </div>
      )}
    </PortalShell>
  );
}

const card = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
  padding: "20px 22px", boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
};
const cardTitle = {
  margin: "0 0 16px", fontSize: 12, fontWeight: 800,
  textTransform: "uppercase", letterSpacing: ".06em", color: colors.accent,
};
