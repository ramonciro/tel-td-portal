"use client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function normalizarLista(valor) {
  if (!valor) return [];
  if (Array.isArray(valor)) return valor;
  return String(valor).split(",").map(v => v.trim()).filter(Boolean);
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    async function carregar() {
      try {
        const [uRes, cRes] = await Promise.all([
          apiFetch("/usuarios"),
          apiFetch("/clientes"),
        ]);

        const u = await uRes.json();
        const c = await cRes.json();

        setUsuarios(Array.isArray(u) ? u : []);
        setClientes(Array.isArray(c) ? c : []);
      } catch (e) {
        console.error(e);
        setUsuarios([]);
      }
    }

    carregar();
  }, []);

  const clientesOptions = useMemo(() => {
    return clientes.map(c => ({
      value: c.nome,
      label: c.nome
    }));
  }, [clientes]);

  const fields = [
    { name: "nome", label: "Nome" },
    { name: "email", label: "E-mail" },
    { name: "senha", label: "Senha", type: "password" },
    {
      name: "perfil",
      label: "Perfil",
      type: "select",
      options: [
        { value: "coordenador", label: "Coordenador" },
        { value: "instrutor", label: "Instrutor" },
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

  const columns = [
    {
      key: "nome",
      label: "Usuário",
      render: (item) => (
        <div style={{ fontWeight: 600 }}>
          {item.nome}
          <div style={{ fontSize: 12, color: "#666" }}>
            {item.email}
          </div>
        </div>
      ),
    },
    {
      key: "perfil",
      label: "Perfil",
      render: (item) => (
        <span style={{
          background: "#eef2ff",
          padding: "4px 8px",
          borderRadius: 8,
          fontSize: 12
        }}>
          {item.perfil}
        </span>
      ),
    },
    {
      key: "cliente",
      label: "Operações",
      render: (item) => {
        const lista = normalizarLista(item.cliente);

        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {lista.map(c => (
              <span key={c} style={{
                background: "#e0f2fe",
                padding: "3px 6px",
                borderRadius: 6,
                fontSize: 11
              }}>
                {c}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: "ativo",
      label: "Status",
      render: (item) => (
        <span style={{
          color: item.ativo == "1" ? "green" : "red",
          fontWeight: 600
        }}>
          {item.ativo == "1" ? "Ativo" : "Inativo"}
        </span>
      ),
    },
  ];

  const kpis = useMemo(() => ({
    total: usuarios.length,
    ativos: usuarios.filter(u => u.ativo == "1").length,
  }), [usuarios]);

  return (
    <CrudPageV2
      title="Usuários"
      subtitle="Gestão de acessos"
      endpoint="/usuarios"
      fields={fields}
      columns={columns}

      hero={
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10
        }}>
          <StatCard title="Total" value={kpis.total} />
          <StatCard title="Ativos" value={kpis.ativos} />
        </div>
      }

      transformRecordToForm={(base, r) => ({
        ...base,
        cliente: normalizarLista(r.cliente),
        ativo: String(r.ativo || "1"),
      })}

      transformFormToPayload={(f) => ({
        ...f,
        cliente: f.cliente.join(","),
        ativo: Number(f.ativo),
      })}
    />
  );
                }
