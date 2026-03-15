"use client";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function avg(arr, field) {
  if (!arr.length) return 0;
  const total = arr.reduce((acc, item) => acc + Number(item?.[field] || 0), 0);
  return total / arr.length;
}

function avgText(arr, field) {
  return avg(arr, field).toFixed(1);
}

function classificarNota(nota) {
  const n = Number(nota || 0);
  if (n >= 9) return "Excelente";
  if (n >= 7) return "Boa";
  return "Crítica";
}

function badgeClassificacao(label) {
  const base = {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };

  if (label === "Excelente") {
    return {
      ...base,
      background: "#dcfce7",
      color: "#166534",
    };
  }

  if (label === "Boa") {
    return {
      ...base,
      background: "#dbeafe",
      color: "#1d4ed8",
    };
  }

  return {
    ...base,
    background: "#fee2e2",
    color: "#b91c1c",
  };
}

function faixaLabel(item) {
  const qualidade = Number(item?.nota_qualidade || 0);
  return classificarNota(qualidade);
}

export default function AvaliacoesPage() {
  const [treinamentos, setTreinamentos] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);

  useEffect(() => {
    async function carregar() {
      try {
        const [treinamentosData, avaliacoesData] = await Promise.all([
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/avaliacoes").catch(() => []),
        ]);

        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
        setAvaliacoes(Array.isArray(avaliacoesData) ? avaliacoesData : []);
      } catch {
        setTreinamentos([]);
        setAvaliacoes([]);
      }
    }

    carregar();
  }, []);

  const treinamentoOptions = useMemo(() => {
    return treinamentos.map((item) => ({
      value: item.id,
      label: `${item.tema || item.titulo || "Treinamento"}${
        item.cliente ? ` - ${item.cliente}` : ""
      }`,
    }));
  }, [treinamentos]);

  const fields = useMemo(
    () => [
      {
        name: "treinamento_id",
        label: "Treinamento",
        type: "select",
        options: treinamentoOptions,
        placeholder: "Selecione o treinamento",
      },
      {
        name: "tipo_registro",
        label: "Tipo",
        type: "select",
        options: [
          { value: "Avaliação", label: "Avaliação" },
          { value: "Prova", label: "Prova" },
          { value: "Teste", label: "Teste" },
          { value: "Simulado", label: "Simulado" },
        ],
        placeholder: "Selecione o tipo",
      },
      {
        name: "titulo",
        label: "Título",
        placeholder: "Nome da avaliação ou atividade",
      },
      {
        name: "nota_nps",
        label: "NPS / satisfação",
        type: "number",
        placeholder: "0 a 10",
      },
      {
        name: "nota_qualidade",
        label: "Qualidade / aproveitamento",
        type: "number",
        placeholder: "0 a 10 ou percentual",
      },
      {
        name: "observacoes",
        label: "Observações",
        type: "textarea",
        placeholder: "Comentários rápidos",
      },
    ],
    [treinamentoOptions]
  );

  const kpis = useMemo(() => {
    const totalAvaliacoes = avaliacoes.length;
    const mediaNps = avg(avaliacoes, "nota_nps");
    const mediaQualidade = avg(avaliacoes, "nota_qualidade");

    const idsComAvaliacao = new Set(
      avaliacoes.map((item) => String(item.treinamento_id)).filter(Boolean)
    );

    const treinamentosComAvaliacao = treinamentos.filter((t) =>
      idsComAvaliacao.has(String(t.id))
    ).length;

    const treinamentosSemAvaliacao = Math.max(
      treinamentos.length - treinamentosComAvaliacao,
      0
    );

    const taxaAplicacao = treinamentos.length
      ? Math.round((treinamentosComAvaliacao / treinamentos.length) * 100)
      : 0;

    const excelentes = avaliacoes.filter(
      (item) => classificarNota(item.nota_qualidade) === "Excelente"
    ).length;

    const boas = avaliacoes.filter(
      (item) => classificarNota(item.nota_qualidade) === "Boa"
    ).length;

    const criticas = avaliacoes.filter(
      (item) => classificarNota(item.nota_qualidade) === "Crítica"
    ).length;

    const porClienteMap = {};
    const porInstrutorMap = {};

    avaliacoes.forEach((item) => {
      const treinamento = treinamentos.find(
        (t) => String(t.id) === String(item.treinamento_id)
      );

      const cliente = treinamento?.cliente || "Sem cliente";
      const instrutor = treinamento?.instrutor || "Sem instrutor";
      const notaQualidade = Number(item.nota_qualidade || 0);
      const notaNps = Number(item.nota_nps || 0);

      if (!porClienteMap[cliente]) {
        porClienteMap[cliente] = {
          cliente,
          total: 0,
          somaQualidade: 0,
          somaNps: 0,
          criticas: 0,
        };
      }

      porClienteMap[cliente].total += 1;
      porClienteMap[cliente].somaQualidade += notaQualidade;
      porClienteMap[cliente].somaNps += notaNps;
      if (classificarNota(notaQualidade) === "Crítica") {
        porClienteMap[cliente].criticas += 1;
      }

      if (!porInstrutorMap[instrutor]) {
        porInstrutorMap[instrutor] = {
          instrutor,
          total: 0,
          somaQualidade: 0,
          somaNps: 0,
          criticas: 0,
        };
      }

      porInstrutorMap[instrutor].total += 1;
      porInstrutorMap[instrutor].somaQualidade += notaQualidade;
      porInstrutorMap[instrutor].somaNps += notaNps;
      if (classificarNota(notaQualidade) === "Crítica") {
        porInstrutorMap[instrutor].criticas += 1;
      }
    });

    const porCliente = Object.values(porClienteMap)
      .map((item) => ({
        ...item,
        mediaQualidade: item.total
          ? (item.somaQualidade / item.total).toFixed(1)
          : "0.0",
        mediaNps: item.total ? (item.somaNps / item.total).toFixed(1) : "0.0",
      }))
      .sort((a, b) => Number(b.mediaQualidade) - Number(a.mediaQualidade));

    const rankingInstrutores = Object.values(porInstrutorMap)
      .map((item) => ({
        ...item,
        mediaQualidade: item.total
          ? (item.somaQualidade / item.total).toFixed(1)
          : "0.0",
        mediaNps: item.total ? (item.somaNps / item.total).toFixed(1) : "0.0",
      }))
      .sort(
        (a, b) =>
          Number(b.mediaQualidade) - Number(a.mediaQualidade) ||
          b.total - a.total
      );

    const alertas = [];

    if (treinamentosSemAvaliacao > 0) {
      alertas.push(
        `${treinamentosSemAvaliacao} treinamento(s) ainda sem avaliação registrada.`
      );
    }

    const clientesCriticos = porCliente.filter((item) => item.criticas > 0);
    if (clientesCriticos.length) {
      alertas.push(
        `Há ${clientesCriticos.length} cliente(s) com avaliações críticas na base.`
      );
    }

    const instrutoresAbaixoMeta = rankingInstrutores.filter(
      (item) => Number(item.mediaQualidade) < 7
    );
    if (instrutoresAbaixoMeta.length) {
      alertas.push(
        `${instrutoresAbaixoMeta.length} instrutor(es) estão abaixo da meta de qualidade.`
      );
    }

    if (!alertas.length) {
      alertas.push("Não há alertas críticos neste momento.");
    }

    return {
      totalAvaliacoes,
      mediaNps: mediaNps.toFixed(1),
      mediaQualidade: mediaQualidade.toFixed(1),
      treinamentosComAvaliacao,
      treinamentosSemAvaliacao,
      taxaAplicacao,
      excelentes,
      boas,
      criticas,
      porCliente,
      rankingInstrutores,
      alertas,
    };
  }, [avaliacoes, treinamentos]);

  const columns = [
    {
      key: "tipo_registro",
      label: "Tipo",
      render: (item) => (
        <span style={tipoBadge}>{item.tipo_registro || "Avaliação"}</span>
      ),
    },
    {
      key: "treinamento_id",
      label: "Treinamento",
      render: (item) => {
        const treinamento = treinamentos.find(
          (t) => String(t.id) === String(item.treinamento_id)
        );

        return (
          <div>
            <div style={titleCell}>
              {treinamento?.tema || treinamento?.titulo || "Treinamento"}
            </div>
            <div style={subCell}>
              {(treinamento?.cliente || "Sem cliente") +
                " • " +
                (treinamento?.instrutor || "Sem instrutor")}
            </div>
          </div>
        );
      },
    },
    {
      key: "titulo",
      label: "Título",
      render: (item) => <span style={plainCell}>{item.titulo || "-"}</span>,
    },
    {
      key: "nota_nps",
      label: "NPS",
      render: (item) => <strong style={scoreBlue}>{item.nota_nps ?? "-"}</strong>,
    },
    {
      key: "nota_qualidade",
      label: "Qualidade",
      render: (item) => (
        <strong style={scoreGreen}>{item.nota_qualidade ?? "-"}</strong>
      ),
    },
    {
      key: "classificacao",
      label: "Classificação",
      render: (item) => {
        const label = faixaLabel(item);
        return <span style={badgeClassificacao(label)}>{label}</span>;
      },
    },
    {
      key: "observacoes",
      label: "Ação recomendada",
      render: (item) => {
        const label = faixaLabel(item);

        const acao =
          label === "Excelente"
            ? "Manter prática"
            : label === "Boa"
            ? "Acompanhar"
            : "Revisar conteúdo";

        return <span style={obsCell}>{acao}</span>;
      },
    },
  ];

  return (
    <CrudPageV2
      title="Avaliações"
      subtitle="Painel executivo de efetividade do treinamento."
      endpoint="/avaliacoes"
      fields={fields}
      columns={columns}
      recordsTitle="Base de avaliações"
      recordsSubtitle="Registros consolidados de avaliação, prova, teste e simulado."
      hero={
        <div style={{ display: "grid", gap: 14 }}>
          <div style={heroGrid}>
            <StatCard
              title="Avaliações"
              value={fmt(kpis.totalAvaliacoes)}
              subtitle="Registros lançados"
              accent="#dc2626"
            />
            <StatCard
              title="NPS médio"
              value={kpis.mediaNps}
              subtitle="Percepção do treinamento"
              accent="#2563eb"
            />
            <StatCard
              title="Qualidade média"
              value={kpis.mediaQualidade}
              subtitle="Aproveitamento geral"
              accent="#059669"
            />
            <StatCard
              title="Taxa de aplicação"
              value={`${kpis.taxaAplicacao}%`}
              subtitle="Treinamentos com avaliação"
              accent="#7c3aed"
            />
          </div>

          <div style={heroGrid}>
            <StatCard
              title="Excelentes"
              value={fmt(kpis.excelentes)}
              subtitle="Qualidade ≥ 9"
              accent="#16a34a"
            />
            <StatCard
              title="Boas"
              value={fmt(kpis.boas)}
              subtitle="Qualidade entre 7 e 8,9"
              accent="#0ea5e9"
            />
            <StatCard
              title="Críticas"
              value={fmt(kpis.criticas)}
              subtitle="Qualidade abaixo de 7"
              accent="#b91c1c"
            />
            <StatCard
              title="Sem avaliação"
              value={fmt(kpis.treinamentosSemAvaliacao)}
              subtitle="Treinamentos pendentes"
              accent="#f59e0b"
            />
          </div>

          <div style={twoCol}>
            <SectionCard
              title="Resultado por cliente"
              subtitle="Leitura consolidada das avaliações por operação."
            >
              <div style={listGrid}>
                {kpis.porCliente.length ? (
                  kpis.porCliente.slice(0, 6).map((item) => (
                    <div key={item.cliente} style={listItem}>
                      <div style={itemTitle}>{item.cliente}</div>
                      <div style={itemMeta}>
                        {item.total} avaliação(ões) • Qualidade média {item.mediaQualidade} •
                        NPS médio {item.mediaNps}
                      </div>
                      <div style={itemSubMeta}>
                        {item.criticas} crítica(s) registrada(s)
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptyText}>Nenhum resultado por cliente disponível.</div>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Ranking de instrutores"
              subtitle="Quem está sustentando melhor percepção e qualidade."
            >
              <div style={listGrid}>
                {kpis.rankingInstrutores.length ? (
                  kpis.rankingInstrutores.slice(0, 6).map((item) => (
                    <div key={item.instrutor} style={listItem}>
                      <div style={itemTitle}>{item.instrutor}</div>
                      <div style={itemMeta}>
                        {item.total} avaliação(ões) • Qualidade média {item.mediaQualidade} •
                        NPS médio {item.mediaNps}
                      </div>
                      <div style={itemSubMeta}>
                        {item.criticas} crítica(s) registrada(s)
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
            title="Alertas e recomendações"
            subtitle="Leitura rápida para gestão e tomada de decisão."
          >
            <div style={alertGrid}>
              {kpis.alertas.map((alerta, index) => (
                <div key={index} style={alertItem}>
                  {alerta}
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

const itemSubMeta = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 12,
};

const alertGrid = {
  display: "grid",
  gap: 10,
};

const alertItem = {
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  borderRadius: 12,
  padding: 12,
  fontWeight: 600,
};

const emptyText = {
  color: "#64748b",
};

const tipoBadge = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: 999,
  background: "#eef2ff",
  color: "#4338ca",
  fontWeight: 800,
  fontSize: 11,
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

const obsCell = {
  display: "inline-block",
  maxWidth: 180,
  color: "#475569",
  lineHeight: 1.4,
};

const scoreBlue = {
  color: "#1d4ed8",
  fontWeight: 800,
};

const scoreGreen = {
  color: "#15803d",
  fontWeight: 800,
};
