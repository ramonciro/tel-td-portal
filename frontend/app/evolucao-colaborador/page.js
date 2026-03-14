"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import { StatsGrid } from "../../components/StatsGrid";
import { apiFetch } from "../../services/api";

export default function EvolucaoColaboradorPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [treinamentos, setTreinamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch("/usuarios"),
      apiFetch("/treinamentos"),
      apiFetch("/presencas"),
      apiFetch("/avaliacoes"),
    ])
      .then(([u, t, p, a]) => {
        setUsuarios(Array.isArray(u) ? u : []);
        setTreinamentos(Array.isArray(t) ? t : []);
        setPresencas(Array.isArray(p) ? p : []);
        setAvaliacoes(Array.isArray(a) ? a : []);
      })
      .catch((e) => setErro(e.message || "Erro ao carregar dados"));
  }, []);

  const cards = useMemo(() => {
    return usuarios.map((u) => {
      const pres = presencas.filter(
        (p) => String(p.treinando_nome || "").toLowerCase() === String(u.nome || "").toLowerCase()
      );
      const ids = [...new Set(pres.map((p) => p.treinamento_id).filter(Boolean))];
      const treinos = treinamentos.filter((t) => ids.includes(t.id));
      const avs = avaliacoes.filter((a) => ids.includes(a.treinamento_id));
      const presentes = pres.filter((p) => p.status === "presente").length;
      const total = pres.length;
      const assiduidade = total ? Math.round((presentes / total) * 100) : 0;
      const nota = avs.length
        ? (avs.reduce((acc, x) => acc + Number(x.nota_prova || 0), 0) / avs.length).toFixed(1)
        : "0.0";

      return {
        nome: u.nome,
        perfil: u.perfil,
        cliente: u.cliente,
        treinamentos: treinos.length,
        assiduidade,
        nota,
      };
    });
  }, [usuarios, treinamentos, presencas, avaliacoes]);

  const stats = [
    { label: "Colaboradores", value: usuarios.length, icon: "👥", helper: "Base total acompanhada" },
    { label: "Treinamentos relacionados", value: treinamentos.length, icon: "🎓", helper: "Base geral utilizada na leitura" },
    { label: "Presenças analisadas", value: presencas.length, icon: "📋", helper: "Indicador de participação" },
    { label: "Avaliações", value: avaliacoes.length, icon: "⭐", helper: "Base de nota e qualidade" },
  ];

  return (
    <PortalShell
      title="Evolução do Colaborador"
      subtitle="Painel de leitura individual com foco em assiduidade, exposição ao treinamento e aproveitamento."
    >
      {erro ? <div style={errorBox}>{erro}</div> : null}

      <StatsGrid items={stats} />

      <SectionCard
        title="Painel individual"
        subtitle="Leitura consolidada por colaborador a partir da base real do portal."
      >
        <div style={grid}>
          {cards.map((c) => (
            <div key={c.nome} style={card}>
              <div style={name}>{c.nome}</div>
              <div style={sub}>
                {c.perfil} • {c.cliente || "-"}
              </div>

              <div style={metricGrid}>
                <Metric label="Treinamentos" value={c.treinamentos} />
                <Metric label="Assiduidade" value={`${c.assiduidade}%`} />
                <Metric label="Nota média" value={c.nota} />
              </div>
            </div>
          ))}

          {!cards.length ? <div style={empty}>Nenhum colaborador disponível para leitura neste momento.</div> : null}
        </div>
      </SectionCard>
    </PortalShell>
  );
}

function Metric({ label, value }) {
  return (
    <div style={metricCard}>
      <div style={metricLabel}>{label}</div>
      <div style={metricValue}>{value}</div>
    </div>
  );
}

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 };
const card = { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 18, padding: 18 };
const name = { fontSize: 18, fontWeight: 700, color: "#0f172a" };
const sub = { color: "#64748b", marginTop: 6, marginBottom: 14 };
const metricGrid = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 };
const metricCard = { background: "#fff", borderRadius: 14, padding: 12, border: "1px solid #e2e8f0" };
const metricLabel = { fontSize: 12, color: "#64748b", marginBottom: 8 };
const metricValue = { fontWeight: 700, color: "#0f172a", fontSize: 18 };
const empty = { color: "#64748b", textAlign: "center", padding: 30 };
const errorBox = { background: "#fef2f2", color: "#b91c1c", padding: 14, borderRadius: 14, marginBottom: 16, border: "1px solid #fecaca" };
