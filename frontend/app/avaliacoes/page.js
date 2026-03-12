"use client";

import PortalShell from "../../components/PortalShell";
import { useEffect, useState } from "react";

export default function AvaliacoesPage() {
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const token = localStorage.getItem("token");
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;

        const [r1, r2] = await Promise.all([
          fetch(`${apiUrl}/avaliacoes`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${apiUrl}/materiais-avaliativos`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        const d1 = r1.ok ? await r1.json() : [];
        const d2 = r2.ok ? await r2.json() : [];
        setAvaliacoes(Array.isArray(d1) ? d1 : []);
        setMateriais(Array.isArray(d2) ? d2 : []);
      } catch {
        setErro("Erro ao carregar dados");
      }
    }
    carregar();
  }, []);

  return (
    <PortalShell title="Avaliações" subtitle="Registro de NPS, qualidade e materiais avaliativos.">
      <div style={{ display: "grid", gap: 16 }}>
        <div style={boxStyle}>
          {erro ? <p style={{ color: "#b91c1c" }}>{erro}</p> : null}
          <p>Total de avaliações: {avaliacoes.length}</p>
        </div>
        <div style={boxStyle}>
          <p>Total de materiais avaliativos: {materiais.length}</p>
        </div>
      </div>
    </PortalShell>
  );
}

const boxStyle = {
  background: "#fff",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
};
