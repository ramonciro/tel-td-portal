"use client";

import PortalShell from "../../components/PortalShell";
import { useEffect, useState } from "react";

export default function TreinamentosPage() {
  const [items, setItems] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const token = localStorage.getItem("token");
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;

        const res = await fetch(`${apiUrl}/treinamentos`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) throw new Error();
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
      } catch {
        setErro("Erro ao carregar dados");
      }
    }
    carregar();
  }, []);

  return (
    <PortalShell title="Treinamentos" subtitle="Cadastro e acompanhamento dos treinamentos.">
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
      }}>
        {erro ? <p style={{ color: "#b91c1c" }}>{erro}</p> : null}
        <p>Total carregado: {items.length}</p>
      </div>
    </PortalShell>
  );
}
