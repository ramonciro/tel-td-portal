"use client";

import { useEffect, useState } from "react";
import AccessGate from "../../components/AccessGate";
import CrudPageV2 from "../../components/CrudPageV2";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { colors, chart } from "../../lib/theme";

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
    {
      name: "nome",
      label: "Cliente",
      placeholder: "Nome do cliente",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "ativo", label: "Ativo" },
        { value: "inativo", label: "Inativo" },
      ],
    },
    {
      name: "supervisor",
      label: "Gestor / referência",
      placeholder: "Responsável pela operação",
    },
    {
      name: "observacoes",
      label: "Observações",
      type: "textarea",
      placeholder: "Contexto resumido da operação",
    },
  ];

  const columns = [
    {
      key: "nome",
      label: "Cliente",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.nome || "-"}</div>
          <div style={subCell}>
            {item.supervisor || "Sem responsável informado"}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (item) => (
        <span style={tagStatus(item.status)}>
          {String(item.status || "-").toLowerCase() === "ativo"
            ? "Ativo"
            : "Inativo"}
        </span>
      ),
    },
    {
      key: "supervisor",
      label: "Gestor / referência",
      render: (item) => (
        <span style={plainCell}>{item.supervisor || "-"}</span>
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

  const totalClientes = clientes.length;
  const ativos = clientes.filter(
    (c) => String(c.status || "").toLowerCase() === "ativo"
  ).length;
  const inativos = clientes.filter(
    (c) => String(c.status || "").toLowerCase() === "inativo"
  ).length;
  const comResponsavel = clientes.filter((c) => c.supervisor).length;

  return (
    <AccessGate allowed={["admin", "coordenador", "supervisor"]}>
      <CrudPageV2
        endpoint="/clientes"
        fields={fields}
        columns={columns}
        recordsSubtitle="Base de operações do portal."
        hero={
          <div style={heroWrap}>
            <div style={heroText}>
              <div style={heroEyebrow}>Operações T&D</div>
              <h2 style={heroTitle}>
                Carteira de clientes acompanhados pelo setor
              </h2>
              <p style={heroSubtitle}>
                Visão consolidada das operações cadastradas no portal, com foco
                em organização, leitura executiva e gestão do ambiente
                multicliente.
              </p>
            </div>

            <div style={statsWrap}>
              <StatCard
                title="Clientes"
                value={totalClientes}
                subtitle="Base total"
                accent={chart.blue}
              />
              <StatCard
                title="Ativos"
                value={ativos}
                subtitle="Operações em andamento"
                accent={colors.success}
              />
              <StatCard
                title="Inativos"
                value={inativos}
                subtitle="Operações sem atividade"
                accent={colors.danger}
              />
              <StatCard
                title="Com responsável"
                value={comResponsavel}
                subtitle="Referência cadastrada"
                accent={chart.purple}
              />
            </div>
          </div>
        }
      />
    </AccessGate>
  );
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

  if (key === "ativo") {
    return {
      ...base,
      background: "#dcfce7",
      color: "#166534",
    };
  }

  return {
    ...base,
    background: "#fee2e2",
    color: "#b91c1c",
  };
}

const heroWrap = {
  display: "grid",
  gap: 16,
};

const heroText = {
  background: "linear-gradient(135deg, #0B1220 0%, #161D2E 100%)",
  border: "none",
  borderRadius: 20,
  padding: 22,
  boxShadow: "0 18px 36px rgba(11,18,32,.18)",
};

const heroEyebrow = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.12)",
  color: "#fff",
  fontWeight: 800,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".03em",
};

const heroTitle = {
  margin: "14px 0 8px",
  color: "#fff",
  fontSize: 28,
  lineHeight: 1.1,
};

const heroSubtitle = {
  margin: 0,
  color: "#C7CCDA",
  lineHeight: 1.65,
};

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
  maxWidth: 320,
  lineHeight: 1.55,
};
