"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import API_URL from "../../services/api";

export default function PrimeiroAcessoPage() {
  const router = useRouter();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setSucesso("");

    if (!novaSenha || !confirmacao) {
      setErro("Preencha os dois campos.");
      return;
    }

    if (novaSenha !== confirmacao) {
      setErro("As senhas não coincidem.");
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      const response = await fetch(`${API_URL}/auth/alterar-senha`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ novaSenha })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Erro ao alterar senha");
      }

      const rawUser = localStorage.getItem("user");
      const user = rawUser ? JSON.parse(rawUser) : {};
      user.troca_senha_obrigatoria = 0;
      localStorage.setItem("user", JSON.stringify(user));

      setSucesso("Senha alterada com sucesso.");
      setTimeout(() => router.push("/inicio"), 1000);
    } catch (error) {
      setErro(error.message || "Erro ao alterar senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={wrap}>
      <form onSubmit={handleSubmit} style={card}>
        <h1 style={title}>Primeiro acesso</h1>
        <p style={subtitle}>Por segurança, defina uma nova senha para continuar.</p>

        {erro ? <div style={errorBox}>{erro}</div> : null}
        {sucesso ? <div style={successBox}>{sucesso}</div> : null}

        <input
          style={input}
          type="password"
          placeholder="Nova senha"
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
        />

        <input
          style={input}
          type="password"
          placeholder="Confirmar nova senha"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />

        <button type="submit" style={button} disabled={loading}>
          {loading ? "Salvando..." : "Salvar nova senha"}
        </button>
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
  fontSize: 34,
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
  background: "#2563eb",
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

const successBox = {
  background: "#ecfdf5",
  color: "#166534",
  padding: 12,
  borderRadius: 12,
  marginBottom: 16,
  border: "1px solid #bbf7d0"
};
