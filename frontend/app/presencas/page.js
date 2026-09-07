"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import PortalShell from "../../components/PortalShell";
import StatCard    from "../../components/StatCard";
import PageHero    from "../../components/PageHero";
import { apiFetch }         from "../../services/api";
import { formatDateBR }     from "../../lib/date";
import {
  colors,
  chart,
  estiloBadgeStatus,
  estiloBadgeClassificacao,
} from "../../lib/theme";

/* ═══════════════════════════════════════════════
   UTILITÁRIOS
═══════════════════════════════════════════════ */
function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}
function fmtDate(v) {
  return formatDateBR(v, "-");
}
function parseHoras(value) {
  if (value === null || value === undefined || value === "") return 0;
  const m = String(value).replace(",", ".").trim().match(/(\d+(\.\d+)?)/);
  return m ? Number(m[1]) || 0 : 0;
}

/* ═══════════════════════════════════════════════
   COR DE SAÚDE DA TURMA (borda esquerda do card)
═══════════════════════════════════════════════ */
function getBordaHealth(item) {
  const s = item.statusTurma;
  if (s === "Sem treinandos" || s === "Cancelada") return colors.danger;
  if (s === "Sem cronograma")   return colors.primary;
  if (s === "Planejada")        return "#6366f1";
  if (s === "Chamada pendente") return "#f59e0b";
  if (s === "Em andamento") {
    if (item.taxaPresenca >= 75) return colors.success;
    return "#f59e0b";
  }
  if (s === "Concluída") {
    const total = (item.presentes || 0) + (item.ausentes || 0) + (item.justificados || 0);
    if (total === 0) return colors.neutral;
    return item.taxaPresenca >= 75 ? colors.success : "#f59e0b";
  }
  return colors.neutral;
}

/* ═══════════════════════════════════════════════
   CONFIGURAÇÕES DE STATUS (pills do filtro)
═══════════════════════════════════════════════ */
const STATUS_CONFIGS = [
  { key: "todos",            label: "Todas",          cor: colors.neutral  },
  { key: "Sem treinandos",   label: "Sem treinandos", cor: colors.danger   },
  { key: "Sem cronograma",   label: "Sem cronograma", cor: colors.primary  },
  { key: "Planejada",        label: "Planejada",      cor: "#6366f1"       },
  { key: "Chamada pendente", label: "Ch. pendente",   cor: "#f59e0b"       },
  { key: "Em andamento",     label: "Em andamento",   cor: colors.success  },
  { key: "Concluída",        label: "Concluída",      cor: "#14b8a6"       },
  { key: "Cancelada",        label: "Cancelada",      cor: colors.neutral  },
];

/* ═══════════════════════════════════════════════
   CONFIGURAÇÃO DO BOTÃO DE AÇÃO POR STATUS
═══════════════════════════════════════════════ */
// Bugfix: todo botão de ação levava pro mesmo lugar (Visão geral da turma),
// não importa o que o rótulo prometesse. Pra "Importar treinandos" — a ação
// mais crítica, mostrada bem quando a turma não tem ninguém cadastrado —
// isso significava clicar, cair na aba errada, achar a aba "Pessoas" e ainda
// abrir manualmente a seção de import (que começa fechada). Agora cada ação
// já leva direto pro lugar certo.
function getActionConfig(statusTurma, usaCronograma, id) {
  if (statusTurma === "Sem treinandos")
    return { label: "Importar treinandos", variant: "alerta", href: `/turma/${id}/participantes?abrir_import=1` };
  if (usaCronograma && statusTurma === "Sem cronograma")
    return { label: "Gerir turma", variant: "alerta", href: `/turma/${id}` };
  if (statusTurma === "Planejada")
    return { label: "Gerir turma", variant: "alerta", href: `/turma/${id}` };
  if (statusTurma === "Cancelada")
    return { label: "Ver gestão", variant: "neutro", href: `/turma/${id}` };
  if (statusTurma === "Chamada pendente" || statusTurma === "Em andamento")
    return { label: usaCronograma ? "Gerir turma" : "Abrir chamada", variant: "primario", href: `/turma/${id}` };
  return { label: "Ver gestão", variant: "neutro", href: `/turma/${id}` };
}

/* ═══════════════════════════════════════════════
   SUB-COMPONENTES
═══════════════════════════════════════════════ */
function ProgressBar({ value, cor }) {
  const pct = Math.min(Math.max(Number(value || 0), 0), 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        flex: 1, height: 5,
        background: "#f1f5f9", borderRadius: 999, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: cor, borderRadius: 999,
        }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", minWidth: 30, textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}

function FreqBadge({ item }) {
  const total    = (item.presentes || 0) + (item.ausentes || 0) + (item.justificados || 0);
  const semDados = total === 0 && (item.pendentes || 0) === 0;
  const soPend   = total === 0 && (item.pendentes || 0) > 0;

  if (semDados) {
    return (
      <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>
        s/d
      </span>
    );
  }
  if (soPend) {
    return (
      <span style={{
        fontSize: 13, fontWeight: 700,
        color: "#d97706", background: "#fef3c7",
        borderRadius: 8, padding: "2px 8px",
      }}>
        pend.
      </span>
    );
  }
  const pct = item.taxaPresenca;
  const bg  = pct >= 75 ? colors.successLight : pct >= 50 ? "#fef3c7" : colors.dangerLight;
  const txt = pct >= 75 ? colors.successText  : pct >= 50 ? "#92400e" : colors.dangerText;
  return (
    <span style={{
      fontSize: 22, fontWeight: 800,
      color: txt, background: bg,
      borderRadius: 8, padding: "1px 10px",
      letterSpacing: "-.02em",
    }}>
      {pct}%
    </span>
  );
}

function CardActionBtn({ variant, label, onClick }) {
  const styles = {
    primario: {
      background: colors.accent,
      color: "#fff",
      border: 0,
      boxShadow: `0 4px 14px rgba(217,119,6,.30)`,
    },
    alerta: {
      background: colors.warningLight,
      color: colors.warning,
      border: `1px solid #fed7aa`,
      boxShadow: "none",
    },
    neutro: {
      background: "#f8fafc",
      color: "#475569",
      border: "1px solid #e2e8f0",
      boxShadow: "none",
    },
  };
  const base = {
    width: "100%",
    padding: "10px 0",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    textAlign: "center",
    marginTop: 4,
    transition: "opacity .15s",
    ...styles[variant] || styles.neutro,
  };
  return (
    <button style={base} onClick={onClick}>
      {label}
    </button>
  );
}

/* ═══════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════ */
export default function GestaoPresencasPage() {
  const [treinamentos, setTreinamentos] = useState([]);
  const [erro,         setErro]         = useState("");
  const [loading,      setLoading]      = useState(true);

  const [filtroStatus,  setFiltroStatus]  = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [busca,         setBusca]         = useState("");

  /* ── carregamento ── */
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const resposta = await apiFetch("/presenca-resumo");
        const itens    = Array.isArray(resposta?.itens) ? resposta.itens : [];

        setTreinamentos(
          itens.map((t) => ({
            ...t,
            treinandos:          Number(t.treinandos_previstos || 0),
            treinandos_confirmados: Number(t.treinandos_confirmados || 0),
            diasPlanejados:      Number(t.dias_planejados  || 0),
            baseEsperada:        Number(t.base_esperada   || 0),
            presentes:           Number(t.presentes        || 0),
            ausentes:            Number(t.ausentes         || 0),
            justificados:        Number(t.justificados     || 0),
            pendentes:           Number(t.pendentes        || 0),
            taxa:                Number(t.taxa_presenca    || 0),
            taxaPresenca:        Number(t.taxa_presenca    || 0),
            taxaExecucao:        Number(t.taxa_execucao    || 0),
            classificacao:       t.classificacao,
            statusTurma:         t.status_turma,
            usaCronograma:       !!t.usa_cronograma,
            origemFrequencia:    t.origem_frequencia,
          }))
        );
        setErro("");
      } catch (error) {
        setErro(error.message || "Erro ao carregar gestão de turmas.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* ── ordenação ── */
  const turmas = useMemo(() => {
    const ordem = {
      "Sem treinandos": 1, "Sem cronograma": 2, Planejada: 3,
      "Chamada pendente": 4, "Em andamento": 5, Concluída: 6, Cancelada: 7,
    };
    return [...treinamentos].sort((a, b) => {
      const diff = (ordem[a.statusTurma] || 99) - (ordem[b.statusTurma] || 99);
      return diff !== 0 ? diff : a.taxa - b.taxa;
    });
  }, [treinamentos]);

  /* ── contagens por status (da lista completa, não filtrada) ── */
  const statusCounts = useMemo(() => {
    const c = { todos: turmas.length };
    turmas.forEach((t) => { c[t.statusTurma] = (c[t.statusTurma] || 0) + 1; });
    return c;
  }, [turmas]);

  /* ── opções de cliente ── */
  const clientesOptions = useMemo(() => {
    const lista = [...new Set(turmas.map((t) => t.cliente).filter(Boolean))];
    return lista.sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
  }, [turmas]);

  /* ── lista filtrada ── */
  const turmasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return turmas.filter((item) => {
      const okStatus  = filtroStatus === "todos" || item.statusTurma === filtroStatus;
      const okCliente = filtroCliente === "todos" || String(item.cliente || "") === filtroCliente;
      const alvo = [item.tema, item.cliente, item.instrutor, item.supervisor, item.publico]
        .filter(Boolean).join(" ").toLowerCase();
      const okBusca = !termo || alvo.includes(termo);
      return okStatus && okCliente && okBusca;
    });
  }, [turmas, filtroStatus, filtroCliente, busca]);

  /* ── KPIs agregados (da lista filtrada) ── */
  const kpi = useMemo(() => {
    const turmasComDados = turmasFiltradas.filter(
      (t) => (t.presentes + t.ausentes + t.justificados) > 0
    );
    const totalGlobal = turmasComDados.reduce(
      (acc, t) => acc + t.presentes + t.ausentes + t.justificados, 0
    );
    const taxaMedia = turmasComDados.length > 0 && totalGlobal > 0
      ? Math.round(
          turmasComDados.reduce((acc, t) => acc + t.presentes, 0) / totalGlobal * 100
        )
      : null;

    return {
      total:        turmasFiltradas.length,
      treinandos:   turmasFiltradas.reduce((a, t) => a + t.treinandos, 0),
      taxaMedia,
      turmasComDados: turmasComDados.length,
      participacoes:  turmasFiltradas.reduce((a, t) => a + t.presentes, 0),
      horas:          turmasFiltradas.reduce((a, t) => a + calcularCHRealizada(t), 0),
    };
  }, [turmasFiltradas]);

  /* ── ações ── */
  function abrirTurma(href) {
    window.location.href = href;
  }

  function limparFiltros() {
    setFiltroStatus("todos");
    setFiltroCliente("todos");
    setBusca("");
  }

  /* ─────────────────────────────────────────
     FUNÇÕES DE NEGÓCIO (preservadas dos fixes)
  ───────────────────────────────────────── */
  function calcularCHRealizada(item) {
    const carga = parseHoras(item.carga_horaria);
    if (
      item.statusTurma === "Planejada"     ||
      item.statusTurma === "Cancelada"     ||
      item.statusTurma === "Sem treinandos" ||
      item.statusTurma === "Sem cronograma"
    ) return 0;

    const totalRealizado =
      Number(item.presentes   || 0) +
      Number(item.ausentes    || 0) +
      Number(item.justificados || 0);

    if (item.statusTurma === "Concluída") {
      return totalRealizado === 0 ? 0 : carga;
    }
    if (item.diasPlanejados > 0) {
      const base = Number(item.baseEsperada || 0);
      const prop = base > 0 ? Math.min(totalRealizado / base, 1) : 0;
      return Number((carga * prop).toFixed(1));
    }
    return 0;
  }

  function exportarRelatorio() {
    const dados = turmasFiltradas.map((item) => {
      const totalRealizado =
        Number(item.presentes || 0) + Number(item.ausentes || 0) + Number(item.justificados || 0);
      return {
        Turma:                     item.tema        || "-",
        Cliente:                   item.cliente     || "-",
        Instrutor:                 item.instrutor   || "-",
        Supervisor:                item.supervisor  || "-",
        Status:                    item.statusTurma || "-",
        Início:                    fmtDate(item.data_inicio || item.data),
        Fim:                       fmtDate(item.data_fim || item.data_inicio || item.data),
        "Treinandos previstos":    Number(item.treinandos             || 0),
        "Treinandos confirmados":  Number(item.treinandos_confirmados || 0),
        "Aulas planejadas":        Number(item.diasPlanejados         || 0),
        "Base esperada":           Number(item.baseEsperada           || 0),
        "Total realizado":         totalRealizado,
        Presentes:                 Number(item.presentes    || 0),
        Ausentes:                  Number(item.ausentes     || 0),
        Justificados:              Number(item.justificados || 0),
        Pendentes:                 Number(item.pendentes    || 0),
        "Taxa presença (%)":       Number(item.taxaPresenca  || 0),
        "Taxa execução (%)":       Number(item.taxaExecucao  || 0),
        "Origem frequência":       item.origemFrequencia    || "-",
        "Carga horária":           item.carga_horaria       || "0h",
        "CH realizada":            `${calcularCHRealizada(item)}h`,
      };
    });
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório Presença");
    XLSX.writeFile(wb, "relatorio_presenca.xlsx");
  }

  /* ══════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════ */
  return (
    <PortalShell>

      {/* ── Hero ── */}
      <div style={{ marginBottom: 20 }}>
        <PageHero
          eyebrow="Execução"
          title="Gestão de Turmas"
          subtitle="Acompanhamento consolidado de presença, execução e carga horária de todas as turmas."
        />
      </div>

      {loading ? (
        <div style={loadingBox}>Carregando gestão de turmas...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <>
          {/* ╔══════════════════════════════════════
              BARRA DE CONTROLES
          ══════════════════════════════════════╗ */}
          <div style={controlBar}>

            {/* Linha 1 — pills de status (clicáveis, com contagem) */}
            <div style={pillRow}>
              {STATUS_CONFIGS.map(({ key, label, cor }) => {
                const count   = statusCounts[key] ?? 0;
                const ativo   = filtroStatus === key;
                const visivel = key === "todos" || count > 0;
                if (!visivel) return null;
                return (
                  <button
                    key={key}
                    onClick={() => setFiltroStatus(key)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 12px",
                      borderRadius: 999,
                      border: `1.5px solid ${ativo ? cor : "#e2e8f0"}`,
                      background: ativo ? cor : "#fff",
                      color: ativo ? "#fff" : "#475569",
                      fontSize: 13,
                      fontWeight: ativo ? 800 : 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "all .15s",
                    }}
                  >
                    {label}
                    {key !== "todos" && (
                      <span style={{
                        background: ativo ? "rgba(255,255,255,.28)" : "#f1f5f9",
                        color: ativo ? "#fff" : "#64748b",
                        borderRadius: 999,
                        padding: "1px 7px",
                        fontSize: 11,
                        fontWeight: 700,
                        minWidth: 20,
                        textAlign: "center",
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Linha 2 — cliente, busca, ações */}
            <div style={controlRow2}>
              <select
                value={filtroCliente}
                onChange={(e) => setFiltroCliente(e.target.value)}
                style={selectInput}
              >
                <option value="todos">Todos os clientes</option>
                {clientesOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <div style={searchWrap}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round"
                  style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}>
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar turma, instrutor, público..."
                  style={searchInput}
                />
              </div>

              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                {(filtroStatus !== "todos" || filtroCliente !== "todos" || busca) && (
                  <button style={btnLimpar} onClick={limparFiltros}>
                    Limpar
                  </button>
                )}
                <button style={btnExportar} onClick={exportarRelatorio}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Exportar relatório
                </button>
              </div>
            </div>
          </div>

          {/* ╔══════════════════════════════════════
              KPI CARDS
          ══════════════════════════════════════╗ */}
          <div style={kpiGrid}>
            <StatCard
              title="Turmas"
              value={fmt(kpi.total)}
              subtitle={filtroStatus !== "todos" ? filtroStatus : "no filtro atual"}
              accent={chart.blue}
            />
            <StatCard
              title="Treinandos"
              value={fmt(kpi.treinandos)}
              subtitle="previstos"
              accent={chart.cyan}
            />
            <StatCard
              title={kpi.taxaMedia !== null ? "Freq. média" : "Participações"}
              value={kpi.taxaMedia !== null ? `${kpi.taxaMedia}%` : fmt(kpi.participacoes)}
              subtitle={
                kpi.taxaMedia !== null
                  ? `${kpi.turmasComDados} turma${kpi.turmasComDados !== 1 ? "s" : ""} com dados`
                  : "presenças confirmadas"
              }
              accent={colors.success}
            />
            <StatCard
              title="CH realizada"
              value={`${fmt(kpi.horas)}h`}
              subtitle="carga acumulada"
              accent={chart.purple}
            />
          </div>

          {/* ╔══════════════════════════════════════
              PAINEL DAS TURMAS
          ══════════════════════════════════════╗ */}
          <div style={painelHeader}>
            <div>
              <span style={painelTitulo}>Painel das turmas</span>
              <span style={painelCount}>
                {turmasFiltradas.length} turma{turmasFiltradas.length !== 1 ? "s" : ""}
                {turmasFiltradas.length < turmas.length && ` · ${turmas.length} no total`}
              </span>
            </div>
          </div>

          {turmasFiltradas.length === 0 ? (
            <div style={emptyState}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
              <div style={{ fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                Nenhuma turma encontrada
              </div>
              <div style={{ color: "#94a3b8", fontSize: 14 }}>
                Ajuste os filtros acima ou{" "}
                <button
                  onClick={limparFiltros}
                  style={{ background: "none", border: "none", color: colors.accent,
                    fontWeight: 700, cursor: "pointer", fontSize: 14, padding: 0 }}
                >
                  limpe a seleção
                </button>
                .
              </div>
            </div>
          ) : (
            <div style={cardsGrid}>
              {turmasFiltradas.map((item) => {
                const action       = getActionConfig(item.statusTurma, item.usaCronograma, item.id);
                const bordaColor   = getBordaHealth(item);
                const totalReal    = item.presentes + item.ausentes + item.justificados;
                const temExecucao  = item.baseEsperada > 0;

                return (
                  <div key={item.id} style={{ ...turmaCard, borderLeft: `4px solid ${bordaColor}` }}>

                    {/* Topo: status badge + freq badge */}
                    <div style={cardTop}>
                      <span style={estiloBadgeStatus(item.statusTurma)}>
                        {item.statusTurma}
                      </span>
                      <FreqBadge item={item} />
                    </div>

                    {/* Título */}
                    <div style={cardTitulo}>{item.tema || "Turma"}</div>

                    {/* Meta: cliente · instrutor */}
                    <div style={cardMeta}>
                      <span style={{ fontWeight: 600, color: "#334155" }}>
                        {item.cliente || "—"}
                      </span>
                      {item.instrutor && (
                        <span style={{ color: "#94a3b8" }}>
                          {" · "}{item.instrutor}
                        </span>
                      )}
                    </div>

                    {/* Barra de execução */}
                    {temExecucao && (
                      <div style={{ marginTop: 2 }}>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>
                          EXECUÇÃO
                        </div>
                        <ProgressBar value={item.taxaExecucao} cor={bordaColor} />
                      </div>
                    )}

                    {/* Linha de dados de frequência */}
                    <div style={dataRow}>
                      <DataChip label="previstos"   value={fmt(item.treinandos)}   />
                      {item.diasPlanejados > 0 && (
                        <DataChip label="aulas"     value={fmt(item.diasPlanejados)} />
                      )}
                      {totalReal > 0 && (
                        <>
                          <DataChip label="pres."   value={fmt(item.presentes)}    cor="#166534" />
                          <DataChip label="aus."    value={fmt(item.ausentes)}     cor="#b91c1c" />
                          {item.justificados > 0 && (
                            <DataChip label="just." value={fmt(item.justificados)} cor="#92400e" />
                          )}
                        </>
                      )}
                      {item.pendentes > 0 && (
                        <DataChip label="pend." value={fmt(item.pendentes)} cor="#d97706" />
                      )}
                    </div>

                    {/* Linha de período e carga */}
                    <div style={periodoRow}>
                      <span>
                        {fmtDate(item.data_inicio || item.data)}
                        {" → "}
                        {fmtDate(item.data_fim || item.data_inicio || item.data)}
                      </span>
                      {item.carga_horaria && (
                        <span style={{ fontWeight: 700, color: "#334155" }}>
                          {item.carga_horaria}
                        </span>
                      )}
                    </div>

                    {/* Supervisor + origem (linha discreta) */}
                    {(item.supervisor || item.origemFrequencia === "cronograma") && (
                      <div style={metaDiscreta}>
                        {item.supervisor && (
                          <span>Supervisor: {item.supervisor}</span>
                        )}
                        {item.origemFrequencia === "cronograma" && (
                          <span style={{
                            color: colors.primary,
                            background: colors.primaryLight,
                            borderRadius: 4,
                            padding: "1px 6px",
                            fontSize: 11,
                            fontWeight: 700,
                          }}>
                            cronograma
                          </span>
                        )}
                      </div>
                    )}

                    {/* Botão de ação */}
                    <CardActionBtn
                      variant={action.variant}
                      label={action.label}
                      onClick={() => abrirTurma(action.href)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </PortalShell>
  );
}

/* ─────────── mini chip de dado ─────────── */
function DataChip({ label, value, cor }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <span style={{ fontSize: 14, fontWeight: 800, color: cor || "#334155", lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
        {label}
      </span>
    </span>
  );
}

/* ═══════════════════════════════════════════════
   ESTILOS
═══════════════════════════════════════════════ */
const controlBar = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: "14px 16px",
  marginBottom: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const pillRow = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  alignItems: "center",
};

const controlRow2 = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const selectInput = {
  height: 38,
  padding: "0 10px",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#334155",
  fontSize: 14,
  cursor: "pointer",
  minWidth: 180,
};

const searchWrap = {
  position: "relative",
  flex: 1,
  minWidth: 180,
};

const searchInput = {
  width: "100%",
  boxSizing: "border-box",
  height: 38,
  paddingLeft: 34,
  paddingRight: 12,
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#334155",
  fontSize: 14,
  outline: "none",
};

const btnLimpar = {
  height: 38,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#64748b",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnExportar = {
  height: 38,
  padding: "0 16px",
  borderRadius: 10,
  border: 0,
  background: colors.navy,
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  whiteSpace: "nowrap",
};

const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14,
  marginBottom: 20,
};

const painelHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  marginBottom: 14,
  gap: 12,
};

const painelTitulo = {
  fontSize: 18,
  fontWeight: 800,
  color: "#0f172a",
  marginRight: 10,
};

const painelCount = {
  fontSize: 14,
  color: "#94a3b8",
  fontWeight: 500,
};

const cardsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
  gap: 14,
};

const turmaCard = {
  background: "#fff",
  border: "1px solid #e9eef4",
  borderRadius: 16,
  padding: "16px 16px 14px",
  boxShadow: "0 2px 8px rgba(15,23,42,.04)",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const cardTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const cardTitulo = {
  fontSize: 17,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.25,
};

const cardMeta = {
  fontSize: 13,
  color: "#64748b",
  lineHeight: 1.4,
};

const dataRow = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  padding: "6px 0",
  borderTop: "1px solid #f1f5f9",
  borderBottom: "1px solid #f1f5f9",
};

const periodoRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: 13,
  color: "#64748b",
};

const metaDiscreta = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: "#94a3b8",
  flexWrap: "wrap",
};

const emptyState = {
  textAlign: "center",
  padding: "48px 24px",
  background: "#fff",
  border: "1px dashed #e2e8f0",
  borderRadius: 16,
};

const loadingBox = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 18,
  color: "#334155",
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 16,
  padding: 18,
  color: "#b91c1c",
  fontWeight: 700,
};
