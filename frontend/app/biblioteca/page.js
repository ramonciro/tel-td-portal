"use client";

export const dynamic    = "force-dynamic";
export const fetchCache = "force-no-store";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
import { apiFetch, getStoredUser } from "../../services/api";
import { colors, chart } from "../../lib/theme";

/* ── utilitários ── */
function fmt(n) { return new Intl.NumberFormat("pt-BR").format(Number(n || 0)); }
function norm(v) { return String(v || "").trim().toLowerCase(); }

/* ── opções de formulário ── */
const TIPOS   = ["Apresentação","Manual","Card","Roteiro","Material de turma","Vídeo","Planilha","Outro"];
const STATUS  = [{ v:"Publicado",l:"Publicado"},{ v:"Em atualização",l:"Em atualização"},{ v:"Rascunho",l:"Rascunho"}];

/* ── estilos de badge ── */
function statusStyle(status) {
  const k = norm(status);
  const base = { display:"inline-block", padding:"4px 9px", borderRadius:999, fontWeight:800, fontSize:11 };
  if (k === "publicado")          return { ...base, background: colors.successLight, color: colors.successText };
  if (k === "em atualização" || k === "em atualizacao")
                                  return { ...base, background: colors.warningLight,  color: colors.warningText  };
  return                                 { ...base, background: "#f1f5f9",            color: "#64748b"           };
}

/* ═══════════════════════════════════════════════
   CARD DE MATERIAL
═══════════════════════════════════════════════ */
function MaterialCard({ item, podeEditar, podeExcluir, confirmandoExclusao, onEditar, onIniciarExclusao, onConfirmarExclusao, onCancelarExclusao }) {
  return (
    <div style={card}>
      <div style={cardTop}>
        <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:6 }}>
          <span style={tipoChip}>{item.tipo || "Material"}</span>
          <span style={statusStyle(item.status)}>{item.status || "Rascunho"}</span>
        </div>
        <div style={cardTitulo}>{item.titulo || "Sem título"}</div>
        <div style={cardMeta}>{(item.cliente || "GLOBAL")} · {item.publico || "Todos"}</div>
      </div>

      <div style={cardBody}>
        {(item.categoria || item.publico) && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {item.categoria && <span style={tag}>{item.categoria}</span>}
            {item.publico   && <span style={tag}>{item.publico}</span>}
          </div>
        )}
        {item.descricao && (
          <p style={{ margin:0, color:"#475569", lineHeight:1.6, fontSize:14 }}>
            {item.descricao.length > 140 ? item.descricao.slice(0,140) + "…" : item.descricao}
          </p>
        )}

        {confirmandoExclusao ? (
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:10, padding:"8px 10px" }}>
            <span style={{ fontSize:12, color:"#9a3412", fontWeight:600, flex:"1 1 auto" }}>Confirma excluir este material?</span>
            <button onClick={onConfirmarExclusao} style={{ ...btnDelStyle, padding:"6px 12px" }}>Excluir</button>
            <button onClick={onCancelarExclusao}  style={{ ...btnEditStyle, padding:"6px 12px" }}>Cancelar</button>
          </div>
        ) : (
          <div style={cardAcoes}>
            {item.link_arquivo && (
              <a href={item.link_arquivo} target="_blank" rel="noreferrer" style={btnAbrir}>
                Abrir material ↗
              </a>
            )}
            {podeEditar  && <button onClick={onEditar}         style={btnEdit}>Editar</button>}
            {podeExcluir && <button onClick={onIniciarExclusao} style={btnDel}>Excluir</button>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MODAL CRIAR / EDITAR
═══════════════════════════════════════════════ */
function emptyForm() {
  return { titulo:"", tipo:"Apresentação", cliente:"", categoria:"", publico:"", status:"Rascunho", link_arquivo:"", descricao:"" };
}

function ModalMaterial({ modo, item, uploadLink, onSalvar, onFechar }) {
  const [form,     setForm]     = useState(() => modo === "editar" && item ? { ...emptyForm(), ...item } : emptyForm());
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");

  // Se veio link de upload, preenche o campo
  useEffect(() => { if (uploadLink) setForm((p) => ({ ...p, link_arquivo: uploadLink })); }, [uploadLink]);

  function campo(k) { return (e) => setForm((p) => ({ ...p, [k]: e.target.value })); }

  async function salvar() {
    try {
      setSalvando(true); setErro("");
      if (!form.titulo.trim()) throw new Error("Título é obrigatório.");
      if (!form.cliente.trim()) throw new Error("Cliente / operação é obrigatório.");
      const payload = { ...form, titulo: form.titulo.trim(), cliente: form.cliente.trim() };
      if (modo === "editar") {
        await apiFetch(`/biblioteca/${item.id}`, { method:"PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/biblioteca",             { method:"POST", body: JSON.stringify(payload) });
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
            <div style={{ fontSize:18, fontWeight:800, color:"#0f172a" }}>{modo==="criar" ? "Novo material" : "Editar material"}</div>
            <div style={{ fontSize:13, color:"#64748b", marginTop:3 }}>
              {uploadLink ? "Link de upload preenchido automaticamente." : "Preencha os dados do material."}
            </div>
          </div>
          <button style={btnFecharStyle} onClick={onFechar}>✕</button>
        </div>
        {erro && <div style={errBox}>{erro}</div>}
        <div style={mGrid}>
          <MF label="Título *" full><input value={form.titulo} onChange={campo("titulo")} style={mInput} placeholder="Nome do material" /></MF>
          <MF label="Tipo">
            <select value={form.tipo} onChange={campo("tipo")} style={mInput}>
              {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </MF>
          <MF label="Status">
            <select value={form.status} onChange={campo("status")} style={mInput}>
              {STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </MF>
          <MF label="Cliente / operação *">
            <input value={form.cliente} onChange={campo("cliente")} style={mInput} placeholder="Operação ou GLOBAL" />
          </MF>
          <MF label="Categoria">
            <input value={form.categoria} onChange={campo("categoria")} style={mInput} placeholder="Ex.: onboarding, produto" />
          </MF>
          <MF label="Público-alvo">
            <input value={form.publico} onChange={campo("publico")} style={mInput} placeholder="Ex.: treinandos, instrutores" />
          </MF>
          <MF label="Link do material" full>
            <input value={form.link_arquivo} onChange={campo("link_arquivo")} style={mInput} placeholder="URL do arquivo ou documento" />
          </MF>
          <MF label="Descrição" full>
            <textarea value={form.descricao} onChange={campo("descricao")} rows={3}
              style={{ ...mInput, height:"auto", padding:"8px 10px", resize:"vertical" }} placeholder="Contexto e uso do material" />
          </MF>
        </div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button style={btnCancelarStyle} onClick={onFechar}>Cancelar</button>
          <button style={btnSalvarStyle}   onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : modo==="criar" ? "Cadastrar material" : "Salvar alterações"}
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
   SEÇÃO DE UPLOAD
═══════════════════════════════════════════════ */
function UploadSection({ onLinkGerado }) {
  const [arquivo,   setArquivo]   = useState(null);
  const [link,      setLink]      = useState("");
  const [enviando,  setEnviando]  = useState(false);
  const [erro,      setErro]      = useState("");
  const [sucesso,   setSucesso]   = useState("");

  async function enviar() {
    if (!arquivo) { setErro("Selecione um arquivo."); return; }
    try {
      setEnviando(true); setErro(""); setSucesso("");
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      // Sprint 2 FIX: apiFetch já retorna JSON parsed — NÃO chamar .json()
      const data = await apiFetch("/biblioteca/upload", { method:"POST", body: fd });
      const linkGerado = data?.link_arquivo || data?.url || "";
      setLink(linkGerado);
      setSucesso("Arquivo enviado. O link foi preenchido no formulário.");
      if (linkGerado) onLinkGerado(linkGerado);
    } catch (e) { setErro(e.message || "Erro ao fazer upload."); }
    finally { setEnviando(false); }
  }

  return (
    <div style={uploadBox}>
      <div style={{ fontSize:13, fontWeight:700, color:"#334155", marginBottom:10 }}>
        📎 Upload de arquivo
      </div>
      <p style={{ fontSize:12, color:"#64748b", margin:"0 0 10px" }}>
        Envie o arquivo e use o link gerado ao cadastrar o material.
      </p>
      {erro    && <div style={errBox}>{erro}</div>}
      {sucesso && <div style={okBox}>{sucesso}</div>}
      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
        <input type="file" onChange={(e) => setArquivo(e.target.files?.[0] || null)} style={{ fontSize:13 }} />
        <button onClick={enviar} disabled={enviando} style={btnUpload}>
          {enviando ? "Enviando…" : "Fazer upload"}
        </button>
      </div>
      {link && (
        <div style={linkBox}>
          <strong>Link gerado:</strong>
          <div style={{ marginTop:4, wordBreak:"break-all", fontSize:12 }}>{link}</div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════ */
export default function BibliotecaPage() {
  const [biblioteca,  setBiblioteca]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [erro,        setErro]        = useState("");
  const [busca,       setBusca]       = useState("");
  const [filtroCliente, setFiltroCliente] = useState("Todos");
  const [filtroTipo,  setFiltroTipo]  = useState("Todos");
  const [filtroStatus,setFiltroStatus]= useState("Todos");
  const [modal,       setModal]       = useState(null);
  const [uploadLink,  setUploadLink]  = useState("");
  const [excluindo,   setExcluindo]   = useState(null);

  const usuario     = getStoredUser();
  const perfil      = String(usuario?.perfil || "").toLowerCase();
  // Precisa espelhar exatamente as roles liberadas no backend
  // (backend/src/index.js, rotas /api/biblioteca) — senão o botão aparece
  // na tela mas a ação falha com erro de permissão.
  const podeEditar  = ["coordenador","supervisor"].includes(perfil); // criar/editar
  const podeExcluir = perfil === "coordenador";                      // excluir

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      setLoading(true); setErro("");
      // Sprint 2 FIX: apiFetch retorna JSON direto — NÃO chamar .json()
      const data = await apiFetch("/biblioteca").catch(() => []);
      setBiblioteca(Array.isArray(data) ? data : []);
    } catch (e) { setErro(e.message || "Erro ao carregar biblioteca."); }
    finally { setLoading(false); }
  }

  async function excluir(id) {
    try {
      await apiFetch(`/biblioteca/${id}`, { method:"DELETE" });
      setBiblioteca((p) => p.filter((b) => b.id !== id));
      setExcluindo(null);
    } catch (e) { setErro(e.message || "Erro ao excluir."); }
  }

  /* Opções de filtro */
  const clientes = useMemo(() => ["Todos",...new Set(biblioteca.map((b) => b.cliente).filter(Boolean))], [biblioteca]);
  const tipos    = useMemo(() => ["Todos",...new Set(biblioteca.map((b) => b.tipo).filter(Boolean))],    [biblioteca]);

  /* KPIs */
  const kpis = useMemo(() => ({
    total:      biblioteca.length,
    publicados: biblioteca.filter((b) => norm(b.status) === "publicado").length,
    atualizando:biblioteca.filter((b) => norm(b.status).includes("atualiza")).length,
    rascunhos:  biblioteca.filter((b) => norm(b.status) === "rascunho").length,
  }), [biblioteca]);

  /* Lista filtrada */
  const listaFiltrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return biblioteca.filter((b) => {
      const okCliente = filtroCliente === "Todos" || b.cliente === filtroCliente;
      const okTipo    = filtroTipo    === "Todos" || b.tipo    === filtroTipo;
      const okStatus  = filtroStatus  === "Todos" || norm(b.status) === norm(filtroStatus);
      const okBusca   = !t || [b.titulo, b.descricao, b.categoria, b.publico].join(" ").toLowerCase().includes(t);
      return okCliente && okTipo && okStatus && okBusca;
    });
  }, [biblioteca, filtroCliente, filtroTipo, filtroStatus, busca]);

  return (
    <PortalShell>
      <div style={{ marginBottom:20 }}>
        <PageHero eyebrow="Materiais" title="Biblioteca"
          subtitle="Central de conteúdos, apresentações e materiais de apoio ao treinamento." />
      </div>

      {erro && <div style={errBox}>{erro}</div>}

      {/* KPIs */}
      <div style={kpiGrid}>
        <StatCard title="Materiais"       value={fmt(kpis.total)}      accent={chart.blue}    />
        <StatCard title="Publicados"      value={fmt(kpis.publicados)} accent={colors.success} />
        <StatCard title="Em atualização"  value={fmt(kpis.atualizando)}accent={colors.warning} />
        <StatCard title="Rascunhos"       value={fmt(kpis.rascunhos)}  accent={colors.neutral} />
      </div>

      {/* Upload (coordenador/supervisor) */}
      {podeEditar && (
        <UploadSection onLinkGerado={(link) => {
          setUploadLink(link);
          setModal({ modo:"criar" });
        }} />
      )}

      {/* Filtros */}
      <div style={filtrosBar}>
        <FiltroSelect label="Cliente"   value={filtroCliente} options={clientes}            onChange={setFiltroCliente} />
        <FiltroSelect label="Tipo"      value={filtroTipo}    options={tipos}               onChange={setFiltroTipo}    />
        <FiltroSelect label="Status"    value={filtroStatus}  options={["Todos","Publicado","Em atualização","Rascunho"]} onChange={setFiltroStatus} />
        <div style={{ position:"relative", flex:1, minWidth:200 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round"
            style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar material…" style={{ ...searchInput, paddingLeft:32 }} />
        </div>
        <span style={{ fontSize:13, color:"#94a3b8", whiteSpace:"nowrap" }}>{listaFiltrada.length} de {biblioteca.length}</span>
        {podeEditar && (
          <button style={btnNovo} onClick={() => { setUploadLink(""); setModal({ modo:"criar" }); }}>
            + Novo material
          </button>
        )}
      </div>

      {/* Grid de cards */}
      {loading ? (
        <div style={loadingBox}>Carregando biblioteca…</div>
      ) : listaFiltrada.length === 0 ? (
        <div style={emptyState}>
          <div style={{ fontSize:28, marginBottom:8 }}>📚</div>
          <div style={{ fontWeight:700, color:"#334155" }}>
            {busca || filtroCliente !== "Todos" || filtroTipo !== "Todos" || filtroStatus !== "Todos"
              ? "Nenhum material encontrado para os filtros."
              : "Nenhum material cadastrado ainda."}
          </div>
        </div>
      ) : (
        <div style={cardsGrid}>
          {listaFiltrada.map((b) => (
            <MaterialCard
              key={b.id} item={b} podeEditar={podeEditar} podeExcluir={podeExcluir}
              confirmandoExclusao={excluindo === b.id}
              onEditar={() => { setUploadLink(""); setModal({ modo:"editar", item: b }); }}
              onIniciarExclusao={() => setExcluindo(b.id)}
              onConfirmarExclusao={() => excluir(b.id)}
              onCancelarExclusao={() => setExcluindo(null)}
            />
          ))}
        </div>
      )}

      {modal && (
        <ModalMaterial modo={modal.modo} item={modal.item} uploadLink={uploadLink}
          onSalvar={() => { setModal(null); setUploadLink(""); carregar(); }}
          onFechar={() => { setModal(null); setUploadLink(""); }} />
      )}
    </PortalShell>
  );
}

function FiltroSelect({ label, value, options, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle} aria-label={label}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/* ── Estilos ── */
const kpiGrid    = { display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:12, marginBottom:14 };
const filtrosBar = { display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", background:"#fff", border:"1px solid #e9eef4", borderRadius:14, padding:"12px 14px", marginBottom:14 };
const selectStyle = { height:36, padding:"0 10px", borderRadius:10, border:"1px solid #e2e8f0", background:"#f8fafc", fontSize:13, color:"#334155", cursor:"pointer" };
const searchInput = { height:36, width:"100%", borderRadius:10, border:"1px solid #e2e8f0", background:"#f8fafc", fontSize:13, color:"#334155", outline:"none", paddingRight:10, boxSizing:"border-box" };
const btnNovo    = { height:36, padding:"0 16px", borderRadius:10, border:0, background:colors.accent, color:"#fff", fontWeight:800, fontSize:13, cursor:"pointer", marginLeft:"auto", boxShadow:`0 4px 12px rgba(217,119,6,.25)`, whiteSpace:"nowrap" };
const cardsGrid  = { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:14 };
const card       = { background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, overflow:"hidden", display:"flex", flexDirection:"column" };
const cardTop    = { padding:16, borderBottom:"1px solid #f1f5f9", display:"flex", flexDirection:"column", gap:8 };
const cardTitulo = { fontSize:17, fontWeight:800, color:"#0f172a" };
const cardMeta   = { fontSize:13, color:"#64748b" };
const cardBody   = { padding:16, display:"flex", flexDirection:"column", gap:10, flex:1 };
const cardAcoes  = { display:"flex", gap:8, flexWrap:"wrap", marginTop:"auto" };
const tipoChip   = { display:"inline-block", padding:"4px 9px", borderRadius:999, background:"#eff6ff", color:"#1d4ed8", fontWeight:800, fontSize:11 };
const tag        = { display:"inline-block", background:"#f8fafc", border:"1px solid #e2e8f0", color:"#334155", padding:"3px 8px", borderRadius:999, fontSize:12, fontWeight:700 };
const btnAbrir   = { textDecoration:"none", display:"inline-block", borderRadius:10, padding:"8px 14px", background:colors.accent, color:"#fff", fontWeight:800, fontSize:13 };
const btnEditStyle = { background:"#dbeafe", color:"#1d4ed8", border:0, borderRadius:8, padding:"7px 12px", cursor:"pointer", fontSize:12, fontWeight:700 };
const btnDelStyle  = { background:colors.dangerLight, color:colors.dangerText, border:0, borderRadius:8, padding:"7px 12px", cursor:"pointer", fontSize:12, fontWeight:700 };
const btnEdit    = { ...btnEditStyle };
const btnDel     = { ...btnDelStyle };
const uploadBox  = { background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:14, padding:16, marginBottom:14 };
const linkBox    = { marginTop:10, background:"#eff6ff", border:"1px solid #bfdbfe", color:"#1d4ed8", borderRadius:10, padding:10, fontSize:13 };
const btnUpload  = { height:36, padding:"0 16px", borderRadius:10, border:0, background:colors.primary, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" };
const loadingBox = { background:"#fff", border:"1px solid #e9eef4", borderRadius:14, padding:16, color:"#64748b" };
const emptyState = { textAlign:"center", padding:"40px 16px", border:"1px dashed #e2e8f0", borderRadius:14, background:"#fafafa" };
const overlay    = { position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:999, padding:16 };
const modal      = { background:"#fff", borderRadius:20, padding:24, width:"100%", maxWidth:580, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 60px rgba(0,0,0,.18)" };
const mGrid      = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 };
const mInput     = { height:38, borderRadius:10, border:"1px solid #e2e8f0", padding:"0 10px", fontSize:13, color:"#334155", outline:"none", width:"100%", boxSizing:"border-box" };
const errBox     = { background:colors.dangerLight, color:colors.dangerText, border:"1px solid #fecaca", borderRadius:10, padding:"10px 14px", fontSize:13, fontWeight:600, marginBottom:12 };
const okBox      = { background:colors.successLight, color:colors.successText, border:"1px solid #bbf7d0", borderRadius:10, padding:"10px 14px", fontSize:13, fontWeight:600, marginBottom:12 };
const btnFecharStyle = { background:"#f1f5f9", border:0, borderRadius:8, padding:"6px 10px", cursor:"pointer", fontSize:14, color:"#64748b", fontWeight:700 };
const btnSalvarStyle  = { background:colors.accent, color:"#fff", border:0, borderRadius:10, padding:"10px 22px", cursor:"pointer", fontWeight:800, fontSize:14 };
const btnCancelarStyle = { background:"#f8fafc", color:"#64748b", border:"1px solid #e9eef4", borderRadius:10, padding:"10px 18px", cursor:"pointer", fontWeight:600, fontSize:14 };
