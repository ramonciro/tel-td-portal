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
    return { ...base, background: "#dcfce7", color: "#166534" };
  }

  if (label === "Atenção") {
    return { ...base, background: "#fff7ed", color: "#c2410c" };
  }

  return { ...base, background: "#fee2e2", color: "#b91c1c" };
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
  const [participantesMap, setParticipantesMap] = useState({});

  useEffect(() => {
    async function carregar() {
      try {
        const [treinamentosData, avaliacoesData] = await Promise.all([
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/avaliacoes").catch(() => []),
        ]);

        const listaTreinamentos = Array.isArray(treinamentosData) ? treinamentosData : [];
        setTreinamentos(listaTreinamentos);
        setAvaliacoes(Array.isArray(avaliacoesData) ? avaliacoesData : []);

        const participantesObj = {};

        await Promise.all(
          listaTreinamentos.map(async (t) => {
            try {
              const participantes = await apiFetch(`/treinamentos/${t.id}/participantes`).catch(() => []);
              participantesObj[String(t.id)] = Array.isArray(participantes) ? participantes : [];
            } catch {
              participantesObj[String(t.id)] = [];
            }
          })
        );

        setParticipantesMap(participantesObj);
      } catch {
        setTreinamentos([]);
        setAvaliacoes([]);
        setParticipantesMap({});
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

  const participanteOptions = useMemo(() => {
    const options = [];

    Object.entries(participantesMap).forEach(([treinamentoId, participantes]) => {
      const treinamento = treinamentos.find((t) => String(t.id) === String(treinamentoId));
      const nomeTurma = treinamento?.tema || treinamento?.titulo || "Treinamento";

      participantes.forEach((p) => {
        options.push({
          value: p.nome,
          label: `${p.nome} - ${nomeTurma}`,
        });
      });
    });

    return options;
  }, [participantesMap, treinamentos]);

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
        name: "treinando_nome",
        label: "Treinando",
        type: "select",
        options: participanteOptions,
        placeholder: "Selecione o treinando",
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
    [treinamentoOptions, participanteOptions]
  );

  const kpis = useMemo(() => {
    const totalAvaliacoes = avaliacoes.length;
    const mediaNps = avg(avaliacoes, "nota_nps").toFixed(1);
    const mediaQualidade = avg(avaliacoes, "nota_qualidade").toFixed(1);
    const mediaProva = avg(avaliacoes, "nota_prova").toFixed(1);

    const aprovados = avaliacoes.filter(
      (item) => classificarResultado(item) === "Aprovado"
    ).length;

    const atencao = avaliacoes.filter(
      (item) => classificarResultado(item) === "Atenção"
    ).length;

    const reforco = avaliacoes.filter(
      (item) => classificarResultado(item) === "Reforço"
    ).length;

    const porInstrutorMap = {};
    const porClienteMap = {};

    avaliacoes.forEach((item) => {
      const treinamento = treinamentos.find(
        (t) => String(t.id) === String(item.treinamento_id)
      );

      const cliente = treinamento?.cliente || "Sem cliente";
      const instrutor = treinamento?.instrutor || "Sem instrutor";

      if (!porClienteMap[cliente]) {
        porClienteMap[cliente] = {
          cliente,
          total: 0,
          somaQualidade: 0,
          reforco: 0,
        };
      }

      porClienteMap[cliente].total += 1;
      porClienteMap[cliente].somaQualidade += Number(item.nota_qualidade || 0);
      if (classificarResultado(item) === "Reforço") {
        porClienteMap[cliente].reforco += 1;
      }

      if (!porInstrutorMap[instrutor]) {
        porInstrutorMap[instrutor] = {
          instrutor,
          total: 0,
          somaQualidade: 0,
          reforco: 0,
        };
      }

      porInstrutorMap[instrutor].total += 1;
      porInstrutorMap[instrutor].somaQualidade += Number(item.nota_qualidade || 0);
      if (classificarResultado(item) === "Reforço") {
        porInstrutorMap[instrutor].reforco += 1;
      }
    });

    const porCliente = Object.values(porClienteMap).map((item) => ({
      ...item,
      mediaQualidade: item.total
        ? (item.somaQualidade / item.total).toFixed(1)
        : "0.0",
    }));

    const rankingInstrutores = Object.values(porInstrutorMap).map((item) => ({
      ...item,
      mediaQualidade: item.total
        ? (item.somaQualidade / item.total).toFixed(1)
        : "0.0",
    }));

    return {
      totalAvaliacoes,
      mediaNps,
      mediaQualidade,
      mediaProva,
      aprovados,
      atencao,
      reforco,
      porCliente,
      rankingInstrutores,
    };
  }, [avaliacoes, treinamentos]);

  const columns = [
    {
      key: "treinando_nome",
      label: "Treinando",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.treinando_nome || "-"}</div>
          <div style={subCell}>
            {(() => {
              const treinamento = treinamentos.find(
                (t) => String(t.id) === String(item.treinamento_id)
              );
              return (treinamento?.tema || "Treinamento") + " • " + (treinamento?.cliente || "Sem cliente");
            })()}
          </div>
        </div>
      ),
    },
    {
      key: "nota_nps",
      label: "NPS",
      render: (item) => <strong style={scoreBlue}>{item.nota_nps ?? "-"}</strong>,
    },
    {
      key: "nota_qualidade",
      label: "Qualidade",
      render: (item) => <strong style={scoreGreen}>{item.nota_qualidade ?? "-"}</strong>,
    },
    {
      key: "nota_prova",
      label: "Avaliação",
      render: (item) => <strong style={scorePurple}>{item.nota_prova ?? "-"}</strong>,
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
      subtitle="Lançamento individual por treinando, com leitura executiva de desempenho."
      endpoint="/avaliacoes"
      fields={fields}
      columns={columns}
      recordsTitle="Base de avaliações individuais"
      recordsSubtitle="Resultado por treinando, turma e instrutor."
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
              subtitle="Nota entre 6 e 7,9"
              accent="#f59e0b"
            />
            <StatCard
              title="Reforço"
              value={fmt(kpis.reforco)}
              subtitle="Nota abaixo de 6"
              accent="#b91c1c"
            />
          </div>

          <div style={twoCol}>
            <SectionCard
              title="Resultado por cliente"
              subtitle="Leitura consolidada de desempenho por operação."
            >
              <div style={listGrid}>
                {kpis.porCliente.length ? (
                  kpis.porCliente.slice(0, 6).map((item) => (
                    <div key={item.cliente} style={listItem}>
                      <div style={itemTitle}>{item.cliente}</div>
                      <div style={itemMeta}>
                        {item.total} avaliação(ões) • Qualidade média {item.mediaQualidade}
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
              subtitle="Leitura da qualidade por instrutor."
            >
              <div style={listGrid}>
                {kpis.rankingInstrutores.length ? (
                  kpis.rankingInstrutores.slice(0, 6).map((item) => (
                    <div key={item.instrutor} style={listItem}>
                      <div style={itemTitle}>{item.instrutor}</div>
                      <div style={itemMeta}>
                        {item.total} avaliação(ões) • Qualidade média {item.mediaQualidade}
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
