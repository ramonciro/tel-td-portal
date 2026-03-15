"use client";

import { useEffect, useState } from "react";
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
    { name: "segmento", label: "Segmento", placeholder: "Ex.: Banco, Telecom, Público" },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "ativo", label: "Ativo" },
        { value: "inativo", label: "Inativo" }
      ]
    },
    { name: "gestor", label: "Gestor / referência", placeholder: "Responsável pela operação" },
    { name: "descricao", label: "Descrição", type: "textarea", placeholder: "Contexto resumido da operação" }
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
      )
    },
    {
      key: "status",
      label: "Status",
      render: (item) => (
        <span style={Number(String(item.status).toLowerCase() === "ativo") ? tagAtivo : tagInativo}>
          {String(item.status || "-").toLowerCase() === "ativo" ? "Ativo" : "Inativo"}
        </span>
      )
    },
    {
      key: "gestor",
      label: "Gestor / referência",
      render: (item) => <span style={plainCell}>{item.gestor || "-"}</span>
    },
    {
      key: "descricao",
      label: "Descrição",
      render: (item) => <span style={descricaoCell}>{item.descricao || "-"}</span>
    }
  ];

  const totalClientes = clientes.length;
  const ativos = clientes.filter((c) => String(c.status || "").toLowerCase() === "ativo").length;
  const inativos = clientes.filter((c) => String(c.status || "").toLowerCase() === "inativo").length;
  const segmentos = new Set(clientes.map((c) => c.segmento).filter(Boolean)).size;

  return (
    <AccessGate allowed={["admin", "coordenador", "supervisor"]}>
      <CrudPageV2
        title="Clientes"
        subtitle="Gestão das operações acompanhadas pelo Treinamento & Desenvolvimento."
        endpoint="/clientes"
        fields={fields}
        columns={columns}
        recordsSubtitle="Base de operações do portal."
        hero={
          <div style={heroWrap}>
            <div style={heroText}>
              <div style={heroEyebrow}>Operações T&D</div>
              <h2 style={heroTitle}>Carteira de clientes acompanhados pelo setor</h2>
              <p style={heroSubtitle}>
                Visão consolidada das operações cadastradas no portal, com leitura mais executiva e foco na gestão do ambiente multicliente.
              </p>
            </div>

            <div style={statsWrap}>
              <StatCard title="Clientes" value={totalClientes} subtitle="Base total" accent="#2563eb" />
              <StatCard title="Ativos" value={ativos} subtitle="Operações em andamento" accent="#059669" />
              <StatCard title="Inativos" value={inativos} subtitle="Operações sem atividade" accent="#dc2626" />
              <StatCard title="Segmentos" value={segmentos} subtitle="Diversidade de carteira" accent="#7c3aed" />
            </div>
          </div>
        }
      />
    </AccessGate>
  );
}

const heroWrap = {
  display: "grid",
  gap: 16
};

const heroText = {
  background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)",
  border: "1px solid #dbeafe",
  borderRadius: 20,
  padding: 22
};

const heroEyebrow = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".03em"
};

const heroTitle = {
  margin: "14px 0 8px",
  color: "#0f172a",
  fontSize: 28,
  lineHeight: 1.1
};

const heroSubtitle = {
  margin: 0,
  color: "#64748b",
  lineHeight: 1.65
};

const statsWrap = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
  gap: 14
};

const titleCell = {
  fontWeight: 800,
  color: "#0f172a"
};

const subCell = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 13
};

const plainCell = {
  color: "#334155",
  fontWeight: 600
};

const descricaoCell = {
  color: "#475569",
  display: "inline-block",
  maxWidth: 300,
  lineHeight: 1.55
};

const tagBase = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 12
};

const tagAtivo = {
  ...tagBase,
  background: "#dcfce7",
  color: "#166534"
};

const tagInativo = {
  ...tagBase,
  background: "#fee2e2",
  color: "#b91c1c"
};
