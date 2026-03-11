"use client";

import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const token = localStorage.getItem("token");
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;

        const res = await fetch(`${apiUrl}/dashboard`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!res.ok) {
          throw new Error("Não foi possível carregar o dashboard");
        }

        const data = await res.json();
        setDashboard(data);
      } catch (e) {
        setErro("Erro ao carregar o dashboard");
      }
    }

    carregar();
  }, []);

  if (erro) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Dashboard Tel T&D</h1>
        <p>{erro}</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Dashboard Tel T&D</h1>
        <p>Carregando indicadores...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Dashboard Tel T&D</h1>
      <p>Indicadores estratégicos de treinamento e desenvolvimento.</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginTop: 24
        }}
      >
        <div style={cardStyle}>
          <h3>Total de Clientes</h3>
          <p style={valueStyle}>{dashboard.totalClientes}</p>
        </div>

        <div style={cardStyle}>
          <h3>Total de Usuários</h3>
          <p style={valueStyle}>{dashboard.totalUsuarios}</p>
        </div>

        <div style={cardStyle}>
          <h3>Total de Treinamentos</h3>
          <p style={valueStyle}>{dashboard.totalTreinamentos}</p>
        </div>

        <div style={cardStyle}>
          <h3>NPS Médio</h3>
          <p style={valueStyle}>{dashboard.npsMedio}</p>
        </div>

        <div style={cardStyle}>
          <h3>Qualidade Média</h3>
          <p style={valueStyle}>{dashboard.qualidadeMedia}</p>
        </div>

        <div style={cardStyle}>
          <h3>Assiduidade Média</h3>
          <p style={valueStyle}>{dashboard.assiduidadeMedia}%</p>
        </div>
      </div>

      <div style={{ marginTop: 32 }}>
        <h2>Clientes</h2>
        <ul>
          {dashboard.clientes.map((cliente) => (
            <li key={cliente.id}>{cliente.nome}</li>
          ))}
        </ul>
      </div>

      <div style={{ marginTop: 32 }}>
        <h2>Treinamentos Recentes</h2>
        {dashboard.treinamentosHoje.length === 0 ? (
          <p>Nenhum treinamento cadastrado ainda.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
            <thead>
              <tr>
                <th style={thtd}>Tema</th>
                <th style={thtd}>Cliente</th>
                <th style={thtd}>Instrutor</th>
                <th style={thtd}>Status</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.treinamentosHoje.map((item) => (
                <tr key={item.id}>
                  <td style={thtd}>{item.tema}</td>
                  <td style={thtd}>{item.cliente}</td>
                  <td style={thtd}>{item.instrutor}</td>
                  <td style={thtd}>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const cardStyle = {
  background: "#ffffff",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
};

const valueStyle = {
  fontSize: 28,
  fontWeight: "bold",
  marginTop: 8
};

const thtd = {
  borderBottom: "1px solid #ddd",
  padding: 12,
  textAlign: "left"
};
