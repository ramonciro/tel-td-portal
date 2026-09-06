"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams }    from "next/navigation";
import TurmaPageShell                    from "../../../../components/TurmaPageShell";
import { apiFetch }                      from "../../../../services/api";
import { formatDateBR }                  from "../../../../lib/date";
import { colors }                        from "../../../../lib/theme";

/* ═══════════════════════════════════════════════
   CONSTANTES
═══════════════════════════════════════════════ */
const STATUS_VALIDOS = ["presente", "ausente", "justificado", "pendente"];

function normalizeStatus(v) {
  const t = String(v || "").toLowerCase().trim();
  return STATUS_VALIDOS.includes(t) ? t : "pendente";
}

/* Ordem de exibição: pendentes primeiro, depois ausentes, justificados, presentes */
const ORDEM_STATUS = { pendente: 0, ausente: 1, justificado: 2, presente: 3 };

const STATUS_CONFIG = {
  presente:   { label: "Presente",   bg: colors.successLight, cor: colors.successText, borda: "#86efac" },
  ausente:    { label: "Ausente",    bg: colors.dangerLight,  cor: colors.dangerText,  borda: "#fca5a5" },
  justificado:{ label: "Justificado",bg: colors.warningLight, cor: colors.warningText, borda: "#fcd34d" },
  pendente:   { label: "Pendente",   bg: "#f1f5f9",           cor: "#94a3b8",          borda: "#e2e8f0" },
};

/* ═══════════════════════════════════════════════
   SUB-COMPONENTES
═══════════════════════════════════════════════ */
function StatusBtn({ status, ativo, onClick }) {
  const cfg    = STATUS_CONFIG[status];
  const isAtivo = ativo === status;
  return (
    <button
      onClick={onClick}
      style={{
        padding:      "7px 14px",
        borderRadius: 999,
        border:       `1.5px solid ${isAtivo ? cfg.borda : "#e2e8f0"}`,
        background:   isAtivo ? cfg.bg   : "#fff",
        color:        isAtivo ? cfg.cor  : "#94a3b8",
        fontWeight:   isAtivo ? 800      : 600,
        fontSize:     13,
        cursor:       "pointer",
        whiteSpace:   "nowrap",
        transition:   "all .12s",
      }}
    >
      {cfg.label}
    </button>
  );
}

function ProgressBar({ total, pendentes }) {
  const pct = total > 0 ? Math.round((total - pendentes) / total * 100) : 0;
  const cor  = pct === 100 ? colors.success : pct >= 50 ? "#f59e0b" : colors.primary;
  return (
    <div style={progressWrap}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={progressLabel}>
            {pendentes === 0
              ? "✓ Chamada completa"
              : `${pendentes} pendente${pendentes !== 1 ? "s" : ""} restante${pendentes !== 1 ? "s" : ""}`}
          </span>
          <span style={{ ...progressLabel, fontWeight: 800, color: cor }}>{pct}%</span>
        </div>
        <div style={progressTrack}>
          <div style={{ ...progressFill, width: `${pct}%`, background: cor }} />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════ */
export default function ChamadaTurmaPage() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const id           = params?.id;
  const turmaAulaId  = searchParams.get("turma_aula_id");
  const dataAula     = searchParams.get("data_aula");

  const [treinamento, setTreinamento] = useState(null);
  const [aula,        setAula]        = useState(null);
  const [registros,   setRegistros]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [salvando,    setSalvando]    = useState(false);
  const [erro,        setErro]        = useState("");
  const [sucesso,     setSucesso]     = useState("");
  const [busca,       setBusca]       = useState("");
  const [filtroStatus,setFiltroStatus]= useState("todos");

  useEffect(() => { carregar(); }, [id, turmaAulaId]);

  /* ── carregamento ── */
  async function carregar() {
    if (!id || !turmaAulaId) return;
    try {
      setLoading(true); setErro(""); setSucesso("");

      const [dadosTreinamento, listaAulas] = await Promise.all([
        apiFetch(`/treinamentos/${id}`),
        apiFetch(`/turma-aulas?treinamento_id=${id}`).catch(() => []),
      ]);

      setTreinamento(dadosTreinamento || null);
      setAula((Array.isArray(listaAulas) ? listaAulas : [])
        .find((a) => String(a.id) === String(turmaAulaId)) || null);

      /* Inicializar registros (cria pendentes se não existirem) */
      await apiFetch("/presenca-aulas/inicializar", {
        method: "POST",
        body: JSON.stringify({ turma_aula_id: Number(turmaAulaId) }),
      }).catch(() => null);

      const lista = await apiFetch(
        `/presenca-aulas?turma_aula_id=${turmaAulaId}`
      ).catch(() => []);

      setRegistros(Array.isArray(lista) ? lista : []);
    } catch (err) {
      setErro(err.message || "Erro ao carregar a chamada.");
    } finally {
      setLoading(false);
    }
  }

  /* ── mutações locais ── */
  function setStatus(chave, novoStatus) {
    setSucesso("");
    setRegistros((prev) =>
      prev.map((r) =>
        chave === (r.id || r.treinando_nome)
          ? { ...r, status: novoStatus,
              justificativa: novoStatus !== "justificado" ? r.justificativa : r.justificativa }
          : r
      )
    );
  }

  function setJustificativa(chave, valor) {
    setRegistros((prev) =>
      prev.map((r) =>
        chave === (r.id || r.treinando_nome) ? { ...r, justificativa: valor } : r
      )
    );
  }

  /* ── ações em massa ── */
  function marcarTodos(status, apenasVisiveis = false) {
    const alvo = apenasVisiveis ? registrosFiltrados : registros;
    const chaves = new Set(alvo.map((r) => r.id || r.treinando_nome));
    setSucesso("");
    setRegistros((prev) =>
      prev.map((r) =>
        chaves.has(r.id || r.treinando_nome) ? { ...r, status } : r
      )
    );
  }

  /* ── salvar ── */
  async function salvar() {
    try {
      setSalvando(true); setErro(""); setSucesso("");
      await apiFetch("/presenca-aulas/salvar", {
        method: "POST",
        body: JSON.stringify({
          turma_aula_id: Number(turmaAulaId),
          registros: registros.map((r) => ({
            treinando_nome: r.treinando_nome,
            status:         normalizeStatus(r.status),
            justificativa:  r.justificativa || null,
          })),
        }),
      });
      setSucesso("Chamada salva com sucesso.");
      await carregar();
    } catch (err) {
      setErro(err.message || "Erro ao salvar a chamada.");
    } finally {
      setSalvando(false);
    }
  }

  /* ── KPIs (live) ── */
  const resumo = useMemo(() => {
    const total       = registros.length;
    const presentes   = registros.filter((r) => normalizeStatus(r.status) === "presente").length;
    const ausentes    = registros.filter((r) => normalizeStatus(r.status) === "ausente").length;
    const justificados= registros.filter((r) => normalizeStatus(r.status) === "justificado").length;
    const pendentes   = registros.filter((r) => normalizeStatus(r.status) === "pendente").length;
    return { total, presentes, ausentes, justificados, pendentes };
  }, [registros]);

  /* ── lista filtrada + ordenada ── */
  const registrosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return registros
      .filter((r) => {
        const okBusca = !termo || String(r.treinando_nome || "").toLowerCase().includes(termo);
        const okStatus = filtroStatus === "todos" || normalizeStatus(r.status) === filtroStatus;
        return okBusca && okStatus;
      })
      .sort((a, b) => {
        const oa = ORDEM_STATUS[normalizeStatus(a.status)] ?? 99;
        const ob = ORDEM_STATUS[normalizeStatus(b.status)] ?? 99;
        if (oa !== ob) return oa - ob;
        return String(a.treinando_nome || "").localeCompare(String(b.treinando_nome || ""), "pt-BR");
      });
  }, [registros, busca, filtroStatus]);

  /* ── guard: sem params ── */
  if (!id || !turmaAulaId) {
    return (
      <TurmaPageShell id={id} treinamento={null} loading={false} abaAtiva="cronograma">
        <div style={emptyState}>
          Nenhuma aula selecionada. Acesse pelo cronograma e clique em "Abrir chamada".
        </div>
      </TurmaPageShell>
    );
  }

  return (
    <TurmaPageShell id={id} treinamento={treinamento} loading={loading} abaAtiva="cronograma">

      {/* ── Faixa de contexto da aula ── */}
      {aula && (
        <div style={aulaStrip}>
          <div style={aulaStripLeft}>
            <span style={aulaBadge}>Chamada</span>
            <span style={aulaTitulo}>{aula.titulo || `Aula ${aula.dia_numero || ""}`}</span>
            <span style={aulaMeta}>
              {formatDateBR(aula.data_aula)}
              {(aula.instrutor_responsavel || treinamento?.instrutor) &&
                ` · ${aula.instrutor_responsavel || treinamento?.instrutor}`}
            </span>
          </div>
          <button style={btnSalvar} onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar chamada"}
          </button>
        </div>
      )}

      {/* Feedback */}
      {erro    && <div style={errorBox}>{erro}</div>}
      {sucesso && <div style={successBox}>{sucesso}</div>}

      {loading ? (
        <div style={loadingBox}>Carregando lista de presença…</div>
      ) : (
        <>
          {/* ── Barra de progresso ── */}
          <ProgressBar total={resumo.total} pendentes={resumo.pendentes} />

          {/* ── KPI chips (live) ── */}
          <div style={kpiRow}>
            {[
              { label: "Total",       value: resumo.total,        cor: "#334155" },
              { label: "Presentes",   value: resumo.presentes,    cor: colors.successText  },
              { label: "Ausentes",    value: resumo.ausentes,     cor: colors.dangerText   },
              { label: "Justificados",value: resumo.justificados, cor: colors.warningText  },
              { label: "Pendentes",   value: resumo.pendentes,
                cor: resumo.pendentes > 0 ? colors.primary : "#94a3b8" },
            ].map(({ label, value, cor }) => (
              <div key={label} style={kpiChip}>
                <span style={{ fontSize: 22, fontWeight: 900, color: cor, lineHeight: 1 }}>{value}</span>
                <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* ── Ações em massa ── */}
          <div style={massaBar}>
            <div style={massaLabel}>Marcar todos como:</div>
            <div style={massaBtns}>
              <button style={btnMassa("presente")}
                onClick={() => marcarTodos("presente")}>✓ Todos presentes</button>
              <button style={btnMassa("ausente")}
                onClick={() => marcarTodos("ausente")}>✗ Todos ausentes</button>
              {registrosFiltrados.length < registros.length && (
                <button style={btnMassaGhost}
                  onClick={() => marcarTodos("presente", true)}>
                  ✓ Exibidos como presentes
                </button>
              )}
            </div>
          </div>

          {/* ── Filtros ── */}
          <div style={filtroBar}>
            {/* Pills de status */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                { key: "todos",       label: `Todos (${resumo.total})`             },
                { key: "pendente",    label: `Pendentes (${resumo.pendentes})`      },
                { key: "presente",    label: `Presentes (${resumo.presentes})`      },
                { key: "ausente",     label: `Ausentes (${resumo.ausentes})`        },
                { key: "justificado", label: `Justif. (${resumo.justificados})`     },
              ].map(({ key, label }) => {
                const ativo = filtroStatus === key;
                const cfg   = STATUS_CONFIG[key] || { bg: "#f1f5f9", cor: "#64748b", borda: "#e2e8f0" };
                return (
                  <button
                    key={key}
                    onClick={() => setFiltroStatus(key)}
                    style={{
                      padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: ativo ? 800 : 600,
                      cursor: "pointer", whiteSpace: "nowrap",
                      border:     `1.5px solid ${ativo ? cfg.borda || colors.accent : "#e2e8f0"}`,
                      background: ativo ? (cfg.bg || colors.accent) : "#fff",
                      color:      ativo ? (cfg.cor || "#fff")        : "#64748b",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Busca */}
            <div style={{ position: "relative", flex: 1, maxWidth: 260 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8"
                strokeWidth="2.2" strokeLinecap="round"
                style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar treinando…"
                style={searchInput}
              />
            </div>

            <span style={{ fontSize: 13, color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>
              {registrosFiltrados.length} de {registros.length}
            </span>
          </div>

          {/* ── Lista de chamada ── */}
          <div style={listaWrap}>
            {registrosFiltrados.length === 0 ? (
              <div style={emptyState}>
                {busca ? "Nenhum treinando encontrado para a busca." : "Nenhum registro nesta aula."}
              </div>
            ) : (
              registrosFiltrados.map((item, idx) => {
                const chave       = item.id || item.treinando_nome;
                const status      = normalizeStatus(item.status);
                const cfg         = STATUS_CONFIG[status];
                const ehJustif    = status === "justificado";
                const ehPendente  = status === "pendente";

                return (
                  <div
                    key={chave}
                    style={{
                      ...linhaBase,
                      background: ehPendente
                        ? "#f8fafc"
                        : cfg.bg,
                      borderLeft: `3px solid ${ehPendente ? "#e2e8f0" : cfg.borda}`,
                    }}
                  >
                    {/* Número + nome */}
                    <div style={linhaNome}>
                      <span style={linhaNumero}>{idx + 1}</span>
                      <span style={{ fontWeight: ehPendente ? 500 : 700, color: "#0f172a", fontSize: 14 }}>
                        {item.treinando_nome}
                      </span>
                    </div>

                    {/* Botões de status */}
                    <div style={linhaBtns}>
                      <StatusBtn status="presente"    ativo={status} onClick={() => setStatus(chave, "presente")}    />
                      <StatusBtn status="ausente"     ativo={status} onClick={() => setStatus(chave, "ausente")}     />
                      <StatusBtn status="justificado" ativo={status} onClick={() => setStatus(chave, "justificado")} />
                    </div>

                    {/* Justificativa (só quando justificado) */}
                    {ehJustif && (
                      <input
                        value={item.justificativa || ""}
                        onChange={(e) => setJustificativa(chave, e.target.value)}
                        placeholder="Justificativa (obrigatório)"
                        style={justifInput}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* ── Salvar (rodapé) ── */}
          {registros.length > 0 && (
            <div style={rodapeBar}>
              {resumo.pendentes > 0 && (
                <span style={{ fontSize: 13, color: colors.warningText, fontWeight: 600 }}>
                  ⚠ {resumo.pendentes} pendente{resumo.pendentes !== 1 ? "s" : ""} — a chamada pode ser salva parcialmente.
                </span>
              )}
              <button style={{ ...btnSalvar, marginLeft: "auto" }} onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar chamada"}
              </button>
            </div>
          )}
        </>
      )}
    </TurmaPageShell>
  );
}

/* ── Estilos ── */
const aulaStrip = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  background: "#fff", border: "1px solid #e9eef4", borderRadius: 14,
  padding: "12px 16px", marginBottom: 14, gap: 12, flexWrap: "wrap",
};
const aulaStripLeft = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };
const aulaBadge  = { background: "rgba(11,18,32,.08)", color: "#0B1220", borderRadius: 999,
  padding: "3px 10px", fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em" };
const aulaTitulo = { fontSize: 15, fontWeight: 800, color: "#0f172a" };
const aulaMeta   = { fontSize: 13, color: "#64748b" };

const btnSalvar  = {
  background: colors.accent, color: "#fff", border: 0,
  borderRadius: 10, padding: "9px 20px", cursor: "pointer",
  fontWeight: 800, fontSize: 14, flexShrink: 0,
  boxShadow: `0 4px 14px rgba(217,119,6,.3)`,
};

const progressWrap  = { display: "flex", alignItems: "center", gap: 14, marginBottom: 14 };
const progressLabel = { fontSize: 13, color: "#64748b", fontWeight: 600 };
const progressTrack = { height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" };
const progressFill  = { height: "100%", borderRadius: 999, transition: "width .3s ease" };

const kpiRow  = { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 };
const kpiChip = { display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
  background: "#fff", border: "1px solid #e9eef4", borderRadius: 12, padding: "10px 18px" };

const massaBar   = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
  background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 12,
  padding: "10px 14px", marginBottom: 12 };
const massaLabel = { fontSize: 12, fontWeight: 700, color: "#0369a1", whiteSpace: "nowrap" };
const massaBtns  = { display: "flex", gap: 8, flexWrap: "wrap" };

function btnMassa(status) {
  const cfg = STATUS_CONFIG[status];
  return {
    padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700,
    border: `1.5px solid ${cfg.borda}`, background: cfg.bg, color: cfg.cor,
  };
}
const btnMassaGhost = {
  padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600,
  border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b",
};

const filtroBar  = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
  marginBottom: 12, background: "#fff", border: "1px solid #e9eef4",
  borderRadius: 14, padding: "10px 12px" };
const searchInput = { height: 34, paddingLeft: 32, paddingRight: 10, width: "100%",
  borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc",
  fontSize: 13, color: "#334155", outline: "none", boxSizing: "border-box" };

const listaWrap = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 };

const linhaBase  = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
  borderRadius: 12, padding: "10px 14px", transition: "background .15s" };
const linhaNome  = { display: "flex", alignItems: "center", gap: 8, flex: "1 1 200px", minWidth: 0 };
const linhaNumero= { fontSize: 11, fontWeight: 700, color: "#cbd5e1",
  minWidth: 22, textAlign: "right", flexShrink: 0 };
const linhaBtns  = { display: "flex", gap: 6, flexShrink: 0 };

const justifInput = { flex: "1 1 200px", height: 34, borderRadius: 8, border: "1px solid #fcd34d",
  background: "#fefce8", padding: "0 10px", fontSize: 13, color: "#334155", outline: "none" };

const rodapeBar  = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
  background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: "12px 16px", marginTop: 8 };

const emptyState = { textAlign: "center", padding: "32px 16px", color: "#94a3b8",
  fontSize: 14, border: "1px dashed #e2e8f0", borderRadius: 12, background: "#fafafa" };
const loadingBox = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
  padding: 16, color: "#64748b", fontSize: 13 };
const errorBox   = { background: colors.dangerLight,  color: colors.dangerText,
  border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 12 };
const successBox = { background: colors.successLight, color: colors.successText,
  border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 12 };
