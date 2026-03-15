"use client";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

export default function TreinamentosPage() {
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [treinamentos, setTreinamentos] = useState([]);

  useEffect(() => {
    async function carregarBase() {
      try {
        const [clientesData, usuariosData, treinamentosData] = await Promise.all([
          apiFetch("/clientes").catch(() => []),
          apiFetch("/usuarios").catch(() => []),
          apiFetch("/treinamentos").catch(() => []),
        ]);

        setClientes(Array.isArray(clientesData) ? clientesData : []);
        setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
      } catch {
        setClientes([]);
        setUsuarios([]);
        setTreinamentos([]);
      }
    }
    carregarBase();
  }, []);

  const clienteOptions = useMemo(
    () => clientes.map((item) => ({
      value: item.nome || item.id,
      label: item.nome || item.id,
    })),
    [clientes]
  );

  const instrutoresOptions = useMemo(
    () =>
      usuarios
        .filter((item) => String(item.perfil || "").toLowerCase() === "instrutor")
        .map((item) => ({
          value: item.nome || item.id,
          label: item.nome || item.email || item.id,
        })),
    [usuarios]
  );

  const fields = useMemo(
    () => [
      { name: "titulo", label: "Treinamento", placeholder: "Nome do treinamento" },
      {
        name: "cliente",
        label: "Cliente",
        type: "select",
        options: clienteOptions,
      },
      {
        name: "instrutor",
        label: "Instrutor",
        type: "select",
        options: instrutoresOptions,
      },
      { name: "carga_horaria", label: "Carga horária", placeholder: "Ex.: 4h, 8h, 16h" },
      { name: "publico", label: "Público", placeholder: "Ex.: novos colaboradores, reciclagem, liderança" },
      {
        name: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "planejado", label: "Planejado" },
          { value: "em_andamento", label: "Em andamento" },
          { value: "concluido", label: "Concluído" },
          { value: "pausado", label: "Pausado" },
        ],
      },
      { name: "descricao", label: "Objetivo, foco e observações", type: "textarea", placeholder: "Descreva o foco do treinamento" },
    ],
    [clienteOptions, instrutoresOptions]
  );

  const columns = [
    {
      key: "titulo",
      label: "Treinamento",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.titulo || "-"}</div>
          <div style={subCell}>{item.descricao || "Sem observação cadastrada"}</div>
        </div>
      ),
    },
    { key: "cliente", label: "Cliente" },
    { key: "instrutor", label: "Instrutor" },
    {
      key: "carga_horaria",
      label: "Carga horária",
      render: (item) => <span style={hoursTag}>{item.carga_horaria || "0h"}</span>,
    },
    { key: "publico", label: "Público" },
    {
      key: "status",
      label: "Status",
      render: (item) => <span style={tagStatus(item.status)}>{formatText(item.status)}</span>,
    },
  ];

  const totalTreinamentos = treinamentos.length;
  const emAndamento = treinamentos.filter((t) => String(t.status || "").toLowerCase() === "em_andamento").length;
  const concluidos = treinamentos.filter((t) => String(t.status || "").toLowerCase() === "concluido").length;
  const clientesAtendidos = new Set(treinamentos.map((t) => t.cliente).filter(Boolean)).size;

  return (
    <CrudPageV2
      title="Treinamentos"
      subtitle="Gestão das ações formativas do time, com leitura mais dinâmica e foco real na rotina de T&D."
      endpoint="/treinamentos"
      fields={fields}
      columns={columns}
      recordsSubtitle="Turmas, ações formativas e registros do setor."
      hero={
        <div style={statsWrap}>
          <StatCard title="Treinamentos" value={totalTreinamentos} subtitle="Base total" accent="#2563eb" />
          <StatCard title="Em andamento" value={emAndamento} subtitle="Ações ativas" accent="#059669" />
          <StatCard title="Concluídos" value={concluidos} subtitle="Treinamentos finalizados" accent="#7c3aed" />
          <StatCard title="Clientes atendidos" value={clientesAtendidos} subtitle="Cobertura atual" accent="#ea580c" />
        </div>
      }
    />
  );
}

function formatText(value) {
  if (!value) return "-";
  const text = String(value).replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function tagStatus(status) {
  const key = String(status || "").toLowerCase();
  const base = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
  };

  const map = {
    planejado: { background: "#dbeafe", color: "#1d4ed8" },
    em_andamento: { background: "#dcfce7", color: "#166534" },
    concluido: { background: "#ede9fe", color: "#6d28d9" },
    pausado: { background: "#fef3c7", color: "#92400e" },
  };

  return { ...base, ...(map[key] || { background: "#e5e7eb", color: "#374151" }) };
}

const statsWrap = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
  gap: 14,
};

const titleCell = {
  fontWeight: 800,
  color: "#0f172a",
};

const subCell = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.45,
  maxWidth: 320,
};

const hoursTag = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 12,
};
