"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../../services/api";

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

function toInputDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function formatHours(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0h";

  const horas = Math.floor(num);
  const minutos = Math.round((num - horas) * 60);

  if (minutos === 0) return `${horas}h`;
  if (horas === 0) return `${minutos}min`;
  return `${horas}h${String(minutos).padStart(2, "0")}`;
}

function calcPercentual(parte, total) {
  if (!total) return 0;
  return Math.round((Number(parte || 0) / Number(total || 0)) * 100);
}

function getPercentStyle(percentual) {
  const valor = Number(percentual || 0);

  if (valor >= 95) {
    return {
      background: "#dcfce7",
      color: "#166534",
      border: "1px solid #bbf7d0",
      label: "Excelente",
    };
  }

  if (valor >= 80) {
    return {
      background: "#dbeafe",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
      label: "Estável",
    };
  }

  if (valor >= 60) {
    return {
      background: "#fef3c7",
      color: "#92400e",
      border: "1px solid #fde68a",
      label: "Atenção",
    };
  }

  return {
    background: "#fee2e2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    label: "Crítico",
  };
}

function sortByDateAsc(items, field = "data_aula") {
  return [...items].sort((a, b) => {
    const da = new Date(a?.[field] || 0).getTime();
    const db = new Date(b?.[field] || 0).getTime();
    return da - db;
  });
}

const CARGA_OPTIONS = [
  { value: 0.5, label: "0h30" },
  { value: 1, label: "1h00" },
  { value: 1.5, label: "1h30" },
  { value: 2, label: "2h00" },
  { value: 2.5, label: "2h30" },
  { value: 3, label: "3h00" },
  { value: 3.5, label: "3h30" },
  { value: 4, label: "4h00" },
  { value: 4.5, label: "4h30" },
  { value: 5, label: "5h00" },
  { value: 5.5, label: "5h30" },
  { value: 6, label: "6h00" },
  { value: 6.5, label: "6h30" },
  { value: 7, label: "7h00" },
  { value: 7.5, label: "7h30" },
  { value: 8, label: "8h00" },
];

const TIPO_AULA_OPTIONS = [
  "Aula regular",
  "Reciclagem",
  "Reforço",
  "Repescagem",
  "Reposição",
  "Atualização",
  "Simulado",
];

const STATUS_AULA_OPTIONS = [
  "Planejada",
  "Em andamento",
  "Concluída",
  "Reprogramada",
  "Cancelada",
];

function emptyAulaForm(instrutor = "", carga = 1) {
  return {
    id: "",
    dia: "",
    titulo: "",
    data_aula: "",
    instrutor: instrutor || "",
    tipo_aula: "Aula regular",
    status_aula: "Planejada",
    carga_planejada: Number(carga || 1),
    objetivo: "",
    conteudo_programatico: "",
    observacoes: "",
  };
}

export default function CronogramaTurmaPage() {
  const routeParams = useParams();
  const id = routeParams?.id;

  const [treinamento, setTreinamento] = useState(null);
  const [aulasTurma, setAulasTurma] = useState([]);
  const [resumosAulas, setResumosAulas] = useState([]);
  const [turmasDisponiveis, setTurmasDisponiveis] = useState([]);
  const [participantesResumo, setParticipantesResumo] = useState([]);

  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(true);

  const [aulaForm, setAulaForm] = useState(emptyAulaForm());
  const [salvandoAula, setSalvandoAula] = useState(false);

  const [autoForm, setAutoForm] = useState({
    data_inicio: "",
    data_fim: "",
    carga_horaria: 1,
    ignorar_domingo: true,
  });
  const [gerando, setGerando] = useState(false);

  const [duplicarModal, setDuplicarModal] = useState({
    open: false,
    origemId: "",
  });
  const [duplicando, setDuplicando] = useState(false);

  useEffect(() => {
    carregarTudo();
  }, [id]);

  async function carregarTudo() {
    try {
      if (!id) return;

      setLoading(true);
      setErro("");
      setSucesso("");

      const [dadosTreinamento, aulas, turmas, participantes] = await Promise.all([
        apiFetch(`/treinamentos/${id}`),
        apiFetch(`/turma-aulas?treinamento_id=${id}`).catch(() => []),
        apiFetch("/treinamentos").catch(() => []),
        apiFetch(`/turmas-participantes?treinamento_id=${id}`).catch(() => []),
      ]);

      const listaAulas = sortByDateAsc(Array.isArray(aulas) ? aulas : []);
      const listaTurmas = Array.isArray(turmas) ? turmas : [];
      const listaParticipantes = Array.isArray(participantes) ? participantes : [];

      setTreinamento(dadosTreinamento || null);
      setAulasTurma(listaAulas);
      setParticipantesResumo(listaParticipantes);
      setTurmasDisponiveis(
        listaTurmas.filter((item) => String(item.id) !== String(id))
      );

      const cargaPadrao = Number(dadosTreinamento?.carga_horaria || 1);

      setAutoForm((prev) => ({
        ...prev,
        data_inicio: toInputDate(
          dadosTreinamento?.data_inicio || dadosTreinamento?.data || ""
        ),
        data_fim: toInputDate(dadosTreinamento?.data_fim || ""),
        carga_horaria: cargaPadrao,
      }));

      setAulaForm((prev) =>
        prev.id
          ? prev
          : emptyAulaForm(dadosTreinamento?.instrutor || "", cargaPadrao)
      );

      if (listaAulas.length) {
        const resumos = await Promise.all(
          listaAulas.map(async (aula, index) => {
            try {
              const resumo = await apiFetch(`/presenca-aulas/resumo/${aula.id}`);
              return {
                turma_aula_id: aula.id,
                data_aula: aula.data_aula,
                dia: aula.dia || index + 1,
                titulo:
                  aula.titulo ||
                  aula.nome ||
                  aula.tema ||
                  `Aula do Dia ${index + 1}`,
                tipo_aula: aula.tipo_aula || "Aula regular",
                status_aula: aula.status_aula || "Planejada",
                objetivo: aula.objetivo || "",
                conteudo_programatico: aula.conteudo_programatico || "",
                observacoes: aula.observacoes || "",
                instrutor: aula.instrutor || dadosTreinamento?.instrutor || "",
                carga_planejada: Number(
                  aula.carga_planejada || aula.carga_horaria || 0
                ),
                carga_real: Number(
                  aula.carga_real || aula.carga_ministrada || 0
                ),
                ministradas: Number(aula.ministradas || 0),
                parciais: Number(aula.parciais || 0),
                planejadas: Number(aula.planejadas || 1),
                reprogramadas: Number(aula.reprogramadas || 0),
                canceladas: Number(aula.canceladas || 0),
                ...resumo,
              };
            } catch {
              return {
                turma_aula_id: aula.id,
                data_aula: aula.data_aula,
                dia: aula.dia || index + 1,
                titulo:
                  aula.titulo ||
                  aula.nome ||
                  aula.tema ||
                  `Aula do Dia ${index + 1}`,
                tipo_aula: aula.tipo_aula || "Aula regular",
                status_aula: aula.status_aula || "Planejada",
                objetivo: aula.objetivo || "",
                conteudo_programatico: aula.conteudo_programatico || "",
                observacoes: aula.observacoes || "",
                instrutor: aula.instrutor || dadosTreinamento?.instrutor || "",
                carga_planejada: Number(
                  aula.carga_planejada || aula.carga_horaria || 0
                ),
                carga_real: Number(
                  aula.carga_real || aula.carga_ministrada || 0
                ),
                ministradas: Number(aula.ministradas || 0),
                parciais: Number(aula.parciais || 0),
                planejadas: Number(aula.planejadas || 1),
                reprogramadas: Number(aula.reprogramadas || 0),
                canceladas: Number(aula.canceladas || 0),
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
    } catch (err) {
      setErro(err.message || "Erro ao carregar cronograma");
    } finally {
      setLoading(false);
    }
  }

  const resumoGeral = useMemo(() => {
    const totalAulas = resumosAulas.length;
    const aulasComPresenca = resumosAulas.filter(
      (item) =>
        Number(item.total || 0) > 0 ||
        Number(item.presentes || 0) > 0 ||
        Number(item.ausentes || 0) > 0 ||
        Number(item.justificados || 0) > 0 ||
        Number(item.pendentes || 0) > 0
    ).length;

    const totalPresentes = resumosAulas.reduce(
      (acc, item) => acc + Number(item.presentes || 0),
      0
    );
    const totalEsperado = resumosAulas.reduce(
      (acc, item) => acc + Number(item.total || 0),
      0
    );
    const totalPendentes = resumosAulas.reduce(
      (acc, item) => acc + Number(item.pendentes || 0),
      0
    );
    const totalAusentes = resumosAulas.reduce(
      (acc, item) => acc + Number(item.ausentes || 0),
      0
    );
    const aderenciaMedia = calcPercentual(totalPresentes, totalEsperado);

    const ativos = participantesResumo.filter(
      (item) => String(item.status || "Ativo").toLowerCase() === "ativo"
    ).length;

    return {
      totalAulas,
      aulasComPresenca,
      totalPresentes,
      totalEsperado,
      totalPendentes,
      totalAusentes,
      aderenciaMedia,
      ativos,
    };
  }, [resumosAulas, participantesResumo]);

  function abrirPresencaAula(aula) {
    window.location.href = `/turma/${id}?turma_aula_id=${aula.turma_aula_id}&data_aula=${aula.data_aula}&origem=cronograma`;
  }

  function voltar() {
    window.location.href = `/turma/${id}`;
  }

  function abrirParticipantes() {
    window.location.href = `/turma/${id}/participantes`;
  }

  async function gerarCronogramaAutomatico() {
    try {
      setGerando(true);
      setErro("");
      setSucesso("");

      await apiFetch("/turma-aulas/gerar-cronograma", {
        method: "POST",
        body: JSON.stringify({
          treinamento_id: Number(id),
          treinamento: Number(id),
          data_inicio: autoForm.data_inicio,
          data_fim: autoForm.data_fim,
          carga_horaria: Number(autoForm.carga_horaria || 0),
          ignorar_domingo: Boolean(autoForm.ignorar_domingo),
        }),
      });

      setSucesso("Cronograma gerado com sucesso.");
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao gerar cronograma automático");
    } finally {
      setGerando(false);
    }
  }

  async function copiarCronograma() {
    try {
      if (!duplicarModal.origemId) {
        setErro("Selecione uma turma de origem para copiar o cronograma.");
        return;
      }

      setDuplicando(true);
      setErro("");
      setSucesso("");

      await apiFetch("/turma-aulas/duplicar", {
        method: "POST",
        body: JSON.stringify({
          treinamento_destino_id: Number(id),
          treinamento_destino: Number(id),
          treinamento_origem_id: Number(duplicarModal.origemId),
          treinamento_origem: Number(duplicarModal.origemId),
        }),
      });

      setSucesso("Cronograma copiado com sucesso.");
      setDuplicarModal({
        open: false,
        origemId: "",
      });
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao copiar cronograma");
    } finally {
      setDuplicando(false);
    }
  }

  function editarAula(aula) {
    setAulaForm({
      id: aula.turma_aula_id || aula.id || "",
      dia: aula.dia || "",
      titulo: aula.titulo || "",
      data_aula: toInputDate(aula.data_aula),
      instrutor: aula.instrutor || treinamento?.instrutor || "",
      tipo_aula: aula.tipo_aula || "Aula regular",
      status_aula: aula.status_aula || "Planejada",
      carga_planejada: Number(aula.carga_planejada || 1),
      objetivo: aula.objetivo || "",
      conteudo_programatico: aula.conteudo_programatico || "",
      observacoes: aula.observacoes || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function limparFormularioAula() {
    setAulaForm(
      emptyAulaForm(
        treinamento?.instrutor || "",
        Number(treinamento?.carga_horaria || 1)
      )
    );
  }

  async function salvarAula() {
    try {
      setSalvandoAula(true);
      setErro("");
      setSucesso("");

      const payloadBase = {
        treinamento: Number(id),
        treinamento_id: Number(id),
        dia: Number(aulaForm.dia || 0),
        tema: aulaForm.titulo,
        titulo: aulaForm.titulo,
        data: aulaForm.data_aula,
        data_aula: aulaForm.data_aula,
        instrutor: aulaForm.instrutor,
        carga_horaria: Number(aulaForm.carga_planejada || 0),
        carga_planejada: Number(aulaForm.carga_planejada || 0),
        objetivo: aulaForm.objetivo,
      };

      const payloadCompleto = {
        ...payloadBase,
        tipo_aula: aulaForm.tipo_aula,
        status_aula: aulaForm.status_aula,
        conteudo_programatico: aulaForm.conteudo_programatico,
        observacoes: aulaForm.observacoes,
      };

      if (
        !payloadBase.treinamento ||
        !payloadBase.dia ||
        !payloadBase.data ||
        !payloadBase.titulo
      ) {
        throw new Error("Preencha treinamento, dia, data e título da aula.");
      }

      try {
        if (aulaForm.id) {
          await apiFetch(`/turma-aulas/${aulaForm.id}`, {
            method: "PUT",
            body: JSON.stringify(payloadCompleto),
          });
          setSucesso("Aula atualizada com sucesso.");
        } else {
          await apiFetch("/turma-aulas", {
            method: "POST",
            body: JSON.stringify(payloadCompleto),
          });
          setSucesso("Plano de aula cadastrado com sucesso.");
        }
      } catch {
        if (aulaForm.id) {
          await apiFetch(`/turma-aulas/${aulaForm.id}`, {
            method: "PUT",
            body: JSON.stringify(payloadBase),
          });
          setSucesso("Aula atualizada com sucesso.");
        } else {
          await apiFetch("/turma-aulas", {
            method: "POST",
            body: JSON.stringify(payloadBase),
          });
          setSucesso("Plano de aula cadastrado com sucesso.");
        }
      }

      limparFormularioAula();
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao salvar aula");
    } finally {
      setSalvandoAula(false);
    }
  }

  async function excluirAula(aulaId) {
    const confirmar = window.confirm("Deseja realmente excluir esta aula?");
    if (!confirmar) return;

    try {
      setErro("");
      setSucesso("");

      await apiFetch(`/turma-aulas/${aulaId}`, {
        method: "DELETE",
      });

      setSucesso("Aula excluída com sucesso.");
      if (String(aulaForm.id) === String(aulaId)) limparFormularioAula();
      await carregarTudo();
    } catch (err) {
      setErro(err.message || "Erro ao excluir aula");
    }
  }

  if (loading) {
    return <div style={loadingWrap}>Carregando cronograma...</div>;
  }

  return (
    <div style={page}>
      <div style={topBar}>
        <button style={btnVoltar} onClick={voltar}>
          ← Voltar para gestão da turma
        </button>
      </div>

      <div style={hero}>
        <div style={heroBadge}>Cronograma da turma</div>
        <h1 style={heroTitle}>{treinamento?.tema || "Cronograma"}</h1>
        <p style={heroSubtitle}>
          Planejamento em formato de plano de aula, com indicadores operacionais preservados no painel por dia.
        </p>

        <div style={heroGrid}>
          <InfoCard label="Cliente" value={treinamento?.cliente || "-"} />
          <InfoCard label="Instrutor" value={treinamento?.instrutor || "-"} />
          <InfoCard
            label="Período"
            value={`${formatDate(
              treinamento?.data_inicio || treinamento?.data
            )} até ${formatDate(treinamento?.data_fim)}`}
          />
          <InfoCard label="Ativos na turma" value={resumoGeral.ativos} />
        </div>
      </div>

      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={statsGrid}>
        <StatCard title="Aulas planejadas" value={resumoGeral.totalAulas} />
        <StatCard title="Aulas com presença" value={resumoGeral.aulasComPresenca} />
        <StatCard title="Presenças acumuladas" value={resumoGeral.totalPresentes} />
        <StatCard title="Ausências" value={resumoGeral.totalAusentes} />
        <StatCard title="Pendências" value={resumoGeral.totalPendentes} />
        <StatCard title="Aderência média" value={`${resumoGeral.aderenciaMedia}%`} />
      </div>

      <div style={sectionCard}>
        <div style={sectionHeader}>
          <div>
            <h2 style={sectionTitle}>Ações rápidas da turma</h2>
            <p style={sectionSubtitle}>
              Ajuste o plano de aula e gerencie a base de treinandos sem sair da turma.
            </p>
          </div>
        </div>

        <div style={actionsRowLeft}>
          <button style={btnSecondary} onClick={abrirParticipantes}>
            Base da turma
          </button>
        </div>
      </div>

      <div style={sectionCard}>
        <div style={sectionHeader}>
          <div>
            <h2 style={sectionTitle}>Gerar cronograma automaticamente</h2>
            <p style={sectionSubtitle}>
              Gere as aulas com base no período da turma e na carga horária padrão.
            </p>
          </div>
        </div>

        <div style={formGrid}>
          <Field label="Data de início">
            <input
              type="date"
              value={autoForm.data_inicio}
              onChange={(e) =>
                setAutoForm((prev) => ({
                  ...prev,
                  data_inicio: e.target.value,
                }))
              }
              style={field}
            />
          </Field>

          <Field label="Data de fim">
            <input
              type="date"
              value={autoForm.data_fim}
              onChange={(e) =>
                setAutoForm((prev) => ({
                  ...prev,
                  data_fim: e.target.value,
                }))
              }
              style={field}
            />
          </Field>

          <Field label="Carga horária padrão">
            <select
              value={String(autoForm.carga_horaria)}
              onChange={(e) =>
                setAutoForm((prev) => ({
                  ...prev,
                  carga_horaria: Number(e.target.value),
                }))
              }
              style={field}
            >
              {CARGA_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Ignorar domingo">
            <select
              value={autoForm.ignorar_domingo ? "sim" : "nao"}
              onChange={(e) =>
                setAutoForm((prev) => ({
                  ...prev,
                  ignorar_domingo: e.target.value === "sim",
                }))
              }
              style={field}
            >
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </Field>
        </div>

        <div style={actionsRowLeft}>
          <button
            style={btnPrimary}
            onClick={gerarCronogramaAutomatico}
            disabled={gerando}
          >
            {gerando ? "Gerando..." : "Gerar cronograma automático"}
          </button>

          <button
            style={btnSecondary}
            onClick={() =>
              setDuplicarModal((prev) => ({
                ...prev,
                open: !prev.open,
              }))
            }
          >
            {duplicarModal.open ? "Fechar cópia" : "Copiar cronograma"}
          </button>
        </div>

        {duplicarModal.open ? (
          <div style={copyBox}>
            <div style={fieldWrap}>
              <label style={label}>Turma de origem</label>
              <select
                style={field}
                value={duplicarModal.origemId}
                onChange={(e) =>
                  setDuplicarModal((prev) => ({
                    ...prev,
                    origemId: e.target.value,
                  }))
                }
              >
                <option value="">Selecione</option>
                {turmasDisponiveis.map((item) => (
                  <option key={item.id} value={item.id}>
                    {(item.tema || "Sem nome")} • {item.cliente || "Sem cliente"} •{" "}
                    {formatDate(item.data_inicio || item.data)}
                  </option>
                ))}
              </select>
            </div>

            <div style={actionsRowLeft}>
              <button
                style={btnPrimary}
                onClick={copiarCronograma}
                disabled={duplicando}
              >
                {duplicando ? "Copiando..." : "Confirmar cópia"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div style={sectionCard}>
        <div style={sectionHeader}>
          <div>
            <h2 style={sectionTitle}>
              {aulaForm.id ? "Editar plano de aula" : "Cadastrar plano de aula"}
            </h2>
            <p style={sectionSubtitle}>
              Estruture a aula com foco em planejamento, objetivo e tempo previsto.
            </p>
          </div>
        </div>

        <div style={formGrid}>
          <Field label="Dia">
            <input
              type="number"
              min="1"
              value={aulaForm.dia}
              onChange={(e) =>
                setAulaForm((prev) => ({
                  ...prev,
                  dia: e.target.value,
                }))
              }
              style={field}
              placeholder="Ex.: 1"
            />
          </Field>

          <Field label="Título da aula">
            <input
              value={aulaForm.titulo}
              onChange={(e) =>
                setAulaForm((prev) => ({
                  ...prev,
                  titulo: e.target.value,
                }))
              }
              style={field}
              placeholder="Ex.: Aula do Dia 1"
            />
          </Field>

          <Field label="Data da aula">
            <input
              type="date"
              value={aulaForm.data_aula}
              onChange={(e) =>
                setAulaForm((prev) => ({
                  ...prev,
                  data_aula: e.target.value,
                }))
              }
              style={field}
            />
          </Field>

          <Field label="Instrutor">
            <input
              value={aulaForm.instrutor}
              onChange={(e) =>
                setAulaForm((prev) => ({
                  ...prev,
                  instrutor: e.target.value,
                }))
              }
              style={field}
            />
          </Field>

          <Field label="Tipo da aula">
            <select
              value={aulaForm.tipo_aula}
              onChange={(e) =>
                setAulaForm((prev) => ({
                  ...prev,
                  tipo_aula: e.target.value,
                }))
              }
              style={field}
            >
              {TIPO_AULA_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Status da aula">
            <select
              value={aulaForm.status_aula}
              onChange={(e) =>
                setAulaForm((prev) => ({
                  ...prev,
                  status_aula: e.target.value,
                }))
              }
              style={field}
            >
              {STATUS_AULA_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Carga planejada">
            <select
              value={String(aulaForm.carga_planejada)}
              onChange={(e) =>
                setAulaForm((prev) => ({
                  ...prev,
                  carga_planejada: Number(e.target.value),
                }))
              }
              style={field}
            >
              {CARGA_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Objetivo" full>
            <textarea
              value={aulaForm.objetivo}
              onChange={(e) =>
                setAulaForm((prev) => ({
                  ...prev,
                  objetivo: e.target.value,
                }))
              }
              style={textarea}
              placeholder="Objetivo da aula"
            />
          </Field>

          <Field label="Conteúdo programático" full>
            <textarea
              value={aulaForm.conteudo_programatico}
              onChange={(e) =>
                setAulaForm((prev) => ({
                  ...prev,
                  conteudo_programatico: e.target.value,
                }))
              }
              style={textarea}
              placeholder="Conteúdo principal a ser abordado"
            />
          </Field>

          <Field label="Observações" full>
            <textarea
              value={aulaForm.observacoes}
              onChange={(e) =>
                setAulaForm((prev) => ({
                  ...prev,
                  observacoes: e.target.value,
                }))
              }
              style={textarea}
              placeholder="Observações adicionais"
            />
          </Field>
        </div>

        <div style={actionsRowLeft}>
          <button
            style={btnPrimary}
            onClick={salvarAula}
            disabled={salvandoAula}
          >
            {salvandoAula
              ? "Salvando..."
              : aulaForm.id
              ? "Salvar alterações"
              : "Cadastrar plano de aula"}
          </button>

          <button style={btnSecondary} onClick={limparFormularioAula}>
            Limpar formulário
          </button>
        </div>
      </div>

      <div style={sectionCard}>
        <h2 style={sectionTitle}>Painel por dia</h2>
        <p style={sectionSubtitle}>Resumo diário da aderência da turma.</p>

        <div style={cardsGrid}>
          {resumosAulas.map((aula, index) => {
            const percentual = Number(aula.percentual || 0);
            const estilo = getPercentStyle(percentual);
            const desvio =
              Number(aula.carga_real || 0) - Number(aula.carga_planejada || 0);

            return (
              <div key={aula.turma_aula_id || index} style={cardDiaWrap}>
                <button
                  type="button"
                  style={cardDia}
                  onClick={() => abrirPresencaAula(aula)}
                >
                  <div style={cardTopo}>
                    <div>
                      <div style={tituloDia}>
                        {aula.titulo || `Aula do Dia ${index + 1}`}
                      </div>
                      <div style={subtituloDia}>{formatDate(aula.data_aula)}</div>
                    </div>

                    <div
                      style={{
                        ...badgePercentual,
                        background: estilo.background,
                        color: estilo.color,
                        border: estilo.border,
                      }}
                    >
                      {percentual}%
                    </div>
                  </div>

                  <div style={statusLinha}>
                    <span
                      style={{
                        ...statusTag,
                        background: estilo.background,
                        color: estilo.color,
                        border: estilo.border,
                      }}
                    >
                      {estilo.label}
                    </span>
                  </div>

                  <div style={pillRow}>
                    <span style={pillNeutral}>{aula.tipo_aula || "Aula regular"}</span>
                    <span style={pillNeutral}>{aula.status_aula || "Planejada"}</span>
                    <span style={pillNeutral}>Dia {aula.dia || index + 1}</span>
                  </div>

                  <div style={metaBloco}>
                    <span>
                      {Number(aula.planejadas || 1)} aula(s) •{" "}
                      {Number(aula.ministradas || 0)} ministrada(s) •{" "}
                      {Number(aula.parciais || 0)} parcial(is)
                    </span>
                  </div>

                  <div style={metaBloco}>
                    <span>
                      {Number(aula.planejadas || 1)} planejada(s) •{" "}
                      {Number(aula.reprogramadas || 0)} reprogramada(s) •{" "}
                      {Number(aula.canceladas || 0)} cancelada(s)
                    </span>
                  </div>

                  <div style={linhaInfo}>
                    <strong>Carga planejada:</strong> {formatHours(aula.carga_planejada || 0)}
                  </div>

                  <div style={linhaInfo}>
                    <strong>Carga real:</strong> {formatHours(aula.carga_real || 0)}
                  </div>

                  <div style={linhaInfo}>
                    <strong>Desvio:</strong> {formatHours(desvio)}
                  </div>

                  {aula.objetivo ? (
                    <div style={blocoTexto}>
                      <strong>Objetivo:</strong> {aula.objetivo}
                    </div>
                  ) : null}

                  <div style={divider} />

                  <div style={miniGrid}>
                    <MiniInfo label="Presentes" value={aula.presentes || 0} />
                    <MiniInfo label="Ausentes" value={aula.ausentes || 0} />
                    <MiniInfo label="Justificados" value={aula.justificados || 0} />
                    <MiniInfo label="Pendentes" value={aula.pendentes || 0} />
                  </div>

                  <div style={ctaDia}>Abrir presença da aula</div>
                </button>

                <div style={cardActions}>
                  <button style={miniBtn} onClick={() => editarAula(aula)}>
                    Editar
                  </button>
                  <button
                    style={miniBtnDanger}
                    onClick={() => excluirAula(aula.turma_aula_id)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Field({ label: title, children, full = false }) {
  return (
    <div style={{ ...fieldWrap, gridColumn: full ? "1 / -1" : "auto" }}>
      <label style={label}>{title}</label>
      {children}
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

function MiniInfo({ label, value }) {
  return (
    <div style={miniInfo}>
      <div style={miniLabel}>{label}</div>
      <div style={miniValue}>{value}</div>
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

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldWrap = {
  display: "grid",
  gap: 6,
};

const label = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#64748b",
  letterSpacing: ".04em",
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

const textarea = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 92,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "12px",
  background: "#fff",
  outline: "none",
  resize: "vertical",
};

const actionsRowLeft = {
  marginTop: 16,
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

const copyBox = {
  marginTop: 16,
  padding: 16,
  borderRadius: 16,
  border: "1px solid #dbeafe",
  background: "#f8fbff",
};

const cardsGrid = {
  marginTop: 18,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 14,
};

const cardDiaWrap = {
  display: "grid",
  gap: 8,
};

const cardDia = {
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 18,
  background: "#ffffff",
  cursor: "pointer",
  textAlign: "left",
  boxShadow: "0 8px 20px rgba(15,23,42,.04)",
};

const cardActions = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
};

const miniBtn = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const miniBtnDanger = {
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#be123c",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const cardTopo = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const tituloDia = {
  fontSize: 28,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.05,
};

const subtituloDia = {
  marginTop: 6,
  color: "#64748b",
  fontSize: 14,
};

const badgePercentual = {
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 14,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const statusLinha = {
  marginTop: 14,
};

const statusTag = {
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const pillRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 12,
};

const pillNeutral = {
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 700,
  background: "#eef2ff",
  color: "#334155",
  border: "1px solid #c7d2fe",
};

const metaBloco = {
  marginTop: 14,
  color: "#475569",
  lineHeight: 1.5,
  fontSize: 14,
};

const linhaInfo = {
  marginTop: 12,
  color: "#475569",
  fontSize: 14,
};

const blocoTexto = {
  marginTop: 12,
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.5,
};

const divider = {
  marginTop: 16,
  marginBottom: 14,
  borderTop: "1px solid #e2e8f0",
};

const miniGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
};

const miniInfo = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 10,
};

const miniLabel = {
  fontSize: 11,
  textTransform: "uppercase",
  color: "#64748b",
  fontWeight: 800,
};

const miniValue = {
  marginTop: 6,
  fontSize: 20,
  fontWeight: 800,
  color: "#0f172a",
};

const ctaDia = {
  marginTop: 14,
  fontSize: 13,
  fontWeight: 800,
  color: "#2563eb",
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
