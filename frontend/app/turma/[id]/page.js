"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../services/api";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tel-td-portal-production.up.railway.app/api";

function formatDate(value) {
  if (!value) return "-";

  const text = String(value).slice(0, 10);
  const parts = text.split("-");

  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    if (year && month && day) {
      return new Date(year, month - 1, day, 12, 0, 0).toLocaleDateString("pt-BR");
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("pt-BR");
}

function toInputDate(value) {
  if (!value) return "";

  const text = String(value).slice(0, 10);
  const parts = text.split("-");

  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    if (year && month && day) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toISOString().slice(0, 10);
}

function buildRowFromAula(item, indexReal) {
  return {
    id: item.id,
    nome: item.treinando_nome || "",
    matricula: "",
    cliente: "",
    turma: "",
    supervisor: "",
    operacao: "",
    data_admissao: "",
    status_presenca: item.status || "pendente",
    justificativa: item.justificativa || "",
    _indexReal: indexReal,
    _rowKey: item.id || `idx-${indexReal}`,
  };
}

export default function ChamadaTurmaPage() {
  const routeParams = useParams();
  const id = routeParams?.id;

  const [participantes, setParticipantes] = useState([]);
  const [treinamento, setTreinamento] = useState(null);
  const [arquivo, setArquivo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [dataChamada, setDataChamada] = useState("");
  const [selecionados, setSelecionados] = useState({});
  const [busca, setBusca] = useState("");

  const [modoAula, setModoAula] = useState(false);
  const [turmaAulaId, setTurmaAulaId] = useState("");
  const [origem, setOrigem] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    const aulaId = search.get("turma_aula_id") || "";
    const dataAula = search.get("data_aula") || "";
    const origemParam = search.get("origem") || "";

    setTurmaAulaId(aulaId);
    setModoAula(Boolean(aulaId));
    setOrigem(origemParam);

    if (dataAula) {
      setDataChamada(dataAula);
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    carregarBase();
  }, [id, turmaAulaId]);

  useEffect(() => {
    if (!id) return;
    if (!modoAula && dataChamada) {
      carregarParticipantesPorData(dataChamada);
    }
  }, [id, dataChamada, modoAula]);

  async function carregarBase() {
    try {
      if (!id) return;

      setErro("");
      setSucesso("");
      setLoading(true);

      const dadosTreinamento = await apiFetch(`/treinamentos/${id}`).catch((err) => {
        throw new Error(`Erro ao buscar treinamento: ${err.message}`);
      });

      setTreinamento(dadosTreinamento || null);

      if (turmaAulaId) {
        const dataAulaFinal =
          dataChamada ||
          toInputDate(
            dadosTreinamento?.data_inicio ||
              dadosTreinamento?.data ||
              new Date().toISOString().slice(0, 10)
          );

        if (dataAulaFinal) {
          setDataChamada(dataAulaFinal);
        }

        await apiFetch("/presenca-aulas/inicializar", {
          method: "POST",
          body: JSON.stringify({ turma_aula_id: Number(turmaAulaId) }),
        }).catch((err) => {
          throw new Error(`Erro ao inicializar presença da aula: ${err.message}`);
        });

        const registros = await apiFetch(
          `/presenca-aulas?turma_aula_id=${encodeURIComponent(turmaAulaId)}`
        ).catch((err) => {
          throw new Error(`Erro ao buscar presença da aula: ${err.message}`);
        });

        const lista = Array.isArray(registros) ? registros : [];
        setParticipantes(lista.map((item, indexReal) => buildRowFromAula(item, indexReal)));
        setSelecionados({});
        setBusca("");
        setLoading(false);
        return;
      }

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
      if (!id) return;

      const dadosParticipantes = await apiFetch(
        `/treinamentos/${id}/participantes?data=${encodeURIComponent(data)}`
      ).catch((err) => {
        throw new Error(`Erro ao buscar participantes: ${err.message}`);
      });

      const lista = Array.isArray(dadosParticipantes) ? dadosParticipantes : [];
      const base = lista.map((item, indexReal) => ({
        ...item,
        _indexReal: indexReal,
        _rowKey: item.id || `idx-${indexReal}`,
      }));

      setParticipantes(base);
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

  async function excluirParticipante(idParticipante) {
    if (modoAula) {
      alert("A exclusão de participante por aula deve ser feita na base da turma.");
      return;
    }

    const confirmar = window.confirm(
      "Deseja realmente excluir este participante da turma? As presenças relacionadas também serão removidas."
    );
    if (!confirmar) return;

    try {
      setErro("");

      await apiFetch(`/treinamentos/participantes/${idParticipante}`, {
        method: "DELETE",
      });

      await carregarParticipantesPorData(dataChamada);
    } catch (err) {
      setErro(err.message || "Erro ao excluir participante.");
    }
  }

  async function excluirSelecionados() {
    if (modoAula) {
      alert("A exclusão em lote não é aplicada no modo de presença por aula.");
      return;
    }

    const ids = participantesFiltrados
      .filter((item) => selecionados[item._rowKey] && item.id)
      .map((item) => item.id);

    if (!ids.length) {
      alert("Selecione ao menos um participante com registro válido para excluir.");
      return;
    }

    const confirmar = window.confirm(
      `Deseja excluir ${ids.length} participante(s) selecionado(s)? As presenças relacionadas também serão removidas.`
    );
    if (!confirmar) return;

    try {
      setErro("");

      await apiFetch("/treinamentos/participantes/excluir-lote", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });

      await carregarParticipantesPorData(dataChamada);
    } catch (err) {
      setErro(err.message || "Erro ao excluir participantes selecionados.");
    }
  }

  async function importarExcel() {
    if (modoAula) {
      alert("A importação de participantes é feita na turma, não na aula.");
      return;
    }

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
      setSucesso("");

      if (modoAula) {
        await apiFetch("/presenca-aulas/salvar", {
          method: "POST",
          body: JSON.stringify({
            turma_aula_id: Number(turmaAulaId),
            registros: participantes.map((item) => ({
              treinando_nome: item.nome,
              status: item.status_presenca || "pendente",
              justificativa: item.justificativa || "",
            })),
          }),
        });

        setSucesso("Presença da aula salva com sucesso.");

        const registros = await apiFetch(
          `/presenca-aulas?turma_aula_id=${encodeURIComponent(turmaAulaId)}`
        ).catch(() => []);

        const lista = Array.isArray(registros) ? registros : [];
        setParticipantes(lista.map((item, indexReal) => buildRowFromAula(item, indexReal)));
        return;
      }

      await apiFetch(`/treinamentos/salvar-chamada`, {
        method: "POST",
        body: JSON.stringify({
          treinamento_id: id,
          data_chamada: dataChamada,
          participantes: participantes.map((item) => ({
            ...item,
            status_presenca: item.status_presenca || "pendente",
          })),
        }),
      });

      setSucesso("Chamada do dia salva com sucesso.");
      await carregarParticipantesPorData(dataChamada);
    } catch (err) {
      setErro(err.message || "Não foi possível salvar a chamada.");
    } finally {
      setSalvando(false);
    }
  }

  const participantesFiltrados = useMemo(() => {
    const termo = String(busca || "").trim().toLowerCase();

    if (!termo) return participantes;

    return participantes.filter((p) => {
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
    if (modoAula || origem === "cronograma") {
      window.location.href = `/turma/${id}/cronograma`;
      return;
    }
    window.location.href = "/treinamentos";
  }

  if (loading) {
    return <div style={loadingWrap}>Carregando chamada da turma...</div>;
  }

  return (
    <div style={page}>
      <div style={topBar}>
        <button style={btnVoltar} onClick={voltar}>
          {modoAula ? "← Voltar para cronograma" : "← Voltar para treinamentos"}
        </button>
      </div>

      <div style={hero}>
        <div style={heroInfo}>
          <div style={eyebrow}>
            {modoAula ? "Presença por aula" : "Chamada diária da turma"}
          </div>
          <h1 style={title}>
            {treinamento?.tema || treinamento?.titulo || "Turma de treinamento"}
          </h1>
          <p style={subtitle}>
            {modoAula
              ? "Registre a presença dos treinandos vinculados a esta aula específica."
              : "Importe os participantes e registre a presença por dia dentro do período da formação."}
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
              <span style={metaLabel}>
                {modoAula ? "Data da aula" : "Carga horária"}
              </span>
              <strong>
                {modoAula ? formatDate(dataChamada) : treinamento?.carga_horaria || "-"}
              </strong>
            </div>
          </div>
        </div>
      </div>

      <div style={content}>
        {erro ? <div style={errorBox}>{erro}</div> : null}
        {sucesso ? <div style={successBox}>{sucesso}</div> : null}

        <div style={uploadCard}>
          <div>
            <h2 style={sectionTitle}>
              {modoAula ? "Data da aula" : "Data da chamada"}
            </h2>
            <p style={sectionSubtitle}>
              {modoAula
                ? "Dia da aula que será controlado neste lançamento."
                : "Selecione o dia da formação que será controlado nesta chamada."}
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
              onChange={(e) => !modoAula && setDataChamada(e.target.value)}
              style={inputDate}
              disabled={modoAula}
            />
          </div>
        </div>

        {!modoAula ? (
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
        ) : null}

        <div style={statsGrid}>
          <Stat label="Total" value={resumo.total} color="#2563eb" />
          <Stat label="Exibidos" value={resumo.exibidos} color="#0f766e" />
          <Stat label="Presentes" value={resumo.presentes} color="#16a34a" />
          <Stat label="Ausentes" value={resumo.ausentes} color="#dc2626" />
          <Stat label="Justificados" value={resumo.justificados} color="#f59e0b" />
          <Stat label="Pendentes" value={resumo.pendentes} color="#64748b" />
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

                  {!modoAula ? (
                    <button style={bulkDelete} onClick={excluirSelecionados}>
                      Excluir selecionados
                    </button>
                  ) : null}
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

        <div style={contentCard}>
          <div style={tableHeader}>
            <div>
              <h2 style={sectionTitle}>Participantes da turma</h2>
              <p style={sectionSubtitle}>
                {modoAula
                  ? `Atualize a presença da aula do dia ${formatDate(dataChamada)} e salve ao final.`
                  : `Atualize a presença do dia ${formatDate(dataChamada)} e salve ao final.`}
              </p>
            </div>

            <button style={btnSalvar} onClick={salvarChamada} disabled={salvando}>
              {salvando
                ? "Salvando..."
                : modoAula
                ? "Salvar presença da aula"
                : "Salvar chamada do dia"}
            </button>
          </div>

          {participantes.length === 0 ? (
            <div style={emptyState}>
              <strong>
                {modoAula
                  ? "Nenhum participante encontrado para esta aula."
                  : "Nenhum participante importado para esta turma."}
              </strong>
              <span>
                {modoAula
                  ? "Verifique se a turma possui participantes vinculados."
                  : "Faça a importação do Excel para preencher automaticamente a lista."}
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
                    <th style={th}>Ações</th>
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

                        <td style={td}>
                          {!modoAula ? (
                            p.id ? (
                              <button
                                style={deleteLineBtn}
                                onClick={() => excluirParticipante(p.id)}
                              >
                                Excluir
                              </button>
                            ) : (
                              <span style={smallMuted}>Sem ID</span>
                            )
                          ) : (
                            <span style={smallMuted}>-</span>
                          )}
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
                {salvando
                  ? "Salvando..."
                  : modoAula
                  ? "Salvar presença da aula"
                  : "Salvar chamada do dia"}
              </button>
            </div>
          ) : null}
        </div>
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

const inputDate = {
  width: 180,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  outline: "none",
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

const content = {
  marginTop: 16,
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
  marginTop: 16,
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

const bulkDelete = {
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#be123c",
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

const btnStatusBase = {
  border: "1px solid transparent",
  borderRadius: 999,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const btnPresente = {
  background: "#f0fdf4",
  color: "#166534",
  borderColor: "#bbf7d0",
};

const btnPresenteActive = {
  background: "#16a34a",
  color: "#fff",
  borderColor: "#16a34a",
};

const btnAusente = {
  background: "#fef2f2",
  color: "#b91c1c",
  borderColor: "#fecaca",
};

const btnAusenteActive = {
  background: "#dc2626",
  color: "#fff",
  borderColor: "#dc2626",
};

const btnJustificado = {
  background: "#fff7ed",
  color: "#c2410c",
  borderColor: "#fdba74",
};

const btnJustificadoActive = {
  background: "#f59e0b",
  color: "#fff",
  borderColor: "#f59e0b",
};

const btnPendente = {
  background: "#f8fafc",
  color: "#475569",
  borderColor: "#cbd5e1",
};

const btnPendenteActive = {
  background: "#64748b",
  color: "#fff",
  borderColor: "#64748b",
};

const tableWrap = {
  overflowX: "auto",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1100,
};

const th = {
  textAlign: "left",
  padding: "14px 12px",
  fontSize: 13,
  color: "#64748b",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
};

const thCheck = {
  ...th,
  width: 44,
};

const tr = {
  borderBottom: "1px solid #f1f5f9",
};

const td = {
  padding: "14px 12px",
  verticalAlign: "top",
  color: "#0f172a",
};

const tdCheck = {
  ...td,
  width: 44,
};

const participantName = {
  fontWeight: 800,
  color: "#0f172a",
};

const participantMeta = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 13,
};

const statusActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const input = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  outline: "none",
};

const deleteLineBtn = {
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#be123c",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const smallMuted = {
  color: "#94a3b8",
  fontSize: 13,
};

const footerActions = {
  marginTop: 18,
  display: "flex",
  justifyContent: "flex-end",
};

const btnSalvar = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 12,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: 800,
};

const emptyState = {
  display: "grid",
  gap: 8,
  padding: 24,
  textAlign: "center",
  color: "#64748b",
};

const errorBox = {
  marginTop: 16,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};

const successBox = {
  marginTop: 16,
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};
