"use client";

import { useState, useEffect, useCallback } from "react";
import PortalShell from "../../../components/PortalShell";
import PageHero    from "../../../components/PageHero";
import StatCard    from "../../../components/StatCard";
import {
  MES_ATUAL, mesLabel, getMesesDisponiveis, fmtNum, fmtTaxa, Variacao, SetorToggle, SiteSelect,
  LimiteDiasSelect, estiloSelect, estiloLabel, card, cardTitle, corTaxa, TabelaGrupo, CardPrazos, TabelaEmAndamento,
} from "../../../components/RSRelatorios";
import { apiFetch, apiDownload } from "../../../services/api";
import { colors } from "../../../lib/theme";

// ─── Período ───────────────────────────────────────────────────────
function somarMeses(ym, n) {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const TIPOS = [
  { v: "mes", l: "Um mês" },
  { v: "tri", l: "3 meses" },
  { v: "sem", l: "6 meses" },
  { v: "ano", l: "Ano até o mês" },
  { v: "custom", l: "Personalizado" },
];

function calcularPeriodo(tipo, fim, de) {
  if (tipo === "mes") return { de: fim, ate: fim };
  if (tipo === "tri") return { de: somarMeses(fim, -2), ate: fim };
  if (tipo === "sem") return { de: somarMeses(fim, -5), ate: fim };
  if (tipo === "ano") return { de: `${fim.slice(0, 4)}-01`, ate: fim };
  return { de: de <= fim ? de : fim, ate: fim };
}

// ─── Distribuição de status com barras ─────────────────────────────
const STATUS_CORES = {
  "ENTREGUE":     colors.success,
  "EM ANDAMENTO": "#2563eb",
  "NÃO ENTREGUE": colors.danger,
  "CANCELADA":    colors.neutral,
};

function StatusBars({ dados }) {
  if (!dados || dados.length === 0) return null;
  const total = dados.reduce((s, r) => s + r.total, 0);
  return (
    <div>
      {dados.map(r => {
        const cor = STATUS_CORES[r.status] || colors.neutral;
        return (
          <div key={r.status} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: cor }} />
                <span style={{ fontSize: 13, color: colors.textSecondary }}>{r.status}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
                {r.total}{" "}
                <span style={{ fontSize: 11, color: colors.textMuted, fontWeight: 400 }}>({r.pct}%)</span>
              </span>
            </div>
            <div style={{ height: 6, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${r.pct}%`, background: cor,
                            borderRadius: 4, transition: "width .5s ease" }} />
            </div>
          </div>
        );
      })}
      <p style={{ margin: "8px 0 0", fontSize: 11, color: colors.textMuted, textAlign: "right" }}>
        Total: {total} RP{total !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// ─── Página ────────────────────────────────────────────────────────
export default function RSRelatorioPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [exportando, setExportando] = useState(false);
  const [tipo, setTipo] = useState("mes");
  const [fim, setFim] = useState(MES_ATUAL());
  const [de, setDe] = useState(somarMeses(MES_ATUAL(), -2));
  const [site, setSite] = useState("");
  const [setor, setSetor] = useState("");
  const [limite, setLimite] = useState(15);

  // Vem do botão "Relatório completo" do Dashboard: ?mes=&site=&setor=
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (/^\d{4}-\d{2}$/.test(q.get("mes") || "")) setFim(q.get("mes"));
      if (q.get("site")) setSite(q.get("site"));
      if (q.get("setor")) setSetor(q.get("setor"));
    } catch {}
  }, []);

  const periodo = calcularPeriodo(tipo, fim, de);
  const qs = useCallback(() => {
    const p = new URLSearchParams({ de: periodo.de, ate: periodo.ate, limite_dias: String(limite) });
    if (site) p.set("site", site);
    if (setor) p.set("setor", setor);
    return p;
  }, [periodo.de, periodo.ate, site, setor, limite]);

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try { setData(await apiFetch(`/rs/relatorio?${qs()}`)); }
    catch (e) { setData(null); setErro(e.message || "Erro ao gerar o relatório."); }
    finally { setLoading(false); }
  }, [qs]);

  useEffect(() => { carregar(); }, [carregar]);

  const rotuloPeriodo = periodo.de === periodo.ate ? mesLabel(periodo.de, true) : `${mesLabel(periodo.de, true)} a ${mesLabel(periodo.ate, true)}`;

  // O Excel leva exatamente os mesmos filtros da tela
  const handleExportar = async () => {
    setExportando(true);
    try {
      const sufixo = periodo.de === periodo.ate ? periodo.de.replace("-", "_") : `${periodo.de.replace("-", "_")}_a_${periodo.ate.replace("-", "_")}`;
      await apiDownload(`/rs/exportar?${qs()}`, `relatorio_rs_${sufixo}.xlsx`);
    } catch (e) { alert("Erro ao exportar: " + (e.message || "Tente novamente.")); }
    finally { setExportando(false); }
  };

  const topRight = (
    <button onClick={handleExportar} disabled={exportando || loading}
      style={{
        background: exportando ? "#f1f5f9" : colors.accent, color: exportando ? colors.textMuted : "#fff",
        border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13,
        cursor: exportando ? "not-allowed" : "pointer",
      }}>
      {exportando ? "Gerando..." : "⬇ Exportar Excel"}
    </button>
  );

  const K = data?.kpis, A = data?.anterior?.kpis, Y = data?.acumulado_ano?.kpis, V = data?.variacao || {};
  const rotAnterior = data ? (data.anterior.periodo.de === data.anterior.periodo.ate ? mesLabel(data.anterior.periodo.de) : `${mesLabel(data.anterior.periodo.de)} a ${mesLabel(data.anterior.periodo.ate)}`) : "";

  const linhasComparativo = data ? [
    ["RPs recebidas", "total_rps", "n", "neutro"],
    ["HC'S solicitados", "hcs", "n", "neutro"],
    ["HC'S com TO", "hcs_com_to", "n", null],
    ["HC'S aprovados", "hcs_aprovados", "n", "subir"],
    ["HC'S entregues", "qtd_entregue", "n", "subir"],
    ["Vagas pendentes (em andamento)", "pendentes", "n", "descer"],
    ["Vagas não atendidas (não entregues)", "nao_atendidas", "n", null],
    ["Taxa de aprovação", "taxa_aprovacao", "t", "subir"],
    ["Taxa de entrega", "taxa_entrega", "t", "subir"],
  ] : [];

  return (
    <PortalShell
      title="Relatório R&S"
      subtitle={`${rotuloPeriodo} · ${site || "Todos os sites"} · ${setor || "Todos os setores"}`}
      topRight={topRight}
    >
      <PageHero
        eyebrow="Recrutamento & Seleção"
        title="Relatório de RPs"
        subtitle="Volume, taxas, comparativo com o período anterior e acumulado do ano. O Excel exportado leva os mesmos filtros."
      />

      {/* Filtros */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", margin: "16px 0 14px" }}>
        <div>
          <label style={estiloLabel}>Período</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={estiloSelect}>
            {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>
        {tipo === "custom" && (
          <div>
            <label style={estiloLabel}>De</label>
            <select value={de} onChange={(e) => setDe(e.target.value)} style={estiloSelect}>
              {getMesesDisponiveis(36).map((m) => <option key={m} value={m}>{mesLabel(m, true)}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={estiloLabel}>{tipo === "mes" ? "Mês" : "Até o mês"}</label>
          <select value={fim} onChange={(e) => setFim(e.target.value)} style={estiloSelect}>
            {getMesesDisponiveis(36).map((m) => <option key={m} value={m}>{mesLabel(m, true)}</option>)}
          </select>
        </div>
        <SiteSelect valor={site} onChange={setSite} />
        <SetorToggle valor={setor} onChange={setSetor} />
        <LimiteDiasSelect valor={limite} onChange={setLimite} />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: colors.textMuted }}>Gerando relatório...</div>
      ) : !data ? (
        <div style={{ textAlign: "center", padding: 60, color: colors.danger }}>{erro || "Sem dados para o período."}</div>
      ) : (
        <>
          {/* KPIs do período */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
            <StatCard title="RPs" value={fmtNum(K.total_rps)} accent={colors.accent} />
            <StatCard title="HC'S solicitados" value={fmtNum(K.hcs)} accent="#2563eb" />
            <StatCard title="HC'S aprovados" value={fmtNum(K.hcs_aprovados)} accent="#7c3aed" subtitle={`Taxa ${fmtTaxa(K.taxa_aprovacao)}`} />
            <StatCard title="HC'S entregues" value={fmtNum(K.qtd_entregue)} accent={colors.success}
              subtitle={<span style={{ color: corTaxa(K.taxa_entrega), fontWeight: 700 }}>Taxa {fmtTaxa(K.taxa_entrega)}</span>} />
            <StatCard title="Vagas pendentes" value={fmtNum(K.pendentes)} accent={colors.warning} subtitle="RPs em andamento" />
          </div>

          {/* Comparativo */}
          <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: colors.accent }}>
                Comparativo e acumulado do ano
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={thSt}>Indicador</th>
                    <th style={{ ...thSt, textAlign: "right" }}>{rotuloPeriodo}</th>
                    <th style={{ ...thSt, textAlign: "right" }}>Anterior ({rotAnterior})</th>
                    <th style={{ ...thSt, textAlign: "right" }}>Variação</th>
                    <th style={{ ...thSt, textAlign: "right" }}>Acumulado {data.acumulado_ano.periodo.ate.slice(0, 4)}</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasComparativo.map(([rot, chave, tipoVal, melhor], i) => {
                    const fmt = tipoVal === "t" ? fmtTaxa : fmtNum;
                    return (
                      <tr key={chave} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 18px", color: colors.textPrimary, fontWeight: 600 }}>{rot}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: colors.textPrimary }}>{fmt(K[chave])}</td>
                        <td style={tdR}>{fmt(A[chave])}</td>
                        <td style={tdR}>{melhor === null ? "—" : <Variacao valor={V[chave]} tipo={tipoVal === "t" ? "pp" : "pct"} melhor={melhor} rotulo="" />}</td>
                        <td style={tdR}>{fmt(Y[chave])}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ margin: 0, padding: "10px 20px", fontSize: 11, color: colors.textMuted, borderTop: "1px solid #f1f5f9" }}>
              Anterior = os {data.periodo.meses === 1 ? "mês imediatamente anterior" : `${data.periodo.meses} meses imediatamente anteriores`}. Taxas = sobre HC'S solicitados; variação das taxas em pontos percentuais.
              RPs canceladas contam como RP, mas não entram nos totais de HC'S.
            </p>
          </div>

          <TabelaGrupo titulo="Por site" rotuloColuna="Site" linhas={data.por_site} total={K} chave="site" />
          {(!setor || setor === "OPERACIONAL") && (
            <TabelaGrupo titulo="Operacional · por produto / cliente" rotuloColuna="Produto / cliente" linhas={data.por_produto} chave="produto" />
          )}
          {(!setor || setor === "ESTRATÉGICO") && (
            <TabelaGrupo titulo="Estratégico · por cargo" rotuloColuna="Cargo" linhas={data.por_cargo} chave="cargo" />
          )}

          {data.periodo.meses > 1 && (
            <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
                <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: colors.accent }}>Mês a mês</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={thSt}>Mês</th>
                      {["RPs", "HC'S", "Aprovados", "Entregues", "Taxa aprovação", "Taxa entrega", "Pendentes"].map((h) => <th key={h} style={{ ...thSt, textAlign: "right" }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.por_mes.map((m, i) => (
                      <tr key={m.mes} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 18px", color: colors.textPrimary, fontWeight: 600 }}>{mesLabel(m.mes, true)}</td>
                        <td style={tdR}>{fmtNum(m.total_rps)}</td>
                        <td style={tdR}>{fmtNum(m.hcs)}</td>
                        <td style={tdR}>{fmtNum(m.hcs_aprovados)}</td>
                        <td style={{ ...tdR, color: colors.success, fontWeight: 700 }}>{fmtNum(m.qtd_entregue)}</td>
                        <td style={tdR}>{fmtTaxa(m.taxa_aprovacao)}</td>
                        <td style={{ ...tdR, fontWeight: 700, color: corTaxa(m.taxa_entrega) }}>{fmtTaxa(m.taxa_entrega)}</td>
                        <td style={tdR}>{fmtNum(m.pendentes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12, marginBottom: 14, alignItems: "start" }}>
            {data.por_status && data.por_status.length > 0 && (
              <div style={card}>
                <p style={cardTitle}>Situação das RPs</p>
                <StatusBars dados={data.por_status} />
              </div>
            )}
            <CardPrazos sla={data.sla} />
          </div>

          <TabelaEmAndamento emAberto={data.em_aberto} />
        </>
      )}
    </PortalShell>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────
const thSt = {
  padding: "10px 18px", fontSize: 11, fontWeight: 700, color: colors.textMuted,
  textTransform: "uppercase", letterSpacing: ".04em",
  borderBottom: "1px solid #e2e8f0", textAlign: "left", whiteSpace: "nowrap",
};
const tdR = { padding: "10px 18px", textAlign: "right", color: colors.textSecondary };
