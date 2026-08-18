"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell  from "../../components/PortalShell";
import PageHero     from "../../components/PageHero";
import StatCard     from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { colors, chart } from "../../lib/theme";

/* ── utilitários ── */
function fmt(n) { return new Intl.NumberFormat("pt-BR").format(Number(n || 0)); }

function normStatus(v) { return String(v || "").toLowerCase().trim(); }

function corSaude(pct) {
  if (pct === null) return "#94a3b8";
  if (pct >= 85)   return colors.success;
  if (pct >= 75)   return "#f59e0b";
  return colors.danger;
}

/* ── saúde da operação (versão corrigida dos campos) ── */
function saudeDoCliente(nomeCliente, resumoPresenca, necessidades) {
  const turmas    = resumoPresenca.filter((t) => t.cliente === nomeCliente);
  const ativas    = turmas.filter((t) => t.status_turma === "Em andamento").length;

  // Sprint 2 FIX: campos corrigidos (taxa_presenca_pessoas e total_realizado não existem)
  const comDados  = turmas.filter((t) => {
    const lançado = Number(t.presentes || 0) + Number(t.ausentes || 0) + Number(t.justificados || 0);
    return lançado > 0 && Number(t.taxa_presenca || 0) > 0;
  });
  const presencaMedia = comDados.length
    ? Math.round(comDados.reduce((acc, t) => acc + Number(t.taxa_presenca || 0), 0) / comDados.length)
    : null;

  const nAbertos = necessidades.filter(
    (n) => n.cliente === nomeCliente &&
      (n.status_calculado === "aberta" || n.status_calculado === "atrasada")
  ).length;

  return { ativas, totalTurmas: turmas.length, presencaMedia, necessidadesAbertas: nAbertos };
}

/* ═══════════════════════════════════════════════
   MODAL CRIAR / EDITAR
═══════════════════════════════════════════════ */
function emptyForm() {
  return { nome: "", segmento: "", status: "ativo", gestor: "", descricao: "" };
}

function ModalCliente({ modo, cliente, onSalvar, onFechar }) {
  const [form,     setForm]     = useState(() =>
    modo === "editar" && cliente ? { ...emptyForm(), ...cliente, gestor: cliente.gestor || "", descricao: cliente.descricao || "" } : emptyForm()
  );
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");

  function campo(k) { return (e) => setForm((p) => ({ ...p, [k]: e.target.value })); }

  async function salvar() {
    try {
      setSalvando(true); setErro("");
      if (!form.nome.trim()) throw new Error("Nome da operação é obrigatório.");
      const payload = { nome: form.nome.trim(), segmento: form.segmento || null, status: form.status, gestor: form.gestor || null, descricao: form.descricao || null };
      if (modo === "editar") {
        await apiFetch(`/clientes/${cliente.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/clientes", { method: "POST", body: JSON.stringify(payload) });
      }
      onSalvar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar operação.");
    } finally { setSalvando(false); }
  }

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div style={modal}>
        <div style={modalHeader}>
          <div>
            <div style={modalTitulo}>{modo === "criar" ? "Nova operação" : `Editar — ${cliente?.nome}`}</div>
            <div style={modalSub}>Operações são os clientes/contratos acompanhados pelo T&D.</div>
          </div>
          <button style={btnFechar} onClick={onFechar}>✕</button>
        </div>
        {erro && <div style={errBox}>{erro}</div>}
        <div style={mGrid}>
          <MField label="Nome da operação *" full>
            <input value={form.nome} onChange={campo("nome")} style={mInput} placeholder="Ex.: Mercantil, Dasa, Cemig" />
          </MField>
          <MField label="Status">
            <select value={form.status} onChange={campo("status")} style={mInput}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </MField>
          <MField label="Gestor / referência">
            <input value={form.gestor} onChange={campo("gestor")} style={mInput} placeholder="Responsável pela operação" />
          </MField>
          <MField label="Observações" full>
            <textarea value={form.descricao} onChange={campo("descricao")} rows={3}
              style={{ ...mInput, height: "auto", padding: "8px 10px", resize: "vertical" }} placeholder="Contexto resumido da operação" />
          </MField>
        </div>
        <div style={modalFooter}>
          <button style={btnCancelar} onClick={onFechar}>Cancelar</button>
          <button style={btnSalvar} onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : modo === "criar" ? "Cadastrar operação" : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MField({ label, children, full = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: full ? "1 / -1" : "auto" }}>
      <span style={mLabel}>{label}</span>{children}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CARD DE OPERAÇÃO
═══════════════════════════════════════════════ */
function ClienteCard({ item, saude, onEditar, onExcluir }) {
  const ativo    = normStatus(item.status) === "ativo";
  const cor      = corSaude(saude.presencaMedia);
  const temDados = saude.totalTurmas > 0;

  return (
    <div style={{ ...clienteCard, borderLeft: `4px solid ${ativo ? cor : "#e2e8f0"}` }}>
      {/* Cabeçalho */}
      <div style={cardHead}>
        <div>
          <div style={cardNome}>{item.nome}</div>
          {(item.gestor || item.supervisor) && <div style={cardGestor}>{item.gestor || item.supervisor}</div>}
        </div>
        <span style={{
          ...statusBadge,
          background: ativo ? colors.successLight : colors.dangerLight,
          color:      ativo ? colors.successText  : colors.dangerText,
        }}>{ativo ? "Ativo" : "Inativo"}</span>
      </div>

      {/* Saúde */}
      <div style={saudeRow}>
        <SaudeChip label="turmas"    value={saude.totalTurmas} sub={`${saude.ativas} ativas`} />
        <SaudeChip
          label="freq. média"
          value={saude.presencaMedia !== null ? `${saude.presencaMedia}%` : "—"}
          cor={saude.presencaMedia !== null ? cor : "#94a3b8"}
        />
        {saude.necessidadesAbertas > 0 && (
          <SaudeChip label="necessidades" value={saude.necessidadesAbertas} cor={colors.warning} sub="em aberto" />
        )}
      </div>

      {/* Barra de frequência */}
      {temDados && saude.presencaMedia !== null && (
        <div style={{ marginTop: 2 }}>
          <div style={{ height: 5, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${saude.presencaMedia}%`, background: cor, borderRadius: 999 }} />
          </div>
        </div>
      )}

      {/* Observações */}
      {item.observacoes && (
        <p style={cardObs}>{item.observacoes.length > 100 ? item.observacoes.slice(0, 100) + "…" : item.observacoes}</p>
      )}

      {/* Ações */}
      <div style={cardAcoes}>
        <button style={btnEditar} onClick={onEditar}>Editar</button>
        <button style={btnExcluir} onClick={onExcluir}>Excluir</button>
      </div>
    </div>
  );
}

function SaudeChip({ label, value, sub, cor }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 16, fontWeight: 800, color: cor || "#334155", lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>{label}</span>
      {sub && <span style={{ fontSize: 10, color: "#cbd5e1" }}>{sub}</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════ */
export default function ClientesPage() {
  const [clientes,       setClientes]       = useState([]);
  const [resumoPresenca, setResumoPresenca] = useState([]);
  const [necessidades,   setNecessidades]   = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [erro,           setErro]           = useState("");
  const [busca,          setBusca]          = useState("");
  const [filtroStatus,   setFiltroStatus]   = useState("todos");
  const [modal,          setModal]          = useState(null);
  const [excluindo,      setExcluindo]      = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      setLoading(true); setErro("");
      const [data, resumoData, necData] = await Promise.all([
        apiFetch("/clientes").catch(() => []),
        apiFetch("/presenca-resumo").catch(() => null),
        apiFetch("/necessidades").catch(() => null),
      ]);
      setClientes(Array.isArray(data) ? data : []);
      setResumoPresenca(Array.isArray(resumoData?.itens) ? resumoData.itens : []);
      setNecessidades(Array.isArray(necData?.itens) ? necData.itens : []);
    } catch (e) {
      setErro(e.message || "Erro ao carregar operações.");
    } finally { setLoading(false); }
  }

  async function excluir(id) {
    try {
      await apiFetch(`/clientes/${id}`, { method: "DELETE" });
      setClientes((p) => p.filter((c) => c.id !== id));
      setExcluindo(null);
    } catch (e) { setErro(e.message || "Erro ao excluir."); }
  }

  const kpis = useMemo(() => {
    const ativos  = clientes.filter((c) => normStatus(c.status) === "ativo").length;
    return { total: clientes.length, ativos, inativos: clientes.length - ativos,
             comGestor: clientes.filter((c) => c.gestor).length };
  }, [clientes]);

  const listaFiltrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      const okBusca  = !t || [c.nome, c.supervisor, c.observacoes].join(" ").toLowerCase().includes(t);
      const okStatus = filtroStatus === "todos" || normStatus(c.status) === filtroStatus;
      return okBusca && okStatus;
    });
  }, [clientes, busca, filtroStatus]);

  return (
    <PortalShell>
      <div style={{ marginBottom: 20 }}>
        <PageHero eyebrow="Operações T&D" title="Carteira de Clientes"
          subtitle="Visão consolidada das operações acompanhadas pelo setor, com saúde de frequência e necessidades em aberto." />
      </div>

      {erro && <div style={errorBox}>{erro}</div>}

      {/* KPIs */}
      <div style={kpiGrid}>
        <StatCard title="Operações"     value={fmt(kpis.total)}      subtitle="cadastradas"        accent={chart.blue}    />
        <StatCard title="Ativas"        value={fmt(kpis.ativos)}     subtitle="em acompanhamento"  accent={colors.success} />
        <StatCard title="Inativas"      value={fmt(kpis.inativos)}   subtitle="sem atividade"      accent={kpis.inativos > 0 ? colors.danger : colors.neutral} />
        <StatCard title="Com gestor"    value={fmt(kpis.comGestor)}  subtitle="referência cadastrada" accent={chart.purple}  />
      </div>

      {/* Filtros + ação */}
      <div style={controlBar}>
        <div style={{ display: "flex", gap: 6 }}>
          {["todos","ativo","inativo"].map((k) => {
            const ativo = filtroStatus === k;
            return (
              <button key={k} onClick={() => setFiltroStatus(k)} style={{
                ...pillBtn,
                background: ativo ? colors.accent : "#fff",
                color:      ativo ? "#fff" : "#475569",
                border:     `1.5px solid ${ativo ? colors.accent : "#e2e8f0"}`,
                fontWeight: ativo ? 800 : 600,
              }}>
                {k === "todos" ? "Todas" : k === "ativo" ? "Ativas" : "Inativas"}
              </button>
            );
          })}
        </div>
        <div style={{ position: "relative", flex: 1, maxWidth: 300 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar operação ou gestor…"
            style={{ ...searchInput, paddingLeft: 32 }} />
        </div>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>{listaFiltrada.length} de {clientes.length}</span>
        <button style={btnNovo} onClick={() => setModal({ modo: "criar" })}>+ Nova operação</button>
      </div>

      {/* Grid de cards */}
      {loading ? (
        <div style={loadingBox}>Carregando operações…</div>
      ) : listaFiltrada.length === 0 ? (
        <div style={emptyState}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🏢</div>
          <div style={{ fontWeight: 700, color: "#334155" }}>
            {busca || filtroStatus !== "todos" ? "Nenhuma operação encontrada para os filtros." : "Nenhuma operação cadastrada."}
          </div>
        </div>
      ) : (
        <div style={cardsGrid}>
          {listaFiltrada.map((c) => {
            const saude = saudeDoCliente(c.nome, resumoPresenca, necessidades);
            return (
              <ClienteCard
                key={c.id} item={c} saude={saude}
                onEditar={() => setModal({ modo: "editar", cliente: c })}
                onExcluir={() => {
                  if (excluindo === c.id) { excluir(c.id); }
                  else setExcluindo(c.id);
                }}
              />
            );
          })}
        </div>
      )}

      {/* Confirmação exclusão */}
      {excluindo && (
        <div style={confirmBanner}>
          <span style={{ fontSize: 13, color: "#334155", fontWeight: 600 }}>
            Confirma exclusão de "{clientes.find((c) => c.id === excluindo)?.nome}"?
          </span>
          <button style={{ ...btnExcluir, padding: "6px 14px" }} onClick={() => excluir(excluindo)}>Excluir</button>
          <button style={{ ...btnEditar, padding: "6px 12px" }} onClick={() => setExcluindo(null)}>Cancelar</button>
        </div>
      )}

      {modal && (
        <ModalCliente modo={modal.modo} cliente={modal.cliente}
          onSalvar={() => { setModal(null); carregar(); }}
          onFechar={() => setModal(null)} />
      )}
    </PortalShell>
  );
}

/* ── Estilos ── */
const errorBox  = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14 };
const loadingBox = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 16, color: "#64748b", fontSize: 13 };
const emptyState = { textAlign: "center", padding: "40px 16px", border: "1px dashed #e2e8f0", borderRadius: 14, background: "#fafafa" };
const kpiGrid   = { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 14 };
const controlBar = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: "12px 14px", marginBottom: 14 };
const pillBtn   = { padding: "5px 14px", borderRadius: 999, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" };
const searchInput = { height: 36, width: "100%", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 13, color: "#334155", outline: "none", paddingRight: 10, boxSizing: "border-box" };
const btnNovo   = { height: 36, padding: "0 16px", borderRadius: 10, border: 0, background: colors.accent, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", marginLeft: "auto", boxShadow: `0 4px 12px rgba(255,107,74,.25)` };
const cardsGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 };
const clienteCard = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 };
const cardHead  = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 };
const cardNome  = { fontSize: 16, fontWeight: 800, color: "#0f172a" };
const cardGestor = { fontSize: 12, color: "#64748b", marginTop: 2 };
const statusBadge = { borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 800, flexShrink: 0 };
const saudeRow  = { display: "flex", gap: 18, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid #f1f5f9" };
const cardObs   = { margin: 0, fontSize: 12, color: "#94a3b8", fontStyle: "italic" };
const cardAcoes = { display: "flex", gap: 6, marginTop: 2 };
const btnEditar = { background: "#dbeafe", color: "#1d4ed8", border: 0, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const btnExcluir = { background: colors.dangerLight, color: colors.dangerText, border: 0, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 };
const confirmBanner = { display: "flex", alignItems: "center", gap: 10, background: colors.warningLight, border: `1px solid #fed7aa`, borderRadius: 12, padding: "10px 14px", marginTop: 8, flexWrap: "wrap" };
const overlay   = { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 };
const modal     = { background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" };
const modalHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 };
const modalTitulo = { fontSize: 18, fontWeight: 800, color: "#0f172a" };
const modalSub  = { fontSize: 13, color: "#64748b", marginTop: 3 };
const btnFechar = { background: "#f1f5f9", border: 0, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 14, color: "#64748b", fontWeight: 700 };
const mGrid     = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 };
const modalFooter = { display: "flex", gap: 10, justifyContent: "flex-end" };
const mLabel    = { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" };
const mInput    = { height: 38, borderRadius: 10, border: "1px solid #e2e8f0", padding: "0 10px", fontSize: 13, color: "#334155", outline: "none", width: "100%", boxSizing: "border-box" };
const errBox    = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14 };
const btnSalvar = { background: colors.accent, color: "#fff", border: 0, borderRadius: 10, padding: "10px 22px", cursor: "pointer", fontWeight: 800, fontSize: 14 };
const btnCancelar = { background: "#f8fafc", color: "#64748b", border: "1px solid #e9eef4", borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontWeight: 600, fontSize: 14 };
