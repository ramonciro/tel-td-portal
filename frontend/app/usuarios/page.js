"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import StatCard from "../../components/StatCard";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function normalizarListaClientes(valor) {
  if (!valor) return [];
  if (Array.isArray(valor)) return valor;
  return String(valor).split(",").map((i) => i.trim()).filter(Boolean);
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    async function carregar() {
      try {
        const resU = await apiFetch("/usuarios");
        const resC = await apiFetch("/clientes");

        const uData = resU?.data || resU || [];
        const cData = resC?.data || resC || [];

        setUsuarios(Array.isArray(uData) ? uData : []);
        setClientes(Array.isArray(cData) ? cData : []);
      } catch (err) {
        console.error(err);
        setUsuarios([]);
        setClientes([]);
      }
    }
    carregar();
  }, []);

  // 🔹 opções clientes
  const clientesOptions = useMemo(() => {
    return clientes
      .map((c) => ({ value: c.nome, label: c.nome }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [clientes]);

  // 🔹 KPIs mais organizados
  const kpis = useMemo(() => {
    return {
      total: usuarios.length,
      ativos: usuarios.filter((u) => String(u.ativo) === "1").length,
      inativos: usuarios.filter((u) => String(u.ativo) !== "1").length,
      instrutores: usuarios.filter(
        (u) => String(u.perfil).toLowerCase() === "instrutor"
      ).length,
    };
  }, [usuarios]);

  // 🔹 campos
  const fields = [
    { name: "nome", label: "Nome", placeholder: "Nome completo" },
    { name: "email", label: "E-mail", placeholder: "email@empresa.com" },
    {
      name: "senha",
      label: "Senha",
      type: "password",
      hiddenOnEdit: true,
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
    },
    {
      name: "cliente",
      label: "Operações",
      type: "multiselect",
      options: clientesOptions,
    },
    {
      name: "ativo",
      label: "Status",
      type: "select",
      options: [
        { value: "1", label: "Ativo" },
        { value: "0", label: "Inativo" },
      ],
    },
  ];

  // 🔹 tabela mais limpa
  const columns = [
    {
      key: "usuario",
      label: "Usuário",
      render: (item) => (
        <div style={userBlock}>
          <div style={avatar}>{item.nome?.[0]}</div>
          <div>
            <div style={title}>{item.nome}</div>
            <div style={email}>{item.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "perfil",
      label: "Perfil",
      render: (item) => (
        <span style={badgePerfil(item.perfil)}>
          {item.perfil}
        </span>
      ),
    },
    {
      key: "cliente",
      label: "Operações",
      render: (item) => {
        const lista = normalizarListaClientes(item.cliente);

        if (!lista.length) return <span style={muted}>—</span>;

        return (
          <div style={chipsWrap}>
            {lista.slice(0, 2).map((c) => (
              <span key={c} style={chip}>{c}</span>
            ))}
            {lista.length > 2 && (
              <span style={more}>+{lista.length - 2}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "ativo",
      label: "Status",
      render: (item) => (
        <span style={badgeStatus(item.ativo === "1")}>
          {item.ativo === "1" ? "Ativo" : "Inativo"}
        </span>
      ),
    },
  ];

  return (
    <CrudPageV2
      title="Usuários"
      subtitle="Controle de acessos, perfis e operações"
      endpoint="/usuarios"
      fields={fields}
      columns={columns}
      allowedCreateRoles={["coordenador", "supervisor"]}
      allowedEditRoles={["coordenador", "supervisor"]}
      allowedDeleteRoles={["coordenador"]}
      transformRecordToForm={(base, record) => ({
        ...base,
        cliente: normalizarListaClientes(record.cliente),
        ativo: String(record.ativo ?? "1"),
      })}
      transformFormToPayload={(data) => ({
        ...data,
        cliente: Array.isArray(data.cliente)
          ? data.cliente.join(",")
          : data.cliente,
        ativo: Number(data.ativo),
      })}
      hero={
        <SectionCard title="Resumo">
          <div style={kpiGrid}>
            <StatCard title="Total" value={fmt(kpis.total)} />
            <StatCard title="Ativos" value={fmt(kpis.ativos)} />
            <StatCard title="Inativos" value={fmt(kpis.inativos)} />
            <StatCard title="Instrutores" value={fmt(kpis.instrutores)} />
          </div>
        </SectionCard>
      }
    />
  );
}

// 🎨 ESTILO NOVO (mais moderno)

const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const userBlock = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const avatar = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "#2563eb",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
};

const title = { fontWeight: 700, color: "#0f172a" };
const email = { fontSize: 12, color: "#64748b" };
const muted = { color: "#94a3b8" };

const chipsWrap = {
  display: "flex",
  gap: 4,
  alignItems: "center",
};

const chip = {
  background: "#eef2ff",
  color: "#4338ca",
  padding: "2px 6px",
  borderRadius: 6,
  fontSize: 11,
};

const more = {
  fontSize: 11,
  color: "#64748b",
};

function badgePerfil(perfil) {
  return {
    background: "#f1f5f9",
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
  };
}

function badgeStatus(ativo) {
  return {
    background: ativo ? "#dcfce7" : "#fee2e2",
    color: ativo ? "#166534" : "#b91c1c",
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
  };
    }
