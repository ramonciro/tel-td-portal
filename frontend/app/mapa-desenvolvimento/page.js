"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

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
  if (["concluida", "concluído", "concluido", "finalizada"].includes(status)) return "concluido";
  if (["planejada", "planejado"].includes(status)) return "planejado";
  if (["em_andamento", "em andamento"].includes(status)) return "em_andamento";
  if (["cancelada", "cancelado"].includes(status)) return "cancelado";

  return status;
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

function statusPriority(value) {
  const status = canonicalStatus(value);
  const map = {
    em_andamento: 1,
    planejado: 2,
    ativo: 3,
    concluido: 4,
    inativo: 5,
    cancelado: 6,
  };
  return map[status] || 99;
}

function toDateInput(value) {
  if (!value) return "";
  const raw = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function getPrazoInfo(item) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const inicio = parseDate(item.data_inicio);
  const fim = parseDate(item.data_fim);
  const status = canonicalStatus(item.status);

  if (status === "concluido") {
    return { label: "Concluído", tone: "ok" };
  }

  if (!inicio && !fim) {
    return { label: "Sem data", tone: "neutral" };
  }

  if (fim) {
    const fim0 = new Date(fim);
    fim0.setHours(0, 0, 0, 0);
    if (fim0 < hoje && status !== "concluido" && status !== "cancelado") {
      return { label: "Vencido", tone: "danger" };
    }
  }

  return { label: "No prazo", tone: "ok" };
}

function getAttention(item, tipoRegistro) {
  const status = canonicalStatus(item.status);
  const prazo = getPrazoInfo(item);

  if (prazo.tone === "danger") {
    return { level: "alta", label: "Prazo vencido" };
  }

  if (!item.responsavel_nome || item.responsavel_nome === "Não definido") {
    return { level: "media", label: "Sem responsável" };
  }

  if (status === "planejado" && !item.data_inicio) {
    return { level: "media", label: "Sem início definido" };
  }

  if (
    tipoRegistro === "acao" &&
    status === "em_andamento" &&
    Number(item.participantes_realizados || 0) === 0
  ) {
    return { level: "media", label: "Sem realização" };
  }

  if (
    tipoRegistro === "coaching" &&
    status === "em_andamento" &&
    Number(item.sessoes_realizadas || 0) === 0
  ) {
    return { level: "media", label: "Sem sessões realizadas" };
  }

  return { level: "ok", label: "Estável" };
}

function getActionIntensity(item) {
  const horas = Number(item.horas_realizadas_calc || item.horas_realizadas || 0);
  const participantes = Number(item.participantes_realizados || 0);

  if (horas >= 40 || participantes >= 100) {
    return { label: "Alta", tone: "danger" };
  }
  if (horas >= 12 || participantes >= 30) {
    return { label: "Média", tone: "alert" };
  }
  return { label: "Baixa", tone: "default" };
}

function getCoachingIntensity(item) {
  const horas = Number(item.horas_totais_calc || item.horas_totais || 0);
  const sessoes = Number(item.sessoes_realizadas || 0);
  const participantes = Number(item.participantes_realizados || 0);

  if (horas >= 30 || sessoes >= 8 || participantes >= 25) {
    return { label: "Alta", tone: "danger" };
  }
  if (horas >= 10 || sessoes >= 4 || participantes >= 8) {
    return { label: "Média", tone: "alert" };
  }
  return { label: "Baixa", tone: "default" };
}

function getStageHealth(stage) {
  if (!stage) return { label: "Sem etapa", level: "media" };
  if (stage.prazo_info?.tone === "danger") return { label: "Crítica", level: "alta" };
  if (stage.attention_info?.level === "alta") return { label: "Crítica", level: "alta" };
  if (stage.attention_info?.level === "media") return { label: "Atenção", level: "media" };
  return { label: "Saudável", level: "ok" };
}

function getJornadaHealth(jornada, etapasDaJornada, acoesDaJornada, coachingsDaJornada) {
  const prazo = getPrazoInfo(jornada);

  if (!jornada.responsavel_id || etapasDaJornada.length === 0 || prazo.tone === "danger") {
    return { label: "Crítica", level: "alta" };
  }

  const horasTotais =
    acoesDaJornada.reduce((acc, item) => acc + Number(item.horas_realizadas || 0), 0) +
    coachingsDaJornada.reduce((acc, item) => acc + Number(item.horas_totais || 0), 0);

  if (horasTotais === 0 || (acoesDaJornada.length === 0 && coachingsDaJornada.length === 0)) {
    return { label: "Atenção", level: "media" };
  }

  const allPlanejado = etapasDaJornada.every((e) => canonicalStatus(e.status) === "planejado");
  if (allPlanejado) {
    return { label: "Atenção", level: "media" };
  }

  return { label: "Saudável", level: "ok" };
}

function getJornadaAttention(jornada, etapasDaJornada, acoesDaJornada, coachingsDaJornada) {
  const prazo = getPrazoInfo(jornada);

  if (!jornada.responsavel_id) {
    return { level: "alta", label: "Sem responsável" };
  }

  if (etapasDaJornada.length === 0) {
    return { level: "alta", label: "Sem etapas" };
  }

  if (prazo.tone === "danger") {
    return { level: "alta", label: "Prazo vencido" };
  }

  if (acoesDaJornada.length === 0 && coachingsDaJornada.length === 0) {
    return { level: "media", label: "Sem entregas vinculadas" };
  }

  const horasTotais =
    acoesDaJornada.reduce((acc, item) => acc + Number(item.horas_realizadas || 0), 0) +
    coachingsDaJornada.reduce((acc, item) => acc + Number(item.horas_totais || 0), 0);

  if (horasTotais === 0) {
    return { level: "media", label: "Sem horas registradas" };
  }

  return { level: "ok", label: "Monitorada" };
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
  };

  const map = {
    ativo: { background: "#ecfdf5", color: "#166534", borderColor: "#bbf7d0" },
    inativo: { background: "#f8fafc", color: "#475569", borderColor: "#e2e8f0" },
    concluido: { background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" },
    planejado: { background: "#faf5ff", color: "#7c3aed", borderColor: "#ddd6fe" },
    em_andamento: { background: "#fff7ed", color: "#c2410c", borderColor: "#fed7aa" },
    cancelado: { background: "#fef2f2", color: "#b91c1c", borderColor: "#fecaca" },
    coaching: { background: "#eef2ff", color: "#4338ca", borderColor: "#c7d2fe" },
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
    default: {
      background: "#ffffff",
      color: "#334155",
      border: "1px solid #e2e8f0",
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
    ...(map[tone] || map.neutral),
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

function textareaStyle(minHeight = 84) {
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

function calcHorasPlanejadas(acao) {
  return Number(acao.participantes_previstos || 0) * Number(acao.carga_horaria || 0);
}

function calcHorasRealizadas(acao) {
  return Number(acao.participantes_realizados || 0) * Number(acao.carga_horaria || 0);
}

function calcHorasCoaching(plano) {
  return (
    Number(plano.sessoes_realizadas || 0) *
    Number(plano.carga_horaria_sessao || 0) *
    Number(plano.participantes_realizados || 0)
  );
}

function isValidDateRange(dataInicio, dataFim) {
  if (!dataInicio || !dataFim) return true;
  return new Date(dataFim) >= new Date(dataInicio);
}

function validarJornada(form) {
  if (!String(form.nome || "").trim()) return "Informe o nome da jornada.";
  if (!isValidDateRange(form.data_inicio, form.data_fim)) {
    return "A data fim da jornada não pode ser menor que a data início.";
  }
  return "";
}

function validarEtapa(form, jornadas) {
  if (!form.jornada_id) return "Selecione a jornada da etapa.";
  if (!String(form.nome || "").trim()) return "Informe o nome da etapa.";

  const jornadaExiste = jornadas.some((j) => String(j.id) === String(form.jornada_id));
  if (!jornadaExiste) return "A jornada selecionada para a etapa não é válida.";

  if (!isValidDateRange(form.data_inicio, form.data_fim)) {
    return "A data fim da etapa não pode ser menor que a data início.";
  }
  return "";
}

function validarAcao(form, jornadas, etapas) {
  if (!form.jornada_id) return "Selecione a jornada da ação.";
  if (!String(form.tema || "").trim()) return "Informe o título/tema da ação.";

  const jornadaExiste = jornadas.some((j) => String(j.id) === String(form.jornada_id));
  if (!jornadaExiste) return "A jornada selecionada para a ação não é válida.";

  if (form.etapa_id) {
    const etapa = etapas.find((e) => String(e.id) === String(form.etapa_id));
    if (!etapa) return "A etapa selecionada para a ação não é válida.";
    if (String(etapa.jornada_id) !== String(form.jornada_id)) {
      return "A etapa selecionada não pertence à jornada escolhida.";
    }
  }

  if (!isValidDateRange(form.data_inicio, form.data_fim)) {
    return "A data fim da ação não pode ser menor que a data início.";
  }
  return "";
}

function validarCoaching(form, jornadas, etapas, acoes) {
  if (!String(form.titulo || "").trim()) return "Informe o título do coaching.";

  if (form.jornada_id) {
    const jornadaExiste = jornadas.some((j) => String(j.id) === String(form.jornada_id));
    if (!jornadaExiste) return "A jornada selecionada para o coaching não é válida.";
  }

  if (form.etapa_id) {
    const etapa = etapas.find((e) => String(e.id) === String(form.etapa_id));
    if (!etapa) return "A etapa selecionada para o coaching não é válida.";
    if (form.jornada_id && String(etapa.jornada_id) !== String(form.jornada_id)) {
      return "A etapa selecionada não pertence à jornada escolhida no coaching.";
    }
  }

  if (form.acao_id) {
    const acao = acoes.find((a) => String(a.id) === String(form.acao_id));
    if (!acao) return "A ação vinculada ao coaching não é válida.";

    if (form.jornada_id && String(acao.jornada_id) !== String(form.jornada_id)) {
      return "A ação vinculada não pertence à jornada escolhida no coaching.";
    }

    if (form.etapa_id && String(acao.etapa_id || "") !== String(form.etapa_id)) {
      return "A ação vinculada não pertence à etapa escolhida no coaching.";
    }
  }

  if (!isValidDateRange(form.data_inicio, form.data_fim)) {
    return "A data fim do coaching não pode ser menor que a data início.";
  }
  return "";
}

function extrairMensagemErro(error, fallback) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  if (error.error) return error.error;
  return fallback;
}

const jornadaInicial = {
  id: null,
  nome: "",
  descricao: "",
  objetivo: "",
  publico_macro: "",
  observacoes: "",
  status: "ativo",
  responsavel_id: "",
  data_inicio: "",
  data_fim: "",
};

const etapaInicial = {
  id: null,
  jornada_id: "",
  nome: "",
  descricao: "",
  objetivo: "",
  tipo: "treinamento",
  ordem: "",
  status: "planejado",
  responsavel_id: "",
  data_inicio: "",
  data_fim: "",
  carga_horaria_prevista: "",
  carga_horaria_realizada: "",
  observacoes: "",
};

const acaoInicial = {
  id: null,
  jornada_id: "",
  etapa_id: "",
  tipo_acao: "treinamento",
  tema: "",
  subtipo: "",
  publico_alvo: "",
  obrigatoria: 0,
  descricao: "",
  carga_horaria: "",
  participantes_previstos: "",
  participantes_realizados: "",
  quantidade_turmas_sessoes: "",
  horas_planejadas: "",
  horas_realizadas: "",
  status: "planejado",
  responsavel_id: "",
  data_inicio: "",
  data_fim: "",
};

const coachingInicial = {
  id: null,
  jornada_id: "",
  etapa_id: "",
  acao_id: "",
  tipo_coaching: "coordenacao",
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
  status: "planejado",
  data_inicio: "",
  data_fim: "",
};

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "concluido", label: "Concluído" },
  { value: "planejado", label: "Planejado" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "cancelado", label: "Cancelado" },
];

const TIPO_OPTIONS = [
  { value: "", label: "Todos os tipos" },
  { value: "treinamento", label: "Treinamento" },
  { value: "campanha", label: "Campanha" },
  { value: "workshop", label: "Workshop" },
  { value: "integracao", label: "Integração" },
  { value: "reciclagem", label: "Reciclagem" },
  { value: "acao_estrategica", label: "Ação estratégica" },
  { value: "coaching", label: "Coaching" },
  { value: "outro", label: "Outro" },
];

export default function MapaDesenvolvimentoPage() {
  const [activeTab, setActiveTab] = useState("geral");

  const [usuarios, setUsuarios] = useState([]);
  const [jornadas, setJornadas] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [coachings, setCoachings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [notice, setNotice] = useState("");

  const [filters, setFilters] = useState({
    jornada_id: "",
    etapa_id: "",
    tipo: "",
    status: "",
    responsavel_id: "",
    busca: "",
  });

  const [jornadaForm, setJornadaForm] = useState(jornadaInicial);
  const [etapaForm, setEtapaForm] = useState(etapaInicial);
  const [acaoForm, setAcaoForm] = useState(acaoInicial);
  const [coachingForm, setCoachingForm] = useState(coachingInicial);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!filters.jornada_id) return;
    if (!filters.etapa_id) return;

    const etapaValida = etapas.some(
      (item) =>
        String(item.id) === String(filters.etapa_id) &&
        String(item.jornada_id) === String(filters.jornada_id)
    );

    if (!etapaValida) {
      setFilters((prev) => ({ ...prev, etapa_id: "" }));
    }
  }, [filters.jornada_id, filters.etapa_id, etapas]);

  async function safeLoad(path) {
    try {
      const data = await apiFetch(path);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async function loadAll() {
    setLoading(true);
    setErro("");
    try {
      const [usuariosData, jornadasData, etapasData, acoesData, coachingsData] = await Promise.all([
        safeLoad("/usuarios"),
        safeLoad("/jornadas-desenvolvimento"),
        safeLoad("/jornadas-etapas"),
        safeLoad("/acoes-desenvolvimento"),
        safeLoad("/coaching-planos"),
      ]);

      setUsuarios(usuariosData);
      setJornadas(jornadasData);
      setEtapas(etapasData);
      setAcoes(acoesData);
      setCoachings(coachingsData);
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao carregar o Mapa de Desenvolvimento."));
    } finally {
      setLoading(false);
    }
  }

  const responsavelMap = useMemo(() => {
    const map = {};
    usuarios.forEach((u) => {
      map[String(u.id)] = u.nome || `Usuário ${u.id}`;
    });
    return map;
  }, [usuarios]);

  const jornadasMap = useMemo(() => {
    const map = {};
    jornadas.forEach((j) => {
      map[String(j.id)] = j;
    });
    return map;
  }, [jornadas]);

  const etapasMap = useMemo(() => {
    const map = {};
    etapas.forEach((e) => {
      map[String(e.id)] = e;
    });
    return map;
  }, [etapas]);

  const etapasOrdenadas = useMemo(() => {
    return [...etapas].sort((a, b) => {
      const aj = Number(a.jornada_id || 0);
      const bj = Number(b.jornada_id || 0);
      if (aj !== bj) return aj - bj;

      const ao = Number(a.ordem || 9999);
      const bo = Number(b.ordem || 9999);
      if (ao !== bo) return ao - bo;

      return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
    });
  }, [etapas]);

  const jornadasEnriquecidas = useMemo(() => {
    return jornadas.map((jornada) => {
      const etapasDaJornada = etapas.filter((e) => String(e.jornada_id) === String(jornada.id));
      const acoesDaJornada = acoes.filter((a) => String(a.jornada_id) === String(jornada.id));
      const coachingsDaJornada = coachings.filter((c) => String(c.jornada_id || "") === String(jornada.id));

      const horasAcoes = acoesDaJornada.reduce(
        (acc, item) => acc + Number(item.horas_realizadas || calcHorasRealizadas(item)),
        0
      );
      const horasCoaching = coachingsDaJornada.reduce(
        (acc, item) => acc + Number(item.horas_totais || calcHorasCoaching(item)),
        0
      );

      const responsavel_nome = responsavelMap[String(jornada.responsavel_id)] || "Não definido";
      const prazo_info = getPrazoInfo(jornada);
      const saude_info = getJornadaHealth(jornada, etapasDaJornada, acoesDaJornada, coachingsDaJornada);
      const attention_info = getJornadaAttention(jornada, etapasDaJornada, acoesDaJornada, coachingsDaJornada);

      const etapasCriticas = etapasDaJornada
        .map((etapa) => {
          const prazo = getPrazoInfo(etapa);
          const fakeStage = {
            ...etapa,
            prazo_info: prazo,
            attention_info:
              !etapa.responsavel_id
                ? { level: "media", label: "Sem responsável" }
                : prazo.tone === "danger"
                ? { level: "alta", label: "Prazo vencido" }
                : { level: "ok", label: "Estável" },
          };
          return { ...fakeStage, saude_info: getStageHealth(fakeStage) };
        })
        .sort((a, b) => {
          const pa = a.saude_info.level === "alta" ? 1 : a.saude_info.level === "media" ? 2 : 3;
          const pb = b.saude_info.level === "alta" ? 1 : b.saude_info.level === "media" ? 2 : 3;
          if (pa !== pb) return pa - pb;
          return Number(a.ordem || 9999) - Number(b.ordem || 9999);
        });

      return {
        ...jornada,
        status_canonico: canonicalStatus(jornada.status),
        responsavel_nome,
        total_etapas: etapasDaJornada.length,
        total_acoes: acoesDaJornada.length,
        total_coachings: coachingsDaJornada.length,
        horas_totais: horasAcoes + horasCoaching,
        prazo_info,
        saude_info,
        attention_info,
        etapa_critica: etapasCriticas[0] || null,
      };
    });
  }, [jornadas, etapas, acoes, coachings, responsavelMap]);

  const etapasEnriquecidas = useMemo(() => {
    return etapasOrdenadas.map((etapa) => {
      const jornada = jornadasMap[String(etapa.jornada_id)];
      const acoesDaEtapa = acoes.filter((a) => String(a.etapa_id || "") === String(etapa.id));
      const coachingsDaEtapa = coachings.filter((c) => String(c.etapa_id || "") === String(etapa.id));

      const horasAcoes = acoesDaEtapa.reduce(
        (acc, item) => acc + Number(item.horas_realizadas || calcHorasRealizadas(item)),
        0
      );
      const horasCoaching = coachingsDaEtapa.reduce(
        (acc, item) => acc + Number(item.horas_totais || calcHorasCoaching(item)),
        0
      );

      return {
        ...etapa,
        status_canonico: canonicalStatus(etapa.status),
        jornada_nome: jornada?.nome || "Sem jornada",
        responsavel_nome: responsavelMap[String(etapa.responsavel_id)] || "Não definido",
        total_acoes: acoesDaEtapa.length,
        total_coachings: coachingsDaEtapa.length,
        horas_totais: horasAcoes + horasCoaching,
      };
    });
  }, [etapasOrdenadas, jornadasMap, acoes, coachings, responsavelMap]);

  const acoesEnriquecidas = useMemo(() => {
    return acoes.map((acao) => {
      const jornada = jornadasMap[String(acao.jornada_id)];
      const etapa = etapasMap[String(acao.etapa_id || "")];
      const base = {
        ...acao,
        tipo_registro: "acao",
        status_canonico: canonicalStatus(acao.status),
        jornada_nome: jornada?.nome || "Sem jornada",
        etapa_nome: etapa?.nome || "Sem etapa",
        responsavel_nome: responsavelMap[String(acao.responsavel_id)] || "Não definido",
        horas_planejadas_calc: Number(acao.horas_planejadas || calcHorasPlanejadas(acao)),
        horas_realizadas_calc: Number(acao.horas_realizadas || calcHorasRealizadas(acao)),
      };
      return {
        ...base,
        prazo_info: getPrazoInfo(base),
        attention_info: getAttention(base, "acao"),
        intensidade_info: getActionIntensity(base),
      };
    });
  }, [acoes, jornadasMap, etapasMap, responsavelMap]);

  const coachingsEnriquecidos = useMemo(() => {
    return coachings.map((plano) => {
      const jornada = jornadasMap[String(plano.jornada_id || "")];
      const etapa = etapasMap[String(plano.etapa_id || "")];
      const acao = acoes.find((a) => String(a.id) === String(plano.acao_id || ""));
      const base = {
        ...plano,
        tipo_registro: "coaching",
        status_canonico: canonicalStatus(plano.status),
        jornada_nome: jornada?.nome || "Independente",
        etapa_nome: etapa?.nome || "Sem etapa",
        acao_nome: acao?.tema || "Sem ação vinculada",
        responsavel_nome: responsavelMap[String(plano.responsavel_id)] || "Não definido",
        horas_totais_calc: Number(plano.horas_totais || calcHorasCoaching(plano)),
      };
      return {
        ...base,
        prazo_info: getPrazoInfo(base),
        attention_info: getAttention(base, "coaching"),
        intensidade_info: getCoachingIntensity(base),
      };
    });
  }, [coachings, jornadasMap, etapasMap, acoes, responsavelMap]);

  function matchBusca(textParts, termo) {
    if (!termo) return true;
    return normalize(textParts.filter(Boolean).join(" ")).includes(normalize(termo));
  }

  const filteredJornadas = useMemo(() => {
    return jornadasEnriquecidas.filter((item) => {
      const matchJornada = !filters.jornada_id || String(item.id) === String(filters.jornada_id);
      const matchStatus = !filters.status || item.status_canonico === filters.status;
      const matchResponsavel =
        !filters.responsavel_id || String(item.responsavel_id || "") === String(filters.responsavel_id);

      return (
        matchJornada &&
        matchStatus &&
        matchResponsavel &&
        matchBusca(
          [
            item.nome,
            item.descricao,
            item.objetivo,
            item.publico_macro,
            item.observacoes,
            item.responsavel_nome,
          ],
          filters.busca
        )
      );
    });
  }, [jornadasEnriquecidas, filters]);

  const filteredEtapas = useMemo(() => {
    return etapasEnriquecidas.filter((item) => {
      const matchJornada =
        !filters.jornada_id || String(item.jornada_id || "") === String(filters.jornada_id);
      const matchEtapa = !filters.etapa_id || String(item.id) === String(filters.etapa_id);
      const matchStatus = !filters.status || item.status_canonico === filters.status;
      const matchResponsavel =
        !filters.responsavel_id || String(item.responsavel_id || "") === String(filters.responsavel_id);

      const matchTipo =
        !filters.tipo ||
        normalize(item.tipo) === normalize(filters.tipo) ||
        (filters.tipo === "coaching" && normalize(item.tipo) === "coaching");

      return (
        matchJornada &&
        matchEtapa &&
        matchStatus &&
        matchResponsavel &&
        matchTipo &&
        matchBusca(
          [
            item.nome,
            item.descricao,
            item.objetivo,
            item.tipo,
            item.observacoes,
            item.jornada_nome,
            item.responsavel_nome,
          ],
          filters.busca
        )
      );
    });
  }, [etapasEnriquecidas, filters]);

  const filteredAcoes = useMemo(() => {
    return acoesEnriquecidas.filter((item) => {
      const matchJornada =
        !filters.jornada_id || String(item.jornada_id || "") === String(filters.jornada_id);
      const matchEtapa =
        !filters.etapa_id || String(item.etapa_id || "") === String(filters.etapa_id);
      const matchTipo = !filters.tipo || normalize(item.tipo_acao) === normalize(filters.tipo);
      const matchStatus = !filters.status || item.status_canonico === filters.status;
      const matchResponsavel =
        !filters.responsavel_id || String(item.responsavel_id || "") === String(filters.responsavel_id);

      return (
        matchJornada &&
        matchEtapa &&
        matchTipo &&
        matchStatus &&
        matchResponsavel &&
        matchBusca(
          [
            item.tema,
            item.subtipo,
            item.publico_alvo,
            item.descricao,
            item.jornada_nome,
            item.etapa_nome,
            item.responsavel_nome,
          ],
          filters.busca
        )
      );
    });
  }, [acoesEnriquecidas, filters]);

  const filteredCoachings = useMemo(() => {
    return coachingsEnriquecidos.filter((item) => {
      const matchJornada =
        !filters.jornada_id || String(item.jornada_id || "") === String(filters.jornada_id);
      const matchEtapa =
        !filters.etapa_id || String(item.etapa_id || "") === String(filters.etapa_id);
      const matchTipo =
        !filters.tipo ||
        normalize(item.tipo_coaching) === normalize(filters.tipo) ||
        filters.tipo === "coaching";
      const matchStatus = !filters.status || item.status_canonico === filters.status;
      const matchResponsavel =
        !filters.responsavel_id || String(item.responsavel_id || "") === String(filters.responsavel_id);

      return (
        matchJornada &&
        matchEtapa &&
        matchTipo &&
        matchStatus &&
        matchResponsavel &&
        matchBusca(
          [
            item.titulo,
            item.tipo_coaching,
            item.publico_alvo,
            item.objetivo,
            item.jornada_nome,
            item.etapa_nome,
            item.acao_nome,
            item.responsavel_nome,
          ],
          filters.busca
        )
      );
    });
  }, [coachingsEnriquecidos, filters]);

  const overviewRows = useMemo(() => {
    const rows = [
      ...filteredAcoes.map((item) => ({
        ...item,
        titulo: item.tema,
        tipo_label: item.tipo_acao,
        horas: item.horas_realizadas_calc,
      })),
      ...filteredCoachings.map((item) => ({
        ...item,
        titulo: item.titulo,
        tipo_label: `coaching • ${item.tipo_coaching}`,
        horas: item.horas_totais_calc,
      })),
    ];

    return rows.sort((a, b) => {
      const p = statusPriority(a.status) - statusPriority(b.status);
      if (p !== 0) return p;

      const att =
        (a.attention_info?.level === "alta" ? 1 : a.attention_info?.level === "media" ? 2 : 3) -
        (b.attention_info?.level === "alta" ? 1 : b.attention_info?.level === "media" ? 2 : 3);
      if (att !== 0) return att;

      const da = parseDate(a.data_fim || a.data_inicio);
      const db = parseDate(b.data_fim || b.data_inicio);
      if (da && db) return db - da;
      if (da) return -1;
      if (db) return 1;

      const horas = Number(b.horas || 0) - Number(a.horas || 0);
      if (horas !== 0) return horas;

      return String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt-BR");
    });
  }, [filteredAcoes, filteredCoachings]);

  const orderedAcoes = useMemo(() => {
    return [...filteredAcoes].sort((a, b) => {
      const p = statusPriority(a.status) - statusPriority(b.status);
      if (p !== 0) return p;

      const att =
        (a.attention_info?.level === "alta" ? 1 : a.attention_info?.level === "media" ? 2 : 3) -
        (b.attention_info?.level === "alta" ? 1 : b.attention_info?.level === "media" ? 2 : 3);
      if (att !== 0) return att;

      const pa = a.prazo_info?.tone === "danger" ? 1 : a.prazo_info?.tone === "neutral" ? 3 : 2;
      const pb = b.prazo_info?.tone === "danger" ? 1 : b.prazo_info?.tone === "neutral" ? 3 : 2;
      if (pa !== pb) return pa - pb;

      const ia = a.intensidade_info?.tone === "danger" ? 1 : a.intensidade_info?.tone === "alert" ? 2 : 3;
      const ib = b.intensidade_info?.tone === "danger" ? 1 : b.intensidade_info?.tone === "alert" ? 2 : 3;
      if (ia !== ib) return ia - ib;

      const da = parseDate(a.data_fim || a.data_inicio);
      const db = parseDate(b.data_fim || b.data_inicio);
      if (da && db) return db - da;
      if (da) return -1;
      if (db) return 1;

      return String(a.tema || "").localeCompare(String(b.tema || ""), "pt-BR");
    });
  }, [filteredAcoes]);

  const orderedCoachings = useMemo(() => {
    return [...filteredCoachings].sort((a, b) => {
      const p = statusPriority(a.status) - statusPriority(b.status);
      if (p !== 0) return p;

      const att =
        (a.attention_info?.level === "alta" ? 1 : a.attention_info?.level === "media" ? 2 : 3) -
        (b.attention_info?.level === "alta" ? 1 : b.attention_info?.level === "media" ? 2 : 3);
      if (att !== 0) return att;

      const independentA = a.jornada_id ? 2 : 1;
      const independentB = b.jornada_id ? 2 : 1;
      if (independentA !== independentB) return independentA - independentB;

      const pa = a.prazo_info?.tone === "danger" ? 1 : a.prazo_info?.tone === "neutral" ? 3 : 2;
      const pb = b.prazo_info?.tone === "danger" ? 1 : b.prazo_info?.tone === "neutral" ? 3 : 2;
      if (pa !== pb) return pa - pb;

      const ia = a.intensidade_info?.tone === "danger" ? 1 : a.intensidade_info?.tone === "alert" ? 2 : 3;
      const ib = b.intensidade_info?.tone === "danger" ? 1 : b.intensidade_info?.tone === "alert" ? 2 : 3;
      if (ia !== ib) return ia - ib;

      const da = parseDate(a.data_fim || a.data_inicio);
      const db = parseDate(b.data_fim || b.data_inicio);
      if (da && db) return db - da;
      if (da) return -1;
      if (db) return 1;

      return String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt-BR");
    });
  }, [filteredCoachings]);

  const actionExecutive = useMemo(() => {
    return {
      emAndamento: orderedAcoes.filter((i) => i.status_canonico === "em_andamento").length,
      concluidas: orderedAcoes.filter((i) => i.status_canonico === "concluido").length,
      semResponsavel: orderedAcoes.filter((i) => i.attention_info?.label === "Sem responsável").length,
      vencidas: orderedAcoes.filter((i) => i.prazo_info?.tone === "danger").length,
      horas: orderedAcoes.reduce((acc, i) => acc + Number(i.horas_realizadas_calc || 0), 0),
      criticas: orderedAcoes.filter((i) => i.attention_info?.level === "alta").length,
    };
  }, [orderedAcoes]);

  const coachingExecutive = useMemo(() => {
    return {
      emAndamento: orderedCoachings.filter((i) => i.status_canonico === "em_andamento").length,
      concluidos: orderedCoachings.filter((i) => i.status_canonico === "concluido").length,
      independentes: orderedCoachings.filter((i) => !i.jornada_id).length,
      semResponsavel: orderedCoachings.filter((i) => i.attention_info?.label === "Sem responsável").length,
      vencidos: orderedCoachings.filter((i) => i.prazo_info?.tone === "danger").length,
      horas: orderedCoachings.reduce((acc, i) => acc + Number(i.horas_totais_calc || 0), 0),
      criticos: orderedCoachings.filter((i) => i.attention_info?.level === "alta").length,
    };
  }, [orderedCoachings]);

  const executiveAlerts = useMemo(() => {
    const rows = overviewRows;
    return {
      emAndamento: rows.filter((i) => i.status_canonico === "em_andamento").length,
      criticos: rows.filter((i) => i.attention_info?.level === "alta").length,
      semResponsavel: rows.filter((i) => i.attention_info?.label === "Sem responsável").length,
      vencidos: rows.filter((i) => i.prazo_info?.tone === "danger").length,
    };
  }, [overviewRows]);

  const kpis = useMemo(() => {
    const participantesAcoes = filteredAcoes.reduce(
      (acc, item) => acc + Number(item.participantes_realizados || 0),
      0
    );
    const participantesCoachings = filteredCoachings.reduce(
      (acc, item) => acc + Number(item.participantes_realizados || 0),
      0
    );
    const horasAcoes = filteredAcoes.reduce(
      (acc, item) => acc + Number(item.horas_realizadas_calc || 0),
      0
    );
    const horasCoachings = filteredCoachings.reduce(
      (acc, item) => acc + Number(item.horas_totais_calc || 0),
      0
    );

    return {
      jornadas: filteredJornadas.length,
      etapas: filteredEtapas.length,
      acoes: filteredAcoes.length,
      coachings: filteredCoachings.length,
      participantes: participantesAcoes + participantesCoachings,
      horasTotais: horasAcoes + horasCoachings,
      concluidas:
        filteredAcoes.filter((i) => i.status_canonico === "concluido").length +
        filteredCoachings.filter((i) => i.status_canonico === "concluido").length,
      coachingsIndependentes: filteredCoachings.filter((i) => !i.jornada_id).length,
      fluxosAtivos: filteredJornadas.filter((i) => i.status_canonico === "ativo").length,
    };
  }, [filteredJornadas, filteredEtapas, filteredAcoes, filteredCoachings]);

  async function saveJornada(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    const erroValidacao = validarJornada(jornadaForm);
    if (erroValidacao) {
      setErro(erroValidacao);
      setSaving(false);
      return;
    }

    try {
      const payload = {
        nome: jornadaForm.nome,
        descricao: jornadaForm.descricao,
        objetivo: jornadaForm.objetivo,
        publico_macro: jornadaForm.publico_macro,
        observacoes: jornadaForm.observacoes,
        status: jornadaForm.status,
        responsavel_id: jornadaForm.responsavel_id || null,
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

      setJornadaForm(jornadaInicial);
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao salvar jornada."));
    } finally {
      setSaving(false);
    }
  }

  async function saveEtapa(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    const erroValidacao = validarEtapa(etapaForm, jornadas);
    if (erroValidacao) {
      setErro(erroValidacao);
      setSaving(false);
      return;
    }

    try {
      const payload = {
        jornada_id: Number(etapaForm.jornada_id),
        nome: etapaForm.nome,
        descricao: etapaForm.descricao,
        objetivo: etapaForm.objetivo,
        tipo: etapaForm.tipo,
        ordem: Number(etapaForm.ordem || 0),
        status: etapaForm.status,
        responsavel_id: etapaForm.responsavel_id || null,
        data_inicio: etapaForm.data_inicio || null,
        data_fim: etapaForm.data_fim || null,
        carga_horaria_prevista: Number(etapaForm.carga_horaria_prevista || 0),
        carga_horaria_realizada: Number(etapaForm.carga_horaria_realizada || 0),
        observacoes: etapaForm.observacoes,
      };

      if (etapaForm.id) {
        await apiFetch(`/jornadas-etapas/${etapaForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice("Etapa atualizada com sucesso.");
      } else {
        await apiFetch("/jornadas-etapas", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Etapa registrada com sucesso.");
      }

      setEtapaForm(etapaInicial);
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao salvar etapa."));
    } finally {
      setSaving(false);
    }
  }

  async function saveAcao(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    const erroValidacao = validarAcao(acaoForm, jornadas, etapas);
    if (erroValidacao) {
      setErro(erroValidacao);
      setSaving(false);
      return;
    }

    try {
      const horasPlanejadas =
        acaoForm.horas_planejadas !== ""
          ? Number(acaoForm.horas_planejadas || 0)
          : Number(acaoForm.participantes_previstos || 0) * Number(acaoForm.carga_horaria || 0);

      const horasRealizadas =
        acaoForm.horas_realizadas !== ""
          ? Number(acaoForm.horas_realizadas || 0)
          : Number(acaoForm.participantes_realizados || 0) * Number(acaoForm.carga_horaria || 0);

      const payload = {
        jornada_id: Number(acaoForm.jornada_id),
        etapa_id: acaoForm.etapa_id ? Number(acaoForm.etapa_id) : null,
        tipo_acao: acaoForm.tipo_acao,
        tema: acaoForm.tema,
        subtipo: acaoForm.subtipo,
        publico_alvo: acaoForm.publico_alvo,
        obrigatoria: Number(acaoForm.obrigatoria || 0),
        descricao: acaoForm.descricao,
        carga_horaria: Number(acaoForm.carga_horaria || 0),
        participantes_previstos: Number(acaoForm.participantes_previstos || 0),
        participantes_realizados: Number(acaoForm.participantes_realizados || 0),
        quantidade_turmas_sessoes: Number(acaoForm.quantidade_turmas_sessoes || 0),
        horas_planejadas: horasPlanejadas,
        horas_realizadas: horasRealizadas,
        status: acaoForm.status,
        responsavel_id: acaoForm.responsavel_id || null,
        data_inicio: acaoForm.data_inicio || null,
        data_fim: acaoForm.data_fim || null,
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

      setAcaoForm(acaoInicial);
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

    const erroValidacao = validarCoaching(coachingForm, jornadas, etapas, acoes);
    if (erroValidacao) {
      setErro(erroValidacao);
      setSaving(false);
      return;
    }

    try {
      const horasTotais =
        coachingForm.horas_totais !== ""
          ? Number(coachingForm.horas_totais || 0)
          : Number(coachingForm.sessoes_realizadas || 0) *
            Number(coachingForm.carga_horaria_sessao || 0) *
            Number(coachingForm.participantes_realizados || 0);

      const payload = {
        jornada_id: coachingForm.jornada_id ? Number(coachingForm.jornada_id) : null,
        etapa_id: coachingForm.etapa_id ? Number(coachingForm.etapa_id) : null,
        acao_id: coachingForm.acao_id ? Number(coachingForm.acao_id) : null,
        tipo_coaching: coachingForm.tipo_coaching,
        titulo: coachingForm.titulo,
        publico_alvo: coachingForm.publico_alvo,
        objetivo: coachingForm.objetivo,
        responsavel_id: coachingForm.responsavel_id || null,
        participantes_previstos: Number(coachingForm.participantes_previstos || 0),
        participantes_realizados: Number(coachingForm.participantes_realizados || 0),
        sessoes_previstas: Number(coachingForm.sessoes_previstas || 0),
        sessoes_realizadas: Number(coachingForm.sessoes_realizadas || 0),
        carga_horaria_sessao: Number(coachingForm.carga_horaria_sessao || 0),
        horas_totais: horasTotais,
        status: coachingForm.status,
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

      setCoachingForm(coachingInicial);
      await loadAll();
    } catch (error) {
      setErro(extrairMensagemErro(error, "Erro ao salvar coaching."));
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
        etapa: `/jornadas-etapas/${id}`,
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
      nome: item.nome || "",
      descricao: item.descricao || "",
      objetivo: item.objetivo || "",
      publico_macro: item.publico_macro || "",
      observacoes: item.observacoes || "",
      status: canonicalStatus(item.status) || "ativo",
      responsavel_id: item.responsavel_id || "",
      data_inicio: toDateInput(item.data_inicio),
      data_fim: toDateInput(item.data_fim),
    });
    setActiveTab("jornadas");
  }

  function editEtapa(item) {
    setEtapaForm({
      id: item.id,
      jornada_id: item.jornada_id || "",
      nome: item.nome || "",
      descricao: item.descricao || "",
      objetivo: item.objetivo || "",
      tipo: item.tipo || "treinamento",
      ordem: String(item.ordem || ""),
      status: canonicalStatus(item.status) || "planejado",
      responsavel_id: item.responsavel_id || "",
      data_inicio: toDateInput(item.data_inicio),
      data_fim: toDateInput(item.data_fim),
      carga_horaria_prevista: String(item.carga_horaria_prevista || ""),
      carga_horaria_realizada: String(item.carga_horaria_realizada || ""),
      observacoes: item.observacoes || "",
    });
    setActiveTab("jornadas");
  }

  function editAcao(item) {
    setAcaoForm({
      id: item.id,
      jornada_id: item.jornada_id || "",
      etapa_id: item.etapa_id || "",
      tipo_acao: item.tipo_acao || "treinamento",
      tema: item.tema || "",
      subtipo: item.subtipo || "",
      publico_alvo: item.publico_alvo || "",
      obrigatoria: Number(item.obrigatoria || 0),
      descricao: item.descricao || "",
      carga_horaria: String(item.carga_horaria || ""),
      participantes_previstos: String(item.participantes_previstos || ""),
      participantes_realizados: String(item.participantes_realizados || ""),
      quantidade_turmas_sessoes: String(item.quantidade_turmas_sessoes || ""),
      horas_planejadas: String(item.horas_planejadas || ""),
      horas_realizadas: String(item.horas_realizadas || ""),
      status: canonicalStatus(item.status) || "planejado",
      responsavel_id: item.responsavel_id || "",
      data_inicio: toDateInput(item.data_inicio),
      data_fim: toDateInput(item.data_fim),
    });
    setActiveTab("acoes");
  }

  function editCoaching(item) {
    setCoachingForm({
      id: item.id,
      jornada_id: item.jornada_id || "",
      etapa_id: item.etapa_id || "",
      acao_id: item.acao_id || "",
      tipo_coaching: item.tipo_coaching || "coordenacao",
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
      status: canonicalStatus(item.status) || "planejado",
      data_inicio: toDateInput(item.data_inicio),
      data_fim: toDateInput(item.data_fim),
    });
    setActiveTab("coaching");
  }

  const acoesOptions = useMemo(() => {
    return [...acoesEnriquecidas].sort((a, b) =>
      String(a.tema || "").localeCompare(String(b.tema || ""), "pt-BR")
    );
  }, [acoesEnriquecidas]);

  const destaqueCards = [
    {
      title: "Fluxos ativos",
      value: fmtNumber(kpis.fluxosAtivos),
      subtitle: "Jornadas em execução",
    },
    {
      title: "Coachings independentes",
      value: fmtNumber(kpis.coachingsIndependentes),
      subtitle: "Sem vínculo obrigatório",
    },
    {
      title: "Entregas concluídas",
      value: fmtNumber(kpis.concluidas),
      subtitle: "Ações + coaching",
    },
    {
      title: "Horas totais",
      value: fmtHours(kpis.horasTotais),
      subtitle: "Aplicadas no mapa",
    },
  ];

  return (
    <PortalShell
      title="Mapa de Desenvolvimento"
      subtitle="Painel executivo de jornadas, entregas, intervenções e evolução do desenvolvimento."
    >
      <div style={{ display: "grid", gap: 18 }}>
        <section style={heroWrap}>
          <div style={heroLeft}>
            <div style={heroEyebrow}>Command Center</div>
            <h2 style={heroTitle}>Gestão integrada do desenvolvimento com leitura de fluxo, execução e intervenção.</h2>
            <p style={heroText}>
              Consolidação das jornadas, etapas, ações e coachings em uma visão única de acompanhamento gerencial, priorização e monitoramento.
            </p>

            <div style={tabBar}>
              {[
                ["geral", "Visão Geral"],
                ["jornadas", "Jornadas"],
                ["acoes", "Ações do Mapa"],
                ["coaching", "Coaching"],
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
          </div>

          <div style={heroRight}>
            <div style={orbCard}>
              <div style={orbHeader}>Pulso do Mapa</div>
              <div style={orbValue}>{fmtNumber(kpis.jornadas)}</div>
              <div style={orbSub}>jornadas monitoradas</div>
            </div>

            <div style={signalGrid}>
              {destaqueCards.map((item) => (
                <div key={item.title} style={signalCard}>
                  <div style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 800, textTransform: "uppercase" }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginTop: 4 }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 2 }}>{item.subtitle}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionCard
          title="Leitura Estratégica"
          subtitle="Leitura consolidada do ecossistema de desenvolvimento."
        >
          <div style={kpiGrid}>
            <StatCard title="Jornadas" value={fmtNumber(kpis.jornadas)} accent="#2563eb" />
            <StatCard title="Etapas" value={fmtNumber(kpis.etapas)} accent="#0f766e" />
            <StatCard title="Ações" value={fmtNumber(kpis.acoes)} accent="#7c3aed" />
            <StatCard title="Coachings" value={fmtNumber(kpis.coachings)} accent="#ea580c" />
            <StatCard title="Participantes impactados" value={fmtNumber(kpis.participantes)} accent="#16a34a" />
            <StatCard title="Horas aplicadas" value={fmtHours(kpis.horasTotais)} accent="#b45309" />
          </div>
        </SectionCard>

        <SectionCard
          title="Filtros Gerenciais"
          subtitle="Aplicação de filtros sobre jornadas, etapas, entregas e intervenções."
          action={
            <button
              style={buttonSecondaryStyle()}
              onClick={() =>
                setFilters({
                  jornada_id: "",
                  etapa_id: "",
                  tipo: "",
                  status: "",
                  responsavel_id: "",
                  busca: "",
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
                onChange={(e) => setFilters((prev) => ({ ...prev, jornada_id: e.target.value, etapa_id: "" }))}
                style={inputStyle()}
              >
                <option value="">Todas</option>
                {jornadas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle()}>
              Etapa
              <select
                value={filters.etapa_id}
                onChange={(e) => setFilters((prev) => ({ ...prev, etapa_id: e.target.value }))}
                style={inputStyle()}
              >
                <option value="">Todas</option>
                {etapasOrdenadas
                  .filter((e) => !filters.jornada_id || String(e.jornada_id) === String(filters.jornada_id))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                    </option>
                  ))}
              </select>
            </label>

            <label style={labelStyle()}>
              Tipo
              <select
                value={filters.tipo}
                onChange={(e) => setFilters((prev) => ({ ...prev, tipo: e.target.value }))}
                style={inputStyle()}
              >
                {TIPO_OPTIONS.map((item) => (
                  <option key={item.value || "all"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle()}>
              Status
              <select
                value={filters.status}
                onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                style={inputStyle()}
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.value || "all"} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle()}>
              Responsável
              <select
                value={filters.responsavel_id}
                onChange={(e) => setFilters((prev) => ({ ...prev, responsavel_id: e.target.value }))}
                style={inputStyle()}
              >
                <option value="">Todos</option>
                {usuarios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...labelStyle(), gridColumn: "span 2" }}>
              Busca
              <input
                value={filters.busca}
                onChange={(e) => setFilters((prev) => ({ ...prev, busca: e.target.value }))}
                placeholder="Jornada, etapa, tema, público, responsável..."
                style={inputStyle()}
              />
            </label>
          </div>

          {(erro || notice) && (
            <div style={{ marginTop: 14 }}>
              {erro ? <div style={errorAlert}>{erro}</div> : null}
              {notice ? <div style={{ ...successAlert, marginTop: erro ? 10 : 0 }}>{notice}</div> : null}
            </div>
          )}
        </SectionCard>

        {activeTab === "geral" && (
          <SectionCard
            title="Visão Geral"
            subtitle="Leitura consolidada das entregas, intervenções, prioridades e prazos."
          >
            {loading ? (
              emptyCard("Carregando visão geral...")
            ) : overviewRows.length === 0 ? (
              emptyCard("Nenhum registro encontrado.")
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                <div style={overviewStripe}>
                  <OverviewBox label="Itens em andamento" value={fmtNumber(executiveAlerts.emAndamento)} />
                  <OverviewBox label="Pendências críticas" value={fmtNumber(executiveAlerts.criticos)} tone="alert" />
                  <OverviewBox label="Sem responsável" value={fmtNumber(executiveAlerts.semResponsavel)} tone="alert" />
                  <OverviewBox label="Prazos vencidos" value={fmtNumber(executiveAlerts.vencidos)} tone="danger" />
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Jornada</th>
                        <th style={thStyle}>Etapa</th>
                        <th style={thStyle}>Título</th>
                        <th style={thStyle}>Tipo</th>
                        <th style={thStyle}>Público</th>
                        <th style={thStyle}>Responsável</th>
                        <th style={thStyle}>Horas</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Prazo</th>
                        <th style={thStyle}>Atenção</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overviewRows.map((item) => (
                        <tr key={`${item.tipo_registro}-${item.id}`} style={rowTone(item)}>
                          <td style={tdStyle}>{item.jornada_nome}</td>
                          <td style={tdStyle}>{item.etapa_nome}</td>
                          <td style={tdStyle}><strong>{item.titulo}</strong></td>
                          <td style={tdStyle}>
                            {item.tipo_registro === "coaching" ? (
                              <>
                                <span style={badgeStyle("coaching")}>coaching</span> {item.tipo_coaching}
                              </>
                            ) : (
                              item.tipo_acao
                            )}
                          </td>
                          <td style={tdStyle}>{item.publico_alvo || "—"}</td>
                          <td style={tdStyle}>{item.responsavel_nome}</td>
                          <td style={tdStyle}>{fmtHours(item.horas)}</td>
                          <td style={tdStyle}>
                            <span style={badgeStyle(item.status)}>{displayStatus(item.status)}</span>
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display: "grid", gap: 6 }}>
                              <span style={prazoBadge(item.prazo_info.tone)}>{item.prazo_info.label}</span>
                              <span style={{ fontSize: 12, color: "#64748b" }}>
                                {formatDate(item.data_inicio)} até {formatDate(item.data_fim)}
                              </span>
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <span style={attentionBadge(item.attention_info.level)}>
                              {item.attention_info.label}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SectionCard>
        )}

        {activeTab === "jornadas" && (
          <>
            <SectionCard title="Arquitetura dos Fluxos" subtitle="Estrutura, monitoramento e saúde dos fluxos de desenvolvimento.">
              <details open style={detailsCard}>
                <summary style={detailsSummary}>Registro de jornada</summary>
                <form onSubmit={saveJornada} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                  <div style={formGrid}>
                    <label style={{ ...labelStyle(), ...fieldSpan.xxl }}>
                      Nome da jornada
                      <input
                        value={jornadaForm.nome}
                        onChange={(e) => setJornadaForm((prev) => ({ ...prev, nome: e.target.value }))}
                        style={compactInputStyle()}
                        required
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Status
                      <select
                        value={jornadaForm.status}
                        onChange={(e) => setJornadaForm((prev) => ({ ...prev, status: e.target.value }))}
                        style={compactInputStyle()}
                      >
                        <option value="ativo">Ativo</option>
                        <option value="inativo">Inativo</option>
                        <option value="concluido">Concluído</option>
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Responsável
                      <select
                        value={jornadaForm.responsavel_id}
                        onChange={(e) => setJornadaForm((prev) => ({ ...prev, responsavel_id: e.target.value }))}
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

                    <label style={{ ...labelStyle(), ...fieldSpan.xl }}>
                      Público macro
                      <input
                        value={jornadaForm.publico_macro}
                        onChange={(e) => setJornadaForm((prev) => ({ ...prev, publico_macro: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Data início
                      <input
                        type="date"
                        value={jornadaForm.data_inicio}
                        onChange={(e) => setJornadaForm((prev) => ({ ...prev, data_inicio: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Data fim
                      <input
                        type="date"
                        value={jornadaForm.data_fim}
                        onChange={(e) => setJornadaForm((prev) => ({ ...prev, data_fim: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>
                  </div>

                  <label style={{ ...labelStyle(), ...fieldSpan.full }}>
                    Objetivo macro
                    <textarea
                      value={jornadaForm.objetivo}
                      onChange={(e) => setJornadaForm((prev) => ({ ...prev, objetivo: e.target.value }))}
                      style={textareaStyle(88)}
                    />
                  </label>

                  <label style={{ ...labelStyle(), ...fieldSpan.full }}>
                    Descrição
                    <textarea
                      value={jornadaForm.descricao}
                      onChange={(e) => setJornadaForm((prev) => ({ ...prev, descricao: e.target.value }))}
                      style={textareaStyle(92)}
                    />
                  </label>

                  <label style={{ ...labelStyle(), ...fieldSpan.full }}>
                    Observações
                    <textarea
                      value={jornadaForm.observacoes}
                      onChange={(e) => setJornadaForm((prev) => ({ ...prev, observacoes: e.target.value }))}
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
                        setJornadaForm(jornadaInicial);
                        setErro("");
                        setNotice("");
                      }}
                    >
                      Limpar
                    </button>
                  </div>
                </form>
              </details>

              <details style={{ ...detailsCard, marginTop: 14 }} open>
                <summary style={detailsSummary}>Registro de etapa</summary>
                <form onSubmit={saveEtapa} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                  <div style={formGrid}>
                    <label style={{ ...labelStyle(), ...fieldSpan.xl }}>
                      Jornada
                      <select
                        value={etapaForm.jornada_id}
                        onChange={(e) => setEtapaForm((prev) => ({ ...prev, jornada_id: e.target.value }))}
                        style={compactInputStyle()}
                        required
                      >
                        <option value="">Selecione</option>
                        {jornadas.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.xxl }}>
                      Nome da etapa
                      <input
                        value={etapaForm.nome}
                        onChange={(e) => setEtapaForm((prev) => ({ ...prev, nome: e.target.value }))}
                        style={compactInputStyle()}
                        required
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Tipo
                      <select
                        value={etapaForm.tipo}
                        onChange={(e) => setEtapaForm((prev) => ({ ...prev, tipo: e.target.value }))}
                        style={compactInputStyle()}
                      >
                        <option value="treinamento">Treinamento</option>
                        <option value="acao">Ação</option>
                        <option value="coaching">Coaching</option>
                        <option value="workshop">Workshop</option>
                        <option value="campanha">Campanha</option>
                        <option value="marco">Marco gerencial</option>
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Ordem
                      <input
                        type="number"
                        value={etapaForm.ordem}
                        onChange={(e) => setEtapaForm((prev) => ({ ...prev, ordem: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Status
                      <select
                        value={etapaForm.status}
                        onChange={(e) => setEtapaForm((prev) => ({ ...prev, status: e.target.value }))}
                        style={compactInputStyle()}
                      >
                        <option value="planejado">Planejado</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="concluido">Concluído</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Responsável
                      <select
                        value={etapaForm.responsavel_id}
                        onChange={(e) => setEtapaForm((prev) => ({ ...prev, responsavel_id: e.target.value }))}
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
                      Data início
                      <input
                        type="date"
                        value={etapaForm.data_inicio}
                        onChange={(e) => setEtapaForm((prev) => ({ ...prev, data_inicio: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Data fim
                      <input
                        type="date"
                        value={etapaForm.data_fim}
                        onChange={(e) => setEtapaForm((prev) => ({ ...prev, data_fim: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Carga horária prevista
                      <input
                        type="number"
                        step="0.01"
                        value={etapaForm.carga_horaria_prevista}
                        onChange={(e) => setEtapaForm((prev) => ({ ...prev, carga_horaria_prevista: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Carga horária realizada
                      <input
                        type="number"
                        step="0.01"
                        value={etapaForm.carga_horaria_realizada}
                        onChange={(e) => setEtapaForm((prev) => ({ ...prev, carga_horaria_realizada: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>
                  </div>

                  <label style={{ ...labelStyle(), ...fieldSpan.full }}>
                    Objetivo da etapa
                    <textarea
                      value={etapaForm.objetivo}
                      onChange={(e) => setEtapaForm((prev) => ({ ...prev, objetivo: e.target.value }))}
                      style={textareaStyle(88)}
                    />
                  </label>

                  <label style={{ ...labelStyle(), ...fieldSpan.full }}>
                    Descrição
                    <textarea
                      value={etapaForm.descricao}
                      onChange={(e) => setEtapaForm((prev) => ({ ...prev, descricao: e.target.value }))}
                      style={textareaStyle(92)}
                    />
                  </label>

                  <label style={{ ...labelStyle(), ...fieldSpan.full }}>
                    Observações
                    <textarea
                      value={etapaForm.observacoes}
                      onChange={(e) => setEtapaForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                      style={textareaStyle(92)}
                    />
                  </label>

                  <div style={buttonRow}>
                    <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
                      {etapaForm.id ? "Atualizar etapa" : "Salvar etapa"}
                    </button>
                    <button
                      type="button"
                      style={buttonSecondaryStyle()}
                      onClick={() => {
                        setEtapaForm(etapaInicial);
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
              title="Painel Executivo das Jornadas"
              subtitle="Acompanhamento executivo das jornadas, etapas e pontos de atenção."
            >
              {loading ? (
                emptyCard("Carregando jornadas...")
              ) : filteredJornadas.length === 0 ? (
                emptyCard("Nenhuma jornada encontrada.")
              ) : (
                <div style={{ display: "grid", gap: 16 }}>
                  {filteredJornadas.map((jornada) => {
                    const etapasDaJornada = filteredEtapas.filter(
                      (e) => String(e.jornada_id) === String(jornada.id)
                    );

                    return (
                      <div key={jornada.id} style={flowCard}>
                        <div style={flowHeader}>
                          <div style={{ display: "grid", gap: 6 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                              <span style={badgeStyle(jornada.status)}>{displayStatus(jornada.status)}</span>
                              <span style={attentionBadge(jornada.saude_info.level)}>{jornada.saude_info.label}</span>
                              <span style={prazoBadge(jornada.prazo_info.tone)}>{jornada.prazo_info.label}</span>
                              <span style={attentionBadge(jornada.attention_info.level)}>{jornada.attention_info.label}</span>
                            </div>
                            <div style={flowTitle}>{jornada.nome}</div>
                            <div style={flowMeta}>
                              Responsável: {jornada.responsavel_nome} • Início: {formatDate(jornada.data_inicio)} • Fim: {formatDate(jornada.data_fim)}
                            </div>
                          </div>

                          <div style={flowMetrics}>
                            <MetricBox label="Etapas" value={fmtNumber(jornada.total_etapas)} />
                            <MetricBox label="Ações" value={fmtNumber(jornada.total_acoes)} />
                            <MetricBox label="Coachings" value={fmtNumber(jornada.total_coachings)} />
                            <MetricBox label="Horas" value={fmtHours(jornada.horas_totais)} />
                          </div>
                        </div>

                        <div style={flowExecutiveBand}>
                          <OverviewBox label="Saúde da jornada" value={jornada.saude_info.label} tone={jornada.saude_info.level === "alta" ? "danger" : jornada.saude_info.level === "media" ? "alert" : "default"} />
                          <OverviewBox label="Atenção principal" value={jornada.attention_info.label} tone={jornada.attention_info.level === "alta" ? "danger" : jornada.attention_info.level === "media" ? "alert" : "default"} />
                          <OverviewBox label="Prazo" value={jornada.prazo_info.label} tone={jornada.prazo_info.tone === "danger" ? "danger" : jornada.prazo_info.tone === "neutral" ? "default" : "default"} />
                          <OverviewBox label="Etapa crítica" value={jornada.etapa_critica?.nome || "Sem destaque"} tone={jornada.etapa_critica?.saude_info?.level === "alta" ? "danger" : jornada.etapa_critica?.saude_info?.level === "media" ? "alert" : "default"} />
                        </div>

                        <div style={flowDescription}>
                          {jornada.objetivo || jornada.descricao || "Sem descrição cadastrada."}
                        </div>

                        <div style={riverTrack}>
                          {etapasDaJornada.length === 0 ? (
                            <div style={emptyTimeline}>Sem etapas cadastradas para esta jornada.</div>
                          ) : (
                            etapasDaJornada.map((etapa, index) => {
                              const prazo = getPrazoInfo(etapa);
                              const stageAttention =
                                !etapa.responsavel_id
                                  ? { level: "media", label: "Sem responsável" }
                                  : prazo.tone === "danger"
                                  ? { level: "alta", label: "Prazo vencido" }
                                  : { level: "ok", label: "Estável" };
                              const stageHealth = getStageHealth({
                                ...etapa,
                                prazo_info: prazo,
                                attention_info: stageAttention,
                              });

                              return (
                                <div key={etapa.id} style={stageWrap}>
                                  <div style={stageConnector(index < etapasDaJornada.length - 1)} />
                                  <div style={stageCard}>
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                      <span style={timelineOrder}>{etapa.ordem || index + 1}</span>
                                      <span style={badgeStyle(etapa.status)}>{displayStatus(etapa.status)}</span>
                                      <span style={badgeStyle(etapa.tipo)}>{etapa.tipo}</span>
                                      <span style={attentionBadge(stageHealth.level)}>{stageHealth.label}</span>
                                      <span style={prazoBadge(prazo.tone)}>{prazo.label}</span>
                                    </div>

                                    <div style={stageTitle}>{etapa.nome}</div>
                                    <div style={stageMeta}>
                                      {formatDate(etapa.data_inicio)} até {formatDate(etapa.data_fim)}
                                    </div>

                                    <div style={stageStats}>
                                      <span>{fmtNumber(etapa.total_acoes)} ação(ões)</span>
                                      <span>{fmtNumber(etapa.total_coachings)} coaching(s)</span>
                                      <span>{fmtHours(etapa.horas_totais)}h</span>
                                    </div>

                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                                      <button style={buttonSecondaryStyle()} onClick={() => editEtapa(etapa)}>
                                        Editar etapa
                                      </button>
                                      <button style={buttonDangerStyle()} onClick={() => removeRegistro("etapa", etapa.id)}>
                                        Excluir
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>

                        <div style={buttonRow}>
                          <button style={buttonSecondaryStyle()} onClick={() => editJornada(jornada)}>
                            Editar jornada
                          </button>
                          <button style={buttonDangerStyle()} onClick={() => removeRegistro("jornada", jornada.id)}>
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

        {activeTab === "acoes" && (
          <>
            <SectionCard title="Consolidação das Entregas" subtitle="Gestão tática das entregas vinculadas ao mapa de desenvolvimento.">
              <details open style={detailsCard}>
                <summary style={detailsSummary}>Registro de ação</summary>
                <form onSubmit={saveAcao} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                  <div style={formGrid}>
                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Jornada
                      <select
                        value={acaoForm.jornada_id}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({
                            ...prev,
                            jornada_id: e.target.value,
                            etapa_id: "",
                          }))
                        }
                        style={compactInputStyle()}
                        required
                      >
                        <option value="">Selecione</option>
                        {jornadas.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Etapa da jornada
                      <select
                        value={acaoForm.etapa_id}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, etapa_id: e.target.value }))}
                        style={compactInputStyle()}
                      >
                        <option value="">Sem etapa</option>
                        {etapasOrdenadas
                          .filter((e) => !acaoForm.jornada_id || String(e.jornada_id) === String(acaoForm.jornada_id))
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.nome}
                            </option>
                          ))}
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Tipo de ação
                      <select
                        value={acaoForm.tipo_acao}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, tipo_acao: e.target.value }))}
                        style={compactInputStyle()}
                      >
                        <option value="treinamento">Treinamento</option>
                        <option value="campanha">Campanha</option>
                        <option value="reciclagem">Reciclagem</option>
                        <option value="integracao">Integração</option>
                        <option value="workshop">Workshop</option>
                        <option value="acao_estrategica">Ação estratégica</option>
                        <option value="outro">Outro</option>
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.xl }}>
                      Título/Tema
                      <input
                        value={acaoForm.tema}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, tema: e.target.value }))}
                        style={compactInputStyle()}
                        required
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Subtipo
                      <input
                        value={acaoForm.subtipo}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, subtipo: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Público-alvo
                      <input
                        value={acaoForm.publico_alvo}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, publico_alvo: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Obrigatória?
                      <select
                        value={acaoForm.obrigatoria}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, obrigatoria: e.target.value }))}
                        style={compactInputStyle()}
                      >
                        <option value={0}>Não</option>
                        <option value={1}>Sim</option>
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Carga horária
                      <input
                        type="number"
                        step="0.01"
                        value={acaoForm.carga_horaria}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, carga_horaria: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Participantes previstos
                      <input
                        type="number"
                        value={acaoForm.participantes_previstos}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, participantes_previstos: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Participantes realizados
                      <input
                        type="number"
                        value={acaoForm.participantes_realizados}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, participantes_realizados: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Turmas / sessões
                      <input
                        type="number"
                        value={acaoForm.quantidade_turmas_sessoes}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, quantidade_turmas_sessoes: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Horas planejadas
                      <input
                        type="number"
                        step="0.01"
                        value={acaoForm.horas_planejadas}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, horas_planejadas: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Horas realizadas
                      <input
                        type="number"
                        step="0.01"
                        value={acaoForm.horas_realizadas}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, horas_realizadas: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Status
                      <select
                        value={acaoForm.status}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, status: e.target.value }))}
                        style={compactInputStyle()}
                      >
                        <option value="planejado">Planejado</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="concluido">Concluído</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Responsável
                      <select
                        value={acaoForm.responsavel_id}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, responsavel_id: e.target.value }))}
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
                      Data início
                      <input
                        type="date"
                        value={acaoForm.data_inicio}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, data_inicio: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Data fim
                      <input
                        type="date"
                        value={acaoForm.data_fim}
                        onChange={(e) => setAcaoForm((prev) => ({ ...prev, data_fim: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>
                  </div>

                  <label style={{ ...labelStyle(), ...fieldSpan.full }}>
                    Descrição
                    <textarea
                      value={acaoForm.descricao}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, descricao: e.target.value }))}
                      style={textareaStyle(96)}
                    />
                  </label>

                  <div style={buttonRow}>
                    <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
                      {acaoForm.id ? "Atualizar ação" : "Salvar ação"}
                    </button>
                    <button
                      type="button"
                      style={buttonSecondaryStyle()}
                      onClick={() => {
                        setAcaoForm(acaoInicial);
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
              title="Painel Executivo das Ações"
              subtitle="Execução, criticidade, intensidade e prazo das ações planejadas."
            >
              {loading ? (
                emptyCard("Carregando ações...")
              ) : orderedAcoes.length === 0 ? (
                emptyCard("Nenhuma ação encontrada.")
              ) : (
                <>
                  <div style={actionBand}>
                    <OverviewBox label="Em andamento" value={fmtNumber(actionExecutive.emAndamento)} />
                    <OverviewBox label="Concluídas" value={fmtNumber(actionExecutive.concluidas)} />
                    <OverviewBox label="Sem responsável" value={fmtNumber(actionExecutive.semResponsavel)} tone="alert" />
                    <OverviewBox label="Vencidas" value={fmtNumber(actionExecutive.vencidas)} tone="danger" />
                    <OverviewBox label="Críticas" value={fmtNumber(actionExecutive.criticas)} tone="danger" />
                    <OverviewBox label="Horas" value={fmtHours(actionExecutive.horas)} />
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Jornada</th>
                          <th style={thStyle}>Etapa</th>
                          <th style={thStyle}>Tema</th>
                          <th style={thStyle}>Tipo</th>
                          <th style={thStyle}>Público</th>
                          <th style={thStyle}>Horas</th>
                          <th style={thStyle}>Intensidade</th>
                          <th style={thStyle}>Status</th>
                          <th style={thStyle}>Prazo</th>
                          <th style={thStyle}>Atenção</th>
                          <th style={thStyle}>Responsável</th>
                          <th style={thStyle}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderedAcoes.map((item) => (
                          <tr key={item.id} style={rowTone(item)}>
                            <td style={tdStyle}>{item.jornada_nome}</td>
                            <td style={tdStyle}>{item.etapa_nome}</td>
                            <td style={tdStyle}><strong>{item.tema}</strong></td>
                            <td style={tdStyle}>{item.tipo_acao}</td>
                            <td style={tdStyle}>{item.publico_alvo || "—"}</td>
                            <td style={tdStyle}>{fmtHours(item.horas_realizadas_calc)}</td>
                            <td style={tdStyle}>
                              <span style={prazoBadge(item.intensidade_info.tone)}>{item.intensidade_info.label}</span>
                            </td>
                            <td style={tdStyle}>
                              <span style={badgeStyle(item.status)}>{displayStatus(item.status)}</span>
                            </td>
                            <td style={tdStyle}>
                              <div style={{ display: "grid", gap: 6 }}>
                                <span style={prazoBadge(item.prazo_info.tone)}>{item.prazo_info.label}</span>
                                <span style={{ fontSize: 12, color: "#64748b" }}>
                                  {formatDate(item.data_inicio)} até {formatDate(item.data_fim)}
                                </span>
                              </div>
                            </td>
                            <td style={tdStyle}>
                              <span style={attentionBadge(item.attention_info.level)}>
                                {item.attention_info.label}
                              </span>
                            </td>
                            <td style={tdStyle}>{item.responsavel_nome}</td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button style={buttonSecondaryStyle()} onClick={() => editAcao(item)}>
                                  Editar
                                </button>
                                <button style={buttonDangerStyle()} onClick={() => removeRegistro("acao", item.id)}>
                                  Excluir
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </SectionCard>
          </>
        )}

        {activeTab === "coaching" && (
          <>
            <SectionCard title="Panorama de Intervenções" subtitle="Gestão das intervenções de coaching vinculadas ou independentes do fluxo.">
              <details open style={{ ...detailsCard, borderColor: "#c7d2fe", background: "#f8faff" }}>
                <summary style={{ ...detailsSummary, color: "#3730a3" }}>Registro de coaching</summary>
                <form onSubmit={saveCoaching} style={{ display: "grid", gap: 12, marginTop: 14 }}>
                  <div style={formGrid}>
                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Jornada (opcional)
                      <select
                        value={coachingForm.jornada_id}
                        onChange={(e) =>
                          setCoachingForm((prev) => ({
                            ...prev,
                            jornada_id: e.target.value,
                            etapa_id: "",
                          }))
                        }
                        style={compactInputStyle()}
                      >
                        <option value="">Independente</option>
                        {jornadas.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Etapa (opcional)
                      <select
                        value={coachingForm.etapa_id}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, etapa_id: e.target.value }))}
                        style={compactInputStyle()}
                      >
                        <option value="">Sem etapa</option>
                        {etapasOrdenadas
                          .filter((e) => !coachingForm.jornada_id || String(e.jornada_id) === String(coachingForm.jornada_id))
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.nome}
                            </option>
                          ))}
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Ação vinculada (opcional)
                      <select
                        value={coachingForm.acao_id}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, acao_id: e.target.value }))}
                        style={compactInputStyle()}
                      >
                        <option value="">Sem ação</option>
                        {acoesOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.tema}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Tipo de coaching
                      <select
                        value={coachingForm.tipo_coaching}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, tipo_coaching: e.target.value }))}
                        style={compactInputStyle()}
                      >
                        <option value="coordenacao">Coordenação</option>
                        <option value="gerencia">Gerência</option>
                        <option value="performance">Performance</option>
                        <option value="desenvolvimento">Desenvolvimento</option>
                        <option value="individual">Individual</option>
                        <option value="grupo">Grupo</option>
                        <option value="outro">Outro</option>
                      </select>
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.xl }}>
                      Título
                      <input
                        value={coachingForm.titulo}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, titulo: e.target.value }))}
                        style={compactInputStyle()}
                        required
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Público-alvo
                      <input
                        value={coachingForm.publico_alvo}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, publico_alvo: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                      Responsável
                      <select
                        value={coachingForm.responsavel_id}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, responsavel_id: e.target.value }))}
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

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Participantes previstos
                      <input
                        type="number"
                        value={coachingForm.participantes_previstos}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, participantes_previstos: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Participantes realizados
                      <input
                        type="number"
                        value={coachingForm.participantes_realizados}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, participantes_realizados: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Sessões previstas
                      <input
                        type="number"
                        value={coachingForm.sessoes_previstas}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, sessoes_previstas: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Sessões realizadas
                      <input
                        type="number"
                        value={coachingForm.sessoes_realizadas}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, sessoes_realizadas: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Carga horária por sessão
                      <input
                        type="number"
                        step="0.01"
                        value={coachingForm.carga_horaria_sessao}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, carga_horaria_sessao: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.sm }}>
                      Horas totais
                      <input
                        type="number"
                        step="0.01"
                        value={coachingForm.horas_totais}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, horas_totais: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Status
                      <select
                        value={coachingForm.status}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, status: e.target.value }))}
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
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, data_inicio: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>

                    <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                      Data fim
                      <input
                        type="date"
                        value={coachingForm.data_fim}
                        onChange={(e) => setCoachingForm((prev) => ({ ...prev, data_fim: e.target.value }))}
                        style={compactInputStyle()}
                      />
                    </label>
                  </div>

                  <label style={{ ...labelStyle(), ...fieldSpan.full }}>
                    Objetivo
                    <textarea
                      value={coachingForm.objetivo}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, objetivo: e.target.value }))}
                      style={textareaStyle(96)}
                    />
                  </label>

                  <div style={buttonRow}>
                    <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
                      {coachingForm.id ? "Atualizar coaching" : "Salvar coaching"}
                    </button>
                    <button
                      type="button"
                      style={buttonSecondaryStyle()}
                      onClick={() => {
                        setCoachingForm(coachingInicial);
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
              title="Painel Executivo de Coaching"
              subtitle="Radar executivo das intervenções, criticidade, intensidade e prazo."
            >
              {loading ? (
                emptyCard("Carregando coachings...")
              ) : orderedCoachings.length === 0 ? (
                emptyCard("Nenhum coaching encontrado.")
              ) : (
                <>
                  <div style={coachingBand}>
                    <OverviewBox label="Em andamento" value={fmtNumber(coachingExecutive.emAndamento)} tone="coaching" />
                    <OverviewBox label="Concluídos" value={fmtNumber(coachingExecutive.concluidos)} tone="coaching" />
                    <OverviewBox label="Independentes" value={fmtNumber(coachingExecutive.independentes)} tone="coaching" />
                    <OverviewBox label="Sem responsável" value={fmtNumber(coachingExecutive.semResponsavel)} tone="alert" />
                    <OverviewBox label="Vencidos" value={fmtNumber(coachingExecutive.vencidos)} tone="danger" />
                    <OverviewBox label="Críticos" value={fmtNumber(coachingExecutive.criticos)} tone="danger" />
                    <OverviewBox label="Horas" value={fmtHours(coachingExecutive.horas)} tone="coaching" />
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={tableStyle}>
                      <thead>
                        <tr>
                          <th style={thStyle}>Jornada</th>
                          <th style={thStyle}>Etapa</th>
                          <th style={thStyle}>Ação</th>
                          <th style={thStyle}>Título</th>
                          <th style={thStyle}>Tipo</th>
                          <th style={thStyle}>Horas</th>
                          <th style={thStyle}>Intensidade</th>
                          <th style={thStyle}>Status</th>
                          <th style={thStyle}>Prazo</th>
                          <th style={thStyle}>Atenção</th>
                          <th style={thStyle}>Responsável</th>
                          <th style={thStyle}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderedCoachings.map((item) => (
                          <tr key={item.id} style={rowTone(item)}>
                            <td style={tdStyle}>{item.jornada_nome}</td>
                            <td style={tdStyle}>{item.etapa_nome}</td>
                            <td style={tdStyle}>{item.acao_nome}</td>
                            <td style={tdStyle}><strong>{item.titulo}</strong></td>
                            <td style={tdStyle}>
                              <span style={badgeStyle("coaching")}>coaching</span> {item.tipo_coaching}
                            </td>
                            <td style={tdStyle}>{fmtHours(item.horas_totais_calc)}</td>
                            <td style={tdStyle}>
                              <span style={prazoBadge(item.intensidade_info.tone)}>{item.intensidade_info.label}</span>
                            </td>
                            <td style={tdStyle}>
                              <span style={badgeStyle(item.status)}>{displayStatus(item.status)}</span>
                            </td>
                            <td style={tdStyle}>
                              <div style={{ display: "grid", gap: 6 }}>
                                <span style={prazoBadge(item.prazo_info.tone)}>{item.prazo_info.label}</span>
                                <span style={{ fontSize: 12, color: "#64748b" }}>
                                  {formatDate(item.data_inicio)} até {formatDate(item.data_fim)}
                                </span>
                              </div>
                            </td>
                            <td style={tdStyle}>
                              <span style={attentionBadge(item.attention_info.level)}>
                                {item.attention_info.label}
                              </span>
                            </td>
                            <td style={tdStyle}>{item.responsavel_nome}</td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button style={buttonSecondaryStyle()} onClick={() => editCoaching(item)}>
                                  Editar
                                </button>
                                <button style={buttonDangerStyle()} onClick={() => removeRegistro("coaching", item.id)}>
                                  Excluir
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </PortalShell>
  );
}

function rowTone(item) {
  if (item.attention_info?.level === "alta") {
    return { background: "#fff7f7" };
  }
  if (item.status_canonico === "em_andamento") {
    return { background: "#fffdfa" };
  }
  if (item.tipo_registro === "coaching" && !item.jornada_id) {
    return { background: "#fafaff" };
  }
  return undefined;
}

function MetricBox({ label, value }) {
  return (
    <div style={metricBox}>
      <div style={metricLabel}>{label}</div>
      <div style={metricValue}>{value}</div>
    </div>
  );
}

function OverviewBox({ label, value, tone = "default" }) {
  return (
    <div style={overviewBox(tone)}>
      <div style={overviewLabel}>{label}</div>
      <div style={overviewValue}>{value}</div>
    </div>
  );
}

const heroWrap = {
  display: "grid",
  gridTemplateColumns: "1.4fr .9fr",
  gap: 16,
  padding: 20,
  borderRadius: 24,
  background:
    "radial-gradient(circle at top left, rgba(37,99,235,.18), transparent 32%), linear-gradient(135deg, #0f172a 0%, #111827 45%, #1e293b 100%)",
  color: "#fff",
  border: "1px solid rgba(148,163,184,.18)",
  boxShadow: "0 18px 40px rgba(15,23,42,.16)",
};

const heroLeft = {
  display: "grid",
  gap: 10,
  alignContent: "start",
};

const heroEyebrow = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".12em",
  color: "#93c5fd",
};

const heroTitle = {
  fontSize: 30,
  lineHeight: 1.1,
  fontWeight: 900,
  margin: 0,
};

const heroText = {
  margin: 0,
  color: "#cbd5e1",
  lineHeight: 1.55,
  maxWidth: 720,
};

const tabBar = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 8,
};

const tabButton = (active) => ({
  border: active ? "1px solid rgba(147,197,253,.45)" : "1px solid rgba(148,163,184,.22)",
  background: active ? "rgba(59,130,246,.16)" : "rgba(255,255,255,.04)",
  color: active ? "#fff" : "#cbd5e1",
  borderRadius: 999,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
  backdropFilter: "blur(6px)",
});

const heroRight = {
  display: "grid",
  gap: 12,
};

const orbCard = {
  borderRadius: 22,
  padding: 18,
  background: "linear-gradient(180deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,.04) 100%)",
  border: "1px solid rgba(148,163,184,.24)",
};

const orbHeader = {
  fontSize: 12,
  fontWeight: 800,
  color: "#cbd5e1",
  textTransform: "uppercase",
};

const orbValue = {
  fontSize: 54,
  lineHeight: 1,
  fontWeight: 900,
  marginTop: 8,
};

const orbSub = {
  fontSize: 13,
  color: "#cbd5e1",
  marginTop: 6,
};

const signalGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const signalCard = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(148,163,184,.18)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
  backdropFilter: "blur(6px)",
};

const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

const filtersPanel = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const errorAlert = {
  borderRadius: 12,
  padding: "12px 14px",
  background: "#fff1f2",
  color: "#b91c1c",
  border: "1px solid #fecdd3",
  fontWeight: 700,
};

const successAlert = {
  borderRadius: 12,
  padding: "12px 14px",
  background: "#ecfeff",
  color: "#155e75",
  border: "1px solid #a5f3fc",
  fontWeight: 700,
};

const overviewStripe = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const overviewBox = (tone) => {
  const tones = {
    default: { background: "#ffffff", border: "#e2e8f0" },
    coaching: { background: "#eef2ff", border: "#c7d2fe" },
    alert: { background: "#fff7ed", border: "#fed7aa" },
    danger: { background: "#fff1f2", border: "#fecaca" },
  };
  const current = tones[tone] || tones.default;
  return {
    borderRadius: 18,
    padding: 16,
    background: current.background,
    border: `1px solid ${current.border}`,
    boxShadow: "0 8px 18px rgba(15,23,42,.04)",
  };
};

const overviewLabel = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const overviewValue = {
  fontSize: 24,
  color: "#0f172a",
  fontWeight: 900,
  marginTop: 6,
  lineHeight: 1.15,
};

const detailsCard = {
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  background: "#ffffff",
  padding: 14,
};

const detailsSummary = {
  cursor: "pointer",
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 15,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  gap: 14,
  alignItems: "end",
};

const fieldSpan = {
  full: { gridColumn: "span 12" },
  xxl: { gridColumn: "span 6" },
  xl: { gridColumn: "span 5" },
  lg: { gridColumn: "span 4" },
  md: { gridColumn: "span 3" },
  sm: { gridColumn: "span 2" },
};

const buttonRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const flowCard = {
  borderRadius: 24,
  border: "1px solid #dbeafe",
  background:
    "radial-gradient(circle at top right, rgba(59,130,246,.08), transparent 30%), linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  padding: 18,
  boxShadow: "0 12px 28px rgba(15,23,42,.05)",
  display: "grid",
  gap: 14,
};

const flowHeader = {
  display: "grid",
  gridTemplateColumns: "1.2fr .8fr",
  gap: 14,
  alignItems: "start",
};

const flowTitle = {
  fontSize: 22,
  fontWeight: 900,
  color: "#0f172a",
  lineHeight: 1.1,
  letterSpacing: "-0.02em",
};

const flowMeta = {
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.5,
};

const flowDescription = {
  fontSize: 14,
  color: "#475569",
  lineHeight: 1.55,
};

const flowMetrics = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const flowExecutiveBand = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const riverTrack = {
  display: "grid",
  gap: 12,
};

const stageWrap = {
  position: "relative",
  paddingLeft: 22,
};

const stageConnector = (show) => ({
  position: "absolute",
  left: 6,
  top: 22,
  bottom: show ? -18 : "auto",
  width: 2,
  background: show ? "#cbd5e1" : "transparent",
});

const stageCard = {
  border: "1px solid #dbeafe",
  background: "#f8fbff",
  borderRadius: 20,
  padding: 14,
  boxShadow: "0 6px 16px rgba(15,23,42,.03)",
};

const stageTitle = {
  fontSize: 17,
  fontWeight: 900,
  color: "#0f172a",
  marginTop: 8,
  letterSpacing: "-0.01em",
};

const stageMeta = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 12,
};

const stageStats = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  marginTop: 8,
  color: "#475569",
  fontSize: 12,
  fontWeight: 700,
};

const coachingBand = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const actionBand = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const metricBox = {
  minWidth: 96,
  padding: "8px 10px",
  borderRadius: 12,
  background: "#ffffff",
  border: "1px solid #e2e8f0",
};

const metricLabel = {
  fontSize: 10,
  color: "#64748b",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".03em",
};

const metricValue = {
  fontSize: 18,
  fontWeight: 800,
  color: "#0f172a",
  marginTop: 3,
  lineHeight: 1.2,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1500,
};

const thStyle = {
  textAlign: "left",
  padding: "13px 10px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "#64748b",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
  fontWeight: 800,
};

const tdStyle = {
  padding: "13px 10px",
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "top",
  color: "#0f172a",
  fontSize: 13,
  lineHeight: 1.45,
};

const emptyTimeline = {
  border: "1px dashed #cbd5e1",
  borderRadius: 14,
  padding: 14,
  color: "#64748b",
  background: "#f8fafc",
};

const timelineOrder = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 24,
  height: 24,
  borderRadius: "50%",
  background: "#2563eb",
  color: "#fff",
  fontSize: 12,
  fontWeight: 900,
};
