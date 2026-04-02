"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { apiFetch } from "../../services/api";

export default function ResponderNpsPage() {
  const [mounted, setMounted] = useState(false);
  const [nota, setNota] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");

  // ✅ Garante execução só no client
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");

    try {
      await apiFetch("/nps/responder", {
        method: "POST",
        body: JSON.stringify({
          nota,
          comentario,
        }),
      });

      setEnviado(true);
    } catch (err) {
      setErro(err.message || "Erro ao enviar resposta.");
    }
  }

  if (enviado) {
    return (
      <div style={container}>
        <h2>Obrigado pela sua resposta!</h2>
        <p>Seu feedback foi registrado com sucesso.</p>
      </div>
    );
  }

  return (
    <div style={container}>
      <h1 style={title}>Pesquisa NPS</h1>

      <form onSubmit={handleSubmit} style={form}>
        <label style={label}>De 0 a 10, quanto você recomendaria?</label>
        <input
          type="number"
          min="0"
          max="10"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          style={input}
          required
        />

        <label style={label}>Comentário (opcional)</label>
        <textarea
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          style={textarea}
          rows={4}
        />

        {erro && <div style={errorBox}>{erro}</div>}

        <button type="submit" style={button}>
          Enviar resposta
        </button>
      </form>
    </div>
  );
}

const container = {
  maxWidth: 500,
  margin: "40px auto",
  padding: 20,
};

const title = {
  fontSize: 24,
  marginBottom: 20,
};

const form = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const label = {
  fontWeight: 600,
};

const input = {
  height: 40,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid #ccc",
};

const textarea = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccc",
};

const button = {
  marginTop: 10,
  height: 42,
  border: "none",
  borderRadius: 8,
  background: "#2563eb",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const errorBox = {
  background: "#fee2e2",
  color: "#991b1b",
  padding: 10,
  borderRadius: 8,
};
