"use client";

import { useEffect, useMemo, useState } from "react";
import AccessGate from "../../components/AccessGate";
import CrudPageV2 from "../../components/CrudPageV2";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

export default function ClientesPage() {
  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    async function carregar() {
      try {
        const data = await apiFetch("/clientes").catch(() => []);
        setClientes(Array.isArray(data) ? data : []);
      } catch {
        setClientes([]);
      }
    }
    carregar();
  }, []);

  const fields = [
    { name: "nome", label: "Cliente", placeholder: "Nome do cliente" },
    { name: "segmento", label: "Segmento", placeholder: "Ex.: financeiro, telecom, público" },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "ativo", label: "Ativo" },
        { value: "implantacao", label: "Implantação" },
        { value: "pausado", label: "Pausado" },
        { value: "encerrado", label: "Encerrado" },
      ],
    },
    { name: "gestor", label: "Gestor / referência", placeholder: "Responsável pela operação" },
    { name: "descricao", label: "Descrição", type: "textarea", placeholder: "Contexto, observações e visão da operação" },
  ];

  const columns = [
    {
      key: "nome",
      label: "Cliente",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.nome || "-"}</div>
          <div style={subCell}>{item.segmento || "Segmento não informado"}</div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (item) => <span style={tagStatus(item.status)}>{formatText(item.status)}</span>,
    },
    {
      key: "gestor",
      label: "Gestor / referência",
      render: (item) => <span style={plainCell}>{item.gestor || "-"}</span>,
    },
    {
      key: "descricao",
      label: "Descrição",
      render: (item) => <span style={descricaoCell}>{item.descricao || "-"}</span>,
    },
  ];

  const totalClientes = clientes.length;
  const ativos = clientes.filter((c) => String(c.status || "").toLowerCase() === "ativo").length;
  const implantacao = clientes.filter((c) => String(c.status || "").toLowerCase() === "implantacao").length;
  const pausados = clientes.filter((c) => String(c.status || "").toLowerCase() === "pausado").length;

  return (
    <AccessGate allowed={["admin", "coordenador", "supervisor"]}>
      <CrudPageV2
        title="Clientes"
        subtitle="Base estratégica das operações acompanhadas pelo Treinamento & Desenvolvimento."
        endpoint="/clientes"
        fields={fields}
        columns={columns}
        recordsSubtitle="Operações cadastradas no portal."
        hero={
          <div style={statsWrap}>
            <StatCard title="Clientes" value={totalClientes} subtitle="Base total" accent="#2563eb" />
            <StatCard title="Ativos" value={ativos} subtitle="Operações em andamento" accent="#059669" />
            <StatCard title="Implantação" value={implantacao} subtitle="Em estruturação" accent="#7c3aed" />
            <StatCard title="Pausados" value={pausados} subtitle="Operações pausadas" accent="#ea580c" />
          </div>
        }
      />
    </AccessGate>
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
    ativo: { background: "#dcfce7", color: "#166534" },
    implantacao: { background: "#ede9fe", color: "#6d28d9" },
    pausado: { background: "#fef3c7", color: "#92400e" },
    encerrado: { background: "#fee2e2", color: "#b91c1c" },
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
};

const plainCell = {
  color: "#334155",
  fontWeight: 600,
};

const descricaoCell = {
  color: "#475569",
  display: "inline-block",
  maxWidth: 280,
  lineHeight: 1.55,
};
