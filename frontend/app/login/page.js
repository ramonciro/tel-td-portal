"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    try {
      setLoading(true)
    } catch {}
    try {
      setErro("");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const res = await fetch(`${apiUrl}/auth`, authRoutes)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro ao realizar login");

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      if (data.user?.troca_senha_obrigatoria) {
        window.location.href = "/primeiro-acesso";
        return;
      }

      window.location.href = "/inicio";
    } catch (e) {
      setErro(e.message || "Erro ao realizar login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={title}>Tel T&D</h1>
        <p style={subtitle}>Acesse o portal de Treinamento e Desenvolvimento</p>

        {erro ? <div style={errorBox}>{erro}</div> : null}

        <form onSubmit={handleLogin} style={form}>
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            style={input}
          />
          <button type="submit" style={button}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div style={tipBox}>
          Senha padrão de criação: <strong>Tel@2026</strong>
        </div>
      </div>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#f1f5f9",
  padding: 24
};

const card = {
  width: "min(420px, 100%)",
  background: "#fff",
  borderRadius: 18,
  padding: 28,
  boxShadow: "0 10px 30px rgba(0,0,0,0.08)"
};

const title = { margin: 0, fontSize: 32, color: "#0f172a" };
const subtitle = { marginTop: 8, color: "#64748b" };
const form = { display: "grid", gap: 12, marginTop: 20 };
const input = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  width: "100%",
  boxSizing: "border-box"
};
const button = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "12px 16px",
  cursor: "pointer"
};
const errorBox = {
  background: "#fef2f2",
  color: "#b91c1c",
  padding: 12,
  borderRadius: 10,
  marginTop: 16
};
const tipBox = {
  marginTop: 18,
  background: "#eff6ff",
  color: "#1d4ed8",
  padding: 12,
  borderRadius: 10,
  fontSize: 14
};
