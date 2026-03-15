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
  return match ? Number(match[1]) || 0 : 0;
}

function sum(arr) {
  return arr.reduce((acc, n) => acc + Number(n || 0), 0);
}

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
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
    const presentes = presencas.filter((p) => String(p.status || p.presente ? "presente" : "").toLowerCase().includes("presente")).length;
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
          (p) => String(p.treinamento_id) === String(t.id) && String(p.status || "").toLowerCase() === "presente"
        ).length;
        return t.horas * presentesTreino;
      })
    );

    const mediaHorasTreinamento = treinamentos.length ? (horasMinistradas / treinamentos.length).toFixed(1) : "0.0";
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
      .sort((a, b) => b.total - a.total);

    const porInstrutorMap = {};
    treinamentos.forEach((t) => {
      const key = t.instrutor || "Sem instrutor";
      const horas = parseHoras(t.carga_horaria);
      if (!porInstrutorMap[key]) {
        porInstrutorMap[key] = { instrutor: key, treinamentos: 0, horas: 0, participantes: 0 };
      }
      porInstrutorMap[key].treinamentos += 1;
      porInstrutorMap[key].horas += horas;
      porInstrutorMap[key].participantes += Number(t.participantes || 0);
    });
    const rankingInstrutores = Object.values(porInstrutorMap).sort((a, b) => b.treinamentos - a.treinamentos || b.horas - a.horas);

    const alertas = treinamentos
      .map((t) => {
        const participantes = Number(t.participantes || 0);
        const presentesTurma = presencas.filter((p) => String(p.treinamento_id) === String(t.id) && String(p.status || "").toLowerCase() === "presente").length;
        const ausentesTurma = presencas.filter((p) => String(p.treinamento_id) === String(t.id) && String(p.status || "").toLowerCase() === "ausente").length;
        const taxa = participantes ? Math.round((presentesTurma / participantes) * 100) : 0;
        return {
          id: t.id,
          tema: t.tema || t.titulo || "Treinamento",
          cliente: t.cliente || "Sem cliente",
          instrutor: t.instrutor || "Sem instrutor",
          ausentes: ausentesTurma,
          taxa,
          status: taxa < 85 ? "critico" : taxa < 92 ? "atencao" : "ok"
        };
      })
      .filter((item) => item.status !== "ok")
      .sort((a, b) => a.taxa - b.taxa)
      .slice(0, 5);

    const ultimosTreinamentos = [...treinamentos].slice(-6).reverse();
    const ultimasAvaliacoes = [...avaliacoes].slice(-6).reverse();

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
      alertas,
      ultimosTreinamentos,
      ultimasAvaliacoes,
    };
  }, [treinamentos, presencas, avaliacoes]);

  const maxCliente = Math.max(...kpis.treinamentosPorCliente.map((item) => item.total), 1);
  const maxInstrutor = Math.max(...kpis.rankingInstrutores.map((item) => item.treinamentos), 1);

  return (
    <PortalShell
      title="Dashboard estratégico de T&D"
      subtitle="Painel executivo com KPIs reais do setor, pronto para acompanhamento interno, tomada de decisão e apresentações de resultado."
    >
      {erro ? <div style={errorBox}>{erro}</div> : null}

      <div style={heroWrap}>
        <div style={heroTextBlock}>
          <div style={heroBadge}>Visão executiva</div>
          <h2 style={heroTitle}>Gestão de treinamento com leitura de diretoria</h2>
          <p style={heroText}>
            Acompanhe volume, presença, qualidade, impacto por cliente e produtividade do time de instrutores em um único ambiente.
          </p>
        </div>
        <div style={heroMiniGrid}>
          <div style={miniStatCard}>
            <strong>{fmt(kpis.presentes)}</strong>
            <span>presenças confirmadas</span>
          </div>
          <div style={miniStatCard}>
            <strong>{fmt(kpis.ausentes)}</strong>
            <span>ausências mapeadas</span>
          </div>
          <div style={miniStatCard}>
            <strong>{fmt(kpis.justificados)}</strong>
            <span>justificativas registradas</span>
          </div>
        </div>
      </div>

      <div style={gridFour}>
        <StatCard title="Clientes" value={dashboard?.clientes ?? 0} subtitle="Clientes atendidos pelo T&D" accent="#2563eb" helper="Cobertura atual" />
        <StatCard title="Treinamentos" value={dashboard?.treinamentos ?? treinamentos.length} subtitle="Ações cadastradas no portal" accent="#059669" helper="Volume operacional" />
        <StatCard title="Participações" value={fmt(kpis.totalParticipacoes)} subtitle="Registros de presença lançados" accent="#7c3aed" helper="Base consolidada" />
        <StatCard title="Avaliações" value={dashboard?.avaliacoes ?? avaliacoes.length} subtitle="NPS, qualidade e provas" accent="#ea580c" helper="Leitura de aprendizagem" />
      </div>

      <div style={{ ...gridFour, marginTop: 18 }}>
        <StatCard title="Horas ministradas" value={`${fmt(kpis.horasMinistradas)}h`} subtitle="Soma das cargas horárias aplicadas" accent="#0f766e" helper="Indicador de volume" />
        <StatCard title="Horas treinadas" value={`${fmt(kpis.horasTreinadas)}h`} subtitle="Carga horária × participantes presentes" accent="#1d4ed8" helper="Indicador estratégico" />
        <StatCard title="Taxa de presença" value={`${kpis.taxaPresenca}%`} subtitle="Participação nas ações do setor" accent="#16a34a" helper="Assiduidade" />
        <StatCard title="Absenteísmo" value={`${kpis.taxaAbsenteismo}%`} subtitle="Participantes ausentes no ciclo" accent="#dc2626" helper="Ponto de atenção" />
      </div>

      <div style={{ ...gridFour, marginTop: 18 }}>
        <StatCard title="Justificativas" value={fmt(kpis.justificados)} subtitle="Ausências justificadas" accent="#ca8a04" helper="Controle disciplinado" />
        <StatCard title="Média de qualidade" value={kpis.mediaAvaliacao} subtitle="Nota média das avaliações" accent="#0891b2" helper="Aprendizagem percebida" />
        <StatCard title="NPS médio" value={kpis.mediaNps} subtitle="Percepção média das ações" accent="#9333ea" helper="Satisfação do público" />
        <StatCard title="Média de horas" value={`${kpis.mediaHorasTreinamento}h`} subtitle="Carga média por treinamento" accent="#475569" helper="Padronização do portfólio" />
      </div>

      <div style={twoCol}>
        <SectionCard title="Impacto por cliente" subtitle="Distribuição dos treinamentos para leitura executiva por operação.">
          {kpis.treinamentosPorCliente.length ? (
            <div style={barsWrap}>
              {kpis.treinamentosPorCliente.map((item) => (
                <div key={item.cliente} style={barRow}>
                  <div style={barHeader}>
                    <span style={barLabel}>{item.cliente}</span>
                    <strong style={barValue}>{item.total}</strong>
                  </div>
                  <div style={barTrack}>
                    <div style={{ ...barFill, width: `${(item.total / maxCliente) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhum treinamento por cliente disponível.</div>
          )}
        </SectionCard>

        <SectionCard title="Ranking de instrutores" subtitle="Quem mais entregou turmas e horas no período.">
          {kpis.rankingInstrutores.length ? (
            <div style={barsWrap}>
              {kpis.rankingInstrutores.slice(0, 6).map((item) => (
                <div key={item.instrutor} style={barRow}>
                  <div style={barHeader}>
                    <div>
                      <div style={barLabel}>{item.instrutor}</div>
                      <div style={mutedSmall}>{fmt(item.participantes)} participantes • {item.horas}h</div>
                    </div>
                    <strong style={barValue}>{item.treinamentos}</strong>
                  </div>
                  <div style={barTrack}>
                    <div style={{ ...barFill, width: `${(item.treinamentos / maxInstrutor) * 100}%`, background: "linear-gradient(90deg, #9333ea 0%, #7c3aed 100%)" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhum instrutor disponível para ranking.</div>
          )}
        </SectionCard>
      </div>

      <div style={{ ...twoCol, marginTop: 18 }}>
        <SectionCard title="Alertas executivos" subtitle="Turmas que pedem atenção imediata do time de T&D.">
          {kpis.alertas.length ? (
            <div style={listGrid}>
              {kpis.alertas.map((item) => (
                <div key={item.id} style={alertCard(item.status)}>
                  <div style={alertTop}>
                    <span style={alertBadge(item.status)}>{item.status === "critico" ? "Crítico" : "Atenção"}</span>
                    <strong>{item.taxa}% presença</strong>
                  </div>
                  <div style={itemTitle}>{item.tema}</div>
                  <div style={itemMeta}>{item.cliente} • {item.instrutor}</div>
                  <div style={{ ...itemMeta, marginTop: 8 }}>{item.ausentes} ausência(s) sinalizada(s)</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhum alerta crítico no momento. O cenário está saudável.</div>
          )}
        </SectionCard>

        <SectionCard title="Leitura gerencial" subtitle="Argumentos rápidos para reunião com superintendência.">
          <div style={managerNotes}>
            <div style={noteItem}><strong>Capilaridade:</strong> {fmt(dashboard?.clientes ?? 0)} clientes com ações registradas no portal.</div>
            <div style={noteItem}><strong>Produtividade:</strong> {fmt(dashboard?.treinamentos ?? treinamentos.length)} turmas mapeadas e {fmt(kpis.horasTreinadas)} horas treinadas.</div>
            <div style={noteItem}><strong>Assiduidade:</strong> presença média de {kpis.taxaPresenca}% com absenteísmo de {kpis.taxaAbsenteismo}%.</div>
            <div style={noteItem}><strong>Percepção:</strong> NPS médio de {kpis.mediaNps} e média de qualidade de {kpis.mediaAvaliacao}.</div>
          </div>
        </SectionCard>
      </div>

      <div style={{ ...twoCol, marginTop: 18 }}>
        <SectionCard title="Treinamentos recentes" subtitle="Últimos registros lançados no sistema.">
          {kpis.ultimosTreinamentos.length ? (
            <div style={listGrid}>
              {kpis.ultimosTreinamentos.map((t, i) => (
                <div key={t.id || i} style={listItem}>
                  <div style={itemTitle}>{t.tema || t.titulo || "Treinamento"}</div>
                  <div style={itemMeta}>{t.cliente || "Sem cliente"} • {t.instrutor || "Sem instrutor"}</div>
                  <div style={{ ...itemMeta, marginTop: 6 }}>{t.carga_horaria || "0h"} • {fmt(t.participantes || 0)} participantes</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhum treinamento cadastrado ainda.</div>
          )}
        </SectionCard>

        <SectionCard title="Avaliações recentes" subtitle="Últimos registros de avaliação do portal.">
          {kpis.ultimasAvaliacoes.length ? (
            <div style={listGrid}>
              {kpis.ultimasAvaliacoes.map((a, i) => (
                <div key={a.id || i} style={listItem}>
                  <div style={itemTitle}>{a.titulo || a.tipo_registro || "Avaliação"}</div>
                  <div style={itemMeta}>Qualidade: {a.nota_qualidade ?? "-"} • NPS: {a.nota_nps ?? "-"}</div>
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

const heroWrap = {
  display: "grid",
  gridTemplateColumns: "1.6fr .9fr",
  gap: 18,
  marginBottom: 18
};

const heroTextBlock = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 26,
  padding: 24,
  color: "#fff",
  boxShadow: "0 20px 36px rgba(29, 78, 216, 0.18)"
};

const heroBadge = {
  display: "inline-block",
  background: "rgba(255,255,255,.14)",
  padding: "7px 12px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".06em"
};

const heroTitle = {
  margin: "18px 0 10px",
  fontSize: 30,
  lineHeight: 1.05
};

const heroText = {
  margin: 0,
  color: "rgba(255,255,255,.82)",
  lineHeight: 1.7,
  maxWidth: 720
};

const heroMiniGrid = {
  display: "grid",
  gap: 14
};

const miniStatCard = {
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid #dbeafe",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 16px 28px rgba(15,23,42,.06)",
  display: "grid",
  gap: 6
};

const gridFour = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 18,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 18,
  marginTop: 20,
};

const barsWrap = { display: "grid", gap: 14 };
const barRow = { display: "grid", gap: 8 };
const barHeader = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" };
const barLabel = { fontWeight: 800, color: "#0f172a" };
const barValue = { color: "#1d4ed8" };
const mutedSmall = { color: "#64748b", fontSize: 13, marginTop: 4 };
const barTrack = { height: 11, background: "#e2e8f0", borderRadius: 999, overflow: "hidden" };
const barFill = { height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)" };

const listGrid = { display: "grid", gap: 12 };
const listItem = { background: "#f8fafc", padding: 14, borderRadius: 16, border: "1px solid #e2e8f0" };
const itemTitle = { fontWeight: 800, color: "#0f172a" };
const itemMeta = { marginTop: 6, color: "#475569", fontSize: 14 };
const emptyText = { color: "#64748b" };

const alertCard = (status) => ({
  background: status === "critico" ? "#fff1f2" : "#fff7ed",
  border: status === "critico" ? "1px solid #fecdd3" : "1px solid #fed7aa",
  padding: 16,
  borderRadius: 18,
  display: "grid",
  gap: 8
});
const alertTop = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" };
const alertBadge = (status) => ({
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 12,
  color: status === "critico" ? "#be123c" : "#9a3412",
  background: status === "critico" ? "#ffe4e6" : "#ffedd5"
});

const managerNotes = { display: "grid", gap: 12 };
const noteItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 14,
  color: "#334155",
  lineHeight: 1.6
};

const errorBox = {
  background: "#fee2e2",
  padding: 16,
  borderRadius: 12,
  color: "#7f1d1d",
  marginBottom: 20,
};
