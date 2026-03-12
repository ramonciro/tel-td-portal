"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";

export default function DashboardPage() {
  const [dados, setDados] = useState(null);
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
          const texto = await res.text();
          setErro(`Erro ao carregar dashboard: ${texto}`);
          return;
        }

        const json = await res.json();
        setDados(json);
      } catch (e) {
        setErro("Erro ao carregar dashboard");
      }
    }

    carregar();
  }, []);

  return (
    <PortalShell
      title="Dashboard"
      subtitle="Visão geral dos indicadores do portal."
    >
      {erro ? (
        <div style={boxStyle}>
          <p style={{ color: "#b91c1c", margin: 0 }}>{erro}</p>
        </div>
      ) : null}

      {!dados ? (
        <div style={boxStyle}>
          <p style={{ margin: 0 }}>Carregando indicadores...</p>
        </div>
      ) : (
        <>
          <div style={gridStyle}>
            <Card titulo="Clientes" valor={dados.totalClientes ?? 0} />
            <Card titulo="Usuários" valor={dados.totalUsuarios ?? 0} />
            <Card titulo="Treinamentos" valor={dados.totalTreinamentos ?? 0} />
            <Card titulo="Presenças" valor={dados.totalPresencas ?? 0} />
            <Card titulo="Avaliações" valor={dados.totalAvaliacoes ?? 0} />
            <Card titulo="NPS Médio" valor={dados.npsMedio ?? 0} />
          </div>

          <div style={boxStyle}>
            <h2 style={{ marginTop: 0 }}>Resposta da API</h2>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {JSON.stringify(dados, null, 2)}
            </pre>
          </div>
        </>
      )}
    </PortalShell>
  );
}

function Card({ titulo, valor }) {
  return (
    <div
      style={{
        background: "#fff",
        padding: 20,
        borderRadius: 16,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
      }}
    >
      <div style={{ color: "#64748b", fontSize: 14 }}>{titulo}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: "bold" }}>{valor}</div>
    </div>
  );
}

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
  marginBottom: 24
};

const boxStyle = {
  background: "#fff",
  padding: 24,
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
};
