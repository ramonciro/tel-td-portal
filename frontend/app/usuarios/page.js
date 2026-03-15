"use client";
import { useEffect, useMemo, useState } from "react";
import AccessGate from "../../components/AccessGate";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

export default function UsuariosPage() {
  const [clientes, setClientes] = useState([]);
  useEffect(() => {
    async function loadClientes() {
      try {
        const data = await apiFetch("/clientes");
        setClientes((Array.isArray(data) ? data : []).map((item) => ({ value: item.nome || item.cliente || item.id, label: item.nome || item.cliente || item.id })));
      } catch {
        setClientes([]);
      }
    }
    loadClientes();
  }, []);

  const fields = useMemo(() => [
    { name: "nome", label: "Nome", placeholder: "Nome completo" },
    { name: "email", label: "E-mail", type: "email", placeholder: "email@empresa.com" },
    { name: "senha", label: "Senha", type: "text", placeholder: "Senha do usuário" },
    { name: "perfil", label: "Perfil", type: "select", options: [
      { value: "admin", label: "Admin" }, { value: "coordenador", label: "Coordenador" }, { value: "supervisor", label: "Supervisor" }, { value: "instrutor", label: "Instrutor" }, { value: "treinando", label: "Treinando" }
    ]},
    { name: "cliente", label: "Cliente", type: "select", options: [{ value: "GLOBAL", label: "GLOBAL" }, ...clientes] },
    { name: "ativo", label: "Status", type: "select", options: [{ value: 1, label: "Ativo" }, { value: 0, label: "Inativo" }]},
    { name: "troca_senha_obrigatoria", label: "Primeiro acesso / troca obrigatória", type: "select", options: [{ value: 1, label: "Sim" }, { value: 0, label: "Não" }]},
  ], [clientes]);

  const columns = [
    { key: "nome", label: "Nome" },
    { key: "email", label: "E-mail" },
    { key: "perfil", label: "Perfil", render: (item) => String(item.perfil || "-").toUpperCase() },
    { key: "cliente", label: "Cliente" },
    { key: "ativo", label: "Status", render: (item) => Number(item.ativo) === 1 ? "Ativo" : "Inativo" },
    { key: "troca_senha_obrigatoria", label: "Primeiro acesso", render: (item) => Number(item.troca_senha_obrigatoria) === 1 ? "Pendente" : "Concluído" },
  ];

  return (
    <AccessGate allowed={["admin", "coordenador", "supervisor"]}>
      <CrudPageV2
        title="Gestão de usuários"
        subtitle="Área restrita para coordenação, admin e supervisores, com leitura mais clara sobre perfis, acesso e primeiro acesso."
        endpoint="/usuarios"
        fields={fields}
        columns={columns}
        recordsSubtitle="Tabela mais dinâmica para leitura rápida dos perfis cadastrados."
        hero={<><StatCard title="Controle de acesso" value="Gestão" subtitle="Cadastre perfis, vincule clientes e acompanhe a necessidade de primeiro acesso." accent="#2563eb" /><SectionCard title="Observação de negócio" subtitle="O status 1/0 foi traduzido visualmente para facilitar leitura do time."><p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>Nesta tela, o campo de primeiro acesso foi ajustado para leitura mais humana, evitando confusão visual e melhorando o uso operacional.</p></SectionCard></>}
      />
    </AccessGate>
  );
}
