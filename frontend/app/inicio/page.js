"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";

const initialData = {
  totalClientes: 0,
  totalUsuarios: 0,
  totalTreinamentos: 0,
  totalPresencas: 0,
  totalAvaliacoes: 0,
  totalMateriaisAvaliativos: 0,
  npsMedio: 0,
  qualidadeMedia: 0,
  assiduidadeMedia: 0,
  treinamentosRecentes: [],
  treinamentosPorCliente: [],
  treinamentosPorInstrutor: [],
  avaliacoesPorCliente: []
};

export default function InicioPage() {
  const [dados, setDados] = useState(initialData);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const token = localStorage.getItem("token");
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;

        if (!token) {
          window.location.href = "/login";
          return;
        }

        const res = await fetch(`${apiUrl}/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
          throw new Error("Falha ao consultar dashboard");
        }

        const json = await res.json();

        setDados({
          ...initialData,
          ...json,
          treinamentosRecentes: Array.isArray(json.treinamentosRecentes) ? json.treinamentosRecentes : [],
          treinamentosPorCliente: Array.isArray(json.treinamentosPorCliente) ? json.treinamentosPorCliente : [],
          treinamentosPorInstrutor: Array.isArray(json.treinamentosPorInstrutor) ? json.treinamentosPorInstrutor : [],
          avaliacoesPorCliente: Array.isArray(json.avaliacoesPorCliente) ? json.avaliacoesPorCliente : []
        });
      } catch {
        setErro("Erro ao carregar dashboard executivo");
      }
    }

    carregar();
  }, []);

  return (
    <PortalShell
      title="Dashboard Executivo"
      subtitle="Visão executiva do Treinamento e Desenvolvimento"
    >
      {erro ? <div style={alertStyle}>{erro}</div> : null}

      <div style={cardsGrid}>
        <Card title="Clientes" value={dados.totalClientes} />
        <Card title="Usuários" value={dados.totalUsuarios} />
        <Card title="Treinamentos" value={dados.totalTreinamentos} />
        <Card title="Presenças" value={dados.totalPresencas} />
        <Card title="Avaliações" value={dados.totalAvaliacoes} />
        <Card title="Materiais Avaliativos" value={dados.totalMateriaisAvaliativos} />
        <Card title="NPS Médio" value={dados.npsMedio} />
        <Card title="Qualidade Média" value={dados.qualidadeMedia} />
        <Card title="Assiduidade Média" value={`${dados.assiduidadeMedia}%`} />
      </div>

      <div style={rowStyle}>
        <Panel title="Treinamentos por Cliente">
          {dados.treinamentosPorCliente.length === 0 ? (
            <p style={emptyStyle}>Sem dados ainda.</p>
          ) : (
            dados.treinamentosPorCliente.map((item, index) => (
              <BarItem
                key={`${item.cliente}-${index}`}
                label={item.cliente || "Cliente"}
                value={Number(item.total || 0)}
                max={maxValue(dados.treinamentosPorCliente, "total")}
              />
            ))
          )}
        </Panel>

        <Panel title="Treinamentos por Instrutor">
          {dados.treinamentosPorInstrutor.length === 0 ? (
            <p style={emptyStyle}>Sem dados ainda.</p>
          ) : (
            dados.treinamentosPorInstrutor.map((item, index) => (
              <BarItem
                key={`${item.instrutor}-${index}`}
                label={item.instrutor || "Instrutor"}
                value={Number(item.total || 0)}
                max={maxValue(dados.treinamentosPorInstrutor, "total")}
              />
            ))
          )}
        </Panel>
      </div>

      <div style={rowStyle}>
        <Panel title="NPS por Cliente">
          {dados.avaliacoesPorCliente.length === 0 ? (
            <p style={emptyStyle}>Sem dados ainda.</p>
          ) : (
            dados.avaliacoesPorCliente.map((item, index) => (
              <BarItem
                key={`${item.cliente}-nps-${index}`}
                label={item.cliente || "Cliente"}
                value={Number(item.nps_medio || 0)}
                max={10}
              />
            ))
          )}
        </Panel>

        <Panel title="Alertas Executivos">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>NPS meta sugerida: 8,5</li>
            <li>Assiduidade meta sugerida: 90%</li>
            <li>Qualidade meta sugerida: 4,5</li>
            <li>Monitore clientes com baixa frequência de treinamento.</li>
          </ul>
        </Panel>
      </div>

      <Panel title="Treinamentos Recentes">
        {dados.treinamentosRecentes.length === 0 ? (
          <p style={emptyStyle}>Nenhum treinamento cadastrado.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thtd}>Tema</th>
                  <th style={thtd}>Cliente</th>
                  <th style={thtd}>Instrutor</th>
                  <th style={thtd}>Data</th>
                  <th style={thtd}>Status</th>
                </tr>
              </thead>
              <tbody>
                {dados.treinamentosRecentes.map((item, index) => (
                  <tr key={item.id || index}>
                    <td style={thtd}>{item.tema || "-"}</td>
                    <td style={thtd}>{item.cliente || "-"}</td>
                    <td style={thtd}>{item.instrutor || "-"}</td>
                    <td style={thtd}>{formatDate(item.data)}</td>
                    <td style={thtd}>{item.status || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </PortalShell>
  );
}

function Card({ title, value }) {
  return (
    <div style={cardStyle}>
      <div style={{ color: "#64748b", fontSize: 14 }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: "bold" }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={panelStyle}>
      <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 20 }}>{title}</h2>
      {children}
    </div>
  );
}

function BarItem({ label, value, max }) {
  const width = max > 0 ? Math.max(8, Math.round((value / max) * 100)) : 8;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{label}</span>
        <strong>{value}</strong>
      </div>
      <div style={{ background: "#e5e7eb", borderRadius: 999, height: 10, overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", background: "#1d4ed8" }} />
      </div>
    </div>
  );
}

function maxValue(items, key) {
  const values = items.map((item) => Number(item[key] || 0));
  return Math.max(...values, 1);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
}

const cardsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
  marginBottom: 20
};

const rowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: 16,
  marginBottom: 16
};

const cardStyle = {
  background: "#fff",
  padding: 20,
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
};

const panelStyle = {
  background: "#fff",
  padding: 24,
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse"
};

const thtd = {
  borderBottom: "1px solid #e5e7eb",
  padding: 12,
  textAlign: "left"
};

const emptyStyle = {
  margin: 0,
  color: "#64748b"
};

const alertStyle = {
  background: "#fef2f2",
  color: "#b91c1c",
  padding: 14,
  borderRadius: 12,
  marginBottom: 16
};
