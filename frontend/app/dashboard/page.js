"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function parseHoras(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = String(value).trim().toLowerCase().replace(",", ".");
  const match = text.match(/(\d+(\.\d+)?)/);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return 0;
  return num;
}

function sum(arr) {
  return arr.reduce((acc, n) => acc + Number(n || 0), 0);
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState({});
  const [treinamentos, setTreinamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const [dash, treinamentosData, presencasData, avaliacoesData] = await Promise.all([
          apiFetch("/dashboard").catch(() => ({})),
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/presencas").catch(() => []),
          apiFetch("/avaliacoes").catch(() => []),
        ]);

        setDashboard(dash || {});
        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
        setPresencas(Array.isArray(presencasData) ? presencasData : []);
        setAvaliacoes(Array.isArray(avaliacoesData) ? avaliacoesData : []);
        setErro("");
      } catch (e) {
        setErro(e.message || "Erro ao carregar dados do dashboard");
      }
    }

    carregar();
  }, []);

  const kpis = useMemo(() => {
    const totalParticipacoes = presencas.length;
    const presentes = presencas.filter((p) => String(p.status || "").toLowerCase() === "presente").length;
    const ausentes = presencas.filter((p) => String(p.status || "").toLowerCase() === "ausente").length;
    const justificados = presencas.filter((p) => String(p.status || "").toLowerCase() === "justificado").length;

    const taxaPresenca = totalParticipacoes ? Math.round((presentes / totalParticipacoes) * 100) : 0;
    const taxaAbsenteismo = totalParticipacoes ? Math.round((ausentes / totalParticipacoes) * 100) : 0;

    const horasPorTreinamento = treinamentos.map((t) => ({
      ...t,
      horas: parseHoras(t.carga_horaria),
    }));

    const horasMinistradas = sum(horasPorTreinamento.map((t) => t.horas));

    const horasTreinadas = sum(
      horasPorTreinamento.map((t) => {
        const presentesTreino = presencas.filter(
          (p) => String(p.treinamento_id) === String(t.id) &&
                 String(p.status || "").toLowerCase() === "presente"
        ).length;
        return t.horas * presentesTreino;
      })
    );

    const mediaHorasTreinamento = treinamentos.length
      ? (horasMinistradas / treinamentos.length).toFixed(1)
      : "0.0";

    const mediaAvaliacao = avaliacoes.length
      ? (sum(avaliacoes.map((a) => Number(a.nota_qualidade || 0))) / avaliacoes.length).toFixed(1)
      : "0.0";

    const mediaNps = avaliacoes.length
      ? (sum(avaliacoes.map((a) => Number(a.nota_nps || 0))) / avaliacoes.length).toFixed(1)
      : "0.0";

    const porClienteMap = {};
    treinamentos.forEach((t) => {
      const key = t.cliente || "Sem cliente";
      porClienteMap[key] = (porClienteMap[key] || 0) + 1;
    });

    const treinamentosPorCliente = Object.entries(porClienteMap)
      .map(([cliente, total]) => ({ cliente, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);

    const porInstrutorMap = {};
    treinamentos.forEach((t) => {
      const key = t.instrutor || "Sem instrutor";
      const horas = parseHoras(t.carga_horaria);
      if (!porInstrutorMap[key]) {
        porInstrutorMap[key] = { instrutor: key, treinamentos: 0, horas: 0 };
      }
      porInstrutorMap[key].treinamentos += 1;
      porInstrutorMap[key].horas += horas;
    });

    const rankingInstrutores = Object.values(porInstrutorMap)
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 6);

    const ultimosTreinamentos = [...treinamentos].slice(-5).reverse();
    const ultimasAvaliacoes = [...avaliacoes].slice(-5).reverse();

    return {
      totalParticipacoes,
      presentes,
      ausentes,
      justificados,
      taxaPresenca,
      taxaAbsenteismo,
      horasMinistradas,
      horasTreinadas,
      mediaHorasTreinamento,
      mediaAvaliacao,
      mediaNps,
      treinamentosPorCliente,
      rankingInstrutores,
      ultimosTreinamentos,
      ultimasAvaliacoes,
    };
  }, [treinamentos, presencas, avaliacoes]);

  return (
    <PortalShell
      title="Dashboard estratégico de T&D"
      subtitle="Painel executivo com KPIs reais do setor, pronto para acompanhamento interno e apresentações de resultado."
    >
      {erro ? (
        <div style={errorBox}>{erro}</div>
      ) : null}

      <div style={grid}>
        <StatCard
          title="Clientes"
          value={dashboard?.clientes ?? 0}
          subtitle="Clientes atendidos pelo T&D"
          accent="#2563eb"
        />
        <StatCard
          title="Treinamentos"
          value={dashboard?.treinamentos ?? treinamentos.length}
          subtitle="Ações cadastradas no portal"
          accent="#059669"
        />
        <StatCard
          title="Participações"
          value={kpis.totalParticipacoes}
          subtitle="Registros de presença lançados"
          accent="#7c3aed"
        />
        <StatCard
          title="Avaliações"
          value={dashboard?.avaliacoes ?? avaliacoes.length}
          subtitle="Avaliações, provas e simulados"
          accent="#ea580c"
        />
      </div>

      <div style={{ ...grid, marginTop: 20 }}>
        <StatCard
          title="Horas ministradas"
          value={`${kpis.horasMinistradas}h`}
          subtitle="Soma das cargas horárias aplicadas"
          accent="#0f766e"
          helper="Indicador de volume"
        />
        <StatCard
          title="Horas treinadas"
          value={`${kpis.horasTreinadas}h`}
          subtitle="Carga horária × participantes presentes"
          accent="#1d4ed8"
          helper="Indicador estratégico"
        />
        <StatCard
          title="Taxa de presença"
          value={`${kpis.taxaPresenca}%`}
          subtitle="Participação nos treinamentos"
          accent="#16a34a"
          helper="Acompanhamento de assiduidade"
        />
        <StatCard
          title="Absenteísmo"
          value={`${kpis.taxaAbsenteismo}%`}
          subtitle="Participantes ausentes"
          accent="#dc2626"
          helper="Ponto de atenção"
        />
      </div>

      <div style={{ ...grid, marginTop: 20 }}>
        <StatCard
          title="Justificativas"
          value={kpis.justificados}
          subtitle="Ausências justificadas"
          accent="#ca8a04"
        />
        <StatCard
          title="Média de qualidade"
          value={kpis.mediaAvaliacao}
          subtitle="Nota média das avaliações"
          accent="#0891b2"
        />
        <StatCard
          title="NPS médio"
          value={kpis.mediaNps}
          subtitle="Percepção média das ações"
          accent="#9333ea"
        />
        <StatCard
          title="Média de horas"
          value={`${kpis.mediaHorasTreinamento}h`}
          subtitle="Carga média por treinamento"
          accent="#475569"
        />
      </div>

      <div style={twoCol}>
        <SectionCard
          title="Treinamentos por cliente"
          subtitle="Leitura executiva das operações mais movimentadas"
        >
          {kpis.treinamentosPorCliente.length ? (
            <div style={listGrid}>
              {kpis.treinamentosPorCliente.map((item) => (
                <div key={item.cliente} style={listItem}>
                  <div style={itemTitle}>{item.cliente}</div>
                  <div style={itemMeta}>{item.total} treinamento(s)</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhum treinamento por cliente disponível.</div>
          )}
        </SectionCard>

        <SectionCard
          title="Ranking de instrutores"
          subtitle="Visão por volume de treinamentos e horas"
        >
          {kpis.rankingInstrutores.length ? (
            <div style={listGrid}>
              {kpis.rankingInstrutores.map((item) => (
                <div key={item.instrutor} style={listItem}>
                  <div style={itemTitle}>{item.instrutor}</div>
                  <div style={itemMeta}>
                    {item.treinamentos} treinamento(s) • {item.horas}h
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhum instrutor disponível para ranking.</div>
          )}
        </SectionCard>
      </div>

      <div style={{ ...twoCol, marginTop: 20 }}>
        <SectionCard
          title="Treinamentos recentes"
          subtitle="Últimos registros lançados no sistema"
        >
          {kpis.ultimosTreinamentos.length ? (
            <div style={listGrid}>
              {kpis.ultimosTreinamentos.map((t, i) => (
                <div key={t.id || i} style={listItem}>
                  <div style={itemTitle}>{t.titulo || t.tema || "Treinamento"}</div>
                  <div style={itemMeta}>
                    {t.cliente || "Sem cliente"} • {t.instrutor || "Sem instrutor"} • {t.carga_horaria || "0h"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhum treinamento cadastrado ainda.</div>
          )}
        </SectionCard>

        <SectionCard
          title="Avaliações recentes"
          subtitle="Últimos registros de avaliação do portal"
        >
          {kpis.ultimasAvaliacoes.length ? (
            <div style={listGrid}>
              {kpis.ultimasAvaliacoes.map((a, i) => (
                <div key={a.id || i} style={listItem}>
                  <div style={itemTitle}>{a.titulo || a.tipo_registro || "Avaliação"}</div>
                  <div style={itemMeta}>
                    Qualidade: {a.nota_qualidade ?? "-"} • NPS: {a.nota_nps ?? "-"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhuma avaliação registrada ainda.</div>
          )}
        </SectionCard>
      </div>
    </PortalShell>
  );
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 18,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 18,
  marginTop: 20,
};

const listGrid = {
  display: "grid",
  gap: 12,
};

const listItem = {
  background: "#f8fafc",
  padding: 14,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
};

const itemTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const itemMeta = {
  marginTop: 6,
  color: "#475569",
  fontSize: 14,
};

const emptyText = {
  color: "#64748b",
};

const errorBox = {
  background: "#fee2e2",
  padding: 16,
  borderRadius: 12,
  color: "#7f1d1d",
  marginBottom: 20,
};
