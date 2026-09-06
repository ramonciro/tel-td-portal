"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch, apiDownload } from "../../services/api";
import { colors, radius } from "../../lib/theme";
import {
  formatDateBR,
  toDateInputLocal,
  parseLocalDate,
} from "../../lib/date";

function fmtNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function fmtHours(value) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function canonicalStatus(value) {
  const status = normalize(value);

  if (["ativa", "ativo"].includes(status)) return "ativo";
  if (["inativa", "inativo"].includes(status)) return "inativo";
  if (["concluida", "concluído", "concluido", "finalizada"].includes(status)) {
    return "concluido";
  }
  if (["planejada", "planejado"].includes(status)) return "planejado";
  if (["em_andamento", "em andamento"].includes(status)) return "em_andamento";
  if (["cancelada", "cancelado"].includes(status)) return "cancelado";

  return status || "planejado";
}

function displayStatus(value) {
  const status = canonicalStatus(value);

  const labels = {
    ativo: "Ativo",
    inativo: "Inativo",
    concluido: "Concluído",
    planejado: "Planejado",
    em_andamento: "Em andamento",
    cancelado: "Cancelado",
  };

  return labels[status] || value || "—";
}

function displayJourneyParticipantStatus(value) {
  const labels = {
    nao_iniciado: "Não iniciado",
    em_percurso: "Em percurso",
    concluido: "Concluído",
    em_sustentacao: "Em sustentação",
  };

  return labels[String(value || "")] || "Em percurso";
}

function formatDate(value) {
  return formatDateBR(value);
}

function isValidDateRange(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return true;

  const inicio = parseLocalDate(dataInicio);
  const fim = parseLocalDate(dataFim);

  if (!inicio || !fim) return true;
  return fim >= inicio;
}

function extrairMensagemErro(error, fallback) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  if (error.error) return error.error;
  return fallback;
}

function getPrazoInfo(item) {
  const hoje = new Date();
  const hojeLocal = new Date(
    hoje.getFullYear(),
    hoje.getMonth(),
    hoje.getDate(),
    12,
    0,
    0,
    0
  );

  const inicio = parseLocalDate(item.data_inicio);
  const fim = parseLocalDate(item.data_fim);
  const status = canonicalStatus(item.status);

  if (status === "concluido") {
    return { label: "Concluído", tone: "ok" };
  }

  if (!inicio && !fim) {
    return { label: "Sem data", tone: "neutral" };
  }

  if (fim && hojeLocal > fim && status !== "cancelado") {
    return { label: "Vencido", tone: "danger" };
  }

  if (inicio && hojeLocal < inicio) {
    return { label: "A iniciar", tone: "alert" };
  }

  return { label: "No prazo", tone: "ok" };
}

function badgeStyle(type) {
  const status = canonicalStatus(type);

  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
    whiteSpace: "nowrap",
    lineHeight: 1.1,
    border: "1px solid transparent",
    textTransform: "uppercase",
    letterSpacing: ".03em",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.7)",
  };

  const map = {
    ativo: { background: "#ecfdf5", color: "#166534", borderColor: "#bbf7d0" },
    inativo: {
      background: "#f8fafc",
      color: "#475569",
      borderColor: "#e2e8f0",
    },
    concluido: {
      background: "#eff6ff",
      color: "#1d4ed8",
      borderColor: "#bfdbfe",
    },
    planejado: {
      background: "#faf5ff",
      color: "#7c3aed",
      borderColor: "#ddd6fe",
    },
    em_andamento: {
      background: "#fff7ed",
      color: "#c2410c",
      borderColor: "#fed7aa",
    },
    cancelado: {
      background: "#fef2f2",
      color: "#b91c1c",
      borderColor: "#fecaca",
    },
  };

  return {
    ...base,
    ...(map[status] || {
      background: "#f8fafc",
      color: "#334155",
      borderColor: "#e2e8f0",
    }),
  };
}

function attentionBadge(level) {
  const map = {
    alta: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    },
    media: {
      background: "#fff7ed",
      color: "#c2410c",
      border: "1px solid #fed7aa",
    },
    ok: {
      background: "#ecfeff",
      color: "#155e75",
      border: "1px solid #a5f3fc",
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
    lineHeight: 1.1,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.7)",
    ...(map[level] || map.ok),
  };
}

function prazoBadge(tone) {
  const map = {
    ok: {
      background: "#ecfdf5",
      color: "#166534",
      border: "1px solid #bbf7d0",
    },
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    },
    neutral: {
      background: "#f8fafc",
      color: "#475569",
      border: "1px solid #e2e8f0",
    },
    alert: {
      background: "#fff7ed",
      color: "#c2410c",
      border: "1px solid #fed7aa",
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
    lineHeight: 1.1,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.7)",
    ...(map[tone] || map.neutral),
  };
}

function sustentacaoTypeBadge(value) {
  const tipo = normalize(value);
  const map = {
    coaching: {
      background: "#eff6ff",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
      label: "Coaching",
    },
    mentoria: {
      background: "#f5f3ff",
      color: "#7c3aed",
      border: "1px solid #ddd6fe",
      label: "Mentoria",
    },
  };

  const item = map[tipo] || {
    background: "#f8fafc",
    color: "#475569",
    border: "1px solid #e2e8f0",
    label: value || "Coaching",
  };

  return {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "5px 10px",
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 800,
      whiteSpace: "nowrap",
      lineHeight: 1.1,
      textTransform: "uppercase",
      letterSpacing: ".03em",
      background: item.background,
      color: item.color,
      border: item.border,
    },
    label: item.label,
  };
}

function crewStatusBadge(value) {
  const map = {
    nao_iniciado: {
      background: "#eff6ff",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
    },
    em_percurso: {
      background: "#ecfeff",
      color: "#155e75",
      border: "1px solid #a5f3fc",
    },
    concluido: {
      background: "#ecfdf5",
      color: "#166534",
      border: "1px solid #bbf7d0",
    },
    em_sustentacao: {
      background: "#f5f3ff",
      color: "#7c3aed",
      border: "1px solid #ddd6fe",
    },
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
    ...(map[String(value || "")] || map.em_percurso),
  };
}

function getJourneyAttention(jornada, acoesDaJornada, coachingsDaJornada) {
  const prazo = getPrazoInfo(jornada);

  if (prazo.tone === "danger") {
    return { level: "alta", label: "Prazo vencido" };
  }

  if (!acoesDaJornada.length && !coachingsDaJornada.length) {
    return { level: "media", label: "Sem entregas vinculadas" };
  }

  return { level: "ok", label: "Monitorada" };
}

function getActionAttention(acao) {
  const prazo = getPrazoInfo(acao);

  if (prazo.tone === "danger") return { level: "alta", label: "Prazo vencido" };
  if (!acao.responsavel_id) return { level: "media", label: "Sem responsável" };
  if (
    Number(acao.participantes_realizados || 0) === 0 &&
    canonicalStatus(acao.status) === "em_andamento"
  ) {
    return { level: "media", label: "Sem realização" };
  }

  return { level: "ok", label: "Estável" };
}

function getCoachingAttention(item) {
  const prazo = getPrazoInfo(item);

  if (prazo.tone === "danger") return { level: "alta", label: "Prazo vencido" };
  if (!item.responsavel_id) {
    return { level: "media", label: "Sem responsável" };
  }
  if (
    Number(item.sessoes_realizadas || 0) === 0 &&
    canonicalStatus(item.status) === "em_andamento"
  ) {
    return { level: "media", label: "Sem sessões realizadas" };
  }

  return { level: "ok", label: "Monitorada" };
}

function inputStyle() {
  return {
    width: "100%",
    minWidth: 0,
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    background: "#fff",
    boxSizing: "border-box",
  };
}

function compactInputStyle() {
  return {
    ...inputStyle(),
    height: 44,
    padding: "10px 12px",
  };
}

function textareaStyle(minHeight = 88) {
  return {
    ...inputStyle(),
    minHeight,
    resize: "vertical",
    padding: "12px",
  };
}

function labelStyle() {
  return {
    display: "grid",
    gap: 6,
    fontSize: 13,
    color: "#334155",
    fontWeight: 700,
    minWidth: 0,
  };
}

function buttonPrimaryStyle(disabled = false) {
  return {
    border: "none",
    background: disabled ? "#93c5fd" : "#2563eb",
    color: "#fff",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : "0 8px 18px rgba(37,99,235,.22)",
  };
}

function buttonSecondaryStyle() {
  return {
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  };
}

function buttonDangerStyle() {
  return {
    border: "1px solid #fecaca",
    background: "#fff1f2",
    color: "#b91c1c",
    borderRadius: 12,
    padding: "9px 12px",
    fontWeight: 700,
    cursor: "pointer",
  };
}

function emptyCard(message) {
  return (
    <div
      style={{
        border: "1px dashed #cbd5e1",
        borderRadius: 16,
        padding: 22,
        textAlign: "center",
        color: "#64748b",
        background: "#f8fafc",
      }}
    >
      {message}
    </div>
  );
}

const journeyInitial = {
  id: null,
  titulo: "",
  cliente: "",
  publico_alvo: "",
  objetivo: "",
  status: "planejada",
  data_inicio: "",
  data_fim: "",
};

const actionInitial = {
  id: null,
  jornada_id: "",
  titulo: "",
  descricao: "",
  responsavel_id: "",
  status: "planejada",
  data_inicio: "",
  data_fim: "",
  carga_horaria: "",
  participantes_previstos: "",
  quantidade_turmas_sessoes: "",
  participantes_realizados: "",
  horas_planejadas: "",
  horas_realizadas: "",
  subtipo: "",
  turma_id: "",
};

// Subdivisões usadas para comprovação de horas por norma (ex.: MPT), a
// partir das jornadas descritas no projeto do Portal T&D. Ramon pode pedir
// para ajustar esta lista conforme a necessidade real de cada cliente.
const SUBTIPOS_ACAO = [
  "Prevenção ao Assédio Moral",
  "Coaching de Coordenação e Gerência",
  "Compliance e Ética",
  "Desenvolvimento de Liderança",
  "Treinamento Técnico",
  "Outro",
];

const coachingInitial = {
  id: null,
  jornada_id: "",
  acao_id: "",
  tipo_coaching: "coaching",
  titulo: "",
  publico_alvo: "",
  objetivo: "",
  responsavel_id: "",
  participantes_previstos: "",
  participantes_realizados: "",
  sessoes_previstas: "",
  sessoes_realizadas: "",
  carga_horaria_sessao: "",
  horas_totais: "",
  horas_planejadas: "",
  status: "planejado",
  data_inicio: "",
  data_fim: "",
};

const participantInitial = {
  id: null,
  jornada_id: "",
  nome: "",
  matricula: "",
  cliente: "",
  turma: "",
  cargo: "",
  supervisor: "",
  status_jornada: "em_percurso",
};

const PARTICIPANTE_STATUS_OPTIONS = [
  { value: "nao_iniciado", label: "Não iniciado" },
  { value: "em_percurso", label: "Em percurso" },
  { value: "concluido", label: "Concluído" },
  { value: "em_sustentacao", label: "Em sustentação" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "planejado", label: "Planejado" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
];

export default function MapaDesenvolvimentoPage() {
  const [activeTab, setActiveTab] = useState("geral");

  const [jornadas, setJornadas] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [coachings, setCoachings] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [participantesJornada, setParticipantesJornada] = useState([]);
  const [turmas, setTurmas] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState("");
  const [notice, setNotice] = useState("");

  const [filters, setFilters] = useState({
    jornada_id: "",
    status: "",
    busca: "",
    cliente: "",
  });

  const [jornadaForm, setJornadaForm] = useState(journeyInitial);
  const [acaoForm, setAcaoForm] = useState(actionInitial);
  const [coachingForm, setCoachingForm] = useState(coachingInitial);
  const [participanteForm, setParticipanteForm] = useState(participantInitial);
  const [arquivoTripulacao, setArquivoTripulacao] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!erro && !notice) return undefined;

    const timer = window.setTimeout(() => {
      setErro("");
      setNotice("");
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [erro, notice]);

  useEffect(() => {
    setErro("");
    setNotice("");
  }, [activeTab]);

  // Bugfix: antes cada fetch tinha um .catch(() => []) individual, então uma
  // falha real do backend (ex.: tabela ausente, 500, tenant sem permissão)
  // era silenciosamente convertida em "lista vazia" — o usuário via o mapa
  // em branco sem nenhum aviso do que deu errado. Agora usamos
  // Promise.allSettled e reportamos quais seções falharam.
  const FONTES_MAPA = [
    { key: "jornadas", label: "jornadas", path: "/jornadas-desenvolvimento", setter: setJornadas },
    { key: "acoes", label: "ações", path: "/acoes-desenvolvimento", setter: setAcoes },
    { key: "coachings", label: "coaching", path: "/coaching-planos", setter: setCoachings },
    // Endpoint enxuto (id + nome) em vez de /api/usuarios — evita mandar
    // para o navegador a lista completa de usuários com dados sensíveis
    // (inclusive senha em hash) só para preencher um <select>.
    { key: "usuarios", label: "usuários", path: "/acoes-desenvolvimento/responsaveis-disponiveis", setter: setUsuarios },
    { key: "participantes", label: "participantes", path: "/jornada-participantes", setter: setParticipantesJornada },
    // Endpoint dedicado do Oceano (não /api/treinamentos) para não depender
    // das permissões da página de Turmas — aqui basta o acesso ao Oceano do
    // Desenvolvimento (authorizeOceanAccess), já garantido pelo restante da
    // página, e o payload é enxuto (só os campos usados no pré-preenchimento).
    { key: "turmas", label: "turmas", path: "/acoes-desenvolvimento/turmas-disponiveis", setter: setTurmas },
  ];

  async function loadAll() {
    setLoading(true);
    setErro("");

    try {
      const resultados = await Promise.allSettled(
        FONTES_MAPA.map((fonte) => apiFetch(fonte.path))
      );

      const falhas = [];
      resultados.forEach((resultado, index) => {
        const fonte = FONTES_MAPA[index];
        if (resultado.status === "fulfilled") {
          const dados = resultado.value;
          fonte.setter(Array.isArray(dados) ? dados : []);
        } else {
          fonte.setter([]);
          falhas.push(
            `${fonte.label} (${extrairMensagemErro(resultado.reason, "erro desconhecido")})`
          );
        }
      });

      if (falhas.length) {
        setErro(`Não foi possível carregar: ${falhas.join("; ")}.`);
      }
    } catch (error) {
      setErro(
        extrairMensagemErro(error, "Erro ao carregar o Mapa de Desenvolvimento.")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleExportarEvidencias() {
    setExportando(true);
    setErro("");
    try {
      await apiDownload(
        "/acoes-desenvolvimento/exportar",
        "evidencia-mapa-desenvolvimento.xlsx"
      );
    } catch (error) {
      setErro(
        extrairMensagemErro(error, "Erro ao exportar evidências do Mapa de Desenvolvimento.")
      );
    } finally {
      setExportando(false);
    }
  }

  async function saveJornada(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    if (!String(jornadaForm.titulo || "").trim()) {
      setErro("Informe o nome da jornada.");
      setSaving(false);
      return;
    }

    if (!isValidDateRange(jornadaForm.data_inicio, jornadaForm.data_fim)) {
      setErro("A data fim da jornada não pode ser menor que a data início.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        titulo: jornadaForm.titulo,
        cliente: jornadaForm.cliente || null,
        publico_alvo: jornadaForm.publico_alvo || null,
        objetivo: jornadaForm.objetivo || null,
        status: jornadaForm.status || "planejada",
        data_inicio: jornadaForm.data_inicio || null,
        data_fim: jornadaForm.data_fim || null,
      };

      if (jornadaForm.id) {
        await apiFetch(`/jornadas-desenvolvimento/${jornadaForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice("Jornada atualizada com sucesso.");
      } else {
        await apiFetch("/jornadas-desenvolvimento", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Jornada registrada com sucesso.");
      }

      setJornadaForm(journeyInitial);
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao salvar jornada."));
    } finally {
      setSaving(false);
    }
  }

  async function saveParticipante(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    if (!participanteForm.jornada_id) {
      setErro("Selecione a jornada do participante.");
      setSaving(false);
      return;
    }

    if (!String(participanteForm.nome || "").trim()) {
      setErro("Informe o nome da pessoa.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        jornada_id: Number(participanteForm.jornada_id),
        nome: participanteForm.nome,
        matricula: participanteForm.matricula || null,
        cliente: participanteForm.cliente || null,
        turma: participanteForm.turma || null,
        cargo: participanteForm.cargo || null,
        supervisor: participanteForm.supervisor || null,
        status_jornada: participanteForm.status_jornada || "em_percurso",
      };

      await apiFetch("/jornada-participantes", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setParticipanteForm((prev) => ({ ...participantInitial, jornada_id: prev.jornada_id }));
      setNotice("Participante vinculado com sucesso.");
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao criar participante da jornada."));
    } finally {
      setSaving(false);
    }
  }

  async function importarTripulacao() {
    setSaving(true);
    setErro("");
    setNotice("");

    if (!participanteForm.jornada_id) {
      setErro("Selecione a jornada antes de importar os participantes.");
      setSaving(false);
      return;
    }

    if (!arquivoTripulacao) {
      setErro("Selecione o arquivo de importação.");
      setSaving(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("jornada_id", String(participanteForm.jornada_id));
      formData.append("arquivo", arquivoTripulacao);

      const data = await apiFetch("/jornada-participantes/importar", {
        method: "POST",
        body: formData,
      });

      setArquivoTripulacao(null);
      setNotice(data?.message || "Participantes importados com sucesso.");
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao importar participantes."));
    } finally {
      setSaving(false);
    }
  }

  async function removeParticipante(id) {
    const ok = window.confirm("Deseja realmente remover esta pessoa da jornada?");
    if (!ok) return;

    try {
      await apiFetch(`/jornada-participantes/${id}`, { method: "DELETE" });
      setNotice("Pessoa removida da jornada com sucesso.");
      setErro("");
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao remover participante da jornada."));
    }
  }

  async function saveAcao(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    if (!acaoForm.jornada_id) {
      setErro("Selecione a jornada da ação.");
      setSaving(false);
      return;
    }

    if (!String(acaoForm.titulo || "").trim()) {
      setErro("Informe o título da ação.");
      setSaving(false);
      return;
    }

    if (!isValidDateRange(acaoForm.data_inicio, acaoForm.data_fim)) {
      setErro("A data fim da ação não pode ser menor que a data início.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        jornada_id: Number(acaoForm.jornada_id),
        titulo: acaoForm.titulo,
        descricao: acaoForm.descricao || null,
        responsavel_id: acaoForm.responsavel_id
          ? Number(acaoForm.responsavel_id)
          : null,
        status: acaoForm.status || "planejada",
        data_inicio: acaoForm.data_inicio || null,
        data_fim: acaoForm.data_fim || null,
        carga_horaria: Number(acaoForm.carga_horaria || 0),
        participantes_previstos: Number(acaoForm.participantes_previstos || 0),
        quantidade_turmas_sessoes: Number(acaoForm.quantidade_turmas_sessoes || 0),
        participantes_realizados: Number(acaoForm.participantes_realizados || 0),
        horas_planejadas: Number(acaoForm.horas_planejadas || 0),
        horas_realizadas: Number(acaoForm.horas_realizadas || 0),
        subtipo: acaoForm.subtipo || null,
        turma_id: acaoForm.turma_id ? Number(acaoForm.turma_id) : null,
      };

      if (acaoForm.id) {
        await apiFetch(`/acoes-desenvolvimento/${acaoForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice("Ação atualizada com sucesso.");
      } else {
        await apiFetch("/acoes-desenvolvimento", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Ação registrada com sucesso.");
      }

      setAcaoForm(actionInitial);
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao salvar ação."));
    } finally {
      setSaving(false);
    }
  }

  async function saveCoaching(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    if (!String(coachingForm.titulo || "").trim()) {
      setErro("Informe o título do coaching ou mentoria.");
      setSaving(false);
      return;
    }

    if (!isValidDateRange(coachingForm.data_inicio, coachingForm.data_fim)) {
      setErro("A data fim do coaching não pode ser menor que a data início.");
      setSaving(false);
      return;
    }

    try {
      const payload = {
        jornada_id: coachingForm.jornada_id ? Number(coachingForm.jornada_id) : null,
        acao_id: coachingForm.acao_id ? Number(coachingForm.acao_id) : null,
        tipo_coaching: coachingForm.tipo_coaching,
        titulo: coachingForm.titulo,
        publico_alvo: coachingForm.publico_alvo || null,
        objetivo: coachingForm.objetivo || null,
        responsavel_id: coachingForm.responsavel_id || null,
        participantes_previstos: Number(coachingForm.participantes_previstos || 0),
        participantes_realizados: Number(coachingForm.participantes_realizados || 0),
        sessoes_previstas: Number(coachingForm.sessoes_previstas || 0),
        sessoes_realizadas: Number(coachingForm.sessoes_realizadas || 0),
        carga_horaria_sessao: Number(coachingForm.carga_horaria_sessao || 0),
        horas_totais: Number(coachingForm.horas_totais || 0),
        horas_planejadas: Number(coachingForm.horas_planejadas || 0),
        status: coachingForm.status || "planejado",
        data_inicio: coachingForm.data_inicio || null,
        data_fim: coachingForm.data_fim || null,
      };

      if (coachingForm.id) {
        await apiFetch(`/coaching-planos/${coachingForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice("Coaching atualizado com sucesso.");
      } else {
        await apiFetch("/coaching-planos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Coaching registrado com sucesso.");
      }

      setCoachingForm(coachingInitial);
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao salvar coaching ou mentoria."));
    } finally {
      setSaving(false);
    }
  }

  async function removeRegistro(tipo, id) {
    const ok = window.confirm("Deseja realmente excluir este registro?");
    if (!ok) return;

    try {
      const pathMap = {
        jornada: `/jornadas-desenvolvimento/${id}`,
        acao: `/acoes-desenvolvimento/${id}`,
        coaching: `/coaching-planos/${id}`,
      };

      await apiFetch(pathMap[tipo], { method: "DELETE" });
      setNotice("Registro excluído com sucesso.");
      setErro("");
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao excluir registro."));
    }
  }

  function editJornada(item) {
    setJornadaForm({
      id: item.id,
      titulo: item.titulo || item.nome || "",
      cliente: item.cliente || "",
      publico_alvo: item.publico_alvo || item.publico_macro || "",
      objetivo: item.objetivo || "",
      status: canonicalStatus(item.status) || "planejada",
      data_inicio: toDateInputLocal(item.data_inicio),
      data_fim: toDateInputLocal(item.data_fim),
    });
    setParticipanteForm((prev) => ({ ...prev, jornada_id: String(item.id) }));
    setActiveTab("jornadas");
  }

  // Pré-preenche (sem travar) horas e participantes realizados a partir dos
  // dados reais de uma turma já executada — usuário continua podendo editar
  // os valores depois de selecionar a turma.
  function handleSelecionarTurma(turmaIdValue) {
    const turma = turmas.find((t) => String(t.id) === String(turmaIdValue));
    setAcaoForm((prev) => ({
      ...prev,
      turma_id: turmaIdValue,
      horas_realizadas: turma ? String(turma.carga_horaria || 0) : prev.horas_realizadas,
      participantes_realizados: turma
        ? String(turma.participantes_presentes || turma.participantes || 0)
        : prev.participantes_realizados,
    }));
  }

  function editAcao(item) {
    setAcaoForm({
      id: item.id,
      jornada_id: item.jornada_id || "",
      titulo: item.titulo || item.tema || "",
      descricao: item.descricao || "",
      responsavel_id: item.responsavel_id ? String(item.responsavel_id) : "",
      status: canonicalStatus(item.status) || "planejada",
      data_inicio: toDateInputLocal(item.data_inicio),
      data_fim: toDateInputLocal(item.data_fim),
      carga_horaria: String(item.carga_horaria || ""),
      participantes_previstos: String(item.participantes_previstos || ""),
      quantidade_turmas_sessoes: String(item.quantidade_turmas_sessoes || ""),
      participantes_realizados: String(item.participantes_realizados || ""),
      horas_planejadas: String(item.horas_planejadas || ""),
      horas_realizadas: String(item.horas_realizadas || ""),
      subtipo: item.subtipo || "",
      turma_id: item.turma_id ? String(item.turma_id) : "",
    });
    setActiveTab("acoes");
  }

  function editCoaching(item) {
    setCoachingForm({
      id: item.id,
      jornada_id: item.jornada_id || "",
      acao_id: item.acao_id || "",
      tipo_coaching: item.tipo_coaching || "coaching",
      titulo: item.titulo || "",
      publico_alvo: item.publico_alvo || "",
      objetivo: item.objetivo || "",
      responsavel_id: item.responsavel_id || "",
      participantes_previstos: String(item.participantes_previstos || ""),
      participantes_realizados: String(item.participantes_realizados || ""),
      sessoes_previstas: String(item.sessoes_previstas || ""),
      sessoes_realizadas: String(item.sessoes_realizadas || ""),
      carga_horaria_sessao: String(item.carga_horaria_sessao || ""),
      horas_totais: String(item.horas_totais || ""),
      horas_planejadas: String(item.horas_planejadas || ""),
      status: canonicalStatus(item.status) || "planejado",
      data_inicio: toDateInputLocal(item.data_inicio),
      data_fim: toDateInputLocal(item.data_fim),
    });
    setActiveTab("coaching");
  }

  const usuariosMap = useMemo(() => {
    const map = {};
    usuarios.forEach((u) => {
      map[String(u.id)] = u.nome || `Usuário ${u.id}`;
    });
    return map;
  }, [usuarios]);

  const participantesEnriquecidos = useMemo(() => {
    return participantesJornada.map((item) => {
      const jornada = jornadas.find((j) => String(j.id) === String(item.jornada_id));
      return {
        ...item,
        jornada_nome: jornada?.nome || jornada?.titulo || "Sem jornada",
      };
    });
  }, [participantesJornada, jornadas]);

  const participantesPorJornada = useMemo(() => {
    return participantesEnriquecidos.reduce((acc, item) => {
      const key = String(item.jornada_id || "");
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [participantesEnriquecidos]);

  const jornadasEnriquecidas = useMemo(() => {
    return jornadas.map((jornada) => {
      const acoesDaJornada = acoes.filter(
        (a) => String(a.jornada_id) === String(jornada.id)
      );
      const coachingsDaJornada = coachings.filter(
        (c) => String(c.jornada_id || "") === String(jornada.id)
      );

      const horasTotais =
        acoesDaJornada.reduce(
          (acc, item) => acc + Number(item.horas_realizadas || 0),
          0
        ) +
        coachingsDaJornada.reduce(
          (acc, item) => acc + Number(item.horas_totais || 0),
          0
        );

      return {
        ...jornada,
        nome: jornada.nome || jornada.titulo,
        publico_macro: jornada.publico_macro || jornada.publico_alvo,
        total_acoes: acoesDaJornada.length,
        total_coachings: coachingsDaJornada.length,
        total_tripulantes: (participantesPorJornada[String(jornada.id)] || []).length,
        tripulacao_preview: (participantesPorJornada[String(jornada.id)] || []).slice(0, 4),
        horas_totais: horasTotais,
        prazo_info: getPrazoInfo(jornada),
        attention_info: getJourneyAttention(jornada, acoesDaJornada, coachingsDaJornada),
        status_canonico: canonicalStatus(jornada.status),
      };
    });
  }, [jornadas, acoes, coachings, participantesPorJornada]);

  const acoesEnriquecidas = useMemo(() => {
    return acoes.map((acao) => {
      const jornada = jornadas.find((j) => String(j.id) === String(acao.jornada_id));

      return {
        ...acao,
        tema: acao.tema || acao.titulo,
        jornada_nome: jornada?.nome || jornada?.titulo || "Sem jornada",
        cliente: jornada?.cliente || "",
        responsavel_nome:
          usuariosMap[String(acao.responsavel_id)] || "Não definido",
        prazo_info: getPrazoInfo(acao),
        attention_info: getActionAttention(acao),
        status_canonico: canonicalStatus(acao.status),
      };
    });
  }, [acoes, jornadas, usuariosMap]);

  const coachingsEnriquecidos = useMemo(() => {
    return coachings.map((item) => {
      const jornada = jornadas.find((j) => String(j.id) === String(item.jornada_id || ""));
      const acao = acoes.find((a) => String(a.id) === String(item.acao_id || ""));

      return {
        ...item,
        jornada_nome: jornada?.nome || jornada?.titulo || "Independente",
        acao_nome: acao?.tema || acao?.titulo || "Sem ação vinculada",
        cliente: jornada?.cliente || "",
        responsavel_nome:
          usuariosMap[String(item.responsavel_id)] || item.responsavel || "Não definido",
        prazo_info: getPrazoInfo(item),
        attention_info: getCoachingAttention(item),
        status_canonico: canonicalStatus(item.status),
      };
    });
  }, [coachings, jornadas, acoes, usuariosMap]);

  const clientesDisponiveis = useMemo(() => {
    const nomes = new Set(
      jornadas.map((item) => String(item.cliente || "").trim()).filter(Boolean)
    );
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [jornadas]);

  const filteredJornadas = useMemo(() => {
    return jornadasEnriquecidas.filter((item) => {
      const matchJornada =
        !filters.jornada_id || String(item.id) === String(filters.jornada_id);
      const matchStatus =
        !filters.status || item.status_canonico === filters.status;
      const matchBusca =
        !filters.busca ||
        normalize(
          [item.nome, item.objetivo, item.publico_macro, item.cliente].join(" ")
        ).includes(normalize(filters.busca));
      const matchCliente =
        !filters.cliente || String(item.cliente || "").trim() === filters.cliente;

      return matchJornada && matchStatus && matchBusca && matchCliente;
    });
  }, [jornadasEnriquecidas, filters]);

  const filteredAcoes = useMemo(() => {
    return acoesEnriquecidas.filter((item) => {
      const matchJornada =
        !filters.jornada_id || String(item.jornada_id) === String(filters.jornada_id);
      const matchStatus =
        !filters.status || item.status_canonico === filters.status;
      const matchBusca =
        !filters.busca ||
        normalize(
          [
            item.tema,
            item.descricao,
            item.jornada_nome,
            item.responsavel_nome,
          ].join(" ")
        ).includes(normalize(filters.busca));
      const matchCliente =
        !filters.cliente || String(item.cliente || "").trim() === filters.cliente;

      return matchJornada && matchStatus && matchBusca && matchCliente;
    });
  }, [acoesEnriquecidas, filters]);

  const filteredCoachings = useMemo(() => {
    return coachingsEnriquecidos.filter((item) => {
      const matchJornada =
        !filters.jornada_id || String(item.jornada_id || "") === String(filters.jornada_id);
      const matchStatus =
        !filters.status || item.status_canonico === filters.status;
      const matchBusca =
        !filters.busca ||
        normalize(
          [
            item.titulo,
            item.tipo_coaching,
            item.publico_alvo,
            item.objetivo,
            item.jornada_nome,
            item.acao_nome,
            item.responsavel_nome,
          ].join(" ")
        ).includes(normalize(filters.busca));
      const matchCliente =
        !filters.cliente || String(item.cliente || "").trim() === filters.cliente;

      return matchJornada && matchStatus && matchBusca && matchCliente;
    });
  }, [coachingsEnriquecidos, filters]);

  const jornadasFluxo = useMemo(() => {
    return filteredJornadas.map((jornada) => {
      const acoesDaJornada = filteredAcoes.filter(
        (item) => String(item.jornada_id) === String(jornada.id)
      );

      const coachingsDaJornada = filteredCoachings.filter(
        (item) => String(item.jornada_id || "") === String(jornada.id)
      );

      const totalBlocos = acoesDaJornada.length + coachingsDaJornada.length;
      const concluidos =
        acoesDaJornada.filter((item) => canonicalStatus(item.status) === "concluido").length +
        coachingsDaJornada.filter((item) => canonicalStatus(item.status) === "concluido").length;

      const progresso = totalBlocos ? Math.round((concluidos / totalBlocos) * 100) : 0;

      const proximoPasso =
        acoesDaJornada.find((item) => canonicalStatus(item.status) !== "concluido")?.tema ||
        coachingsDaJornada.find((item) => canonicalStatus(item.status) !== "concluido")?.titulo ||
        "Estruturar os próximos passos";

      return {
        ...jornada,
        acoesDaJornada,
        coachingsDaJornada,
        concluidos,
        progresso,
        proximoPasso,
      };
    });
  }, [filteredJornadas, filteredAcoes, filteredCoachings]);

  // Visão gerencial pedida no projeto: jornadas agrupadas por cliente
  // (SAFRA, CREA, DASA etc.), não uma lista plana. Clientes com jornada vêm
  // ordenados alfabeticamente; jornadas sem cliente informado ficam num
  // grupo à parte, ao final.
  const jornadasFluxoAgrupadas = useMemo(() => {
    const grupos = new Map();
    jornadasFluxo.forEach((jornada) => {
      const cliente = String(jornada.cliente || "").trim();
      const chave = cliente || "__sem_cliente__";
      if (!grupos.has(chave)) {
        grupos.set(chave, { cliente: cliente || "Sem cliente definido", itens: [] });
      }
      grupos.get(chave).itens.push(jornada);
    });

    const comCliente = Array.from(grupos.values())
      .filter((g) => g.cliente !== "Sem cliente definido")
      .sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR"));
    const semCliente = grupos.get("__sem_cliente__");

    return semCliente ? [...comCliente, semCliente] : comCliente;
  }, [jornadasFluxo]);

  const kpis = useMemo(() => {
    return {
      jornadas: filteredJornadas.length,
      acoes: filteredAcoes.length,
      coachings: filteredCoachings.length,
      tripulacao: filteredJornadas.reduce(
        (acc, item) => acc + Number(item.total_tripulantes || 0),
        0
      ),
      participantesImpactados:
        filteredAcoes.reduce(
          (acc, item) => acc + Number(item.participantes_realizados || 0),
          0
        ) +
        filteredCoachings.reduce(
          (acc, item) => acc + Number(item.participantes_realizados || 0),
          0
        ),
      horasTotais:
        filteredAcoes.reduce(
          (acc, item) => acc + Number(item.horas_realizadas || 0),
          0
        ) +
        filteredCoachings.reduce(
          (acc, item) => acc + Number(item.horas_totais || 0),
          0
        ),
      concluidas:
        filteredAcoes.filter((i) => canonicalStatus(i.status) === "concluido").length +
        filteredCoachings.filter((i) => canonicalStatus(i.status) === "concluido").length,
    };
  }, [filteredJornadas, filteredAcoes, filteredCoachings]);

  const acoesOptions = useMemo(() => {
    return [...acoesEnriquecidas].sort((a, b) =>
      String(a.tema || "").localeCompare(String(b.tema || ""), "pt-BR")
    );
  }, [acoesEnriquecidas]);

  return (
    <PortalShell>
      <div style={{ display: "grid", gap: 18 }}>
        <PageHero
          eyebrow="Mapa de Desenvolvimento"
          title="Jornadas, ações e coaching de desenvolvimento em um só lugar"
          subtitle="Acompanhe jornadas por cliente, ações de desenvolvimento e coaching/mentoria, com indicadores e exportação de evidências para conformidade."
          stats={[
            { label: "jornadas", value: fmtNumber(kpis.jornadas) },
            { label: "ações", value: fmtNumber(kpis.acoes) },
            { label: "coaching e mentoria", value: fmtNumber(kpis.coachings) },
          ]}
          actions={
            <button
              type="button"
              style={buttonSecondaryStyle()}
              onClick={handleExportarEvidencias}
              disabled={exportando}
            >
              {exportando ? "Exportando..." : "⬇ Exportar evidência (MPT)"}
            </button>
          }
        />

        <div style={tabBar}>
          {[
            ["geral", "Visão geral"],
            ["jornadas", "Jornadas"],
            ["acoes", "Ações"],
            ["coaching", "Coaching e mentoria"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={tabButton(activeTab === key)}
            >
              {label}
            </button>
          ))}
        </div>

        <SectionCard
          title="Indicadores gerais"
          subtitle="Leitura macro do desenvolvimento e do volume em curso."
        >
          <div style={kpiGrid}>
            <StatCard title="Jornadas ativas" value={fmtNumber(kpis.jornadas)} accent="#2563eb" />
            <StatCard title="Ações" value={fmtNumber(kpis.acoes)} accent="#7c3aed" />
            <StatCard title="Coaching e mentoria" value={fmtNumber(kpis.coachings)} accent="#ea580c" />
            <StatCard title="Participantes" value={fmtNumber(kpis.tripulacao)} accent="#16a34a" />
            <StatCard title="Público impactado" value={fmtNumber(kpis.participantesImpactados)} accent="#b45309" />
            <StatCard title="Horas totais" value={fmtHours(kpis.horasTotais)} accent="#0f766e" />
            <StatCard title="Entregas concluídas" value={fmtNumber(kpis.concluidas)} accent="#1d4ed8" />
          </div>
        </SectionCard>

        <SectionCard
          title="Filtros"
          subtitle="Refine por jornada, cliente, status e busca."
          action={
            <button
              style={buttonSecondaryStyle()}
              onClick={() =>
                setFilters({
                  jornada_id: "",
                  status: "",
                  busca: "",
                  cliente: "",
                })
              }
            >
              Limpar filtros
            </button>
          }
        >
          <div style={filtersPanel}>
            <label style={labelStyle()}>
              Jornada
              <select
                value={filters.jornada_id}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, jornada_id: e.target.value }))
                }
                style={inputStyle()}
              >
                <option value="">Todas</option>
                {jornadas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome || item.titulo}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle()}>
              Cliente
              <select
                value={filters.cliente}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, cliente: e.target.value }))
                }
                style={inputStyle()}
              >
                <option value="">Todos</option>
                {clientesDisponiveis.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle()}>
              Status
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, status: e.target.value }))
                }
                style={inputStyle()}
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.value || "all"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...labelStyle(), gridColumn: "span 2" }}>
              Busca
              <input
                value={filters.busca}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, busca: e.target.value }))
                }
                placeholder="Jornada, ação, coaching, mentoria..."
                style={inputStyle()}
              />
            </label>
          </div>

          {(erro || notice) && (
            <div style={{ marginTop: 14 }}>
              {erro ? <div style={errorAlert}>{erro}</div> : null}
              {notice ? (
                <div style={{ ...successAlert, marginTop: erro ? 10 : 0 }}>
                  {notice}
                </div>
              ) : null}
            </div>
          )}
        </SectionCard>

        {activeTab === "geral" && (
          <div style={{ display: "grid", gap: 18 }}>
            <SectionCard
              title="Jornadas de desenvolvimento"
              subtitle="Jornadas agrupadas por cliente, com ações, coaching/mentoria e progresso."
            >
              {loading ? (
                emptyCard("Carregando fluxo das jornadas...")
              ) : jornadasFluxo.length === 0 ? (
                emptyCard("Nenhuma jornada encontrada para os filtros aplicados.")
              ) : (
                <div style={{ display: "grid", gap: 24 }}>
                  {jornadasFluxoAgrupadas.map((grupo) => (
                    <div key={grupo.cliente} style={{ display: "grid", gap: 12 }}>
                      <div style={clienteGroupHeader}>
                        {grupo.cliente} <span style={clienteGroupCount}>({grupo.itens.length})</span>
                      </div>
                      <div style={{ display: "grid", gap: 16 }}>
                        {grupo.itens.map((jornada) => (
                          <div key={jornada.id} style={journeyFlowCard}>
                            <div style={journeyFlowHeader}>
                              <div style={{ display: "grid", gap: 8 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 8,
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                  }}
                                >
                                  <span style={badgeStyle(jornada.status)}>
                                    {displayStatus(jornada.status)}
                                  </span>
                                  <span style={attentionBadge(jornada.attention_info.level)}>
                                    {jornada.attention_info.label}
                                  </span>
                                  <span style={prazoBadge(jornada.prazo_info.tone)}>
                                    {jornada.prazo_info.label}
                                  </span>
                                </div>
                                <div style={journeyFlowTitle}>{jornada.nome}</div>
                                <div style={journeyFlowMeta}>
                                  Objetivo: {jornada.objetivo || "Não informado"}
                                </div>
                                <div style={journeyFlowMeta}>
                                  Público: {jornada.publico_macro || "Não informado"} • Cliente:{" "}
                                  {jornada.cliente || "Não informado"}
                                </div>
                              </div>

                              <div style={journeyFlowSummary}>
                                <MetricBox label="Ações" value={fmtNumber(jornada.acoesDaJornada.length)} />
                                <MetricBox label="Coaching" value={fmtNumber(jornada.coachingsDaJornada.length)} />
                                <MetricBox label="Participantes" value={fmtNumber(jornada.total_tripulantes || 0)} />
                                <MetricBox label="Horas" value={fmtHours(jornada.horas_totais)} />
                                <MetricBox label="Progresso" value={`${jornada.progresso}%`} />
                              </div>
                            </div>

                            <div style={journeyProgressBarWrap}>
                              <div style={journeyProgressBarTrack}>
                                <div
                                  style={{
                                    ...journeyProgressBarFill,
                                    width: `${Math.max(jornada.progresso, 6)}%`,
                                  }}
                                />
                              </div>
                              <div style={journeyFlowMeta}>
                                Próxima etapa: {jornada.proximoPasso}
                              </div>
                            </div>

                            <div style={buttonRow}>
                              <button
                                type="button"
                                style={buttonSecondaryStyle()}
                                onClick={() => editJornada(jornada)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                style={buttonDangerStyle()}
                                onClick={() => removeRegistro("jornada", jornada.id)}
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Ações em destaque"
              subtitle="Leitura executiva das ações do mapa."
            >
              {loading ? (
                emptyCard("Carregando ações...")
              ) : filteredAcoes.length === 0 ? (
                emptyCard("Nenhuma ação encontrada.")
              ) : (
                <div style={cardsGrid}>
                  {filteredAcoes.map((acao) => (
                    <div key={acao.id} style={execCard}>
                      <div style={execHeader}>
                        <div>
                          <div style={execTitle}>{acao.tema}</div>
                          <div style={execSubtitle}>
                            {acao.jornada_nome} • {acao.responsavel_nome}
                            {acao.subtipo ? ` • ${acao.subtipo}` : ""}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={badgeStyle(acao.status)}>{displayStatus(acao.status)}</span>
                          <span style={attentionBadge(acao.attention_info.level)}>
                            {acao.attention_info.label}
                          </span>
                        </div>
                      </div>

                      <div style={execBody}>
                        <div style={execText}>{acao.descricao || "Sem descrição registrada."}</div>

                        <div style={miniExecutiveBand}>
                          <MiniExecutive
                            label="Sessões/Turmas"
                            value={fmtNumber(acao.quantidade_turmas_sessoes || 0)}
                          />
                          <MiniExecutive
                            label="Participantes"
                            value={fmtNumber(acao.participantes_realizados || 0)}
                          />
                          <MiniExecutive
                            label="Horas"
                            value={fmtHours(acao.horas_realizadas || 0)}
                          />
                        </div>
                      </div>

                      <div style={buttonRow}>
                        <button style={buttonSecondaryStyle()} onClick={() => editAcao(acao)}>
                          Editar
                        </button>
                        <button
                          style={buttonDangerStyle()}
                          onClick={() => removeRegistro("acao", acao.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {activeTab === "jornadas" && (
          <>
            <SectionCard
              title="Cadastro de jornada"
              subtitle="Estruture a jornada de desenvolvimento."
            >
              <details open style={detailsCard}>
                <summary style={detailsSummary}>Registro de jornada</summary>

                <form onSubmit={saveJornada} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                  <div style={formGrid}>
                    <label style={{ ...labelStyle(), ...fieldSpan.xxl }}>
                      Nome da jornada
                      <input
                        value={jornadaForm.titulo}
                        onChange={(e) =>
                          setJornadaForm((prev) => ({ ...prev, titulo: e.target.value }))
                        }
                        style={compactInputStyle()}
                        required
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Cliente
                      <input
                        value={jornadaForm.cliente}
                        onChange={(e) =>
                          setJornadaForm((prev) => ({ ...prev, cliente: e.target.value }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Público macro
                      <input
                        value={jornadaForm.publico_alvo}
                        onChange={(e) =>
                          setJornadaForm((prev) => ({
                            ...prev,
                            publico_alvo: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Status
                      <select
                        value={jornadaForm.status}
                        onChange={(e) =>
                          setJornadaForm((prev) => ({ ...prev, status: e.target.value }))
                        }
                        style={compactInputStyle()}
                      >
                        <option value="planejada">Planejada</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="concluida">Concluída</option>
                        <option value="cancelada">Cancelada</option>
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Data início
                      <input
                        type="date"
                        value={jornadaForm.data_inicio}
                        onChange={(e) =>
                          setJornadaForm((prev) => ({
                            ...prev,
                            data_inicio: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Data fim
                      <input
                        type="date"
                        value={jornadaForm.data_fim}
                        onChange={(e) =>
                          setJornadaForm((prev) => ({ ...prev, data_fim: e.target.value }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>
                  </div>

                  <label style={{ ...labelStyle(), ...fieldSpan.full }}>
                    Objetivo macro
                    <textarea
                      value={jornadaForm.objetivo}
                      onChange={(e) =>
                        setJornadaForm((prev) => ({ ...prev, objetivo: e.target.value }))
                      }
                      style={textareaStyle(92)}
                    />
                  </label>

                  <div style={buttonRow}>
                    <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
                      {jornadaForm.id ? "Atualizar jornada" : "Salvar jornada"}
                    </button>
                    <button
                      type="button"
                      style={buttonSecondaryStyle()}
                      onClick={() => {
                        setJornadaForm(journeyInitial);
                        setErro("");
                        setNotice("");
                      }}
                    >
                      Limpar
                    </button>
                  </div>
                </form>
              </details>
            </SectionCard>

            <SectionCard
              title="Participantes da jornada"
              subtitle="Vincule pessoas manualmente ou importe os participantes da jornada por planilha."
            >
              <div style={tripulacaoGrid}>
                <details open style={detailsCard}>
                  <summary style={detailsSummary}>Inclusão manual</summary>

                  <form onSubmit={saveParticipante} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                    <div style={formGrid}>
                      <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                        Jornada
                        <select
                          value={participanteForm.jornada_id}
                          onChange={(e) =>
                            setParticipanteForm((prev) => ({ ...prev, jornada_id: e.target.value }))
                          }
                          style={compactInputStyle()}
                          required
                        >
                          <option value="">Selecione</option>
                          {jornadas.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.nome || item.titulo}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label style={{ ...labelStyle(), ...fieldSpan.xl }}>
                        Nome
                        <input
                          value={participanteForm.nome}
                          onChange={(e) =>
                            setParticipanteForm((prev) => ({ ...prev, nome: e.target.value }))
                          }
                          style={compactInputStyle()}
                          required
                        />
                      </label>

                      <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                        Matrícula
                        <input
                          value={participanteForm.matricula}
                          onChange={(e) =>
                            setParticipanteForm((prev) => ({ ...prev, matricula: e.target.value }))
                          }
                          style={compactInputStyle()}
                        />
                      </label>

                      <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                        Turma
                        <input
                          value={participanteForm.turma}
                          onChange={(e) =>
                            setParticipanteForm((prev) => ({ ...prev, turma: e.target.value }))
                          }
                          style={compactInputStyle()}
                        />
                      </label>

                      <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                        Cargo
                        <input
                          value={participanteForm.cargo}
                          onChange={(e) =>
                            setParticipanteForm((prev) => ({ ...prev, cargo: e.target.value }))
                          }
                          style={compactInputStyle()}
                        />
                      </label>

                      <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                        Supervisor
                        <input
                          value={participanteForm.supervisor}
                          onChange={(e) =>
                            setParticipanteForm((prev) => ({ ...prev, supervisor: e.target.value }))
                          }
                          style={compactInputStyle()}
                        />
                      </label>

                      <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                        Cliente
                        <input
                          value={participanteForm.cliente}
                          onChange={(e) =>
                            setParticipanteForm((prev) => ({ ...prev, cliente: e.target.value }))
                          }
                          style={compactInputStyle()}
                        />
                      </label>

                      <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                        Situação na jornada
                        <select
                          value={participanteForm.status_jornada}
                          onChange={(e) =>
                            setParticipanteForm((prev) => ({ ...prev, status_jornada: e.target.value }))
                          }
                          style={compactInputStyle()}
                        >
                          {PARTICIPANTE_STATUS_OPTIONS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div style={buttonRow}>
                      <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
                        Vincular pessoa
                      </button>
                      <button
                        type="button"
                        style={buttonSecondaryStyle()}
                        onClick={() => setParticipanteForm((prev) => ({ ...participantInitial, jornada_id: prev.jornada_id }))}
                      >
                        Limpar
                      </button>
                    </div>
                  </form>
                </details>

                <details open style={detailsCard}>
                  <summary style={detailsSummary}>Importação por planilha</summary>

                  <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
                    <label style={labelStyle()}>
                      Arquivo Excel (.xlsx, .xls ou .csv)
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={(e) => setArquivoTripulacao(e.target.files?.[0] || null)}
                        style={compactInputStyle()}
                      />
                    </label>

                    <div style={importHintCard}>
                      Colunas aceitas: nome, matricula, cliente, turma, cargo, supervisor e status_jornada.
                    </div>

                    <div style={buttonRow}>
                      <button
                        type="button"
                        style={buttonPrimaryStyle(saving)}
                        disabled={saving}
                        onClick={importarTripulacao}
                      >
                        Importar participantes
                      </button>
                    </div>
                  </div>
                </details>
              </div>

              <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
                {filteredJornadas.length === 0 ? (
                  emptyCard("Selecione ou cadastre uma jornada para começar a vincular participantes.")
                ) : (
                  filteredJornadas.map((jornada) => {
                    const tripulacao = participantesPorJornada[String(jornada.id)] || [];

                    return (
                      <div key={`crew-${jornada.id}`} style={crewJourneyCard}>
                        <div style={crewJourneyHeader}>
                          <div>
                            <div style={crewJourneyTitle}>{jornada.nome}</div>
                            <div style={crewJourneyMeta}>
                              {fmtNumber(tripulacao.length)} pessoa(s) vinculada(s)
                            </div>
                          </div>
                          <button
                            type="button"
                            style={buttonSecondaryStyle()}
                            onClick={() => setParticipanteForm((prev) => ({ ...prev, jornada_id: String(jornada.id) }))}
                          >
                            Usar esta jornada
                          </button>
                        </div>

                        <div style={crewListGrid}>
                          {tripulacao.length ? (
                            tripulacao.map((item) => (
                              <div key={item.id} style={crewListCard}>
                                <div style={crewListName}>{item.nome}</div>
                                <div style={crewListMeta}>
                                  {item.turma || "Sem turma"} • {item.cargo || "Sem cargo"}
                                </div>
                                <div style={crewListMeta}>
                                  {item.supervisor || "Sem supervisor"}
                                </div>
                                <div style={buttonRow}>
                                  <span style={crewStatusBadge(item.status_jornada)}>
                                    {displayJourneyParticipantStatus(item.status_jornada)}
                                  </span>
                                  <button
                                    type="button"
                                    style={buttonDangerStyle()}
                                    onClick={() => removeParticipante(item.id)}
                                  >
                                    Remover
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div style={timelineEmpty}>Nenhuma pessoa vinculada a esta jornada.</div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Progresso das jornadas"
              subtitle="Visão do andamento de cada jornada, com ações e coaching/mentoria."
            >
              {loading ? (
                emptyCard("Carregando progresso das jornadas...")
              ) : jornadasFluxo.length === 0 ? (
                emptyCard("Nenhuma jornada encontrada para exibir o percurso.")
              ) : (
                <div style={{ display: "grid", gap: 16 }}>
                  {jornadasFluxo.map((jornada) => (
                    <div key={jornada.id} style={journeyFlowCard}>
                      <div style={journeyFlowHeader}>
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={badgeStyle(jornada.status)}>{displayStatus(jornada.status)}</span>
                            <span style={attentionBadge(jornada.attention_info.level)}>
                              {jornada.attention_info.label}
                            </span>
                            <span style={prazoBadge(jornada.prazo_info.tone)}>
                              {jornada.prazo_info.label}
                            </span>
                          </div>

                          <div style={journeyFlowTitle}>{jornada.nome}</div>

                          <div style={journeyFlowMeta}>
                            Objetivo: {jornada.objetivo || "Não informado"}
                          </div>

                          <div style={journeyFlowMeta}>
                            Público: {jornada.publico_macro || "Não informado"} • Cliente: {" "}
                            {jornada.cliente || "Não informado"}
                          </div>
                        </div>

                        <div style={journeyFlowSummary}>
                          <MetricBox label="Ações" value={fmtNumber(jornada.acoesDaJornada.length)} />
                          <MetricBox label="Coaching" value={fmtNumber(jornada.coachingsDaJornada.length)} />
                          <MetricBox label="Participantes" value={fmtNumber(jornada.total_tripulantes || 0)} />
                          <MetricBox label="Horas" value={fmtHours(jornada.horas_totais)} />
                          <MetricBox label="Progresso" value={`${jornada.progresso}%`} />
                        </div>
                      </div>

                      <div style={journeyProgressBarWrap}>
                        <div style={journeyProgressBarTrack}>
                          <div
                            style={{
                              ...journeyProgressBarFill,
                              width: `${Math.max(jornada.progresso, 6)}%`,
                            }}
                          />
                        </div>

                        <div style={journeyFlowMeta}>
                          Próxima etapa: {jornada.proximoPasso}
                        </div>
                      </div>

                      <div style={timelineWrap}>
                        <div style={timelineLabel}>Ações</div>
                        <div style={timelineItems}>
                          {jornada.acoesDaJornada.length ? (
                            jornada.acoesDaJornada.map((acao) => (
                              <div key={`acao-${acao.id}`} style={timelineItem}>
                                <div style={timelineItemTitle}>{acao.tema}</div>
                                <div style={timelineItemMeta}>
                                  {displayStatus(acao.status)} • {fmtHours(acao.horas_realizadas || 0)}h
                                </div>
                              </div>
                            ))
                          ) : (
                            <div style={timelineEmpty}>Nenhuma ação registrada.</div>
                          )}
                        </div>
                      </div>

                      <div style={timelineWrap}>
                        <div style={timelineLabel}>Coaching e mentoria</div>
                        <div style={timelineItems}>
                          {jornada.coachingsDaJornada.length ? (
                            jornada.coachingsDaJornada.map((item) => (
                              <div key={`coach-${item.id}`} style={timelineItem}>
                                <div style={timelineItemTitle}>{item.titulo}</div>
                                <div style={timelineItemMeta}>
                                  {item.tipo_coaching || "coaching"} • {fmtHours(item.horas_totais || 0)}h
                                </div>
                              </div>
                            ))
                          ) : (
                            <div style={timelineEmpty}>Nenhum coaching ou mentoria registrado.</div>
                          )}
                        </div>
                      </div>

                      <div style={timelineWrap}>
                        <div style={timelineLabel}>Participantes</div>
                        <div style={crewPillRow}>
                          {jornada.tripulacao_preview?.length ? (
                            jornada.tripulacao_preview.map((item) => (
                              <div key={`trip-${item.id}`} style={crewPill}>
                                <div style={crewPillName}>{item.nome}</div>
                                <div style={crewPillMeta}>{item.turma || item.cargo || "Em andamento"}</div>
                              </div>
                            ))
                          ) : (
                            <div style={timelineEmpty}>Nenhuma pessoa vinculada a esta jornada.</div>
                          )}
                        </div>
                      </div>

                      <div style={buttonRow}>
                        <button
                          type="button"
                          style={buttonSecondaryStyle()}
                          onClick={() => editJornada(jornada)}
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          style={buttonDangerStyle()}
                          onClick={() => removeRegistro("jornada", jornada.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        )}

        {activeTab === "acoes" && (
          <>
            <SectionCard
              title="Cadastro de ação"
              subtitle="Cadastre ações com lançamento manual, sem vínculo com a página de turmas."
            >
              <details open style={detailsCard}>
                <summary style={detailsSummary}>Registro de ação</summary>

                <form onSubmit={saveAcao} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                  <div style={formGrid}>
                    <label style={{ ...labelStyle(), ...fieldSpan.xl }}>
                      Jornada
                      <select
                        value={acaoForm.jornada_id}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({
                            ...prev,
                            jornada_id: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                        required
                      >
                        <option value="">Selecione</option>
                        {jornadas.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome || item.titulo}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.xxl }}>
                      Título da ação
                      <input
                        value={acaoForm.titulo}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({ ...prev, titulo: e.target.value }))
                        }
                        style={compactInputStyle()}
                        required
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Subdivisão
                      <select
                        value={acaoForm.subtipo}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({ ...prev, subtipo: e.target.value }))
                        }
                        style={compactInputStyle()}
                      >
                        <option value="">Não classificada</option>
                        {SUBTIPOS_ACAO.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Vincular turma (opcional)
                      <select
                        value={acaoForm.turma_id}
                        onChange={(e) => handleSelecionarTurma(e.target.value)}
                        style={compactInputStyle()}
                      >
                        <option value="">Nenhuma</option>
                        {turmas.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.tema} • {item.cliente}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Responsável
                      <select
                        value={acaoForm.responsavel_id}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({
                            ...prev,
                            responsavel_id: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      >
                        <option value="">Selecione</option>
                        {usuarios.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Status
                      <select
                        value={acaoForm.status}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({ ...prev, status: e.target.value }))
                        }
                        style={compactInputStyle()}
                      >
                        <option value="planejada">Planejada</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="concluida">Concluída</option>
                        <option value="cancelada">Cancelada</option>
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Data início
                      <input
                        type="date"
                        value={acaoForm.data_inicio}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({
                            ...prev,
                            data_inicio: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Data fim
                      <input
                        type="date"
                        value={acaoForm.data_fim}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({
                            ...prev,
                            data_fim: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Carga horária base
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={acaoForm.carga_horaria}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({
                            ...prev,
                            carga_horaria: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Participantes previstos
                      <input
                        type="number"
                        min="0"
                        value={acaoForm.participantes_previstos}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({
                            ...prev,
                            participantes_previstos: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Turmas / sessões
                      <input
                        type="number"
                        min="0"
                        value={acaoForm.quantidade_turmas_sessoes}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({
                            ...prev,
                            quantidade_turmas_sessoes: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Participantes realizados
                      <input
                        type="number"
                        min="0"
                        value={acaoForm.participantes_realizados}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({
                            ...prev,
                            participantes_realizados: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Horas planejadas
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={acaoForm.horas_planejadas}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({
                            ...prev,
                            horas_planejadas: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Horas realizadas
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={acaoForm.horas_realizadas}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({
                            ...prev,
                            horas_realizadas: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.full }}>
                      Descrição
                      <textarea
                        value={acaoForm.descricao}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({
                            ...prev,
                            descricao: e.target.value,
                          }))
                        }
                        style={textareaStyle(92)}
                      />
                    </label>
                  </div>

                  <div style={buttonRow}>
                    <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
                      {acaoForm.id ? "Atualizar ação" : "Salvar ação"}
                    </button>

                    <button
                      type="button"
                      style={buttonSecondaryStyle()}
                      onClick={() => {
                        setAcaoForm(actionInitial);
                        setErro("");
                        setNotice("");
                      }}
                    >
                      Limpar
                    </button>
                  </div>
                </form>
              </details>
            </SectionCard>

            <SectionCard
              title="Ações cadastradas"
              subtitle="Lista das ações já registradas no mapa."
            >
              {loading ? (
                emptyCard("Carregando ações...")
              ) : filteredAcoes.length === 0 ? (
                emptyCard("Nenhuma ação encontrada.")
              ) : (
                <div style={cardsGrid}>
                  {filteredAcoes.map((acao) => (
                    <div key={acao.id} style={execCard}>
                      <div style={execHeader}>
                        <div>
                          <div style={execTitle}>{acao.tema}</div>
                          <div style={execSubtitle}>
                            {acao.jornada_nome} • {acao.responsavel_nome}
                            {acao.subtipo ? ` • ${acao.subtipo}` : ""}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={badgeStyle(acao.status)}>{displayStatus(acao.status)}</span>
                          <span style={attentionBadge(acao.attention_info.level)}>
                            {acao.attention_info.label}
                          </span>
                          <span style={prazoBadge(acao.prazo_info.tone)}>
                            {acao.prazo_info.label}
                          </span>
                        </div>
                      </div>

                      <div style={execBody}>
                        <div style={execText}>
                          {acao.descricao || "Sem descrição registrada."}
                        </div>

                        <div style={miniExecutiveBand}>
                          <MiniExecutive
                            label="Sessões/Turmas"
                            value={fmtNumber(acao.quantidade_turmas_sessoes || 0)}
                          />
                          <MiniExecutive
                            label="Participantes"
                            value={fmtNumber(acao.participantes_realizados || 0)}
                          />
                          <MiniExecutive
                            label="Horas"
                            value={fmtHours(acao.horas_realizadas || 0)}
                          />
                        </div>
                      </div>

                      <div style={buttonRow}>
                        <button style={buttonSecondaryStyle()} onClick={() => editAcao(acao)}>
                          Editar
                        </button>
                        <button
                          style={buttonDangerStyle()}
                          onClick={() => removeRegistro("acao", acao.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        )}

        {activeTab === "coaching" && (
          <>
            <SectionCard
              title="Cadastro de coaching e mentoria"
              subtitle="Registre coaching e mentoria como reforço e continuidade da jornada."
            >
              <details open style={detailsCard}>
                <summary style={detailsSummary}>Registro de coaching</summary>

                <form onSubmit={saveCoaching} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                  <div style={formGrid}>
                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Jornada
                      <select
                        value={coachingForm.jornada_id}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            jornada_id: e.target.value,
                            acao_id: "",
                          }))
                        }
                        style={compactInputStyle()}
                      >
                        <option value="">Selecione</option>
                        {jornadas.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome || item.titulo}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Ação vinculada
                      <select
                        value={coachingForm.acao_id}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            acao_id: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                        disabled={!coachingForm.jornada_id}
                      >
                        <option value="">
                          {coachingForm.jornada_id ? "Sem ação vinculada" : "Selecione primeiro a jornada"}
                        </option>
                        {coachingForm.jornada_id
                          ? acoesOptions
                              .filter(
                                (item) =>
                                  String(item.jornada_id) === String(coachingForm.jornada_id)
                              )
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.tema}
                                </option>
                              ))
                          : null}
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Tipo
                      <select
                        value={coachingForm.tipo_coaching}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            tipo_coaching: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      >
                        <option value="coaching">Coaching</option>
                        <option value="mentoria">Mentoria</option>
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.xxl }}>
                      Título
                      <input
                        value={coachingForm.titulo}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            titulo: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                        required
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Público-alvo
                      <input
                        value={coachingForm.publico_alvo}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            publico_alvo: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Responsável
                      <select
                        value={coachingForm.responsavel_id}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            responsavel_id: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      >
                        <option value="">Selecione</option>
                        {usuarios.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Status
                      <select
                        value={coachingForm.status}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            status: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      >
                        <option value="planejado">Planejado</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="concluido">Concluído</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Data início
                      <input
                        type="date"
                        value={coachingForm.data_inicio}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            data_inicio: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Data fim
                      <input
                        type="date"
                        value={coachingForm.data_fim}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            data_fim: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Participantes previstos
                      <input
                        type="number"
                        min="0"
                        value={coachingForm.participantes_previstos}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            participantes_previstos: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Participantes realizados
                      <input
                        type="number"
                        min="0"
                        value={coachingForm.participantes_realizados}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            participantes_realizados: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Sessões previstas
                      <input
                        type="number"
                        min="0"
                        value={coachingForm.sessoes_previstas}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            sessoes_previstas: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Sessões realizadas
                      <input
                        type="number"
                        min="0"
                        value={coachingForm.sessoes_realizadas}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            sessoes_realizadas: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Carga horária por sessão
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={coachingForm.carga_horaria_sessao}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            carga_horaria_sessao: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Horas planejadas
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={coachingForm.horas_planejadas}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            horas_planejadas: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Horas realizadas
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={coachingForm.horas_totais}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            horas_totais: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.full }}>
                      Objetivo
                      <textarea
                        value={coachingForm.objetivo}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            objetivo: e.target.value,
                          }))
                        }
                        style={textareaStyle(92)}
                      />
                    </label>
                  </div>

                  <div style={buttonRow}>
                    <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
                      {coachingForm.id ? "Atualizar coaching" : "Salvar coaching"}
                    </button>
                    <button
                      type="button"
                      style={buttonSecondaryStyle()}
                      onClick={() => {
                        setCoachingForm(coachingInitial);
                        setErro("");
                        setNotice("");
                      }}
                    >
                      Limpar
                    </button>
                  </div>
                </form>
              </details>
            </SectionCard>

            <SectionCard
              title="Coaching e mentoria cadastrados"
              subtitle="Lista de coachings e mentorias já registrados."
            >
              {loading ? (
                emptyCard("Carregando coachings...")
              ) : filteredCoachings.length === 0 ? (
                emptyCard("Nenhum coaching encontrado.")
              ) : (
                <div style={cardsGrid}>
                  {filteredCoachings.map((item) => {
                    const tipoBadge = sustentacaoTypeBadge(item.tipo_coaching);

                    return (
                      <div key={item.id} style={execCard}>
                        <div style={execHeader}>
                          <div>
                            <div style={execTitle}>{item.titulo}</div>
                            <div style={execSubtitle}>
                              {item.jornada_nome} • {item.acao_nome}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span style={tipoBadge.style}>{tipoBadge.label}</span>
                            <span style={badgeStyle(item.status)}>{displayStatus(item.status)}</span>
                            <span style={attentionBadge(item.attention_info.level)}>
                              {item.attention_info.label}
                            </span>
                          </div>
                        </div>

                        <div style={execBody}>
                          <div style={execText}>{item.objetivo || "Sem objetivo registrado."}</div>

                          <div style={miniExecutiveBand}>
                            <MiniExecutive
                              label="Sessões"
                              value={fmtNumber(item.sessoes_realizadas || 0)}
                            />
                            <MiniExecutive
                              label="Participantes"
                              value={fmtNumber(item.participantes_realizados || 0)}
                            />
                            <MiniExecutive
                              label="Horas"
                              value={fmtHours(item.horas_totais || 0)}
                            />
                          </div>
                        </div>

                        <div style={buttonRow}>
                          <button style={buttonSecondaryStyle()} onClick={() => editCoaching(item)}>
                            Editar
                          </button>
                          <button
                            style={buttonDangerStyle()}
                            onClick={() => removeRegistro("coaching", item.id)}
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </PortalShell>
  );
}

function MetricBox({ label, value }) {
  return (
    <div style={metricBox}>
      <div style={metricBoxLabel}>{label}</div>
      <div style={metricBoxValue}>{value}</div>
    </div>
  );
}

function MiniExecutive({ label, value }) {
  return (
    <div style={miniExecutive}>
      <div style={miniExecutiveLabel}>{label}</div>
      <div style={miniExecutiveValue}>{value}</div>
    </div>
  );
}

function tabButton(active) {
  return {
    border: active ? `1px solid ${colors.primary}` : `1px solid ${colors.border}`,
    background: active ? colors.primaryLight : colors.surface,
    color: active ? colors.primary : colors.textSecondary,
    borderRadius: radius.pill,
    padding: "10px 14px",
    fontWeight: 700,
    fontSize: 13.5,
    cursor: "pointer",
  };
}

const fieldSpan = {
  md: { gridColumn: "span 1" },
  lg: { gridColumn: "span 2" },
  xl: { gridColumn: "span 2" },
  xxl: { gridColumn: "span 3" },
  full: { gridColumn: "1 / -1" },
};

const tabBar = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 6,
};

const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const filtersPanel = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
};

const errorAlert = {
  background: "linear-gradient(180deg, #fff5f5 0%, #fff1f2 100%)",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  padding: "12px 14px",
  borderRadius: 16,
  fontWeight: 700,
  boxShadow: "0 10px 24px rgba(185,28,28,.08)",
};

const successAlert = {
  background: "linear-gradient(180deg, #f5fff8 0%, #f0fdf4 100%)",
  color: "#166534",
  border: "1px solid #bbf7d0",
  padding: "12px 14px",
  borderRadius: 16,
  fontWeight: 700,
  boxShadow: "0 10px 24px rgba(22,101,52,.07)",
};

const clienteGroupHeader = {
  fontSize: 14,
  fontWeight: 700,
  color: "#0f172a",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  paddingBottom: 6,
  borderBottom: "2px solid #dbeafe",
};

const clienteGroupCount = {
  fontWeight: 500,
  color: "#64748b",
  textTransform: "none",
  letterSpacing: 0,
};

const journeyFlowCard = {
  border: "1px solid #d9e8f9",
  borderRadius: 30,
  padding: 22,
  background: "linear-gradient(180deg, #ffffff 0%, #f7fbff 58%, #f3fbff 100%)",
  boxShadow: "0 20px 42px rgba(15,23,42,.06)",
  display: "grid",
  gap: 18,
};

const journeyFlowHeader = {
  display: "grid",
  gridTemplateColumns: "1.3fr .8fr",
  gap: 14,
  alignItems: "start",
};

const journeyFlowTitle = {
  fontSize: 24,
  fontWeight: 900,
  color: "#0f172a",
};

const journeyFlowMeta = {
  fontSize: 13,
  color: "#475569",
  lineHeight: 1.5,
};

const journeyFlowSummary = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const metricBox = {
  borderRadius: 18,
  padding: 16,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  border: "1px solid #d9e3f0",
  display: "grid",
  gap: 6,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.75)",
};

const metricBoxLabel = {
  fontSize: 11,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
};

const metricBoxValue = {
  fontSize: 20,
  fontWeight: 900,
  color: "#0f172a",
};

const journeyProgressBarWrap = {
  display: "grid",
  gap: 8,
};

const journeyProgressBarTrack = {
  width: "100%",
  height: 12,
  borderRadius: 999,
  background: "#e0f2fe",
  overflow: "hidden",
};

const journeyProgressBarFill = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, #06b6d4 0%, #2563eb 100%)",
};

const detailsCard = {
  border: "1px solid #dbeafe",
  borderRadius: 18,
  padding: 14,
  background: "#f8fbff",
};

const detailsSummary = {
  cursor: "pointer",
  fontWeight: 900,
  color: "#0f172a",
};

const formGrid = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
};

const buttonRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const cardsGrid = {
  display: "grid",
  gap: 18,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
};

const execCard = {
  borderRadius: 28,
  border: "1px solid #dbe8f6",
  background: "linear-gradient(180deg, #ffffff 0%, #f9fcff 100%)",
  boxShadow: "0 16px 34px rgba(15,23,42,.05)",
  padding: 20,
  display: "grid",
  gap: 16,
};

const execHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "start",
  gap: 12,
  flexWrap: "wrap",
};

const execTitle = {
  fontSize: 20,
  fontWeight: 900,
  color: "#0f172a",
};

const execSubtitle = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 13,
};

const execBody = {
  display: "grid",
  gap: 12,
};

const execText = {
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.6,
};

const miniExecutiveBand = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
};

const miniExecutive = {
  borderRadius: 20,
  border: "1px solid #dce6f2",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  padding: 14,
  minHeight: 92,
  display: "grid",
  alignContent: "space-between",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.85)",
};

const miniExecutiveLabel = {
  fontSize: 10,
  fontWeight: 900,
  color: "#64748b",
  textTransform: "uppercase",
  lineHeight: 1.25,
  letterSpacing: ".04em",
  whiteSpace: "normal",
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};

const miniExecutiveValue = {
  fontSize: 24,
  fontWeight: 900,
  color: "#0f172a",
  marginTop: 8,
};

const tripulacaoGrid = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "1.15fr .85fr",
  alignItems: "start",
};

const importHintCard = {
  borderRadius: 16,
  border: "1px dashed #bfdbfe",
  background: "linear-gradient(180deg, #ffffff 0%, #f5faff 100%)",
  padding: 14,
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.5,
};

const crewJourneyCard = {
  borderRadius: 24,
  border: "1px solid #dbe8f6",
  background: "linear-gradient(180deg, #ffffff 0%, #f7fbff 100%)",
  boxShadow: "0 14px 30px rgba(15,23,42,.045)",
  padding: 18,
  display: "grid",
  gap: 14,
};

const crewJourneyHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const crewJourneyTitle = {
  fontSize: 20,
  fontWeight: 900,
  color: "#0f172a",
};

const crewJourneyMeta = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 13,
};

const crewListGrid = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const crewListCard = {
  borderRadius: 20,
  border: "1px solid #dce8f7",
  background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  padding: 14,
  display: "grid",
  gap: 8,
  boxShadow: "0 10px 22px rgba(15,23,42,.04)",
};

const crewListName = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
};

const crewListMeta = {
  fontSize: 12,
  color: "#64748b",
};

const crewPillRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const crewPill = {
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  padding: "8px 12px",
  display: "grid",
  gap: 2,
};

const crewPillName = {
  fontSize: 12,
  fontWeight: 800,
  color: "#0f172a",
};

const crewPillMeta = {
  fontSize: 10,
  color: "#64748b",
};

const timelineWrap = {
  display: "grid",
  gap: 8,
  paddingTop: 8,
  borderTop: "1px dashed #e2e8f0",
};

const timelineLabel = {
  fontSize: 11,
  fontWeight: 900,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const timelineItems = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const timelineItem = {
  borderRadius: 14,
  border: "1px solid #dbeafe",
  background: "#f0f6ff",
  padding: "8px 12px",
  display: "grid",
  gap: 2,
};

const timelineItemTitle = {
  fontSize: 13,
  fontWeight: 800,
  color: "#1e3a8a",
};

const timelineItemMeta = {
  fontSize: 11,
  color: "#475569",
};

const timelineEmpty = {
  fontSize: 12,
  color: "#94a3b8",
  fontStyle: "italic",
};
