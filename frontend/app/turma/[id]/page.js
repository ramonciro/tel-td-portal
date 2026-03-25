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

      setErro("");

      const dadosParticipantes = await apiFetch(
        `/treinamentos/${id}/participantes?data=${encodeURIComponent(data)}`
      ).catch((err) => {
        throw new Error(`Erro ao buscar participantes: ${err.message}`);
      });

      const lista = Array.isArray(dadosParticipantes) ? dadosParticipantes : [];
      const normalizada = lista.map((item, indexReal) => ({
        ...item,
        _indexReal: indexReal,
        _rowKey: item.id || `idx-${indexReal}`,
      }));

      setParticipantes(normalizada);
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

        <section style={section}>
          <div style={sectionHeader}>
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

            <input
              type="date"
              value={dataChamada}
              onChange={(e) => !modoAula && setDataChamada(e.target.value)}
              style={dateInput}
              disabled={modoAula}
            />
          </div>
        </section>

        {!modoAula ? (
          <section style={section}>
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Importar participantes</h2>
                <p style={sectionSubtitle}>
                  Use a planilha padrão com as colunas: nome, matricula, cliente,
                  turma, supervisor, operacao e data_admissao.
                </p>
              </div>

              <div style={uploadWrap}>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  style={btnAction}
                  onClick={importarExcel}
                  disabled={importando}
                >
                  {importando ? "Importando..." : "Importar Excel"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <div style={statsGrid}>
          <div style={{ ...statCard, borderTop: "4px solid #3b82f6" }}>
            <span style={statLabel}>Total</span>
            <strong style={statValue}>{fmt(resumo.total)}</strong>
          </div>
          <div style={{ ...statCard, borderTop: "4px solid #06b6d4" }}>
            <span style={statLabel}>Exibidos</span>
            <strong style={statValue}>{fmt(resumo.exibidos)}</strong>
          </div>
          <div style={{ ...statCard, borderTop: "4px solid #16a34a" }}>
            <span style={statLabel}>Presentes</span>
            <strong style={statValue}>{fmt(resumo.presentes)}</strong>
          </div>
          <div style={{ ...statCard, borderTop: "4px solid #dc2626" }}>
            <span style={statLabel}>Ausentes</span>
            <strong style={statValue}>{fmt(resumo.ausentes)}</strong>
          </div>
          <div style={{ ...statCard, borderTop: "4px solid #f59e0b" }}>
            <span style={statLabel}>Justificados</span>
            <strong style={statValue}>{fmt(resumo.justificados)}</strong>
          </div>
          <div style={{ ...statCard, borderTop: "4px solid #64748b" }}>
            <span style={statLabel}>Pendentes</span>
            <strong style={statValue}>{fmt(resumo.pendentes)}</strong>
          </div>
        </div>

        <section style={section}>
          <div style={sectionHeader}>
            <div>
              <h2 style={sectionTitle}>Participantes</h2>
              <p style={sectionSubtitle}>
                Atualize o status individual ou aplique ações em massa.
              </p>
            </div>

            <div style={searchWrap}>
              <input
                type="text"
                placeholder="Buscar por nome, matrícula, operação ou supervisor"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={searchInput}
              />
            </div>
          </div>

          <div style={massActions}>
            <button type="button" style={miniBtn} onClick={selecionarTodosFiltrados}>
              Selecionar exibidos
            </button>
            <button type="button" style={miniBtn} onClick={limparSelecao}>
              Limpar seleção
            </button>
            <button type="button" style={miniBtnSuccess} onClick={() => aplicarStatusEmMassa("presente")}>
              Marcar presentes
            </button>
            <button type="button" style={miniBtnDanger} onClick={() => aplicarStatusEmMassa("ausente")}>
              Marcar ausentes
            </button>
            <button type="button" style={miniBtnWarn} onClick={() => aplicarStatusEmMassa("justificado")}>
              Marcar justificados
            </button>

            {!modoAula ? (
              <button type="button" style={miniBtnDangerGhost} onClick={excluirSelecionados}>
                Excluir selecionados
              </button>
            ) : null}
          </div>

          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Sel.</th>
                  <th style={th}>Nome</th>
                  <th style={th}>Matrícula</th>
                  <th style={th}>Operação</th>
                  <th style={th}>Supervisor</th>
                  <th style={th}>Status</th>
                  <th style={th}>Justificativa</th>
                  <th style={th}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {participantesFiltrados.map((p) => (
                  <tr key={p._rowKey}>
                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={!!selecionados[p._rowKey]}
                        onChange={() => toggleSelecionado(p._rowKey)}
                      />
                    </td>
                    <td style={tdStrong}>{p.nome}</td>
                    <td style={td}>{p.matricula || "-"}</td>
                    <td style={td}>{p.operacao || "-"}</td>
                    <td style={td}>{p.supervisor || "-"}</td>
                    <td style={td}>
                      <select
                        value={p.status_presenca || "pendente"}
                        onChange={(e) => alterarStatus(p._indexReal, e.target.value)}
                        style={select}
                      >
                        <option value="pendente">Pendente</option>
                        <option value="presente">Presente</option>
                        <option value="ausente">Ausente</option>
                        <option value="justificado">Justificado</option>
                      </select>
                    </td>
                    <td style={td}>
                      <input
                        type="text"
                        value={p.justificativa || ""}
                        onChange={(e) => alterarJustificativa(p._indexReal, e.target.value)}
                        placeholder="Motivo / observação"
                        style={inlineInput}
                      />
                    </td>
                    <td style={td}>
                      {!modoAula ? (
                        <button
                          type="button"
                          style={btnDeleteInline}
                          onClick={() => excluirParticipante(p.id)}
                        >
                          Excluir
                        </button>
                      ) : (
                        <span style={mutedText}>-</span>
                      )}
                    </td>
                  </tr>
                ))}

                {!participantesFiltrados.length ? (
                  <tr>
                    <td style={emptyTd} colSpan={8}>
                      Nenhum participante encontrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <div style={footerActions}>
          <button type="button" style={btnSave} onClick={salvarChamada} disabled={salvando}>
            {salvando
              ? "Salvando..."
              : modoAula
              ? "Salvar presença da aula"
              : "Salvar chamada do dia"}
          </button>
        </div>
      </div>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  background: "#f8fafc",
  padding: 24,
};

const loadingWrap = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  fontWeight: 700,
  color: "#334155",
  background: "#f8fafc",
};

const topBar = {
  marginBottom: 16,
};

const btnVoltar = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  color: "#334155",
  borderRadius: 10,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const hero = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  color: "#ffffff",
  borderRadius: 22,
  padding: 24,
  boxShadow: "0 16px 32px rgba(29,78,216,.18)",
};

const heroInfo = {
  display: "grid",
  gap: 12,
};

const eyebrow = {
  textTransform: "uppercase",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: ".05em",
  color: "rgba(255,255,255,.82)",
};

const title = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.1,
};

const subtitle = {
  margin: 0,
  color: "rgba(255,255,255,.88)",
  lineHeight: 1.6,
};

const metaGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 8,
};

const metaCard = {
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 16,
  padding: 14,
  display: "grid",
  gap: 6,
};

const metaLabel = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "rgba(255,255,255,.78)",
  letterSpacing: ".04em",
};

const content = {
  display: "grid",
  gap: 16,
  marginTop: 16,
};

const section = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 18,
};

const sectionHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const sectionTitle = {
  margin: 0,
  fontSize: 18,
  color: "#0f172a",
};

const sectionSubtitle = {
  margin: "6px 0 0",
  color: "#64748b",
  lineHeight: 1.5,
};

const dateInput = {
  height: 44,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  fontSize: 14,
  background: "#ffffff",
  color: "#0f172a",
};

const uploadWrap = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const btnAction = {
  background: "#2563eb",
  border: "none",
  color: "#ffffff",
  borderRadius: 10,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const statCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 16,
  display: "grid",
  gap: 8,
};

const statLabel = {
  color: "#64748b",
  fontSize: 13,
  fontWeight: 700,
};

const statValue = {
  color: "#0f172a",
  fontSize: 18,
  fontWeight: 800,
};

const searchWrap = {
  minWidth: 280,
};

const searchInput = {
  width: "100%",
  height: 42,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  fontSize: 14,
  background: "#ffffff",
  color: "#0f172a",
};

const massActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 16,
  marginBottom: 16,
};

const miniBtn = {
  background: "#e2e8f0",
  border: "none",
  color: "#0f172a",
  borderRadius: 9,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const miniBtnSuccess = {
  background: "#dcfce7",
  border: "none",
  color: "#166534",
  borderRadius: 9,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const miniBtnDanger = {
  background: "#fee2e2",
  border: "none",
  color: "#b91c1c",
  borderRadius: 9,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const miniBtnWarn = {
  background: "#fef3c7",
  border: "none",
  color: "#92400e",
  borderRadius: 9,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const miniBtnDangerGhost = {
  background: "#fff1f2",
  border: "1px solid #fecdd3",
  color: "#be123c",
  borderRadius: 9,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const tableWrap = {
  width: "100%",
  overflowX: "auto",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 980,
  background: "#ffffff",
};

const th = {
  textAlign: "left",
  padding: "12px 14px",
  background: "#f8fafc",
  color: "#475569",
  fontSize: 13,
  fontWeight: 800,
  borderBottom: "1px solid #e2e8f0",
};

const td = {
  padding: "12px 14px",
  borderBottom: "1px solid #f1f5f9",
  color: "#334155",
  fontSize: 14,
  verticalAlign: "top",
};

const tdStrong = {
  ...td,
  fontWeight: 700,
  color: "#0f172a",
};

const select = {
  width: 140,
  height: 38,
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  padding: "0 10px",
};

const inlineInput = {
  width: "100%",
  minWidth: 180,
  height: 38,
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  padding: "0 10px",
};

const btnDeleteInline = {
  background: "#fff1f2",
  border: "1px solid #fecdd3",
  color: "#be123c",
  borderRadius: 8,
  padding: "8px 10px",
  cursor: "pointer",
  fontWeight: 700,
};

const mutedText = {
  color: "#94a3b8",
  fontWeight: 700,
};

const emptyTd = {
  padding: 20,
  textAlign: "center",
  color: "#64748b",
};

const footerActions = {
  display: "flex",
  justifyContent: "flex-end",
};

const btnSave = {
  background: "#2563eb",
  border: "none",
  color: "#ffffff",
  borderRadius: 12,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 14,
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};

const successBox = {
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};
