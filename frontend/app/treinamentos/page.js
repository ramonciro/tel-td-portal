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

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("pt-BR");
}

function parseClientes(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactClientesLabel(value) {
  const items = parseClientes(value);

  if (!items.length) return "";
  if (items.length <= 2) return items.join(", ");
  return `${items[0]}, ${items[1]}, +${items.length - 2}`;
}

function usuarioOptionLabel(usuario) {
  const clientes = compactClientesLabel(usuario.cliente);
  return clientes ? `${usuario.nome} - ${clientes}` : usuario.nome;
}

export default function TreinamentosPage() {
  const [turmas, setTurmas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);

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
      } catch {
        setTurmas([]);
        setUsuarios([]);
        setClientes([]);
      }
    }

    carregar();
  }, []);

  const instrutores = useMemo(() => {
    return usuarios
      .filter((item) =>
        ["instrutor", "supervisor", "coordenador"].includes(
          String(item.perfil || "").toLowerCase()
        )
      )
      .map((item) => ({
        value: item.nome,
        label: usuarioOptionLabel(item),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [usuarios]);

  const supervisores = useMemo(() => {
    return usuarios
      .filter((item) =>
        ["supervisor", "coordenador"].includes(
          String(item.perfil || "").toLowerCase()
        )
      )
      .map((item) => ({
        value: item.nome,
        label: usuarioOptionLabel(item),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [usuarios]);

  const clientesOptions = useMemo(() => {
    return clientes
      .map((item) => ({
        value: item.nome,
        label: item.nome,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [clientes]);

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
          : "Cadastre um cliente antes de criar o treinamento",
    },
    {
      name: "instrutor",
      label: "Instrutor",
      type: "select",
      options: instrutores,
      placeholder: "Selecione o instrutor",
    },
    {
      name: "supervisor",
      label: "Supervisor",
      type: "select",
      options: supervisores,
      placeholder: "Selecione o supervisor",
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

    const porClienteMap = {};
    const porInstrutorMap = {};

    turmas.forEach((item) => {
      const cliente = item.cliente || "Sem cliente";
      const instrutor = item.instrutor || "Sem instrutor";
      const carga = parseHoras(item.carga_horaria);
      const treinandosTurma = Number(item.participantes || 0);

      if (!porClienteMap[cliente]) {
        porClienteMap[cliente] = {
          cliente,
          turmas: 0,
          treinandos: 0,
          horas: 0,
        };
      }

      porClienteMap[cliente].turmas += 1;
      porClienteMap[cliente].treinandos += treinandosTurma;
      porClienteMap[cliente].horas += carga;

      if (!porInstrutorMap[instrutor]) {
        porInstrutorMap[instrutor] = {
          instrutor,
          turmas: 0,
          treinandos: 0,
          horas: 0,
        };
      }

      porInstrutorMap[instrutor].turmas += 1;
      porInstrutorMap[instrutor].treinandos += treinandosTurma;
      porInstrutorMap[instrutor].horas += carga;
    });

    const porCliente = Object.values(porClienteMap).sort(
      (a, b) => b.turmas - a.turmas
    );

    const rankingInstrutores = Object.values(porInstrutorMap).sort(
      (a, b) => b.turmas - a.turmas || b.horas - a.horas
    );

    const alertas = [];

    if (planejadas > 0) {
      alertas.push(`${planejadas} turma(s) ainda estão planejadas.`);
    }

    if (andamento > 0) {
      alertas.push(`${andamento} turma(s) estão em andamento.`);
    }

    const semInstrutor = turmas.filter((item) => !item.instrutor).length;
    if (semInstrutor > 0) {
      alertas.push(`${semInstrutor} turma(s) sem instrutor definido.`);
    }

    const semSupervisor = turmas.filter((item) => !item.supervisor).length;
    if (semSupervisor > 0) {
      alertas.push(`${semSupervisor} turma(s) sem supervisor definido.`);
    }

    const semCliente = turmas.filter((item) => !item.cliente).length;
    if (semCliente > 0) {
      alertas.push(`${semCliente} turma(s) sem cliente vinculado.`);
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
      porCliente,
      rankingInstrutores,
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
            {(item.cliente || "Sem cliente") +
              " • " +
              (item.instrutor || "Sem instrutor")}
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
      key: "publico",
      label: "Público",
      render: (item) => <span style={plainCell}>{item.publico || "-"}</span>,
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
            style={btnChamada}
            onClick={() => {
              window.location.href = `/turma/${item.id}`;
            }}
          >
            Gestão da turma
          </button>

          <button
            style={btnCronograma}
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
      subtitle="Execução operacional das turmas de treinamento, treinandos e controle de presença."
      endpoint="/treinamentos"
      fields={fields}
      columns={columns}
      recordsTitle="Base de turmas"
      recordsSubtitle="Visão consolidada das turmas cadastradas no portal."
      hero={
        <div style={{ display: "grid", gap: 14 }}>
          {!clientesOptions.length ? (
            <SectionCard
              title="Atenção"
              subtitle="Para cadastrar treinamentos, é necessário ter clientes cadastrados."
            >
              <div style={warningBox}>
                Nenhum cliente encontrado na base. Cadastre pelo menos um cliente
                antes de criar um novo treinamento.
              </div>
            </SectionCard>
          ) : null}

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
              title="Carga horária"
              value={`${fmt(kpis.horas)}h`}
              subtitle="Carga consolidada"
              accent="#7c3aed"
            />
            <StatCard
              title="Clientes disponíveis"
              value={fmt(clientesOptions.length)}
              subtitle="Clientes cadastrados para seleção"
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
            title="Equipe disponível"
            subtitle="Leitura rápida dos usuários elegíveis para condução das turmas."
          >
            <div style={teamGrid}>
              <div style={teamBlock}>
                <div style={teamTitle}>Instrutores</div>
                <div style={teamList}>
                  {instrutores.length ? (
                    instrutores.slice(0, 8).map((item) => (
                      <div key={item.value} style={teamItem}>
                        {item.label}
                      </div>
                    ))
                  ) : (
                    <div style={emptyText}>Nenhum instrutor disponível.</div>
                  )}
                </div>
              </div>

              <div style={teamBlock}>
                <div style={teamTitle}>Supervisores</div>
                <div style={teamList}>
                  {supervisores.length ? (
                    supervisores.slice(0, 8).map((item) => (
                      <div key={item.value} style={teamItem}>
                        {item.label}
                      </div>
                    ))
                  ) : (
                    <div style={emptyText}>Nenhum supervisor disponível.</div>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>

          <div style={twoCol}>
            <SectionCard
              title="Volume por cliente"
              subtitle="Distribuição das turmas por operação."
            >
              <div style={listGrid}>
                {kpis.porCliente.length ? (
                  kpis.porCliente.slice(0, 6).map((item) => (
                    <div key={item.cliente} style={listItem}>
                      <div style={itemTitle}>{item.cliente}</div>
                      <div style={itemMeta}>
                        {item.turmas} turma(s) • {fmt(item.treinandos)} treinandos
                        previstos • {fmt(item.horas)}h
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyText}>Nenhum cliente com turmas cadastradas.</div>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Ranking de instrutores"
              subtitle="Leitura rápida de volume por instrutor."
            >
              <div style={listGrid}>
                {kpis.rankingInstrutores.length ? (
                  kpis.rankingInstrutores.slice(0, 6).map((item) => (
                    <div key={item.instrutor} style={listItem}>
                      <div style={itemTitle}>{item.instrutor}</div>
                      <div style={itemMeta}>
                        {item.turmas} turma(s) • {fmt(item.treinandos)} treinandos
                        previstos • {fmt(item.horas)}h
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyText}>Nenhum instrutor com turmas cadastradas.</div>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Leitura gerencial"
            subtitle="Alertas operacionais da base de turmas."
          >
            <div style={alertsGrid}>
              {kpis.alertas.map((item, index) => (
                <div key={`${item}-${index}`} style={alertItem}>
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

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const listGrid = {
  display: "grid",
  gap: 10,
};

const listItem = {
  background: "#f8fafc",
  padding: 12,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  display: "grid",
  gap: 6,
};

const teamGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const teamBlock = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 10,
};

const teamTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const teamList = {
  display: "grid",
  gap: 8,
};

const teamItem = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "10px 12px",
  color: "#334155",
  fontWeight: 600,
  fontSize: 13,
};

const itemTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const itemMeta = {
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.45,
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

const warningBox = {
  background: "#fff7ed",
  border: "1px solid #fdba74",
  color: "#9a3412",
  borderRadius: 14,
  padding: 14,
  fontWeight: 700,
  lineHeight: 1.5,
};

const emptyText = {
  color: "#64748b",
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

const btnChamada = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 8,
  padding: "7px 10px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};

const btnCronograma = {
  border: "1px solid #ddd6fe",
  background: "#f5f3ff",
  color: "#7c3aed",
  borderRadius: 8,
  padding: "7px 10px",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};
