"use client";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function parseHoras(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).replace(",", ".").trim();
  const match = text.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

function statusLabel(status) {
  const key = String(status || "").toLowerCase();

  if (key === "concluido" || key === "concluído") return "Concluída";
  if (key === "em_andamento" || key === "em andamento") return "Em andamento";
  return "Planejada";
}

function statusStyle(status) {
  const label = statusLabel(status);

  const base = {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };

  if (label === "Concluída") {
    return { ...base, background: "#dcfce7", color: "#166534" };
  }

  if (label === "Em andamento") {
    return { ...base, background: "#ffedd5", color: "#9a3412" };
  }

  return { ...base, background: "#dbeafe", color: "#1d4ed8" };
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
}

function formatPeriodo(item) {
  if (item.data_inicio && item.data_fim) {
    return `${formatDate(item.data_inicio)} até ${formatDate(item.data_fim)}`;
  }
  if (item.data_inicio) return formatDate(item.data_inicio);
  if (item.data) return formatDate(item.data);
  return "-";
}

export default function TreinamentosPage() {
  const [turmas, setTurmas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    async function carregar() {
      try {
        const [treinamentosData, usuariosData] = await Promise.all([
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/usuarios").catch(() => []),
        ]);

        setTurmas(Array.isArray(treinamentosData) ? treinamentosData : []);
        setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
      } catch {
        setTurmas([]);
        setUsuarios([]);
      }
    }

    carregar();
  }, []);

  const instrutores = useMemo(() => {
    return usuarios
      .filter((item) =>
        ["instrutor", "supervisor", "coordenador"].includes(
          String(item.perfil || "").toLowerCase()
        )
      )
      .map((item) => ({
        value: item.nome,
        label: `${item.nome}${item.cliente ? ` - ${item.cliente}` : ""}`,
      }));
  }, [usuarios]);

  const fields = [
    { name: "tema", label: "Turma / treinamento", placeholder: "Tema ou nome da turma" },
    { name: "cliente", label: "Cliente", placeholder: "Cliente vinculado" },
    {
      name: "instrutor",
      label: "Instrutor",
      type: "select",
      options: instrutores,
      placeholder: "Selecione o instrutor",
    },
    { name: "supervisor", label: "Supervisor", placeholder: "Supervisor responsável" },
    { name: "publico", label: "Público", placeholder: "Ex.: Operação, onboarding, reciclagem" },
    { name: "carga_horaria", label: "Carga horária total", placeholder: "Ex.: 20h" },
    {
      name: "participantes",
      label: "Treinandos previstos",
      type: "number",
      placeholder: "Quantidade prevista",
    },
    {
      name: "status",
      label: "Status da turma",
      type: "select",
      options: [
        { value: "planejado", label: "Planejada" },
        { value: "em_andamento", label: "Em andamento" },
        { value: "concluido", label: "Concluída" },
      ],
      placeholder: "Selecione o status",
    },
    { name: "data_inicio", label: "Data de início", type: "date" },
    { name: "data_fim", label: "Data de fim", type: "date" },
    {
      name: "descricao",
      label: "Observações",
      type: "textarea",
      placeholder: "Informações complementares",
    },
  ];

  const kpis = useMemo(() => {
    const total = turmas.length;
    const planejadas = turmas.filter((item) => statusLabel(item.status) === "Planejada").length;
    const andamento = turmas.filter((item) => statusLabel(item.status) === "Em andamento").length;
    const concluidas = turmas.filter((item) => statusLabel(item.status) === "Concluída").length;
    const treinandos = turmas.reduce((acc, item) => acc + Number(item.participantes || 0), 0);
    const horas = turmas.reduce((acc, item) => acc + parseHoras(item.carga_horaria), 0);

    const alertas = [];
    if (planejadas > 0) alertas.push(`${planejadas} turma(s) ainda estão planejadas.`);
    if (andamento > 0) alertas.push(`${andamento} turma(s) estão em andamento.`);
    if (!alertas.length) alertas.push("Base organizada, sem pendências críticas no momento.");

    return { total, planejadas, andamento, concluidas, treinandos, horas, alertas };
  }, [turmas]);

  const columns = [
    {
      key: "tema",
      label: "Turma",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.tema || item.titulo || "-"}</div>
          <div style={subCell}>
            {(item.cliente || "Sem cliente") + " • " + (item.instrutor || "Sem instrutor")}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (item) => (
        <span style={statusStyle(item.status)}>{statusLabel(item.status)}</span>
      ),
    },
    {
      key: "periodo",
      label: "Período",
      render: (item) => <span style={plainCell}>{formatPeriodo(item)}</span>,
    },
    {
      key: "participantes",
      label: "Treinandos previstos",
      render: (item) => <strong style={scoreBlue}>{fmt(item.participantes || 0)}</strong>,
    },
    {
      key: "carga_horaria",
      label: "Carga horária",
      render: (item) => <strong style={scoreGreen}>{item.carga_horaria || "-"}</strong>,
    },
    {
      key: "supervisor",
      label: "Supervisor",
      render: (item) => <span style={plainCell}>{item.supervisor || "-"}</span>,
    },
    {
      key: "acoes",
      label: "Ações",
      render: (item) => (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            style={btnChamada}
            onClick={() => {
              window.location.href = `/turma/${item.id}`;
            }}
          >
            Chamada diária
          </button>
        </div>
      ),
    },
  ];

  return (
    <CrudPageV2
      title="Gestão de Turmas"
      subtitle="Execução operacional das turmas com período de formação e controle de chamada diária."
      endpoint="/treinamentos"
      fields={fields}
      columns={columns}
      recordsTitle="Base de turmas"
      recordsSubtitle="Visão consolidada das turmas cadastradas no portal."
      allowedCreateRoles={["coordenador", "supervisor"]}
      allowedEditRoles={["coordenador", "supervisor"]}
      allowedDeleteRoles={["coordenador"]}
      hero={
        <div style={{ display: "grid", gap: 14 }}>
          <div style={heroGrid}>
            <StatCard title="Turmas" value={fmt(kpis.total)} subtitle="Base total" accent="#2563eb" />
            <StatCard title="Planejadas" value={fmt(kpis.planejadas)} subtitle="Aguardando execução" accent="#f59e0b" />
            <StatCard title="Em andamento" value={fmt(kpis.andamento)} subtitle="Turmas ativas" accent="#ea580c" />
            <StatCard title="Concluídas" value={fmt(kpis.concluidas)} subtitle="Ações finalizadas" accent="#16a34a" />
          </div>

          <div style={heroGrid}>
            <StatCard title="Treinandos previstos" value={fmt(kpis.treinandos)} subtitle="Capacidade da base" accent="#06b6d4" />
            <StatCard title="Carga horária total" value={`${fmt(kpis.horas)}h`} subtitle="Carga consolidada" accent="#7c3aed" />
          </div>

          <SectionCard
            title="Leitura gerencial"
            subtitle="Turmas com período permitem chamada diária sem perder o histórico da formação."
          >
            <div style={alertGrid}>
              {kpis.alertas.map((item, index) => (
                <div key={index} style={alertItem}>
                  {item}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      }
    />
  );
}

const btnChamada = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const heroGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const alertGrid = {
  display: "grid",
  gap: 10,
};

const alertItem = {
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
  borderRadius: 12,
  padding: 12,
  fontWeight: 600,
};

const titleCell = {
  fontWeight: 800,
  color: "#0f172a",
};

const subCell = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.35,
};

const plainCell = {
  color: "#334155",
};

const scoreBlue = {
  color: "#1d4ed8",
  fontWeight: 800,
};

const scoreGreen = {
  color: "#15803d",
  fontWeight: 800,
};
