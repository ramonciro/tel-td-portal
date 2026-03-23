"use client";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function parseHoras(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).replace(",", ".").trim();
  const match = text.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

function statusLabel(status) {
  const key = String(status || "").toLowerCase();
  if (key === "concluido" || key === "concluído") return "Concluída";
  if (key === "em_andamento" || key === "em andamento") return "Em andamento";
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

  return { ...base, background: "#dbeafe", color: "#1d4ed8" };
}

function formatDate(value) {
  if (!value) return "-";
  const text = String(value).slice(0, 10);
  const parts = text.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return String(value);
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

        try {
          const sessao = localStorage.getItem("user");
          if (sessao) {
            setUsuarioLogado(JSON.parse(sessao));
          }
        } catch {
          setUsuarioLogado(null);
        }
      } catch {
        setTurmas([]);
        setUsuarios([]);
        setClientes([]);
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
      .map((item) => ({
        value: item.nome,
        label: item.nome,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

    if (usuarioEhGlobal || perfilLogado === "coordenador" || !perfilLogado) {
      return lista;
    }

    return lista.filter((item) => temClienteEmComum(item.value, clienteLogado));
  }, [clientes, clienteLogado, perfilLogado, usuarioEhGlobal]);

  const instrutores = useMemo(() => {
    const base = usuarios.filter(
      (item) => String(item.perfil || "").toLowerCase() === "instrutor"
    );

    let filtrados = base;

    if (perfilLogado === "coordenador" || usuarioEhGlobal || !perfilLogado) {
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
  }, [usuarios, perfilLogado, clienteLogado, nomeLogado, usuarioEhGlobal]);

  const supervisores = useMemo(() => {
    const base = usuarios.filter(
      (item) => String(item.perfil || "").toLowerCase() === "supervisor"
    );

    let filtrados = base;

    if (perfilLogado === "coordenador" || usuarioEhGlobal || !perfilLogado) {
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
  }, [usuarios, perfilLogado, clienteLogado, usuarioEhGlobal]);

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
      label: "Carga horária",
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
      label: "Data início",
      type: "date",
    },
    {
      name: "data_fim",
      label: "Data fim",
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
    const planejadas = turmas.filter((item) => statusLabel(item.status) === "Planejada").length;
    const andamento = turmas.filter((item) => statusLabel(item.status) === "Em andamento").length;
    const concluidas = turmas.filter((item) => statusLabel(item.status) === "Concluída").length;

    const treinandos = turmas.reduce(
      (acc, item) => acc + Number(item.participantes || 0),
      0
    );

    const horas = turmas.reduce(
      (acc, item) => acc + parseHoras(item.carga_horaria),
      0
    );

    return {
      total,
      planejadas,
      andamento,
      concluidas,
      treinandos,
      horas,
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
          {formatDate(item.data_inicio || item.data)} até{" "}
          {formatDate(item.data_fim || item.data_inicio || item.data)}
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
  ];

  return (
    <CrudPageV2
      title="Gestão de Turmas"
      subtitle="Execução operacional das turmas de treinamento."
      endpoint="/treinamentos"
      fields={fields}
      columns={columns}
      recordsTitle="Base de turmas"
      recordsSubtitle="Visão consolidada das turmas cadastradas no portal."
      hero={
        <div style={{ display: "grid", gap: 14 }}>
          <div style={heroGrid}>
            <StatCard title="Turmas" value={fmt(kpis.total)} subtitle="Base total" accent="#2563eb" />
            <StatCard title="Planejadas" value={fmt(kpis.planejadas)} subtitle="Aguardando execução" accent="#f59e0b" />
            <StatCard title="Em andamento" value={fmt(kpis.andamento)} subtitle="Turmas ativas" accent="#ea580c" />
            <StatCard title="Concluídas" value={fmt(kpis.concluidas)} subtitle="Finalizadas" accent="#16a34a" />
          </div>

          <div style={heroGrid}>
            <StatCard title="Treinandos previstos" value={fmt(kpis.treinandos)} subtitle="Capacidade planejada" accent="#06b6d4" />
            <StatCard title="Carga horária" value={`${fmt(kpis.horas)}h`} subtitle="Carga consolidada" accent="#7c3aed" />
            <StatCard title="Instrutores disponíveis" value={fmt(instrutores.length)} subtitle="Conforme perfil logado" accent="#0f766e" />
            <StatCard title="Supervisores disponíveis" value={fmt(supervisores.length)} subtitle="Conforme perfil logado" accent="#334155" />
          </div>

          <SectionCard
            title="Leitura de acesso"
            subtitle="Validação da visão do usuário logado para criação de turmas."
          >
            <div style={alertsGrid}>
              <div style={alertItem}>
                Perfil logado: <strong>{perfilLogado || "não identificado"}</strong>
              </div>
              <div style={alertItem}>
                Cliente(s) do usuário: <strong>{clienteLogado || "não identificado"}</strong>
              </div>
              <div style={alertItem}>
                Instrutores carregados: <strong>{instrutores.length}</strong>
              </div>
              <div style={alertItem}>
                Supervisores carregados: <strong>{supervisores.length}</strong>
              </div>
            </div>
          </SectionCard>
        </div>
      }
    />
  );
}

function StatCard({ title, value, subtitle, accent }) {
  return (
    <div style={{ ...statCard, borderTop: `4px solid ${accent}` }}>
      <div style={statTitle}>{title}</div>
      <div style={statValue}>{value}</div>
      <div style={statSubtitle}>{subtitle}</div>
    </div>
  );
}

const heroGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const alertsGrid = {
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

const statCard = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 16,
};

const statTitle = {
  fontWeight: 800,
  color: "#475569",
  fontSize: 13,
  textTransform: "uppercase",
};

const statValue = {
  fontWeight: 900,
  color: "#0f172a",
  fontSize: 32,
  marginTop: 8,
};

const statSubtitle = {
  color: "#64748b",
  marginTop: 6,
  fontSize: 13,
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
