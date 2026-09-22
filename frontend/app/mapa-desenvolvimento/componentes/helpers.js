// Mapa de Desenvolvimento — funções auxiliares puras e valores iniciais dos
// formulários, extraídos de page.js (22/09/2026, pedido do Ramon: quebrar o
// arquivo — que tinha ~4000 linhas e 6 entidades — em componentes menores).
// Nada aqui foi alterado de comportamento, só movido pra fora do arquivo
// principal — qualquer comentário original explicando o "porquê" de algo foi
// mantido junto da função correspondente.

import { formatDateBR, parseLocalDate } from "../../../lib/date";

export function fmtNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

export function fmtHours(value) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function canonicalStatus(value) {
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

export function displayStatus(value) {
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

export function displayJourneyParticipantStatus(value) {
  const labels = {
    nao_iniciado: "Não iniciado",
    em_percurso: "Em percurso",
    concluido: "Concluído",
    em_sustentacao: "Em sustentação",
  };

  return labels[String(value || "")] || "Em percurso";
}

export function formatDate(value) {
  return formatDateBR(value);
}

export function isValidDateRange(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return true;

  const inicio = parseLocalDate(dataInicio);
  const fim = parseLocalDate(dataFim);

  if (!inicio || !fim) return true;
  return fim >= inicio;
}

export function extrairMensagemErro(error, fallback) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  if (error.error) return error.error;
  return fallback;
}

export function getPrazoInfo(item) {
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

export function badgeStyle(type) {
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

export function attentionBadge(level) {
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

export function prazoBadge(tone) {
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

export function sustentacaoTypeBadge(value) {
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

export function crewStatusBadge(value) {
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

export function getJourneyAttention(jornada, acoesDaJornada, coachingsDaJornada) {
  const prazo = getPrazoInfo(jornada);

  if (prazo.tone === "danger") {
    return { level: "alta", label: "Prazo vencido" };
  }

  if (!acoesDaJornada.length && !coachingsDaJornada.length) {
    return { level: "media", label: "Sem entregas vinculadas" };
  }

  return { level: "ok", label: "Monitorada" };
}

export function getActionAttention(acao) {
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

export function getCoachingAttention(item) {
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

export const journeyInitial = {
  id: null,
  titulo: "",
  cliente: "",
  publico_alvo: "",
  objetivo: "",
  status: "planejada",
  data_inicio: "",
  data_fim: "",
};

export const actionInitial = {
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
export const SUBTIPOS_ACAO = [
  "Prevenção ao Assédio Moral",
  "Coaching de Coordenação e Gerência",
  "Compliance e Ética",
  "Desenvolvimento de Liderança",
  "Treinamento Técnico",
  "Outro",
];

export const coachingInitial = {
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

export const participantInitial = {
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

// Etapas da jornada / "portos" (20/09/2026, pedido do Ramon): o back-end já
// existia (jornadasEtapasController.js) mas nunca teve tela — e é o
// data_fim de cada etapa que alimenta o KPI "Adesão ao Cronograma"
// (metodologiaKpisController.js), então sem esta tela aquele card ficava
// sempre vazio. tipo é VARCHAR livre no banco (sem enum), a lista abaixo é
// só uma sugestão pra padronizar o cadastro.
export const etapaInitial = {
  id: null,
  jornada_id: "",
  nome: "",
  tipo: "treinamento",
  objetivo: "",
  status: "planejada",
  data_inicio: "",
  data_fim: "",
  responsavel_id: "",
  carga_horaria_prevista: "",
  carga_horaria_realizada: "",
  observacoes: "",
  trilha_id: "",
};

export const ETAPA_TIPOS = [
  { value: "treinamento", label: "Treinamento" },
  { value: "avaliacao", label: "Avaliação" },
  { value: "pratica", label: "Prática / aplicação" },
  { value: "checkpoint", label: "Checkpoint" },
  { value: "outro", label: "Outro" },
];

// Clientes da Metodologia (20/09/2026, pedido do Ramon): lista exclusiva,
// sem nenhum vínculo com a tabela `clientes` da Treinamento — ver
// migrate.js passo 42. Existe só pra parar de deixar "Cliente" como campo
// de texto livre nos formulários deste módulo.
export const clienteMetInitial = { id: null, nome: "", status: "ativo", observacoes: "" };

export const PARTICIPANTE_STATUS_OPTIONS = [
  { value: "nao_iniciado", label: "Não iniciado" },
  { value: "em_percurso", label: "Em percurso" },
  { value: "concluido", label: "Concluído" },
  { value: "em_sustentacao", label: "Em sustentação" },
];

export const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "planejado", label: "Planejado" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluido", label: "Concluído" },
  { value: "cancelado", label: "Cancelado" },
];
