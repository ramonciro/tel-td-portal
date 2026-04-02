"use client";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { useEffect, useMemo, useState } from "react";
import AccessGate from "../../components/AccessGate";
import CrudPageV2 from "../../components/CrudPageV2";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    async function carregar() {
      try {
        const res = await apiFetch("/clientes");
        const data = await res.json();
        setClientes(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Erro ao carregar clientes:", err);
        setClientes([]);
      }
    }
    carregar();
  }, []);

  const fields = [
    { name: "nome", label: "Cliente / Operação", placeholder: "Ex: Agibank, Claro, etc." },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "ativo", label: "Ativo" },
        { value: "inativo", label: "Inativo" },
      ],
    },
    { name: "supervisor", label: "Gestor de Referência", placeholder: "Responsável pela operação" },
    {
      name: "observacoes",
      label: "Observações",
      type: "textarea",
      placeholder: "Breve contexto sobre a operação ou particularidades do atendimento.",
    },
  ];

  const columns = [
    {
      key: "nome",
      label: "Operação",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.nome || "-"}</div>
          <div style={subCell}>{item.supervisor || "Sem gestor vinculado"}</div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (item) => (
        <span style={tagStatus(item.status)}>
          {String(item.status || "").toLowerCase() === "ativo" ? "Ativo" : "Inativo"}
        </span>
      ),
    },
    {
      key: "observacoes",
      label: "Observações",
      render: (item) => (
        <span style={descricaoCell}>{item.observacoes || "-"}</span>
      ),
    },
  ];

  const kpis = useMemo(() => {
    const total = clientes.length;
    const ativos = clientes.filter(c => String(c.status).toLowerCase() === "ativo").length;
    const comGestor = clientes.filter(c => c.supervisor && c.supervisor.trim() !== "").length;

    return { total, ativos, comGestor };
  }, [clientes]);

  return (
    <AccessGate allowed={["admin", "coordenador", "supervisor"]}>
      <CrudPageV2
        title="Clientes"
        subtitle="Gestão das operações acompanhadas pelo Treinamento & Desenvolvimento."
        endpoint="/clientes"
        fields={fields}
        columns={columns}
        recordsTitle="Carteira de Clientes"
        recordsSubtitle="Listagem detalhada das operações cadastradas."
        // Apenas coordenadores podem excluir clientes para evitar perda de histórico acidental
        allowedDeleteRoles={["coordenador"]} 
        hero={
          <div style={heroWrap}>
            <div style={heroText}>
              <div style={heroEyebrow}>Gestão de Operações</div>
              <h2 style={heroTitle}>Carteira de Clientes</h2>
              <p style={heroSubtitle}>
                Cadastre e gerencie as operações. Estes nomes aparecerão nos filtros do Dashboard 
                e nos vínculos de usuários multioperação.
              </p>
            </div>

            <div style={statsWrap}>
              <StatCard title="Total" value={fmt(kpis.total)} subtitle="Clientes na base" accent="#2563eb" />
              <StatCard title="Ativos" value={fmt(kpis.ativos)} subtitle="Operações em curso" accent="#16a34a" />
              <StatCard title="Com Gestor" value={fmt(kpis.comGestor)} subtitle="Vínculo de liderança" accent="#7c3aed" />
            </div>
          </div>
        }
      />
    </AccessGate>
  );
}

// Estilização consistente com o Portal
const titleCell = { fontWeight: 800, color: "#0f172a", fontSize: 14 };
const subCell = { marginTop: 2, color: "#64748b", fontSize: 12 };
const descricaoCell = { color: "#475569", fontSize: 13, lineHeight: 1.5, maxWidth: 400 };

const heroWrap = { display: "grid", gap: 16, marginBottom: 8 };
const heroText = {
  background: "linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)",
  border: "1px solid #dbeafe",
  borderRadius: 20,
  padding: 24,
};

const heroEyebrow = {
  display: "inline-block",
  padding: "4px 12px",
  borderRadius: 999,
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 11,
  textTransform: "uppercase",
};

const heroTitle = { margin: "12px 0 8px", color: "#0f172a", fontSize: 24, fontWeight: 900 };
const heroSubtitle = { margin: 0, color: "#64748b", fontSize: 14, lineHeight: 1.6, maxWidth: 600 };
const statsWrap = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 };

function tagStatus(status) {
  const isAtivo = String(status || "").toLowerCase() === "ativo";
  return {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
    background: isAtivo ? "#dcfce7" : "#fee2e2",
    color: isAtivo ? "#166534" : "#b91c1c",
  };
}
