"use client";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function parseEtapas(value) {
  if (!value) return [];
  return String(value)
    .split(/\n|,|;|\|/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusLabel(status) {
  const key = normalizeText(status);

  if (key === "ativa" || key === "ativo") return "Ativa";
  if (key === "em construção" || key === "em construcao") return "Em construção";
  if (key === "concluída" || key === "concluida") return "Concluída";

  return "Ativa";
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

  if (label === "Ativa") {
    return { ...base, background: "#dcfce7", color: "#166534" };
  }

  if (label === "Em construção") {
    return { ...base, background: "#ffedd5", color: "#9a3412" };
  }

  return { ...base, background: "#dbeafe", color: "#1d4ed8" };
}

function coverageBadge(total) {
  return {
    display: "inline-block",
    padding: "5px 8px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
    background: total > 0 ? "#eff6ff" : "#f1f5f9",
    color: total > 0 ? "#1d4ed8" : "#64748b",
  };
}

function TrilhaCard({ item, onEdit, onDelete }) {
  const percentual =
    item.etapasCount > 0
      ? Math.min(
          100,
          Math.round(
            ((item.materiaisRelacionados > 0 ? 1 : 0) +
              (item.treinamentosRelacionados > 0 ? 1 : 0) +
              (item.avaliacoesRelacionadas > 0 ? 1 : 0)) /
              3 *
              100
          )
        )
      : 0;

  return (
    <div style={card}>
      <div style={cardTop}>
        <div style={cardTopRow}>
          <span style={statusStyle(item.status)}>{statusLabel(item.status)}</span>
          <span style={coverageBadge(percentual)}>{percentual}% cobertura</span>
        </div>

        <div style={cardTitle}>{item.titulo || "Sem título"}</div>
        <div style={cardMeta}>
          {(item.cliente || "GLOBAL") +
            " • " +
            (item.publico || "Público não informado")}
        </div>
      </div>

      <div style={cardBody}>
        <p style={descricao}>
          {item.descricao || "Trilha sem descrição cadastrada."}
        </p>

        <div style={metricsGrid}>
          <div style={metricBox}>
            <strong>{fmt(item.etapasCount)}</strong>
            <span>etapas</span>
          </div>
          <div style={metricBox}>
            <strong>{fmt(item.materiaisRelacionados)}</strong>
            <span>materiais</span>
          </div>
          <div style={metricBox}>
            <strong>{fmt(item.treinamentosRelacionados)}</strong>
            <span>treinamentos</span>
          </div>
          <div style={metricBox}>
            <strong>{fmt(item.avaliacoesRelacionadas)}</strong>
            <span>avaliações</span>
          </div>
        </div>

        {item.etapasPreview.length ? (
          <div style={etapasWrap}>
            {item.etapasPreview.map((etapa, index) => (
              <div key={index} style={etapaItem}>
                {index + 1}. {etapa}
              </div>
            ))}
            {item.etapasCount > 4 ? (
              <div style={etapaMore}>+ {item.etapasCount - 4} etapa(s)</div>
            ) : null}
          </div>
        ) : null}

        <div style={cardActions}>
          <button onClick={onEdit} style={editBtn}>
            Editar
          </button>
          <button onClick={onDelete} style={deleteBtn}>
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TrilhasPage() {
  const [trilhas, setTrilhas] = useState([]);
  const [biblioteca, setBiblioteca] = useState([]);
  const [treinamentos, setTreinamentos] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);

  useEffect(() => {
    async function carregar() {
      try {
        const [trilhasData, bibliotecaData, treinamentosData, avaliacoesData] =
          await Promise.all([
            apiFetch("/trilhas").catch(() => []),
            apiFetch("/biblioteca").catch(() => []),
            apiFetch("/treinamentos").catch(() => []),
            apiFetch("/avaliacoes").catch(() => []),
          ]);

        setTrilhas(Array.isArray(trilhasData) ? trilhasData : []);
        setBiblioteca(Array.isArray(bibliotecaData) ? bibliotecaData : []);
        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
        setAvaliacoes(Array.isArray(avaliacoesData) ? avaliacoesData : []);
      } catch {
        setTrilhas([]);
        setBiblioteca([]);
        setTreinamentos([]);
        setAvaliacoes([]);
      }
    }

    carregar();
  }, []);

  const fields = [
    {
      name: "titulo",
      label: "Título da trilha",
      placeholder: "Nome da trilha",
    },
    {
      name: "cliente",
      label: "Cliente",
      placeholder: "Cliente ou GLOBAL",
    },
    {
      name: "publico",
      label: "Público",
      placeholder: "Ex.: onboarding, operação, liderança",
    },
    {
      name: "objetivo",
      label: "Objetivo",
      placeholder: "Objetivo principal da trilha",
    },
    {
      name: "responsavel",
      label: "Responsável",
      placeholder: "Responsável pela trilha",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Ativa", label: "Ativa" },
        { value: "Em construção", label: "Em construção" },
        { value: "Concluída", label: "Concluída" },
      ],
      placeholder: "Selecione o status",
    },
    {
      name: "etapas",
      label: "Etapas",
      type: "textarea",
      placeholder: "Liste as etapas da trilha, uma por linha",
    },
    {
      name: "descricao",
      label: "Descrição",
      type: "textarea",
      placeholder: "Contexto e aplicação da trilha",
    },
  ];

  const trilhasEnriquecidas = useMemo(() => {
    return trilhas.map((item) => {
      const etapas = parseEtapas(item.etapas);
      const cliente = item.cliente || "GLOBAL";

      const materiaisRelacionados = biblioteca.filter(
        (b) => (b.cliente || "GLOBAL") === cliente
      ).length;

      const treinamentosRelacionados = treinamentos.filter(
        (t) => (t.cliente || "GLOBAL") === cliente
      ).length;

      const idsTreinamentosCliente = treinamentos
        .filter((t) => (t.cliente || "GLOBAL") === cliente)
        .map((t) => String(t.id));

      const avaliacoesRelacionadas = avaliacoes.filter((a) =>
        idsTreinamentosCliente.includes(String(a.treinamento_id))
      ).length;

      return {
        ...item,
        etapasCount: etapas.length,
        etapasPreview: etapas.slice(0, 4),
        materiaisRelacionados,
        treinamentosRelacionados,
        avaliacoesRelacionadas,
      };
    });
  }, [trilhas, biblioteca, treinamentos, avaliacoes]);

  const columns = [
    {
      key: "titulo",
      label: "Trilha",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.titulo || "-"}</div>
          <div style={subCell}>
            {(item.cliente || "GLOBAL") + " • " + (item.publico || "Sem público")}
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
      key: "objetivo",
      label: "Objetivo",
      render: (item) => <span style={plainCell}>{item.objetivo || "-"}</span>,
    },
    {
      key: "responsavel",
      label: "Responsável",
      render: (item) => <span style={plainCell}>{item.responsavel || "-"}</span>,
    },
  ];

  const kpis = useMemo(() => {
    const total = trilhasEnriquecidas.length;
    const ativas = trilhasEnriquecidas.filter(
      (item) => statusLabel(item.status) === "Ativa"
    ).length;
    const construcao = trilhasEnriquecidas.filter(
      (item) => statusLabel(item.status) === "Em construção"
    ).length;
    const concluidas = trilhasEnriquecidas.filter(
      (item) => statusLabel(item.status) === "Concluída"
    ).length;

    const comMaterial = trilhasEnriquecidas.filter(
      (item) => item.materiaisRelacionados > 0
    ).length;

    const comTreinamento = trilhasEnriquecidas.filter(
      (item) => item.treinamentosRelacionados > 0
    ).length;

    const porClienteMap = {};
    trilhasEnriquecidas.forEach((item) => {
      const cliente = item.cliente || "GLOBAL";
      if (!porClienteMap[cliente]) {
        porClienteMap[cliente] = {
          cliente,
          total: 0,
          etapas: 0,
          materiais: 0,
          treinamentos: 0,
        };
      }

      porClienteMap[cliente].total += 1;
      porClienteMap[cliente].etapas += item.etapasCount;
      porClienteMap[cliente].materiais += item.materiaisRelacionados;
      porClienteMap[cliente].treinamentos += item.treinamentosRelacionados;
    });

    const porCliente = Object.values(porClienteMap).sort(
      (a, b) => b.total - a.total
    );

    const alertas = [];

    const incompletas = trilhasEnriquecidas.filter(
      (item) =>
        item.materiaisRelacionados === 0 ||
        item.treinamentosRelacionados === 0 ||
        item.etapasCount === 0
    ).length;

    if (incompletas > 0) {
      alertas.push(`${incompletas} trilha(s) ainda com cobertura incompleta.`);
    }

    if (construcao > 0) {
      alertas.push(`${construcao} trilha(s) estão em construção.`);
    }

    const semResponsavel = trilhasEnriquecidas.filter(
      (item) => !item.responsavel
    ).length;

    if (semResponsavel > 0) {
      alertas.push(`${semResponsavel} trilha(s) sem responsável definido.`);
    }

    if (!alertas.length) {
      alertas.push("Trilhas organizadas, sem pendências críticas no momento.");
    }

    return {
      total,
      ativas,
      construcao,
      concluidas,
      comMaterial,
      comTreinamento,
      porCliente,
      alertas,
    };
  }, [trilhasEnriquecidas]);

  return (
    <CrudPageV2
      title="Trilhas"
      subtitle="Jornadas de aprendizagem com leitura executiva, operacional e de cobertura."
      endpoint="/trilhas"
      fields={fields}
      columns={columns}
      recordsTitle="Trilhas cadastradas"
      recordsSubtitle="Visão consolidada das jornadas estruturadas no portal."
      recordsGridStyle={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 12,
      }}
      renderRecordCard={({ item, onEdit, onDelete }) => {
        const enriched = trilhasEnriquecidas.find(
          (registro) => String(registro.id) === String(item.id)
        );

        return (
          <TrilhaCard
            key={item.id}
            item={enriched || item}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        );
      }}
      hero={
        <div style={{ display: "grid", gap: 14 }}>
          <div style={heroGrid}>
            <StatCard
              title="Trilhas"
              value={fmt(kpis.total)}
              subtitle="Base total"
              accent="#2563eb"
            />
            <StatCard
              title="Ativas"
              value={fmt(kpis.ativas)}
              subtitle="Em uso no portal"
              accent="#16a34a"
            />
            <StatCard
              title="Em construção"
              value={fmt(kpis.construcao)}
              subtitle="Em estruturação"
              accent="#ea580c"
            />
            <StatCard
              title="Concluídas"
              value={fmt(kpis.concluidas)}
              subtitle="Estruturadas"
              accent="#7c3aed"
            />
          </div>

          <div style={heroGrid}>
            <StatCard
              title="Com materiais"
              value={fmt(kpis.comMaterial)}
              subtitle="Cobertura da biblioteca"
              accent="#0891b2"
            />
            <StatCard
              title="Com treinamentos"
              value={fmt(kpis.comTreinamento)}
              subtitle="Cobertura operacional"
              accent="#0f766e"
            />
          </div>

          <div style={twoCol}>
            <SectionCard
              title="Cobertura por cliente"
              subtitle="Clientes com maior estrutura de trilhas e jornada."
            >
              <div style={listGrid}>
                {kpis.porCliente.length ? (
                  kpis.porCliente.slice(0, 6).map((item) => (
                    <div key={item.cliente} style={listItem}>
                      <div style={itemTitle}>{item.cliente}</div>
                      <div style={itemMeta}>
                        {item.total} trilha(s) • {fmt(item.etapas)} etapa(s) •{" "}
                        {fmt(item.materiais)} material(is) •{" "}
                        {fmt(item.treinamentos)} treinamento(s)
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyText}>Nenhum cliente disponível.</div>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Leitura gerencial"
              subtitle="Pontos rápidos para acompanhamento do portfólio de trilhas."
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

const card = {
  background: "#ffffff",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  overflow: "hidden",
  boxShadow: "0 8px 18px rgba(15,23,42,.04)",
};

const cardTop = {
  padding: 14,
  background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)",
  borderBottom: "1px solid #e2e8f0",
};

const cardTopRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const cardTitle = {
  marginTop: 10,
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.2,
};

const cardMeta = {
  marginTop: 6,
  color: "#475569",
  fontSize: 12,
  lineHeight: 1.4,
};

const cardBody = {
  padding: 14,
};

const descricao = {
  margin: "0 0 12px",
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
};

const metricsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
  marginBottom: 12,
};

const metricBox = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 4,
  textAlign: "center",
};

const etapasWrap = {
  display: "grid",
  gap: 6,
  marginBottom: 12,
};

const etapaItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 12,
  color: "#334155",
};

const etapaMore = {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 700,
};

const cardActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const editBtn = {
  border: 0,
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "9px 12px",
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
};

const deleteBtn = {
  border: 0,
  background: "#fee2e2",
  color: "#b91c1c",
  padding: "9px 12px",
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
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
  lineHeight: 1.35,
};

const plainCell = {
  color: "#334155",
  fontWeight: 600,
};
