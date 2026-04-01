"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
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
    label: value || "Sustentação",
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
};

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
  status: "planejado",
  data_inicio: "",
  data_fim: "",
};

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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [notice, setNotice] = useState("");

  const [filters, setFilters] = useState({
    jornada_id: "",
    status: "",
    busca: "",
  });

  const [jornadaForm, setJornadaForm] = useState(journeyInitial);
  const [acaoForm, setAcaoForm] = useState(actionInitial);
  const [coachingForm, setCoachingForm] = useState(coachingInitial);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setErro("");

    try {
      const [jornadasData, acoesData, coachingsData, usuariosData] =
        await Promise.all([
          apiFetch("/jornadas-desenvolvimento").catch(() => []),
          apiFetch("/acoes-desenvolvimento").catch(() => []),
          apiFetch("/coaching-planos").catch(() => []),
          apiFetch("/usuarios").catch(() => []),
        ]);

      setJornadas(Array.isArray(jornadasData) ? jornadasData : []);
      setAcoes(Array.isArray(acoesData) ? acoesData : []);
      setCoachings(Array.isArray(coachingsData) ? coachingsData : []);
      setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
    } catch (error) {
      setErro(
        extrairMensagemErro(error, "Erro ao carregar o Mapa de Desenvolvimento.")
      );
    } finally {
      setLoading(false);
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
      setErro("A data fim da sustentação não pode ser menor que a data início.");
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
        status: coachingForm.status || "planejado",
        data_inicio: coachingForm.data_inicio || null,
        data_fim: coachingForm.data_fim || null,
      };

      if (coachingForm.id) {
        await apiFetch(`/coaching-planos/${coachingForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice("Sustentação atualizada com sucesso.");
      } else {
        await apiFetch("/coaching-planos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Sustentação registrada com sucesso.");
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
    setActiveTab("jornadas");
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
        horas_totais: horasTotais,
        prazo_info: getPrazoInfo(jornada),
        attention_info: getJourneyAttention(jornada, acoesDaJornada, coachingsDaJornada),
        status_canonico: canonicalStatus(jornada.status),
      };
    });
  }, [jornadas, acoes, coachings]);

  const acoesEnriquecidas = useMemo(() => {
    return acoes.map((acao) => {
      const jornada = jornadas.find((j) => String(j.id) === String(acao.jornada_id));

      return {
        ...acao,
        tema: acao.tema || acao.titulo,
        jornada_nome: jornada?.nome || jornada?.titulo || "Sem jornada",
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
        responsavel_nome:
          usuariosMap[String(item.responsavel_id)] || item.responsavel || "Não definido",
        prazo_info: getPrazoInfo(item),
        attention_info: getCoachingAttention(item),
        status_canonico: canonicalStatus(item.status),
      };
    });
  }, [coachings, jornadas, acoes, usuariosMap]);

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

      return matchJornada && matchStatus && matchBusca;
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

      return matchJornada && matchStatus && matchBusca;
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

      return matchJornada && matchStatus && matchBusca;
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
        "Estruturar os próximos trechos";

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

  const kpis = useMemo(() => {
    return {
      jornadas: filteredJornadas.length,
      acoes: filteredAcoes.length,
      coachings: filteredCoachings.length,
      participantes:
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

  const destaqueCards = [
    {
      title: "Rios monitorados",
      value: fmtNumber(kpis.jornadas),
      subtitle: "Jornadas em observação",
    },
    {
      title: "Portos de ação",
      value: fmtNumber(kpis.acoes),
      subtitle: "Ações do percurso",
    },
    {
      title: "Sustentações",
      value: fmtNumber(kpis.coachings),
      subtitle: "Coaching e mentoria",
    },
    {
      title: "Horas no oceano",
      value: fmtHours(kpis.horasTotais),
      subtitle: "Execução consolidada",
    },
  ];

  const acoesOptions = useMemo(() => {
    return [...acoesEnriquecidas].sort((a, b) =>
      String(a.tema || "").localeCompare(String(b.tema || ""), "pt-BR")
    );
  }, [acoesEnriquecidas]);
  return (
    <PortalShell
      title="Oceano do Desenvolvimento"
      subtitle="Visão integrada do desenvolvimento, do percurso macro às entregas que sustentam a jornada."
    >
      <div style={{ display: "grid", gap: 18 }}>
        <section style={heroWrap}>
          <div style={heroLeft}>
            <div style={heroEyebrow}>Oceano do Desenvolvimento</div>
            <h2 style={heroTitle}>
              Um território vivo de desenvolvimento, com rios, portos, sustentação e destino.
            </h2>
            <p style={heroText}>
              Leia o mapa como um oceano: jornadas como rios, ações como portos
              e coaching ou mentoria como a sustentação que mantém a rota viva.
            </p>

            <div style={tabBar}>
              {[
                ["geral", "Oceano"],
                ["jornadas", "Rios"],
                ["acoes", "Portos"],
                ["coaching", "Sustentação"],
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
              <div style={orbHeader}>Pulso do Oceano</div>
              <div style={orbValue}>{fmtNumber(kpis.jornadas)}</div>
              <div style={orbSub}>rios monitorados</div>
            </div>

            <div style={signalGrid}>
              {destaqueCards.map((item) => (
                <div key={item.title} style={signalCard}>
                  <div style={signalTitle}>{item.title}</div>
                  <div style={signalValue}>{item.value}</div>
                  <div style={signalSub}>{item.subtitle}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionCard
          title="Cartografia do Oceano"
          subtitle="Leitura macro do território de desenvolvimento e do volume em curso."
        >
          <div style={kpiGrid}>
            <StatCard title="Rios ativos" value={fmtNumber(kpis.jornadas)} accent="#2563eb" />
            <StatCard title="Portos de ação" value={fmtNumber(kpis.acoes)} accent="#7c3aed" />
            <StatCard title="Sustentação" value={fmtNumber(kpis.coachings)} accent="#ea580c" />
            <StatCard title="Público impactado" value={fmtNumber(kpis.participantes)} accent="#16a34a" />
            <StatCard title="Horas no oceano" value={fmtHours(kpis.horasTotais)} accent="#b45309" />
            <StatCard title="Entregas concluídas" value={fmtNumber(kpis.concluidas)} accent="#1d4ed8" />
          </div>
        </SectionCard>

        <SectionCard
          title="Leitura do território"
          subtitle="Refine o oceano por rio, status e busca."
          action={
            <button
              style={buttonSecondaryStyle()}
              onClick={() =>
                setFilters({
                  jornada_id: "",
                  status: "",
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
              title="Lógica do oceano"
              subtitle="Do macro ao destino: entenda o percurso antes de olhar o detalhe."
            >
              <div style={journeyGuideGrid}>
                {[
                  ["1. Oceano", "Define a leitura macro do desenvolvimento e do território."],
                  ["2. Rios", "Cada jornada conduz um caminho com vários trechos."],
                  ["3. Portos", "Ações funcionam como pontos de execução e entrega."],
                  ["4. Sustentação", "Coaching e mentoria mantêm a rota viva após a ação."],
                ].map(([title, text]) => (
                  <div key={title} style={journeyGuideCard}>
                    <div style={journeyGuideTitle}>{title}</div>
                    <div style={journeyGuideText}>{text}</div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Rios e trajetos"
              subtitle="Leia cada jornada como um rio com portos, sustentação e próximo trecho."
            >
              {loading ? (
                emptyCard("Carregando fluxo das jornadas...")
              ) : jornadasFluxo.length === 0 ? (
                emptyCard("Nenhuma jornada encontrada para os filtros aplicados.")
              ) : (
                <div style={{ display: "grid", gap: 16 }}>
                  {jornadasFluxo.map((jornada) => (
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
                          <MetricBox label="Portos" value={fmtNumber(jornada.acoesDaJornada.length)} />
                          <MetricBox label="Sustentações" value={fmtNumber(jornada.coachingsDaJornada.length)} />
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
                          Próximo trecho: {jornada.proximoPasso}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Portos em movimento"
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
              title="Rios e ramificações"
              subtitle="Estruture a jornada principal do oceano."
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
              title="Linha do percurso"
              subtitle="Leitura visual do caminho de cada rio com seus portos e sustentações."
            >
              {loading ? (
                emptyCard("Carregando percurso das jornadas...")
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
                          <MetricBox label="Portos" value={fmtNumber(jornada.acoesDaJornada.length)} />
                          <MetricBox label="Sustentações" value={fmtNumber(jornada.coachingsDaJornada.length)} />
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
                          Próximo trecho: {jornada.proximoPasso}
                        </div>
                      </div>

                      <div style={timelineWrap}>
                        <div style={timelineLabel}>Portos</div>
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
                            <div style={timelineEmpty}>Nenhum porto registrado.</div>
                          )}
                        </div>
                      </div>

                      <div style={timelineWrap}>
                        <div style={timelineLabel}>Sustentação</div>
                        <div style={timelineItems}>
                          {jornada.coachingsDaJornada.length ? (
                            jornada.coachingsDaJornada.map((item) => (
                              <div key={`coach-${item.id}`} style={timelineItem}>
                                <div style={timelineItemTitle}>{item.titulo}</div>
                                <div style={timelineItemMeta}>
                                  {item.tipo_coaching || "sustentação"} • {fmtHours(item.horas_totais || 0)}h
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
                            ))
                          ) : (
                            <div style={timelineEmpty}>Nenhuma sustentação registrada.</div>
                          )}
                        </div>
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
              title="Portos e ancoragens"
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
                          setAcaoForm((prev) => ({ ...prev, data_fim: e.target.value }))
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
              title="Portos cadastrados"
              subtitle="Lista das ações já registradas no mapa."
            >
              {loading ? (
                emptyCard("Carregando portos...")
              ) : filteredAcoes.length === 0 ? (
                emptyCard("Nenhum porto encontrado.")
              ) : (
                <div style={cardsGrid}>
                  {filteredAcoes.map((acao) => (
                    <div key={acao.id} style={execCard}>
                      <div style={execHeader}>
                        <div>
                          <div style={execTitle}>{acao.tema}</div>
                          <div style={execSubtitle}>
                            {acao.jornada_nome} • {acao.responsavel_nome}
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
              title="Sustentação do percurso"
              subtitle="Registre coaching e mentoria como camada de reforço e continuidade da jornada."
            >
              <details open style={detailsCard}>
                <summary style={detailsSummary}>Registro de sustentação</summary>

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
                      Horas totais
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
                      {coachingForm.id ? "Atualizar sustentação" : "Salvar sustentação"}
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
              title="Sustentações cadastradas"
              subtitle="Lista de coachings e mentorias do percurso."
            >
              {loading ? (
                emptyCard("Carregando sustentações...")
              ) : filteredCoachings.length === 0 ? (
                emptyCard("Nenhuma sustentação encontrada.")
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
    border: active ? "1px solid rgba(255,255,255,.28)" : "1px solid transparent",
    background: active ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.08)",
    color: "#fff",
    borderRadius: 999,
    padding: "10px 14px",
    fontWeight: 800,
    cursor: "pointer",
    backdropFilter: "blur(10px)",
  };
}

const fieldSpan = {
  md: { gridColumn: "span 1" },
  lg: { gridColumn: "span 2" },
  xl: { gridColumn: "span 2" },
  xxl: { gridColumn: "span 3" },
  full: { gridColumn: "1 / -1" },
};

const heroWrap = {
  display: "grid",
  gridTemplateColumns: "1.4fr .9fr",
  gap: 18,
  alignItems: "stretch",
  borderRadius: 28,
  padding: 24,
  background:
    "radial-gradient(circle at 20% 20%, rgba(56,189,248,.22), transparent 35%), radial-gradient(circle at 80% 30%, rgba(59,130,246,.24), transparent 28%), linear-gradient(135deg, #082f49 0%, #0f172a 55%, #0f766e 120%)",
  border: "1px solid rgba(125,211,252,.18)",
  boxShadow: "0 22px 48px rgba(8,47,73,.35)",
};

const heroLeft = {
  display: "grid",
  gap: 14,
};

const heroEyebrow = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "#7dd3fc",
};

const heroTitle = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 34,
  lineHeight: 1.08,
  maxWidth: 720,
};

const heroText = {
  margin: 0,
  color: "#cbd5e1",
  lineHeight: 1.7,
  maxWidth: 760,
};

const tabBar = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 6,
};

const heroRight = {
  display: "grid",
  gap: 14,
};

const orbCard = {
  borderRadius: 22,
  padding: 20,
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.12)",
  display: "grid",
  gap: 6,
};

const orbHeader = {
  fontSize: 12,
  color: "#bae6fd",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  fontWeight: 900,
};

const orbValue = {
  fontSize: 54,
  lineHeight: 1,
  color: "#fff",
  fontWeight: 900,
};

const orbSub = {
  color: "#cbd5e1",
  fontSize: 13,
};

const signalGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const signalCard = {
  borderRadius: 18,
  padding: 16,
  background: "rgba(255,255,255,.07)",
  border: "1px solid rgba(255,255,255,.12)",
};

const signalTitle = {
  fontSize: 11,
  color: "#cbd5e1",
  fontWeight: 800,
  textTransform: "uppercase",
};

const signalValue = {
  fontSize: 22,
  fontWeight: 900,
  color: "#fff",
  marginTop: 4,
};

const signalSub = {
  fontSize: 12,
  color: "#cbd5e1",
  marginTop: 2,
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
  background: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  padding: "12px 14px",
  borderRadius: 14,
  fontWeight: 700,
};

const successAlert = {
  background: "#f0fdf4",
  color: "#166534",
  border: "1px solid #bbf7d0",
  padding: "12px 14px",
  borderRadius: 14,
  fontWeight: 700,
};

const journeyGuideGrid = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const journeyGuideCard = {
  border: "1px solid #dbeafe",
  borderRadius: 18,
  padding: 16,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  boxShadow: "0 10px 24px rgba(15,23,42,.04)",
  display: "grid",
  gap: 8,
};

const journeyGuideTitle = {
  fontSize: 16,
  fontWeight: 900,
  color: "#0f172a",
};

const journeyGuideText = {
  fontSize: 13,
  color: "#475569",
  lineHeight: 1.5,
};

const journeyFlowCard = {
  border: "1px solid #dbeafe",
  borderRadius: 22,
  padding: 18,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  boxShadow: "0 12px 28px rgba(15,23,42,.05)",
  display: "grid",
  gap: 16,
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
  borderRadius: 16,
  padding: 14,
  background: "#fff",
  border: "1px solid #e2e8f0",
  display: "grid",
  gap: 6,
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
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
};

const execCard = {
  borderRadius: 20,
  border: "1px solid #dbeafe",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  boxShadow: "0 12px 28px rgba(15,23,42,.05)",
  padding: 18,
  display: "grid",
  gap: 14,
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
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  background: "#fff",
  padding: 12,
};

const miniExecutiveLabel = {
  fontSize: 11,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
};

const miniExecutiveValue = {
  fontSize: 18,
  fontWeight: 900,
  color: "#0f172a",
  marginTop: 4,
};


const timelineWrap = {
  display: "grid",
  gap: 8,
};

const timelineLabel = {
  fontSize: 12,
  fontWeight: 900,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const timelineItems = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const timelineItem = {
  borderRadius: 14,
  border: "1px solid #dbeafe",
  background: "#ffffff",
  padding: 12,
};

const timelineItemTitle = {
  fontSize: 14,
  fontWeight: 800,
  color: "#0f172a",
};

const timelineItemMeta = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748b",
};

const timelineEmpty = {
  color: "#64748b",
  fontSize: 13,
};
