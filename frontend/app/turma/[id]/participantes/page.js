"use client";

import { useEffect, useMemo, useState }    from "react";
import { useParams }                        from "next/navigation";
import TurmaPageShell                       from "../../../../components/TurmaPageShell";
import { apiDownload, apiFetch }            from "../../../../services/api";
import { formatDateBR }                     from "../../../../lib/date";
import { colors }                           from "../../../../lib/theme";

function formatDate(v) { return formatDateBR(v); }

function emptyForm(cliente = "", turma = "", supervisor = "") {
  return { nome: "", matricula: "", cliente, turma, supervisor, operacao: "", data_admissao: "" };
}

/* ─── STATUS de presença → estilo ─── */
function estiloStatus(status) {
  const s = String(status || "pendente").toLowerCase();
  if (s === "presente")  return { background: colors.successLight, color: colors.successText };
  if (s === "ausente")   return { background: colors.dangerLight,  color: colors.dangerText  };
  if (s === "justificado") return { background: colors.warningLight, color: colors.warningText };
  return { background: "#f1f5f9", color: "#64748b" };
}

/* ─── FREQUÊNCIA → estilo ─── */
function estiloFreq(pct) {
  const n = Number(pct || 0);
  if (n >= 90) return { background: colors.successLight, color: colors.successText };
  if (n >= 75) return { background: colors.warningLight, color: colors.warningText };
  return         { background: colors.dangerLight,  color: colors.dangerText  };
}

export default function ParticipantesTurmaPage() {
  const { id } = useParams() || {};

  const [treinamento,   setTreinamento]   = useState(null);
  const [participantes, setParticipantes] = useState([]);
  const [frequencias,   setFrequencias]   = useState([]);
  const [arquivo,       setArquivo]       = useState(null);
  const [form,          setForm]          = useState(emptyForm());
  const [loading,       setLoading]       = useState(true);
  const [importando,    setImportando]    = useState(false);
  const [salvando,      setSalvando]      = useState(false);
  const [erro,          setErro]          = useState("");
  const [sucesso,       setSucesso]       = useState("");
  const [busca,         setBusca]         = useState("");

  /* Seções colapsáveis */
  const [abrirImport, setAbrirImport] = useState(false);
  const [abrirManual, setAbrirManual] = useState(false);

  useEffect(() => { carregarTudo(); }, [id]);

  async function carregarTudo() {
    if (!id) return;
    try {
      setLoading(true);
      setErro(""); setSucesso("");
      const [dadosTreinamento, listaParticipantes, frequenciaData] = await Promise.all([
        apiFetch(`/treinamentos/${id}`),
        apiFetch(`/treinamentos/${id}/participantes`).catch(() => []),
        apiFetch(`/frequencia-individual?treinamento_id=${id}`).catch(() => null),
      ]);
      setTreinamento(dadosTreinamento || null);
      setParticipantes(Array.isArray(listaParticipantes) ? listaParticipantes : []);
      setFrequencias(Array.isArray(frequenciaData?.itens) ? frequenciaData.itens : []);
      setForm(emptyForm(
        dadosTreinamento?.cliente   || "",
        dadosTreinamento?.tema      || "",
        dadosTreinamento?.supervisor || ""
      ));
    } catch (err) {
      setErro(err.message || "Erro ao carregar participantes.");
    } finally {
      setLoading(false);
    }
  }

  async function importarExcel() {
    if (!arquivo) { setErro("Selecione um arquivo Excel."); return; }
    try {
      setImportando(true); setErro(""); setSucesso("");
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      fd.append("treinamento_id", String(id));
      await apiFetch("/treinamentos/importar-participantes", { method: "POST", body: fd });
      setSucesso("Participantes importados com sucesso.");
      setArquivo(null); setAbrirImport(false);
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao importar Excel.");
    } finally {
      setImportando(false);
    }
  }

  async function adicionarParticipanteManual() {
    if (!form.nome || !form.matricula || !form.cliente || !form.turma) {
      setErro("Preencha nome, matrícula, cliente e turma."); return;
    }
    try {
      setSalvando(true); setErro(""); setSucesso("");
      await apiFetch(`/treinamentos/${id}/participantes`, {
        method: "POST",
        body: JSON.stringify({
          nome: form.nome, matricula: form.matricula, cliente: form.cliente,
          turma: form.turma, supervisor: form.supervisor,
          operacao: form.operacao, data_admissao: form.data_admissao || "",
        }),
      });
      setSucesso("Participante adicionado com sucesso.");
      setForm(emptyForm(treinamento?.cliente || "", treinamento?.tema || "", treinamento?.supervisor || ""));
      setAbrirManual(false);
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Não foi possível adicionar manualmente.");
    } finally {
      setSalvando(false);
    }
  }

  async function exportarPrimeiraAula() {
    try {
      setErro(""); setSucesso("");
      await apiDownload(`/treinamentos/${id}/exportar-primeira-aula`, `turma-${id}-primeira-aula.xlsx`);
      setSucesso("Arquivo exportado com sucesso.");
    } catch (err) { setErro(err.message || "Erro ao exportar."); }
  }

  async function removerParticipante(item) {
    if (!window.confirm(`Remover ${item.nome} da turma?`)) return;
    try {
      setErro(""); setSucesso("");
      if (!item?.id) throw new Error("Participante sem identificador.");
      await apiFetch(`/treinamentos/participantes/${item.id}`, { method: "DELETE" });
      setParticipantes((prev) => prev.filter((p) => p.id !== item.id));
      setSucesso("Participante removido.");
      await carregarTudo();
    } catch (err) { setErro(err.message || "Erro ao remover."); }
  }

  /* Resumo rápido */
  const resumo = useMemo(() => {
    const total    = participantes.length;
    const removidos = participantes.filter(
      (p) => String(p.status_presenca || "").toLowerCase() === "removido"
    ).length;
    const ativos   = total - removidos;
    return { total, ativos, inativos: removidos };
  }, [participantes]);

  /* Lista filtrada */
  const listaFiltrada = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return participantes;
    return participantes.filter((p) =>
      [p.nome, p.matricula, p.operacao, p.supervisor]
        .join(" ").toLowerCase().includes(t)
    );
  }, [participantes, busca]);

  function campo(key) {
    return (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  return (
    <TurmaPageShell id={id} treinamento={treinamento} loading={loading} abaAtiva="participantes">

      {/* Feedback */}
      {erro    && <div style={errorBox}>{erro}</div>}
      {sucesso && <div style={successBox}>{sucesso}</div>}

      {/* ── KPIs rápidos ── */}
      <div style={kpiRow}>
        {[
          { label: "Total",   value: resumo.total,   cor: "#334155"         },
          { label: "Ativos",  value: resumo.ativos,  cor: colors.success    },
          { label: "Inativos",value: resumo.inativos,cor: resumo.inativos > 0 ? colors.danger : "#94a3b8" },
          { label: "Com freq.",
            value: frequencias.length,
            cor: frequencias.length > 0 ? colors.primary : "#94a3b8" },
        ].map(({ label, value, cor }) => (
          <div key={label} style={kpiChip}>
            <span style={{ fontSize: 26, fontWeight: 900, color: cor, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>{label}</span>
          </div>
        ))}

        {/* Ações no canto direito dos KPIs */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button style={btnOutline} onClick={() => { setAbrirImport((v) => !v); setAbrirManual(false); }}>
            {abrirImport ? "Fechar import" : "↑ Importar Excel"}
          </button>
          <button style={btnOutline} onClick={() => { setAbrirManual((v) => !v); setAbrirImport(false); }}>
            {abrirManual ? "Fechar form." : "+ Adicionar manual"}
          </button>
          <button style={btnGhost} onClick={exportarPrimeiraAula}>
            Exportar 1ª aula
          </button>
        </div>
      </div>

      {/* ── Seção: Importar Excel (colapsável) ── */}
      {abrirImport && (
        <div style={secaoCard}>
          <div style={secaoHeader}>
            <div>
              <div style={secaoTitulo}>Importar base via Excel</div>
              <div style={secaoSub}>Importe uma única vez e reutilize nas aulas do cronograma.</div>
            </div>
          </div>
          <div style={importRow}>
            <input
              type="file" accept=".xlsx,.xls"
              onChange={(e) => setArquivo(e.target.files?.[0] || null)}
              style={{ fontSize: 13 }}
            />
            <button style={btnCoral} onClick={importarExcel} disabled={importando}>
              {importando ? "Importando…" : "Importar"}
            </button>
          </div>
          <p style={helperText}>
            Colunas obrigatórias: <strong>nome</strong>, <strong>matricula</strong>,{" "}
            <strong>cliente</strong>, <strong>turma</strong>, <strong>supervisor</strong>,{" "}
            <strong>operacao</strong>, <strong>data_admissao</strong>.
          </p>
        </div>
      )}

      {/* ── Seção: Formulário manual (colapsável) ── */}
      {abrirManual && (
        <div style={secaoCard}>
          <div style={secaoTitulo}>Adicionar participante manualmente</div>
          <div style={secaoSub}>Inclusão individual usando a mesma estrutura da base da turma.</div>
          <div style={formGrid}>
            {[
              { key: "nome",          label: "Nome",          placeholder: "Nome completo" },
              { key: "matricula",     label: "Matrícula",     placeholder: "Matrícula" },
              { key: "cliente",       label: "Cliente",       placeholder: "Cliente" },
              { key: "turma",         label: "Turma",         placeholder: "Turma" },
              { key: "supervisor",    label: "Supervisor",    placeholder: "Supervisor" },
              { key: "operacao",      label: "Operação",      placeholder: "Operação" },
            ].map(({ key, label, placeholder }) => (
              <div key={key} style={fieldWrap}>
                <label style={fieldLabel}>{label}</label>
                <input
                  value={form[key]}
                  onChange={campo(key)}
                  placeholder={placeholder}
                  style={fieldInput}
                />
              </div>
            ))}
            <div style={fieldWrap}>
              <label style={fieldLabel}>Data admissão</label>
              <input
                type="date"
                value={form.data_admissao}
                onChange={campo("data_admissao")}
                style={fieldInput}
              />
            </div>
          </div>
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button style={btnCoral} onClick={adicionarParticipanteManual} disabled={salvando}>
              {salvando ? "Salvando…" : "Adicionar participante"}
            </button>
            <button style={btnGhost} onClick={() => setAbrirManual(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Tabela de participantes ── */}
      <div style={tabelaCard}>
        <div style={tabelaHeader}>
          <div>
            <span style={secaoTitulo}>Base da turma</span>
            <span style={contagem}>
              {" "}{listaFiltrada.length} de {participantes.length} participante{participantes.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div style={{ position: "relative" }}>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round"
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
            >
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              placeholder="Buscar participante…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={searchInput}
            />
          </div>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                {["Nome","Matrícula","Cliente","Supervisor","Operação","Admissão","Status","Freq.",""].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.length === 0 ? (
                <tr>
                  <td colSpan={9} style={tdVazio}>
                    {busca ? "Nenhum participante encontrado para a busca." : "Nenhum participante importado ainda."}
                  </td>
                </tr>
              ) : (
                listaFiltrada.map((item, idx) => {
                  const freq = frequencias.find(
                    (f) => String(f.treinando_nome || "").trim().toLowerCase() ===
                           String(item.nome || "").trim().toLowerCase()
                  );
                  const statusStr = item.status_presenca || "pendente";
                  return (
                    <tr key={item.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ ...td, fontWeight: 600 }}>{item.nome}</td>
                      <td style={{ ...td, color: "#64748b" }}>{item.matricula}</td>
                      <td style={td}>{item.cliente}</td>
                      <td style={td}>{item.supervisor || "—"}</td>
                      <td style={td}>{item.operacao   || "—"}</td>
                      <td style={{ ...td, color: "#64748b" }}>{formatDate(item.data_admissao)}</td>
                      <td style={td}>
                        <span style={{ ...pill, ...estiloStatus(statusStr) }}>
                          {statusStr}
                        </span>
                      </td>
                      <td style={td}>
                        {freq ? (
                          <span style={{ ...pill, ...estiloFreq(freq.frequencia_percentual) }}>
                            {freq.frequencia_percentual}%
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>s/d</span>
                        )}
                      </td>
                      <td style={td}>
                        <button style={btnRemover} onClick={() => removerParticipante(item)}>
                          Remover
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </TurmaPageShell>
  );
}

/* ── Estilos ─────────────────────────────── */
const errorBox   = { background: colors.dangerLight,  color: colors.dangerText,  border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 12 };
const successBox = { background: colors.successLight, color: colors.successText, border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 12 };

const kpiRow  = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 };
const kpiChip = { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, background: "#fff", border: "1px solid #e9eef4", borderRadius: 12, padding: "10px 16px" };

const btnCoral   = { background: colors.accent, color: "#fff", border: 0, borderRadius: 10, padding: "9px 18px", cursor: "pointer", fontWeight: 700, fontSize: 13 };
const btnOutline = { background: "#fff", color: "#334155", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const btnGhost   = { background: "#f8fafc", color: "#94a3b8", border: "1px solid #e9eef4", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 };

const secaoCard   = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 18, marginBottom: 12 };
const secaoHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 };
const secaoTitulo = { fontSize: 15, fontWeight: 800, color: "#0f172a" };
const secaoSub    = { fontSize: 13, color: "#94a3b8", marginTop: 2 };
const contagem    = { fontSize: 13, color: "#94a3b8", fontWeight: 500 };

const importRow  = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 };
const helperText = { margin: 0, fontSize: 12, color: "#94a3b8" };

const formGrid   = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 14 };
const fieldWrap  = { display: "flex", flexDirection: "column", gap: 5 };
const fieldLabel = { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" };
const fieldInput = { height: 38, borderRadius: 10, border: "1px solid #e2e8f0", padding: "0 10px", fontSize: 13, color: "#334155", outline: "none", boxSizing: "border-box" };

const tabelaCard   = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 18 };
const tabelaHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 };
const searchInput  = { height: 36, paddingLeft: 32, paddingRight: 10, borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 13, color: "#334155", outline: "none", width: 220 };

const tableWrap = { overflowX: "auto" };
const table     = { width: "100%", borderCollapse: "collapse" };
const th        = { textAlign: "left", padding: "9px 12px", borderBottom: "1px solid #f1f5f9", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap" };
const td        = { padding: "10px 12px", borderBottom: "1px solid #f8fafc", fontSize: 13, color: "#334155", verticalAlign: "middle" };
const tdVazio   = { padding: "24px 12px", textAlign: "center", color: "#94a3b8", fontSize: 13 };

const pill     = { display: "inline-block", borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 700 };
const btnRemover = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" };
