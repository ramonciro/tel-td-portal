
"use client";

import { useEffect, useMemo, useState } from "react";
import AccessGate from "../../components/AccessGate";
import CrudPageV2 from "../../components/CrudPageV2";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

export default function UsuariosPage() {
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    async function carregarBase() {
      try {
        const [clientesData, usuariosData] = await Promise.all([
          apiFetch("/clientes").catch(() => []),
          apiFetch("/usuarios").catch(() => []),
        ]);

        setClientes(Array.isArray(clientesData) ? clientesData : []);
        setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
      } catch {
        setClientes([]);
        setUsuarios([]);
      }
    }

    carregarBase();
  }, []);

  const clienteOptions = useMemo(
    () => [
      { value: "GLOBAL", label: "GLOBAL" },
      ...clientes.map((item) => ({
        value: item.nome || item.cliente || item.id,
        label: item.nome || item.cliente || item.id,
      })),
    ],
    [clientes]
  );

  const fields = useMemo(
    () => [
      { name: "nome", label: "Nome", placeholder: "Nome completo" },
      { name: "email", label: "E-mail", type: "email", placeholder: "email@empresa.com" },
      { name: "senha", label: "Senha", type: "text", placeholder: "Senha de acesso" },
      {
        name: "perfil",
        label: "Perfil",
        type: "select",
        options: [
          { value: "admin", label: "Admin" },
          { value: "coordenador", label: "Coordenador" },
          { value: "supervisor", label: "Supervisor" },
          { value: "instrutor", label: "Instrutor" },
          { value: "treinando", label: "Treinando" },
        ],
      },
      {
        name: "cliente",
        label: "Cliente",
        type: "select",
        options: clienteOptions,
      },
      {
        name: "ativo",
        label: "Status",
        type: "select",
        options: [
          { value: 1, label: "Ativo" },
          { value: 0, label: "Inativo" },
        ],
      },
      {
        name: "troca_senha_obrigatoria",
        label: "Primeiro acesso",
        type: "select",
        options: [
          { value: 1, label: "Primeiro acesso pendente" },
          { value: 0, label: "Senha já definida" },
        ],
      },
    ],
    [clienteOptions]
  );

  const columns = [
    { key: "nome", label: "Nome" },
    { key: "email", label: "E-mail" },
    {
      key: "perfil",
      label: "Perfil",
      render: (item) => (
        <span style={tagPerfil(String(item.perfil || "").toLowerCase())}>
          {String(item.perfil || "-").toUpperCase()}
        </span>
      ),
    },
    { key: "cliente", label: "Cliente" },
    {
      key: "ativo",
      label: "Status",
      render: (item) => (
        <span style={Number(item.ativo) === 1 ? tagAtivo : tagInativo}>
          {Number(item.ativo) === 1 ? "Ativo" : "Inativo"}
        </span>
      ),
    },
    {
      key: "troca_senha_obrigatoria",
      label: "Primeiro acesso",
      render: (item) => (
        <span style={Number(item.troca_senha_obrigatoria) === 1 ? tagPendente : tagOk}>
          {Number(item.troca_senha_obrigatoria) === 1 ? "Pendente" : "Concluído"}
        </span>
      ),
    },
  ];

  const totalUsuarios = usuarios.length;
  const totalInstrutores = usuarios.filter((u) => String(u.perfil || "").toLowerCase() === "instrutor").length;
  const totalTreinandos = usuarios.filter((u) => String(u.perfil || "").toLowerCase() === "treinando").length;
  const totalLideranca = usuarios.filter((u) =>
    ["admin", "coordenador", "supervisor"].includes(String(u.perfil || "").toLowerCase())
  ).length;

  return (
    <AccessGate allowed={["admin", "coordenador", "supervisor"]}>
      <CrudPageV2
        title="Usuários"
        subtitle="Gestão de acessos, perfis e vínculo com clientes."
        endpoint="/usuarios"
        fields={fields}
        columns={columns}
        recordsSubtitle="Base de usuários do portal."
        hero={
          <div style={statsWrap}>
            <StatCard
              title="Usuários"
              value={totalUsuarios}
              subtitle="Total cadastrado"
              accent="#2563eb"
            />
            <StatCard
              title="Instrutores"
              value={totalInstrutores}
              subtitle="Perfis de aplicação"
              accent="#059669"
            />
            <StatCard
              title="Treinandos"
              value={totalTreinandos}
              subtitle="Em formação"
              accent="#7c3aed"
            />
            <StatCard
              title="Liderança"
              value={totalLideranca}
              subtitle="Admin, coordenação e supervisão"
              accent="#ea580c"
            />
          </div>
        }
      />
    </AccessGate>
  );
}

const statsWrap = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
  gap: 14,
};

const tagBase = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 12,
};

const tagAtivo = {
  ...tagBase,
  background: "#dcfce7",
  color: "#166534",
};

const tagInativo = {
  ...tagBase,
  background: "#fee2e2",
  color: "#b91c1c",
};

const tagPendente = {
  ...tagBase,
  background: "#fef3c7",
  color: "#92400e",
};

const tagOk = {
  ...tagBase,
  background: "#dbeafe",
  color: "#1d4ed8",
};

function tagPerfil(perfil) {
  const map = {
    admin: { background: "#e0e7ff", color: "#3730a3" },
    coordenador: { background: "#dbeafe", color: "#1d4ed8" },
    supervisor: { background: "#ede9fe", color: "#6d28d9" },
    instrutor: { background: "#dcfce7", color: "#166534" },
    treinando: { background: "#fef3c7", color: "#92400e" },
  };

  return {
    ...tagBase,
    ...(map[perfil] || { background: "#e5e7eb", color: "#374151" }),
  };
}
