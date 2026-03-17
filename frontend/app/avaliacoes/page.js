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

function getNotaFinal(item) {
  const prova = Number(item?.nota_prova || 0);
  const qualidade = Number(item?.nota_qualidade || 0);
  return prova > 0 ? prova : qualidade;
}

function classificarResultado(item) {
  const nota = getNotaFinal(item);

  if (nota >= 8) return "Aprovado";
  if (nota >= 6) return "Atenção";
  return "Reforço";
}

function badgeClassificacao(label) {
  const base = {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };

  if (label === "Aprovado") {
    return {
      ...base,
      background: "#dcfce7",
      color: "#166534",
    };
  }

  if (label === "Atenção") {
    return {
      ...base,
      background: "#fff7ed",
      color: "#c2410c",
    };
  }

  return {
    ...base,
    background: "#fee2e2",
    color: "#b91c1c",
  };
}

function acaoRecomendada(item) {
  const status = classificarResultado(item);

  if (status === "Aprovado") return "Manter evolução";
  if (status === "Atenção") return "Acompanhar desempenho";
  return "Aplicar reforço";
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
        label: "Turma / treinamento",
        type: "select",
        options: treinamentoOptions,
        placeholder: "Selecione a turma",
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
        placeholder: "0 a 10",
      },
      {
        name: "nota_prova",
        label: "Nota da avaliação",
        type: "number",
        placeholder: "0 a 10",
      },
      {
        name: "comentario",
        label: "Comentário / feedback",
        type: "textarea",
        placeholder: "Comentários sobre desempenho, reforço ou evolução",
      },
    ],
    [treinamentoOptions]
  );

  const kpis = useMemo(() => {
    const totalAvaliacoes = avaliacoes.length;
    const mediaNps = avg(avaliacoes, "nota_nps");
    const mediaQualidade = avg(avaliacoes, "nota_qualidade");
    const mediaProva = avg(avaliacoes, "nota_prova");

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

    const aprovados = avaliacoes.filter(
      (item) => classificarResultado(item) === "Aprovado"
    ).length;

    const atencao = avaliacoes.filter(
      (item) => classificarResultado(item) === "Atenção"
    ).length;

    const reforco = avaliacoes.filter(
      (item) => classificarResultado(item) === "Reforço"
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
      const notaProva = Number(item.nota_prova || 0);

      if (!porClienteMap[cliente]) {
        porClienteMap[cliente] = {
          cliente,
          total: 0,
          somaQualidade: 0,
          somaNps: 0,
          somaProva: 0,
          reforco: 0,
        };
      }

      porClienteMap[cliente].total += 1;
      porClienteMap[cliente].somaQualidade += notaQualidade;
      porClienteMap[cliente].somaNps += notaNps;
      porClienteMap[cliente].somaProva += notaProva;
      if (classificarResultado(item) === "Reforço") {
        porClienteMap[cliente].reforco += 1;
      }

      if (!porInstrutorMap[instrutor]) {
        porInstrutorMap[instrutor] = {
          instrutor,
          total: 0,
          somaQualidade: 0,
          somaNps: 0,
          somaProva: 0,
          reforco: 0,
        };
      }

      porInstrutorMap[instrutor].total += 1;
      porInstrutorMap[instrutor].somaQualidade += notaQualidade;
      porInstrutorMap[instrutor].somaNps += notaNps;
      porInstrutorMap[instrutor].somaProva += notaProva;
      if (classificarResultado(item) === "Reforço") {
        porInstrutorMap[instrutor].reforco += 1;
      }
    });

    const porCliente = Object.values(porClienteMap)
      .map((item) => ({
        ...item,
        mediaQualidade: item.total
          ? (item.somaQualidade / item.total).toFixed(1)
          : "0.0",
        mediaNps: item.total ? (item.somaNps / item.total).toFixed(1) : "0.0",
        mediaProva: item.total ? (item.somaProva / item.total).toFixed(1) : "0.0",
      }))
      .sort((a, b) => Number(b.mediaQualidade) - Number(a.mediaQualidade));

    const rankingInstrutores = Object.values(porInstrutorMap)
      .map((item) => ({
        ...item,
        mediaQualidade: item.total
          ? (item.somaQualidade / item.total).toFixed(1)
          : "0.0",
        mediaNps: item.total ? (item.somaNps / item.total).toFixed(1) : "0.0",
        mediaProva: item.total ? (item.somaProva / item.total).toFixed(1) : "0.0",
      }))
      .sort(
        (a, b) =>
          Number(b.mediaQualidade) - Number(a.mediaQualidade) ||
          b.total - a.total
      );

    const alertas = [];

    if (treinamentosSemAvaliacao > 0) {
      alertas.push(
        `${treinamentosSemAvaliacao} turma(s) ainda sem avaliação registrada.`
      );
    }

    const clientesComReforco = porCliente.filter((item) => item.reforco > 0);
    if (clientesComReforco.length) {
      alertas.push(
        `Há ${clientesComReforco.length} cliente(s) com necessidade de reforço.`
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
      mediaProva: mediaProva.toFixed(1),
      treinamentosComAvaliacao,
      treinamentosSemAvaliacao,
      taxaAplicacao,
      aprovados,
      atencao,
      reforco,
      porCliente,
      rankingInstrutores,
      alertas,
    };
  }, [avaliacoes, treinamentos]);

  const columns = [
    {
      key: "treinamento_id",
      label: "Turma",
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
      key: "nota_prova",
      label: "Avaliação",
      render: (item) => (
        <strong style={scorePurple}>{item.nota_prova ?? "-"}</strong>
      ),
    },
    {
      key: "classificacao",
      label: "Status",
      render: (item) => {
        const label = classificarResultado(item);
        return <span style={badgeClassificacao(label)}>{label}</span>;
      },
    },
    {
      key: "comentario",
      label: "Ação recomendada",
      render: (item) => <span style={obsCell}>{acaoRecomendada(item)}</span>,
    },
  ];

  return (
    <CrudPageV2
      title="Gestão de Avaliações"
      subtitle="Painel operacional e executivo do aproveitamento das turmas."
      endpoint="/avaliacoes"
      fields={fields}
      columns={columns}
      recordsTitle="Base de avaliações"
      recordsSubtitle="Registros consolidados de satisfação, qualidade e avaliação."
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
              title="Média avaliação"
              value={kpis.mediaProva}
              subtitle="Nota média das provas"
              accent="#7c3aed"
            />
          </div>

          <div style={heroGrid}>
            <StatCard
              title="Aprovados"
              value={fmt(kpis.aprovados)}
              subtitle="Nota final ≥ 8"
              accent="#16a34a"
            />
            <StatCard
              title="Atenção"
              value={fmt(kpis.atencao)}
              subtitle="Nota final entre 6 e 7,9"
              accent="#f59e0b"
            />
            <StatCard
              title="Reforço"
              value={fmt(kpis.reforco)}
              subtitle="Nota final abaixo de 6"
              accent="#b91c1c"
            />
            <StatCard
              title="Taxa de aplicação"
              value={`${kpis.taxaAplicacao}%`}
              subtitle="Turmas com avaliação"
              accent="#0f766e"
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
                        NPS médio {item.mediaNps} • Avaliação média {item.mediaProva}
                      </div>
                      <div style={itemSubMeta}>
                        {item.reforco} registro(s) em reforço
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
              subtitle="Quem sustenta melhor percepção e aproveitamento."
            >
              <div style={listGrid}>
                {kpis.rankingInstrutores.length ? (
                  kpis.rankingInstrutores.slice(0, 6).map((item) => (
                    <div key={item.instrutor} style={listItem}>
                      <div style={itemTitle}>{item.instrutor}</div>
                      <div style={itemMeta}>
                        {item.total} avaliação(ões) • Qualidade média {item.mediaQualidade} •
                        NPS médio {item.mediaNps} • Avaliação média {item.mediaProva}
                      </div>
                      <div style={itemSubMeta}>
                        {item.reforco} registro(s) em reforço
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
  marginTop: 6,
  color: "#64748b",
  fontSize: 12,
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

const scoreBlue = {
  color: "#1d4ed8",
  fontWeight: 800,
};

const scoreGreen = {
  color: "#15803d",
  fontWeight: 800,
};

const scorePurple = {
  color: "#7c3aed",
  fontWeight: 800,
};

const obsCell = {
  color: "#334155",
  fontWeight: 600,
};
