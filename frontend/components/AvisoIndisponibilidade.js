"use client";

import { useEffect, useState } from "react";

/**
 * Faixa no topo que aparece quando o servidor ou o banco de dados estão fora
 * do ar (21/10/2026). Quem avisa é services/api.js (evento
 * "portal:disponibilidade"); a faixa some sozinha quando uma chamada volta a
 * funcionar. Enquanto está visível, tenta de novo a cada 20 s com uma consulta
 * leve (/health) para sumir mesmo que o usuário não clique em nada.
 */
const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tel-td-portal-production.up.railway.app/api"
).replace(/\/$/, "");

export default function AvisoIndisponibilidade() {
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    function aoMudar(e) {
      const d = e.detail || {};
      setAviso(d.indisponivel ? d.mensagem || "Portal temporariamente indisponível." : null);
    }
    window.addEventListener("portal:disponibilidade", aoMudar);
    return () => window.removeEventListener("portal:disponibilidade", aoMudar);
  }, []);

  useEffect(() => {
    if (!aviso) return undefined;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`${API_URL}/health/banco`, { cache: "no-store" });
        if (r.ok) setAviso(null);
      } catch {}
    }, 20000);
    return () => clearInterval(id);
  }, [aviso]);

  if (!aviso) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#b45309",
        color: "#fff",
        padding: "10px 16px",
        fontSize: 14,
        fontWeight: 600,
        textAlign: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      {aviso}
    </div>
  );
}
