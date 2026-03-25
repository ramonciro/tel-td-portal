"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../services/api";

function formatDate(value) {
  if (!value) return "-";

  const text = String(value).slice(0, 10);
  const parts = text.split("-");

  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    if (y && m && d) {
      return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString("pt-BR");
    }
  }

  return String(value);
}

function getStatusStyle(status) {
  const key = String(status || "pendente").toLowerCase();

  if (key === "presente") {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #bbf7d0",
    };
  }

  if (key === "ausente") {
    return {
      background: "#fee2e2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    };
  }

  if (key === "justificado") {
    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fde68a",
    };
  }

  return {
    background: "#eef2ff",
    color: "#4338ca",
    border: "1px solid #c7d2fe",
  };
}

export default function ChamadaTurmaPage() {
  const routeParams = useParams();
  const id = routeParams?.id;

  const [modoAula, setModoAula] = useState(false);
  const [turmaAulaId, setTurmaAulaId] = useState("");
  const [dataAula, setDataAula] = useState("");
  const [origem, setOrigem] = useState("");

  const [treinamento, setTreinamento] = useState(null);
  const [registrosAula, setRegistrosAula] = useState([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    const aulaId = search.get("turma_aula_id") || "";
    const data = search.get("data_aula") || "";
    const origemParam = search.get("origem") || "";

    setTurmaAulaId(aulaId);
    setModoAula(Boolean(aulaId));
    setDataAula(data);
    setOrigem(origemParam);
  }, []);

  useEffect(() => {
    async function carregar() {
      try {
        if (!id) return;

        setLoading(true);
        setErro("");
        setSucesso("");

        const dadosTreinamento = await apiFetch(`/treinamentos/${id}`);
        setTreinamento(dadosTreinamento || null);

        if (turmaAulaId) {
          await apiFetch("/presenca-aulas/inicializar", {
            method: "POST",
            body: JSON.stringify({
              turma_aula_id: Number(turmaAulaId),
            }),
          });

          const registros = await apiFetch(
            `/presenca-aulas?turma_aula_id=${encodeURIComponent(turmaAulaId)}`
          );

          setRegistrosAula(Array.isArray(registros) ? registros : []);
        }
      } catch (err) {
        setErro(err.message || "Erro ao carregar dados");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, [id, turmaAulaId]);

  function atualizarStatus(index, status) {
    const copia = [...registrosAula];
    copia[index] = {
      ...copia[index],
      status,
    };
    setRegistrosAula(copia);
  }

  function atualizarJustificativa(index, justificativa) {
    const copia = [...registrosAula];
    copia[index] = {
      ...copia[index],
      justificativa,
    };
    setRegistrosAula(copia);
  }

  async function salvarPresencaAula() {
    try {
      setSalvando(true);
      setErro("");
      setSucesso("");

      await apiFetch("/presenca-aulas/salvar", {
        method: "POST",
        body: JSON.stringify({
          turma_aula_id: Number(turmaAulaId),
          registros: registrosAula.map((item) => ({
            treinando_nome: item.treinando_nome,
            status: item.status || "pendente",
            justificativa: item.justificativa || "",
          })),
        }),
      });

      setSucesso("Presença da aula salva com sucesso.");
    } catch (err) {
      setErro(err.message || "Erro ao salvar presença");
    } finally {
      setSalvando(false);
    }
  }

  const resumo = useMemo(() => {
    const presentes = registrosAula.filter((i) => i.status === "presente").length;
    const ausentes = registrosAula.filter((i) => i.status === "ausente").length;
    const justificados = registrosAula.filter((i) => i.status === "justificado").length;
    const pendentes = registrosAula.filter(
      (i) => !i.status || i.status === "pendente"
    ).length;

    return {
      total: registrosAula.length,
      presentes,
      ausentes,
      justificados,
      pendentes,
    };
  }, [registrosAula]);

  const registrosFiltrados = useMemo(() => {
    const termo = String(busca || "").trim().toLowerCase();
    if (!termo) return registrosAula;

    return registrosAula.filter((item) =>
      String(item.treinando_nome || "").toLowerCase().includes(termo)
    );
  }, [registrosAula, busca]);

  function voltar() {
    if (modoAula || origem === "cronograma") {
      window.location.href = `/turma/${id}/cronograma`;
      return;
    }

    window.location.href = "/presencas";
  }

  if (loading) {
    return <div style={loadingWrap}>Carregando página da turma...</div>;
  }

  return (
    <div style={page}>
      <div style={topBar}>
        <button style={btnVoltar} onClick={voltar}>
          {modoAula ? "← Voltar para cronograma" : "← Voltar"}
        </button>
      </div>

      <div style={hero}>
        <div style={heroBadge}>
          {modoAula ? "Presença por aula" : "Gestão da turma"}
        </div>

        <h1 style={heroTitle}>{treinamento?.tema || "Página da Turma"}</h1>

        <p style={heroSubtitle}>
          {modoAula
            ? "Controle de presença individual da aula selecionada."
            : "Visão consolidada da turma e seus dados principais."}
        </p>

        <div style={heroGrid}>
          <InfoCard label="Cliente" value={treinamento?.cliente || "-"} />
          <InfoCard label="Instrutor" value={treinamento?.instrutor || "-"} />
          <InfoCard
            label="Data início"
            value={formatDate(treinamento?.data_inicio || treinamento?.data)}
          />
          <InfoCard
            label="Data fim"
            value={formatDate(treinamento?.data_fim)}
          />
        </div>
      </div>

      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      {modoAula ? (
        <>
          <div style={statsGrid}>
            <StatCard title="Total" value={resumo.total} />
            <StatCard title="Presentes" value={resumo.presentes} />
            <StatCard title="Ausentes" value={resumo.ausentes} />
            <StatCard title="Justificados" value={resumo.justificados} />
            <StatCard title="Pendentes" value={resumo.pendentes} />
          </div>

          <div style={sectionCard}>
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Presença por aula</h2>
                <p style={sectionSubtitle}>
                  Aula vinculada ao dia {formatDate(dataAula)} • Turma aula ID{" "}
                  {turmaAulaId || "-"}
                </p>
              </div>

              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar treinando"
                style={searchInput}
              />
            </div>

            <div style={listaRegistros}>
              {registrosFiltrados.map((item, index) => (
                <div key={item.id || index} style={registroCard}>
                  <div style={registroTop}>
                    <div>
                      <div style={registroNome}>{item.treinando_nome || "-"}</div>
                      <div style={{ ...statusPill, ...getStatusStyle(item.status) }}>
                        {String(item.status || "pendente").toUpperCase()}
                      </div>
                    </div>
                  </div>

                  <div style={registroGrid}>
                    <select
                      value={item.status || "pendente"}
                      onChange={(e) => {
                        const indexReal = registrosAula.findIndex(
                          (r) => (r.id || r.treinando_nome) === (item.id || item.treinando_nome)
                        );
                        if (indexReal >= 0) atualizarStatus(indexReal, e.target.value);
                      }}
                      style={field}
                    >
                      <option value="pendente">Pendente</option>
                      <option value="presente">Presente</option>
                      <option value="ausente">Ausente</option>
                      <option value="justificado">Justificado</option>
                    </select>

                    <input
                      value={item.justificativa || ""}
                      onChange={(e) => {
                        const indexReal = registrosAula.findIndex(
                          (r) => (r.id || r.treinando_nome) === (item.id || item.treinando_nome)
                        );
                        if (indexReal >= 0) {
                          atualizarJustificativa(indexReal, e.target.value);
                        }
                      }}
                      placeholder="Justificativa"
                      style={field}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div style={actionsRow}>
              <button
                onClick={salvarPresencaAula}
                disabled={salvando}
                style={btnSalvar}
              >
                {salvando ? "Salvando..." : "Salvar presença da aula"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div style={sectionCard}>
          <h2 style={sectionTitle}>Resumo da turma</h2>
          <p style={sectionSubtitle}>
            A turma foi carregada com sucesso. Essa visualização permanece estável
            para uso geral e navegação interna.
          </p>
        </div>
      )}
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
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 22,
  padding: 24,
  color: "#fff",
  boxShadow: "0 18px 36px rgba(29,78,216,.18)",
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
  marginTop: 18,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const infoCard = {
  background: "rgba(255,255,255,.10)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 14,
  padding: 14,
};

const infoLabel = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "rgba(255,255,255,.68)",
};

const infoValue = {
  marginTop: 6,
  fontWeight: 800,
  fontSize: 18,
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

const statTitle = {
  color: "#64748b",
  fontSize: 13,
};

const statValue = {
  marginTop: 6,
  fontSize: 30,
  fontWeight: 800,
  color: "#0f172a",
};

const sectionCard = {
  marginTop: 16,
  background: "#fff",
  borderRadius: 20,
  padding: 20,
  border: "1px solid #e2e8f0",
  boxShadow: "0 12px 28px rgba(15,23,42,.05)",
};

const sectionHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 16,
  flexWrap: "wrap",
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

const searchInput = {
  width: 240,
  maxWidth: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  outline: "none",
};

const listaRegistros = {
  display: "grid",
  gap: 12,
};

const registroCard = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 14,
  background: "#f8fafc",
};

const registroTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 12,
};

const registroNome = {
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 16,
};

const statusPill = {
  display: "inline-block",
  marginTop: 8,
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const registroGrid = {
  display: "grid",
  gridTemplateColumns: "220px 1fr",
  gap: 10,
};

const field = {
  width: "100%",
  boxSizing: "border-box",
  height: 42,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  background: "#fff",
  outline: "none",
};

const actionsRow = {
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
