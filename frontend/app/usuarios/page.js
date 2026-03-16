"use client";

import { useEffect, useState } from "react";
import AccessGate from "../../components/AccessGate";
import CrudPageV2 from "../../components/CrudPageV2";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

export default function UsuariosPage() {
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    async function carregar() {
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

    carregar();
  }, []);

  const clienteOptions = clientes.map((cliente) => ({
    value: cliente.nome || cliente.cliente || "",
    label: cliente.nome || cliente.cliente || "",
  }));

  const totalUsuarios = usuarios.length;
  const ativos = usuarios.filter((u) => Number(u.ativo) === 1).length;
  const inativos = usuarios.filter((u) => Number(u.ativo) === 0).length;
  const primeiroAcesso = usuarios.filter(
    (u) => Number(u.troca_senha_obrigatoria) === 1
  ).length;

  const fields = [
    {
      name: "nome",
      label: "Nome",
      placeholder: "Nome completo",
    },
    {
      name: "email",
      label: "E-mail",
      placeholder: "email@empresa.com",
    },
    {
      name: "senha",
      label: "Senha",
      placeholder: "Senha de acesso",
    },
    {
      name: "perfil",
      label: "Perfil",
      type: "select",
      options: [
        { value: "coordenador", label: "Coordenador" },
        { value: "supervisor", label: "Supervisor" },
        { value: "instrutor", label: "Instrutor" },
        { value: "treinando", label: "Treinando" },
      ],
      placeholder: "Selecione perfil",
    },
    {
      name: "cliente",
      label: "Cliente",
      type: "select",
      options: clienteOptions,
      placeholder: "Selecione cliente",
    },
    {
      name: "ativo",
      label: "Status",
      type: "select",
      options: [
        { value: 1, label: "Ativo" },
        { value: 0, label: "Inativo" },
      ],
      placeholder: "Selecione status",
    },
    {
      name: "troca_senha_obrigatoria",
      label: "Primeiro acesso",
      type: "select",
      options: [
        { value: 1, label: "Sim" },
        { value: 0, label: "Não" },
      ],
      placeholder: "Selecione primeiro acesso",
    },
  ];

  const columns = [
    {
      key: "nome",
      label: "Usuário",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.nome || "-"}</div>
          <div style={subCell}>{item.email || "Sem e-mail informado"}</div>
        </div>
      ),
    },
    {
      key: "perfil",
      label: "Perfil",
      render: (item) => (
        <span style={tagPerfil(item.perfil)}>
          {formatPerfil(item.perfil)}
        </span>
      ),
    },
    {
      key: "cliente",
      label: "Cliente",
      render: (item) => (
        <span style={plainCell}>{item.cliente || "Não vinculado"}</span>
      ),
    },
    {
      key: "ativo",
      label: "Status",
      render: (item) => (
        <span style={tagStatus(item.ativo)}>
          {Number(item.ativo) === 1 ? "Ativo" : "Inativo"}
        </span>
      ),
    },
    {
      key: "troca_senha_obrigatoria",
      label: "Primeiro acesso",
      render: (item) => (
        <span style={tagPrimeiroAcesso(item.troca_senha_obrigatoria)}>
          {Number(item.troca_senha_obrigatoria) === 1 ? "Pendente" : "Concluído"}
        </span>
      ),
    },
  ];

  return (
    <AccessGate allowed={["admin", "coordenador"]}>
      <CrudPageV2
        title="Usuários"
        subtitle="Gestão dos acessos do portal com controle de perfil, cliente e status de uso."
        endpoint="/usuarios"
        fields={fields}
        columns={columns}
        recordsTitle="Usuários cadastrados"
        recordsSubtitle="Base atual de acessos disponíveis no Portal T&D."
        hero={
          <div style={heroWrap}>
            <div style={heroText}>
              <div style={heroEyebrow}>Acessos do portal</div>
              <h2 style={heroTitle}>
                Controle central de usuários e perfis de navegação
              </h2>
              <p style={heroSubtitle}>
                Gerencie os acessos ao ambiente, organize os perfis por nível de
                atuação e acompanhe rapidamente quem está ativo, pendente de
                primeiro acesso ou sem vínculo operacional.
              </p>
            </div>

            <div style={statsWrap}>
              <StatCard
                title="Usuários"
                value={totalUsuarios}
                subtitle="Base total"
                accent="#2563eb"
              />
              <StatCard
                title="Ativos"
                value={ativos}
                subtitle="Acessos em uso"
                accent="#059669"
              />
              <StatCard
                title="Inativos"
                value={inativos}
                subtitle="Acessos desabilitados"
                accent="#dc2626"
              />
              <StatCard
                title="1º acesso"
                value={primeiroAcesso}
                subtitle="Pendentes de senha"
                accent="#7c3aed"
              />
            </div>
          </div>
        }
      />
    </AccessGate>
  );
}

function formatPerfil(perfil) {
  const key = String(perfil || "").toLowerCase();

  const mapa = {
    coordenador: "Coordenador",
    supervisor: "Supervisor",
    instrutor: "Instrutor",
    treinando: "Treinando",
    admin: "Administrador",
  };

  return mapa[key] || perfil || "-";
}

function tagPerfil(perfil) {
  const key = String(perfil || "").toLowerCase();

  const base = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
  };

  if (key === "coordenador" || key === "admin") {
    return {
      ...base,
      background: "#dbeafe",
      color: "#1d4ed8",
    };
  }

  if (key === "supervisor") {
    return {
      ...base,
      background: "#ede9fe",
      color: "#6d28d9",
    };
  }

  if (key === "instrutor") {
    return {
      ...base,
      background: "#dcfce7",
      color: "#166534",
    };
  }

  return {
    ...base,
    background: "#ffedd5",
    color: "#9a3412",
  };
}

function tagStatus(ativo) {
  const base = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
  };

  if (Number(ativo) === 1) {
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

function tagPrimeiroAcesso(valor) {
  const base = {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
  };

  if (Number(valor) === 1) {
    return {
      ...base,
      background: "#fef3c7",
      color: "#92400e",
    };
  }

  return {
    ...base,
    background: "#e0f2fe",
    color: "#075985",
  };
}

const heroWrap = {
  display: "grid",
  gap: 16,
};

const heroText = {
  background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)",
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
