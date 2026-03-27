"use client";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch, getStoredUser } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function parseHoras(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).replace(",", ".").trim();
  const match = text.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

function formatDateSafe(value) {
  if (!value) return "-";
  const text = String(value).slice(0, 10);
  const parts = text.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return String(value);
}

function statusLabel(status) {
  const key = String(status || "").trim().toLowerCase();

  if (key === "concluido" || key === "concluído" || key === "concluida") {
    return "Concluída";
  }

  if (key === "em_andamento" || key === "em andamento") {
    return "Em andamento";
  }

  if (key === "cancelada" || key === "cancelado") {
    return "Cancelada";
  }

  return "Planejada";
}

function statusStyle(status) {
  const label = statusLabel(status);

  const base = {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };

  if (label === "Concluída") {
    return { ...base, background: "#dcfce7", color: "#166534" };
  }

  if (label === "Em andamento") {
    return { ...base, background: "#ffedd5", color: "#9a3412" };
  }

  if (label === "Cancelada") {
    return { ...base, background: "#fee2e2", color: "#b91c1c" };
  }

  return { ...base, background: "#dbeafe", color: "#1d4ed8" };
}

function parseClientes(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isGlobalUser(cliente) {
  return parseClientes(cliente).some((item) => item.toLowerCase() === "global");
}

function temClienteEmComum(clienteA, clienteB) {
  const listaA = parseClientes(clienteA).map((item) => item.toLowerCase());
  const listaB = parseClientes(clienteB).map((item) => item.toLowerCase());

  if (listaA.includes("global") || listaB.includes("global")) return true;
  return listaA.some((item) => listaB.includes(item));
}

function usuarioOptionLabel(usuario) {
  const clientes = parseClientes(usuario.cliente);
  if (!clientes.length) return usuario.nome;
  if (clientes.length === 1) return `${usuario.nome} • ${clientes[0]}`;
  if (isGlobalUser(usuario.cliente)) return `${usuario.nome} • Global`;
  return `${usuario.nome} • ${clientes.length} operações`;
}

export default function TreinamentosPage() {
  const [turmas, setTurmas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [usuarioLogado, setUsuarioLogado] = useState(null);

  useEffect(() => {
    async function carregar() {
      try {
        const [treinamentosData, usuariosData, clientesData] = await Promise.all([
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/usuarios").catch(() => []),
          apiFetch("/clientes").catch(() => []),
        ]);

        setTurmas(Array.isArray(treinamentosData) ? treinamentosData : []);
        setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
        setClientes(Array.isArray(clientesData) ? clientesData : []);
        setUsuarioLogado(getStoredUser());
      } catch {
        setTurmas([]);
        setUsuarios([]);
        setClientes([]);
        setUsuarioLogado(getStoredUser());
      }
    }

    carregar();
  }, []);

  const perfilLogado = String(usuarioLogado?.perfil || "").toLowerCase();
  const clienteLogado = usuarioLogado?.cliente || "";
  const nomeLogado = usuarioLogado?.nome || "";
  const usuarioEhGlobal = isGlobalUser(clienteLogado);

  const clientesOptions = useMemo(() => {
    const lista = clientes
      .map((item) => ({ value: item.nome, label: item.nome }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

    if (!perfilLogado || perfilLogado === "coordenador" || usuarioEhGlobal) {
      return lista;
    }

    if (perfilLogado === "instrutor" || perfilLogado === "supervisor") {
      return lista.filter((item) => temClienteEmComum(item.value, clienteLogado));
    }

    return lista;
  }, [clientes, perfilLogado, usuarioEhGlobal, clienteLogado]);

  const instrutores = useMemo(() => {
    const base = usuarios.filter(
      (item) => String(item.perfil || "").toLowerCase() === "instrutor"
    );

    let filtrados = base;

    if (!perfilLogado || perfilLogado === "coordenador" || usuarioEhGlobal) {
      filtrados = base;
    } else if (perfilLogado === "supervisor") {
      filtrados = base.filter((item) => temClienteEmComum(item.cliente, clienteLogado));
    } else if (perfilLogado === "instrutor") {
      filtrados = base.filter((item) => item.nome === nomeLogado);
    }

    return filtrados
      .map((item) => ({
        value: item.nome,
        label: usuarioOptionLabel(item),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [usuarios, perfilLogado, usuarioEhGlobal, clienteLogado, nomeLogado]);

  const supervisores = useMemo(() => {
    const base = usuarios.filter(
      (item) => String(item.perfil || "").toLowerCase() === "supervisor"
    );

    let filtrados = base;

    if (!perfilLogado || perfilLogado === "coordenador" || usuarioEhGlobal) {
      filtrados = base;
    } else if (perfilLogado === "supervisor") {
      filtrados = base.filter((item) => temClienteEmComum(item.cliente, clienteLogado));
    } else if (perfilLogado === "instrutor") {
      filtrados = base.filter((item) => temClienteEmComum(item.cliente, clienteLogado));
    }

    return filtrados
      .map((item) => ({
        value: item.nome,
        label: usuarioOptionLabel(item),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [usuarios, perfilLogado, usuarioEhGlobal, clienteLogado]);

  const fields = [
    {
      name: "tema",
      label: "Turma / treinamento",
      placeholder: "Tema ou nome da turma",
    },
    {
      name: "cliente",
      label: "Cliente",
      type: "select",
      options: clientesOptions,
      placeholder:
        clientesOptions.length > 0
          ? "Selecione o cliente"
          : "Nenhum cliente disponível",
    },
    {
      name: "instrutor",
      label: "Instrutor",
      type: "select",
      options: instrutores,
      placeholder:
        instrutores.length > 0
          ? "Selecione o instrutor"
          : "Nenhum instrutor disponível",
      defaultValue: perfilLogado === "instrutor" ? nomeLogado : "",
      disabled: perfilLogado === "instrutor",
    },
    {
      name: "supervisor",
      label: "Supervisor",
      type: "select",
      options: supervisores,
      placeholder:
        supervisores.length > 0
          ? "Selecione o supervisor"
          : "Nenhum supervisor disponível",
    },
    {
      name: "publico",
      label: "Público",
      placeholder: "Ex.: Operação, onboarding, reciclagem",
    },
    {
      name: "carga_horaria",
      label: "Carga horária total",
      placeholder: "Ex.: 20h",
    },
    {
      name: "participantes",
      label: "Treinandos previstos",
      type: "number",
      placeholder: "Quantidade prevista",
    },
    {
      name: "status",
      label: "Status da turma",
      type: "select",
      options: [
        { value: "planejado", label: "Planejada" },
        { value: "em_andamento", label: "Em andamento" },
        { value: "concluido", label: "Concluída" },
      ],
      placeholder: "Selecione o status",
    },
    {
      name: "data_inicio",
      label: "Data de início",
      type: "date",
    },
    {
      name: "data_fim",
      label: "Data de fim",
      type: "date",
    },
    {
      name: "descricao",
      label: "Observações",
      type: "textarea",
      placeholder: "Informações complementares",
    },
  ];

  const kpis = useMemo(() => {
    const total = turmas.length;
    const planejadas = turmas.filter(
      (item) => statusLabel(item.status) === "Planejada"
    ).length;
    const andamento = turmas.filter(
      (item) => statusLabel(item.status) === "Em andamento"
    ).length;
    const concluidas = turmas.filter(
      (item) => statusLabel(item.status) === "Concluída"
    ).length;

    const treinandos = turmas.reduce(
      (acc, item) => acc + Number(item.participantes || 0),
      0
    );

    const horas = turmas.reduce(
      (acc, item) => acc + parseHoras(item.carga_horaria),
      0
    );

    const alertas = [];

    if (planejadas > 0) {
      alertas.push(`${planejadas} turma(s) ainda estão planejadas.`);
    }

    if (andamento > 0) {
      alertas.push(`${andamento} turma(s) estão em andamento.`);
    }

    if (!alertas.length) {
      alertas.push("Base organizada, sem pendências críticas no momento.");
    }

    return {
      total,
      planejadas,
      andamento,
      concluidas,
      treinandos,
      horas,
      alertas,
    };
  }, [turmas]);

  const columns = [
    {
      key: "tema",
      label: "Turma",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.tema || item.titulo || "-"}</div>
          <div style={subCell}>
            {(item.cliente || "Sem cliente") + " • " + (item.instrutor || "Sem instrutor")}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (item) => (
        <span style={statusStyle(item.status)}>{statusLabel(item.status)}</span>
      ),
    },
    {
      key: "periodo",
      label: "Período",
      render: (item) => (
        <span style={plainCell}>
          {formatDateSafe(item.data_inicio || item.data)} até{" "}
          {formatDateSafe(item.data_fim || item.data_inicio || item.data)}
        </span>
      ),
    },
    {
      key: "participantes",
      label: "Treinandos previstos",
      render: (item) => (
        <strong style={scoreBlue}>{fmt(item.participantes || 0)}</strong>
      ),
    },
    {
      key: "carga_horaria",
      label: "Carga horária",
      render: (item) => (
        <strong style={scoreGreen}>{item.carga_horaria || "-"}</strong>
      ),
    },
    {
      key: "supervisor",
      label: "Supervisor",
      render: (item) => <span style={plainCell}>{item.supervisor || "-"}</span>,
    },
    {
      key: "acoes",
      label: "Ações",
      render: (item) => (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            style={btnAcao}
            onClick={() => {
              window.location.href = `/turma/${item.id}`;
            }}
          >
            Gestão da turma
          </button>

          <button
            style={btnSecundario}
            onClick={() => {
              window.location.href = `/turma/${item.id}/cronograma`;
            }}
          >
            Cronograma
          </button>
        </div>
      ),
    },
  ];

  return (
    <CrudPageV2
      title="Gestão de Turmas"
      subtitle="Execução operacional das turmas com período de formação e controle de chamada diária."
      endpoint="/treinamentos"
      fields={fields}
      columns={columns}
      recordsTitle="Base de turmas"
      recordsSubtitle="Visão consolidada das turmas cadastradas no portal."
      allowedCreateRoles={["coordenador", "supervisor", "instrutor"]}
      allowedEditRoles={["coordenador", "supervisor", "instrutor"]}
      allowedDeleteRoles={["coordenador"]}
      hero={
        <div style={{ display: "grid", gap: 14 }}>
          <div style={heroGrid}>
            <StatCard
              title="Turmas"
              value={fmt(kpis.total)}
              subtitle="Base total"
              accent="#2563eb"
            />
            <StatCard
              title="Planejadas"
              value={fmt(kpis.planejadas)}
              subtitle="Aguardando execução"
              accent="#f59e0b"
            />
            <StatCard
              title="Em andamento"
              value={fmt(kpis.andamento)}
              subtitle="Turmas ativas"
              accent="#ea580c"
            />
            <StatCard
              title="Concluídas"
              value={fmt(kpis.concluidas)}
              subtitle="Ações finalizadas"
              accent="#16a34a"
            />
          </div>

          <div style={heroGrid}>
            <StatCard
              title="Treinandos previstos"
              value={fmt(kpis.treinandos)}
              subtitle="Capacidade da base"
              accent="#06b6d4"
            />
            <StatCard
              title="Carga horária total"
              value={`${fmt(kpis.horas)}h`}
              subtitle="Carga consolidada"
              accent="#7c3aed"
            />
            <StatCard
              title="Instrutores"
              value={fmt(instrutores.length)}
              subtitle="Disponíveis para seleção"
              accent="#0f766e"
            />
            <StatCard
              title="Supervisores"
              value={fmt(supervisores.length)}
              subtitle="Disponíveis para seleção"
              accent="#334155"
            />
          </div>

          <SectionCard
            title="Leitura gerencial"
            subtitle="Turmas com período permitem chamada diária sem perder o histórico da formação."
          >
            <div style={alertGrid}>
              {kpis.alertas.map((item, index) => (
                <div key={index} style={alertItem}>
                  {item}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      }
    />
  );
}

const heroGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const alertGrid = {
  display: "grid",
  gap: 10,
};

const alertItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  color: "#334155",
  lineHeight: 1.5,
  fontWeight: 600,
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
};

const scoreBlue = {
  color: "#2563eb",
};

const scoreGreen = {
  color: "#16a34a",
};

const btnAcao = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 8,
  padding: "7px 10px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};

const btnSecundario = {
  border: "1px solid #ddd6fe",
  background: "#f5f3ff",
  color: "#7c3aed",
  borderRadius: 8,
  padding: "7px 10px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};
