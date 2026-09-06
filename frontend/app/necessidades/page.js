"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { formatDateBR } from "../../lib/date";
import { colors, chart } from "../../lib/theme";

/* ─── configs de status ─────────────────────────── */
const STATUS_CFG = {
  aberta:         { bg: "#e0f2fe", cor: "#0369a1",         label: "Aberta"          },
  em_atendimento: { bg: colors.warningLight, cor: colors.warningText, label: "Em atendimento" },
  atendida:       { bg: colors.successLight, cor: colors.successText, label: "Atendida"       },
  atrasada:       { bg: colors.dangerLight,  cor: colors.dangerText,  label: "Atrasada"       },
  cancelada:      { bg: "#f1f5f9",           cor: "#94a3b8",           label: "Cancelada"      },
};

const PRIORIDADE_CFG = {
  alta:  { bg: "#fee2e2", cor: "#b91c1c", label: "Alta"  },
  media: { bg: "#fef3c7", cor: "#92400e", label: "Média" },
  baixa: { bg: "#f0fdf4", cor: "#166534", label: "Baixa" },
};

function fmt(n) { return new Intl.NumberFormat("pt-BR").format(Number(n || 0)); }
function fmtDate(v) { return formatDateBR(v, "-"); }

function diasRestantes(prazo) {
  if (!prazo) return null;
  const hoje = new Date();
  const p    = new Date(prazo);
  return Math.round((p - hoje) / 86400000);
}

function urgenciaBadge(prazo, status) {
  if (status === "atendida" || status === "cancelada") return null;
  const dias = diasRestantes(prazo);
  if (dias === null) return null;
  if (dias < 0)  return { label: `${Math.abs(dias)}d atrasada`, bg: colors.dangerLight,  cor: colors.dangerText  };
  if (dias <= 7) return { label: `${dias}d restantes`,          bg: colors.warningLight,  cor: colors.warningText  };
  if (dias <= 30) return { label: `${dias}d para prazo`,        bg: "#e0f2fe",            cor: "#0369a1"           };
  return null;
}

/* ─── formulário vazio ─────────────────────────── */
function emptyForm() {
  return { cliente:"", tema:"", horas_necessarias:"", prazo:"", prioridade:"media", origem:"", observacoes:"" };
}

/* ─── card de necessidade ─────────────────────── */
function NecessidadeCard({ item, onEditar, onCancelar }) {
  const sCfg   = STATUS_CFG[item.status_calculado]    || STATUS_CFG.aberta;
  const pCfg   = PRIORIDADE_CFG[item.prioridade]      || PRIORIDADE_CFG.media;
  const urgencia = urgenciaBadge(item.prazo, item.status_calculado);
  const pct    = item.horas_necessarias > 0
    ? Math.min(Math.round((item.horas_atendidas / item.horas_necessarias) * 100), 100) : 0;
  const podeAcao = item.status_calculado !== "cancelada" && item.status_calculado !== "atendida";

  return (
    <div style={{ ...necCard, borderLeft: `4px solid ${sCfg.cor}` }}>
      {/* Linha 1: tema + badges */}
      <div style={cardHead}>
        <div style={cardTema}>{item.tema}</div>
        <div style={{ display:"flex", gap:6, flexShrink:0, flexWrap:"wrap" }}>
          <span style={{ ...badge, background: sCfg.bg,  color: sCfg.cor  }}>{sCfg.label}</span>
          <span style={{ ...badge, background: pCfg.bg,  color: pCfg.cor  }}>{pCfg.label}</span>
          {urgencia && <span style={{ ...badge, background: urgencia.bg, color: urgencia.cor }}>{urgencia.label}</span>}
        </div>
      </div>

      {/* Linha 2: meta */}
      <div style={cardMeta}>
        <span style={{ fontWeight:700, color:"#334155" }}>{item.cliente}</span>
        {item.prazo && <span>· prazo {fmtDate(item.prazo)}</span>}
        {item.turmas_vinculadas > 0 && <span>· {item.turmas_vinculadas} turma(s)</span>}
        {item.origem && <span>· {item.origem}</span>}
      </div>

      {/* Progresso de horas */}
      {item.horas_necessarias > 0 && (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#94a3b8", marginBottom:4 }}>
            <span>{item.horas_atendidas}h de {item.horas_necessarias}h</span>
            <span style={{ fontWeight:700 }}>{pct}%</span>
          </div>
          <div style={{ height:6, borderRadius:999, background:"#f1f5f9", overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${pct}%`, background: pct >= 100 ? colors.success : colors.primary, borderRadius:999 }} />
          </div>
        </div>
      )}

      {/* Observações */}
      {item.observacoes && (
        <p style={{ margin:0, fontSize:12, color:"#94a3b8", fontStyle:"italic" }}>
          {item.observacoes.length > 120 ? item.observacoes.slice(0,120) + "…" : item.observacoes}
        </p>
      )}

      {/* Ações */}
      {podeAcao && (
        <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:4 }}>
          <button style={btnEdit}   onClick={() => onEditar(item)}>Editar</button>
          <a href="/treinamentos/novo" style={btnCriarTurma}>+ Criar turma</a>
          <button style={btnCancel} onClick={() => onCancelar(item.id)}>Cancelar necessidade</button>
        </div>
      )}
    </div>
  );
}

/* ─── modal criar / editar ─────────────────────── */
function ModalNecessidade({ modo, necessidade, onSalvar, onFechar }) {
  const [form, setForm] = useState(() =>
    modo === "editar" && necessidade
      ? { ...emptyForm(), ...necessidade,
          horas_necessarias: String(necessidade.horas_necessarias ?? ""),
          prazo: necessidade.prazo ? String(necessidade.prazo).slice(0,10) : "" }
      : emptyForm()
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function campo(k) { return (e) => setForm((p) => ({ ...p, [k]: e.target.value })); }

  async function salvar() {
    try {
      setSalvando(true); setErro("");
      if (!form.cliente.trim() || !form.tema.trim())
        throw new Error("Cliente e tema são obrigatórios.");
      const payload = {
        cliente: form.cliente.trim(), tema: form.tema.trim(),
        horas_necessarias: Number(form.horas_necessarias) || 0,
        prazo: form.prazo || null, prioridade: form.prioridade,
        origem: form.origem.trim() || null,
        observacoes: form.observacoes.trim() || null,
      };
      if (modo === "editar") {
        await apiFetch(`/necessidades/${necessidade.id}`, { method:"PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/necessidades", { method:"POST", body: JSON.stringify(payload) });
      }
      onSalvar();
    } catch (e) { setErro(e.message || "Erro ao salvar."); }
    finally { setSalvando(false); }
  }

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div style={modal}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:"#0f172a" }}>
              {modo === "criar" ? "Registrar necessidade" : "Editar necessidade"}
            </div>
            <div style={{ fontSize:13, color:"#64748b", marginTop:3 }}>
              Ponto de partida do ciclo ISO 10015.
            </div>
          </div>
          <button style={btnFecharStyle} onClick={onFechar}>✕</button>
        </div>
        {erro && <div style={errBox}>{erro}</div>}
        <div style={mGrid}>
          <MF label="Cliente *"><input value={form.cliente} onChange={campo("cliente")} style={mInput} placeholder="Operação" /></MF>
          <MF label="Tema *" full><input value={form.tema} onChange={campo("tema")} style={mInput} placeholder="Descreva a necessidade" /></MF>
          <MF label="Horas necessárias"><input type="number" value={form.horas_necessarias} onChange={campo("horas_necessarias")} style={mInput} placeholder="0" /></MF>
          <MF label="Prazo"><input type="date" value={form.prazo} onChange={campo("prazo")} style={mInput} /></MF>
          <MF label="Prioridade">
            <select value={form.prioridade} onChange={campo("prioridade")} style={mInput}>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </MF>
          <MF label="Origem"><input value={form.origem} onChange={campo("origem")} style={mInput} placeholder="Pedido de quem?" /></MF>
          <MF label="Observações" full>
            <textarea value={form.observacoes} onChange={campo("observacoes")} rows={3}
              style={{ ...mInput, height:"auto", padding:"8px 10px", resize:"vertical" }} placeholder="Contexto adicional" />
          </MF>
        </div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button style={btnCancelarStyle} onClick={onFechar}>Cancelar</button>
          <button style={btnSalvarStyle}   onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : modo === "criar" ? "Registrar" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MF({ label, children, full=false }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5, gridColumn: full ? "1 / -1" : "auto" }}>
      <span style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:".04em" }}>{label}</span>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════ */
export default function NecessidadesPage() {
  const [itens,        setItens]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [erro,         setErro]         = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca,        setBusca]        = useState("");
  const [modal,        setModal]        = useState(null);

  useEffect(() => { carregar(); }, [filtroStatus]);

  async function carregar() {
    try {
      setLoading(true); setErro("");
      const params = new URLSearchParams();
      if (filtroStatus) params.set("status", filtroStatus);
      const r = await apiFetch(`/necessidades?${params}`);
      setItens(Array.isArray(r?.itens) ? r.itens : []);
    } catch (e) { setErro(e.message || "Erro ao carregar."); }
    finally { setLoading(false); }
  }

  async function cancelar(id) {
    if (!window.confirm("Cancelar esta necessidade?")) return;
    try {
      await apiFetch(`/necessidades/${id}`, { method:"PUT", body: JSON.stringify({ status:"cancelada" }) });
      await carregar();
    } catch (e) { setErro(e.message || "Erro ao cancelar."); }
  }

  const resumo = useMemo(() => ({
    total:         itens.length,
    abertas:       itens.filter((i) => i.status_calculado === "aberta").length,
    emAtendimento: itens.filter((i) => i.status_calculado === "em_atendimento").length,
    atrasadas:     itens.filter((i) => i.status_calculado === "atrasada").length,
    atendidas:     itens.filter((i) => i.status_calculado === "atendida").length,
  }), [itens]);

  const listaFiltrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return itens;
    return itens.filter((i) => [i.tema, i.cliente, i.origem, i.observacoes].join(" ").toLowerCase().includes(t));
  }, [itens, busca]);

  const STATUS_PILLS = [
    { key:"",               label:`Todas (${resumo.total})`                },
    { key:"aberta",         label:`Abertas (${resumo.abertas})`            },
    { key:"em_atendimento", label:`Em atend. (${resumo.emAtendimento})`    },
    { key:"atrasada",       label:`Atrasadas (${resumo.atrasadas})`        },
    { key:"atendida",       label:`Atendidas (${resumo.atendidas})`        },
  ];

  return (
    <PortalShell>
      <div style={{ marginBottom:20 }}>
        <PageHero eyebrow="ISO 10015 · Etapa 1" title="Necessidades de Treinamento"
          subtitle="Ponto de partida do ciclo: o que a operação precisa antes de qualquer turma existir." />
      </div>

      {erro && <div style={errBox}>{erro}</div>}

      {/* KPIs */}
      <div style={kpiGrid}>
        <StatCard title="Total"         value={fmt(resumo.total)}         accent={chart.blue}    />
        <StatCard title="Abertas"       value={fmt(resumo.abertas)}       accent="#0369a1"        />
        <StatCard title="Em atendimento"value={fmt(resumo.emAtendimento)} accent={colors.warning} />
        <StatCard title="Atrasadas"     value={fmt(resumo.atrasadas)}     accent={resumo.atrasadas > 0 ? colors.danger : colors.neutral} />
        <StatCard title="Atendidas"     value={fmt(resumo.atendidas)}     accent={colors.success} />
      </div>

      {/* Barra de controle */}
      <div style={controlBar}>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {STATUS_PILLS.map(({ key, label }) => {
            const ativo = filtroStatus === key;
            const cfg   = STATUS_CFG[key] || { cor: "#64748b", bg: "#f1f5f9" };
            return (
              <button key={key} onClick={() => setFiltroStatus(key)} style={{
                padding:"5px 13px", borderRadius:999, cursor:"pointer", fontSize:12, whiteSpace:"nowrap", fontWeight: ativo ? 800 : 600,
                background: ativo ? cfg.cor : "#fff",
                color:      ativo ? "#fff"  : "#475569",
                border:     `1.5px solid ${ativo ? cfg.cor : "#e2e8f0"}`,
              }}>
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ position:"relative", flex:1, minWidth:200, maxWidth:300 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round"
            style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar necessidade…"
            style={{ ...searchInput, paddingLeft:32 }} />
        </div>
        <button style={btnNovo} onClick={() => setModal({ modo:"criar" })}>+ Nova necessidade</button>
      </div>

      {/* Lista */}
      {loading && <div style={loadingBox}>Carregando necessidades…</div>}
      {!loading && listaFiltrada.length === 0 && (
        <div style={emptyState}>
          <div style={{ fontSize:28, marginBottom:8 }}>🎯</div>
          <div style={{ fontWeight:700, color:"#334155" }}>
            {busca || filtroStatus ? "Nenhuma necessidade encontrada." : "Nenhuma necessidade registrada ainda."}
          </div>
        </div>
      )}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {listaFiltrada.map((item) => (
          <NecessidadeCard
            key={item.id} item={item}
            onEditar={(i) => setModal({ modo:"editar", necessidade: i })}
            onCancelar={cancelar}
          />
        ))}
      </div>

      {modal && (
        <ModalNecessidade
          modo={modal.modo} necessidade={modal.necessidade}
          onSalvar={() => { setModal(null); carregar(); }}
          onFechar={() => setModal(null)}
        />
      )}
    </PortalShell>
  );
}

/* ── Estilos ── */
const kpiGrid    = { display:"grid", gridTemplateColumns:"repeat(5,minmax(0,1fr))", gap:12, marginBottom:14 };
const controlBar = { display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", background:"#fff", border:"1px solid #e9eef4", borderRadius:14, padding:"12px 14px", marginBottom:14 };
const searchInput = { height:36, width:"100%", borderRadius:10, border:"1px solid #e2e8f0", background:"#f8fafc", fontSize:13, color:"#334155", outline:"none", paddingRight:10, boxSizing:"border-box" };
const btnNovo    = { height:36, padding:"0 16px", borderRadius:10, border:0, background:colors.accent, color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", marginLeft:"auto", boxShadow:`0 4px 12px rgba(217,119,6,.25)`, whiteSpace:"nowrap" };
const necCard    = { background:"#fff", border:"1px solid #e9eef4", borderRadius:14, padding:"14px 16px", display:"flex", flexDirection:"column", gap:10 };
const cardHead   = { display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 };
const cardTema   = { fontSize:15, fontWeight:800, color:"#0f172a", flex:1 };
const cardMeta   = { display:"flex", gap:8, fontSize:12, color:"#64748b", flexWrap:"wrap" };
const badge      = { display:"inline-block", padding:"3px 9px", borderRadius:999, fontSize:11, fontWeight:800 };
const btnEdit    = { background:"#dbeafe", color:"#1d4ed8", border:0, borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:700 };
const btnCriarTurma = { display:"inline-block", background:"#f0fdf4", color:colors.successText, border:`1px solid #bbf7d0`, borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:700, textDecoration:"none" };
const btnCancel  = { background:colors.dangerLight, color:colors.dangerText, border:0, borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:700 };
const loadingBox = { background:"#fff", border:"1px solid #e9eef4", borderRadius:14, padding:16, color:"#64748b" };
const emptyState = { textAlign:"center", padding:"40px 16px", border:"1px dashed #e2e8f0", borderRadius:14, background:"#fafafa" };
const overlay    = { position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:16 };
const modal      = { background:"#fff", borderRadius:20, padding:24, width:"100%", maxWidth:540, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 60px rgba(0,0,0,.18)" };
const mGrid      = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 };
const mInput     = { height:38, borderRadius:10, border:"1px solid #e2e8f0", padding:"0 10px", fontSize:13, color:"#334155", outline:"none", width:"100%", boxSizing:"border-box" };
const errBox     = { background:colors.dangerLight, color:colors.dangerText, border:"1px solid #fecaca", borderRadius:10, padding:"10px 14px", fontSize:13, fontWeight:600, marginBottom:12 };
const btnFecharStyle  = { background:"#f1f5f9", border:0, borderRadius:8, padding:"6px 10px", cursor:"pointer", fontSize:14, color:"#64748b", fontWeight:700 };
const btnSalvarStyle  = { background:colors.accent, color:"#fff", border:0, borderRadius:10, padding:"10px 22px", cursor:"pointer", fontWeight:800, fontSize:14 };
const btnCancelarStyle = { background:"#f8fafc", color:"#64748b", border:"1px solid #e9eef4", borderRadius:10, padding:"10px 18px", cursor:"pointer", fontWeight:600, fontSize:14 };
