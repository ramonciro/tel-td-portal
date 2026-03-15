"use client";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";

export default function MapaDesenvolvimentoPage() {
  const fields = [
    { name: "colaborador", label: "Colaborador", placeholder: "Nome do colaborador" },
    { name: "cliente", label: "Cliente", placeholder: "Cliente" },
    { name: "cargo", label: "Cargo", placeholder: "Cargo atual" },
    { name: "objetivo_profissional", label: "Objetivo profissional", placeholder: "Direção de desenvolvimento" },
    { name: "pontos_fortes", label: "Pontos fortes", type: "textarea", placeholder: "Competências observadas" },
    { name: "gaps_desenvolvimento", label: "Gaps de desenvolvimento", type: "textarea", placeholder: "Oportunidades de evolução" },
    { name: "acoes_recomendadas", label: "Ações recomendadas", type: "textarea", placeholder: "Planos, trilhas ou ações sugeridas" },
    { name: "status", label: "Status", type: "select", options: [{ value: "Em acompanhamento", label: "Em acompanhamento" }, { value: "Em desenvolvimento", label: "Em desenvolvimento" }, { value: "Concluído", label: "Concluído" }]},
  ];

  const columns = [
    { key: "colaborador", label: "Colaborador" }, { key: "cliente", label: "Cliente" }, { key: "cargo", label: "Cargo" }, { key: "objetivo_profissional", label: "Objetivo profissional" }, { key: "status", label: "Status" },
  ];

  return (
    <CrudPageV2
      title="Mapa de desenvolvimento"
      subtitle="Leitura mais gerencial do desenvolvimento individual, conectando objetivos, gaps e ações recomendadas."
      endpoint="/mapa-desenvolvimento"
      fields={fields}
      columns={columns}
      recordsSubtitle="Acompanhamento do desenvolvimento com foco em leitura gerencial."
      hero={<><StatCard title="Desenvolvimento individual" value="Acompanhamento" subtitle="Visualize evolução, gaps e planos de ação por colaborador." accent="#7c3aed" /><SectionCard title="Leitura de gestão" subtitle="Esta página tende a se tornar uma das mais estratégicas do portal."><p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>O mapa de desenvolvimento ajuda a transformar o T&D em visão prática de evolução de pessoas, apoiando líderes, supervisores e coordenação.</p></SectionCard></>}
    />
  );
}
