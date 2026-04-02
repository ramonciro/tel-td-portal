"use client";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function normalizarListaClientes(valor) {
  if (!valor) return [];
  if (Array.isArray(valor)) return valor;
  return String(valor).split(",").map((item) => item.trim()).filter(Boolean);
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    async function carregar() {
      try {
        const [resU, resC] = await Promise.all([
          apiFetch("/usuarios"),
          apiFetch("/clientes"),
        ]);
        
        const uData = await resU.json();
        const cData = await resC.json();

        setUsuarios(Array.isArray(uData) ? uData : []);
        setClientes(Array.isArray(cData) ? cData : []);
      } catch (err) {
        console.error("Erro ao carregar usuários:", err);
        setUsuarios([]);
        setClientes([]);
      }
    }
    carregar();
  }, []);

  const clientesOptions = useMemo(() => {
    return clientes
      .map((item) => ({ value: item.nome, label: item.nome }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [clientes]);

  const fields = [
    { name: "nome", label: "Nome", placeholder: "Nome completo" },
    { name: "email", label: "E-mail", placeholder: "email@empresa.com" },
    { name: "senha", label: "Senha", type: "password", placeholder: "Senha de acesso" },
    {
      name: "perfil",
      label: "Perfil",
      type: "select",
      options: [
        { value: "coordenador", label: "Coordenador" },
        { value: "supervisor", label: "Supervisor" },
        { value: "instrutor", label: "Instrutor" },
        { value: "treinando", label: "Treinando" },
        { value: "superintendente", label: "Superintendente" },
      ],
    },
    {
      name: "cliente",
      label: "Operações / clientes",
      type: "multiselect",
      options: clientesOptions,
      helperText: "Selecione as operações que este usuário pode visualizar/gerenciar.",
    },
    {
      name: "ativo",
      label: "Ativo",
      type: "select",
      options: [{ value: "1", label: "Sim" }, { value: "0", label: "Não" }],
    },
    {
      name: "pode_acessar_oceano_desenvolvimento",
      label: "Acesso ao Oceano",
      type: "select",
      options: [{ value: "1", label: "Liberado" }, { value: "0", label: "Bloqueado" }],
    },
  ];

  const columns = [
    {
      key: "nome",
      label: "Usuário",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.nome || "-"}</div>
          <div style={subCell}>{item.email || "-"}</div>
        </div>
      ),
    },
    {
      key: "perfil",
      label: "Perfil",
      render: (item) => <span style={badgePerfil(item.perfil)}>{item.perfil || "-"}</span>,
    },
    {
      key: "cliente",
      label: "Operações",
      render: (item) => {
        const lista = normalizarListaClientes(item.cliente);
        return (
          <div style={chipsWrap}>
            {lista.length > 0 ? (
              lista.map((c) => <span key={c} style={chip}>{c}</span>)
            ) : (
              <span style={plainCell}>Nenhuma</span>
            )}
          </div>
        );
      },
    },
    {
      key: "ativo",
      label: "Status",
      render: (item) => (
        <span style={badgeStatus(String(item.ativo) === "1")}>
          {String(item.ativo) === "1" ? "Ativo" : "Inativo"}
        </span>
      ),
    },
  ];

  const kpis = useMemo(() => {
    return {
      total: usuarios.length,
      ativos: usuarios.filter(u => String(u.ativo) === "1").length,
      instrutores: usuarios.filter(u => String(u.perfil).toLowerCase() === "instrutor").length,
      oceano: usuarios.filter(u => String(u.pode_acessar_oceano_desenvolvimento) === "1").length,
    };
  }, [usuarios]);

  return (
    <CrudPageV2
      title="Usuários"
      subtitle="Gestão de acessos e perfis do sistema."
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
        pode_acessar_oceano_desenvolvimento: String(record.pode_acessar_oceano_desenvolvimento ?? "0"),
      })}
      transformFormToPayload={(formData) => ({
        ...formData,
        cliente: Array.isArray(formData.cliente) ? formData.cliente.join(",") : formData.cliente,
        ativo: Number(formData.ativo),
        pode_acessar_oceano_desenvolvimento: Number(formData.pode_acessar_oceano_desenvolvimento),
      })}
      hero={
        <div style={heroGrid}>
          <StatCard title="Total" value={fmt(kpis.total)} accent="#2563eb" />
          <StatCard title="Ativos" value={fmt(kpis.ativos)} accent="#16a34a" />
          <StatCard title="Instrutores" value={fmt(kpis.instrutores)} accent="#7c3aed" />
          <StatCard title="Oceano" value={fmt(kpis.oceano)} accent="#0891b2" />
        </div>
      }
    />
  );
}

// Estilos compatíveis com o layout corporativo
const titleCell = { fontWeight: 800, color: "#0f172a" };
const subCell = { marginTop: 4, color: "#64748b", fontSize: 12 };
const plainCell = { color: "#94a3b8", fontSize: 12 };
const chipsWrap = { display: "flex", gap: 4, flexWrap: "wrap" };
const heroGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 };

const chip = {
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 700,
};

function badgePerfil(perfil) {
  const p = String(perfil || "").toLowerCase();
  const base = { padding: "4px 8px", borderRadius: 999, fontWeight: 800, fontSize: 10 };
  if (p === "coordenador") return { ...base, background: "#dbeafe", color: "#1d4ed8" };
  if (p === "instrutor") return { ...base, background: "#dcfce7", color: "#166534" };
  return { ...base, background: "#f3f4f6", color: "#374151" };
}

function badgeStatus(ativo) {
  return {
    padding: "4px 8px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 10,
    background: ativo ? "#dcfce7" : "#fee2e2",
    color: ativo ? "#166534" : "#b91c1c",
  };
}
