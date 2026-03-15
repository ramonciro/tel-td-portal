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

  if (key === "concluido" || key === "concluído") return "Concluído";
  if (key === "em_andamento" || key === "em andamento") return "Em andamento";
  return "Planejado";
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

  if (label === "Concluído") {
    return { ...base, background: "#dcfce7", color: "#166534" };
  }

  if (label === "Em andamento") {
    return { ...base, background: "#ffedd5", color: "#9a3412" };
  }

  return { ...base, background: "#dbeafe", color: "#1d4ed8" };
}

export default function TreinamentosPage() {
  const [treinamentos, setTreinamentos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    async function carregar() {
      try {
        const [treinamentosData, usuariosData] = await Promise.all([
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/usuarios").catch(() => []),
        ]);

        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
        setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
      } catch {
        setTreinamentos([]);
        setUsuarios([]);
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
        label: `${item.nome}${item.cliente ? ` - ${item.cliente}` : ""}`,
      }));
  }, [usuarios]);

  const fields = [
    {
      name: "tema",
      label: "Treinamento",
      placeholder: "Tema ou nome da turma",
    },
    {
      name: "cliente",
      label: "Cliente",
      placeholder: "Cliente vinculado",
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
      placeholder: "Supervisor responsável",
    },
    {
      name: "publico",
      label: "Público",
      placeholder: "Ex.: Operação, onboarding, reciclagem",
    },
    {
      name: "carga_horaria",
      label: "Carga horária",
      placeholder: "Ex.: 4h",
    },
    {
      name: "participantes",
      label: "Participantes",
      type: "number",
      placeholder: "Quantidade prevista",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "planejado", label: "Planejado" },
        { value: "em_andamento", label: "Em andamento" },
        { value: "concluido", label: "Concluído" },
      ],
      placeholder: "Selecione o status",
    },
    {
      name: "data",
      label: "Data-base",
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
    const total = treinamentos.length;
    const planejados = treinamentos.filter(
      (item) => statusLabel(item.status) === "Planejado"
    ).length;
    const andamento = treinamentos.filter(
      (item) => statusLabel(item.status) === "Em andamento"
    ).length;
    const concluidos = treinamentos.filter(
      (item) => statusLabel(item.status) === "Concluído"
    ).length;

    const participantes = treinamentos.reduce(
      (acc, item) => acc + Number(item.participantes || 0),
      0
    );

    const horas = treinamentos.reduce(
      (acc, item) => acc + parseHoras(item.carga_horaria),
      0
    );

    const porClienteMap = {};
    const porInstrutorMap = {};

    treinamentos.forEach((item) => {
      const cliente = item.cliente || "Sem cliente";
      const instrutor = item.instrutor || "Sem instrutor";
      const carga = parseHoras(item.carga_horaria);
      const publico = Number(item.participantes || 0);

      if (!porClienteMap[cliente]) {
        porClienteMap[cliente] = {
          cliente,
          treinamentos: 0,
          participantes: 0,
          horas: 0,
        };
      }

      porClienteMap[cliente].treinamentos += 1;
      porClienteMap[cliente].participantes += publico;
      porClienteMap[cliente].horas += carga;

      if (!porInstrutorMap[instrutor]) {
        porInstrutorMap[instrutor] = {
          instrutor,
          treinamentos: 0,
          participantes: 0,
          horas: 0,
        };
      }

      porInstrutorMap[instrutor].treinamentos += 1;
      porInstrutorMap[instrutor].participantes += publico;
      porInstrutorMap[instrutor].horas += carga;
    });

    const porCliente = Object.values(porClienteMap).sort(
      (a, b) => b.treinamentos - a.treinamentos
    );

    const rankingInstrutores = Object.values(porInstrutorMap).sort(
      (a, b) => b.treinamentos - a.treinamentos || b.horas - a.horas
    );

    const alertas = [];

    if (planejados > 0) {
      alertas.push(`${planejados} treinamento(s) ainda estão planejados.`);
    }

    if (andamento > 0) {
      alertas.push(`${andamento} treinamento(s) estão em andamento.`);
    }

    const semInstrutor = treinamentos.filter((item) => !item.instrutor).length;
    if (semInstrutor > 0) {
      alertas.push(`${semInstrutor} treinamento(s) sem instrutor definido.`);
    }

    const semCliente = treinamentos.filter((item) => !item.cliente).length;
    if (semCliente > 0) {
      alertas.push(`${semCliente} treinamento(s) sem cliente vinculado.`);
    }

    if (!alertas.length) {
      alertas.push("Base organizada, sem pendências críticas no momento.");
    }

    return {
      total,
      planejados,
      andamento,
      concluidos,
      participantes,
      horas,
      porCliente,
      rankingInstrutores,
      alertas,
    };
  }, [treinamentos]);

  const columns = [
    {
      key: "tema",
      label: "Treinamento",
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
      key: "publico",
      label: "Público",
      render: (item) => <span style={plainCell}>{item.publico || "-"}</span>,
    },
    {
      key: "participantes",
      label: "Participantes",
      render: (item) => <strong style={scoreBlue}>{fmt(item.participantes || 0)}</strong>,
    },
    {
      key: "carga_horaria",
      label: "Carga horária",
      render: (item) => <strong style={scoreGreen}>{item.carga_horaria || "-"}</strong>,
    },
    {
      key: "supervisor",
      label: "Supervisor",
      render: (item) => <span style={plainCell}>{item.supervisor || "-"}</span>,
    },
  ];

  return (
    <CrudPageV2
      title="Treinamentos"
      subtitle="Gestão executiva das ações de treinamento do setor."
      endpoint="/treinamentos"
      fields={fields}
      columns={columns}
      recordsTitle="Base de treinamentos"
      recordsSubtitle="Visão consolidada das ações cadastradas."
      hero={
        <div style={{ display: "grid", gap: 14 }}>
          <div style={heroGrid}>
            <StatCard
              title="Treinamentos"
              value={fmt(kpis.total)}
              subtitle="Base total"
              accent="#2563eb"
            />
            <StatCard
              title="Planejados"
              value={fmt(kpis.planejados)}
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
              title="Concluídos"
              value={fmt(kpis.concluidos)}
              subtitle="Ações finalizadas"
              accent="#16a34a"
            />
          </div>

          <div style={heroGrid}>
            <StatCard
              title="Participantes"
              value={fmt(kpis.participantes)}
              subtitle="Capacidade prevista"
              accent="#06b6d4"
            />
            <StatCard
              title="Horas"
              value={`${fmt(kpis.horas)}h`}
              subtitle="Carga consolidada"
              accent="#7c3aed"
            />
          </div>

          <div style={twoCol}>
            <SectionCard
              title="Impacto por cliente"
              subtitle="Distribuição dos treinamentos por operação."
            >
              <div style={listGrid}>
                {kpis.porCliente.length ? (
                  kpis.porCliente.slice(0, 6).map((item) => (
                    <div key={item.cliente} style={listItem}>
                      <div style={itemTitle}>{item.cliente}</div>
                      <div style={itemMeta}>
                        {item.treinamentos} treinamento(s) • {fmt(item.participantes)} participantes • {fmt(item.horas)}h
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyText}>Nenhum cliente disponível.</div>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Ranking de instrutores"
              subtitle="Produtividade por volume e carga horária."
            >
              <div style={listGrid}>
                {kpis.rankingInstrutores.length ? (
                  kpis.rankingInstrutores.slice(0, 6).map((item) => (
                    <div key={item.instrutor} style={listItem}>
                      <div style={itemTitle}>{item.instrutor}</div>
                      <div style={itemMeta}>
                        {item.treinamentos} treinamento(s) • {fmt(item.participantes)} participantes • {fmt(item.horas)}h
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyText}>Nenhum instrutor disponível.</div>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Alertas e leitura gerencial"
            subtitle="Pontos rápidos para acompanhamento da operação."
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
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
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
};

const itemTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const itemMeta = {
  marginTop: 5,
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.45,
};

const alertGrid = {
  display: "grid",
  gap: 10,
};

const alertItem = {
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
  borderRadius: 12,
  padding: 12,
  fontWeight: 600,
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
  lineHeight: 1.35,
};

const plainCell = {
  color: "#334155",
  fontWeight: 600,
};

const scoreBlue = {
  color: "#1d4ed8",
  fontWeight: 800,
};

const scoreGreen = {
  color: "#15803d",
  fontWeight: 800,
};
