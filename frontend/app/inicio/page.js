"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import { StatsGrid } from "../../components/StatsGrid";
import { apiFetch } from "../../services/api";

export default function InicioPage() {
  const [data, setData] = useState({});
  const [erro, setErro] = useState("");

  useEffect(() => {
    apiFetch("/dashboard").then((res) => setData(res || {})).catch((e) => setErro(e.message || "Erro ao carregar dashboard executivo"));
  }, []);

  const stats = useMemo(() => ([
    { label: "Clientes", value: data?.clientes || 0, icon: "🏢", helper: "Operações cadastradas" },
    { label: "Usuários", value: data?.usuarios || 0, icon: "👥", helper: "Perfis ativos no portal" },
    { label: "Treinamentos", value: data?.treinamentos || 0, icon: "🎓", helper: "Eventos e turmas lançadas" },
    { label: "Presenças", value: data?.presencas || 0, icon: "📋", helper: "Controle operacional de presença" },
    { label: "Avaliações", value: data?.avaliacoes || 0, icon: "⭐", helper: "Base de feedback e desempenho" },
    { label: "Biblioteca", value: data?.biblioteca || 0, icon: "📚", helper: "Materiais disponíveis" },
    { label: "Trilhas", value: data?.trilhas || 0, icon: "🧭", helper: "Jornadas de desenvolvimento" },
  ]), [data]);

  return (
    <PortalShell title="Dashboard Executivo" subtitle="Visão estratégica do Treinamento e Desenvolvimento com leitura operacional e apoio à tomada de decisão.">
      {erro ? <div style={errorBox}>{erro}</div> : null}
      <StatsGrid items={stats} />
      <div style={contentGrid}>
        <SectionCard title="Resumo executivo do T&D" subtitle="Acompanhe o comportamento geral do portal e mantenha a estrutura de treinamento organizada para expansão por cliente, instrutor e indicador.">
          <div style={bulletGrid}>
            <InfoBlock title="Leitura rápida" text="Use este painel como visão inicial da operação de T&D antes de aprofundar em clientes, trilhas, biblioteca e avaliações." />
            <InfoBlock title="Foco gerencial" text="A versão 2.0 organiza melhor a navegação para facilitar o acompanhamento da rotina, da base de usuários e dos registros de treinamento." />
            <InfoBlock title="Próxima evolução" text="Este layout já está preparado para crescer com indicadores de aprovação, absenteísmo, NPS e produtividade por cliente." />
          </div>
        </SectionCard>
        <SectionCard title="Prioridades recomendadas" subtitle="Ordem sugerida para estruturar o portal com maior consistência.">
          <ol style={orderedList}>
            <li>Cadastrar clientes e usuários.</li>
            <li>Subir treinamentos e listas de presença.</li>
            <li>Registrar avaliações e materiais de apoio.</li>
            <li>Organizar trilhas e mapa de desenvolvimento.</li>
            <li>Conectar indicadores executivos por cliente.</li>
          </ol>
        </SectionCard>
      </div>
    </PortalShell>
  );
}

function InfoBlock({ title, text }) {
  return <div style={infoBlock}><div style={infoTitle}>{title}</div><div style={infoText}>{text}</div></div>;
}

const contentGrid = { display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 };
const bulletGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 };
const infoBlock = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: 16 };
const infoTitle = { fontWeight: 700, color: "#0f172a", marginBottom: 8 };
const infoText = { color: "#64748b", lineHeight: 1.6, fontSize: 14 };
const orderedList = { margin: 0, paddingLeft: 18, color: "#475569", lineHeight: 1.9 };
const errorBox = { background: "#fef2f2", color: "#b91c1c", padding: 14, borderRadius: 14, marginBottom: 16, border: "1px solid #fecaca" };
