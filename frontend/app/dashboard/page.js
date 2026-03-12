"use client";

import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const token = localStorage.getItem("token");
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;

        if (!apiUrl) {
          setErro("NEXT_PUBLIC_API_URL não configurada");
          return;
        }

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
        setErro("Erro de frontend ao carregar dashboard");
      }
    }

    carregar();
  }, []);

  return (
    <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Dashboard</h1>

      {erro ? (
        <p style={{ color: "#b91c1c" }}>{erro}</p>
      ) : null}

      {!dados ? (
        <p>Carregando...</p>
      ) : (
        <div
          style={{
            background: "#fff",
            padding: 24,
            borderRadius: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            marginTop: 20
          }}
        >
          <h2>Resposta da API</h2>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {JSON.stringify(dados, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
