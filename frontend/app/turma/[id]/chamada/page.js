"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "../../../../services/api";
import { formatDateBR } from "../../../../lib/date";

function formatDate(value) {
  return formatDateBR(value);
}

function normalizeStatus(value) {
  const text = String(value || "").toLowerCase().trim();
  if (["presente", "ausente", "justificado", "pendente"].includes(text)) {
    return text;
  }
  return "pendente";
}

export default function ChamadaTurmaPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id;
  const turmaAulaId = searchParams.get("turma_aula_id");

  const [treinamento, setTreinamento] = useState(null);
  const [aula, setAula] = useState(null);
  const [registros, setRegistros] = useState([]);
  const [selecionados, setSelecionados] = useState({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, turmaAulaId]);

  async function carregar() {
    try {
      if (!id || !turmaAulaId) return;

      setLoading(true);
      setErro("");
      setSucesso("");

      const [dadosTreinamento, listaAulas] = await Promise.all([
        apiFetch(`/treinamentos/${id}`),
        apiFetch(`/turma-aulas?treinamento_id=${id}`).catch(() => []),
      ]);

      setTreinamento(dadosTreinamento || null);

      const aulaAtual = (Array.isArray(listaAulas) ? listaAulas : []).find(
        (item) => String(item.id) === String(turmaAulaId)
      );
      setAula(aulaAtual || null);

      await apiFetch(`/presenca-aulas/inicializar`, {
        method: "POST",
        body: JSON.stringify({ turma_aula_id: Number(turmaAulaId) }),
      }).catch(() => null);

      const lista = await apiFetch(
        `/presenca-aulas?turma_aula_id=${turmaAulaId}`
      ).catch(() => []);

      setRegistros(Array.isArray(lista) ? lista : []);
      setSelecionados({});
    } catch (err) {
      setErro(err.message || "Erro ao carregar a chamada da turma.");
    } finally {
      setLoading(false);
    }
  }

  const registrosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return registros;

    return registros.filter((item) =>
      String(item.treinando_nome || "").toLowerCase().includes(termo)
    );
  }, [registros, busca]);

  const resumo = useMemo(() => {
    const total = registros.length;
    const presentes = registros.filter(
      (item) => normalizeStatus(item.status) === "presente"
    ).length;
    const ausentes = registros.filter(
      (item) => normalizeStatus(item.status) === "ausente"
    ).length;
    const justificados = registros.filter(
      (item) => normalizeStatus(item.status) === "justificado"
    ).length;
    const pendentes = registros.filter(
      (item) => normalizeStatus(item.status) === "pendente"
    ).length;

    return { total, presentes, ausentes, justificados, pendentes };
  }, [registros]);

  const totalSelecionados = useMemo(
    () => Object.values(selecionados).filter(Boolean).length,
    [selecionados]
  );

  const todosFiltradosSelecionados = useMemo(() => {
    if (!registrosFiltrados.length) return false;

    return registrosFiltrados.every(
      (item) => selecionados[item.id || item.treinando_nome]
    );
  }, [registrosFiltrados, selecionados]);

  function atualizarRegistro(chave, campo, valor) {
    setRegistros((prev) =>
      prev.map((item) =>
        (item.id || item.treinando_nome) === chave
          ? { ...item, [campo]: valor }
          : item
      )
    );
  }

  function alternarSelecao(chave) {
    setSelecionados((prev) => ({ ...prev, [chave]: !prev[chave] }));
  }

  function alternarSelecaoTodosFiltrados() {
    const marcar = !todosFiltradosSelecionados;

    setSelecionados((prev) => {
      const next = { ...prev };
      registrosFiltrados.forEach((item) => {
        next[item.id || item.treinando_nome] = marcar;
      });
      return next;
    });
  }

  function limparSelecao() {
    setSelecionados({});
  }

  function aplicarStatusSelecionados(status) {
    const statusNormalizado = normalizeStatus(status);

    setRegistros((prev) =>
      prev.map((item) => {
        const chave = item.id || item.treinando_nome;
        if (!selecionados[chave]) return item;

        return {
          ...item,
          status: statusNormalizado,
          justificativa:
            statusNormalizado === "justificado"
              ? item.justificativa || ""
              : item.justificativa,
        };
      })
    );
  }

  async function salvar() {
    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      await apiFetch(`/presenca-aulas/salvar`, {
        method: "POST",
        body: JSON.stringify({
          turma_aula_id: Number(turmaAulaId),
          registros: registros.map((item) => ({
            treinando_nome: item.treinando_nome,
            status: normalizeStatus(item.status),
            justificativa: item.justificativa || null,
          })),
        }),
      });

      setSucesso("Chamada da turma salva com sucesso.");
      await carregar();
    } catch (err) {
      setErro(err.message || "Erro ao salvar a chamada.");
    } finally {
      setSalvando(false);
    }
  }

  function voltar() {
    window.location.href = `/turma/${id}?turma_aula_id=${turmaAulaId}`;
  }

  if (!id || !turmaAulaId) {
    return (
      <div style={loadingWrap}>
        Selecione uma aula para lançar a chamada.
      </div>
    );
  }

  if (loading) {
    return <div style={loadingWrap}>Carregando chamada da turma...</div>;
  }

  return (
    <div style={page}>
      <div style={topBar}>
        <button style={btnVoltar} onClick={voltar}>
          ← Voltar para gestão da turma
        </button>
      </div>

      <div style={hero}>
        <div style={heroBadge}>Chamada da turma</div>
        <h1 style={heroTitle}>{treinamento?.tema || "Turma"}</h1>
        <p style={heroSubtitle}>
          Lançamento da presença por aula, com atualização imediata dos
          indicadores da turma.
        </p>

        <div style={heroGrid}>
          <InfoCard label="Cliente" value={treinamento?.cliente || "-"} />
          <InfoCard
            label="Instrutor"
            value={aula?.instrutor_responsavel || treinamento?.instrutor || "-"}
          />
          <InfoCard label="Aula" value={aula?.titulo || "-"} />
          <InfoCard label="Data" value={formatDate(aula?.data_aula)} />
        </div>
      </div>

      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={statsGrid}>
        <StatCard title="Total" value={resumo.total} />
        <StatCard title="Presentes" value={resumo.presentes} />
        <StatCard title="Ausentes" value={resumo.ausentes} />
        <StatCard title="Justificados" value={resumo.justificados} />
        <StatCard title="Pendentes" value={resumo.pendentes} />
      </div>

      <div style={sectionCard}>
        <div style={toolbar}>
          <div>
            <h2 style={sectionTitle}>Lista de chamada</h2>
            <p style={sectionSubtitle}>
              Atualize o status de cada treinando e salve a aula selecionada.
            </p>
          </div>

          <div style={toolbarActions}>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar treinando"
              style={field}
            />

            <button style={btnPrimary} onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar chamada"}
            </button>
          </div>
        </div>

        <div style={bulkBar}>
          <label style={checkWrap}>
            <input
              type="checkbox"
              checked={todosFiltradosSelecionados}
              onChange={alternarSelecaoTodosFiltrados}
            />
            <span>Selecionar todos os exibidos</span>
          </label>

          <div style={bulkInfo}>{totalSelecionados} selecionado(s)</div>

          <div style={bulkActions}>
            <button
              style={btnGhost}
              onClick={() => aplicarStatusSelecionados("presente")}
              disabled={!totalSelecionados}
            >
              Presente
            </button>

            <button
              style={btnGhost}
              onClick={() => aplicarStatusSelecionados("ausente")}
              disabled={!totalSelecionados}
            >
              Ausente
            </button>

            <button
              style={btnGhost}
              onClick={() => aplicarStatusSelecionados("justificado")}
              disabled={!totalSelecionados}
            >
              Justificado
            </button>

            <button
              style={btnGhost}
              onClick={() => aplicarStatusSelecionados("pendente")}
              disabled={!totalSelecionados}
            >
              Pendente
            </button>

            <button
              style={btnGhostDanger}
              onClick={limparSelecao}
              disabled={!totalSelecionados}
            >
              Limpar seleção
            </button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={thSmall}></th>
                <th style={th}>Treinando</th>
                <th style={th}>Status</th>
                <th style={th}>Justificativa</th>
              </tr>
            </thead>

            <tbody>
              {registrosFiltrados.map((item) => {
                const chave = item.id || item.treinando_nome;

                return (
                  <tr key={chave}>
                    <td style={tdSmall}>
                      <input
                        type="checkbox"
                        checked={!!selecionados[chave]}
                        onChange={() => alternarSelecao(chave)}
                      />
                    </td>

                    <td style={td}>{item.treinando_nome}</td>

                    <td style={td}>
                      <select
                        style={select}
                        value={normalizeStatus(item.status)}
                        onChange={(e) =>
                          atualizarRegistro(chave, "status", e.target.value)
                        }
                      >
                        <option value="pendente">Pendente</option>
                        <option value="presente">Presente</option>
                        <option value="ausente">Ausente</option>
                        <option value="justificado">Justificado</option>
                      </select>
                    </td>

                    <td style={td}>
                      <input
                        style={field}
                        value={item.justificativa || ""}
                        onChange={(e) =>
                          atualizarRegistro(
                            chave,
                            "justificativa",
                            e.target.value
                          )
                        }
                        placeholder="Observação / justificativa"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div style={infoCard}>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value}</div>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div style={statCard}>
      <div style={statTitle}>{title}</div>
      <div style={statValue}>{value}</div>
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
  color: "#334155",
  fontWeight: 700,
  background: "#f8fafc",
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
  background: "linear-gradient(135deg, #0B1220 0%, #161D2E 100%)",
  borderRadius: 22,
  padding: 24,
  color: "#fff",
  boxShadow: "0 18px 36px rgba(11,18,32,.22)",
};

const heroBadge = {
  display: "inline-block",
  width: "fit-content",
  background: "rgba(255,255,255,.14)",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  marginBottom: 10,
};

const heroTitle = {
  margin: 0,
  fontSize: 34,
  lineHeight: 1.05,
};

const heroSubtitle = {
  margin: "8px 0 0",
  color: "rgba(255,255,255,.84)",
  lineHeight: 1.6,
};

const heroGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 18,
};

const infoCard = {
  background: "rgba(255,255,255,.12)",
  border: "1px solid rgba(255,255,255,.16)",
  borderRadius: 18,
  padding: 16,
};

const infoLabel = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".03em",
  opacity: 0.8,
  fontWeight: 800,
};

const infoValue = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1.3,
};

const errorBox = {
  marginTop: 16,
  background: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  borderRadius: 14,
  padding: 14,
  fontWeight: 700,
};

const successBox = {
  marginTop: 16,
  background: "#ecfdf5",
  color: "#166534",
  border: "1px solid #bbf7d0",
  borderRadius: 14,
  padding: 14,
  fontWeight: 700,
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginTop: 18,
};

const statCard = {
  background: "#fff",
  border: "1px solid #dbe4f0",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 10px 24px rgba(15,23,42,.04)",
};

const statTitle = {
  color: "#64748b",
  fontWeight: 700,
  fontSize: 14,
};

const statValue = {
  color: "#0f172a",
  fontWeight: 900,
  fontSize: 28,
  marginTop: 4,
};

const sectionCard = {
  background: "#fff",
  border: "1px solid #dbe4f0",
  borderRadius: 24,
  padding: 20,
  marginTop: 18,
  boxShadow: "0 12px 28px rgba(15,23,42,.04)",
};

const toolbar = {
  display: "flex",
  gap: 12,
  justifyContent: "space-between",
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const sectionTitle = {
  margin: 0,
  fontSize: 28,
  color: "#0f172a",
};

const sectionSubtitle = {
  margin: "6px 0 0",
  color: "#64748b",
};

const toolbarActions = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const bulkBar = {
  marginTop: 16,
  marginBottom: 16,
  padding: 14,
  borderRadius: 16,
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  display: "flex",
  gap: 12,
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
};

const checkWrap = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontWeight: 700,
  color: "#1e3a8a",
};

const bulkInfo = {
  color: "#334155",
  fontWeight: 700,
};

const bulkActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const btnPrimary = {
  background: "linear-gradient(135deg, #FF6B4A 0%, #E5502F 100%)",
  color: "#fff",
  border: 0,
  borderRadius: 12,
  padding: "11px 16px",
  fontWeight: 800,
  cursor: "pointer",
};

const btnGhost = {
  background: "#fff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
  borderRadius: 10,
  padding: "9px 12px",
  fontWeight: 800,
  cursor: "pointer",
};

const btnGhostDanger = {
  background: "#fff",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  borderRadius: 10,
  padding: "9px 12px",
  fontWeight: 800,
  cursor: "pointer",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 740,
};

const th = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 13,
  color: "#475569",
  borderBottom: "1px solid #e2e8f0",
};

const thSmall = {
  ...th,
  width: 42,
};

const td = {
  padding: "12px 14px",
  borderBottom: "1px solid #edf2f7",
  color: "#0f172a",
  verticalAlign: "top",
};

const tdSmall = {
  ...td,
  width: 42,
};

const field = {
  width: "100%",
  minWidth: 220,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#fff",
  padding: "10px 12px",
  outline: "none",
};

const select = {
  width: 180,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#fff",
  padding: "10px 12px",
  outline: "none",
};
