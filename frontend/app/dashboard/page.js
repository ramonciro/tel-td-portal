"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function getCorHeat(valor) {
  if (valor >= 85) return "#16a34a";
  if (valor >= 70) return "#f59e0b";
  return "#dc2626";
}

export default function DashboardPage() {
  const [dados, setDados] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);

        const params = new URLSearchParams();

        if (clienteSelecionado) params.append("cliente", clienteSelecionado);
        if (dataInicio) params.append("inicio", dataInicio);
        if (dataFim) params.append("fim", dataFim);

        const [dashboard, clientesData] = await Promise.all([
          apiFetch(`/dashboard/treinamentos?${params.toString()}`),
          apiFetch("/clientes").catch(() => []),
        ]);

        setDados(dashboard);
        setClientes(clientesData || []);
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, [clienteSelecionado, dataInicio, dataFim]);

  const kpis = dados?.kpis || {};
  const heatmap = dados?.presenca_por_cliente || [];
  const rankingNps = dados?.ranking_nps || [];

  return (
    <PortalShell title="Dashboard Executivo" subtitle="Visão estratégica do T&D">

      {/* FILTROS */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        
        <select
          value={clienteSelecionado}
          onChange={(e) => setClienteSelecionado(e.target.value)}
          style={input}
        >
          <option value="">Todos os clientes</option>
          {clientes.map(c => (
            <option key={c.id} value={c.nome}>{c.nome}</option>
          ))}
        </select>

        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          style={input}
        />

        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          style={input}
        />

      </div>

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={grid}>
            <StatCard title="Treinamentos" value={fmt(kpis.treinamentos)} />
            <StatCard title="Treinados" value={fmt(kpis.treinados)} />
            <StatCard title="Tx Presença" value={`${kpis.taxa_presenca || 0}%`} />
            <StatCard title="NPS" value={kpis.nps || 0} />
            <StatCard title="Qualidade" value={kpis.media_qualidade || 0} />
          </div>

          {/* HEATMAP CLIENTES */}
          <SectionCard title="Heatmap por cliente">
            <div style={grid}>
              {heatmap.map((c, i) => (
                <div
                  key={i}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: getCorHeat(c.taxa_presenca),
                    color: "#fff",
                    fontWeight: "bold",
                  }}
                >
                  {c.cliente}
                  <div>{c.taxa_presenca}%</div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* RANKING NPS */}
          <SectionCard title="Ranking por NPS">
            {rankingNps.map((r, i) => (
              <div key={i} style={card}>
                <strong>{r.cliente}</strong>
                <span>NPS: {r.nps}</span>
              </div>
            ))}
          </SectionCard>
        </>
      )}
    </PortalShell>
  );
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const input = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccc",
};

const card = {
  display: "flex",
  justifyContent: "space-between",
  padding: 10,
  borderBottom: "1px solid #eee",
};
