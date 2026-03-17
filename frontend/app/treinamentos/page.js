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

export default function TreinamentosPage() {
  const [turmas, setTurmas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    async function carregar() {
      try {
        const [treinamentosData, usuariosData] = await Promise.all([
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/usuarios").catch(() => []),
        ]);

        setTurmas(Array.isArray(treinamentosData) ? treinamentosData : []);
        setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
      } catch {
        setTurmas([]);
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
      label: "Turma / treinamento",
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
      key: "data",
      label: "Data",
      render: (item) => <span style={plainCell}>{formatDate(item.data)}</span>,
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
      allowedCreateRoles={["coordenador", "supervisor"]}
      allowedEditRoles={["coordenador", "supervisor"]}
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
              title="Carga horária"
              value={`${fmt(kpis.horas)}h`}
              subtitle="Carga consolidada"
              accent="#7c3aed"
            />
          </div>

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
                        {item.turmas} turma(s) • {fmt(item.treinandos)} treinandos
                        previstos • {fmt(item.horas)}h
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

const btnChamada = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

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

const statusPill = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 11,
};

const plainCell = {
  color: "#334155",
};

const scoreBlue = {
  color: "#1d4ed8",
  fontWeight: 800,
};

const scoreGreen = {
  color: "#15803d",
  fontWeight: 800,
};
