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
  return "-";
}

function getBadgeStyleByTax(value) {
  const number = Number(value || 0);
  if (number >= 90) return { background: colors.successLight, color: colors.successText };
  if (number >= 80) return { background: colors.warningLight, color: colors.warningText };
  return { background: colors.dangerLight, color: colors.dangerText };
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
      <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "-24px -24px 0" }}>

        {/* Pulso operacional no topo, alinhado ao padrão da página Início */}
        {ultimasTurmas.length > 0 && (
          <div style={{ background: colors.navySoft, padding: "12px 24px", display: "flex", alignItems: "center", gap: 16, overflowX: "auto" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#8B93A7", textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap", flexShrink: 0 }}>
              Pulso do painel
            </span>
            {ultimasTurmas.slice(0, 8).map((t) => {
              const status = normalizeStatus(t.status_canonico || t.status);
              const dotColor = status === "Planejada" ? colors.warning : status === "Em andamento" || status === "Concluída" ? colors.success : "#465065";
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#DCE0EA", whiteSpace: "nowrap", flexShrink: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                  {t.tema} · {t.cliente} — {status}
                </div>
              );
            })}
          </div>
        )}

        {/* Cabeçalho da página */}
        <div style={{ padding: "26px 24px 4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: colors.textPrimary, letterSpacing: "-.01em" }}>
                Visão consolidada, {primeiroNome}.
              </h1>
              <p style={{ margin: "6px 0 20px", fontSize: 13.5, color: colors.textSecondary }}>
                Filtre, compare e analise os indicadores de desempenho e presença da operação.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={exportarParaCSV}
                style={{
                  border: `1px solid ${colors.border}`, background: "#fff", color: colors.textPrimary,
                  borderRadius: radius.sm, padding: "8px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13,
                  display: "inline-flex", alignItems: "center", gap: 6
                }}
              >
                📥 Exportar CSV
              </button>
              <button
                onClick={() => setFilters({ cliente: "", instrutor: "", supervisor: "", status: "", modalidade: "", data_inicio: "", data_fim: "" })}
                style={{
                  border: `1px solid ${colors.border}`, background: "#fff", color: colors.textSecondary,
                  borderRadius: radius.sm, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 13
                }}
              >
                Limpar filtros
              </button>
            </div>
          </div>

          {erro && (
            <div style={{ background: colors.dangerLight, color: colors.dangerText, borderRadius: radius.sm, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
              {erro}
            </div>
          )}

          {/* Bloco de Filtros em Grade Harmoniosa */}
          <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 16, padding: 18, marginBottom: 24 }}>
            <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>Filtros do painel</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
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

        {/* Bloco de Métricas Principais (Estilo Início) */}
        <div style={{ padding: "0 24px 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <Metrica valor={fmt(kpis.treinamentos || 0)} label="Turmas no recorte" cor={chart.blue} pct={100} />
          <Metrica valor={`${fmt(kpis.taxa_presenca || 0)}%`} label="Presença consolidada" cor={colors.success} pct={Number(kpis.taxa_presenca || 0)} />
          <Metrica valor={fmt(kpis.pendentes || 0)} label="Pendências em aberto" cor={colors.warning} pct={Math.min(Number(kpis.pendentes || 0) * 10, 100)} />
          <Metrica valor={`${fmt(kpis.taxa_execucao_diaria || 0)}%`} label="Taxa de execução" cor={chart.purple} pct={Number(kpis.taxa_execucao_diaria || 0)} />
          {nps.total_avaliacoes > 0 && (
            <Metrica valor={nps.media_nps > 0 ? fmt(nps.media_nps) : "—"} label={`NPS médio (${fmt(nps.total_avaliacoes)} avaliações)`} cor={chart.pink} pct={75} />
          )}
        </div>

        {/* Seções de Desempenho por Cliente e Instrutor */}
        <div style={{ padding: "8px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {/* Clientes */}
          <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 16, padding: 20 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800, color: colors.textPrimary }}>Saúde por cliente</h3>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: colors.textMuted }}>Comparativo de presença por conta.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {presencaPorCliente.length ? presencaPorCliente.map((item) => {
                const badge = getBadgeStyleByTax(item.taxa_presenca);
                const corCli = corDoCliente(item.cliente);
                return (
                  <div key={item.cliente} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, border: `1px solid ${colors.border}` }}>
                    <div>
                      <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: corCli.bg, color: corCli.text }}>{item.cliente}</span>
                      <p style={{ margin: "4px 0 0", fontSize: 11.5, color: colors.textSecondary }}>{fmt(item.total_treinados)} base · {fmt(item.presentes)} presentes</p>
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 800, padding: "4px 10px", borderRadius: 999, ...badge }}>
                      {fmt(item.taxa_presenca)}%
                    </span>
                  </div>
                );
              }) : <p style={{ fontSize: 13, color: colors.textMuted }}>Nenhum dado por cliente no recorte.</p>}
            </div>
          </div>

          {/* Instrutores */}
          <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 16, padding: 20 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800, color: colors.textPrimary }}>Instrutores no recorte</h3>
            <p style={{ margin: "0 0 16px", fontSize: 12, color: colors.textMuted }}>Produtividade e presença média.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rankingInstrutores.length ? rankingInstrutores.map((item) => {
                const badge = getBadgeStyleByTax(item.taxa_presenca);
                return (
                  <div key={item.instrutor} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, border: `1px solid ${colors.border}` }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: colors.textPrimary }}>{item.instrutor}</p>
                      <p style={{ margin: "2px 0 0", fontSize: 11.5, color: colors.textSecondary }}>{fmt(item.total_turmas)} turma(s) · {fmt(item.total_treinados)} base</p>
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 800, padding: "4px 10px", borderRadius: 999, ...badge }}>
                      {fmt(item.taxa_presenca)}%
                    </span>
                  </div>
                );
              }) : <p style={{ fontSize: 13, color: colors.textMuted }}>Nenhum dado de instrutor no recorte.</p>}
            </div>
          </div>
        </div>

        {/* Tabela de Turmas Recentes */}
        <div style={{ padding: "8px 24px 40px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: colors.textPrimary }}>Turmas recentes</h2>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.textMuted }}>Clique em uma linha para detalhar a frequência individual.</p>
            </div>
          </div>

          {loading && <p style={{ fontSize: 13, color: colors.textSecondary }}>Carregando turmas...</p>}
          {!loading && ultimasTurmas.length === 0 && (
            <p style={{ fontSize: 13, color: colors.textMuted }}>Nenhuma turma encontrada com os filtros atuais.</p>
          )}

          {ultimasTurmas.length > 0 && (
            <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 16, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                <thead>
                  <tr style={{ background: colors.navySoft }}>
                    <th style={th}>Turma</th>
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
                      <tr key={item.id} onClick={() => abrirDrillDown(item)} style={{ cursor: "pointer", borderBottom: `1px solid ${colors.border}` }} title="Clique para ver a frequência">
                        <td style={td}><strong style={{ color: colors.textPrimary }}>{item.tema || "-"}</strong></td>
                        <td style={td}><span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: corCli.bg, color: corCli.text }}>{item.cliente || "-"}</span></td>
                        <td style={td}>{item.instrutor || "-"}</td>
                        <td style={td}>{parseModalidade(item.descricao, item.modalidade)}</td>
                        <td style={td}>{statusName}</td>
                        <td style={td}>{formatDate(item.data || item.data_inicio)}</td>
                        <td style={td}>{fmt(item.base_ativa || item.treinados || 0)}</td>
                        <td style={td}>
                          {item.taxa_presenca > 0 ? (
                            <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, ...getBadgeStyleByTax(item.taxa_presenca) }}>
                              {item.taxa_presenca}%
                            </span>
                          ) : "—"}
                        </td>
                        <td style={td}>{fmt(item.pendentes || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* Modal de Drill-down de Frequência Individual */}
      {drillDown && (
        <div
          onClick={() => setDrillDown(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, padding: 22, maxWidth: 520, width: "100%", maxHeight: "80vh", overflowY: "auto", border: `1px solid ${colors.border}` }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, color: colors.textMuted }}>Frequência por pessoa</p>
                <p style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 800, color: colors.textPrimary }}>{drillDown.turma?.tema || "Turma"}</p>
              </div>
              <button onClick={() => setDrillDown(null)} style={{ border: "none", background: "none", fontSize: 18, cursor: "pointer", color: colors.textSecondary }}>✕</button>
            </div>

            {drillDown.loading && <p style={{ fontSize: 13, color: colors.textSecondary }}>Carregando dados individuais...</p>}
            {drillDown.erro && <p style={{ fontSize: 13, color: colors.dangerText }}>{drillDown.erro}</p>}
            {!drillDown.loading && !drillDown.erro && drillDown.itens.length === 0 && (
              <p style={{ fontSize: 13, color: colors.textMuted }}>Sem registros de frequência individual para esta turma.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {drillDown.itens.map((pessoa, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, border: `1px solid ${colors.border}` }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.textPrimary }}>{pessoa.treinando_nome}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: colors.textMuted }}>{pessoa.presentes} presentes · {pessoa.ausentes} ausentes</p>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "4px 10px",
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

function Metrica({ valor, label, cor, pct }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 16, padding: 16 }}>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: colors.textPrimary, letterSpacing: "-.01em" }}>{valor}</p>
      <p style={{ margin: "2px 0 0", fontSize: 11.5, color: colors.textSecondary }}>{label}</p>
      <div style={{ height: 4, borderRadius: 999, background: colors.border, marginTop: 10, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: cor }} />
      </div>
    </div>
  );
}

const fieldLabel = { display: "grid", gap: 4, color: colors.textSecondary, fontSize: 11.5, fontWeight: 700 };
const inputStyle = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: 9, padding: "8px 10px", background: "#fff", color: colors.textPrimary, fontSize: 12.5 };
const th = { textAlign: "left", padding: "12px 14px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".04em", color: colors.textSecondary, borderBottom: `1px solid ${colors.border}` };
const td = { padding: "12px 14px", color: colors.textSecondary, fontSize: 13 };
