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

function calcPercentual(parte, total) {
  if (!total) return 0;
  return Math.round((Number(parte || 0) / Number(total || 0)) * 100);
}

function sortByDateAsc(items, field = "data_aula") {
  return [...items].sort((a, b) => {
    const da = new Date(a?.[field] || 0).getTime();
    const db = new Date(b?.[field] || 0).getTime();
    return da - db;
  });
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
  const [aulasTurma, setAulasTurma] = useState([]);
  const [resumosAulas, setResumosAulas] = useState([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const search = new URLSearchParams(window.location.search);
    setTurmaAulaId(search.get("turma_aula_id") || "");
    setModoAula(Boolean(search.get("turma_aula_id")));
    setDataAula(search.get("data_aula") || "");
    setOrigem(search.get("origem") || "");
  }, []);

  useEffect(() => {
    async function carregar() {
      try {
        if (!id) return;

        setLoading(true);
        setErro("");
        setSucesso("");

        const [dadosTreinamento, aulas] = await Promise.all([
          apiFetch(`/treinamentos/${id}`),
          apiFetch(`/turma-aulas?treinamento_id=${id}`).catch(() => []),
        ]);

        const listaAulas = Array.isArray(aulas) ? aulas : [];

        setTreinamento(dadosTreinamento || null);
        setAulasTurma(listaAulas);

        if (listaAulas.length) {
          const resumos = await Promise.all(
            listaAulas.map(async (aula) => {
              try {
                const resumo = await apiFetch(`/presenca-aulas/resumo/${aula.id}`);
                return {
                  turma_aula_id: aula.id,
                  data_aula: aula.data_aula,
                  titulo: aula.titulo || aula.nome || aula.tema || null,
                  ...resumo,
                };
              } catch {
                return {
                  turma_aula_id: aula.id,
                  data_aula: aula.data_aula,
                  titulo: aula.titulo || aula.nome || aula.tema || null,
                  total: 0,
                  presentes: 0,
                  ausentes: 0,
                  justificados: 0,
                  pendentes: 0,
                  percentual: 0,
                };
              }
            })
          );

          setResumosAulas(resumos);
        } else {
          setResumosAulas([]);
        }

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
        } else {
          setRegistrosAula([]);
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

      const [registrosAtualizados, resumoAtualizado] = await Promise.all([
        apiFetch(`/presenca-aulas?turma_aula_id=${encodeURIComponent(turmaAulaId)}`).catch(() => []),
        apiFetch(`/presenca-aulas/resumo/${turmaAulaId}`).catch(() => null),
      ]);

      setRegistrosAula(Array.isArray(registrosAtualizados) ? registrosAtualizados : []);

      if (resumoAtualizado) {
        setResumosAulas((prev) =>
          prev.map((item) =>
            String(item.turma_aula_id) === String(turmaAulaId)
              ? { ...item, ...resumoAtualizado }
              : item
          )
        );
      }

      setSucesso("Presença da aula salva com sucesso.");
    } catch (err) {
      setErro(err.message || "Erro ao salvar presença");
    } finally {
      setSalvando(false);
    }
  }

  const resumoAulaAtual = useMemo(() => {
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
      percentual: calcPercentual(presentes, registrosAula.length),
    };
  }, [registrosAula]);

  const resumoTurma = useMemo(() => {
    const totalAulas = aulasTurma.length;
    const aulasOrdenadas = sortByDateAsc(aulasTurma);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const resumosValidos = resumosAulas.filter(
      (item) => Number(item.total || 0) > 0 || Number(item.presentes || 0) > 0 || Number(item.ausentes || 0) > 0 || Number(item.justificados || 0) > 0 || Number(item.pendentes || 0) > 0
    );

    const aulasComPresenca = resumosAulas.filter(
      (item) => Number(item.total || 0) > 0
    ).length;

    const totalEsperado = resumosAulas.reduce(
      (acc, item) => acc + Number(item.total || 0),
      0
    );

    const totalPresentes = resumosAulas.reduce(
      (acc, item) => acc + Number(item.presentes || 0),
      0
    );

    const totalAusentes = resumosAulas.reduce(
      (acc, item) => acc + Number(item.ausentes || 0),
      0
    );

    const totalJustificados = resumosAulas.reduce(
      (acc, item) => acc + Number(item.justificados || 0),
      0
    );

    const totalPendentes = resumosAulas.reduce(
      (acc, item) => acc + Number(item.pendentes || 0),
      0
    );

    const aderenciaMedia = calcPercentual(totalPresentes, totalEsperado);

    let ultimaAulaLancada = null;
    if (resumosValidos.length) {
      ultimaAulaLancada = sortByDateAsc(resumosValidos, "data_aula")
        .filter((item) => Number(item.total || 0) > 0)
        .slice(-1)[0] || null;
    }

    const proximaAulaPrevista =
      aulasOrdenadas.find((aula) => {
        const d = new Date(aula?.data_aula || 0);
        d.setHours(0, 0, 0, 0);
        return d >= hoje;
      }) || aulasOrdenadas[0] || null;

    const previstos = Number(
      treinamento?.participantes_previstos ||
        treinamento?.participantes ||
        0
    );

    let statusGeral = {
      label: "Não iniciada",
      bg: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fde68a",
    };

    if (totalAulas > 0 && aulasComPresenca > 0 && aulasComPresenca < totalAulas) {
      statusGeral = {
        label: "Em andamento",
        bg: "#dbeafe",
        color: "#1d4ed8",
        border: "1px solid #bfdbfe",
      };
    }

    if (totalPendentes > 0) {
      statusGeral = {
        label: "Com pendências",
        bg: "#fee2e2",
        color: "#b91c1c",
        border: "1px solid #fecaca",
      };
    }

    if (totalAulas > 0 && aulasComPresenca >= totalAulas && totalPendentes === 0) {
      statusGeral = {
        label: "Concluída",
        bg: "#dcfce7",
        color: "#166534",
        border: "1px solid #bbf7d0",
      };
    }

    return {
      nomeTurma: treinamento?.tema || `Turma #${id || "-"}`,
      previstos,
      totalAulas,
      aulasComPresenca,
      totalEsperado,
      totalPresentes,
      totalAusentes,
      totalJustificados,
      totalPendentes,
      aderenciaMedia,
      ultimaAulaLancada,
      proximaAulaPrevista,
      instrutorMinistrando: treinamento?.instrutor || "-",
      statusGeral,
    };
  }, [aulasTurma, resumosAulas, treinamento, id]);

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

  function abrirCronograma() {
    window.location.href = `/turma/${id}/cronograma`;
  }

  function atualizarPagina() {
    window.location.reload();
  }

  function abrirPresencaAtual() {
    if (!turmaAulaId) return;
    window.location.href = `/turma/${id}?turma_aula_id=${turmaAulaId}&data_aula=${dataAula}&origem=cronograma`;
  }

  if (loading) {
    return <div style={loadingWrap}>Carregando gestão da turma...</div>;
  }

  return (
    <div style={page}>
      <div style={topBar}>
        <button style={btnVoltar} onClick={voltar}>
          ← Voltar
        </button>
      </div>

      <div style={hero}>
        <div style={heroBadge}>
          {modoAula ? "Presença por aula" : "Gestão da turma"}
        </div>

        <h1 style={heroTitle}>{resumoTurma.nomeTurma}</h1>

        <p style={heroSubtitle}>
          {modoAula
            ? "Controle operacional da presença da aula selecionada, com visão gerencial consolidada da turma."
            : "Visão consolidada da turma, seus dados principais e leitura executiva do andamento."}
        </p>

        <div style={heroGrid}>
          <InfoCard label="Turma" value={resumoTurma.nomeTurma} />
          <InfoCard label="Cliente" value={treinamento?.cliente || "-"} />
          <InfoCard label="Instrutor" value={treinamento?.instrutor || "-"} />
          <InfoCard
            label="Período"
            value={`${formatDate(
              treinamento?.data_inicio || treinamento?.data
            )} até ${formatDate(treinamento?.data_fim)}`}
          />
        </div>
      </div>

      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={statsGrid}>
        <StatCard title="Treinandos previstos" value={resumoTurma.previstos} />
        <StatCard title="Aulas planejadas" value={resumoTurma.totalAulas} />
        <StatCard title="Aulas com presença" value={resumoTurma.aulasComPresenca} />
        <StatCard title="Pendências" value={resumoTurma.totalPendentes} />
        <StatCard title="Aderência média" value={`${resumoTurma.aderenciaMedia}%`} />
      </div>

      <div style={statusCard}>
        <div style={statusLabel}>Status geral da turma</div>
        <div
          style={{
            ...statusBadge,
            background: resumoTurma.statusGeral.bg,
            color: resumoTurma.statusGeral.color,
            border: resumoTurma.statusGeral.border,
          }}
        >
          {resumoTurma.statusGeral.label}
        </div>
      </div>

      <div style={sectionCard}>
        <div style={sectionHeader}>
          <div>
            <h2 style={sectionTitle}>Ações rápidas</h2>
            <p style={sectionSubtitle}>
              Navegação rápida para acompanhamento da turma e atualização operacional.
            </p>
          </div>
        </div>

        <div style={quickActions}>
          <button style={btnSecondary} onClick={abrirCronograma}>
            Abrir cronograma
          </button>
          <button style={btnSecondary} onClick={atualizarPagina}>
            Atualizar dados
          </button>
          {modoAula ? (
            <>
              <button style={btnSecondary} onClick={abrirPresencaAtual}>
                Reabrir presença da aula
              </button>
              <button style={btnPrimary} onClick={salvarPresencaAula} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar presença da aula"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div style={sectionCard}>
        <div style={sectionHeader}>
          <div>
            <h2 style={sectionTitle}>Resumo gerencial</h2>
            <p style={sectionSubtitle}>
              Leitura consolidada da turma a partir das aulas planejadas e presenças lançadas.
            </p>
          </div>
        </div>

        <div style={managerGrid}>
          <OperationalItem
            label="Turma"
            value={resumoTurma.nomeTurma}
          />
          <OperationalItem
            label="Instrutor"
            value={resumoTurma.instrutorMinistrando}
          />
          <OperationalItem
            label="Presenças acumuladas"
            value={`${resumoTurma.totalPresentes} de ${resumoTurma.totalEsperado}`}
          />
          <OperationalItem
            label="Ausências acumuladas"
            value={resumoTurma.totalAusentes}
          />
          <OperationalItem
            label="Justificados"
            value={resumoTurma.totalJustificados}
          />
          <OperationalItem
            label="Próxima aula prevista"
            value={
              resumoTurma.proximaAulaPrevista
                ? formatDate(resumoTurma.proximaAulaPrevista.data_aula)
                : "-"
            }
          />
          <OperationalItem
            label="Última aula lançada"
            value={
              resumoTurma.ultimaAulaLancada
                ? formatDate(resumoTurma.ultimaAulaLancada.data_aula)
                : "-"
            }
          />
          <OperationalItem
            label="Origem do fluxo"
            value={origem || (modoAula ? "cronograma" : "gestão")}
          />
        </div>
      </div>

      <div style={sectionCard}>
        <div style={sectionHeader}>
          <div>
            <h2 style={sectionTitle}>Resumo operacional</h2>
            <p style={sectionSubtitle}>
              Informações operacionais e contexto atual da turma.
            </p>
          </div>
        </div>

        <div style={operationalGrid}>
          <OperationalItem label="Turma" value={resumoTurma.nomeTurma} />
          <OperationalItem label="Público" value={treinamento?.publico || "-"} />
          <OperationalItem label="Carga horária" value={treinamento?.carga_horaria || "-"} />
          <OperationalItem label="Cliente" value={treinamento?.cliente || "-"} />
          <OperationalItem label="Instrutor" value={resumoTurma.instrutorMinistrando} />
          <OperationalItem
            label="Data da aula"
            value={modoAula ? formatDate(dataAula) : "-"}
          />
        </div>
      </div>

      {modoAula ? (
        <>
          <div style={sectionCard}>
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Resumo da aula</h2>
                <p style={sectionSubtitle}>
                  Indicadores consolidados do lançamento da aula selecionada.
                </p>
              </div>

              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar treinando"
                style={searchInput}
              />
            </div>

            <div style={statsGridSmall}>
              <StatCard title="Total" value={resumoAulaAtual.total} />
              <StatCard title="Presentes" value={resumoAulaAtual.presentes} />
              <StatCard title="Ausentes" value={resumoAulaAtual.ausentes} />
              <StatCard title="Justificados" value={resumoAulaAtual.justificados} />
              <StatCard title="Pendentes" value={resumoAulaAtual.pendentes} />
            </div>
          </div>

          <div style={sectionCard}>
            <div style={sectionHeader}>
              <div>
                <h2 style={sectionTitle}>Presença por aula</h2>
                <p style={sectionSubtitle}>
                  Aula vinculada ao dia {formatDate(dataAula)} • Turma aula ID {turmaAulaId || "-"}
                </p>
              </div>
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
                style={btnPrimary}
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
            A gestão da turma agora considera planejamento, presença lançada, aderência média e marcos principais do cronograma.
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

function OperationalItem({ label, value }) {
  return (
    <div style={operationalItem}>
      <div style={operationalLabel}>{label}</div>
      <div style={operationalValue}>{value}</div>
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
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const statsGridSmall = {
  marginTop: 6,
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

const statusCard = {
  marginTop: 16,
  background: "#fff",
  borderRadius: 20,
  padding: 20,
  border: "1px solid #e2e8f0",
  boxShadow: "0 12px 28px rgba(15,23,42,.05)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const statusLabel = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
};

const statusBadge = {
  borderRadius: 999,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 800,
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

const quickActions = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const btnPrimary = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 12,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: 800,
};

const btnSecondary = {
  background: "#ffffff",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: 700,
};

const managerGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const operationalGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const operationalItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
};

const operationalLabel = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#64748b",
  letterSpacing: ".04em",
};

const operationalValue = {
  marginTop: 6,
  fontSize: 16,
  fontWeight: 700,
  color: "#0f172a",
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
