"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../services/api";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tel-td-portal-production.up.railway.app/api";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
}

function toInputDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export default function ChamadaTurma({ params }) {
  const { id } = params;

  const [participantes, setParticipantes] = useState([]);
  const [treinamento, setTreinamento] = useState(null);
  const [arquivo, setArquivo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState("");
  const [dataChamada, setDataChamada] = useState("");
  const [selecionados, setSelecionados] = useState({});
  const [busca, setBusca] = useState("");

  useEffect(() => {
    carregarBase();
  }, []);

  useEffect(() => {
    if (dataChamada) {
      carregarParticipantesPorData(dataChamada);
    }
  }, [dataChamada]);

  async function carregarBase() {
    try {
      setErro("");

      const dadosTreinamento = await apiFetch(`/treinamentos/${id}`).catch(
        (err) => {
          throw new Error(`Erro ao buscar treinamento: ${err.message}`);
        }
      );

      setTreinamento(dadosTreinamento || null);

      const dataInicial =
        dadosTreinamento?.data_inicio ||
        dadosTreinamento?.data ||
        new Date().toISOString().slice(0, 10);

      setDataChamada(toInputDate(dataInicial));
    } catch (err) {
      setErro(err.message || "Não foi possível carregar a turma.");
      setLoading(false);
    }
  }

  async function carregarParticipantesPorData(data) {
    try {
      const dadosParticipantes = await apiFetch(
        `/treinamentos/${id}/participantes?data=${encodeURIComponent(data)}`
      ).catch((err) => {
        throw new Error(`Erro ao buscar participantes: ${err.message}`);
      });

      const lista = Array.isArray(dadosParticipantes) ? dadosParticipantes : [];
      setParticipantes(lista);
      setSelecionados({});
      setBusca("");
    } catch (err) {
      setErro(err.message || "Erro ao buscar participantes.");
    } finally {
      setLoading(false);
    }
  }

  function alterarStatus(indexReal, status) {
    const copia = [...participantes];
    copia[indexReal].status_presenca = status;
    setParticipantes(copia);
  }

  function alterarJustificativa(indexReal, valor) {
    const copia = [...participantes];
    copia[indexReal].justificativa = valor;
    setParticipantes(copia);
  }

  function toggleSelecionado(chave) {
    setSelecionados((prev) => ({
      ...prev,
      [chave]: !prev[chave],
    }));
  }

  function selecionarTodosFiltrados() {
    const mapa = { ...selecionados };

    participantesFiltrados.forEach((item) => {
      mapa[item._rowKey] = true;
    });

    setSelecionados(mapa);
  }

  function limparSelecao() {
    setSelecionados({});
  }

  function aplicarStatusEmMassa(status) {
    const copia = [...participantes];

    participantesFiltrados.forEach((item) => {
      if (selecionados[item._rowKey]) {
        copia[item._indexReal].status_presenca = status;
      }
    });

    setParticipantes(copia);
  }

  async function importarExcel() {
    if (!arquivo) {
      alert("Selecione um arquivo Excel.");
      return;
    }

    try {
      setImportando(true);
      setErro("");

      const token =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;

      const formData = new FormData();
      formData.append("arquivo", arquivo);
      formData.append("treinamento_id", id);

      const response = await fetch(`${API_URL}/treinamentos/importar-participantes`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      const contentType = response.headers.get("content-type") || "";
      let data;

      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Resposta inválida da API: ${text.slice(0, 120)}`);
      }

      if (!response.ok) {
        throw new Error(data.message || "Erro ao importar planilha");
      }

      alert("Participantes importados com sucesso.");
      setArquivo(null);
      await carregarParticipantesPorData(dataChamada);
    } catch (err) {
      setErro(err.message || "Erro ao importar participantes.");
    } finally {
      setImportando(false);
    }
  }

  async function salvarChamada() {
    try {
      setSalvando(true);
      setErro("");

      await apiFetch(`/treinamentos/salvar-chamada`, {
        method: "POST",
        body: JSON.stringify({
          treinamento_id: id,
          data_chamada: dataChamada,
          participantes,
        }),
      });

      alert("Chamada do dia salva com sucesso.");
      await carregarParticipantesPorData(dataChamada);
    } catch (err) {
      setErro(err.message || "Não foi possível salvar a chamada.");
    } finally {
      setSalvando(false);
    }
  }

  const participantesFiltrados = useMemo(() => {
    const termo = String(busca || "").trim().toLowerCase();

    const base = participantes.map((p, indexReal) => ({
      ...p,
      _indexReal: indexReal,
      _rowKey: p.id || `idx-${indexReal}`,
    }));

    if (!termo) return base;

    return base.filter((p) => {
      return (
        String(p.nome || "").toLowerCase().includes(termo) ||
        String(p.matricula || "").toLowerCase().includes(termo) ||
        String(p.operacao || "").toLowerCase().includes(termo) ||
        String(p.supervisor || "").toLowerCase().includes(termo)
      );
    });
  }, [participantes, busca]);

  const resumo = useMemo(() => {
    const presentes = participantes.filter(
      (p) => String(p.status_presenca || "").toLowerCase() === "presente"
    ).length;

    const ausentes = participantes.filter(
      (p) => String(p.status_presenca || "").toLowerCase() === "ausente"
    ).length;

    const justificados = participantes.filter(
      (p) => String(p.status_presenca || "").toLowerCase() === "justificado"
    ).length;

    const pendentes = participantes.filter(
      (p) =>
        !p.status_presenca ||
        String(p.status_presenca || "").toLowerCase() === "pendente"
    ).length;

    const totalSelecionados = Object.values(selecionados).filter(Boolean).length;

    return {
      total: participantes.length,
      presentes,
      ausentes,
      justificados,
      pendentes,
      totalSelecionados,
      exibidos: participantesFiltrados.length,
    };
  }, [participantes, selecionados, participantesFiltrados]);

  function voltar() {
    window.location.href = "/treinamentos";
  }

  if (loading) {
    return <div style={loadingWrap}>Carregando chamada da turma...</div>;
  }

  return (
    <div style={page}>
      <div style={topBar}>
        <button style={btnVoltar} onClick={voltar}>
          ← Voltar para treinamentos
        </button>
      </div>

      <div style={hero}>
        <div style={heroInfo}>
          <div style={eyebrow}>Chamada diária da turma</div>
          <h1 style={title}>
            {treinamento?.tema || treinamento?.titulo || "Turma de treinamento"}
          </h1>
          <p style={subtitle}>
            Importe os participantes e registre a presença por dia dentro do período da formação.
          </p>

          <div style={metaGrid}>
            <div style={metaCard}>
              <span style={metaLabel}>Cliente</span>
              <strong>{treinamento?.cliente || "-"}</strong>
            </div>
            <div style={metaCard}>
              <span style={metaLabel}>Instrutor</span>
              <strong>{treinamento?.instrutor || "-"}</strong>
            </div>
            <div style={metaCard}>
              <span style={metaLabel}>Período</span>
              <strong>
                {formatDate(treinamento?.data_inicio || treinamento?.data)} até{" "}
                {formatDate(
                  treinamento?.data_fim ||
                    treinamento?.data_inicio ||
                    treinamento?.data
                )}
              </strong>
            </div>
            <div style={metaCard}>
              <span style={metaLabel}>Carga horária</span>
              <strong>{treinamento?.carga_horaria || "-"}</strong>
            </div>
          </div>
        </div>
      </div>

      <div style={uploadCard}>
        <div>
          <h2 style={sectionTitle}>Data da chamada</h2>
          <p style={sectionSubtitle}>
            Selecione o dia da formação que será controlado nesta chamada.
          </p>
        </div>

        <div style={uploadActions}>
          <input
            type="date"
            value={dataChamada}
            min={toInputDate(treinamento?.data_inicio || treinamento?.data)}
            max={toInputDate(
              treinamento?.data_fim ||
                treinamento?.data_inicio ||
                treinamento?.data
            )}
            onChange={(e) => setDataChamada(e.target.value)}
            style={inputDate}
          />
        </div>
      </div>

      <div style={uploadCard}>
        <div>
          <h2 style={sectionTitle}>Importar participantes</h2>
          <p style={sectionSubtitle}>
            Use a planilha padrão com as colunas: nome, matricula, cliente, turma,
            supervisor, operacao e data_admissao.
          </p>
        </div>

        <div style={uploadActions}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
          />
          <button style={btnImportar} onClick={importarExcel} disabled={importando}>
            {importando ? "Importando..." : "Importar Excel"}
          </button>
        </div>
      </div>

      <div style={statsGrid}>
        <Stat label="Total" value={resumo.total} color="#2563eb" />
        <Stat label="Exibidos" value={resumo.exibidos} color="#0f766e" />
        <Stat label="Presentes" value={resumo.presentes} color="#16a34a" />
        <Stat label="Ausentes" value={resumo.ausentes} color="#dc2626" />
        <Stat label="Justificados" value={resumo.justificados} color="#f59e0b" />
        <Stat label="Pendentes" value={resumo.pendentes} color="#64748b" />
      </div>

      {erro ? <div style={errorBox}>{erro}</div> : null}

      <div style={contentCard}>
        <div style={tableHeader}>
          <div>
            <h2 style={sectionTitle}>Participantes da turma</h2>
            <p style={sectionSubtitle}>
              Atualize a presença do dia {formatDate(dataChamada)} e salve ao final.
            </p>
          </div>

          <button style={btnSalvar} onClick={salvarChamada} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar chamada do dia"}
          </button>
        </div>

        {participantes.length > 0 ? (
          <>
            <div style={searchCard}>
              <div style={searchInfo}>
                <div style={bulkTitle}>Buscar participante</div>
                <div style={bulkSub}>
                  Filtre por nome, matrícula, operação ou supervisor.
                </div>
              </div>

              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, matrícula, operação ou supervisor"
                style={inputBusca}
              />
            </div>

            <div style={bulkCard}>
              <div style={bulkHeader}>
                <div>
                  <div style={bulkTitle}>Ação em massa</div>
                  <div style={bulkSub}>
                    {resumo.totalSelecionados} participante(s) selecionado(s) •{" "}
                    {resumo.exibidos} exibido(s)
                  </div>
                </div>

                <div style={bulkActions}>
                  <button style={bulkSecondary} onClick={selecionarTodosFiltrados}>
                    Selecionar exibidos
                  </button>
                  <button style={bulkSecondary} onClick={limparSelecao}>
                    Limpar seleção
                  </button>
                </div>
              </div>

              <div style={bulkStatusActions}>
                <button
                  style={{ ...btnStatusBase, ...btnPresenteActive }}
                  onClick={() => aplicarStatusEmMassa("presente")}
                >
                  Marcar selecionados como presentes
                </button>

                <button
                  style={{ ...btnStatusBase, ...btnAusenteActive }}
                  onClick={() => aplicarStatusEmMassa("ausente")}
                >
                  Marcar selecionados como ausentes
                </button>

                <button
                  style={{ ...btnStatusBase, ...btnJustificadoActive }}
                  onClick={() => aplicarStatusEmMassa("justificado")}
                >
                  Marcar selecionados como justificados
                </button>

                <button
                  style={{ ...btnStatusBase, ...btnPendenteActive }}
                  onClick={() => aplicarStatusEmMassa("pendente")}
                >
                  Marcar selecionados como pendentes
                </button>
              </div>
            </div>
          </>
        ) : null}

        {participantes.length === 0 ? (
          <div style={emptyState}>
            <strong>Nenhum participante importado para esta turma.</strong>
            <span>
              Faça a importação do Excel para preencher automaticamente a lista.
            </span>
          </div>
        ) : (
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={thCheck}></th>
                  <th style={th}>Participante</th>
                  <th style={th}>Matrícula</th>
                  <th style={th}>Operação</th>
                  <th style={th}>Status do dia</th>
                  <th style={th}>Justificativa</th>
                </tr>
              </thead>

              <tbody>
                {participantesFiltrados.map((p) => {
                  const marcado = !!selecionados[p._rowKey];

                  return (
                    <tr key={p._rowKey} style={tr}>
                      <td style={tdCheck}>
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => toggleSelecionado(p._rowKey)}
                        />
                      </td>

                      <td style={td}>
                        <div style={participantName}>{p.nome}</div>
                        <div style={participantMeta}>
                          {p.cliente || "-"} • {p.supervisor || "-"}
                        </div>
                      </td>

                      <td style={td}>{p.matricula || "-"}</td>
                      <td style={td}>{p.operacao || "-"}</td>

                      <td style={td}>
                        <div style={statusActions}>
                          <button
                            onClick={() => alterarStatus(p._indexReal, "presente")}
                            style={{
                              ...btnStatusBase,
                              ...(String(p.status_presenca || "").toLowerCase() ===
                              "presente"
                                ? btnPresenteActive
                                : btnPresente),
                            }}
                          >
                            Presente
                          </button>

                          <button
                            onClick={() => alterarStatus(p._indexReal, "ausente")}
                            style={{
                              ...btnStatusBase,
                              ...(String(p.status_presenca || "").toLowerCase() ===
                              "ausente"
                                ? btnAusenteActive
                                : btnAusente),
                            }}
                          >
                            Ausente
                          </button>

                          <button
                            onClick={() => alterarStatus(p._indexReal, "justificado")}
                            style={{
                              ...btnStatusBase,
                              ...(String(p.status_presenca || "").toLowerCase() ===
                              "justificado"
                                ? btnJustificadoActive
                                : btnJustificado),
                            }}
                          >
                            Justificado
                          </button>

                          <button
                            onClick={() => alterarStatus(p._indexReal, "pendente")}
                            style={{
                              ...btnStatusBase,
                              ...(String(p.status_presenca || "").toLowerCase() ===
                              "pendente"
                                ? btnPendenteActive
                                : btnPendente),
                            }}
                          >
                            Pendente
                          </button>
                        </div>
                      </td>

                      <td style={td}>
                        <input
                          value={p.justificativa || ""}
                          onChange={(e) => alterarJustificativa(p._indexReal, e.target.value)}
                          placeholder="Informar justificativa"
                          style={input}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {participantes.length > 0 ? (
          <div style={footerActions}>
            <button style={btnSalvar} onClick={salvarChamada} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar chamada do dia"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ ...statCard, borderTop: `4px solid ${color}` }}>
      <div style={statLabel}>{label}</div>
      <div style={statValue}>{value}</div>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  background: "#f8fafc",
  padding: 24,
};

const topBar = {
  marginBottom: 14,
};

const btnVoltar = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  color: "#0f172a",
  borderRadius: 10,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const hero = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 22,
  padding: 24,
  color: "#fff",
  boxShadow: "0 18px 36px rgba(29,78,216,.18)",
};

const heroInfo = {
  display: "grid",
  gap: 10,
};

const eyebrow = {
  display: "inline-block",
  width: "fit-content",
  background: "rgba(255,255,255,.14)",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const title = {
  margin: 0,
  fontSize: 34,
  lineHeight: 1.05,
};

const subtitle = {
  margin: 0,
  color: "rgba(255,255,255,.84)",
  lineHeight: 1.6,
};

const metaGrid = {
  marginTop: 8,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const metaCard = {
  background: "rgba(255,255,255,.10)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 6,
};

const metaLabel = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "rgba(255,255,255,.68)",
};

const uploadCard = {
  marginTop: 16,
  background: "#fff",
  borderRadius: 18,
  padding: 18,
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 24px rgba(15,23,42,.05)",
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
  flexWrap: "wrap",
};

const uploadActions = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const btnImportar = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "11px 16px",
  cursor: "pointer",
  fontWeight: 700,
};

const statsGrid = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

const statCard = {
  background: "#fff",
  borderRadius: 16,
  padding: 16,
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 24px rgba(15,23,42,.05)",
};

const statLabel = {
  color: "#64748b",
  fontSize: 13,
};

const statValue = {
  marginTop: 6,
  fontSize: 32,
  fontWeight: 800,
  color: "#0f172a",
};

const contentCard = {
  marginTop: 16,
  background: "#fff",
  borderRadius: 20,
  padding: 20,
  border: "1px solid #e2e8f0",
  boxShadow: "0 12px 28px rgba(15,23,42,.05)",
};

const tableHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 16,
};

const sectionTitle = {
  margin: 0,
  fontSize: 24,
  color: "#0f172a",
};

const sectionSubtitle = {
  margin: "6px 0 0",
  color: "#64748b",
  lineHeight: 1.5,
};

const searchCard = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 14,
  marginBottom: 14,
  display: "grid",
  gap: 10,
};

const searchInfo = {
  display: "grid",
  gap: 4,
};

const inputBusca = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  outline: "none",
};

const bulkCard = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 14,
  marginBottom: 16,
  display: "grid",
  gap: 12,
};

const bulkHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const bulkTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const bulkSub = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 13,
};

const bulkActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const bulkSecondary = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
  borderRadius: 10,
  padding: "9px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const bulkStatusActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const tableWrap = {
  overflowX: "auto",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: "14px 12px",
  borderBottom: "1px solid #e2e8f0",
  color: "#334155",
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const thCheck = {
  ...th,
  width: 40,
};

const tr = {
  borderBottom: "1px solid #f1f5f9",
};

const td = {
  padding: "14px 12px",
  verticalAlign: "top",
};

const tdCheck = {
  ...td,
  width: 40,
};

const participantName = {
  fontWeight: 700,
  color: "#0f172a",
};

const participantMeta = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 12,
};

const statusActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const btnStatusBase = {
  border: 0,
  padding: "8px 12px",
  borderRadius: 10,
  fontWeight: 700,
  cursor: "pointer",
};

const btnPresente = {
  background: "#dcfce7",
  color: "#166534",
};

const btnPresenteActive = {
  background: "#16a34a",
  color: "#fff",
};

const btnAusente = {
  background: "#fee2e2",
  color: "#b91c1c",
};

const btnAusenteActive = {
  background: "#dc2626",
  color: "#fff",
};

const btnJustificado = {
  background: "#fef3c7",
  color: "#92400e",
};

const btnJustificadoActive = {
  background: "#f59e0b",
  color: "#fff",
};

const btnPendente = {
  background: "#e2e8f0",
  color: "#475569",
};

const btnPendenteActive = {
  background: "#64748b",
  color: "#fff",
};

const input = {
  width: "100%",
  minWidth: 220,
  boxSizing: "border-box",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
};

const inputDate = {
  ...input,
  minWidth: 220,
};

const btnSalvar = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "11px 16px",
  cursor: "pointer",
  fontWeight: 700,
};

const footerActions = {
  marginTop: 18,
  display: "flex",
  justifyContent: "flex-end",
};

const emptyState = {
  background: "#f8fafc",
  border: "1px dashed #cbd5e1",
  borderRadius: 16,
  padding: 24,
  display: "grid",
  gap: 8,
  color: "#475569",
};

const errorBox = {
  marginTop: 14,
  background: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};

const loadingWrap = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f8fafc",
  color: "#334155",
  fontWeight: 700,
};
