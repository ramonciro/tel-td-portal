"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

export default function TurmasPage() {
  const [treinamentos, setTreinamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [treinamentosData, presencasData] = await Promise.all([
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/presencas").catch(() => []),
        ]);
        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
        setPresencas(Array.isArray(presencasData) ? presencasData : []);
        setErro("");
      } catch (error) {
        setErro(error.message || "Erro ao carregar turmas");
      }
    }
    load();
  }, []);

  const turmas = useMemo(() => {
    return treinamentos
      .map((t) => {
        const registros = presencas.filter((p) => String(p.treinamento_id) === String(t.id));
        const presentes = registros.filter((p) => String(p.status || "").toLowerCase() === "presente").length;
        const ausentes = registros.filter((p) => String(p.status || "").toLowerCase() === "ausente").length;
        const justificados = registros.filter((p) => String(p.status || "").toLowerCase() === "justificado").length;
        const participantesPrevistos = Number(t.participantes || registros.length || 0);
        const taxaPresenca = participantesPrevistos ? Math.round((presentes / participantesPrevistos) * 100) : 0;
        const statusRisco = taxaPresenca < 85 ? "Crítico" : taxaPresenca < 92 ? "Atenção" : "Saudável";

        return {
          id: t.id,
          nome: t.tema || t.titulo || t.turma || "Turma",
          cliente: t.cliente || "Sem cliente",
          instrutor: t.instrutor || "Sem instrutor",
          supervisor: t.supervisor || "Não informado",
          publico: t.publico || "Operação",
          cargaHoraria: t.carga_horaria || "0h",
          data: t.data || "Sem data",
          status: t.status || "planejado",
          participantesPrevistos,
          presentes,
          ausentes,
          justificados,
          taxaPresenca,
          statusRisco,
        };
      })
      .sort((a, b) => a.taxaPresenca - b.taxaPresenca || b.participantesPrevistos - a.participantesPrevistos);
  }, [treinamentos, presencas]);

  const resumo = useMemo(() => {
    const totalTurmas = turmas.length;
    const totalParticipantes = turmas.reduce((acc, item) => acc + item.participantesPrevistos, 0);
    const totalPresentes = turmas.reduce((acc, item) => acc + item.presentes, 0);
    const totalAusentes = turmas.reduce((acc, item) => acc + item.ausentes, 0);
    const mediaPresenca = totalParticipantes ? Math.round((totalPresentes / totalParticipantes) * 100) : 0;
    const criticas = turmas.filter((item) => item.statusRisco === "Crítico").length;
    const atencao = turmas.filter((item) => item.statusRisco === "Atenção").length;

    return { totalTurmas, totalParticipantes, totalPresentes, totalAusentes, mediaPresenca, criticas, atencao };
  }, [turmas]);

  const topClientes = useMemo(() => {
    const map = {};
    turmas.forEach((item) => {
      if (!map[item.cliente]) {
        map[item.cliente] = { cliente: item.cliente, turmas: 0, participantes: 0, media: 0 };
      }
      map[item.cliente].turmas += 1;
      map[item.cliente].participantes += item.participantesPrevistos;
      map[item.cliente].media += item.taxaPresenca;
    });

    return Object.values(map)
      .map((item) => ({ ...item, media: Math.round(item.media / item.turmas) }))
      .sort((a, b) => b.turmas - a.turmas)
      .slice(0, 6);
  }, [turmas]);

  const rankingInstrutores = useMemo(() => {
    const map = {};
    turmas.forEach((item) => {
      if (!map[item.instrutor]) {
        map[item.instrutor] = { instrutor: item.instrutor, turmas: 0, participantes: 0, media: 0 };
      }
      map[item.instrutor].turmas += 1;
      map[item.instrutor].participantes += item.participantesPrevistos;
      map[item.instrutor].media += item.taxaPresenca;
    });

    return Object.values(map)
      .map((item) => ({ ...item, media: Math.round(item.media / item.turmas) }))
      .sort((a, b) => b.turmas - a.turmas || b.media - a.media)
      .slice(0, 6);
  }, [turmas]);

  return (
    <PortalShell
      title="Turmas"
      subtitle="Visão executiva das turmas com leitura de presença, risco, capacidade, clientes e produtividade dos instrutores."
    >
      {erro ? <div style={errorBox}>{erro}</div> : null}

      <div style={heroGrid}>
        <SectionCard title="Leitura de diretoria" subtitle="Transformamos a antiga página de presença em uma visão gerencial da turma para acompanhamento, priorização e argumentação executiva.">
          <div style={heroList}>
            <div style={heroListItem}><strong>Resumo da turma:</strong> cliente, instrutor, carga horária, público e status.</div>
            <div style={heroListItem}><strong>Indicadores:</strong> presença média, ausências, justificativas e capacidade treinada.</div>
            <div style={heroListItem}><strong>Risco:</strong> turmas críticas, atenção e saudáveis para atuação mais rápida.</div>
          </div>
        </SectionCard>
        <div style={heroKpis}>
          <div style={miniHighlight}><strong>{resumo.mediaPresenca}%</strong><span>presença média</span></div>
          <div style={miniHighlight}><strong>{resumo.criticas}</strong><span>turma(s) crítica(s)</span></div>
          <div style={miniHighlight}><strong>{resumo.atencao}</strong><span>turma(s) em atenção</span></div>
        </div>
      </div>

      <div style={gridFour}>
        <StatCard title="Turmas" value={fmt(resumo.totalTurmas)} subtitle="Ações consolidadas no portal" accent="#2563eb" helper="Base executiva" />
        <StatCard title="Participantes" value={fmt(resumo.totalParticipantes)} subtitle="Capacidade planejada das turmas" accent="#059669" helper="Público treinado" />
        <StatCard title="Presentes" value={fmt(resumo.totalPresentes)} subtitle="Participações confirmadas" accent="#16a34a" helper="Entrega efetiva" />
        <StatCard title="Ausentes" value={fmt(resumo.totalAusentes)} subtitle="Ausências identificadas" accent="#dc2626" helper="Gestão de risco" />
      </div>

      <div style={{ ...twoCol, marginTop: 18 }}>
        <SectionCard title="Impacto por cliente" subtitle="Quantidade de turmas e presença média por operação.">
          <div style={listGrid}>
            {topClientes.map((item) => (
              <div key={item.cliente} style={listItem}>
                <div style={itemTitle}>{item.cliente}</div>
                <div style={itemMeta}>{item.turmas} turma(s) • {fmt(item.participantes)} participantes • {item.media}% presença média</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Ranking de instrutores" subtitle="Quem mais sustentou turmas e público treinado.">
          <div style={listGrid}>
            {rankingInstrutores.map((item) => (
              <div key={item.instrutor} style={listItem}>
                <div style={itemTitle}>{item.instrutor}</div>
                <div style={itemMeta}>{item.turmas} turma(s) • {fmt(item.participantes)} participantes • {item.media}% presença média</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div style={{ marginTop: 18 }}>
        <SectionCard title="Painel das turmas" subtitle="Tela pensada para apresentar andamento, risco e cobertura do setor para liderança.">
          <div style={turmaGrid}>
            {turmas.map((item) => (
              <div key={item.id} style={turmaCard}>
                <div style={turmaTop}>
                  <span style={riskBadge(item.statusRisco)}>{item.statusRisco}</span>
                  <span style={presencePill}>{item.taxaPresenca}% presença</span>
                </div>
                <div style={turmaTitle}>{item.nome}</div>
                <div style={turmaMeta}>{item.cliente} • {item.instrutor}</div>

                <div style={metricsGrid}>
                  <div style={metricBox}><strong>{fmt(item.participantesPrevistos)}</strong><span>previstos</span></div>
                  <div style={metricBox}><strong>{fmt(item.presentes)}</strong><span>presentes</span></div>
                  <div style={metricBox}><strong>{fmt(item.ausentes)}</strong><span>ausentes</span></div>
                  <div style={metricBox}><strong>{fmt(item.justificados)}</strong><span>justificados</span></div>
                </div>

                <div style={infoStack}>
                  <div><strong>Público:</strong> {item.publico}</div>
                  <div><strong>Carga horária:</strong> {item.cargaHoraria}</div>
                  <div><strong>Supervisor:</strong> {item.supervisor}</div>
                  <div><strong>Data-base:</strong> {item.data}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </PortalShell>
  );
}

const heroGrid = { display: "grid", gridTemplateColumns: "1.5fr .9fr", gap: 18 };
const heroKpis = { display: "grid", gap: 14 };
const miniHighlight = {
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  borderRadius: 22,
  padding: 18,
  border: "1px solid #dbeafe",
  boxShadow: "0 16px 30px rgba(15,23,42,.06)",
  display: "grid",
  gap: 6
};
const heroList = { display: "grid", gap: 12 };
const heroListItem = { color: "#334155", lineHeight: 1.7 };
const gridFour = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 18 };
const twoCol = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 };
const listGrid = { display: "grid", gap: 12 };
const listItem = { background: "#f8fafc", padding: 14, borderRadius: 16, border: "1px solid #e2e8f0" };
const itemTitle = { fontWeight: 800, color: "#0f172a" };
const itemMeta = { marginTop: 6, color: "#475569", fontSize: 14 };
const turmaGrid = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 };
const turmaCard = { background: "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)", border: "1px solid #e2e8f0", borderRadius: 22, padding: 18, boxShadow: "0 16px 30px rgba(15,23,42,.06)", display: "grid", gap: 14 };
const turmaTop = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" };
const turmaTitle = { fontSize: 22, fontWeight: 900, color: "#0f172a", lineHeight: 1.1 };
const turmaMeta = { color: "#475569", lineHeight: 1.5 };
const metricsGrid = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 };
const metricBox = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: 10, display: "grid", gap: 4, textAlign: "center" };
const infoStack = { display: "grid", gap: 8, color: "#475569", lineHeight: 1.5 };
const riskBadge = (status) => ({ display: "inline-block", padding: "6px 10px", borderRadius: 999, fontWeight: 800, fontSize: 12, background: status === "Crítico" ? "#ffe4e6" : status === "Atenção" ? "#ffedd5" : "#dcfce7", color: status === "Crítico" ? "#be123c" : status === "Atenção" ? "#9a3412" : "#166534" });
const presencePill = { display: "inline-block", padding: "6px 10px", borderRadius: 999, background: "#dbeafe", color: "#1d4ed8", fontWeight: 800, fontSize: 12 };
const errorBox = { background: "#fee2e2", padding: 16, borderRadius: 12, color: "#7f1d1d", marginBottom: 20 };
