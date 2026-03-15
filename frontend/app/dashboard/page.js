"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function parseHoras(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value).trim().toLowerCase().replace(",", ".");
  const match = text.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

function fmt(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function avg(arr, field) {
  if (!arr.length) return 0;
  return (
    arr.reduce((acc, item) => acc + Number(item?.[field] || 0), 0) / arr.length
  );
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState({});
  const [treinamentos, setTreinamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [biblioteca, setBiblioteca] = useState([]);
  const [trilhas, setTrilhas] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const [dash, treinamentosData, presencasData, avaliacoesData, bibliotecaData, trilhasData] =
          await Promise.all([
            apiFetch("/dashboard").catch(() => ({})),
            apiFetch("/treinamentos").catch(() => []),
            apiFetch("/presencas").catch(() => []),
            apiFetch("/avaliacoes").catch(() => []),
            apiFetch("/biblioteca").catch(() => []),
            apiFetch("/trilhas").catch(() => []),
          ]);

        setDashboard(dash || {});
        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
        setPresencas(Array.isArray(presencasData) ? presencasData : []);
        setAvaliacoes(Array.isArray(avaliacoesData) ? avaliacoesData : []);
        setBiblioteca(Array.isArray(bibliotecaData) ? bibliotecaData : []);
        setTrilhas(Array.isArray(trilhasData) ? trilhasData : []);
        setErro("");
      } catch (error) {
        setErro(error.message || "Erro ao carregar dashboard.");
      }
    }

    carregar();
  }, []);

  const leitura = useMemo(() => {
    const totalParticipacoes = presencas.length;
    const presentes = presencas.filter((p) => String(p.status || "").toLowerCase() === "presente").length;
    const ausentes = presencas.filter((p) => String(p.status || "").toLowerCase() === "ausente").length;
    const justificados = presencas.filter((p) => String(p.status || "").toLowerCase() === "justificado").length;

    const taxaPresenca = totalParticipacoes ? Math.round((presentes / totalParticipacoes) * 100) : 0;
    const taxaAbsenteismo = totalParticipacoes ? Math.round((ausentes / totalParticipacoes) * 100) : 0;

    const horasMinistradas = treinamentos.reduce((acc, item) => acc + parseHoras(item.carga_horaria), 0);
    const horasTreinadas = treinamentos.reduce((acc, item) => {
      const presentesTreino = presencas.filter(
        (p) => String(p.treinamento_id) === String(item.id) && String(p.status || "").toLowerCase() === "presente"
      ).length;
      return acc + parseHoras(item.carga_horaria) * presentesTreino;
    }, 0);

    const mediaQualidade = avg(avaliacoes, "nota_qualidade").toFixed(1);
    const mediaNps = avg(avaliacoes, "nota_nps").toFixed(1);

    const porClienteMap = {};
    treinamentos.forEach((item) => {
      const cliente = item.cliente || "Sem cliente";
      if (!porClienteMap[cliente]) {
        porClienteMap[cliente] = {
          cliente,
          treinamentos: 0,
          participantes: 0,
          horas: 0,
        };
      }
      porClienteMap[cliente].treinamentos += 1;
      porClienteMap[cliente].participantes += Number(item.participantes || 0);
      porClienteMap[cliente].horas += parseHoras(item.carga_horaria);
    });

    const impactoPorCliente = Object.values(porClienteMap)
      .sort((a, b) => b.treinamentos - a.treinamentos || b.participantes - a.participantes)
      .slice(0, 6);

    const porInstrutorMap = {};
    treinamentos.forEach((item) => {
      const instrutor = item.instrutor || "Sem instrutor";
      if (!porInstrutorMap[instrutor]) {
        porInstrutorMap[instrutor] = {
          instrutor,
          treinamentos: 0,
          participantes: 0,
          horas: 0,
        };
      }
      porInstrutorMap[instrutor].treinamentos += 1;
      porInstrutorMap[instrutor].participantes += Number(item.participantes || 0);
      porInstrutorMap[instrutor].horas += parseHoras(item.carga_horaria);
    });

    const rankingInstrutores = Object.values(porInstrutorMap)
      .sort((a, b) => b.treinamentos - a.treinamentos || b.horas - a.horas)
      .slice(0, 6);

    const alertas = [];
    const planejados = treinamentos.filter((t) => String(t.status || "").toLowerCase() === "planejado").length;
    if (planejados > 0) alertas.push(`${planejados} treinamento(s) ainda estão planejados.`);

    const semInstrutor = treinamentos.filter((t) => !t.instrutor).length;
    if (semInstrutor > 0) alertas.push(`${semInstrutor} treinamento(s) sem instrutor definido.`);

    const materiaisEmAtualizacao = biblioteca.filter((b) => {
      const status = String(b.status || "").toLowerCase();
      return status === "em atualização" || status === "em atualizacao";
    }).length;
    if (materiaisEmAtualizacao > 0) {
      alertas.push(`${materiaisEmAtualizacao} material(is) da biblioteca estão em atualização.`);
    }

    const trilhasEmConstrucao = trilhas.filter((t) => {
      const status = String(t.status || "").toLowerCase();
      return status === "em construção" || status === "em construcao";
    }).length;
    if (trilhasEmConstrucao > 0) {
      alertas.push(`${trilhasEmConstrucao} trilha(s) estão em construção.`);
    }

    if (!alertas.length) {
      alertas.push("Ambiente organizado, sem alertas críticos no momento.");
    }

    return {
      totalParticipacoes,
      presentes,
      ausentes,
      justificados,
      taxaPresenca,
      taxaAbsenteismo,
      horasMinistradas,
      horasTreinadas,
      mediaQualidade,
      mediaNps,
      impactoPorCliente,
      rankingInstrutores,
      alertas,
      recentesTreinamentos: [...treinamentos].slice(-5).reverse(),
      recentesAvaliacoes: [...avaliacoes].slice(-5).reverse(),
    };
  }, [treinamentos, presencas, avaliacoes, biblioteca, trilhas]);

  return (
    <PortalShell
      title="Painel Executivo de T&D"
      subtitle="Visão estratégica do setor para acompanhamento interno, gestão da operação e apresentações com cliente."
    >
      {erro ? <div style={errorBox}>{erro}</div> : null}

      <div style={heroWrap}>
        <div style={heroMain}>
          <div style={heroBadge}>Painel executivo</div>
          <h2 style={heroTitle}>Gestão orientada por dados do Treinamento & Desenvolvimento</h2>
          <p style={heroText}>
            Acompanhe capacidade treinada, assiduidade, evolução por cliente, produtividade dos
            instrutores e sinais de atenção do setor em uma única leitura.
          </p>
        </div>

        <div style={heroMiniGrid}>
          <div style={heroMiniCard}>
            <strong>{fmt(leitura.presentes)}</strong>
            <span>presenças confirmadas</span>
          </div>
          <div style={heroMiniCard}>
            <strong>{fmt(leitura.ausentes)}</strong>
            <span>ausências mapeadas</span>
          </div>
          <div style={heroMiniCard}>
            <strong>{leitura.taxaPresenca}%</strong>
            <span>presença média</span>
          </div>
        </div>
      </div>

      <div style={gridFour}>
        <StatCard title="Clientes" value={dashboard?.clientes ?? 0} subtitle="Operações acompanhadas" accent="#2563eb" />
        <StatCard title="Treinamentos" value={dashboard?.treinamentos ?? treinamentos.length} subtitle="Ações cadastradas" accent="#059669" />
        <StatCard title="Participações" value={fmt(leitura.totalParticipacoes)} subtitle="Registros de presença" accent="#7c3aed" />
        <StatCard title="Avaliações" value={dashboard?.avaliacoes ?? avaliacoes.length} subtitle="Base de reação e qualidade" accent="#ea580c" />
      </div>

      <div style={{ ...gridFour, marginTop: 12 }}>
        <StatCard title="Horas ministradas" value={`${fmt(leitura.horasMinistradas)}h`} subtitle="Carga aplicada" accent="#0f766e" helper="Volume" />
        <StatCard title="Horas treinadas" value={`${fmt(leitura.horasTreinadas)}h`} subtitle="Carga × presença" accent="#1d4ed8" helper="Indicador estratégico" />
        <StatCard title="Taxa de presença" value={`${leitura.taxaPresenca}%`} subtitle="Assiduidade geral" accent="#16a34a" helper="Saúde da operação" />
        <StatCard title="Absenteísmo" value={`${leitura.taxaAbsenteismo}%`} subtitle="Participantes ausentes" accent="#dc2626" helper="Ponto de atenção" />
      </div>

      <div style={{ ...gridFour, marginTop: 12 }}>
        <StatCard title="Justificativas" value={fmt(leitura.justificados)} subtitle="Ausências justificadas" accent="#ca8a04" />
        <StatCard title="Qualidade média" value={leitura.mediaQualidade} subtitle="Aproveitamento médio" accent="#0891b2" />
        <StatCard title="NPS médio" value={leitura.mediaNps} subtitle="Percepção geral" accent="#9333ea" />
        <StatCard title="Biblioteca / Trilhas" value={`${fmt(biblioteca.length)} / ${fmt(trilhas.length)}`} subtitle="Base de apoio do portal" accent="#475569" />
      </div>

      <div style={twoCol}>
        <SectionCard title="Impacto por cliente" subtitle="Clientes com maior volume de ações, participantes e horas.">
          <div style={listGrid}>
            {leitura.impactoPorCliente.length ? (
              leitura.impactoPorCliente.map((item) => (
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

        <SectionCard title="Ranking de instrutores" subtitle="Produtividade por volume, público treinado e carga horária.">
          <div style={listGrid}>
            {leitura.rankingInstrutores.length ? (
              leitura.rankingInstrutores.map((item) => (
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

      <div style={{ ...twoCol, marginTop: 12 }}>
        <SectionCard title="Alertas gerenciais" subtitle="Leitura rápida para acompanhamento da operação.">
          <div style={alertGrid}>
            {leitura.alertas.map((item, index) => (
              <div key={index} style={alertItem}>{item}</div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Argumentação executiva" subtitle="Leitura pronta para superintendência e cliente.">
          <div style={noteGrid}>
            <div style={noteItem}><strong>Volume:</strong> {fmt(treinamentos.length)} treinamentos e {fmt(leitura.horasMinistradas)}h ministradas.</div>
            <div style={noteItem}><strong>Entrega:</strong> {fmt(leitura.totalParticipacoes)} participações com {leitura.taxaPresenca}% de presença média.</div>
            <div style={noteItem}><strong>Qualidade:</strong> média {leitura.mediaQualidade} e NPS médio {leitura.mediaNps}.</div>
            <div style={noteItem}><strong>Estrutura:</strong> {fmt(biblioteca.length)} materiais e {fmt(trilhas.length)} trilhas apoiando a operação.</div>
          </div>
        </SectionCard>
      </div>

      <div style={{ ...twoCol, marginTop: 12 }}>
        <SectionCard title="Treinamentos recentes" subtitle="Últimas ações registradas no sistema.">
          <div style={listGrid}>
            {leitura.recentesTreinamentos.length ? (
              leitura.recentesTreinamentos.map((item, index) => (
                <div key={item.id || index} style={listItem}>
                  <div style={itemTitle}>{item.tema || item.titulo || "Treinamento"}</div>
                  <div style={itemMeta}>{(item.cliente || "Sem cliente") + " • " + (item.instrutor || "Sem instrutor")}</div>
                </div>
              ))
            ) : (
              <div style={emptyText}>Nenhum treinamento recente.</div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Avaliações recentes" subtitle="Últimos registros de reação, prova, teste ou simulado.">
          <div style={listGrid}>
            {leitura.recentesAvaliacoes.length ? (
              leitura.recentesAvaliacoes.map((item, index) => (
                <div key={item.id || index} style={listItem}>
                  <div style={itemTitle}>{item.titulo || item.tipo_registro || "Avaliação"}</div>
                  <div style={itemMeta}>Qualidade {item.nota_qualidade ?? "-"} • NPS {item.nota_nps ?? "-"}</div>
                </div>
              ))
            ) : (
              <div style={emptyText}>Nenhuma avaliação recente.</div>
            )}
          </div>
        </SectionCard>
      </div>
    </PortalShell>
  );
}

const heroWrap = {
  display: "grid",
  gridTemplateColumns: "1.55fr .95fr",
  gap: 14,
  marginBottom: 14,
};

const heroMain = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 22,
  padding: 22,
  color: "#fff",
  boxShadow: "0 16px 30px rgba(29,78,216,.18)",
};

const heroBadge = {
  display: "inline-block",
  background: "rgba(255,255,255,.14)",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const heroTitle = { margin: "14px 0 8px", fontSize: 28, lineHeight: 1.05 };
const heroText = { margin: 0, color: "rgba(255,255,255,.84)", lineHeight: 1.6 };

const heroMiniGrid = { display: "grid", gap: 10 };
const heroMiniCard = {
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid #dbeafe",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 10px 22px rgba(15,23,42,.05)",
  display: "grid",
  gap: 4,
};

const gridFour = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginTop: 14,
};

const listGrid = { display: "grid", gap: 10 };
const listItem = {
  background: "#f8fafc",
  padding: 12,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
};
const itemTitle = { fontWeight: 800, color: "#0f172a" };
const itemMeta = { marginTop: 5, color: "#475569", fontSize: 13, lineHeight: 1.45 };
const noteGrid = { display: "grid", gap: 10 };
const noteItem = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, color: "#334155", lineHeight: 1.5 };
const alertGrid = { display: "grid", gap: 10 };
const alertItem = { background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 12, padding: 12, fontWeight: 600 };
const emptyText = { color: "#64748b" };
const errorBox = { marginBottom: 12, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 14, padding: 12, fontWeight: 700 };
