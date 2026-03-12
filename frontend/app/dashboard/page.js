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

        if (!res.ok) {
          throw new Error("Não foi possível carregar o dashboard");
        }

        const data = await res.json();

        setDashboard({
          totalClientes: data.totalClientes ?? 0,
          totalUsuarios: data.totalUsuarios ?? 0,
          totalTreinamentos: data.totalTreinamentos ?? 0,
          totalPresencas: data.totalPresencas ?? 0,
          totalAvaliacoes: data.totalAvaliacoes ?? 0,
          totalMateriaisAvaliativos: data.totalMateriaisAvaliativos ?? 0,
          npsMedio: data.npsMedio ?? 0,
          qualidadeMedia: data.qualidadeMedia ?? 0,
          assiduidadeMedia: data.assiduidadeMedia ?? 0,
          clientes: Array.isArray(data.clientes) ? data.clientes : [],
          treinamentosRecentes: Array.isArray(data.treinamentosRecentes)
            ? data.treinamentosRecentes
            : Array.isArray(data.treinamentosHoje)
            ? data.treinamentosHoje
            : [],
          treinamentosPorCliente: Array.isArray(data.treinamentosPorCliente)
            ? data.treinamentosPorCliente
            : [],
          treinamentosPorInstrutor: Array.isArray(data.treinamentosPorInstrutor)
            ? data.treinamentosPorInstrutor
            : []
        });
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
        <div style={boxStyle}>Carregando indicadores...</div>
      ) : (
        <>
          <div style={gridCards}>
            <Card title="Clientes" value={dashboard.totalClientes} />
            <Card title="Usuários" value={dashboard.totalUsuarios} />
            <Card title="Treinamentos" value={dashboard.totalTreinamentos} />
            <Card title="Presenças" value={dashboard.totalPresencas} />
            <Card title="Avaliações" value={dashboard.totalAvaliacoes} />
            <Card title="Materiais Avaliativos" value={dashboard.totalMateriaisAvaliativos} />
            <Card title="NPS Médio" value={dashboard.npsMedio} />
            <Card title="Qualidade Média" value={dashboard.qualidadeMedia} />
            <Card title="Assiduidade Média" value={`${dashboard.assiduidadeMedia}%`} />
          </div>

          <div style={sectionGrid}>
            <div style={boxStyle}>
              <h2 style={h2}>Treinamentos Recentes</h2>
              {dashboard.treinamentosRecentes.length === 0 ? (
                <p>Nenhum treinamento cadastrado ainda.</p>
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={cell}>Tema</th>
                      <th style={cell}>Cliente</th>
                      <th style={cell}>Instrutor</th>
                      <th style={cell}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.treinamentosRecentes.map((item, index) => (
                      <tr key={item.id ?? index}>
                        <td style={cell}>{item.tema ?? "-"}</td>
                        <td style={cell}>{item.cliente ?? "-"}</td>
                        <td style={cell}>{item.instrutor ?? "-"}</td>
                        <td style={cell}>{item.status ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={boxStyle}>
              <h2 style={h2}>Treinamentos por Cliente</h2>
              {dashboard.treinamentosPorCliente.length === 0 ? (
                <p>Sem dados ainda.</p>
              ) : (
                <ul style={{ paddingLeft: 18 }}>
                  {dashboard.treinamentosPorCliente.map((item, index) => (
                    <li key={item.cliente ?? index} style={{ marginBottom: 10 }}>
                      <strong>{item.cliente ?? "Cliente"}</strong>: {item.total ?? 0}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div style={sectionGrid}>
            <div style={boxStyle}>
              <h2 style={h2}>Treinamentos por Instrutor</h2>
              {dashboard.treinamentosPorInstrutor.length === 0 ? (
                <p>Sem dados ainda.</p>
              ) : (
                <ul style={{ paddingLeft: 18 }}>
                  {dashboard.treinamentosPorInstrutor.map((item, index) => (
                    <li key={item.instrutor ?? index} style={{ marginBottom: 10 }}>
                      <strong>{item.instrutor ?? "Instrutor"}</strong>: {item.total ?? 0}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={boxStyle}>
              <h2 style={h2}>Clientes Ativos</h2>
              {dashboard.clientes.length === 0 ? (
                <p>Sem clientes carregados.</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {dashboard.clientes.map((cliente, index) => (
                    <span key={cliente.id ?? index} style={pillStyle}>
                      {cliente.nome ?? "Cliente"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
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

const gridCards = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 16,
  marginBottom: 24
};

const sectionGrid = {
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr",
  gap: 16,
  marginBottom: 16
};

const boxStyle = {
  background: "#fff",
  padding: 24,
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
};

const cardStyle = {
  background: "#fff",
  padding: 20,
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse"
};

const cell = {
  borderBottom: "1px solid #e5e7eb",
  padding: 12,
  textAlign: "left"
};

const h2 = {
  marginTop: 0,
  marginBottom: 16
};

const pillStyle = {
  background: "#eff6ff",
  color: "#1d4ed8",
  padding: "8px 12px",
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 600
};
