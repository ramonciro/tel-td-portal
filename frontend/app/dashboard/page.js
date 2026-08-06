"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import { apiFetch, getStoredUser } from "../../services/api";
import { formatDateBR } from "../../lib/date";
import { colors, chart, corDoCliente, radius } from "../../lib/theme";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function formatDate(value) {
  return formatDateBR(value, "-");
}

function normalizeStatus(status) {
  const key = String(status || "").toLowerCase();
  if (key.includes("concl")) return "Concluída";
  if (key.includes("andamento")) return "Em andamento";
  if (key.includes("cancel")) return "Cancelada";
  return "Planejada";
}

function parseModalidade(descricao, modalidade) {
  if (modalidade === "presencial") return "Presencial";
  if (modalidade === "online") return "Online";
  const text = String(descricao || "");
  const match = text.match(/\[modalidade:([^\]]+)\]/i);
  const parsed = String(match?.[1] || "").trim().toLowerCase();
  if (parsed === "presencial") return "Presencial";
  if (parsed === "online") return "Online";
  return "Presencial";
}

function getBadgeStyleByTax(value) {
  const number = Number(value || 0);
  if (number >= 90) return { background: colors.successLight, color: colors.successText, border: `1px solid rgba(16, 185, 129, 0.2)` };
  if (number >= 80) return { background: colors.warningLight, color: colors.warningText, border: `1px solid rgba(245, 158, 11, 0.2)` };
  return { background: colors.dangerLight, color: colors.dangerText, border: `1px solid rgba(239, 68, 68, 0.2)` };
}

export default function DashboardPage() {
  const [usuario, setUsuario] = useState(undefined);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState(null);
  const [filters, setFilters] = useState({
    cliente: "",
    instrutor: "",
    supervisor: "",
    status: "",
    modalidade: "",
    data_inicio: "",
    data_fim: "",
  });

  useEffect(() => {
    const u = getStoredUser();
    setUsuario(u);
  }, []);

  useEffect(() => {
    async function carregar() {
      try {
        setErro("");
        setLoading(true);
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.set(key, value);
        });
        const path = params.toString() ? `/dashboard/treinamentos?${params.toString()}` : "/dashboard/treinamentos";
        const response = await apiFetch(path);
        setDados(response || null);
      } catch (error) {
        setErro(error.message || "Erro ao carregar dashboard.");
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, [filters]);

  async function abrirDrillDown(item) {
    setDrillDown({ turma: item, itens: [], loading: true });
    try {
      const resposta = await apiFetch(`/frequencia-individual?treinamento_id=${item.id}`);
      setDrillDown({ turma: item, itens: Array.isArray(resposta?.itens) ? resposta.itens : [], loading: false });
    } catch (error) {
      setDrillDown({ turma: item, itens: [], loading: false, erro: error.message });
    }
  }

  function exportarParaCSV() {
    const turmasParaExportar = dados?.ultimas_turmas || [];
    if (turmasParaExportar.length === 0) {
      alert("Não há dados de turmas disponíveis para exportar com os filtros atuais.");
      return;
    }

    const cabecalho = ["ID", "Turma", "Cliente", "Instrutor", "Modalidade", "Status", "Data", "Base", "Presenca (%)", "Presentes", "Pendentes"];
    const linhas = turmasParaExportar.map(item => [
      item.id,
      `"${(item.tema || "").replace(/"/g, '""')}"`,
      `"${(item.cliente || "").replace(/"/g, '""')}"`,
      `"${(item.instrutor || "").replace(/"/g, '""')}"`,
      parseModalidade(item.descricao, item.modalidade),
      normalizeStatus(item.status_canonico || item.status),
      formatDate(item.data || item.data_inicio),
      item.base_ativa || item.treinados || 0,
      item.taxa_presenca || 0,
      item.presentes || 0,
      item.pendentes || 0
    ]);

    const csvContent = "\uFEFF" + [cabecalho.join(";"), ...linhas.map(e => e.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_dashboard_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (usuario === undefined) return null;

  const kpis = dados?.kpis || {};
  const filtrosApi = dados?.filtros || {};
  const presencaPorCliente = dados?.presenca_por_cliente || [];
  const rankingInstrutores = dados?.ranking_instrutores || [];
  const ultimasTurmas = dados?.ultimas_turmas || [];
  const nps = dados?.nps || {};

  const clienteOptions = Array.isArray(filtrosApi.clientes) ? filtrosApi.clientes : [];
  const instrutorOptions = Array.isArray(filtrosApi.instrutores) ? filtrosApi.instrutores : [];
  const supervisorOptions = Array.isArray(filtrosApi.supervisores) ? filtrosApi.supervisores : [];
  const statusOptions = Array.isArray(filtrosApi.status) ? filtrosApi.status : [];
  const modalidadeOptions = Array.isArray(filtrosApi.modalidades) ? filtrosApi.modalidades : [];

  const primeiroNome = String(usuario?.nome || "").split(" ")[0] || "";

  return (
    <PortalShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, margin: "-24px -24px 0", background: "#F8FAFC", minHeight: "100vh", overflowX: "hidden", width: "calc(100% + 48px)" }}>

        {/* Pulso operacional superior estilo SaaS */}
        {ultimasTurmas.length > 0 && (
          <div style={{ background: "#0F172A", padding: "10px 24px", display: "flex", alignItems: "center", gap: 16, overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,0.08)", width: "100%", boxSizing: "border-box" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".1em", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#38BDF8", display: "inline-block" }} /> Live Pulse
            </span>
            {ultimasTurmas.slice(0, 8).map((t) => {
              const status = normalizeStatus(t.status_canonico || t.status);
              const dotColor = status === "Planejada" ? colors.warning : status === "Em andamento" || status === "Concluída" ? colors.success : "#64748B";
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#E2E8F0", whiteSpace: "nowrap", flexShrink: 0, background: "rgba(255,255,255,0.04)", padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                  <strong style={{ fontWeight: 600 }}>{t.tema}</strong> <span style={{ color: "#94A3B8" }}>({t.cliente})</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Header Principal da Página */}
        <div style={{ padding: "28px 24px 16px", background: "#fff", borderBottom: `1px solid ${colors.border}`, width: "100%", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ background: "rgba(56, 189, 248, 0.1)", color: "#0284C7", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Analítico - Espaço de Trabalho</span>
                <span style={{ fontSize: 12, color: colors.textMuted }}>• Atualizado em tempo real</span>
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: "-.02em" }}>
                Dashboard Executivo, {primeiroNome}.
              </h1>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={exportarParaCSV}
                style={{
                  border: `1px solid ${colors.border}`, background: "#fff", color: "#0F172A",
                  borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 12.5,
                  display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                }}
              >
                📥 Exportar CSV
              </button>
              <button
                onClick={() => setFilters({ cliente: "", instrutor: "", supervisor: "", status: "", modalidade: "", data_inicio: "", data_fim: "" })}
                style={{
                  border: `1px solid ${colors.border}`, background: "#F1F5F9", color: "#475569",
                  borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 12.5
                }}
              >
                Limpar Filtros
              </button>
            </div>
          </div>

          {erro && (
            <div style={{ background: colors.dangerLight, color: colors.dangerText, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginTop: 16 }}>
              {erro}
            </div>
          )}

          {/* Painel de Filtros Avançados (Estilo Toolbar SaaS) */}
          <div style={{ background: "#F8FAFC", border: `1px solid ${colors.border}`, borderRadius: 12, padding: 14, marginTop: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <label style={fieldLabel}>
                Cliente
                <select style={inputStyle} value={filters.cliente} onChange={(e) => setFilters((prev) => ({ ...prev, cliente: e.target.value }))}>
                  <option value="">Todos</option>
                  {clienteOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label style={fieldLabel}>
                Instrutor
                <select style={inputStyle} value={filters.instrutor} onChange={(e) => setFilters((prev) => ({ ...prev, instrutor: e.target.value }))}>
                  <option value="">Todos</option>
                  {instrutorOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label style={fieldLabel}>
                Supervisor
                <select style={inputStyle} value={filters.supervisor} onChange={(e) => setFilters((prev) => ({ ...prev, supervisor: e.target.value }))}>
                  <option value="">Todos</option>
                  {supervisorOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label style={fieldLabel}>
                Status
                <select style={inputStyle} value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="">Todos</option>
                  {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>

              <label style={fieldLabel}>
                Modalidade
                <select style={inputStyle} value={filters.modalidade} onChange={(e) => setFilters((prev) => ({ ...prev, modalidade: e.target.value }))}>
                  <option value="">Todas</option>
                  {modalidadeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>

              <label style={fieldLabel}>
                Data inicial
                <input type="date" style={inputStyle} value={filters.data_inicio} onChange={(e) => setFilters((prev) => ({ ...prev, data_inicio: e.target.value }))} />
              </label>

              <label style={fieldLabel}>
                Data final
                <input type="date" style={inputStyle} value={filters.data_fim} onChange={(e) => setFilters((prev) => ({ ...prev, data_fim: e.target.value }))} />
              </label>
            </div>
          </div>
        </div>

        {/* Conteúdo Principal com espaçamento limpo */}
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20, width: "100%", boxSizing: "border-box" }}>

          {/* Grid de KPIs / Métricas principais (Estilo Bento Grid SaaS) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
            <MetricaCard valor={fmt(kpis.treinamentos || 0)} label="Turmas no Recorte" cor={chart.blue} pct={100} icon="📊" />
            <MetricaCard valor={`${fmt(kpis.taxa_presenca || 0)}%`} label="Presença Consolidada" cor={colors.success} pct={Number(kpis.taxa_presenca || 0)} icon="🎯" />
            <MetricaCard valor={fmt(kpis.pendentes || 0)} label="Pendências em Aberto" cor={colors.warning} pct={Math.min(Number(kpis.pendentes || 0) * 10, 100)} icon="⚠️" />
            <MetricaCard valor={`${fmt(kpis.taxa_execucao_diaria || 0)}%`} label="Taxa de Execução" cor={chart.purple} pct={Number(kpis.taxa_execucao_diaria || 0)} icon="⚡" />
            {nps.total_avaliacoes > 0 && (
              <MetricaCard valor={nps.media_nps > 0 ? fmt(nps.media_nps) : "—"} label={`NPS Médio (${fmt(nps.total_avaliacoes)} avaliações)`} cor={chart.pink} pct={75} icon="⭐" />
            )}
          </div>

          {/* Seção Dividida: Saúde por Cliente & Ranking de Instrutores */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
            
            {/* Card Clientes */}
            <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Saúde por Cliente</h3>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: colors.textMuted }}>Volume e taxa de presença corporativa</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, background: "#F1F5F9", padding: "3px 8px", borderRadius: 6 }}>Top Contas</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {presencaPorCliente.length ? presencaPorCliente.map((item) => {
                  const badge = getBadgeStyleByTax(item.taxa_presenca);
                  const corCli = corDoCliente(item.cliente);
                  return (
                    <div key={item.cliente} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "#FAFAFA", border: `1px solid ${colors.border}` }}>
                      <div>
                        <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: corCli.bg, color: corCli.text }}>{item.cliente}</span>
                        <p style={{ margin: "4px 0 0", fontSize: 11.5, color: colors.textSecondary }}>{fmt(item.total_treinados)} base • {fmt(item.presentes)} presentes</p>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8, ...badge }}>
                        {fmt(item.taxa_presenca)}%
                      </span>
                    </div>
                  );
                }) : <p style={{ fontSize: 13, color: colors.textMuted, padding: "12px 0" }}>Nenhum dado por cliente no recorte.</p>}
              </div>
            </div>

            {/* Card Instrutores */}
            <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Performance de Instrutores</h3>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: colors.textMuted }}>Efetividade em campo e turmas ministradas</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, background: "#F1F5F9", padding: "3px 8px", borderRadius: 6 }}>Ranking</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rankingInstrutores.length ? rankingInstrutores.map((item) => {
                  const badge = getBadgeStyleByTax(item.taxa_presenca);
                  return (
                    <div key={item.instrutor} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "#FAFAFA", border: `1px solid ${colors.border}` }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{item.instrutor}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: colors.textSecondary }}>{fmt(item.total_turmas)} turma(s) • {fmt(item.total_treinados)} base</p>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8, ...badge }}>
                        {fmt(item.taxa_presenca)}%
                      </span>
                    </div>
                  );
                }) : <p style={{ fontSize: 13, color: colors.textMuted, padding: "12px 0" }}>Nenhum dado de instrutor no recorte.</p>}
              </div>
            </div>

          </div>

          {/* Tabela de Turmas Recentes com design refinado */}
          <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Turmas Recentes & Ativas</h3>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: colors.textMuted }}>Clique em qualquer linha para abrir o painel de frequência individual detalhado.</p>
              </div>
            </div>

            {loading && <p style={{ fontSize: 13, color: colors.textSecondary, padding: "20px 0" }}>Carregando dados da tabela...</p>}
            {!loading && ultimasTurmas.length === 0 && (
              <p style={{ fontSize: 13, color: colors.textMuted, padding: "20px 0" }}>Nenhuma turma encontrada com os filtros atuais.</p>
            )}

            {ultimasTurmas.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 850 }}>
                  <thead>
                    <tr style={{ background: "#F8FAFC", borderBottom: `1px solid ${colors.border}` }}>
                      <th style={th}>Tema / Turma</th>
                      <th style={th}>Cliente</th>
                      <th style={th}>Instrutor</th>
                      <th style={th}>Modalidade</th>
                      <th style={th}>Status</th>
                      <th style={th}>Data</th>
                      <th style={th}>Base</th>
                      <th style={th}>Presença</th>
                      <th style={th}>Pendências</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ultimasTurmas.map((item) => {
                      const corCli = corDoCliente(item.cliente);
                      const statusName = normalizeStatus(item.status_canonico || item.status);
                      return (
                        <tr 
                          key={item.id} 
                          onClick={() => abrirDrillDown(item)} 
                          style={{ cursor: "pointer", borderBottom: `1px solid ${colors.border}`, transition: "background 0.1s" }} 
                          onMouseEnter={(e) => e.currentTarget.style.background = "#F8FAFC"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          title="Clique para inspecionar frequência"
                        >
                          <td style={td}><strong style={{ color: "#0F172A", fontWeight: 600 }}>{item.tema || "-"}</strong></td>
                          <td style={td}><span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: corCli.bg, color: corCli.text }}>{item.cliente || "-"}</span></td>
                          <td style={td}>{item.instrutor || "-"}</td>
                          <td style={td}><span style={{ fontSize: 11.5, color: colors.textSecondary, background: "#F1F5F9", padding: "2px 6px", borderRadius: 4 }}>{parseModalidade(item.descricao, item.modalidade)}</span></td>
                          <td style={td}><span style={{ fontSize: 12, fontWeight: 600 }}>{statusName}</span></td>
                          <td style={td}>{formatDate(item.data || item.data_inicio)}</td>
                          <td style={td}>{fmt(item.base_ativa || item.treinados || 0)}</td>
                          <td style={td}>
                            {item.taxa_presenca > 0 ? (
                              <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11.5, fontWeight: 700, ...getBadgeStyleByTax(item.taxa_presenca) }}>
                                {item.taxa_presenca}%
                              </span>
                            ) : "—"}
                          </td>
                          <td style={td}><span style={{ fontWeight: item.pendentes > 0 ? 700 : 400, color: item.pendentes > 0 ? colors.warningText : colors.textSecondary }}>{fmt(item.pendentes || 0)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Modal de Drill-down Estilo Drawer / Pop-up Moderno */}
      {drillDown && (
        <div
          onClick={() => setDrillDown(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 540, width: "100%", maxHeight: "82vh", overflowY: "auto", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, borderBottom: `1px solid ${colors.border}`, paddingBottom: 12 }}>
              <div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#0284C7", background: "rgba(56, 189, 248, 0.1)", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>Detalhes da Turma</span>
                <p style={{ margin: "6px 0 0", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>{drillDown.turma?.tema || "Turma Selecionada"}</p>
              </div>
              <button onClick={() => setDrillDown(null)} style={{ border: "none", background: "#F1F5F9", width: 28, height: 28, borderRadius: "50%", fontSize: 14, cursor: "pointer", color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {drillDown.loading && <p style={{ fontSize: 13, color: colors.textSecondary, padding: "20px 0", textAlign: "center" }}>Carregando dados individuais de frequência...</p>}
            {drillDown.erro && <p style={{ fontSize: 13, color: colors.dangerText, padding: "10px 0" }}>{drillDown.erro}</p>}
            {!drillDown.loading && !drillDown.erro && drillDown.itens.length === 0 && (
              <p style={{ fontSize: 13, color: colors.textMuted, padding: "20px 0", textAlign: "center" }}>Sem registros individuais encontrados para esta turma.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {drillDown.itens.map((pessoa, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${colors.border}` }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{pessoa.treinando_nome}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: colors.textMuted }}>{pessoa.presentes} presentes • {pessoa.ausentes} ausentes</p>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, borderRadius: 8, padding: "4px 10px",
                    ...getBadgeStyleByTax(pessoa.frequencia_percentual)
                  }}>
                    {pessoa.frequencia_percentual}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

function MetricaCard({ valor, label, cor, pct, icon }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.02)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</p>
          <span style={{ fontSize: 16 }}>{icon}</span>
        </div>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#0F172A", letterSpacing: "-.02em" }}>{valor}</p>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: "#F1F5F9", marginTop: 14, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: cor, borderRadius: 999 }} />
      </div>
    </div>
  );
}

const fieldLabel = { display: "grid", gap: 3, color: "#475569", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" };
const inputStyle = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "7px 10px", background: "#fff", color: "#0F172A", fontSize: 12, outline: "none", boxSizing: "border-box" };
const th = { textAlign: "left", padding: "12px 14px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: colors.textSecondary, fontWeight: 700 };
const td = { padding: "12px 14px", color: colors.textSecondary, fontSize: 12.5 };
