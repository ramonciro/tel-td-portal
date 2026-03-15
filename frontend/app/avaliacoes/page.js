"use client";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function media(arr, field) {
  if (!arr.length) return "0.0";
  const total = arr.reduce((acc, item) => acc + Number(item?.[field] || 0), 0);
  return (total / arr.length).toFixed(1);
}

export default function AvaliacoesPage() {
  const [treinamentos, setTreinamentos] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);

  useEffect(() => {
    async function carregarBase() {
      try {
        const [treinamentosData, avaliacoesData] = await Promise.all([
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/avaliacoes").catch(() => []),
        ]);

        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
        setAvaliacoes(Array.isArray(avaliacoesData) ? avaliacoesData : []);
      } catch {
        setTreinamentos([]);
        setAvaliacoes([]);
      }
    }

    carregarBase();
  }, []);

  const treinamentoOptions = useMemo(() => {
    return treinamentos.map((item) => ({
      value: item.id,
      label: `${item.tema || item.titulo || "Treinamento"}${
        item.cliente ? ` - ${item.cliente}` : ""
      }`,
    }));
  }, [treinamentos]);

  const fields = useMemo(
    () => [
      {
        name: "treinamento_id",
        label: "Treinamento",
        type: "select",
        options: treinamentoOptions,
        placeholder: "Selecione o treinamento",
      },
      {
        name: "tipo_registro",
        label: "Tipo",
        type: "select",
        options: [
          { value: "Avaliação", label: "Avaliação" },
          { value: "Prova", label: "Prova" },
          { value: "Teste", label: "Teste" },
          { value: "Simulado", label: "Simulado" },
        ],
        placeholder: "Selecione o tipo",
      },
      {
        name: "titulo",
        label: "Título",
        placeholder: "Nome da avaliação ou atividade",
      },
      {
        name: "nota_nps",
        label: "NPS / satisfação",
        type: "number",
        placeholder: "0 a 10",
      },
      {
        name: "nota_qualidade",
        label: "Qualidade / aproveitamento",
        type: "number",
        placeholder: "Nota ou percentual",
      },
      {
        name: "observacoes",
        label: "Observações",
        type: "textarea",
        placeholder: "Comentários rápidos",
      },
    ],
    [treinamentoOptions]
  );

  const columns = [
    {
      key: "tipo_registro",
      label: "Tipo",
      render: (item) => <span style={tipoBadge}>{item.tipo_registro || "-"}</span>,
    },
    {
      key: "treinamento_id",
      label: "Treinamento",
      render: (item) => {
        const treinamento = treinamentos.find(
          (t) => String(t.id) === String(item.treinamento_id)
        );

        return (
          <div>
            <div style={titleCell}>
              {treinamento?.tema || treinamento?.titulo || "Treinamento"}
            </div>
            <div style={subCell}>{treinamento?.cliente || "Sem cliente"}</div>
          </div>
        );
      },
    },
    {
      key: "titulo",
      label: "Título",
      render: (item) => <span style={plainCell}>{item.titulo || "-"}</span>,
    },
    {
      key: "nota_nps",
      label: "NPS",
      render: (item) => <strong style={scoreBlue}>{item.nota_nps ?? "-"}</strong>,
    },
    {
      key: "nota_qualidade",
      label: "Qualidade",
      render: (item) => (
        <strong style={scoreGreen}>{item.nota_qualidade ?? "-"}</strong>
      ),
    },
    {
      key: "observacoes",
      label: "Observações",
      render: (item) => <span style={obsCell}>{item.observacoes || "-"}</span>,
    },
  ];

  const totalAvaliacoes = avaliacoes.length;
  const mediaNps = media(avaliacoes, "nota_nps");
  const mediaQualidade = media(avaliacoes, "nota_qualidade");
  const provasETestes = avaliacoes.filter((item) =>
    ["Prova", "Teste", "Simulado"].includes(String(item.tipo_registro || ""))
  ).length;

  return (
    <CrudPageV2
      title="Avaliações"
      subtitle="Registros de avaliação, provas, testes e simulados."
      endpoint="/avaliacoes"
      fields={fields}
      columns={columns}
      recordsTitle="Registros de avaliação"
      recordsSubtitle="Base consolidada das medições aplicadas."
      hero={
        <div style={heroGrid}>
          <StatCard
            title="Avaliações"
            value={fmt(totalAvaliacoes)}
            subtitle="Registros lançados"
            accent="#dc2626"
          />
          <StatCard
            title="NPS médio"
            value={mediaNps}
            subtitle="Percepção do treinamento"
            accent="#2563eb"
          />
          <StatCard
            title="Qualidade média"
            value={mediaQualidade}
            subtitle="Aproveitamento geral"
            accent="#059669"
          />
          <StatCard
            title="Provas e testes"
            value={fmt(provasETestes)}
            subtitle="Verificações registradas"
            accent="#7c3aed"
          />
        </div>
      }
    />
  );
}

const heroGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const tipoBadge = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: 999,
  background: "#eef2ff",
  color: "#4338ca",
  fontWeight: 800,
  fontSize: 11,
};

const titleCell = {
  fontWeight: 800,
  color: "#0f172a",
};

const subCell = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 12,
};

const plainCell = {
  color: "#334155",
  fontWeight: 600,
};

const obsCell = {
  display: "inline-block",
  maxWidth: 260,
  color: "#475569",
  lineHeight: 1.45,
};

const scoreBlue = {
  color: "#1d4ed8",
  fontWeight: 800,
};

const scoreGreen = {
  color: "#15803d",
  fontWeight: 800,
};
