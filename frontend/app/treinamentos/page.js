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
    () =>
      clientes.map((item) => ({
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
      {
        name: "nome",
        label: "Treinamento",
        placeholder: "Nome do treinamento",
      },
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
      {
        name: "carga_horaria",
        label: "Carga horária",
        placeholder: "Ex.: 4h, 8h, 16h",
      },
      {
        name: "publico",
        label: "Público",
        placeholder: "Ex.: integração, reciclagem, liderança",
      },
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
      {
        name: "descricao",
        label: "Objetivo e observações",
        type: "textarea",
        placeholder: "Objetivo, foco e observações do treinamento",
      },
    ],
    [clienteOptions, instrutoresOptions]
  );

  const columns = [
    {
      key: "nome",
      label: "Treinamento",
      render: (item) => (
        <div style={courseCard}>
          <div style={courseTop}>
            <span style={tagStatus(item.status)}>
              {formatText(item.status)}
            </span>
            <span style={hoursTag}>{item.carga_horaria || "0h"}</span>
          </div>

          <div style={courseTitle}>{item.nome || "-"}</div>

          <div style={courseMeta}>
            <span>{item.cliente || "Sem cliente"}</span>
            <span>•</span>
            <span>{item.instrutor || "Sem instrutor"}</span>
          </div>

          <div style={courseAudience}>
            {item.publico || "Público não informado"}
          </div>

          <div style={courseDescription}>
            {item.descricao || "Sem observações cadastradas."}
          </div>
        </div>
      ),
    },
  ];

  const totalTreinamentos = treinamentos.length;
  const emAndamento = treinamentos.filter(
    (t) => String(t.status || "").toLowerCase() === "em_andamento"
  ).length;
  const concluidos = treinamentos.filter(
    (t) => String(t.status || "").toLowerCase() === "concluido"
  ).length;
  const clientesAtendidos = new Set(
    treinamentos.map((t) => t.cliente).filter(Boolean)
  ).size;

  return (
    <CrudPageV2
      title="Treinamentos"
      subtitle="Ambiente formativo do portal, com leitura mais dinâmica e aderente à rotina de T&D."
      endpoint="/treinamentos"
      fields={fields}
      columns={columns}
      recordsSubtitle="Turmas, ações formativas e planejamentos do setor."
      recordsMode="cards"
      hero={
        <div style={heroWrap}>
          <div style={heroBanner}>
            <div style={heroEyebrow}>Ambiente formativo</div>
            <h2 style={heroTitle}>
              Gestão de treinamentos com leitura mais dinâmica e didática
            </h2>
            <p style={heroSubtitle}>
              Estrutura pensada para organizar jornadas de aprendizagem,
              reciclagens, integrações e ações formativas com mais clareza
              visual.
            </p>
          </div>

          <div style={statsWrap}>
            <StatCard
              title="Treinamentos"
              value={totalTreinamentos}
              subtitle="Base total"
              accent="#2563eb"
            />
            <StatCard
              title="Em andamento"
              value={emAndamento}
              subtitle="Ações ativas"
              accent="#059669"
            />
            <StatCard
              title="Concluídos"
              value={concluidos}
              subtitle="Finalizados"
              accent="#7c3aed"
            />
            <StatCard
              title="Clientes atendidos"
              value={clientesAtendidos}
              subtitle="Cobertura atual"
              accent="#ea580c"
            />
          </div>
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

  return {
    ...base,
    ...(map[key] || { background: "#e5e7eb", color: "#374151" }),
  };
}

const heroWrap = {
  display: "grid",
  gap: 16,
};

const heroBanner = {
  background: "linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)",
  border: "1px solid #dbeafe",
  borderRadius: 20,
  padding: 22,
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
  letterSpacing: ".03em",
};

const heroTitle = {
  margin: "14px 0 8px",
  color: "#0f172a",
  fontSize: 28,
  lineHeight: 1.1,
};

const heroSubtitle = {
  margin: 0,
  color: "#64748b",
  lineHeight: 1.65,
};

const statsWrap = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
  gap: 14,
};

const courseCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  display: "grid",
  gap: 10,
};

const courseTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const courseTitle = {
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 18,
  lineHeight: 1.2,
};

const courseMeta = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#475569",
  fontWeight: 600,
  fontSize: 14,
};

const courseAudience = {
  color: "#64748b",
  lineHeight: 1.5,
  fontSize: 14,
  fontWeight: 600,
};

const courseDescription = {
  color: "#64748b",
  lineHeight: 1.6,
  fontSize: 14,
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
