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
  return `${num}h`;
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

function emptyAulaForm() {
  return {
    id: "",
    titulo: "",
    objetivo: "",
    data_aula: "",
    carga_planejada: 0,
    carga_real: 0,
    planejadas: 1,
    ministradas: 0,
    parciais: 0,
    reprogramadas: 0,
    canceladas: 0,
    instrutor: "",
  };
}

export default function CronogramaTurmaPage() {
  const routeParams = useParams();
  const id = routeParams?.id;

  const [treinamento, setTreinamento] = useState(null);
  const [aulasTurma, setAulasTurma] = useState([]);
  const [resumosAulas, setResumosAulas] = useState([]);
  const [turmasDisponiveis, setTurmasDisponiveis] = useState([]);

  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(true);

  const [aulaForm, setAulaForm] = useState(emptyAulaForm());
  const [salvandoAula, setSalvandoAula] = useState(false);

  const [autoForm, setAutoForm] = useState({
    data_inicio: "",
    data_fim: "",
    carga_horaria: 0,
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

      const [dadosTreinamento, aulas, turmas] = await Promise.all([
        apiFetch(`/treinamentos/${id}`),
        apiFetch(`/turma-aulas?treinamento_id=${id}`).catch(() => []),
        apiFetch("/treinamentos").catch(() => []),
      ]);

      const listaAulas = sortByDateAsc(Array.isArray(aulas) ? aulas : []);
      const listaTurmas = Array.isArray(turmas) ? turmas : [];

      setTreinamento(dadosTreinamento || null);
      setAulasTurma(listaAulas);
      setTurmasDisponiveis(
        listaTurmas.filter((item) => String(item.id) !== String(id))
      );

      setAutoForm((prev) => ({
        ...prev,
        data_inicio: toInputDate(
          dadosTreinamento?.data_inicio || dadosTreinamento?.data || ""
        ),
        data_fim: toInputDate(dadosTreinamento?.data_fim || ""),
        carga_horaria: Number(dadosTreinamento?.carga_horaria || 0),
      }));

      setAulaForm((prev) => ({
        ...prev,
        instrutor: dadosTreinamento?.instrutor || "",
        carga_planejada: Number(dadosTreinamento?.carga_horaria || 0),
      }));

      if (listaAulas.length) {
        const resumos = await Promise.all(
          listaAulas.map(async (aula, index) => {
            try {
              const resumo = await apiFetch(`/presenca-aulas/resumo/${aula.id}`);
              return {
                turma_aula_id: aula.id,
                data_aula: aula.data_aula,
                titulo:
                  aula.titulo ||
                  aula.nome ||
                  aula.tema ||
                  `Aula do Dia ${index + 1}`,
                objetivo: aula.objetivo || "",
                carga_planejada: Number(aula.carga_planejada || aula.carga_horaria || 0),
                carga_real: Number(aula.carga_real || aula.carga_ministrada || 0),
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
                titulo:
                  aula.titulo ||
                  aula.nome ||
                  aula.tema ||
                  `Aula do Dia ${index + 1}`,
                objetivo: aula.objetivo || "",
                carga_planejada: Number(aula.carga_planejada || aula.carga_horaria || 0),
                carga_real: Number(aula.carga_real || aula.carga_ministrada || 0),
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
    const aulasComPresenca = resumosAulas.filter((item) => Number(item.total || 0) > 0).length;
    const totalPresentes = resumosAulas.reduce((acc, item) => acc + Number(item.presentes || 0), 0);
    const totalEsperado = resumosAulas.reduce((acc, item) => acc + Number(item.total || 0), 0);
    const totalPendentes = resumosAulas.reduce((acc, item) => acc + Number(item.pendentes || 0), 0);
    const totalAusentes = resumosAulas.reduce((acc, item) => acc + Number(item.ausentes || 0), 0);
    const aderenciaMedia = calcPercentual(totalPresentes, totalEsperado);

    return {
      totalAulas,
      aulasComPresenca,
      totalPresentes,
      totalEsperado,
      totalPendentes,
      totalAusentes,
      aderenciaMedia,
    };
  }, [resumosAulas]);

  function abrirPresencaAula(aula) {
    window.location.href = `/turma/${id}?turma_aula_id=${aula.turma_aula_id}&data_aula=${aula.data_aula}&origem=cronograma`;
  }

  function voltar() {
    window.location.href = `/turma/${id}`;
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
          treinamento_origem_id: Number(duplicarModal.origemId),
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
      titulo: aula.titulo || "",
      objetivo: aula.objetivo || "",
      data_aula: toInputDate(aula.data_aula),
      carga_planejada: Number(aula.carga_planejada || 0),
      carga_real: Number(aula.carga_real || 0),
      planejadas: Number(aula.planejadas || 1),
      ministradas: Number(aula.ministradas || 0),
      parciais: Number(aula.parciais || 0),
      reprogramadas: Number(aula.reprogramadas || 0),
      canceladas: Number(aula.canceladas || 0),
      instrutor: aula.instrutor || treinamento?.instrutor || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function limparFormularioAula() {
    setAulaForm({
      ...emptyAulaForm(),
      instrutor: treinamento?.instrutor || "",
      carga_planejada: Number(treinamento?.carga_horaria || 0),
    });
  }

  async function salvarAula() {
    try {
      setSalvandoAula(true);
      setErro("");
      setSucesso("");

      const payload = {
        treinamento_id: Number(id),
        titulo: aulaForm.titulo,
        objetivo: aulaForm.objetivo,
        data_aula: aulaForm.data_aula,
        carga_planejada: Number(aulaForm.carga_planejada || 0),
        carga_real: Number(aulaForm.carga_real || 0),
        planejadas: Number(aulaForm.planejadas || 1),
        ministradas: Number(aulaForm.ministradas || 0),
        parciais: Number(aulaForm.parciais || 0),
        reprogramadas: Number(aulaForm.reprogramadas || 0),
        canceladas: Number(aulaForm.canceladas || 0),
        instrutor: aulaForm.instrutor,
      };

      if (aulaForm.id) {
        await apiFetch(`/turma-aulas/${aulaForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setSucesso("Aula atualizada com sucesso.");
      } else {
        await apiFetch("/turma-aulas", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSucesso("Aula cadastrada com sucesso.");
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
      if (String(aulaForm.id) === String(aulaId)) {
        limparFormularioAula();
      }
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
          Planejamento diário, aderência e acesso rápido à presença por aula.
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
          <InfoCard label="Turma" value={treinamento?.tema || "-"} />
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
            <h2 style={sectionTitle}>Gerar cronograma automaticamente</h2>
            <p style={sectionSubtitle}>
              Monte o cronograma com base no período da turma e na carga horária planejada.
            </p>
          </div>
        </div>

        <div style={formGrid}>
          <Field label="Data de início">
            <input
              type="date"
              value={autoForm.data_inicio}
              on
