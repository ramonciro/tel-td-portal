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

        if (!res.ok) throw new Error("Erro ao carregar dashboard");

        const json = await res.json();
        setDados(json);
      } catch (e) {
        setErro("Erro ao carregar indicadores.");
      }
    }

    carregar();
  }, []);

  return (
    <PortalShell
      title="Dashboard"
      subtitle="Indicadores estratégicos de Treinamento e Desenvolvimento"
    >
      {erro && (
        <div style={box}>
          <p style={{ color: "#b91c1c" }}>{erro}</p>
        </div>
      )}

      {!dados ? (
        <div style={box}>Carregando indicadores...</div>
      ) : (
        <>
          <div style={grid}>
            <Card titulo="Clientes" valor={dados.totalClientes ?? 0} />
            <Card titulo="Usuários" valor={dados.totalUsuarios ?? 0} />
            <Card titulo="Treinamentos" valor={dados.totalTreinamentos ?? 0} />
            <Card titulo="Presenças" valor={dados.totalPresencas ?? 0} />
            <Card titulo="Avaliações" valor={dados.totalAvaliacoes ?? 0} />
            <Card titulo="NPS Médio" valor={dados.npsMedio ?? 0} />
            <Card titulo="Qualidade Média" valor={dados.qualidadeMedia ?? 0} />
            <Card titulo="Assiduidade" valor={`${dados.assiduidadeMedia ?? 0}%`} />
          </div>

          <div style={box}>
            <h2>Treinamentos Recentes</h2>

            {!dados.treinamentosRecentes ||
            dados.treinamentosRecentes.length === 0 ? (
              <p>Nenhum treinamento registrado.</p>
            ) : (
              <table style={table}>
                <thead>
                  <tr>
                    <th style={cell}>Tema</th>
                    <th style={cell}>Cliente</th>
                    <th style={cell}>Instrutor</th>
                    <th style={cell}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.treinamentosRecentes.map((t, i) => (
                    <tr key={i}>
                      <td style={cell}>{t.tema}</td>
                      <td style={cell}>{t.cliente}</td>
                      <td style={cell}>{t.instrutor}</td>
                      <td style={cell}>{t.status}</td>
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

function Card({ titulo, valor }) {
  return (
    <div style={card}>
      <div style={{ color: "#64748b", fontSize: 14 }}>{titulo}</div>
      <div style={{ fontSize: 28, fontWeight: "bold", marginTop: 8 }}>
        {valor}
      </div>
    </div>
  );
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
  marginBottom: 24
};

const box = {
  background: "#fff",
  padding: 24,
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
};

const card = {
  background: "#fff",
  padding: 20,
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 12
};

const cell = {
  padding: 12,
  borderBottom: "1px solid #e5e7eb",
  textAlign: "left"
};
