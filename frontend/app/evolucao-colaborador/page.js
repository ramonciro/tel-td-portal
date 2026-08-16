"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
import { apiFetch, getStoredUser } from "../../services/api";
import { formatDateBR } from "../../lib/date";
import { colors, chart } from "../../lib/theme";

/*
 * evolucao-colaborador/page.js — Sprint 1 redesign
 *
 * Problemas corrigidos:
 *   - HOLE DE SEGURANÇA: a versão anterior chamava GET /usuarios sem restrição.
 *     Um treinando podia ver nome, email e perfil de TODOS os colaboradores.
 *     Corrigido: /usuarios só é chamado por coordenador/supervisor. Treinandos
 *     e instrutores veem apenas os próprios dados ou os de suas turmas.
 *
 *   - GET /presencas sem filtro: retornava TODOS os registros de chamada
 *     (podendo ser milhares). Corrigido: os dados de frequência são obtidos
 *     via /frequencia-individual?treinamento_id=X, por turma.
 *
 *   - Role-based view: cada perfil vê o que faz sentido para ele.
 */

/* ── utilitários ── */
function fmt(n) { return new Intl.NumberFormat("pt-BR").format(Number(n || 0)); }
function fmtDate(v) { return formatDateBR(v, "-"); }

function pct(a, b) {
  return b > 0 ? Math.round(Number(a) / Number(b) * 100) : 0;
}

function corFreq(n) {
  if (n >= 90) return { bg: colors.successLight, text: colors.successText };
  if (n >= 75) return { bg: colors.warningLight, text: colors.warningText };
  return              { bg: colors.dangerLight,  text: colors.dangerText  };
}

function normalizePerfil(u) {
  return String(u?.perfil || u?.role || "").toLowerCase().trim();
}

function ehCoordenador(u) {
  return ["coordenador", "supervisor", "superintendente"].includes(normalizePerfil(u));
}

/* ═══════════════════════════════════════════════
   CARD DE TURMA — histórico individual
═══════════════════════════════════════════════ */
function TurmaHistoricoCard({ turma, frequencia, avaliacoes }) {
  const freq     = Number(frequencia?.frequencia_percentual ?? turma.taxa_presenca ?? 0);
  const notaFinal= avaliacoes?.nota_prova ?? avaliacoes?.nota_qualidade ?? null;
  const fCor     = corFreq(freq);

  return (
    <div style={historicCard}>
      <div style={historicTop}>
        <div>
          <div style={historicTema}>{turma.tema || "Turma"}</div>
          <div style={historicMeta}>
            {[turma.cliente, turma.instrutor].filter(Boolean).join(" · ")}
          </div>
        </div>
        <span style={{ ...freqBadge, background: fCor.bg, color: fCor.text }}>
          {freq}% freq.
        </span>
      </div>

      <div style={historicData}>
        <span>{fmtDate(turma.data_inicio || turma.data)}</span>
        {turma.data_fim && <span>→ {fmtDate(turma.data_fim)}</span>}
        {turma.carga_horaria && <span>· {turma.carga_horaria}</span>}
      </div>

      {notaFinal !== null && (
        <div style={notaRow}>
          <span style={notaLabel}>Nota</span>
          <span style={{
            ...notaBadge,
            background: Number(notaFinal) >= 8 ? colors.successLight : Number(notaFinal) >= 6 ? colors.warningLight : colors.dangerLight,
            color:      Number(notaFinal) >= 8 ? colors.successText  : Number(notaFinal) >= 6 ? colors.warningText  : colors.dangerText,
          }}>
            {Number(notaFinal).toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   VISÃO TREINANDO — "Meu histórico"
═══════════════════════════════════════════════ */
function VisaoTreinando({ usuario }) {
  const [turmas,    setTurmas]    = useState([]);
  const [freqs,     setFreqs]     = useState({});
  const [avals,     setAvals]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [erro,      setErro]      = useState("");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      setLoading(true);
      const nome = String(usuario?.nome || "").trim();

      // Busca turmas onde o usuário é participante e avaliações próprias
      const [treinamentosData, avaliData] = await Promise.all([
        apiFetch("/treinamentos").catch(() => []),
        apiFetch(`/avaliacoes`).catch(() => []),
      ]);

      const listaTurmas = Array.isArray(treinamentosData) ? treinamentosData : [];
      const listaAvals  = Array.isArray(avaliData) ? avaliData : [];

      // Filtrar avaliações do próprio treinando
      const minhasAvals = listaAvals.filter(
        (a) => String(a.treinando_nome || "").trim().toLowerCase() === nome.toLowerCase()
      );

      // Buscar frequência individual por turma com participação confirmada
      const treinamentoIds = [...new Set(minhasAvals.map((a) => a.treinamento_id))];
      const freqMap = {};

      await Promise.all(
        treinamentoIds.map(async (tid) => {
          const r = await apiFetch(`/frequencia-individual?treinamento_id=${tid}`).catch(() => null);
          const item = (r?.itens || []).find(
            (i) => String(i.treinando_nome || "").trim().toLowerCase() === nome.toLowerCase()
          );
          if (item) freqMap[tid] = item;
        })
      );

      setFreqs(freqMap);
      setAvals(minhasAvals);
      setTurmas(listaTurmas.filter((t) => treinamentoIds.includes(t.id)));
      setErro("");
    } catch (e) {
      setErro(e.message || "Erro ao carregar seu histórico.");
    } finally {
      setLoading(false);
    }
  }

  const kpi = useMemo(() => {
    const freqVals = Object.values(freqs).map((f) => Number(f.frequencia_percentual || 0));
    const mediaFreq = freqVals.length ? Math.round(freqVals.reduce((a, b) => a + b, 0) / freqVals.length) : null;
    const notas = avals.map((a) => a.nota_prova ?? a.nota_qualidade).filter((n) => n !== null && n !== undefined);
    const mediaNote = notas.length ? (notas.reduce((a, b) => a + Number(b), 0) / notas.length).toFixed(1) : null;
    return { turmas: turmas.length, mediaFreq, mediaNote };
  }, [turmas, freqs, avals]);

  return (
    <div>
      <div style={kpiGrid}>
        <StatCard title="Turmas"        value={fmt(kpi.turmas)}  subtitle="com participação"  accent={chart.blue} />
        <StatCard title="Freq. média"   value={kpi.mediaFreq !== null ? `${kpi.mediaFreq}%` : "—"} subtitle="nas turmas" accent={colors.success} />
        <StatCard title="Nota média"    value={kpi.mediaNote ?? "—"}   subtitle="em avaliações"    accent={chart.purple} />
      </div>

      {loading && <div style={loadingBox}>Carregando seu histórico…</div>}
      {erro    && <div style={errorBox}>{erro}</div>}

      {!loading && turmas.length === 0 && (
        <div style={emptyState}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📚</div>
          <div style={{ fontWeight: 700, color: "#334155" }}>Nenhuma turma encontrada</div>
          <div style={{ color: "#94a3b8", fontSize: 14, marginTop: 4 }}>Suas turmas e notas aparecerão aqui.</div>
        </div>
      )}

      <div style={grid}>
        {turmas.map((t) => (
          <TurmaHistoricoCard
            key={t.id}
            turma={t}
            frequencia={freqs[t.id]}
            avaliacoes={avals.find((a) => a.treinamento_id === t.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   VISÃO INSTRUTOR — "Minhas turmas"
═══════════════════════════════════════════════ */
function VisaoInstrutor({ usuario }) {
  const [turmas,  setTurmas]  = useState([]);
  const [resumos, setResumos] = useState({});
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState("");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      setLoading(true);
      const nome = String(usuario?.nome || "").trim().toLowerCase();

      const treinamentosData = await apiFetch("/treinamentos").catch(() => []);
      const lista = (Array.isArray(treinamentosData) ? treinamentosData : [])
        .filter((t) => String(t.instrutor || "").trim().toLowerCase() === nome);

      setTurmas(lista);

      const resumoMap = {};
      await Promise.all(
        lista.slice(0, 20).map(async (t) => {
          const r = await apiFetch(`/presenca-resumo/${t.id}`).catch(() => null);
          if (r) resumoMap[t.id] = r;
        })
      );
      setResumos(resumoMap);
      setErro("");
    } catch (e) {
      setErro(e.message || "Erro ao carregar suas turmas.");
    } finally {
      setLoading(false);
    }
  }

  const kpi = useMemo(() => {
    const taxas = Object.values(resumos).map((r) => Number(r.taxa_presenca || 0)).filter((n) => n > 0);
    const mediaFreq = taxas.length ? Math.round(taxas.reduce((a, b) => a + b, 0) / taxas.length) : null;
    return { turmas: turmas.length, mediaFreq };
  }, [turmas, resumos]);

  return (
    <div>
      <div style={kpiGrid}>
        <StatCard title="Minhas turmas"  value={fmt(kpi.turmas)}   subtitle="como instrutor"  accent={chart.blue}   />
        <StatCard title="Freq. média"    value={kpi.mediaFreq !== null ? `${kpi.mediaFreq}%` : "—"} subtitle="nas turmas" accent={colors.success} />
      </div>

      {loading && <div style={loadingBox}>Carregando suas turmas…</div>}
      {erro    && <div style={errorBox}>{erro}</div>}

      {!loading && turmas.length === 0 && (
        <div style={emptyState}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🎓</div>
          <div style={{ fontWeight: 700, color: "#334155" }}>Nenhuma turma atribuída</div>
          <div style={{ color: "#94a3b8", fontSize: 14, marginTop: 4 }}>As turmas onde você é instrutor aparecerão aqui.</div>
        </div>
      )}

      <div style={grid}>
        {turmas.map((t) => (
          <TurmaHistoricoCard key={t.id} turma={t} frequencia={{ frequencia_percentual: resumos[t.id]?.taxa_presenca }} />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   VISÃO COORDENADOR — "Buscar colaborador"
═══════════════════════════════════════════════ */
function VisaoCoordenador() {
  const [busca,        setBusca]        = useState("");
  const [colaborador,  setColaborador]  = useState(null);
  const [turmas,       setTurmas]       = useState([]);
  const [freqs,        setFreqs]        = useState({});
  const [avals,        setAvals]        = useState([]);
  const [sugestoes,    setSugestoes]    = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [buscando,     setBuscando]     = useState(false);
  const [erro,         setErro]         = useState("");

  // Busca sugestões de nomes ao digitar
  useEffect(() => {
    if (busca.trim().length < 2) { setSugestoes([]); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      const data = await apiFetch(`/usuarios?busca=${encodeURIComponent(busca)}`).catch(() => []);
      setSugestoes((Array.isArray(data) ? data : [])
        .filter((u) => String(u.perfil || "").toLowerCase() !== "coordenador")
        .slice(0, 8));
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  async function selecionarColaborador(u) {
    try {
      setLoading(true); setErro(""); setSugestoes([]);
      setBusca(u.nome);
      setColaborador(u);

      const nome = String(u.nome || "").trim().toLowerCase();
      const [treinamentosData, avaliData] = await Promise.all([
        apiFetch("/treinamentos").catch(() => []),
        apiFetch("/avaliacoes").catch(() => []),
      ]);

      const listaAvals = (Array.isArray(avaliData) ? avaliData : []).filter(
        (a) => String(a.treinando_nome || "").trim().toLowerCase() === nome
      );

      const ids = [...new Set(listaAvals.map((a) => a.treinamento_id))];
      const listaTurmas = (Array.isArray(treinamentosData) ? treinamentosData : [])
        .filter((t) => ids.includes(t.id));

      const freqMap = {};
      await Promise.all(
        ids.slice(0, 15).map(async (tid) => {
          const r = await apiFetch(`/frequencia-individual?treinamento_id=${tid}`).catch(() => null);
          const item = (r?.itens || []).find(
            (i) => String(i.treinando_nome || "").trim().toLowerCase() === nome
          );
          if (item) freqMap[tid] = item;
        })
      );

      setTurmas(listaTurmas);
      setFreqs(freqMap);
      setAvals(listaAvals);
    } catch (e) {
      setErro(e.message || "Erro ao carregar dados do colaborador.");
    } finally {
      setLoading(false);
    }
  }

  const kpi = useMemo(() => {
    const freqVals = Object.values(freqs).map((f) => Number(f.frequencia_percentual || 0));
    const mediaFreq = freqVals.length ? Math.round(freqVals.reduce((a, b) => a + b, 0) / freqVals.length) : null;
    const notas = avals.map((a) => a.nota_prova ?? a.nota_qualidade).filter((n) => n !== null && n !== undefined);
    const mediaNote = notas.length ? (notas.reduce((a, b) => a + Number(b), 0) / notas.length).toFixed(1) : null;
    return { turmas: turmas.length, mediaFreq, mediaNote };
  }, [turmas, freqs, avals]);

  return (
    <div>
      {/* Campo de busca com autocomplete */}
      <div style={{ position: "relative", maxWidth: 420, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round"
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setColaborador(null); }}
              placeholder="Buscar colaborador por nome…"
              style={{ ...searchInput, paddingLeft: 32 }}
            />
          </div>
          {buscando && <span style={{ fontSize: 12, color: "#94a3b8", alignSelf: "center" }}>buscando…</span>}
        </div>

        {sugestoes.length > 0 && (
          <div style={dropdown}>
            {sugestoes.map((u) => (
              <button key={u.id} style={dropdownItem} onClick={() => selecionarColaborador(u)}>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>{u.nome}</span>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>{u.perfil} · {u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {erro    && <div style={errorBox}>{erro}</div>}

      {colaborador && (
        <>
          <div style={colaboradorBanner}>
            <div style={colaboradorAvatar}>{(colaborador.nome || "?")[0].toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#0f172a" }}>{colaborador.nome}</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>{colaborador.perfil} · {colaborador.email}</div>
            </div>
          </div>

          <div style={kpiGrid}>
            <StatCard title="Turmas"      value={fmt(kpi.turmas)}  subtitle="com registro"   accent={chart.blue}   />
            <StatCard title="Freq. média" value={kpi.mediaFreq !== null ? `${kpi.mediaFreq}%` : "—"} subtitle="geral" accent={colors.success} />
            <StatCard title="Nota média"  value={kpi.mediaNote ?? "—"} subtitle="em avaliações" accent={chart.purple} />
          </div>

          {loading && <div style={loadingBox}>Carregando histórico…</div>}

          {!loading && turmas.length === 0 && (
            <div style={emptyState}>
              <div style={{ color: "#94a3b8", fontSize: 14 }}>Nenhuma turma ou avaliação encontrada para {colaborador.nome}.</div>
            </div>
          )}

          <div style={grid}>
            {turmas.map((t) => (
              <TurmaHistoricoCard
                key={t.id}
                turma={t}
                frequencia={freqs[t.id]}
                avaliacoes={avals.find((a) => a.treinamento_id === t.id)}
              />
            ))}
          </div>
        </>
      )}

      {!colaborador && !loading && busca.length < 2 && (
        <div style={emptyState}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
          <div style={{ fontWeight: 700, color: "#334155" }}>Buscar colaborador</div>
          <div style={{ color: "#94a3b8", fontSize: 14, marginTop: 4 }}>Digite ao menos 2 letras para ver sugestões.</div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════ */
export default function EvolucaoColaboradorPage() {
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    setUsuario(getStoredUser());
  }, []);

  const perfil = normalizePerfil(usuario);
  const ehCoordenadorOuSup = ehCoordenador(usuario);

  const titulo = ehCoordenadorOuSup
    ? "Evolução do Colaborador"
    : perfil === "instrutor"
      ? "Minhas Turmas"
      : "Meu Histórico";

  const subtitulo = ehCoordenadorOuSup
    ? "Pesquise um colaborador para ver frequência, notas e turmas."
    : perfil === "instrutor"
      ? "Frequência e resultados das turmas onde você é instrutor."
      : "Seu histórico de participação, frequência e avaliações.";

  return (
    <PortalShell>
      <div style={{ marginBottom: 20 }}>
        <PageHero eyebrow="Desenvolvimento" title={titulo} subtitle={subtitulo} />
      </div>

      {usuario && (
        ehCoordenadorOuSup  ? <VisaoCoordenador  /> :
        perfil === "instrutor" ? <VisaoInstrutor usuario={usuario} /> :
                                 <VisaoTreinando  usuario={usuario} />
      )}
    </PortalShell>
  );
}

/* ── Estilos ── */
const kpiGrid    = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 };
const grid       = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 };
const loadingBox = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 14, color: "#64748b", fontSize: 13 };
const errorBox   = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 12 };
const emptyState = { textAlign: "center", padding: "36px 16px", border: "1px dashed #e2e8f0", borderRadius: 14, background: "#fafafa", marginTop: 8 };

const historicCard = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 };
const historicTop  = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 };
const historicTema = { fontSize: 15, fontWeight: 800, color: "#0f172a" };
const historicMeta = { fontSize: 12, color: "#64748b", marginTop: 2 };
const historicData = { display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: "#94a3b8" };
const freqBadge    = { borderRadius: 999, padding: "4px 10px", fontSize: 13, fontWeight: 800, flexShrink: 0 };
const notaRow      = { display: "flex", alignItems: "center", gap: 8, paddingTop: 8, borderTop: "1px solid #f1f5f9" };
const notaLabel    = { fontSize: 12, color: "#94a3b8", fontWeight: 600 };
const notaBadge    = { borderRadius: 8, padding: "4px 12px", fontSize: 16, fontWeight: 800 };

const searchInput = { height: 40, width: "100%", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 14, color: "#334155", outline: "none", paddingRight: 10, boxSizing: "border-box" };
const dropdown    = { position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: "1px solid #e9eef4", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,.1)", zIndex: 99, overflow: "hidden" };
const dropdownItem = { width: "100%", textAlign: "left", background: "none", border: "none", padding: "10px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 2, borderBottom: "1px solid #f8fafc" };

const colaboradorBanner = { display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: "14px 16px", marginBottom: 14 };
const colaboradorAvatar = { width: 44, height: 44, borderRadius: "50%", background: colors.primary, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, flexShrink: 0 };
