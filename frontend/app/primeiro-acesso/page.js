"use client";

import { useState } from "react";

export default function PrimeiroAcessoPage() {
  const [email, setEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function salvarNovaSenha(e) {
    e.preventDefault();
    setMensagem("");
    setErro("");

    if (!email || !novaSenha || !confirmarSenha) {
      setErro("Preencha e-mail, nova senha e confirmação.");
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setErro("A confirmação da senha não confere.");
      return;
    }

    try {
      const response = await fetch("/api/auth/primeiro-acesso", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          senha: novaSenha,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível salvar a nova senha.");
      }

      setMensagem("Senha alterada com sucesso. Faça login novamente.");
      setEmail("");
      setNovaSenha("");
      setConfirmarSenha("");
    } catch (error) {
      setErro(error.message || "Erro ao salvar nova senha.");
    }
  }

  return (
    <div style={container}>
      <div style={card}>
        <h1 style={title}>Primeiro acesso</h1>
        <p style={subtitle}>Por segurança, defina uma nova senha para continuar.</p>

        {erro ? <div style={errorBox}>{erro}</div> : null}
        {mensagem ? <div style={successBox}>{mensagem}</div> : null}

        <form onSubmit={salvarNovaSenha} style={form}>
          <div style={field}>
            <label style={label}>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Informe seu e-mail"
              style={input}
            />
          </div>

          <div style={field}>
            <label style={label}>Nova senha</label>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="Digite a nova senha"
              style={input}
            />
          </div>

          <div style={field}>
            <label style={label}>Confirmar nova senha</label>
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              placeholder="Confirme a nova senha"
              style={input}
            />
          </div>

          <button type="submit" style={button}>
            Salvar nova senha
          </button>
        </form>
      </div>
    </div>
  );
}

const container = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f8fafc",
  padding: 24,
};

const card = {
  width: "100%",
  maxWidth: 720,
  background: "#ffffff",
  borderRadius: 28,
  padding: 36,
  boxShadow: "0 20px 40px rgba(15, 23, 42, 0.08)",
  border: "1px solid #e2e8f0",
};

const title = {
  margin: "0 0 10px",
  fontSize: 48,
  lineHeight: 1.05,
  color: "#1e3a8a",
};

const subtitle = {
  margin: "0 0 24px",
  color: "#64748b",
  fontSize: 18,
};

const form = {
  display: "grid",
  gap: 16,
};

const field = {
  display: "grid",
  gap: 8,
};

const label = {
  fontWeight: 700,
  color: "#0f172a",
};

const input = {
  width: "100%",
  height: 48,
  borderRadius: 14,
  border: "1px solid #cbd5e1",
  padding: "0 14px",
  fontSize: 15,
  outline: "none",
};

const button = {
  marginTop: 8,
  height: 50,
  border: "none",
  borderRadius: 14,
  background: "#3b82f6",
  color: "#fff",
  fontWeight: 800,
  fontSize: 16,
  cursor: "pointer",
};

const errorBox = {
  background: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  borderRadius: 14,
  padding: 12,
};

const successBox = {
  background: "#f0fdf4",
  color: "#166534",
  border: "1px solid #bbf7d0",
  borderRadius: 14,
  padding: 12,
};
