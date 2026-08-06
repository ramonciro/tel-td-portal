"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import PortalShell from "../../components/PortalShell";
import { apiFetch, getStoredUser } from "../../services/api";
import { colors, chart, corDoCliente } from "../../lib/theme";

const META_PRESENCA_SLA = 85;

function formatarNumero(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function formatarData(valor) {
  if (!valor) return "-";
  try {
    const dataStr = String(valor).split("T")[0];
    const partes = dataStr.split("-");
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return valor;
  } catch {
    return value;
  }
}

function normalizarStatus(status) {
  const chave = String(status || "").toLowerCase();
  if (chave.includes("concl")) return "Concluída";
  if (chave.includes("andamento")) return "Em andamento";
  if (chave.includes("cancel")) return "Cancelada";
  return "Planejada";
}

function analisarModalidade(descricao, modalidade) {
  if (modalidade === "presencial") return "Presencial";
  if (modalidade === "online") return "Online";
  const texto = String(descricao || "");
  const correspondencia = texto.match(/\[modalidade:([^\]]+)\]/i);
  const extraido = String(correspondencia?.[1] || "").trim().toLowerCase();
  if (extraido === "presencial") return "Presencial";
  if (extraido === "online") return "Online";
  return "Presencial";
}

function obterEstiloSeloPorTaxa(valor) {
  const numero = Number(valor || 0);
  if (numero >= META_PRESENCA_SLA) return { background: colors.successLight, color: colors.successText, border: `1px solid rgba(16, 185, 129, 0.2)` };
  if (numero >= 75) return { background: colors.warningLight, color: colors.warningText, border: `1px solid rgba(245, 158, 11, 0.2)` };
  return { background: colors.dangerLight, color: colors.dangerText, border: `1px solid rgba(239, 68, 68, 0.2)` };
}

export default function PaginaDashboard() {
  const [usuario, setUsuario] = useState(null);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [detalhesTurma, setDetalhesTurma] = useState(null);
  const [filtros, setFiltros] = useState({
    cliente: "",
    instrutor: "",
    supervisor: "",
    status: "",
    modalidade: "",
    data_inicio: "",
    data_fim: "",
  });

  useEffect(() => {
    try {
      const u = getStoredUser();
      setUsuario(u || {});
    } catch {
      setUsuario({});
    }
  }, []);

  useEffect(() => {
    async function carregarDados() {
      try {
        setErro("");
        setCarregando(true);
        const parametros = new URLSearchParams();
        Object.entries(filtros).forEach(([chave, valor]) => {
          if (valor) parametros.set(chave, valor);
        });
        const caminho = parametros.toString() ? `/dashboard/treinamentos?${parametros.toString()}` : "/dashboard/treinamentos";
        const resposta = await apiFetch(caminho);
        setDados(resposta || {});
      } catch (erroApi) {
        setErro(erroApi.message || "Erro ao carregar dashboard.");
      } finally {
        setCarregando(false);
      }
    }
    carregarDados();
  }, [filtros]);

  function aplicarAtalhoPeriodo(tipo) {
    const hoje = new Date();
    const formatarDataStr = (d) => d.toISOString().slice(0, 10);
    
    let inicio = "";
    let fim = formatarDataStr(hoje);

    if (tipo === "hoje") {
      inicio = formatarDataStr(hoje);
    } else if (tipo === "semana") {
      const primeiroDia = new Date(hoje);
      primeiroDia.setDate(hoje.getDate() - hoje.getDay());
      inicio = formatarDataStr(primeiroDia);
    } else if (tipo === "mes") {
      const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      inicio = formatarDataStr(primeiroDiaMes);
    } else if (tipo === "limpar") {
      setFiltros(anterior => ({ ...anterior, data_inicio: "", data_fim: "" }));
      return;
    }

    setFiltros(anterior => ({ ...anterior, data_inicio: inicio, data_fim: fim }));
  }

  async function abrirDetalhesTurma(item) {
    setDetalhesTurma({ turma: item, itens: [], carregando: true });
    try {
      const resposta = await apiFetch(`/frequencia-individual?treinamento_id=${item.id}`);
      setDetalhesTurma({ turma: item, itens: Array.isArray(resposta?.itens) ? resposta.itens : [], carregando: false });
    } catch (erroDetalhe) {
      setDetalhesTurma({ turma: item, itens: [], carregando: false, erro: erroDetalhe.message });
    }
  }

  function exportarParaExcel() {
    const turmasParaExportar = dados?.ultimas_turmas || [];
    if (turmasParaExportar.length === 0) {
      alert("Não há dados de turmas disponíveis para exportar com os filtros atuais.");
      return;
    }

    const dadosFormatados = turmasParaExportar.map(item => ({
      "ID": item.id || "",
      "Tema / Turma": item.tema || "-",
      "Cliente": item.cliente || "-",
      "Instrutor": item.instrutor || "-",
      "Supervisor": item.supervisor || "-",
      "Modalidade": analisarModalidade(item.descricao, item.modalidade),
      "Status": normalizarStatus(item.status_canonico || item.status),
      "Data": formatarData(item.data || item.data_inicio),
      "Base Ativa / Treinados": Number(item.base_ativa || item.treinados || 0),
      "Presentes": Number(item.presentes || 0),
      "Ausentes": Number(item.ausentes || 0),
      "Pendentes": Number(item.pendentes || 0),
      "Taxa de Presença (%)": Number(item.taxa_presenca || 0)
    }));

    const planilha = XLSX.utils.json_to_sheet(dadosFormatados);
    const livroTrabalho = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livroTrabalho, planilha, "Relatório Executivo");

    planilha["!cols"] = [
      { wch: 6 },  // ID
      { wch: 30 }, // Tema / Turma
      { wch: 15 }, // Cliente
      { wch: 20 }, // Instrutor
      { wch: 20 }, // Supervisor
      { wch: 12 }, // Modalidade
      { wch: 15 }, // Status
      { wch: 12 }, // Data
      { wch: 18 }, // Base Ativa
      { wch: 12 }, // Presentes
      { wch: 12 }, // Ausentes
      { wch: 12 }, // Pendentes
      { wch: 20 }, // Taxa de Presença
    ];

    XLSX.writeFile(livroTrabalho, `relatorio_executivo_treinamentos_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const kpis = dados?.kpis || {};
  const filtrosApi = dados?.filtros || {};
  const presencaPorCliente = Array.isArray(dados?.presenca_por_cliente) ? dados.presenca_por_cliente : [];
  const rankingInstrutores = Array.isArray(dados?.ranking_instrutores) ? dados.ranking_instrutores : [];
  const ultimasTurmas = Array.isArray(dados?.ultimas_turmas) ? dados.ultimas_turmas : [];
  const nps = dados?.nps || {};

  const opcoesCliente = Array.isArray(filtrosApi.clientes) ? filtrosApi.clientes : [];
  const opcoesStatus = Array.isArray(filtrosApi.status) ? filtrosApi.status : [];
  const opcoesModalidade = Array.isArray(filtrosApi.modalidades) ? filtrosApi.modalidades : [];

  const opcoesInstrutor = useMemo(() => {
    const lista = new Set();
    ultimasTurmas.forEach(t => { if (t.instrutor) lista.add(t.instrutor); });
    return Array.from(lista).sort();
  }, [ultimasTurmas]);

  const opcoesSupervisor = useMemo(() => {
    const lista = new Set();
    ultimasTurmas.forEach(t => { if (t.supervisor) lista.add(t.supervisor); });
    return Array.from(lista).sort();
  }, [ultimasTurmas]);

  const primeiroNome = String(usuario?.nome || "Coordenador").split(" ")[0];

  return (
    <PortalShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, margin: "-24px -24px 0", background: "#F8FAFC", minHeight: "100vh", overflowX: "hidden", width: "calc(100% + 48px)" }}>

        {ultimasTurmas.length > 0 && (
          <div style={{ background: "#0F172A", padding: "10px 24px", display: "flex", alignItems: "center", gap: 16, overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,0.08)", width: "100%", boxSizing: "border-box" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: ".1em", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#38BDF8", display: "inline-block" }} /> Live Pulse
            </span>
            {ultimasTurmas.slice(0, 8).map((turmaItem, indice) => {
              const statusTurma = normalizarStatus(turmaItem.status_canonico || turmaItem.status);
              const corPonto = statusTurma === "Planejada" ? colors.warning : statusTurma === "Em andamento" || statusTurma === "Concluída" ? colors.success : "#64748B";
              return (
                <div key={turmaItem.id || indice} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#E2E8F0", whiteSpace: "nowrap", flexShrink: 0, background: "rgba(255,255,255,0.04)", padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: corPonto, flexShrink: 0 }} />
                  <strong style={{ fontWeight: 600 }}>{turmaItem.tema || "Turma"}</strong> <span style={{ color: "#94A3B8" }}>({turmaItem.cliente || "Geral"})</span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ padding: "28px 24px 16px", background: "#fff", borderBottom: `1px solid ${colors.border}`, width: "100%", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ background: "rgba(56, 189, 248, 0.1)", color: "#0284C7", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: ".05em" }}>Workspace Analytics</span>
                <span style={{ fontSize: 12, color: colors.textMuted }}>• Meta corporativa SLA: {META_PRESENCA_SLA}%</span>
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: "-.02em" }}>
                Dashboard Executivo, {primeiroNome}.
              </h1>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={exportarParaExcel}
                style={{
                  border: `1px solid ${colors.border}`, background: "#fff", color: "#0F172A",
                  borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: 12.5,
                  display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                }}
              >
                📊 Exportar Relatório em Excel (.xlsx)
              </button>
              <button
                onClick={() => setFiltros({ cliente: "", instrutor: "", supervisor: "", status: "", modalidade: "", data_inicio: "", data_fim: "" })}
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

          <div style={{ background: "#F8FAFC", border: `1px solid ${colors.border}`, borderRadius: 12, padding: 14, marginTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".05em" }}>Filtros & Períodos Rápidos</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => aplicarAtalhoPeriodo("hoje")} style={estiloBotaoSelo}>Hoje</button>
                <button onClick={() => aplicarAtalhoPeriodo("semana")} style={estiloBotaoSelo}>Esta Semana</button>
                <button onClick={() => aplicarAtalhoPeriodo("mes")} style={estiloBotaoSelo}>Este Mês</button>
                <button onClick={() => aplicarAtalhoPeriodo("limpar")} style={{ ...estiloBotaoSelo, background: "#E2E8F0", color: "#334155" }}>Todas as Datas</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <label style={estiloRotuloCampo}>
                Cliente
                <select style={estiloEntrada} value={filtros.cliente} onChange={(e) => setFiltros((anterior) => ({ ...anterior, cliente: e.target.value }))}>
                  <option value="">Todos</option>
                  {opcoesCliente.map((opcaoItem) => <option key={opcaoItem} value={opcaoItem}>{opcaoItem}</option>)}
                </select>
              </label>

              <label style={estiloRotuloCampo}>
                Instrutor (Cascata)
                <select style={estiloEntrada} value={filtros.instrutor} onChange={(e) => setFiltros((anterior) => ({ ...anterior, instrutor: e.target.value }))}>
                  <option value="">Todos</option>
                  {opcoesInstrutor.map((opcaoItem) => <option key={opcaoItem} value={opcaoItem}>{opcaoItem}</option>)}
                </select>
              </label>

              <label style={estiloRotuloCampo}>
                Supervisor (Cascata)
                <select style={estiloEntrada} value={filtros.supervisor} onChange={(e) => setFiltros((anterior) => ({ ...anterior, supervisor: e.target.value }))}>
                  <option value="">Todos</option>
                  {opcoesSupervisor.map((opcaoItem) => <option key={opcaoItem} value={opcaoItem}>{opcaoItem}</option>)}
                </select>
              </label>

              <label style={estiloRotuloCampo}>
                Status
                <select style={estiloEntrada} value={filtros.status} onChange={(e) => setFiltros((anterior) => ({ ...anterior, status: e.target.value }))}>
                  <option value="">Todos</option>
                  {opcoesStatus.map((opcaoItem) => <option key={opcaoItem.value} value={opcaoItem.value}>{opcaoItem.label}</option>)}
                </select>
              </label>

              <label style={estiloRotuloCampo}>
                Modalidade
                <select style={estiloEntrada} value={filtros.modalidade} onChange={(e) => setFiltros((anterior) => ({ ...anterior, modalidade: e.target.value }))}>
                  <option value="">Todas</option>
                  {opcoesModalidade.map((opcaoItem) => <option key={opcaoItem.value} value={opcaoItem.value}>{opcaoItem.label}</option>)}
                </select>
              </label>

              <label style={estiloRotuloCampo}>
                Data inicial
                <input type="date" style={estiloEntrada} value={filtros.data_inicio} onChange={(e) => setFiltros((anterior) => ({ ...anterior, data_inicio: e.target.value }))} />
              </label>

              <label style={estiloRotuloCampo}>
                Data final
                <input type="date" style={estiloEntrada} value={filtros.data_fim} onChange={(e) => setFiltros((anterior) => ({ ...anterior, data_fim: e.target.value }))} />
              </label>
            </div>
          </div>
        </div>

        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20, width: "100%", boxSizing: "border-box" }}>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
            <CartaoMetrica valor={formatarNumero(kpis.treinamentos || 0)} rotulo="Turmas no Recorte" cor={chart.blue} porcentagem={100} icone="📊" />
            <CartaoMetrica 
              valor={`${formatarNumero(kpis.taxa_presenca || 0)}%`} 
              rotulo={`Presença Consolidada (Meta: ${META_PRESENCA_SLA}%)`} 
              cor={Number(kpis.taxa_presenca || 0) >= META_PRESENCA_SLA ? colors.success : colors.warning} 
              porcentagem={Number(kpis.taxa_presenca || 0)} 
              icone="🎯" 
            />
            <CartaoMetrica valor={formatarNumero(kpis.pendentes || 0)} rotulo="Pendências em Aberto" cor={colors.warning} porcentagem={Math.min(Number(kpis.pendentes || 0) * 10, 100)} icone="⚠️" />
            <CartaoMetrica valor={`${formatarNumero(kpis.taxa_execucao_diaria || 0)}%`} rotulo="Taxa de Execução" cor={chart.purple} porcentagem={Number(kpis.taxa_execucao_diaria || 0)} icone="⚡" />
            {Number(nps.total_avaliacoes || 0) > 0 && (
              <CartaoMetrica valor={Number(nps.media_nps || 0) > 0 ? formatarNumero(nps.media_nps) : "—"} rotulo={`NPS Médio (${formatarNumero(nps.total_avaliacoes)} avaliações)`} cor={chart.pink} porcentagem={75} icone="⭐" />
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16 }}>
            
            <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Saúde por Cliente</h3>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: colors.textMuted }}>Volume e taxa de presença corporativa</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, background: "#F1F5F9", padding: "3px 8px", borderRadius: 6 }}>Top Contas</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {presencaPorCliente.length ? presencaPorCliente.map((clienteItem) => {
                  const selo = obterEstiloSeloPorTaxa(clienteItem.taxa_presenca);
                  const corCliente = corDoCliente(clienteItem.cliente);
                  return (
                    <div key={clienteItem.cliente} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "#FAFAFA", border: `1px solid ${colors.border}` }}>
                      <div>
                        <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: corCliente.bg, color: corCliente.text }}>{clienteItem.cliente}</span>
                        <p style={{ margin: "4px 0 0", fontSize: 11.5, color: colors.textSecondary }}>{formatarNumero(clienteItem.total_treinados)} base • {formatarNumero(clienteItem.presentes)} presentes</p>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8, ...selo }}>
                        {formatarNumero(clienteItem.taxa_presenca)}%
                      </span>
                    </div>
                  );
                }) : <p style={{ fontSize: 13, color: colors.textMuted, padding: "12px 0" }}>Nenhum dado por cliente no recorte.</p>}
              </div>
            </div>

            <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Performance de Instrutores</h3>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: colors.textMuted }}>Efetividade em campo e turmas ministradas</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, background: "#F1F5F9", padding: "3px 8px", borderRadius: 6 }}>Ranking</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rankingInstrutores.length ? rankingInstrutores.map((instrutorItem) => {
                  const selo = obterEstiloSeloPorTaxa(instrutorItem.taxa_presenca);
                  return (
                    <div key={instrutorItem.instrutor} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "#FAFAFA", border: `1px solid ${colors.border}` }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{instrutorItem.instrutor}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: colors.textSecondary }}>{formatarNumero(instrutorItem.total_turmas)} turma(s) • {formatarNumero(instrutorItem.total_treinados)} base</p>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8, ...selo }}>
                        {formatarNumero(instrutorItem.taxa_presenca)}%
                      </span>
                    </div>
                  );
                }) : <p style={{ fontSize: 13, color: colors.textMuted, padding: "12px 0" }}>Nenhum dado de instrutor no recorte.</p>}
              </div>
            </div>

          </div>

          <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Turmas Recentes & Ativas (Visão Completa)</h3>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: colors.textMuted }}>Clique em qualquer linha para abrir o painel de frequência individual detalhado.</p>
              </div>
            </div>

            {carregando && <p style={{ fontSize: 13, color: colors.textSecondary, padding: "20px 0" }}>Carregando dados da tabela...</p>}
            {!carregando && ultimasTurmas.length === 0 && (
              <p style={{ fontSize: 13, color: colors.textMuted, padding: "20px 0" }}>Nenhuma turma encontrada com os filtros atuais.</p>
            )}

            {ultimasTurmas.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
                  <thead>
                    <tr style={{ background: "#F8FAFC", borderBottom: `1px solid ${colors.border}` }}>
                      <th style={estiloCabecalhoTabela}>Tema / Turma</th>
                      <th style={estiloCabecalhoTabela}>Cliente</th>
                      <th style={estiloCabecalhoTabela}>Instrutor</th>
                      <th style={estiloCabecalhoTabela}>Supervisor</th>
                      <th style={estiloCabecalhoTabela}>Modalidade</th>
                      <th style={estiloCabecalhoTabela}>Status</th>
                      <th style={estiloCabecalhoTabela}>Data</th>
                      <th style={estiloCabecalhoTabela}>Base</th>
                      <th style={estiloCabecalhoTabela}>Pres./Aus.</th>
                      <th style={estiloCabecalhoTabela}>Presença</th>
                      <th style={estiloCabecalhoTabela}>Pendências</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ultimasTurmas.map((turmaItem, indice) => {
                      const corCliente = corDoCliente(turmaItem.cliente);
                      const nomeStatus = normalizarStatus(turmaItem.status_canonico || turmaItem.status);
                      return (
                        <tr 
                          key={turmaItem.id || indice} 
                          onClick={() => abrirDetalhesTurma(turmaItem)} 
                          style={{ cursor: "pointer", borderBottom: `1px solid ${colors.border}`, transition: "background 0.1s" }} 
                          onMouseEnter={(e) => e.currentTarget.style.background = "#F8FAFC"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          title="Clique para inspecionar frequência"
                        >
                          <td style={estiloCelulaTabela}><strong style={{ color: "#0F172A", fontWeight: 600 }}>{turmaItem.tema || "-"}</strong></td>
                          <td style={estiloCelulaTabela}><span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: corCliente.bg, color: corCliente.text }}>{turmaItem.cliente || "-"}</span></td>
                          <td style={estiloCelulaTabela}>{turmaItem.instrutor || "-"}</td>
                          <td style={estiloCelulaTabela}><span style={{ color: colors.textSecondary, fontSize: 12 }}>{turmaItem.supervisor || "—"}</span></td>
                          <td style={estiloCelulaTabela}><span style={{ fontSize: 11.5, color: colors.textSecondary, background: "#F1F5F9", padding: "2px 6px", borderRadius: 4 }}>{analisarModalidade(turmaItem.descricao, turmaItem.modalidade)}</span></td>
                          <td style={estiloCelulaTabela}><span style={{ fontSize: 12, fontWeight: 600 }}>{nomeStatus}</span></td>
                          <td style={estiloCelulaTabela}>{formatarData(turmaItem.data || turmaItem.data_inicio)}</td>
                          <td style={estiloCelulaTabela}>{formatarNumero(turmaItem.base_ativa || turmaItem.treinados || 0)}</td>
                          <td style={estiloCelulaTabela}>
                            <span style={{ fontSize: 11.5, color: colors.textSecondary }}>
                              <strong style={{ color: colors.successText }}>{formatarNumero(turmaItem.presentes || 0)}</strong> / <span style={{ color: colors.dangerText }}>{formatarNumero(turmaItem.ausentes || 0)}</span>
                            </span>
                          </td>
                          <td style={estiloCelulaTabela}>
                            {Number(turmaItem.taxa_presenca || 0) > 0 ? (
                              <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11.5, fontWeight: 700, ...obterEstiloSeloPorTaxa(turmaItem.taxa_presenca) }}>
                                {turmaItem.taxa_presenca}%
                              </span>
                            ) : "—"}
                          </td>
                          <td style={estiloCelulaTabela}><span style={{ fontWeight: Number(turmaItem.pendentes || 0) > 0 ? 700 : 400, color: Number(turmaItem.pendentes || 0) > 0 ? colors.warningText : colors.textSecondary }}>{formatarNumero(turmaItem.pendentes || 0)}</span></td>
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

      {detalhesTurma && (
        <div
          onClick={() => setDetalhesTurma(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 540, width: "100%", maxHeight: "82vh", overflowY: "auto", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, borderBottom: `1px solid ${colors.border}`, paddingBottom: 12 }}>
              <div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#0284C7", background: "rgba(56, 189, 248, 0.1)", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>Detalhes da Turma</span>
                <p style={{ margin: "6px 0 0", fontSize: 17, fontWeight: 800, color: "#0F172A" }}>{detalhesTurma.turma?.tema || "Turma Selecionada"}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: colors.textMuted }}>Instrutor: {detalhesTurma.turma?.instrutor || "—"} | Cliente: {detalhesTurma.turma?.cliente || "—"}</p>
              </div>
              <button onClick={() => setDetalhesTurma(null)} style={{ border: "none", background: "#F1F5F9", width: 28, height: 28, borderRadius: "50%", fontSize: 14, cursor: "pointer", color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {detalhesTurma.carregando && <p style={{ fontSize: 13, color: colors.textSecondary, padding: "20px 0", textAlign: "center" }}>Carregando dados individuais de frequência...</p>}
            {detalhesTurma.erro && <p style={{ fontSize: 13, color: colors.dangerText, padding: "10px 0" }}>{detalhesTurma.erro}</p>}
            {!detalhesTurma.carregando && !detalhesTurma.erro && detalhesTurma.itens.length === 0 && (
              <p style={{ fontSize: 13, color: colors.textMuted, padding: "20px 0", textAlign: "center" }}>Sem registros individuais encontrados para esta turma.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {detalhesTurma.itens.map((pessoa, indice) => (
                <div key={indice} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", border: `1px solid ${colors.border}` }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{pessoa.treinando_nome || "Colaborador"}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: colors.textMuted }}>{pessoa.presentes || 0} presentes • {pessoa.ausentes || 0} ausentes</p>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, borderRadius: 8, padding: "4px 10px",
                    ...obterEstiloSeloPorTaxa(pessoa.frequencia_percentual)
                  }}>
                    {pessoa.frequencia_percentual || 0}%
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

function CartaoMetrica({ valor, rotulo, cor, porcentagem, icone }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${colors.border}`, borderRadius: 14, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.02)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: ".04em" }}>{rotulo}</p>
          <span style={{ fontSize: 16 }}>{icone}</span>
        </div>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#0F172A", letterSpacing: "-.02em" }}>{valor}</p>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: "#F1F5F9", marginTop: 14, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(Number(porcentagem || 0), 100)}%`, background: cor, borderRadius: 999 }} />
      </div>
    </div>
  );
}

const estiloRotuloCampo = { display: "grid", gap: 3, color: "#475569", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" };
const estiloEntrada = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "7px 10px", background: "#fff", color: "#0F172A", fontSize: 12, outline: "none", boxSizing: "border-box" };
const estiloBotaoSelo = { border: `1px solid ${colors.border}`, background: "#fff", color: "#0284C7", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, cursor: "pointer" };
const estiloCabecalhoTabela = { textAlign: "left", padding: "12px 14px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: colors.textSecondary, fontWeight: 700 };
const estiloCelulaTabela = { padding: "12px 14px", color: colors.textSecondary, fontSize: 12.5 };
