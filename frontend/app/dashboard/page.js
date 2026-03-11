"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const token = localStorage.getItem("token");
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;

        const res = await fetch(`${apiUrl}/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) throw new Error("Não foi possível carregar o dashboard");
        const data = await res.json();
        setDashboard(data);
      } catch (e) {
        setErro("Erro ao carregar o dashboard");
      }
    }
    carregar();
  }, []);

  return (
    <PortalShell
      title="Dashboard"
      subtitle="Indicadores estratégicos de treinamento e desenvolvimento."
    >
      {erro ? <p style={{ color: "#b91c1c" }}>{erro}</p> : null}

      {!dashboard ? (
        <div style={{ background: "#fff", padding: 24, borderRadius: 16 }}>Carregando indicadores...</div>
      ) : (
        <>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 24
          }}>
            <Card title="Total de Clientes" value={dashboard.totalClientes} />
            <Card title="Total de Usuários" value={dashboard.totalUsuarios} />
            <Card title="Total de Treinamentos" value={dashboard.totalTreinamentos} />
            <Card title="NPS Médio" value={dashboard.npsMedio} />
            <Card title="Qualidade Média" value={dashboard.qualidadeMedia} />
            <Card title="Assiduidade Média" value={`${dashboard.assiduidadeMedia}%`} />
          </div>

          <div style={{ background: "#fff", padding: 24, borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <h2 style={{ marginTop: 0 }}>Treinamentos Recentes</h2>
            {dashboard.treinamentosHoje.length === 0 ? (
              <p>Nenhum treinamento cadastrado ainda.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={cell}>Tema</th>
                    <th style={cell}>Cliente</th>
                    <th style={cell}>Instrutor</th>
                    <th style={cell}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.treinamentosHoje.map((item) => (
                    <tr key={item.id}>
                      <td style={cell}>{item.tema}</td>
                      <td style={cell}>{item.cliente}</td>
                      <td style={cell}>{item.instrutor}</td>
                      <td style={cell}>{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </PortalShell>
  );
}

function Card({ title, value }) {
  return (
    <div style={{ background: "#fff", padding: 20, borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
      <div style={{ color: "#64748b", fontSize: 14 }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: "bold" }}>{value}</div>
    </div>
  );
}

const cell = {
  borderBottom: "1px solid #e5e7eb",
  padding: 12,
  textAlign: "left"
};
