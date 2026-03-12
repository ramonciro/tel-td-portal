"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setErro("");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, senha })
      });

      if (!res.ok) {
        setErro("Login inválido");
        return;
      }

      const data = await res.json();
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user || {}));
      window.location.href = "/inicio";
    } catch {
      setErro("Erro ao conectar com o servidor");
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      background: "#f8fafc",
      fontFamily: "Arial, sans-serif"
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        background: "#fff",
        borderRadius: 18,
        padding: 28,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
      }}>
        <h1 style={{ marginTop: 0 }}>Tel T&D</h1>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          Portal de Treinamento e Desenvolvimento
        </p>

        <form onSubmit={handleLogin}>
          <label>E-mail</label>
          <input
            style={inputStyle}
            placeholder="Digite seu e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label>Senha</label>
          <input
            type="password"
            style={inputStyle}
            placeholder="Digite sua senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />

          <button type="submit" style={buttonStyle}>Entrar</button>

          {erro ? <p style={{ color: "#b91c1c" }}>{erro}</p> : null}
        </form>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: 12,
  marginTop: 8,
  marginBottom: 16,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  boxSizing: "border-box"
};

const buttonStyle = {
  width: "100%",
  background: "#172554",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: "bold"
};
