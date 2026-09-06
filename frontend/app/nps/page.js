"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
import { apiFetch, getStoredUser, hasSomeRole } from "../../services/api";
import { colors, chart } from "../../lib/theme";

/* ── utilitários ── */
function classificar(nota) {
  const valor = Number(nota || 0);
  if (valor >= 9) return "Promotor";
  if (valor >= 7) return "Neutro";
  return "Detrator";
}

function corClassificacao(tipo) {
  if (tipo === "Promotor") return { bg: colors.successLight, text: colors.successText };
  if (tipo === "Neutro") return { bg: colors.warningLight, text: colors.warningText };
  return { bg: colors.dangerLight, text: colors.dangerText };
}

const PODE_CRIAR = ["coordenador", "supervisor", "instrutor"];

/* ═══════════════════════════════════════════════
   MODAL — REGISTRAR NPS (uso raro: o normal é o
   treinando responder pela própria página, ver
   nota informativa abaixo do cabeçalho)
═══════════════════════════════════════════════ */
function ModalNps({ treinamentoOptions, onSalvar, onFechar }) {
  const [form, setForm] = useState({ treinamento_id: "", treinando_nome: "", nota_nps: "", comentario: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function campo(k) { return (e) => setForm((p) => ({ ...p, [k]: e.target.value })); }

  async function salvar() {
    try {
      setSalvando(true); setErro("");
      if (!form.treinamento_id) throw new Error("Selecione a turma.");
      if (!form.treinando_nome.trim()) throw new Error("Informe o nome do treinando.");
      if (form.nota_nps === "" || Number(form.nota_nps) < 0 || Number(form.nota_nps) > 10) {
        throw new Error("Nota deve ser de 0 a 10.");
      }
      await apiFetch("/avaliacoes-treinandos", {
        method: "POST",
        body: JSON.stringify({
          treinamento_id: form.treinamento_id,
          treinando_nome: form.treinando_nome.trim(),
          nota_nps: Number(form.nota_nps),
          comentario: form.comentario || null,
        }),
      });
      onSalvar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar registro.");
    } finally { setSalvando(false); }
  }

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div style={modal}>
        <div style={modalHeader}>
          <div>
            <div style={modalTitulo}>Novo registro de NPS</div>
            <div style={modalSub}>Uso excepcional — o fluxo padrão é o treinando responder em /responder-nps.</div>
          </div>
          <button style={btnFechar} onClick={onFechar}>✕</button>
        </div>
        {erro && <div style={errBox}>{erro}</div>}
        <div style={mGrid}>
          <MField label="Turma *" full>
            <select value={form.treinamento_id} onChange={campo("treinamento_id")} style={mInput}>
              <option value="">Selecione a turma</option>
              {treinamentoOptions.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </MField>
          <MField label="Treinando *" full>
            <input value={form.treinando_nome} onChange={campo("treinando_nome")} style={mInput} placeholder="Nome do treinando" />
          </MField>
          <MField label="Nota (0-10) *">
            <input type="number" min={0} max={10} step={1} value={form.nota_nps} onChange={campo("nota_nps")} style={mInput} />
          </MField>
          <MField label="Comentário" full>
            <textarea value={form.comentario} onChange={campo("comentario")} rows={3}
              style={{ ...mInput, height: "auto", padding: "8px 10px", resize: "vertical" }} placeholder="Opcional" />
          </MField>
        </div>
        <div style={modalFooter}>
          <button style={btnCancelar} onClick={onFechar}>Cancelar</button>
          <button style={btnSalvar} onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Registrar"}
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
   CARD DE RESPOSTA
═══════════════════════════════════════════════ */
function NpsCard({ item }) {
  const tipo = classificar(item.nota_nps);
  const cor = corClassificacao(tipo);
  return (
    <div style={{ ...respostaCard, borderLeft: `4px solid ${cor.text}` }}>
      <div style={cardHead}>
        <div style={{ minWidth: 0 }}>
          <div style={cardNome}>{item.treinando_nome || "—"}</div>
          <div style={cardMeta}>{(item.tema || "Turma")} · {item.cliente || "Sem cliente"}</div>
        </div>
        <span style={{ ...statusBadge, background: cor.bg, color: cor.text }}>{tipo} · {item.nota_nps ?? "-"}</span>
      </div>
      {item.comentario && (
        <p style={cardComentario}>{item.comentario}</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════ */
export default function NpsPage() {
  const [dados, setDados] = useState([]);
  const [treinamentos, setTreinamentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroClassificacao, setFiltroClassificacao] = useState("todos");
  const [modalAberto, setModalAberto] = useState(false);

  const user = getStoredUser();
  const podeCriar = hasSomeRole(user, PODE_CRIAR);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      setLoading(true); setErro("");
      const [npsData, treinamentosData] = await Promise.all([
        apiFetch("/avaliacoes-treinandos").catch(() => []),
        apiFetch("/treinamentos").catch(() => []),
      ]);
      setDados(Array.isArray(npsData) ? npsData : []);
      setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
    } catch (e) {
      setErro(e.message || "Erro ao carregar respostas.");
    } finally { setLoading(false); }
  }

  const treinamentoOptions = useMemo(() => treinamentos.map((t) => ({
    value: t.id,
    label: `${t.tema || "Treinamento"} - ${t.cliente || "Sem cliente"}`,
  })), [treinamentos]);

  const total = dados.length;
  const promotores = dados.filter((d) => Number(d.nota_nps) >= 9).length;
  const neutros = dados.filter((d) => Number(d.nota_nps) >= 7 && Number(d.nota_nps) <= 8).length;
  const detratores = dados.filter((d) => Number(d.nota_nps) <= 6).length;
  const nps = total ? Math.round((promotores / total) * 100 - (detratores / total) * 100) : 0;

  const listaFiltrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.filter((d) => {
      const okBusca = !t || [d.treinando_nome, d.tema, d.cliente, d.comentario].join(" ").toLowerCase().includes(t);
      const okClassificacao = filtroClassificacao === "todos" || classificar(d.nota_nps) === filtroClassificacao;
      return okBusca && okClassificacao;
    });
  }, [dados, busca, filtroClassificacao]);

  return (
    <PortalShell>
      <div style={{ marginBottom: 20 }}>
        <PageHero eyebrow="Satisfação" title="NPS do Treinando"
          subtitle="Leitura executiva de promotores, neutros e detratores por turma." />
      </div>

      {erro && <div style={errorBox}>{erro}</div>}

      <div style={infoBox}>
        O treinando responde o NPS pela própria página (<strong>/responder-nps</strong>), só das turmas em que está vinculado — o registro manual abaixo é só para exceções.
      </div>

      <div style={kpiGrid}>
        <StatCard title="NPS" value={nps} subtitle="promotores − detratores" accent={chart.blue} />
        <StatCard title="Promotores" value={promotores} subtitle="nota 9-10" accent={colors.success} />
        <StatCard title="Neutros" value={neutros} subtitle="nota 7-8" accent={colors.warning} />
        <StatCard title="Detratores" value={detratores} subtitle="nota 0-6" accent={colors.danger} />
      </div>

      <div style={controlBar}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["todos", "Promotor", "Neutro", "Detrator"].map((k) => {
            const ativo = filtroClassificacao === k;
            return (
              <button key={k} onClick={() => setFiltroClassificacao(k)} style={{
                ...pillBtn,
                background: ativo ? colors.accent : "#fff",
                color: ativo ? "#fff" : "#475569",
                border: `1.5px solid ${ativo ? colors.accent : "#e2e8f0"}`,
                fontWeight: ativo ? 800 : 600,
              }}>
                {k === "todos" ? "Todos" : `${k}s`}
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
            placeholder="Buscar treinando, turma ou comentário…"
            style={{ ...searchInput, paddingLeft: 32 }} />
        </div>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>{listaFiltrada.length} de {dados.length}</span>
        {podeCriar && (
          <button style={btnNovo} onClick={() => setModalAberto(true)}>+ Novo registro</button>
        )}
      </div>

      {loading ? (
        <div style={loadingBox}>Carregando respostas…</div>
      ) : listaFiltrada.length === 0 ? (
        <div style={emptyState}>
          <div style={{ fontWeight: 700, color: "#334155" }}>
            {busca || filtroClassificacao !== "todos" ? "Nenhuma resposta encontrada para os filtros." : "Nenhuma resposta de NPS ainda."}
          </div>
        </div>
      ) : (
        <div style={cardsGrid}>
          {listaFiltrada.map((item, i) => (
            <NpsCard key={item.id ?? i} item={item} />
          ))}
        </div>
      )}

      {modalAberto && (
        <ModalNps
          treinamentoOptions={treinamentoOptions}
          onSalvar={() => { setModalAberto(false); carregar(); }}
          onFechar={() => setModalAberto(false)}
        />
      )}
    </PortalShell>
  );
}

/* ── Estilos ── */
const errorBox  = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14 };
const infoBox   = { background: colors.primaryLight, border: "1px solid #bfdbfe", color: colors.primary, borderRadius: 12, padding: 12, fontWeight: 600, fontSize: 13, marginBottom: 14 };
const loadingBox = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 16, color: "#64748b", fontSize: 13 };
const emptyState = { textAlign: "center", padding: "40px 16px", border: "1px dashed #e2e8f0", borderRadius: 14, background: "#fafafa" };
const kpiGrid   = { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 14 };
const controlBar = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: "12px 14px", marginBottom: 14 };
const pillBtn   = { padding: "5px 14px", borderRadius: 999, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" };
const searchInput = { height: 36, width: "100%", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 13, color: "#334155", outline: "none", paddingRight: 10, boxSizing: "border-box" };
const btnNovo   = { height: 36, padding: "0 16px", borderRadius: 10, border: 0, background: colors.accent, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", marginLeft: "auto" };
const cardsGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 };
const respostaCard = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 };
const cardHead  = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 };
const cardNome  = { fontSize: 15, fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const cardMeta  = { fontSize: 12, color: "#64748b", marginTop: 2 };
const statusBadge = { borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 800, flexShrink: 0, whiteSpace: "nowrap" };
const cardComentario = { margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5, fontStyle: "italic", paddingTop: 8, borderTop: "1px solid #f1f5f9" };
const overlay   = { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 };
const modal     = { background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" };
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
