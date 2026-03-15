"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import API_URL from "../../services/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setErro("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao realizar login");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      if (data.user?.troca_senha_obrigatoria) {
        router.push("/primeiro-acesso");
      } else {
        router.push("/inicio");
      }
    } catch (error) {
      setErro(error.message || "Erro ao realizar login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={wrap}>
      <form onSubmit={handleLogin} style={card}>
        <div style={eyebrow}>Portal T&amp;D</div>
        <h1 style={title}>Acesso</h1>
        <p style={subtitle}>Entre para acessar o ambiente de gestão do treinamento.</p>

        {erro ? <div style={errorBox}>{erro}</div> : null}

        <input
          style={input}
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          style={input}
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />

        <button type="submit" style={button} disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p style={hint}>Senha padrão inicial: <strong>Tel@2026</strong></p>
      </form>
    </div>
  );
}

const wrap = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(180deg, #eef4fb 0%, #f8fafc 100%)",
  padding: 24,
};

const card = {
  width: "100%",
  maxWidth: 430,
  background: "#fff",
  borderRadius: 20,
  padding: 28,
  boxShadow: "0 16px 34px rgba(15,23,42,.08)",
  border: "1px solid #e2e8f0",
};

const eyebrow = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const title = { margin: "14px 0 8px", fontSize: 32, color: "#0f172a" };
const subtitle = { color: "#64748b", margin: "0 0 20px", lineHeight: 1.5 };
const input = {
  width: "100%",
  boxSizing: "border-box",
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  marginBottom: 12,
  fontSize: 14,
};
const button = {
  width: "100%",
  border: 0,
  borderRadius: 10,
  height: 42,
  background: "#2563eb",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 14,
};
const errorBox = {
  background: "#fef2f2",
  color: "#b91c1c",
  padding: 10,
  borderRadius: 10,
  marginBottom: 14,
  border: "1px solid #fecaca",
  fontWeight: 600,
};
const hint = { marginTop: 14, textAlign: "center", color: "#64748b", fontSize: 12 };
