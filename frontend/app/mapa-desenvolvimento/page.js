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
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function badgeStyle(type) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };

  const map = {
    ativa: { background: "#dcfce7", color: "#166534" },
    inativa: { background: "#e5e7eb", color: "#374151" },
    concluida: { background: "#dbeafe", color: "#1d4ed8" },
    concluída: { background: "#dbeafe", color: "#1d4ed8" },
    planejada: { background: "#ede9fe", color: "#6d28d9" },
    planejado: { background: "#ede9fe", color: "#6d28d9" },
    em_andamento: { background: "#ffedd5", color: "#9a3412" },
    "em andamento": { background: "#ffedd5", color: "#9a3412" },
    cancelada: { background: "#fee2e2", color: "#b91c1c" },
    cancelado: { background: "#fee2e2", color: "#b91c1c" },
  };

  return {
    ...base,
    ...(map[normalize(type)] || { background: "#eff6ff", color: "#1d4ed8" }),
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
  return Number(plano.sessoes_realizadas || 0) * Number(plano.carga_horaria_sessao || 0) * Number(plano.participantes_realizados || 0);
}

const jornadaInicial = {
  id: null,
  cliente: "",
  nome: "",
  descricao: "",
  status: "ativa",
  responsavel_id: "",
  data_inicio: "",
  data_fim: "",
};

const acaoInicial = {
  id: null,
  jornada_id: "",
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
  acao_id: "",
  cliente: "",
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
  const [acoes, setAcoes] = useState([]);
  const [coachings, setCoachings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [notice, setNotice] = useState("");

  const [filters, setFilters] = useState({
    cliente: "",
    jornada_id: "",
    status: "",
    responsavel_id: "",
    busca: "",
  });

  const [jornadaForm, setJornadaForm] = useState(jornadaInicial);
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
      const [usuariosData, jornadasData, acoesData, coachingsData] = await Promise.all([
        safeLoad("/usuarios"),
        safeLoad("/jornadas-desenvolvimento"),
        safeLoad("/acoes-desenvolvimento"),
        safeLoad("/coaching-planos"),
      ]);

      setUsuarios(usuariosData);
      setJornadas(jornadasData);
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
    usuarios.forEach((user) => {
      map[String(user.id)] = user.nome || `Usuário ${user.id}`;
    });
    return map;
  }, [usuarios]);

  const jornadasEnriquecidas = useMemo(() => {
    return jornadas.map((jornada) => {
      const acoesDaJornada = acoes.filter((acao) => String(acao.jornada_id) === String(jornada.id));
      const coachingsDaJornada = coachings.filter(
        (plano) => String(plano.jornada_id) === String(jornada.id)
      );

      const participantes = acoesDaJornada.reduce(
        (acc, item) => acc + Number(item.participantes_realizados || 0),
        0
      );

      const horas = acoesDaJornada.reduce(
        (acc, item) => acc + Number(item.horas_realizadas || calcHorasRealizadas(item)),
        0
      ) + coachingsDaJornada.reduce(
        (acc, item) => acc + Number(item.horas_totais || calcHorasCoaching(item)),
        0
      );

      return {
        ...jornada,
        total_acoes: acoesDaJornada.length,
        total_coachings: coachingsDaJornada.length,
        participantes_impactados: participantes,
        horas_totais: horas,
      };
    });
  }, [jornadas, acoes, coachings]);

  const acoesEnriquecidas = useMemo(() => {
    return acoes.map((acao) => {
      const jornada = jornadas.find((j) => String(j.id) === String(acao.jornada_id));
      return {
        ...acao,
        jornada_nome: jornada?.nome || "Sem jornada",
        cliente: jornada?.cliente || "Sem cliente",
        responsavel_nome: responsavelMap[String(acao.responsavel_id)] || "Não definido",
        horas_planejadas_calc: Number(acao.horas_planejadas || calcHorasPlanejadas(acao)),
        horas_realizadas_calc: Number(acao.horas_realizadas || calcHorasRealizadas(acao)),
      };
    });
  }, [acoes, jornadas, responsavelMap]);

  const coachingsEnriquecidos = useMemo(() => {
    return coachings.map((plano) => {
      const jornada = jornadas.find((j) => String(j.id) === String(plano.jornada_id));
      return {
        ...plano,
        jornada_nome: jornada?.nome || "Sem jornada",
        cliente_resolvido: plano.cliente || jornada?.cliente || "Sem cliente",
        responsavel_nome: responsavelMap[String(plano.responsavel_id)] || "Não definido",
        horas_totais_calc: Number(plano.horas_totais || calcHorasCoaching(plano)),
      };
    });
  }, [coachings, jornadas, responsavelMap]);

  const filteredJornadas = useMemo(() => {
    return jornadasEnriquecidas.filter((item) => {
      const matchCliente = !filters.cliente || normalize(item.cliente) === normalize(filters.cliente);
      const matchJornada = !filters.jornada_id || String(item.id) === String(filters.jornada_id);
      const matchStatus = !filters.status || normalize(item.status) === normalize(filters.status);
      const matchResponsavel =
        !filters.responsavel_id || String(item.responsavel_id || "") === String(filters.responsavel_id);
      const text = `${item.nome} ${item.cliente} ${item.descricao || ""}`;
      const matchBusca = !filters.busca || normalize(text).includes(normalize(filters.busca));
      return matchCliente && matchJornada && matchStatus && matchResponsavel && matchBusca;
    });
  }, [jornadasEnriquecidas, filters]);

  const filteredAcoes = useMemo(() => {
    return acoesEnriquecidas.filter((item) => {
      const matchCliente = !filters.cliente || normalize(item.cliente) === normalize(filters.cliente);
      const matchJornada =
        !filters.jornada_id || String(item.jornada_id || "") === String(filters.jornada_id);
      const matchStatus = !filters.status || normalize(item.status) === normalize(filters.status);
      const matchResponsavel =
        !filters.responsavel_id || String(item.responsavel_id || "") === String(filters.responsavel_id);
      const text = `${item.tema} ${item.subtipo || ""} ${item.publico_alvo || ""} ${item.descricao || ""}`;
      const matchBusca = !filters.busca || normalize(text).includes(normalize(filters.busca));
      return matchCliente && matchJornada && matchStatus && matchResponsavel && matchBusca;
    });
  }, [acoesEnriquecidas, filters]);

  const filteredCoachings = useMemo(() => {
    return coachingsEnriquecidos.filter((item) => {
      const matchCliente =
        !filters.cliente || normalize(item.cliente_resolvido) === normalize(filters.cliente);
      const matchJornada =
        !filters.jornada_id || String(item.jornada_id || "") === String(filters.jornada_id);
      const matchStatus = !filters.status || normalize(item.status) === normalize(filters.status);
      const matchResponsavel =
        !filters.responsavel_id || String(item.responsavel_id || "") === String(filters.responsavel_id);
      const text = `${item.titulo} ${item.tipo_coaching || ""} ${item.publico_alvo || ""} ${item.objetivo || ""}`;
      const matchBusca = !filters.busca || normalize(text).includes(normalize(filters.busca));
      return matchCliente && matchJornada && matchStatus && matchResponsavel && matchBusca;
    });
  }, [coachingsEnriquecidos, filters]);

  const kpis = useMemo(() => {
    const clientes = new Set(jornadasEnriquecidas.map((item) => item.cliente).filter(Boolean));
    const horasAcoes = filteredAcoes.reduce((acc, item) => acc + Number(item.horas_realizadas_calc || 0), 0);
    const horasCoaching = filteredCoachings.reduce((acc, item) => acc + Number(item.horas_totais_calc || 0), 0);
    const participantesAcoes = filteredAcoes.reduce(
      (acc, item) => acc + Number(item.participantes_realizados || 0),
      0
    );
    const sessoesCoaching = filteredCoachings.reduce(
      (acc, item) => acc + Number(item.sessoes_realizadas || 0),
      0
    );

    return {
      jornadas: filteredJornadas.length,
      clientes: clientes.size,
      acoes: filteredAcoes.length,
      coachings: filteredCoachings.length,
      participantes: participantesAcoes,
      horasTotais: horasAcoes + horasCoaching,
      sessoesCoaching,
    };
  }, [filteredJornadas, filteredAcoes, filteredCoachings, jornadasEnriquecidas]);

  const clienteOptions = useMemo(() => {
    const values = [...new Set(jornadas.map((item) => item.cliente).filter(Boolean))];
    return values.sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
  }, [jornadas]);

  async function saveJornada(event) {
    event.preventDefault();
    setSaving(true);
    setErro("");
    setNotice("");

    try {
      const payload = {
        cliente: jornadaForm.cliente,
        nome: jornadaForm.nome,
        descricao: jornadaForm.descricao,
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
      const clienteJornada = jornadas.find((j) => String(j.id) === String(coachingForm.jornada_id))?.cliente || "";
      const horasTotais =
        coachingForm.horas_totais !== ""
          ? Number(coachingForm.horas_totais || 0)
          : Number(coachingForm.sessoes_realizadas || 0) *
            Number(coachingForm.carga_horaria_sessao || 0) *
            Number(coachingForm.participantes_realizados || 0);

      const payload = {
        jornada_id: Number(coachingForm.jornada_id),
        acao_id: coachingForm.acao_id ? Number(coachingForm.acao_id) : null,
        cliente: coachingForm.cliente || clienteJornada,
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
        setNotice("Plano de coaching atualizado com sucesso.");
      } else {
        await apiFetch("/coaching-planos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice("Plano de coaching criado com sucesso.");
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
      setErro("");
      setNotice("");

      const pathMap = {
        jornada: `/jornadas-desenvolvimento/${id}`,
        acao: `/acoes-desenvolvimento/${id}`,
        coaching: `/coaching-planos/${id}`,
      };

      await apiFetch(pathMap[tipo], { method: "DELETE" });
      setNotice("Registro excluído com sucesso.");
      await loadAll();
    } catch (error) {
      setErro(error.message || "Erro ao excluir registro.");
    }
  }

  function editJornada(item) {
    setJornadaForm({
      id: item.id,
      cliente: item.cliente || "",
      nome: item.nome || "",
      descricao: item.descricao || "",
      status: item.status || "ativa",
      responsavel_id: item.responsavel_id || "",
      data_inicio: toDateInput(item.data_inicio),
      data_fim: toDateInput(item.data_fim),
    });
  }

  function editAcao(item) {
    setAcaoForm({
      id: item.id,
      jornada_id: item.jornada_id || "",
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
    setActiveTab("treinamentos");
  }

  function editCoaching(item) {
    setCoachingForm({
      id: item.id,
      jornada_id: item.jornada_id || "",
      acao_id: item.acao_id || "",
      cliente: item.cliente || "",
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

  return (
    <PortalShell title="Mapa de Desenvolvimento" subtitle="Governança gerencial por cliente, jornada, ação e coaching.">
      <div style={{ display: "grid", gap: 18 }}>
        <SectionCard
          title="Painel executivo"
          subtitle="Este módulo está separado do Treinamento operacional do portal. Aqui entram somente jornadas, ações e coachings cadastrados no próprio Mapa."
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={buttonSecondaryStyle()} onClick={() => setActiveTab("geral")}>
                Visão Geral
              </button>
              <button style={buttonSecondaryStyle()} onClick={() => setActiveTab("treinamentos")}>
                Treinamentos do Mapa
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
            <StatCard title="Clientes" value={fmtNumber(kpis.clientes)} accent="#0f766e" />
            <StatCard title="Ações do mapa" value={fmtNumber(kpis.acoes)} accent="#7c3aed" />
            <StatCard title="Coachings" value={fmtNumber(kpis.coachings)} accent="#ea580c" />
            <StatCard title="Participantes impactados" value={fmtNumber(kpis.participantes)} accent="#16a34a" />
            <StatCard title="Horas totais" value={fmtHours(kpis.horasTotais)} subtitle="Treinamentos + coaching" accent="#b45309" />
            <StatCard title="Sessões de coaching" value={fmtNumber(kpis.sessoesCoaching)} accent="#dc2626" />
          </div>
        </SectionCard>

        <SectionCard title="Filtros" subtitle="Refine a leitura gerencial por cliente, jornada, status, responsável e palavra-chave.">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <label style={labelStyle()}>
              Cliente
              <select
                value={filters.cliente}
                onChange={(e) => setFilters((prev) => ({ ...prev, cliente: e.target.value }))}
                style={inputStyle()}
              >
                <option value="">Todos</option>
                {clienteOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle()}>
              Jornada
              <select
                value={filters.jornada_id}
                onChange={(e) => setFilters((prev) => ({ ...prev, jornada_id: e.target.value }))}
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
              Status
              <select
                value={filters.status}
                onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                style={inputStyle()}
              >
                <option value="">Todos</option>
                <option value="ativa">Ativa</option>
                <option value="inativa">Inativa</option>
                <option value="concluida">Concluída</option>
                <option value="planejada">Planejada</option>
                <option value="planejado">Planejado</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
                <option value="cancelado">Cancelado</option>
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
                placeholder="Tema, jornada, cliente, público..."
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
          <>
            <SectionCard
              title="Cadastro de jornadas"
              subtitle="Cadastre aqui as jornadas por cliente. Ex.: Jornada SAFRA, Jornada CREA, Jornada DASA."
              action={
                jornadaForm.id ? (
                  <button style={buttonSecondaryStyle()} onClick={() => setJornadaForm(jornadaInicial)}>
                    Nova jornada
                  </button>
                ) : null
              }
            >
              <form onSubmit={saveJornada} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  <label style={labelStyle()}>
                    Cliente
                    <input
                      value={jornadaForm.cliente}
                      onChange={(e) => setJornadaForm((prev) => ({ ...prev, cliente: e.target.value }))}
                      style={inputStyle()}
                      placeholder="Ex.: SAFRA"
                      required
                    />
                  </label>

                  <label style={labelStyle()}>
                    Nome da jornada
                    <input
                      value={jornadaForm.nome}
                      onChange={(e) => setJornadaForm((prev) => ({ ...prev, nome: e.target.value }))}
                      style={inputStyle()}
                      placeholder="Ex.: Jornada SAFRA"
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
                  Descrição
                  <textarea
                    value={jornadaForm.descricao}
                    onChange={(e) => setJornadaForm((prev) => ({ ...prev, descricao: e.target.value }))}
                    style={{ ...inputStyle(), minHeight: 90, resize: "vertical" }}
                    placeholder="Contexto, escopo e finalidade da jornada."
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

            <SectionCard title="Jornadas cadastradas" subtitle="Visão macro do Mapa de Desenvolvimento por cliente.">
              {loading ? (
                emptyCard("Carregando jornadas...")
              ) : filteredJornadas.length === 0 ? (
                emptyCard("Nenhuma jornada encontrada. Se os endpoints ainda não estiverem publicados no backend, esta área permanecerá vazia.")
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {filteredJornadas.map((item) => (
                    <div key={item.id} style={rowCard}>
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={badgeStyle(item.status)}>{item.status || "ativa"}</span>
                          <span style={miniInfo}>{item.cliente}</span>
                        </div>
                        <div style={titleRow}>{item.nome}</div>
                        <div style={subInfo}>
                          Responsável: {responsavelMap[String(item.responsavel_id)] || "Não definido"} •
                          Início: {formatDate(item.data_inicio)} •
                          Fim: {formatDate(item.data_fim)}
                        </div>
                        <div style={descText}>{item.descricao || "Sem descrição cadastrada."}</div>
                      </div>

                      <div style={metricsRow}>
                        <MetricBox label="Ações" value={fmtNumber(item.total_acoes)} />
                        <MetricBox label="Coachings" value={fmtNumber(item.total_coachings)} />
                        <MetricBox label="Participantes" value={fmtNumber(item.participantes_impactados)} />
                        <MetricBox label="Horas" value={fmtHours(item.horas_totais)} />
                      </div>

                      <div style={actionsRow}>
                        <button style={buttonSecondaryStyle()} onClick={() => editJornada(item)}>
                          Editar
                        </button>
                        <button style={buttonDangerStyle()} onClick={() => removeRegistro("jornada", item.id)}>
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

        {activeTab === "treinamentos" && (
          <>
            <SectionCard
              title="Cadastro de ações do Mapa"
              subtitle="Cadastre aqui somente ações estratégicas do Mapa de Desenvolvimento. Não são os treinamentos operacionais do portal."
              action={
                acaoForm.id ? (
                  <button style={buttonSecondaryStyle()} onClick={() => setAcaoForm(acaoInicial)}>
                    Nova ação
                  </button>
                ) : null
              }
            >
              <form onSubmit={saveAcao} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  <label style={labelStyle()}>
                    Jornada
                    <select
                      value={acaoForm.jornada_id}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, jornada_id: e.target.value }))}
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
                      <option value="outro">Outro</option>
                    </select>
                  </label>

                  <label style={labelStyle()}>
                    Tema
                    <input
                      value={acaoForm.tema}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, tema: e.target.value }))}
                      style={inputStyle()}
                      placeholder="Ex.: Prevenção ao Assédio Moral"
                      required
                    />
                  </label>

                  <label style={labelStyle()}>
                    Subtipo
                    <input
                      value={acaoForm.subtipo}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, subtipo: e.target.value }))}
                      style={inputStyle()}
                      placeholder="Ex.: Normativo"
                    />
                  </label>

                  <label style={labelStyle()}>
                    Público-alvo
                    <input
                      value={acaoForm.publico_alvo}
                      onChange={(e) => setAcaoForm((prev) => ({ ...prev, publico_alvo: e.target.value }))}
                      style={inputStyle()}
                      placeholder="Ex.: Operação, Liderança"
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
                      placeholder="Deixe em branco para cálculo automático"
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
                      placeholder="Deixe em branco para cálculo automático"
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
                    placeholder="Objetivo, escopo e aplicação da ação."
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

            <SectionCard title="Ações do Mapa" subtitle="Essas ações são exclusivas do Mapa de Desenvolvimento e não vêm do módulo de Treinamento do portal.">
              {loading ? (
                emptyCard("Carregando ações...")
              ) : filteredAcoes.length === 0 ? (
                emptyCard("Nenhuma ação encontrada.")
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Cliente</th>
                        <th style={thStyle}>Jornada</th>
                        <th style={thStyle}>Tema</th>
                        <th style={thStyle}>Tipo</th>
                        <th style={thStyle}>Público</th>
                        <th style={thStyle}>Participantes</th>
                        <th style={thStyle}>Carga h.</th>
                        <th style={thStyle}>Horas realizadas</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Responsável</th>
                        <th style={thStyle}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAcoes.map((item) => (
                        <tr key={item.id}>
                          <td style={tdStyle}>{item.cliente}</td>
                          <td style={tdStyle}>{item.jornada_nome}</td>
                          <td style={tdStyle}>
                            <strong>{item.tema}</strong>
                            {item.subtipo ? <div style={smallMuted}>{item.subtipo}</div> : null}
                          </td>
                          <td style={tdStyle}>{item.tipo_acao}</td>
                          <td style={tdStyle}>{item.publico_alvo || "—"}</td>
                          <td style={tdStyle}>{fmtNumber(item.participantes_realizados || 0)}</td>
                          <td style={tdStyle}>{fmtHours(item.carga_horaria || 0)}</td>
                          <td style={tdStyle}>{fmtHours(item.horas_realizadas_calc)}</td>
                          <td style={tdStyle}>
                            <span style={badgeStyle(item.status)}>{item.status}</span>
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
              )}
            </SectionCard>
          </>
        )}

        {activeTab === "coaching" && (
          <>
            <SectionCard
              title="Cadastro de coaching"
              subtitle="Área apartada para a visão da coordenadora responsável pelos coachings."
              action={
                coachingForm.id ? (
                  <button style={buttonSecondaryStyle()} onClick={() => setCoachingForm(coachingInicial)}>
                    Novo coaching
                  </button>
                ) : null
              }
            >
              <form onSubmit={saveCoaching} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  <label style={labelStyle()}>
                    Jornada
                    <select
                      value={coachingForm.jornada_id}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, jornada_id: e.target.value }))}
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
                    Ação vinculada (opcional)
                    <select
                      value={coachingForm.acao_id}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, acao_id: e.target.value }))}
                      style={inputStyle()}
                    >
                      <option value="">Nenhuma</option>
                      {acoesEnriquecidas.map((item) => (
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
                      placeholder="Ex.: Coaching Coordenação"
                      required
                    />
                  </label>

                  <label style={labelStyle()}>
                    Público-alvo
                    <input
                      value={coachingForm.publico_alvo}
                      onChange={(e) => setCoachingForm((prev) => ({ ...prev, publico_alvo: e.target.value }))}
                      style={inputStyle()}
                      placeholder="Ex.: Coordenadores"
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
                      placeholder="Deixe em branco para cálculo automático"
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
                    placeholder="Objetivo do ciclo de coaching."
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

            <SectionCard title="Visão apartada de coaching" subtitle="Leitura executiva própria para a coordenadora responsável pelos coachings.">
              {loading ? (
                emptyCard("Carregando coachings...")
              ) : filteredCoachings.length === 0 ? (
                emptyCard("Nenhum plano de coaching encontrado.")
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Cliente</th>
                        <th style={thStyle}>Jornada</th>
                        <th style={thStyle}>Título</th>
                        <th style={thStyle}>Tipo</th>
                        <th style={thStyle}>Público</th>
                        <th style={thStyle}>Sessões</th>
                        <th style={thStyle}>Participantes</th>
                        <th style={thStyle}>Horas totais</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Responsável</th>
                        <th style={thStyle}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCoachings.map((item) => (
                        <tr key={item.id}>
                          <td style={tdStyle}>{item.cliente_resolvido}</td>
                          <td style={tdStyle}>{item.jornada_nome}</td>
                          <td style={tdStyle}>
                            <strong>{item.titulo}</strong>
                            {item.objetivo ? <div style={smallMuted}>{item.objetivo}</div> : null}
                          </td>
                          <td style={tdStyle}>{item.tipo_coaching}</td>
                          <td style={tdStyle}>{item.publico_alvo || "—"}</td>
                          <td style={tdStyle}>
                            {fmtNumber(item.sessoes_realizadas || 0)} / {fmtNumber(item.sessoes_previstas || 0)}
                          </td>
                          <td style={tdStyle}>{fmtNumber(item.participantes_realizados || 0)}</td>
                          <td style={tdStyle}>{fmtHours(item.horas_totais_calc)}</td>
                          <td style={tdStyle}>
                            <span style={badgeStyle(item.status)}>{item.status}</span>
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
        minWidth: 110,
        padding: "10px 12px",
        borderRadius: 14,
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
      }}
    >
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", marginTop: 4 }}>{value}</div>
    </div>
  );
}

const rowCard = {
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 16,
  background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
  boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)",
  display: "grid",
  gap: 14,
};

const titleRow = {
  fontSize: 18,
  fontWeight: 900,
  color: "#0f172a",
};

const descText = {
  fontSize: 14,
  lineHeight: 1.5,
  color: "#475569",
};

const subInfo = {
  fontSize: 13,
  color: "#64748b",
  lineHeight: 1.5,
};

const miniInfo = {
  display: "inline-flex",
  alignItems: "center",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 11,
};

const metricsRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const actionsRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 980,
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
