"use client";
import AccessGate from "../../components/AccessGate";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";

export default function ClientesPage() {
  const fields = [
    { name: "nome", label: "Cliente", placeholder: "Nome do cliente" },
    { name: "segmento", label: "Segmento", placeholder: "Ex.: financeiro, telecom, público" },
    { name: "status", label: "Status", type: "select", options: [{ value: "Ativo", label: "Ativo" }, { value: "Planejamento", label: "Planejamento" }, { value: "Inativo", label: "Inativo" }]},
    { name: "gestor", label: "Gestor / referência", placeholder: "Responsável principal" },
    { name: "descricao", label: "Descrição", type: "textarea", placeholder: "Contexto do cliente e observações relevantes" },
  ];

  const columns = [
    { key: "nome", label: "Cliente" }, { key: "segmento", label: "Segmento" }, { key: "status", label: "Status" }, { key: "gestor", label: "Gestor / referência" }, { key: "descricao", label: "Descrição" },
  ];

  return (
    <AccessGate allowed={["admin", "coordenador", "supervisor"]}>
      <CrudPageV2
        title="Clientes e operações acompanhadas"
        subtitle="Leitura mais organizada e estratégica do portfólio de clientes atendidos pelo T&D."
        endpoint="/clientes"
        fields={fields}
        columns={columns}
        recordsSubtitle="Tabela centralizada visualmente e pensada para leitura executiva."
        hero={<><StatCard title="Carteira acompanhada" value="Estratégica" subtitle="Organize clientes e fortaleça a visão do T&D por operação." accent="#2563eb" /><SectionCard title="Uso recomendado" subtitle="A tela de clientes ajuda a estruturar todas as páginas seguintes."><p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>Uma visão bem organizada de clientes melhora filtros, vinculações e leitura do trabalho do time ao longo de todo o portal.</p></SectionCard></>}
      />
    </AccessGate>
  );
}
