import PortalShell from "../../components/PortalShell";
<PortalShell title="..." subtitle="...">

"use client";

import { useEffect, useState } from "react";

export default function ClientesPage() {
  const [clientes, setClientes] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregarClientes() {
      try {
        const token = localStorage.getItem("token");
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;

        const res = await fetch(`${apiUrl}/clientes`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!res.ok) {
          throw new Error("Erro ao carregar clientes");
        }

        const data = await res.json();
        setClientes(data);
      } catch (e) {
        setErro("Erro ao carregar clientes");
      }
    }

    carregarClientes();
  }, []);

  return (
    <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Clientes</h1>
      <p>Visão consolidada dos clientes acompanhados pelo T&D.</p>

      {erro ? <p style={{ color: "#b91c1c" }}>{erro}</p> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 20,
          marginTop: 24
        }}
      >
        {clientes.map((cliente) => (
          <div
            key={cliente.id}
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 22 }}>{cliente.nome}</h2>

            <p style={{ margin: "12px 0" }}>
              <strong>Treinamentos:</strong> {cliente.total_treinamentos}
            </p>

            <p style={{ margin: "12px 0" }}>
              <strong>Usuários:</strong> {cliente.total_usuarios}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

</PortalShell>
