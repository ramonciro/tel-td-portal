"use client";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import StatCard from "../../components/StatCard";
import { apiFetch, getStoredUser } from "../../services/api";

/* ================= HELPERS ================= */

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function parseClientes(value) {
  if (!value) return [];
  return String(value).split(",").map(v => v.trim().toLowerCase());
}

function temClienteEmComum(a, b) {
  const A = parseClientes(a);
  const B = parseClientes(b);
  if (A.includes("global") || B.includes("global")) return true;
  return A.some(x => B.includes(x));
}

/* ================= NOVA REGRA ================= */

function turmaConcluidaPorPresenca(turmaId, presencas) {
  const lista = presencas.filter(
    p => String(p.treinamento_id) === String(turmaId)
  );

  if (!lista.length) return false;

  return lista.every(p =>
    ["presente", "falta", "justificado"].includes(
      String(p.status || "").toLowerCase()
    )
  );
}

function statusLabel(status, dataFim, turmaId, presencas) {
  if (turmaConcluidaPorPresenca(turmaId, presencas)) {
    return "Concluída";
  }

  const key = String(status || "").toLowerCase();

  if (key.includes("conclu")) return "Concluída";
  if (key.includes("andamento")) return "Em andamento";
  if (key.includes("cancel")) return "Cancelada";

  const hoje = new Date();
  const fim = dataFim ? new Date(dataFim) : null;

  if (fim && fim < hoje) return "Em andamento";

  return "Planejada";
}

function statusStyle(status, dataFim, turmaId, presencas) {
  const label = statusLabel(status, dataFim, turmaId, presencas);

  const base = {
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };

  if (label === "Concluída")
    return { ...base, background: "#dcfce7", color: "#166534" };

  if (label === "Em andamento")
    return { ...base, background: "#ffedd5", color: "#9a3412" };

  if (label === "Cancelada")
    return { ...base, background: "#fee2e2", color: "#b91c1c" };

  return { ...base, background: "#dbeafe", color: "#1d4ed8" };
}

/* ================= PAGE ================= */

export default function TreinamentosPage() {
  const [turmas, setTurmas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [usuarioLogado, setUsuarioLogado] = useState(null);

  useEffect(() => {
    async function load() {
      const [t, u, c, p] = await Promise.all([
        apiFetch("/treinamentos").catch(() => []),
        apiFetch("/usuarios").catch(() => []),
        apiFetch("/clientes").catch(() => []),
        apiFetch("/presencas").catch(() => []),
      ]);

      setTurmas(t || []);
      setUsuarios(u || []);
      setClientes(c || []);
      setPresencas(p || []);
      setUsuarioLogado(getStoredUser());
    }

    load();
  }, []);

  const perfil = usuarioLogado?.perfil?.toLowerCase();
  const clienteLogado = usuarioLogado?.cliente || "";
  const nomeLogado = usuarioLogado?.nome || "";

  /* 🔥 CLIENTES COM FALLBACK */
  const clientesOptions = useMemo(() => {
    const lista = clientes.map(c => ({
      value: c.nome,
      label: c.nome,
    }));

    if (perfil === "instrutor" || perfil === "supervisor") {
      const filtrado = lista.filter(i =>
        temClienteEmComum(i.value, clienteLogado)
      );
      return filtrado.length ? filtrado : lista;
    }

    return lista;
  }, [clientes, perfil, clienteLogado]);

  /* 🔥 INSTRUTORES */
  const instrutores = useMemo(() => {
    const base = usuarios.filter(u => u.perfil === "instrutor");

    if (perfil === "instrutor") {
      return base
        .filter(u => u.nome === nomeLogado)
        .map(u => ({ value: u.nome, label: u.nome }));
    }

    return base.map(u => ({ value: u.nome, label: u.nome }));
  }, [usuarios, perfil, nomeLogado]);

  const fields = [
    { name: "tema", label: "Turma" },

    {
      name: "cliente",
      label: "Cliente",
      type: "select",
      options: clientesOptions,
    },

    {
      name: "instrutor",
      label: "Instrutor",
      type: "select",
      options: instrutores,
      defaultValue:
        perfil === "instrutor" && instrutores.length
          ? instrutores[0].value
          : "",
    },

    { name: "participantes", label: "Participantes", type: "number" },

    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "planejado", label: "Planejada" },
        { value: "em_andamento", label: "Em andamento" },
        { value: "concluido", label: "Concluída" },
      ],
    },

    { name: "data_inicio", label: "Início", type: "date" },
    { name: "data_fim", label: "Fim", type: "date" },
  ];

  /* 🔥 KPIs INTELIGENTES */
  const kpis = useMemo(() => {
    const total = turmas.length;

    const concluidas = turmas.filter(
      t => statusLabel(t.status, t.data_fim, t.id, presencas) === "Concluída"
    ).length;

    const andamento = turmas.filter(
      t => statusLabel(t.status, t.data_fim, t.id, presencas) === "Em andamento"
    ).length;

    const planejadas = turmas.filter(
      t => statusLabel(t.status, t.data_fim, t.id, presencas) === "Planejada"
    ).length;

    return { total, concluidas, andamento, planejadas };
  }, [turmas, presencas]);

  const columns = [
    {
      key: "tema",
      label: "Turma",
      render: i => <strong>{i.tema}</strong>,
    },
    {
      key: "status",
      label: "Status",
      render: i => (
        <span style={statusStyle(i.status, i.data_fim, i.id, presencas)}>
          {statusLabel(i.status, i.data_fim, i.id, presencas)}
        </span>
      ),
    },
  ];

  return (
    <CrudPageV2
      title="Gestão de Turmas"
      endpoint="/treinamentos"
      fields={fields}
      columns={columns}
      allowedCreateRoles={["coordenador", "supervisor", "instrutor"]}
      allowedEditRoles={["coordenador", "supervisor", "instrutor"]}
      allowedDeleteRoles={["coordenador"]}
      hero={
        <div style={{ display: "grid", gap: 12 }}>
          <StatCard title="Total" value={fmt(kpis.total)} />
          <StatCard title="Planejadas" value={fmt(kpis.planejadas)} />
          <StatCard title="Em andamento" value={fmt(kpis.andamento)} />
          <StatCard title="Concluídas" value={fmt(kpis.concluidas)} />
        </div>
      }
    />
  );
}
