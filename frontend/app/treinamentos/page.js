"use client";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch, getStoredUser } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = String(value).replace(",", ".").replace(/[^\d.-]/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseHoras(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).replace(",", ".").trim();
  const match = text.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

function parseDateOnly(value) {
  if (!value) return null;

  const text = String(value).slice(0, 10);
  const parts = text.split("-");

  if (parts.length === 3) {
    const [ano, mes, dia] = parts.map(Number);
    const date = new Date(ano, mes - 1, dia);
    date.setHours(0, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateSafe(value) {
  if (!value) return "-";
  const text = String(value).slice(0, 10);
  const parts = text.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return String(value);
}

// hasCompletedCalls e hasCompletedWorkload removidos — verificavam campos que não
// existem na tabela treinamentos e nunca retornavam true (código morto)

function normalizeStatusCode(status) {
  const key = String(status || "").trim().toLowerCase();

  if (["concluido", "concluído", "concluida", "concluída", "finalizado", "finalizada"].includes(key)) {
    return "concluido";
  }

  if (["em_andamento", "em andamento", "andamento", "ativo", "ativa"].includes(key)) {
    return "em_andamento";
  }

  if (["cancelada", "cancelado"].includes(key)) {
    return "cancelada";
  }

  return "planejado";
}

function getStatusCode(item) {
  const current = normalizeStatusCode(item?.status);

  if (current === "cancelada" || current === "concluido") {
    return current;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dataInicio = parseDateOnly(item?.data_inicio || item?.data);
  const dataFim = parseDateOnly(
    item?.data_fim || item?.data_termino || item?.fim || item?.data_final
  );

  if (dataFim && dataFim.getTime() < today.getTime()) {
    return "concluido";
  }

  if (dataInicio && dataInicio.getTime() <= today.getTime()) {
    return "em_andamento";
  }

  return current;
}

function statusLabel(statusOrItem) {
  const code =
    statusOrItem && typeof statusOrItem === "object"
      ? getStatusCode(statusOrItem)
      : normalizeStatusCode(statusOrItem);

  if (code === "concluido") return "Concluída";
  if (code === "em_andamento") return "Em andamento";
  if (code === "cancelada") return "Cancelada";
  return "Planejada";
}

function statusStyle(statusOrItem) {
  const label = statusLabel(statusOrItem);

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

function parseTurmaMetadata(descricao) {
  const text = String(descricao || "");
  const modalidade = text.match(/\[modalidade:([^\]]+)\]/i)?.[1]?.trim() || "";
  const sala = text.match(/\[sala:([^\]]*)\]/i)?.[1]?.trim() || "";
  const descricaoLimpa = text
    .replace(/\[modalidade:[^\]]+\]\s*/gi, "")
    .replace(/\[sala:[^\]]*\]\s*/gi, "")
    .trim();

  return { modalidade, sala, descricaoLimpa };
}

function buildDescricaoComMetadata({ descricao, modalidade, sala }) {
  const partes = [];
  if (modalidade) partes.push(`[modalidade:${modalidade}]`);
  if (sala) partes.push(`[sala:${sala}]`);
  if (descricao) partes.push(String(descricao).trim());
  return partes.join(" ").trim();
}

export default function TreinamentosPage() {
  const [turmas, setTurmas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [filtroPeriodoInicio, setFiltroPeriodoInicio] = useState("");
  const [filtroPeriodoFim, setFiltroPeriodoFim] = useState("");

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

  const clientePadrao = useMemo(() => {
    if (
      (perfilLogado === "instrutor" || perfilLogado === "supervisor") &&
      clientesOptions.length === 1
    ) {
      return clientesOptions[0].value;
    }

    return "";
  }, [perfilLogado, clientesOptions]);

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
      defaultValue: clientePadrao,
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
      defaultValue: perfilLogado === "supervisor" ? nomeLogado : "",
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
        { value: "cancelada", label: "Cancelada" },
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
      name: "modalidade",
      label: "Modalidade",
      type: "select",
      options: [
        { value: "online", label: "Online" },
        { value: "presencial", label: "Presencial" },
      ],
      placeholder: "Selecione a modalidade",
    },
    {
      name: "sala",
      label: "Sala",
      placeholder: "Ex.: Sala 01 / Lab 02",
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
    const planejadas = turmas.filter((item) => getStatusCode(item) === "planejado").length;
    const andamento = turmas.filter((item) => getStatusCode(item) === "em_andamento").length;
    const concluidas = turmas.filter((item) => getStatusCode(item) === "concluido").length;

    const treinandos = turmas.reduce(
      (acc, item) => acc + Number(item.participantes || 0),
      0
    );

    const horas = turmas.reduce(
      (acc, item) => acc + parseHoras(item.carga_horaria),
      0
    );

    // carga realizada: apenas turmas concluídas
    const horasRealizadas = turmas
      .filter((item) => getStatusCode(item) === "concluido")
      .reduce((acc, item) => acc + parseHoras(item.carga_horaria), 0);

    const autoConcluidas = turmas.filter(
      (item) =>
        normalizeStatusCode(item.status) !== "concluido" &&
        getStatusCode(item) === "concluido"
    ).length;

    const atrasadas = turmas.filter((item) => {
      const dataFim = parseDateOnly(item?.data_fim || item?.data_termino || item?.fim);
      return (
        dataFim &&
        dataFim.getTime() < new Date(new Date().setHours(0, 0, 0, 0)).getTime() &&
        normalizeStatusCode(item.status) !== "concluido" &&
        normalizeStatusCode(item.status) !== "cancelada"
      );
    }).length;

    const alertas = [];

    if (planejadas > 0) {
      alertas.push(`${planejadas} turma(s) ainda estão planejadas.`);
    }

    if (andamento > 0) {
      alertas.push(`${andamento} turma(s) estão em andamento.`);
    }

    if (autoConcluidas > 0) {
      alertas.push(
        `${autoConcluidas} turma(s) aparecem como concluídas automaticamente por prazo encerrado ou chamadas cumpridas.`
      );
    }

    if (atrasadas > 0) {
      alertas.push(
        `${atrasadas} turma(s) estavam com status desatualizado e foram tratadas como concluídas na visualização.`
      );
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
      autoConcluidas,
      atrasadas,
      horasRealizadas,
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
      render: (item) => <span style={statusStyle(item)}>{statusLabel(item)}</span>,
    },
    {
      key: "periodo",
      label: "Período",
      render: (item) => (
        <span style={plainCell}>
          {formatDateSafe(item.data_inicio || item.data)}
          {item.data_fim ? ` até ${formatDateSafe(item.data_fim)}` : ""}
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
      key: "modalidade",
      label: "Modalidade",
      render: (item) => {
        const meta = parseTurmaMetadata(item.descricao);
        return (
          <span style={plainCell}>
            {meta.modalidade
              ? meta.modalidade === "presencial"
                ? "Presencial"
                : "Online"
              : "-"}
          </span>
        );
      },
    },
    {
      key: "sala",
      label: "Sala",
      render: (item) => {
        const meta = parseTurmaMetadata(item.descricao);
        return <span style={plainCell}>{meta.sala || "-"}</span>;
      },
    },
    {
      key: "supervisor",
      label: "Supervisor",
      render: (item) => <span style={plainCell}>{item.supervisor || "-"}</span>,
    },
    {
      key: "acoes",
      label: "Ações",
      render: (item) => {
        const statusCod = getStatusCode(item);
        const atrasada =
          statusCod !== "concluido" &&
          statusCod !== "cancelada" &&
          (() => {
            const df = parseDateOnly(item.data_fim);
            const hoje = new Date(); hoje.setHours(0,0,0,0);
            return df && df.getTime() < hoje.getTime();
          })();
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {atrasada && (
              <span style={{ fontSize: 11, fontWeight: 500, color: "#b91c1c", background: "#fee2e2", borderRadius: 999, padding: "2px 8px", alignSelf: "flex-start" }}>
                Prazo vencido
              </span>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={btnAcao}
                onClick={() => { window.location.href = `/turma/${item.id}`; }}
              >
                Gestão da turma
              </button>
              <button
                style={btnSecundario}
                onClick={() => { window.location.href = `/turma/${item.id}/cronograma`; }}
              >
                Cronograma
              </button>
            </div>
          </div>
        );
      },
    },
  ];

  // filtro de período aplicado sobre a listagem
  const filtrarPorPeriodo = useMemo(() => {
    if (!filtroPeriodoInicio && !filtroPeriodoFim) return null;
    return (item) => {
      const inicio = parseDateOnly(item.data_inicio || item.data);
      const fim = parseDateOnly(item.data_fim);
      const filtroI = filtroPeriodoInicio ? parseDateOnly(filtroPeriodoInicio) : null;
      const filtroF = filtroPeriodoFim ? parseDateOnly(filtroPeriodoFim) : null;
      if (filtroI && inicio && inicio.getTime() < filtroI.getTime()) return false;
      if (filtroF && (fim ? fim.getTime() > filtroF.getTime() : inicio && inicio.getTime() > filtroF.getTime())) return false;
      return true;
    };
  }, [filtroPeriodoInicio, filtroPeriodoFim]);

  return (
    <CrudPageV2
      title="Gestão de Turmas"
      subtitle="Execução operacional das turmas com período de formação e controle de chamada diária."
      endpoint="/treinamentos"
      fields={fields}
      columns={columns}
      filterFn={filtrarPorPeriodo}
      recordsTitle="Base de turmas"
      recordsSubtitle="Visão consolidada das turmas cadastradas no portal."
      allowedCreateRoles={["coordenador", "supervisor", "instrutor"]}
      allowedEditRoles={["coordenador", "supervisor", "instrutor"]}
      allowedDeleteRoles={["coordenador"]}
      transformRecordToForm={(baseForm, record) => {
        const meta = parseTurmaMetadata(record?.descricao);
        return {
          ...baseForm,
          modalidade: meta.modalidade || "",
          sala: meta.sala || "",
          descricao: meta.descricaoLimpa || "",
          status: getStatusCode(record),
        };
      }}
      transformFormToPayload={(payload, form) => {
        const descricao = buildDescricaoComMetadata({
          descricao: form.descricao,
          modalidade: form.modalidade,
          sala: form.sala,
        });

        const basePayload = {
          ...payload,
          cliente: form.cliente || payload.cliente || clientePadrao || "",
          instrutor:
            perfilLogado === "instrutor"
              ? nomeLogado
              : form.instrutor || payload.instrutor || "",
          supervisor:
            perfilLogado === "supervisor"
              ? nomeLogado
              : form.supervisor || payload.supervisor || "",
          descricao,
        };

        // respeita o status escolhido pelo usuário sem sobrescrever via getStatusCode
        // getStatusCode é usado apenas para leitura/exibição, não para persistência
        return {
          ...basePayload,
          status: form.status || payload.status || "planejado",
        };
      }}
      extraHeaderContent={
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500 }}>Período:</span>
          <input
            type="date"
            value={filtroPeriodoInicio}
            onChange={(e) => setFiltroPeriodoInicio(e.target.value)}
            style={{ fontSize: 13, padding: "5px 10px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
          />
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>até</span>
          <input
            type="date"
            value={filtroPeriodoFim}
            onChange={(e) => setFiltroPeriodoFim(e.target.value)}
            style={{ fontSize: 13, padding: "5px 10px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }}
          />
          {(filtroPeriodoInicio || filtroPeriodoFim) && (
            <button
              onClick={() => { setFiltroPeriodoInicio(""); setFiltroPeriodoFim(""); }}
              style={{ fontSize: 12, padding: "5px 10px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", cursor: "pointer" }}
            >
              Limpar
            </button>
          )}
        </div>
      }
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
              title="Carga realizada"
              value={`${fmt(kpis.horasRealizadas)}h`}
              subtitle={`de ${fmt(kpis.horas)}h planejadas`}
              accent="#7c3aed"
            />
            <StatCard
              title="Taxa de conclusão"
              value={kpis.total > 0 ? `${Math.round((kpis.concluidas / kpis.total) * 100)}%` : "—"}
              subtitle="Concluídas / total"
              accent="#0f766e"
            />
            <StatCard
              title="Atrasadas"
              value={fmt(kpis.atrasadas)}
              subtitle="Data vencida sem conclusão"
              accent={kpis.atrasadas > 0 ? "#dc2626" : "#334155"}
            />
          </div>

          <SectionCard
            title="Leitura gerencial"
            subtitle="Visão automática do status vencido ou chamada cumprida, reduzindo inconsistência operacional."
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
