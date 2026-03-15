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
        body: JSON.stringify({ email, senha })
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
        <h1 style={title}>Tel T&D</h1>
        <p style={subtitle}>Acesse o portal de Treinamento e Desenvolvimento</p>

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

        <p style={hint}>Senha padrão de criação: <strong>Tel@2026</strong></p>
      </form>
    </div>
  );
}

const wrap = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#eef4fb",
  padding: 24
};

const card = {
  width: "100%",
  maxWidth: 460,
  background: "#fff",
  borderRadius: 20,
  padding: 32,
  boxShadow: "0 10px 30px rgba(15,23,42,.08)"
};

const title = {
  margin: 0,
  fontSize: 40,
  color: "#1e3a8a"
};

const subtitle = {
  color: "#64748b",
  marginBottom: 24
};

const input = {
  width: "100%",
  boxSizing: "border-box",
  padding: 14,
  borderRadius: 12,
  border: "1px solid #dbe3ef",
  marginBottom: 14
};

const button = {
  width: "100%",
  border: 0,
  borderRadius: 12,
  padding: 14,
  background: "#3b82f6",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer"
};

const errorBox = {
  background: "#fef2f2",
  color: "#b91c1c",
  padding: 12,
  borderRadius: 12,
  marginBottom: 16,
  border: "1px solid #fecaca"
};

const hint = {
  marginTop: 18,
  textAlign: "center",
  color: "#64748b"
};
