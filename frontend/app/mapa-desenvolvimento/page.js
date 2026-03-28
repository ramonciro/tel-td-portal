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

function toDateInput(value) {
  if (!value) return "";
  const raw = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function badgeStyle(type) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    whiteSpace: "nowrap",
    lineHeight: 1.1,
    border: "1px solid transparent",
  };

  const map = {
    ativa: { background: "#ecfdf5", color: "#166534", borderColor: "#bbf7d0" },
    inativa: { background: "#f8fafc", color: "#475569", borderColor: "#e2e8f0" },
    concluida: { background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" },
    concluída: { background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" },
    planejada: { background: "#faf5ff", color: "#7c3aed", borderColor: "#ddd6fe" },
    planejado: { background: "#faf5ff", color: "#7c3aed", borderColor: "#ddd6fe" },
    em_andamento: { background: "#fff7ed", color: "#c2410c", borderColor: "#fed7aa" },
    "em andamento": { background: "#fff7ed", color: "#c2410c", borderColor: "#fed7aa" },
    cancelada: { background: "#fef2f2", color: "#b91c1c", borderColor: "#fecaca" },
    cancelado: { background: "#fef2f2", color: "#b91c1c", borderColor: "#fecaca" },
    finalizada: { background: "#ecfeff", color: "#155e75", borderColor: "#a5f3fc" },
  };

  return {
    ...base,
    ...(map[normalize(type)] || {
      background: "#f8fafc",
      color: "#334155",
      borderColor: "#e2e8f0",
    }),
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
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    background: "#fff",
  };
}

function labelStyle() {
  return {
    display: "grid",
    gap: 6,
    fontSize: 13,
    color: "#334155",
    fontWeight: 700,
  };
}

function emptyCard(message) {
  return (
    <div
      style={{
        border: "1px dashed #cbd5e1",
        borderRadius: 16,
        padding: 20,
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

const jornadaInicial = {
  id: null,
  nome: "",
  descricao: "",
  objetivo: "",
  publico_macro: "",
  observacoes: "",
  status: "ativa",
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
  status: "planejada",
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
  status: "planejada",
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
      setErro(error.message || "Erro ao carregar o Mapa de Desenvolvimento.");
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

      return {
        ...jornada,
        total_etapas: etapasDaJornada.length,
        total_acoes: acoesDaJornada.length,
        total_coachings: coachingsDaJornada.length,
        horas_totais: horasAcoes + horasCoaching,
      };
    });
  }, [jornadas, etapas, acoes, coachings]);

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
      return {
        ...acao,
        jornada_nome: jornada?.nome || "Sem jornada",
        etapa_nome: etapa?.nome || "Sem etapa",
        responsavel_nome: responsavelMap[String(acao.responsavel_id)] || "Não definido",
        horas_planejadas_calc: Number(acao.horas_planejadas || calcHorasPlanejadas(acao)),
        horas_realizadas_calc: Number(acao.horas_realizadas || calcHorasRealizadas(acao)),
      };
    });
  }, [acoes, jornadasMap, etapasMap, responsavelMap]);

  const coachingsEnriquecidos = useMemo(() => {
    return coachings.map((plano) => {
      const jornada = jornadasMap[String(plano.jornada_id || "")];
      const etapa = etapasMap[String(plano.etapa_id || "")];
      const acao = acoes.find((a) => String(a.id) === String(plano.acao_id || ""));
      return {
        ...plano,
        jornada_nome: jornada?.nome || "Independente",
        etapa_nome: etapa?.nome || "Sem etapa",
        acao_nome: acao?.tema || "Sem ação vinculada",
        responsavel_nome: responsavelMap[String(plano.responsavel_id)] || "Não definido",
        horas_totais_calc: Number(plano.horas_totais || calcHorasCoaching(plano)),
      };
    });
  }, [coachings, jornadasMap, etapasMap, acoes, responsavelMap]);

  const filteredJornadas = useMemo(() => {
    return jornadasEnriquecidas.filter((item) => {
      const matchJornada = !filters.jornada_id || String(item.id) === String(filters.jornada_id);
      const matchStatus = !filters.status || normalize(item.status) === normalize(filters.status);
      const matchResponsavel =
        !filters.responsavel_id || String(item.responsavel_id || "") === String(filters.responsavel_id);
      const text = `${item.nome} ${item.descricao || ""} ${item.objetivo || ""}`;
      const matchBusca = !filters.busca || normalize(text).includes(normalize(filters.busca));
      return matchJornada && matchStatus && matchResponsavel && matchBusca;
    });
  }, [jornadasEnriquecidas, filters]);

  const filteredEtapas = useMemo(() => {
    return etapasEnriquecidas.filter((item) => {
      const matchJornada =
        !filters.jornada_id || String(item.jornada_id || "") === String(filters.jornada_id);
      const matchEtapa = !filters.etapa_id || String(item.id) === String(filters.etapa_id);
      const matchStatus = !filters.status || normalize(item.status) === normalize(filters.status);
      const matchResponsavel =
        !filters.responsavel_id || String(item.responsavel_id || "") === String(filters.responsavel_id);
      const text = `${item.nome} ${item.descricao || ""} ${item.objetivo || ""} ${item.tipo || ""}`;
      const matchBusca = !filters.busca || normalize(text).includes(normalize(filters.busca));
      return matchJornada && matchEtapa && matchStatus && matchResponsavel && matchBusca;
    });
  }, [etapasEnriquecidas, filters]);

  const filteredAcoes = useMemo(() => {
    return acoesEnriquecidas.filter((item) => {
      const matchJornada =
        !filters.jornada_id || String(item.jornada_id || "") === String(filters.jornada_id);
      const matchEtapa =
        !filters.etapa_id || String(item.etapa_id || "") === String(filters.etapa_id);
      const matchTipo = !filters.tipo || normalize(item.tipo_acao) === normalize(filters.tipo);
      const matchStatus = !filters.status || normalize(item.status) === normalize(filters.status);
      const matchResponsavel =
        !filters.responsavel_id || String(item.responsavel_id || "") === String(filters.responsavel_id);
      const text = `${item.tema} ${item.subtipo || ""} ${item.publico_alvo || ""} ${item.descricao || ""}`;
      const matchBusca = !filters.busca || normalize(text).includes(normalize(filters.busca));
      return matchJornada && matchEtapa && matchTipo && matchStatus && matchResponsavel && matchBusca;
    });
  }, [acoesEnriquecidas, filters]);

  const filteredCoachings = useMemo(() => {
    return coachingsEnriquecidos.filter((item) => {
      const matchJornada = !filters.jornada_id || String(item.jornada_id || "") === String(filters.jornada_id);
      const matchEtapa = !filters.etapa_id || String(item.etapa_id || "") === String(filters.etapa_id);
      const matchTipo = !filters.tipo || normalize(item.tipo_coaching) === normalize(filters.tipo);
      const matchStatus = !filters.status || normalize(item.status) === normalize(filters.status);
      const matchResponsavel =
        !filters.responsavel_id || String(item.responsavel_id || "") === String(filters.responsavel_id);
      const text = `${item.titulo} ${item.tipo_coaching || ""} ${item.publico_alvo || ""} ${item.objetivo || ""}`;
      const matchBusca = !filters.busca || normalize(text).includes(normalize(filters.busca));
      return matchJornada && matchEtapa && matchTipo && matchStatus && matchResponsavel && matchBusca;
    });
  }, [coachingsEnriquecidos, filters]);

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
    const concluidas =
      filteredAcoes.filter((i) => normalize(i.status) === "concluida").length +
      filteredCoachings.filter((i) => normalize(i.status) === "concluido").length;

    return {
      jornadas: filteredJornadas.length,
      etapas: filteredEtapas.length,
      acoes: filteredAcoes.length,
      coachings: filteredCoachings.length,
      participantes: participantesAcoes + participantesCoachings,
      horasTotais: horasAcoes + horasCoachings,
      concluidas,
    };
  }, [filteredJornadas, filteredEtapas, filteredAcoes, filteredCoachings]);

  async function saveJornada(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");
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
        setNotice("Jornada criada com sucesso.");
      }

      setJornadaForm(jornadaInicial);
      await loadAll();
    } catch (error) {
      setErro(error.message || "Erro ao salvar jornada.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEtapa(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");
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
        setNotice("Etapa criada com sucesso.");
      }

      setEtapaForm(etapaInicial);
      await loadAll();
    } catch (error) {
      setErro(error.message || "Erro ao salvar etapa.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAcao(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");
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
        setNotice("Ação criada com sucesso.");
      }

      setAcaoForm(acaoInicial);
      await loadAll();
    } catch (error) {
      setErro(error.message || "Erro ao salvar ação.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCoaching(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");
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
        setNotice("Coaching criado com sucesso.");
      }

      setCoachingForm(coachingInicial);
      await loadAll();
    } catch (error) {
      setErro(error.message || "Erro ao salvar coaching.");
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
      setErro(error.message || "Erro ao excluir registro.");
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
      status: item.status || "ativa",
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
      status: item.status || "planejada",
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
      status: item.status || "planejada",
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
      status: item.status || "planejado",
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

  return (
    <PortalShell
      title="Mapa de Desenvolvimento"
      subtitle="Governança das jornadas, etapas, ações estratégicas e coaching."
    >
      <div style={{ display: "grid", gap: 18 }}>
        <SectionCard
          title="Painel executivo"
          subtitle="O Mapa é independente do módulo operacional de Treinamentos. Aqui a jornada funciona como um fluxo, com etapas e entregas vinculadas."
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={buttonSecondaryStyle()} onClick={() => setActiveTab("geral")}>
                Visão Geral
              </button>
              <button style={buttonSecondaryStyle()} onClick={() => setActiveTab("jornadas")}>
                Jornadas
              </button>
              <button style={buttonSecondaryStyle()} onClick={() => setActiveTab("acoes")}>
                Ações do Mapa
              </button>
              <button style={buttonSecondaryStyle()} onClick={() => setActiveTab("coaching")}>
                Coaching
              </button>
            </div>
          }
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
            }}
          >
            <StatCard title="Jornadas ativas" value={fmtNumber(kpis.jornadas)} accent="#2563eb" />
            <StatCard title="Etapas" value={fmtNumber(kpis.etapas)} accent="#0f766e" />
            <StatCard title="Ações" value={fmtNumber(kpis.acoes)} accent="#7c3aed" />
            <StatCard title="Coachings" value={fmtNumber(kpis.coachings)} accent="#ea580c" />
            <StatCard title="Participantes impactados" value={fmtNumber(kpis.participantes)} accent="#16a34a" />
            <StatCard title="Horas aplicadas" value={fmtHours(kpis.horasTotais)} accent="#b45309" />
            <StatCard title="Concluídas" value={fmtNumber(kpis.concluidas)} accent="#0f766e" />
          </div>
        </SectionCard>

        <SectionCard
          title="Filtros globais"
          subtitle="Aplique os filtros e acompanhe jornadas, etapas, ações e coaching na mesma lógica."
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
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
              <input
                value={filters.tipo}
                onChange={(e) => setFilters((prev) => ({ ...prev, tipo: e.target.value }))}
                placeholder="treinamento, coaching..."
                style={inputStyle()}
              />
            </label>

            <label style={labelStyle()}>
              Status
              <input
                value={filters.status}
                onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                placeholder="ativa, concluída..."
                style={inputStyle()}
              />
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
                placeholder="Busque por jornada, etapa, tema, público..."
                style={inputStyle()}
              />
            </label>
          </div>

          {(erro || notice) && (
            <div style={{ marginTop: 14 }}>
              {erro ? (
                <div
                  style={{
                    borderRadius: 12,
                    padding: "12px 14px",
                    background: "#fff1f2",
                    color: "#b91c1c",
                    border: "1px solid #fecdd3",
                    fontWeight: 700,
                  }}
                >
                  {erro}
                </div>
              ) : null}

              {notice ? (
                <div
                  style={{
                    borderRadius: 12,
                    padding: "12px 14px",
                    background: "#ecfeff",
                    color: "#155e75",
                    border: "1px solid #a5f3fc",
                    fontWeight: 700,
                    marginTop: erro ? 10 : 0,
                  }}
                >
                  {notice}
                </div>
              ) : null}
            </div>
          )}
        </SectionCard>

        {activeTab === "geral" && (
          <SectionCard
            title="Visão consolidada"
            subtitle="Leitura executiva do fluxo: jornadas, etapas, ações e coaching."
          >
            {loading ? (
              emptyCard("Carregando visão geral...")
            ) : filteredJornadas.length === 0 && filteredAcoes.length === 0 && filteredCoachings.length === 0 ? (
              emptyCard("Nenhum registro encontrado.")
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
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
                        <th style={thStyle}>Período</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAcoes.map((item) => (
                        <tr key={`acao-${item.id}`}>
                          <td style={tdStyle}>{item.jornada_nome}</td>
                          <td style={tdStyle}>{item.etapa_nome}</td>
                          <td style={tdStyle}><strong>{item.tema}</strong></td>
                          <td style={tdStyle}>{item.tipo_acao}</td>
                          <td style={tdStyle}>{item.publico_alvo || "—"}</td>
                          <td style={tdStyle}>{item.responsavel_nome}</td>
                          <td style={tdStyle}>{fmtHours(item.horas_realizadas_calc)}</td>
                          <td style={tdStyle}><span style={badgeStyle(item.status)}>{item.status}</span></td>
                          <td style={tdStyle}>
                            {formatDate(item.data_inicio)} até {formatDate(item.data_fim)}
                          </td>
                        </tr>
                      ))}

                      {filteredCoachings.map((item) => (
                        <tr key={`coaching-${item.id}`}>
                          <td style={tdStyle}>{item.jornada_nome}</td>
                          <td style={tdStyle}>{item.etapa_nome}</td>
                          <td style={tdStyle}><strong>{item.titulo}</strong></td>
                          <td style={tdStyle}>coaching • {item.tipo_coaching}</td>
                          <td style={tdStyle}>{item.publico_alvo || "—"}</td>
                          <td style={tdStyle}>{item.responsavel_nome}</td>
                          <td style={tdStyle}>{fmtHours(item.horas_totais_calc)}</td>
                          <td style={tdStyle}><span style={badgeStyle(item.status)}>{item.status}</span></td>
                          <td style={tdStyle}>
                            {formatDate(item.data_inicio)} até {formatDate(item.data_fim)}
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
            <SectionCard
              title="Cadastro de jornada"
              subtitle="A jornada representa o rio principal do desenvolvimento. As etapas funcionam como atracações ao longo desse fluxo."
              action={
                jornadaForm.id ? (
                  <button style={buttonSecondaryStyle()} onClick={() => setJornadaForm(jornadaInicial)}>
                    Nova jornada
                  </button>
                ) : null
              }
            >
              <form onSubmit={saveJornada} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <label style={labelStyle()}>
                    Nome da jornada
                    <input
                      value={jornadaForm.nome}
                      onChange={(e) => setJornadaForm((prev) => ({ ...prev, nome: e.target.value }))}
                      style={inputStyle()}
                      required
                    />
                  </label>

                  <label style={labelStyle()}>
                    Status
                    <select
                      value={jornadaForm.status}
                      onChange={(e) => setJornadaForm((prev) => ({ ...prev, status: e.target.value }))}
                      style={inputStyle()}
                    >
                      <option value="ativa">Ativa</option>
                      <option value="inativa">Inativa</option>
                      <option value="concluida">Concluída</option>
                    </select>
                  </label>

                  <label style={labelStyle()}>
                    Responsável
                    <select
                      value={jornadaForm.responsavel_id}
                      onChange={(e) => setJornadaForm((prev) => ({ ...prev, responsavel_id: e.target.value }))}
                      style={inputStyle()}
                    >
                      <option value="">Selecione</option>
                      {usuarios.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={labelStyle()}>
                    Público macro
                    <input
                      value={jornadaForm.publico_macro}
                      onChange={(e) => setJornadaForm((prev) => ({ ...prev, publico_macro: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Data início
                    <input
                      type="date"
                      value={jornadaForm.data_inicio}
                      onChange={(e) => setJornadaForm((prev) => ({ ...prev, data_inicio: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Data fim
                    <input
                      type="date"
                      value={jornadaForm.data_fim}
                      onChange={(e) => setJornadaForm((prev) => ({ ...prev, data_fim: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>
                </div>

                <label style={labelStyle()}>
                  Objetivo macro
                  <textarea
                    value={jornadaForm.objetivo}
                    onChange={(e) => setJornadaForm((prev) => ({ ...prev, objetivo: e.target.value }))}
                    style={{ ...inputStyle(), minHeight: 70, resize: "vertical" }}
                  />
                </label>

                <label style={labelStyle()}>
                  Descrição
                  <textarea
                    value={jornadaForm.descricao}
                    onChange={(e) => setJornadaForm((prev) => ({ ...prev, descricao: e.target.value }))}
                    style={{ ...inputStyle(), minHeight: 80, resize: "vertical" }}
                  />
                </label>

                <label style={labelStyle()}>
                  Observações
                  <textarea
                    value={jornadaForm.observacoes}
                    onChange={(e) => setJornadaForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                    style={{ ...inputStyle(), minHeight: 80, resize: "vertical" }}
                  />
                </label>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
                    {jornadaForm.id ? "Atualizar jornada" : "Salvar jornada"}
                  </button>
                  <button type="button" style={buttonSecondaryStyle()} onClick={() => setJornadaForm(jornadaInicial)}>
                    Limpar
                  </button>
                </div>
              </form>
            </SectionCard>

            <SectionCard
              title="Cadastro de etapa da jornada"
              subtitle="Cada etapa representa uma atracação do fluxo. Você pode criar quantas etapas quiser."
              action={
                etapaForm.id ? (
                  <button style={buttonSecondaryStyle()} onClick={() => setEtapaForm(etapaInicial)}>
                    Nova etapa
                  </button>
                ) : null
              }
            >
              <form onSubmit={saveEtapa} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <label style={labelStyle()}>
                    Jornada
                    <select
                      value={etapaForm.jornada_id}
                      onChange={(e) => setEtapaForm((prev) => ({ ...prev, jornada_id: e.target.value }))}
                      style={inputStyle()}
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

                  <label style={labelStyle()}>
                    Nome da etapa
                    <input
                      value={etapaForm.nome}
                      onChange={(e) => setEtapaForm((prev) => ({ ...prev, nome: e.target.value }))}
                      style={inputStyle()}
                      required
                    />
                  </label>

                  <label style={labelStyle()}>
                    Tipo
                    <select
                      value={etapaForm.tipo}
                      onChange={(e) => setEtapaForm((prev) => ({ ...prev, tipo: e.target.value }))}
                      style={inputStyle()}
                    >
                      <option value="treinamento">Treinamento</option>
                      <option value="acao">Ação</option>
                      <option value="coaching">Coaching</option>
                      <option value="workshop">Workshop</option>
                      <option value="campanha">Campanha</option>
                      <option value="marco">Marco gerencial</option>
                    </select>
                  </label>

                  <label style={labelStyle()}>
                    Ordem
                    <input
                      type="number"
                      value={etapaForm.ordem}
                      onChange={(e) => setEtapaForm((prev) => ({ ...prev, ordem: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Status
                    <select
                      value={etapaForm.status}
                      onChange={(e) => setEtapaForm((prev) => ({ ...prev, status: e.target.value }))}
                      style={inputStyle()}
                    >
                      <option value="planejada">Planejada</option>
                      <option value="em_andamento">Em andamento</option>
                      <option value="concluida">Concluída</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </label>

                  <label style={labelStyle()}>
                    Responsável
                    <select
                      value={etapaForm.responsavel_id}
                      onChange={(e) => setEtapaForm((prev) => ({ ...prev, responsavel_id: e.target.value }))}
                      style={inputStyle()}
                    >
                      <option value="">Selecione</option>
                      {usuarios.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={labelStyle()}>
                    Data início
                    <input
                      type="date"
                      value={etapaForm.data_inicio}
                      onChange={(e) => setEtapaForm((prev) => ({ ...prev, data_inicio: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Data fim
                    <input
                      type="date"
                      value={etapaForm.data_fim}
                      onChange={(e) => setEtapaForm((prev) => ({ ...prev, data_fim: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Carga horária prevista
                    <input
                      type="number"
                      step="0.01"
                      value={etapaForm.carga_horaria_prevista}
                      onChange={(e) => setEtapaForm((prev) => ({ ...prev, carga_horaria_prevista: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Carga horária realizada
                    <input
                      type="number"
                      step="0.01"
                      value={etapaForm.carga_horaria_realizada}
                      onChange={(e) => setEtapaForm((prev) => ({ ...prev, carga_horaria_realizada: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>
                </div>

                <label style={labelStyle()}>
                  Objetivo da etapa
                  <textarea
                    value={etapaForm.objetivo}
                    onChange={(e) => setEtapaForm((prev) => ({ ...prev, objetivo: e.target.value }))}
                    style={{ ...inputStyle(), minHeight: 70, resize: "vertical" }}
                  />
                </label>

                <label style={labelStyle()}>
                  Descrição
                  <textarea
                    value={etapaForm.descricao}
                    onChange={(e) => setEtapaForm((prev) => ({ ...prev, descricao: e.target.value }))}
                    style={{ ...inputStyle(), minHeight: 80, resize: "vertical" }}
                  />
                </label>

                <label style={labelStyle()}>
                  Observações
                  <textarea
                    value={etapaForm.observacoes}
                    onChange={(e) => setEtapaForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                    style={{ ...inputStyle(), minHeight: 80, resize: "vertical" }}
                  />
                </label>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
                    {etapaForm.id ? "Atualizar etapa" : "Salvar etapa"}
                  </button>
                  <button type="button" style={buttonSecondaryStyle()} onClick={() => setEtapaForm(etapaInicial)}>
                    Limpar
                  </button>
                </div>
              </form>
            </SectionCard>

            <SectionCard
              title="Fluxo das jornadas"
              subtitle="Leitura do rio principal com suas atracações. Cada etapa pode ter ações e coachings vinculados."
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
                      <div key={jornada.id} style={rowCard}>
                        <div style={{ display: "grid", gap: 8 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={badgeStyle(jornada.status)}>{jornada.status}</span>
                            <span style={miniInfo}>{jornada.total_etapas} etapa(s)</span>
                            <span style={miniInfo}>{jornada.total_acoes} ação(ões)</span>
                            <span style={miniInfo}>{jornada.total_coachings} coaching(s)</span>
                          </div>

                          <div style={titleRow}>{jornada.nome}</div>
                          <div style={subInfo}>
                            Responsável: {responsavelMap[String(jornada.responsavel_id)] || "Não definido"} •
                            Início: {formatDate(jornada.data_inicio)} •
                            Fim: {formatDate(jornada.data_fim)}
                          </div>
                          <div style={descText}>{jornada.objetivo || jornada.descricao || "Sem descrição cadastrada."}</div>
                        </div>

                        <div style={metricsRow}>
                          <MetricBox label="Etapas" value={fmtNumber(jornada.total_etapas)} />
                          <MetricBox label="Ações" value={fmtNumber(jornada.total_acoes)} />
                          <MetricBox label="Coachings" value={fmtNumber(jornada.total_coachings)} />
                          <MetricBox label="Horas" value={fmtHours(jornada.horas_totais)} />
                        </div>

                        <div style={timelineRiver}>
                          {etapasDaJornada.length === 0 ? (
                            <div style={emptyTimeline}>Sem etapas cadastradas para esta jornada.</div>
                          ) : (
                            etapasDaJornada.map((etapa, index) => (
                              <div key={etapa.id} style={timelineNodeWrap}>
                                <div style={timelineConnector(index < etapasDaJornada.length - 1)} />
                                <div style={timelineNode}>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                    <span style={timelineOrder}>{etapa.ordem || index + 1}</span>
                                    <span style={badgeStyle(etapa.status)}>{etapa.status}</span>
                                  </div>
                                  <div style={timelineTitle}>{etapa.nome}</div>
                                  <div style={smallMuted}>{etapa.tipo || "etapa"}</div>
                                  <div style={smallMuted}>
                                    {formatDate(etapa.data_inicio)} até {formatDate(etapa.data_fim)}
                                  </div>
                                  <div style={smallMuted}>
                                    {fmtNumber(etapa.total_acoes)} ação(ões) • {fmtNumber(etapa.total_coachings)} coaching(s)
                                  </div>
                                  <div style={smallMuted}>Horas: {fmtHours(etapa.horas_totais)}</div>

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
                            ))
                          )}
                        </div>

                        <div style={actionsRow}>
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
            <SectionCard
              title="Cadastro de ações do Mapa"
              subtitle="As ações podem ser vinculadas à jornada e, opcionalmente, a uma etapa específica."
              action={
                acaoForm.id ? (
                  <button style={buttonSecondaryStyle()} onClick={() => setAcaoForm(acaoInicial)}>
                    Nova ação
                  </button>
                ) : null
              }
            >
              <form onSubmit={saveAcao} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <label style={labelStyle()}>
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
                      style={inputStyle()}
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

                  <label style={labelStyle()}>
                    Etapa da jornada
                    <select
                      value={acaoForm.etapa_id}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, etapa_id: e.target.value }))}
                      style={inputStyle()}
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

                  <label style={labelStyle()}>
                    Tipo de ação
                    <select
                      value={acaoForm.tipo_acao}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, tipo_acao: e.target.value }))}
                      style={inputStyle()}
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

                  <label style={labelStyle()}>
                    Título/Tema
                    <input
                      value={acaoForm.tema}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, tema: e.target.value }))}
                      style={inputStyle()}
                      required
                    />
                  </label>

                  <label style={labelStyle()}>
                    Subtipo
                    <input
                      value={acaoForm.subtipo}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, subtipo: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Público-alvo
                    <input
                      value={acaoForm.publico_alvo}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, publico_alvo: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Obrigatória?
                    <select
                      value={acaoForm.obrigatoria}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, obrigatoria: e.target.value }))}
                      style={inputStyle()}
                    >
                      <option value={0}>Não</option>
                      <option value={1}>Sim</option>
                    </select>
                  </label>

                  <label style={labelStyle()}>
                    Carga horária
                    <input
                      type="number"
                      step="0.01"
                      value={acaoForm.carga_horaria}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, carga_horaria: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Participantes previstos
                    <input
                      type="number"
                      value={acaoForm.participantes_previstos}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, participantes_previstos: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Participantes realizados
                    <input
                      type="number"
                      value={acaoForm.participantes_realizados}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, participantes_realizados: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Turmas / sessões
                    <input
                      type="number"
                      value={acaoForm.quantidade_turmas_sessoes}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, quantidade_turmas_sessoes: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Horas planejadas
                    <input
                      type="number"
                      step="0.01"
                      value={acaoForm.horas_planejadas}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, horas_planejadas: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Horas realizadas
                    <input
                      type="number"
                      step="0.01"
                      value={acaoForm.horas_realizadas}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, horas_realizadas: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Status
                    <select
                      value={acaoForm.status}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, status: e.target.value }))}
                      style={inputStyle()}
                    >
                      <option value="planejada">Planejada</option>
                      <option value="em_andamento">Em andamento</option>
                      <option value="concluida">Concluída</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </label>

                  <label style={labelStyle()}>
                    Responsável
                    <select
                      value={acaoForm.responsavel_id}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, responsavel_id: e.target.value }))}
                      style={inputStyle()}
                    >
                      <option value="">Selecione</option>
                      {usuarios.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={labelStyle()}>
                    Data início
                    <input
                      type="date"
                      value={acaoForm.data_inicio}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, data_inicio: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Data fim
                    <input
                      type="date"
                      value={acaoForm.data_fim}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, data_fim: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>
                </div>

                <label style={labelStyle()}>
                  Descrição
                  <textarea
                    value={acaoForm.descricao}
                    onChange={(e) => setAcaoForm((prev) => ({ ...prev, descricao: e.target.value }))}
                    style={{ ...inputStyle(), minHeight: 90, resize: "vertical" }}
                  />
                </label>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
                    {acaoForm.id ? "Atualizar ação" : "Salvar ação"}
                  </button>
                  <button type="button" style={buttonSecondaryStyle()} onClick={() => setAcaoForm(acaoInicial)}>
                    Limpar
                  </button>
                </div>
              </form>
            </SectionCard>

            <SectionCard title="Ações do Mapa" subtitle="As ações podem estar dentro de uma etapa específica da jornada.">
              {loading ? (
                emptyCard("Carregando ações...")
              ) : filteredAcoes.length === 0 ? (
                emptyCard("Nenhuma ação encontrada.")
              ) : (
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
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Responsável</th>
                        <th style={thStyle}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAcoes.map((item) => (
                        <tr key={item.id}>
                          <td style={tdStyle}>{item.jornada_nome}</td>
                          <td style={tdStyle}>{item.etapa_nome}</td>
                          <td style={tdStyle}><strong>{item.tema}</strong></td>
                          <td style={tdStyle}>{item.tipo_acao}</td>
                          <td style={tdStyle}>{item.publico_alvo || "—"}</td>
                          <td style={tdStyle}>{fmtHours(item.horas_realizadas_calc)}</td>
                          <td style={tdStyle}><span style={badgeStyle(item.status)}>{item.status}</span></td>
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
              )}
            </SectionCard>
          </>
        )}

        {activeTab === "coaching" && (
          <>
            <SectionCard
              title="Cadastro de coaching"
              subtitle="O coaching é independente. Pode existir sozinho ou ser vinculado, opcionalmente, a jornada, etapa e ação."
              action={
                coachingForm.id ? (
                  <button style={buttonSecondaryStyle()} onClick={() => setCoachingForm(coachingInicial)}>
                    Novo coaching
                  </button>
                ) : null
              }
            >
              <form onSubmit={saveCoaching} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <label style={labelStyle()}>
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
                      style={inputStyle()}
                    >
                      <option value="">Independente</option>
                      {jornadas.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={labelStyle()}>
                    Etapa (opcional)
                    <select
                      value={coachingForm.etapa_id}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, etapa_id: e.target.value }))}
                      style={inputStyle()}
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

                  <label style={labelStyle()}>
                    Ação vinculada (opcional)
                    <select
                      value={coachingForm.acao_id}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, acao_id: e.target.value }))}
                      style={inputStyle()}
                    >
                      <option value="">Sem ação</option>
                      {acoesOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.tema}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={labelStyle()}>
                    Tipo de coaching
                    <select
                      value={coachingForm.tipo_coaching}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, tipo_coaching: e.target.value }))}
                      style={inputStyle()}
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

                  <label style={labelStyle()}>
                    Título
                    <input
                      value={coachingForm.titulo}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, titulo: e.target.value }))}
                      style={inputStyle()}
                      required
                    />
                  </label>

                  <label style={labelStyle()}>
                    Público-alvo
                    <input
                      value={coachingForm.publico_alvo}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, publico_alvo: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Responsável
                    <select
                      value={coachingForm.responsavel_id}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, responsavel_id: e.target.value }))}
                      style={inputStyle()}
                    >
                      <option value="">Selecione</option>
                      {usuarios.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={labelStyle()}>
                    Participantes previstos
                    <input
                      type="number"
                      value={coachingForm.participantes_previstos}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, participantes_previstos: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Participantes realizados
                    <input
                      type="number"
                      value={coachingForm.participantes_realizados}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, participantes_realizados: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Sessões previstas
                    <input
                      type="number"
                      value={coachingForm.sessoes_previstas}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, sessoes_previstas: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Sessões realizadas
                    <input
                      type="number"
                      value={coachingForm.sessoes_realizadas}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, sessoes_realizadas: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Carga horária por sessão
                    <input
                      type="number"
                      step="0.01"
                      value={coachingForm.carga_horaria_sessao}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, carga_horaria_sessao: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Horas totais
                    <input
                      type="number"
                      step="0.01"
                      value={coachingForm.horas_totais}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, horas_totais: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Status
                    <select
                      value={coachingForm.status}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, status: e.target.value }))}
                      style={inputStyle()}
                    >
                      <option value="planejado">Planejado</option>
                      <option value="em_andamento">Em andamento</option>
                      <option value="concluido">Concluído</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </label>

                  <label style={labelStyle()}>
                    Data início
                    <input
                      type="date"
                      value={coachingForm.data_inicio}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, data_inicio: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>

                  <label style={labelStyle()}>
                    Data fim
                    <input
                      type="date"
                      value={coachingForm.data_fim}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, data_fim: e.target.value }))}
                      style={inputStyle()}
                    />
                  </label>
                </div>

                <label style={labelStyle()}>
                  Objetivo
                  <textarea
                    value={coachingForm.objetivo}
                    onChange={(e) => setCoachingForm((prev) => ({ ...prev, objetivo: e.target.value }))}
                    style={{ ...inputStyle(), minHeight: 90, resize: "vertical" }}
                  />
                </label>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
                    {coachingForm.id ? "Atualizar coaching" : "Salvar coaching"}
                  </button>
                  <button type="button" style={buttonSecondaryStyle()} onClick={() => setCoachingForm(coachingInicial)}>
                    Limpar
                  </button>
                </div>
              </form>
            </SectionCard>

            <SectionCard title="Visão apartada de coaching" subtitle="Coaching pode existir independentemente ou ser vinculado ao fluxo da jornada.">
              {loading ? (
                emptyCard("Carregando coachings...")
              ) : filteredCoachings.length === 0 ? (
                emptyCard("Nenhum coaching encontrado.")
              ) : (
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
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Responsável</th>
                        <th style={thStyle}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCoachings.map((item) => (
                        <tr key={item.id}>
                          <td style={tdStyle}>{item.jornada_nome}</td>
                          <td style={tdStyle}>{item.etapa_nome}</td>
                          <td style={tdStyle}>{item.acao_nome}</td>
                          <td style={tdStyle}><strong>{item.titulo}</strong></td>
                          <td style={tdStyle}>{item.tipo_coaching}</td>
                          <td style={tdStyle}>{fmtHours(item.horas_totais_calc)}</td>
                          <td style={tdStyle}><span style={badgeStyle(item.status)}>{item.status}</span></td>
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
    <div
      style={{
        minWidth: 96,
        padding: "8px 10px",
        borderRadius: 12,
        background: "#ffffff",
        border: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#64748b",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".03em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: "#0f172a",
          marginTop: 3,
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const rowCard = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 14,
  background: "#ffffff",
  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.03)",
  display: "grid",
  gap: 12,
};

const titleRow = {
  fontSize: 17,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.25,
};

const descText = {
  fontSize: 14,
  lineHeight: 1.5,
  color: "#475569",
};

const subInfo = {
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.45,
};

const miniInfo = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: 999,
  background: "#f8fafc",
  color: "#475569",
  border: "1px solid #e2e8f0",
  fontWeight: 700,
  fontSize: 10,
  lineHeight: 1.1,
};

const metricsRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "stretch",
};

const actionsRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
  paddingTop: 2,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1080,
};

const thStyle = {
  textAlign: "left",
  padding: "12px 10px",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "#64748b",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
};

const tdStyle = {
  padding: "12px 10px",
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "top",
  color: "#0f172a",
  fontSize: 14,
};

const smallMuted = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.4,
};

const timelineRiver = {
  display: "grid",
  gap: 12,
  marginTop: 4,
};

const emptyTimeline = {
  border: "1px dashed #cbd5e1",
  borderRadius: 14,
  padding: 14,
  color: "#64748b",
  background: "#f8fafc",
};

const timelineNodeWrap = {
  position: "relative",
  paddingLeft: 22,
};

const timelineConnector = (show) => ({
  position: "absolute",
  left: 6,
  top: 22,
  bottom: show ? -18 : "auto",
  width: 2,
  background: show ? "#cbd5e1" : "transparent",
});

const timelineNode = {
  border: "1px solid #dbeafe",
  background: "#f8fbff",
  borderRadius: 16,
  padding: 14,
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

const timelineTitle = {
  fontSize: 16,
  fontWeight: 900,
  color: "#0f172a",
  marginTop: 8,
};
