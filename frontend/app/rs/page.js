"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
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

const fmtNum = (v) => Number(v || 0).toLocaleString("pt-BR");

// ─── Barra de progresso de status ──────────────────────────────────
const STATUS_CORES = {
  entregue:     colors.success,
  em_andamento: "#2563eb",
  nao_entregue: colors.danger,
  cancelada:    colors.neutral,
};
const STATUS_LABELS = {
  entregue:     "Entregue",
  em_andamento: "Em Andamento",
  nao_entregue: "Não Entregue",
  cancelada:    "Cancelada",
};

function BarraStatus({ chave, dados }) {
  const { count = 0, pct = 0 } = dados || {};
  const cor = STATUS_CORES[chave] || colors.neutral;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 13, color: colors.textSecondary }}>{STATUS_LABELS[chave]}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
          {count}{" "}
          <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 400 }}>({pct}%)</span>
        </span>
      </div>
      <div style={{ height: 6, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cor,
                      borderRadius: 4, transition: "width .5s ease" }} />
      </div>
    </div>
  );
}

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

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`/rs/dashboard?mes=${mes}`);
      setData(d);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [mes]);

  useEffect(() => { carregar(); }, [carregar]);

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

  return (
    <PortalShell
      title="Dashboard R&S"
      subtitle={`Visão consolidada · ${mesLabel(mes)}`}
      topRight={selectorMes}
    >
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

          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 14 }}>
            <StatCard title="Total de RPs"     value={fmtNum(data.total_rps)}           accent={colors.accent}  />
            <StatCard title="HC'S Solicitados" value={fmtNum(data.total_hcs)}           accent="#2563eb"        />
            <StatCard title="HC'S Aprovados"   value={fmtNum(data.total_hcs_aprovados)} accent="#7c3aed"        />
            <StatCard title="QTD Entregue"     value={fmtNum(data.total_entregue)}      accent={colors.success} />
          </div>

          {/* Operacional vs Estratégico */}
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <SetorCard titulo="Operacional" dados={data.operacional} cor="#2563eb" />
            <SetorCard titulo="Estratégico" dados={data.estrategico} cor="#7c3aed" />
          </div>

          {/* Status + Top produtos */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div style={card}>
              <p style={cardTitle}>Distribuição de Status</p>
              {Object.keys(STATUS_LABELS).map(k => (
                <BarraStatus key={k} chave={k} dados={data.por_status?.[k]} />
              ))}
            </div>

            <div style={card}>
              <p style={cardTitle}>Top Produtos por HC'S</p>
              {data.top_produtos && data.top_produtos.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <th style={thLight}>Produto</th>
                      <th style={{ ...thLight, textAlign: "right" }}>HC'S</th>
                      <th style={{ ...thLight, textAlign: "right" }}>Entregue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_produtos.map((p, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "9px 0", color: colors.textPrimary, fontWeight: 600 }}>{p.produto}</td>
                        <td style={{ padding: "9px 0", textAlign: "right", color: colors.textSecondary }}>{fmtNum(p.hcs)}</td>
                        <td style={{ padding: "9px 0", textAlign: "right", color: colors.success, fontWeight: 700 }}>{fmtNum(p.qtd_entregue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: colors.textMuted, fontSize: 13 }}>Sem dados de produto para este mês.</p>
              )}
            </div>
          </div>

          {/* Por site */}
          {data.por_site && data.por_site.length > 0 && (
            <div style={card}>
              <p style={cardTitle}>RPs por Site</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {data.por_site.map(s => (
                  <div key={s.site} style={{
                    background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12,
                    padding: "14px 20px", textAlign: "center", minWidth: 130,
                  }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: colors.textPrimary }}>{s.total_rps}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4,
                                  textTransform: "uppercase", letterSpacing: ".04em" }}>{s.site}</div>
                  </div>
                ))}
              </div>
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
const thLight = {
  padding: "0 0 8px", fontSize: 10, fontWeight: 700, color: colors.textMuted,
  textTransform: "uppercase", letterSpacing: ".04em", textAlign: "left",
};
