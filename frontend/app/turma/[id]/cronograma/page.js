"use client";

import { useEffect, useMemo, useState }          from "react";
import { useParams }                              from "next/navigation";
import TurmaPageShell                             from "../../../../components/TurmaPageShell";
import StatCard                                   from "../../../../components/StatCard";
import { apiDownload, apiFetch }                  from "../../../../services/api";
import {
  compareLocalDatesAsc,
  formatDateBR,
  toDateInputLocal,
} from "../../../../lib/date";
import { colors, chart }                          from "../../../../lib/theme";

/* ═══════════════════════════════════════════════
   UTILITÁRIOS
═══════════════════════════════════════════════ */
function formatDate(v) { return formatDateBR(v); }
function toInputDate(v) { return toDateInputLocal(v); }

function formatHoras(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return "0h";
  const neg = n < 0;
  const abs = Math.abs(n);
  const h   = Math.floor(abs);
  const m   = Math.round((abs - h) * 60);
  const txt = m === 0 ? `${h}h` : h === 0 ? `${m}min` : `${h}h${String(m).padStart(2, "0")}`;
  return neg ? `-${txt}` : txt;
}

function pct(parte, total) {
  return total ? Math.round(Number(parte || 0) / Number(total) * 100) : 0;
}

/* ── Cor de saúde do card de aula ── */
function bordaAula(status, percentual) {
  const s = String(status || "planejada").toLowerCase();
  if (s === "cancelada")   return colors.danger;
  if (s === "reprogramada") return "#f59e0b";
  if (s === "em_andamento") return colors.primary;
  if (s === "concluida") {
    const n = Number(percentual || 0);
    if (n >= 90) return colors.success;
    if (n >= 75) return "#f59e0b";
    return colors.danger;
  }
  return "#cbd5e1"; // planejada
}

/* ── Badge de percentual ── */
function estiloPercentual(n) {
  if (n >= 95) return { background: colors.successLight, color: colors.successText };
  if (n >= 80) return { background: "#dbeafe",           color: "#1d4ed8"           };
  if (n >= 60) return { background: colors.warningLight, color: colors.warningText  };
  return              { background: colors.dangerLight,  color: colors.dangerText   };
}

const STATUS_LABEL = {
  planejada: "Planejada", em_andamento: "Em andamento",
  concluida: "Concluída", reprogramada: "Reprogramada", cancelada: "Cancelada",
};

/* ═══════════════════════════════════════════════
   CONSTANTES DOS FORMULÁRIOS
═══════════════════════════════════════════════ */
const CARGA_OPTIONS = [
  { value: 0.5, label: "0h30" }, { value: 1,   label: "1h00" },
  { value: 1.5, label: "1h30" }, { value: 2,   label: "2h00" },
  { value: 2.5, label: "2h30" }, { value: 3,   label: "3h00" },
  { value: 3.5, label: "3h30" }, { value: 4,   label: "4h00" },
  { value: 4.5, label: "4h30" }, { value: 5,   label: "5h00" },
  { value: 5.5, label: "5h30" }, { value: 6,   label: "6h00" },
  { value: 6.5, label: "6h30" }, { value: 7,   label: "7h00" },
  { value: 7.5, label: "7h30" }, { value: 8,   label: "8h00" },
];

const TIPO_AULA_OPTIONS = [
  "Aula regular","Reciclagem","Reforço","Repescagem","Reposição","Atualização","Simulado",
];

const STATUS_AULA_OPTIONS = [
  { label: "Planejada",     value: "planejada"    },
  { label: "Em andamento",  value: "em_andamento" },
  { label: "Concluída",     value: "concluida"    },
  { label: "Reprogramada",  value: "reprogramada" },
  { label: "Cancelada",     value: "cancelada"    },
];

function emptyAulaForm(instrutor = "", carga = 1) {
  return {
    id: "", dia: "", titulo: "", data_aula: "",
    instrutor: instrutor || "",
    tipo_aula: "Aula regular",
    status_aula: "planejada",
    carga_planejada: Number(carga || 1),
    objetivo: "", conteudo_programatico: "", observacoes: "",
  };
}

/* ═══════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════ */
export default function CronogramaTurmaPage() {
  const { id } = useParams() || {};

  const [treinamento,       setTreinamento]       = useState(null);
  const [resumosAulas,      setResumosAulas]       = useState([]);
  const [turmasDisponiveis, setTurmasDisponiveis]  = useState([]);
  const [participantes,     setParticipantes]      = useState([]);

  const [loading,           setLoading]            = useState(true);
  const [erro,              setErro]               = useState("");
  const [sucesso,           setSucesso]            = useState("");

  const [aulaForm,          setAulaForm]           = useState(emptyAulaForm());
  const [salvandoAula,      setSalvandoAula]       = useState(false);
  const [abrirForm,         setAbrirForm]          = useState(false);

  const [gerando,           setGerando]            = useState(false);
  const [duplicando,        setDuplicando]         = useState(false);
  const [copiarAberto,      setCopiarAberto]       = useState(false);
  const [turmaOrigemId,     setTurmaOrigemId]      = useState("");

  useEffect(() => { carregarTudo(); }, [id]);

  /* ── carregamento ── */
  async function carregarTudo() {
    if (!id) return;
    try {
      setLoading(true); setErro(""); setSucesso("");

      const [dadosTreinamento, listaTreinamentos, listaParticipantes] = await Promise.all([
        apiFetch(`/treinamentos/${id}`),
        apiFetch("/treinamentos").catch(() => []),   // necessário para copy-cronograma
        apiFetch(`/treinamentos/${id}/participantes`).catch(() => []),
      ]);

      const turmaAtual      = dadosTreinamento || null;
      const listaTurmas     = Array.isArray(listaTreinamentos)  ? listaTreinamentos  : [];
      const listaParticSafe = Array.isArray(listaParticipantes) ? listaParticipantes : [];

      setTreinamento(turmaAtual);
      setParticipantes(listaParticSafe);
      setTurmasDisponiveis(listaTurmas.filter((t) => String(t.id) !== String(id)));

      // Buscar aulas
      let listaAulas = [];
      if (Array.isArray(turmaAtual?.cronograma)) {
        listaAulas = turmaAtual.cronograma;
      } else {
        listaAulas = await apiFetch(`/turma-aulas?treinamento_id=${id}`).catch(() => []);
      }
      const aulasOrdenadas = [...(Array.isArray(listaAulas) ? listaAulas : [])]
        .sort((a, b) => compareLocalDatesAsc(a?.data_aula, b?.data_aula));

      // Buscar resumo de presença por aula (em paralelo)
      const resumos = await Promise.all(
        aulasOrdenadas.map(async (aula, idx) => {
          let resumoPresenca = {
            total: listaParticSafe.length, presentes: 0, ausentes: 0,
            justificados: 0, pendentes: listaParticSafe.length, percentual: 0,
          };
          try {
            const r = await apiFetch(`/presenca-aulas/resumo/${aula.id}`).catch(() => null);
            const base = r?.resumo || r || null;
            if (base && typeof base === "object") {
              resumoPresenca = {
                total:        Number(base.total         || listaParticSafe.length || 0),
                presentes:    Number(base.presentes     || 0),
                ausentes:     Number(base.ausentes      || 0),
                justificados: Number(base.justificados  || 0),
                pendentes:    Number(base.pendentes     || 0),
                percentual:   Number(base.percentual    || base.taxa_presenca || 0),
              };
            }
          } catch { /* mantém padrão */ }

          return {
            turma_aula_id:         aula.id,
            data_aula:             aula.data_aula,
            dia:                   aula.dia_numero || idx + 1,
            titulo:                aula.titulo || `Aula ${idx + 1}`,
            tipo_aula:             aula.metodologia || "Aula regular",
            status_aula:           aula.status_execucao || "planejada",
            objetivo:              aula.objetivo || "",
            conteudo_programatico: aula.conteudo_planejado || "",
            observacoes:           aula.observacoes_execucao || "",
            instrutor:             aula.instrutor_responsavel || turmaAtual?.instrutor || "",
            carga_planejada:       Number(aula.carga_horaria_planejada || 0),
            carga_real:            Number(aula.carga_horaria_real     || 0),
            ...resumoPresenca,
          };
        })
      );

      setResumosAulas(resumos);
      setAulaForm(emptyAulaForm(turmaAtual?.instrutor || "", Number(turmaAtual?.carga_horaria || 1)));
    } catch (err) {
      setErro(err.message || "Erro ao carregar cronograma.");
    } finally {
      setLoading(false);
    }
  }

  /* ── KPIs agregados ── */
  const resumoGeral = useMemo(() => {
    const totalAulas       = resumosAulas.length;
    const aulasComPresenca = resumosAulas.filter(
      (a) => a.presentes > 0 || a.ausentes > 0 || a.justificados > 0
    ).length;
    const totalPresentes   = resumosAulas.reduce((acc, a) => acc + a.presentes,    0);
    const totalEsperado    = resumosAulas.reduce((acc, a) => acc + a.total,         0);
    const totalPendentes   = resumosAulas.reduce((acc, a) => acc + a.pendentes,    0);
    const totalAusentes    = resumosAulas.reduce((acc, a) => acc + a.ausentes,     0);
    const aderenciaMedia   = pct(totalPresentes, totalEsperado);
    return { totalAulas, aulasComPresenca, totalPresentes, totalEsperado,
             totalPendentes, totalAusentes, aderenciaMedia, ativos: participantes.length };
  }, [resumosAulas, participantes]);

  /* ── ações ── */
  async function gerarCronogramaAutomatico() {
    try {
      setGerando(true); setErro(""); setSucesso("");
      await apiFetch("/turma-aulas/gerar-cronograma", {
        method: "POST",
        body: JSON.stringify({ treinamento_id: Number(id) }),
      });
      setSucesso("Cronograma gerado com sucesso."); await carregarTudo();
    } catch (err) { setErro(err.message || "Erro ao gerar cronograma."); }
    finally { setGerando(false); }
  }

  async function copiarCronograma() {
    if (!turmaOrigemId) { setErro("Selecione uma turma de origem."); return; }
    try {
      setDuplicando(true); setErro(""); setSucesso("");
      await apiFetch("/turma-aulas/duplicar", {
        method: "POST",
        body: JSON.stringify({
          treinamento_origem_id:  Number(turmaOrigemId),
          treinamento_destino_id: Number(id),
        }),
      });
      setSucesso("Cronograma copiado com sucesso.");
      setCopiarAberto(false); setTurmaOrigemId("");
      await carregarTudo();
    } catch (err) { setErro(err.message || "Erro ao copiar cronograma."); }
    finally { setDuplicando(false); }
  }

  function editarAula(aula) {
    setAulaForm({
      id:                    aula.turma_aula_id || "",
      dia:                   aula.dia || "",
      titulo:                aula.titulo || "",
      data_aula:             toInputDate(aula.data_aula),
      instrutor:             aula.instrutor || treinamento?.instrutor || "",
      tipo_aula:             aula.tipo_aula || "Aula regular",
      status_aula:           aula.status_aula || "planejada",
      carga_planejada:       Number(aula.carga_planejada || 1),
      objetivo:              aula.objetivo || "",
      conteudo_programatico: aula.conteudo_programatico || "",
      observacoes:           aula.observacoes || "",
    });
    setAbrirForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function limparForm() {
    setAulaForm(emptyAulaForm(treinamento?.instrutor || "", Number(treinamento?.carga_horaria || 1)));
    setAbrirForm(false);
  }

  async function salvarAula() {
    try {
      setSalvandoAula(true); setErro(""); setSucesso("");
      const payload = {
        treinamento_id:          Number(id),
        dia_numero:              Number(aulaForm.dia || 0),
        data_aula:               aulaForm.data_aula,
        ordem:                   1,
        titulo:                  aulaForm.titulo,
        objetivo:                aulaForm.objetivo         || null,
        conteudo_planejado:      aulaForm.conteudo_programatico || null,
        metodologia:             aulaForm.tipo_aula        || null,
        carga_horaria_planejada: Number(aulaForm.carga_planejada || 0),
        instrutor_responsavel:   aulaForm.instrutor        || null,
        material_apoio:          null,
        status_execucao:         aulaForm.status_aula      || "planejada",
        conteudo_ministrado:     null,
        carga_horaria_real:      0,
        observacoes_execucao:    aulaForm.observacoes      || null,
        reprogramada:            false,
        motivo_reprogramacao:    null,
        ministrada_em:           null,
      };
      if (!payload.treinamento_id || !payload.dia_numero || !payload.data_aula || !payload.titulo) {
        throw new Error("Preencha treinamento, dia, data e título.");
      }
      if (aulaForm.id) {
        await apiFetch(`/turma-aulas/${aulaForm.id}`, { method: "PUT", body: JSON.stringify(payload) });
        setSucesso("Aula atualizada com sucesso.");
      } else {
        await apiFetch("/turma-aulas", { method: "POST", body: JSON.stringify(payload) });
        setSucesso("Aula cadastrada com sucesso.");
      }
      limparForm(); await carregarTudo();
    } catch (err) { setErro(err.message || "Erro ao salvar aula."); }
    finally { setSalvandoAula(false); }
  }

  async function excluirAula(aulaId) {
    if (!window.confirm("Excluir esta aula do cronograma?")) return;
    try {
      setErro(""); setSucesso("");
      await apiFetch(`/turma-aulas/${aulaId}`, { method: "DELETE" });
      setSucesso("Aula excluída.");
      if (String(aulaForm.id) === String(aulaId)) limparForm();
      await carregarTudo();
    } catch (err) { setErro(err.message || "Erro ao excluir aula."); }
  }

  function abrirChamada(aula) {
    window.location.href = `/turma/${id}/chamada?turma_aula_id=${aula.turma_aula_id}&data_aula=${aula.data_aula}&origem=cronograma`;
  }

  async function exportarPrimeiraAula() {
    try {
      setErro(""); setSucesso("");
      await apiDownload(`/treinamentos/${id}/exportar-primeira-aula`, `turma-${id}-primeira-aula.xlsx`);
      setSucesso("Arquivo exportado com sucesso.");
    } catch (err) { setErro(err.message || "Erro ao exportar."); }
  }

  function campo(key) {
    return (e) => setAulaForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  /* ══════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════ */
  return (
    <TurmaPageShell id={id} treinamento={treinamento} loading={loading} abaAtiva="cronograma">

      {/* Feedback */}
      {erro    && <div style={errorBox}>{erro}</div>}
      {sucesso && <div style={successBox}>{sucesso}</div>}

      {/* ── KPIs ── */}
      <div style={kpiGrid}>
        <StatCard title="Aulas" value={resumoGeral.totalAulas}       subtitle="no cronograma"   accent={chart.blue}   />
        <StatCard title="Com presença" value={resumoGeral.aulasComPresenca} subtitle="aulas lançadas" accent={chart.cyan}   />
        <StatCard title="Presenças"   value={resumoGeral.totalPresentes} subtitle="acumuladas"  accent={colors.success} />
        <StatCard title="Ausências"   value={resumoGeral.totalAusentes}  subtitle="acumuladas"  accent={colors.danger}  />
        <StatCard title="Pendências"  value={resumoGeral.totalPendentes}
          subtitle="sem confirmação"
          accent={resumoGeral.totalPendentes > 0 ? colors.warning : colors.neutral}
        />
        <StatCard title="Aderência"   value={`${resumoGeral.aderenciaMedia}%`} subtitle="média da turma" accent={chart.purple} />
      </div>

      {/* ── Barra de ações ── */}
      <div style={acoesCard}>
        <div style={acoesRow}>
          <button style={btnCoral}
            onClick={gerarCronogramaAutomatico} disabled={gerando}>
            {gerando ? "Gerando…" : "Gerar cronograma"}
          </button>
          <button style={btnOutline}
            onClick={() => { setCopiarAberto((v) => !v); }}>
            {copiarAberto ? "Fechar cópia" : "Copiar de outra turma"}
          </button>
          <button style={btnOutline}
            onClick={() => window.location.href = `/turma/${id}/participantes`}>
            Base da turma
          </button>
          <button style={btnGhost} onClick={exportarPrimeiraAula}>
            Exportar 1ª aula
          </button>
          <button style={{ ...btnOutline, marginLeft: "auto" }}
            onClick={() => { setAbrirForm((v) => !v); }}>
            {abrirForm ? "Fechar formulário" : aulaForm.id ? "Editar aula" : "+ Nova aula"}
          </button>
        </div>

        {/* Copy-cronograma expandido */}
        {copiarAberto && (
          <div style={copyBox}>
            <label style={fieldLabel}>Turma de origem</label>
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={turmaOrigemId}
                onChange={(e) => setTurmaOrigemId(e.target.value)}
                style={{ ...fieldInput, flex: "1 1 260px" }}
              >
                <option value="">Selecione uma turma…</option>
                {turmasDisponiveis.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.tema || "Sem nome"} · {t.cliente || "—"} · {formatDate(t.data_inicio || t.data)}
                  </option>
                ))}
              </select>
              <button style={btnCoral} onClick={copiarCronograma} disabled={duplicando || !turmaOrigemId}>
                {duplicando ? "Copiando…" : "Confirmar cópia"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Formulário de aula (colapsável) ── */}
      {abrirForm && (
        <div style={formCard}>
          <div style={formTitulo}>
            {aulaForm.id ? "Editar plano de aula" : "Nova aula"}
          </div>
          <div style={formGrid}>
            <Field label="Dia">
              <input type="number" min="1" value={aulaForm.dia} onChange={campo("dia")} style={fieldInput} />
            </Field>
            <Field label="Título">
              <input value={aulaForm.titulo} onChange={campo("titulo")} style={fieldInput} />
            </Field>
            <Field label="Data">
              <input type="date" value={aulaForm.data_aula} onChange={campo("data_aula")} style={fieldInput} />
            </Field>
            <Field label="Instrutor">
              <input value={aulaForm.instrutor} onChange={campo("instrutor")} style={fieldInput} />
            </Field>
            <Field label="Tipo">
              <select value={aulaForm.tipo_aula} onChange={campo("tipo_aula")} style={fieldInput}>
                {TIPO_AULA_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={aulaForm.status_aula} onChange={campo("status_aula")} style={fieldInput}>
                {STATUS_AULA_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Carga planejada">
              <select value={String(aulaForm.carga_planejada)}
                onChange={(e) => setAulaForm((p) => ({ ...p, carga_planejada: Number(e.target.value) }))}
                style={fieldInput}>
                {CARGA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Objetivo" full>
              <textarea value={aulaForm.objetivo} onChange={campo("objetivo")} rows={2} style={textArea} />
            </Field>
            <Field label="Conteúdo programático" full>
              <textarea value={aulaForm.conteudo_programatico} onChange={campo("conteudo_programatico")} rows={2} style={textArea} />
            </Field>
            <Field label="Observações" full>
              <textarea value={aulaForm.observacoes} onChange={campo("observacoes")} rows={2} style={textArea} />
            </Field>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button style={btnCoral} onClick={salvarAula} disabled={salvandoAula}>
              {salvandoAula ? "Salvando…" : aulaForm.id ? "Salvar alterações" : "Cadastrar aula"}
            </button>
            <button style={btnGhost} onClick={limparForm}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Painel por dia ── */}
      {!loading && (
        <>
          <div style={painelHeader}>
            <span style={painelTitulo}>Painel por dia</span>
            <span style={painelCount}>
              {resumosAulas.length} aula{resumosAulas.length !== 1 ? "s" : ""}
            </span>
          </div>

          {resumosAulas.length === 0 ? (
            <div style={emptyState}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
              <div style={{ fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                Cronograma vazio
              </div>
              <div style={{ color: "#94a3b8", fontSize: 14 }}>
                Gere automaticamente ou adicione aulas manualmente usando o botão acima.
              </div>
            </div>
          ) : (
            <div style={cardsGrid}>
              {resumosAulas.map((aula, idx) => {
                const borda     = bordaAula(aula.status_aula, aula.percentual);
                const pctNum    = Number(aula.percentual || 0);
                const pctEstilo = estiloPercentual(pctNum);
                const desvio    = Number(aula.carga_real || 0) - Number(aula.carga_planejada || 0);
                const temPresenca = aula.presentes > 0 || aula.ausentes > 0 || aula.justificados > 0;

                return (
                  <div key={aula.turma_aula_id || idx} style={{ ...aulaCard, borderLeft: `4px solid ${borda}` }}>

                    {/* Topo: dia/título + badge % */}
                    <div style={cardTopo}>
                      <div>
                        <div style={cardDia}>
                          Dia {aula.dia || idx + 1}
                        </div>
                        <div style={cardTitulo}>
                          {aula.titulo}
                        </div>
                      </div>
                      {temPresenca && (
                        <span style={{ ...pctBadge, ...pctEstilo }}>
                          {pctNum}%
                        </span>
                      )}
                    </div>

                    {/* Meta: data · instrutor · tipo */}
                    <div style={cardMeta}>
                      <span style={metaChip}>{formatDate(aula.data_aula)}</span>
                      <span style={metaChip}>{STATUS_LABEL[aula.status_aula] || aula.status_aula}</span>
                      <span style={metaChip}>{aula.tipo_aula || "Aula regular"}</span>
                    </div>

                    {/* Barra de aderência (só se tiver presença) */}
                    {temPresenca && (
                      <div style={{ marginTop: 4 }}>
                        <div style={progressTrack}>
                          <div style={{ ...progressBar, width: `${pctNum}%`, background: borda }} />
                        </div>
                      </div>
                    )}

                    {/* Mini stats de presença */}
                    <div style={miniRow}>
                      <MiniStat label="pres."  value={aula.presentes}    cor={colors.successText}  bg={colors.successLight}  />
                      <MiniStat label="aus."   value={aula.ausentes}     cor={colors.dangerText}   bg={colors.dangerLight}   />
                      <MiniStat label="just."  value={aula.justificados} cor={colors.warningText}  bg={colors.warningLight}  />
                      {aula.pendentes > 0 && (
                        <MiniStat label="pend." value={aula.pendentes}   cor="#64748b"             bg="#f1f5f9"              />
                      )}
                    </div>

                    {/* Carga (só se relevante) */}
                    <div style={cardCarga}>
                      <span>{formatHoras(aula.carga_planejada)} plan.</span>
                      {aula.carga_real > 0 && (
                        <>
                          <span>·</span>
                          <span>{formatHoras(aula.carga_real)} real</span>
                          {desvio !== 0 && (
                            <span style={{ color: desvio < 0 ? colors.dangerText : colors.successText, fontWeight: 700 }}>
                              ({desvio > 0 ? "+" : ""}{formatHoras(desvio)})
                            </span>
                          )}
                        </>
                      )}
                      {aula.instrutor && <span style={{ marginLeft: "auto", color: "#94a3b8" }}>{aula.instrutor}</span>}
                    </div>

                    {/* Objetivo (truncado) */}
                    {aula.objetivo && (
                      <p style={cardObjetivo}>
                        {aula.objetivo.length > 100 ? aula.objetivo.slice(0, 100) + "…" : aula.objetivo}
                      </p>
                    )}

                    {/* Ações */}
                    <div style={cardAcoes}>
                      <button style={btnChamada} onClick={() => abrirChamada(aula)}>
                        Abrir chamada
                      </button>
                      <button style={btnEdit}   onClick={() => editarAula(aula)}>Editar</button>
                      <button style={btnDel}    onClick={() => excluirAula(aula.turma_aula_id)}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </TurmaPageShell>
  );
}

/* ── Sub-componentes ── */
function Field({ label, children, full = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: full ? "1 / -1" : "auto" }}>
      <label style={fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function MiniStat({ label, value, cor, bg }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1, background: bg, borderRadius: 8, padding: "4px 8px", minWidth: 38 }}>
      <span style={{ fontSize: 15, fontWeight: 800, color: cor, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, color: cor, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</span>
    </div>
  );
}

/* ── Estilos ── */
const errorBox   = { background: colors.dangerLight,  color: colors.dangerText,  border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 12 };
const successBox = { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 12 };

const kpiGrid = { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12, marginBottom: 14 };

const acoesCard = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: "14px 16px", marginBottom: 14 };
const acoesRow  = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

const btnCoral   = { background: colors.accent,  color: "#fff",     border: 0, borderRadius: 10, padding: "9px 16px", cursor: "pointer", fontWeight: 700, fontSize: 13 };
const btnOutline = { background: "#fff",          color: "#334155",  border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const btnGhost   = { background: "#f8fafc",       color: "#94a3b8",  border: "1px solid #e9eef4", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 };

const copyBox  = { marginTop: 12, padding: "12px 14px", background: "#f8fbff", border: "1px solid #dbeafe", borderRadius: 12 };
const fieldLabel = { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" };
const fieldInput = { height: 38, borderRadius: 10, border: "1px solid #e2e8f0", padding: "0 10px", fontSize: 13, color: "#334155", outline: "none", boxSizing: "border-box", width: "100%" };
const textArea   = { width: "100%", boxSizing: "border-box", borderRadius: 10, border: "1px solid #e2e8f0", padding: "8px 10px", fontSize: 13, resize: "vertical", fontFamily: "inherit", color: "#334155", outline: "none" };

const formCard  = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 18, marginBottom: 14 };
const formTitulo = { fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 12 };
const formGrid  = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 };

const painelHeader = { display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 };
const painelTitulo = { fontSize: 18, fontWeight: 800, color: "#0f172a" };
const painelCount  = { fontSize: 14, color: "#94a3b8" };

const cardsGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 };

const aulaCard = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 8 };
const cardTopo   = { display: "flex", justifyContent: "space-between", alignItems: "flex-start" };
const cardDia    = { fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 2 };
const cardTitulo = { fontSize: 15, fontWeight: 800, color: "#0f172a", lineHeight: 1.2 };
const cardMeta   = { display: "flex", gap: 6, flexWrap: "wrap" };
const metaChip   = { fontSize: 11, fontWeight: 600, color: "#64748b", background: "#f1f5f9", borderRadius: 999, padding: "2px 8px" };
const pctBadge   = { fontSize: 16, fontWeight: 800, borderRadius: 8, padding: "3px 10px", flexShrink: 0 };

const progressTrack = { height: 5, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" };
const progressBar   = { height: "100%", borderRadius: 999 };

const miniRow = { display: "flex", gap: 6, flexWrap: "wrap" };

const cardCarga   = { display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "#64748b", flexWrap: "wrap" };
const cardObjetivo = { margin: 0, fontSize: 12, color: "#94a3b8", lineHeight: 1.4, fontStyle: "italic" };
const cardAcoes   = { display: "flex", gap: 6, marginTop: 2 };

const btnChamada = { flex: 1, background: colors.accent, color: "#fff", border: 0, borderRadius: 9, padding: "8px 0", cursor: "pointer", fontWeight: 700, fontSize: 12 };
const btnEdit    = { background: "#f8fafc", color: "#334155", border: "1px solid #e2e8f0", borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600 };
const btnDel     = { background: colors.dangerLight, color: colors.dangerText, border: `1px solid #fecaca`, borderRadius: 9, padding: "8px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 };

const emptyState = { textAlign: "center", padding: "40px 24px", border: "1px dashed #e2e8f0", borderRadius: 16, background: "#fafafa" };
