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
  if (["concluida", "concluído", "concluido", "finalizada"].includes(status))
    return "concluido";
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

function extrairMensagemErro(error, fallback) {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error.message) return error.message;
  if (error.error) return error.error;
  return fallback;
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
  responsavel: "",
  status: "planejada",
  data_inicio: "",
  data_fim: "",
  carga_horaria: "",
  participantes_previstos: "",
  turma_ids: [],
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
  const [turmas, setTurmas] = useState([]);

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

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setErro("");

    try {
      const [jornadasData, acoesData, turmasData] = await Promise.all([
        apiFetch("/jornadas-desenvolvimento").catch(() => []),
        apiFetch("/acoes-desenvolvimento").catch(() => []),
        apiFetch("/treinamentos").catch(() => []),
      ]);

      setJornadas(Array.isArray(jornadasData) ? jornadasData : []);
      setAcoes(Array.isArray(acoesData) ? acoesData : []);
      setTurmas(Array.isArray(turmasData) ? turmasData : []);
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
        responsavel: acaoForm.responsavel || null,
        status: acaoForm.status || "planejada",
        data_inicio: acaoForm.data_inicio || null,
        data_fim: acaoForm.data_fim || null,
        carga_horaria: Number(acaoForm.carga_horaria || 0),
        participantes_previstos: Number(acaoForm.participantes_previstos || 0),
        turma_ids: Array.isArray(acaoForm.turma_ids) ? acaoForm.turma_ids : [],
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

  async function removeRegistro(tipo, id) {
    const ok = window.confirm("Deseja realmente excluir este registro?");
    if (!ok) return;

    try {
      const pathMap = {
        jornada: `/jornadas-desenvolvimento/${id}`,
        acao: `/acoes-desenvolvimento/${id}`,
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
      responsavel: item.responsavel || item.responsavel_nome || "",
      status: canonicalStatus(item.status) || "planejada",
      data_inicio: toDateInputLocal(item.data_inicio),
      data_fim: toDateInputLocal(item.data_fim),
      carga_horaria: String(item.carga_horaria || ""),
      participantes_previstos: String(item.participantes_previstos || ""),
      turma_ids: Array.isArray(item.turmas_vinculadas)
        ? item.turmas_vinculadas.map((t) => Number(t.id))
        : [],
    });
    setActiveTab("acoes");
  }

  const jornadasEnriquecidas = useMemo(() => {
    return jornadas.map((jornada) => {
      const acoesDaJornada = acoes.filter(
        (a) => String(a.jornada_id) === String(jornada.id)
      );
      const horasTotais = acoesDaJornada.reduce(
        (acc, item) => acc + Number(item.horas_realizadas || 0),
        0
      );

      let attention = { level: "ok", label: "Monitorada" };

      if (!acoesDaJornada.length) {
        attention = { level: "media", label: "Sem portos vinculados" };
      }

      if (getPrazoInfo(jornada).tone === "danger") {
        attention = { level: "alta", label: "Prazo vencido" };
      }

      return {
        ...jornada,
        nome: jornada.nome || jornada.titulo,
        publico_macro: jornada.publico_macro || jornada.publico_alvo,
        total_acoes: acoesDaJornada.length,
        horas_totais: horasTotais,
        prazo_info: getPrazoInfo(jornada),
        attention_info: attention,
        status_canonico: canonicalStatus(jornada.status),
      };
    });
  }, [jornadas, acoes]);

  const acoesEnriquecidas = useMemo(() => {
    return acoes.map((acao) => {
      const jornada = jornadas.find((j) => String(j.id) === String(acao.jornada_id));

      let attention = { level: "ok", label: "Estável" };
      if (!acao.responsavel) {
        attention = { level: "media", label: "Sem responsável" };
      }
      if (getPrazoInfo(acao).tone === "danger") {
        attention = { level: "alta", label: "Prazo vencido" };
      }

      return {
        ...acao,
        tema: acao.tema || acao.titulo,
        jornada_nome: jornada?.nome || jornada?.titulo || "Sem jornada",
        prazo_info: getPrazoInfo(acao),
        attention_info: attention,
        status_canonico: canonicalStatus(acao.status),
      };
    });
  }, [acoes, jornadas]);

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
            item.responsavel,
            item.responsavel_nome,
          ].join(" ")
        ).includes(normalize(filters.busca));

      return matchJornada && matchStatus && matchBusca;
    });
  }, [acoesEnriquecidas, filters]);

  const jornadasFluxo = useMemo(() => {
    return filteredJornadas
      .map((jornada) => {
        const acoesDaJornada = filteredAcoes.filter(
          (item) => String(item.jornada_id) === String(jornada.id)
        );

        const concluidas = acoesDaJornada.filter(
          (item) => canonicalStatus(item.status) === "concluido"
        ).length;

        const progresso = acoesDaJornada.length
          ? Math.round((concluidas / acoesDaJornada.length) * 100)
          : 0;

        const proximoPasso =
          acoesDaJornada.find((item) => canonicalStatus(item.status) !== "concluido")
            ?.tema ||
          "Estruturar os próximos portos da jornada";

        return {
          ...jornada,
          acoesDaJornada,
          concluidas,
          progresso,
          proximoPasso,
        };
      })
      .sort((a, b) => {
        const pa = a.attention_info.level === "alta" ? 1 : a.attention_info.level === "media" ? 2 : 3;
        const pb = b.attention_info.level === "alta" ? 1 : b.attention_info.level === "media" ? 2 : 3;
        if (pa !== pb) return pa - pb;
        return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
      });
  }, [filteredJornadas, filteredAcoes]);

  const kpis = useMemo(() => {
    return {
      jornadas: filteredJornadas.length,
      acoes: filteredAcoes.length,
      turmas: filteredAcoes.reduce(
        (acc, item) => acc + Number(item.quantidade_turmas_sessoes || 0),
        0
      ),
      participantes: filteredAcoes.reduce(
        (acc, item) => acc + Number(item.participantes_realizados || 0),
        0
      ),
      horasTotais: filteredAcoes.reduce(
        (acc, item) => acc + Number(item.horas_realizadas || 0),
        0
      ),
      concluidas: filteredAcoes.filter(
        (i) => canonicalStatus(i.status) === "concluido"
      ).length,
    };
  }, [filteredJornadas, filteredAcoes]);

  const destaqueCards = [
    {
      title: "Rios monitorados",
      value: fmtNumber(kpis.jornadas),
      subtitle: "Jornadas em observação",
    },
    {
      title: "Portos de ação",
      value: fmtNumber(kpis.acoes),
      subtitle: "Ações vinculadas ao oceano",
    },
    {
      title: "Turmas ancoradas",
      value: fmtNumber(kpis.turmas),
      subtitle: "Turmas conectadas às ações",
    },
    {
      title: "Horas no oceano",
      value: fmtHours(kpis.horasTotais),
      subtitle: "Execução consolidada",
    },
  ];

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
              Um território vivo de desenvolvimento, com rios, portos e destino.
            </h2>
            <p style={heroText}>
              Leia o mapa como um oceano: jornadas como rios, ações como portos
              e turmas como embarcações reais que materializam a execução.
            </p>

            <div style={tabBar}>
              {[
                ["geral", "Oceano"],
                ["jornadas", "Rios"],
                ["acoes", "Portos"],
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
            <StatCard title="Turmas vinculadas" value={fmtNumber(kpis.turmas)} accent="#0f766e" />
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
                placeholder="Jornada, ação, objetivo, responsável..."
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
                  ["3. Portos", "Ações funcionam como pontos de ancoragem e execução."],
                  ["4. Embarcações", "As turmas reais materializam a jornada na operação."],
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
              subtitle="Leia cada jornada como um rio com portos, progresso e próximo trecho."
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
                            Público: {jornada.publico_macro || "Não informado"} • Cliente:{" "}
                            {jornada.cliente || "Não informado"}
                          </div>
                        </div>

                        <div style={journeyFlowSummary}>
                          <MetricBox label="Portos" value={fmtNumber(jornada.acoesDaJornada.length)} />
                          <MetricBox label="Concluídos" value={fmtNumber(jornada.concluidas)} />
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

                      <div style={journeyStagesGrid}>
                        {jornada.acoesDaJornada.length === 0 ? (
                          <div style={emptyTimeline}>Esta jornada ainda não possui portos vinculados.</div>
                        ) : (
                          jornada.acoesDaJornada.map((acao) => (
                            <div key={acao.id} style={journeyStageCard(false)}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <span style={badgeStyle(acao.status)}>{displayStatus(acao.status)}</span>
                                <span style={attentionBadge(acao.attention_info.level)}>
                                  {acao.attention_info.label}
                                </span>
                                <span style={prazoBadge(acao.prazo_info.tone)}>
                                  {acao.prazo_info.label}
                                </span>
                              </div>

                              <div style={journeyStageTitle}>{acao.tema}</div>
                              <div style={journeyStageMeta}>
                                {formatDate(acao.data_inicio)} até {formatDate(acao.data_fim)}
                              </div>

                              <div style={journeyMiniStats}>
                                <span>{fmtNumber(acao.quantidade_turmas_sessoes || 0)} turma(s)</span>
                                <span>{fmtNumber(acao.participantes_realizados || 0)} participantes</span>
                                <span>{fmtHours(acao.horas_realizadas || 0)}h</span>
                              </div>

                              {Array.isArray(acao.turmas_vinculadas) &&
                              acao.turmas_vinculadas.length ? (
                                <div style={journeySubBlock}>
                                  <div style={journeySubTitle}>Embarcações ancoradas</div>
                                  <div style={journeyTags}>
                                    {acao.turmas_vinculadas.map((turma) => (
                                      <button
                                        key={turma.id}
                                        type="button"
                                        onClick={() =>
                                          (window.location.href = `/turma/${turma.id}`)
                                        }
                                        style={journeyTag}
                                      >
                                        {turma.tema || `Turma ${turma.id}`}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div style={journeyEmptyText}>Sem turmas vinculadas</div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Portos em movimento"
              subtitle="Entregas, vínculo com turmas e leitura operacional do trecho atual."
            >
              {loading ? (
                emptyCard("Carregando visão geral...")
              ) : filteredAcoes.length === 0 ? (
                emptyCard("Nenhuma ação encontrada.")
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Jornada</th>
                        <th style={thStyle}>Porto</th>
                        <th style={thStyle}>Responsável</th>
                        <th style={thStyle}>Turmas</th>
                        <th style={thStyle}>Participantes</th>
                        <th style={thStyle}>Horas</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Prazo</th>
                        <th style={thStyle}>Atenção</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAcoes.map((item) => (
                        <tr key={item.id} style={rowTone(item)}>
                          <td style={tdStyle}>{item.jornada_nome}</td>
                          <td style={tdStyle}>
                            <strong>{item.tema}</strong>
                          </td>
                          <td style={tdStyle}>{item.responsavel || item.responsavel_nome || "—"}</td>
                          <td style={tdStyle}>{fmtNumber(item.quantidade_turmas_sessoes || 0)}</td>
                          <td style={tdStyle}>{fmtNumber(item.participantes_realizados || 0)}</td>
                          <td style={tdStyle}>{fmtHours(item.horas_realizadas || 0)}</td>
                          <td style={tdStyle}>
                            <span style={badgeStyle(item.status)}>{displayStatus(item.status)}</span>
                          </td>
                          <td style={tdStyle}>
                            <span style={prazoBadge(item.prazo_info.tone)}>
                              {item.prazo_info.label}
                            </span>
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
              title="Rios cadastrados"
              subtitle="Visão executiva das jornadas que compõem o oceano."
            >
              {loading ? (
                emptyCard("Carregando jornadas...")
              ) : filteredJornadas.length === 0 ? (
                emptyCard("Nenhuma jornada encontrada.")
              ) : (
                <div style={cardsGrid}>
                  {filteredJornadas.map((jornada) => (
                    <div key={jornada.id} style={execCard}>
                      <div style={execHeader}>
                        <div>
                          <div style={execTitle}>{jornada.nome}</div>
                          <div style={execSubtitle}>
                            {jornada.cliente || "Sem cliente"} •{" "}
                            {jornada.publico_macro || "Sem público macro"}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={badgeStyle(jornada.status)}>{displayStatus(jornada.status)}</span>
                          <span style={attentionBadge(jornada.attention_info.level)}>
                            {jornada.attention_info.label}
                          </span>
                        </div>
                      </div>

                      <div style={execBody}>
                        <div style={execText}>{jornada.objetivo || "Sem objetivo definido."}</div>

                        <div style={miniExecutiveBand}>
                          <MiniExecutive label="Portos" value={fmtNumber(jornada.total_acoes)} />
                          <MiniExecutive label="Horas" value={fmtHours(jornada.horas_totais)} />
                          <MiniExecutive label="Prazo" value={jornada.prazo_info.label} />
                        </div>
                      </div>

                      <div style={buttonRow}>
                        <button style={buttonSecondaryStyle()} onClick={() => editJornada(jornada)}>
                          Editar
                        </button>
                        <button
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
              title="Portos e ancoragens"
              subtitle="Cadastre ações e conecte cada porto às turmas reais do projeto."
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
                      <input
                        value={acaoForm.responsavel}
                        onChange={(e) =>
                          setAcaoForm((prev) => ({
                            ...prev,
                            responsavel: e.target.value,
                          }))
                        }
                        style={compactInputStyle()}
                      />
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

                    <label style={{ ...labelStyle(), ...fieldSpan.full }}>
                      Embarcações ancoradas (turmas vinculadas)
                      <select
                        multiple
                        value={acaoForm.turma_ids.map(String)}
                        onChange={(e) => {
                          const values = Array.from(e.target.selectedOptions).map((opt) =>
                            Number(opt.value)
                          );
                          setAcaoForm((prev) => ({
                            ...prev,
                            turma_ids: values,
                          }));
                        }}
                        style={{
                          ...inputStyle(),
                          minHeight: 140,
                          padding: 12,
                        }}
                      >
                        {turmas.map((turma) => (
                          <option key={turma.id} value={turma.id}>
                            {(turma.tema || "Sem nome")} • {turma.cliente || "Sem cliente"} •{" "}
                            {formatDate(turma.data_inicio || turma.data)}
                          </option>
                        ))}
                      </select>
                      <span style={helpText}>
                        Selecione uma ou mais turmas para amarrar a ação à execução real.
                      </span>
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
              title="Portos em movimento"
              subtitle="Leitura executiva das ações, vínculo com turmas e materialização do percurso."
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
                          <div style={execSubtitle}>{acao.jornada_nome}</div>
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
                          <MiniExecutive label="Turmas" value={fmtNumber(acao.quantidade_turmas_sessoes || 0)} />
                          <MiniExecutive label="Participantes" value={fmtNumber(acao.participantes_realizados || 0)} />
                          <MiniExecutive label="Horas" value={fmtHours(acao.horas_realizadas || 0)} />
                        </div>

                        {Array.isArray(acao.turmas_vinculadas) && acao.turmas_vinculadas.length ? (
                          <div style={{ marginTop: 14 }}>
                            <div style={journeySubTitle}>Embarcações ancoradas</div>
                            <div style={journeyTags}>
                              {acao.turmas_vinculadas.map((turma) => (
                                <button
                                  key={turma.id}
                                  type="button"
                                  onClick={() => (window.location.href = `/turma/${turma.id}`)}
                                  style={journeyTag}
                                >
                                  {turma.tema || `Turma ${turma.id}`}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div style={journeyEmptyText}>Sem turmas vinculadas</div>
                        )}
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

function OverviewBox({ label, value, tone = "default" }) {
  const tones = {
    default: {
      background: "#f8fafc",
      color: "#0f172a",
      border: "1px solid #e2e8f0",
    },
    alert: {
      background: "#fff7ed",
      color: "#c2410c",
      border: "1px solid #fed7aa",
    },
    danger: {
      background: "#fff1f2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    },
  };

  return (
    <div style={{ ...overviewBox, ...(tones[tone] || tones.default) }}>
      <div style={overviewLabel}>{label}</div>
      <div style={overviewValue}>{value}</div>
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

function rowTone(item) {
  if (item?.attention_info?.level === "alta") {
    return { background: "#fffaf9" };
  }
  if (item?.attention_info?.level === "media") {
    return { background: "#fffdf7" };
  }
  return { background: "#fff" };
}

const fieldSpan = {
  sm: { gridColumn: "span 1" },
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

const journeyStagesGrid = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
};

const journeyStageCard = (isAtual) => ({
  borderRadius: 18,
  border: isAtual ? "1px solid #7dd3fc" : "1px solid #e2e8f0",
  background: isAtual
    ? "linear-gradient(180deg, #f0f9ff 0%, #ffffff 100%)"
    : "#fff",
  padding: 16,
  display: "grid",
  gap: 10,
  boxShadow: isAtual ? "0 10px 24px rgba(14,165,233,.12)" : "none",
});

const journeyStageTitle = {
  fontSize: 18,
  fontWeight: 900,
  color: "#0f172a",
};

const journeyStageMeta = {
  fontSize: 13,
  color: "#64748b",
};

const journeyMiniStats = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#334155",
  fontSize: 13,
  fontWeight: 700,
};

const journeySubBlock = {
  display: "grid",
  gap: 8,
};

const journeySubTitle = {
  fontSize: 12,
  fontWeight: 900,
  color: "#0f766e",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const journeyLinkedItem = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  fontSize: 13,
  color: "#334155",
};

const journeyEmptyText = {
  fontSize: 13,
  color: "#64748b",
};

const journeyTags = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const journeyTag = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const emptyTimeline = {
  border: "1px dashed #cbd5e1",
  borderRadius: 16,
  padding: 18,
  color: "#64748b",
  background: "#fff",
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

const helpText = {
  fontSize: 12,
  color: "#64748b",
};

const overviewBox = {
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 4,
};

const overviewLabel = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
};

const overviewValue = {
  fontSize: 18,
  fontWeight: 900,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 980,
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  overflow: "hidden",
};

const thStyle = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: 12,
  fontWeight: 900,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: ".03em",
  background: "#f8fafc",
  borderBottom: "1px solid #e2e8f0",
};

const tdStyle = {
  padding: "14px 16px",
  borderBottom: "1px solid #eef2f7",
  color: "#0f172a",
  fontSize: 14,
};
