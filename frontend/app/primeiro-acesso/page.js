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
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ novaSenha }),
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
        <div style={eyebrow}>Primeiro acesso</div>
        <h1 style={title}>Defina sua nova senha</h1>
        <p style={subtitle}>Por segurança, atualize sua credencial antes de continuar.</p>

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

const title = { margin: "14px 0 8px", fontSize: 28, color: "#0f172a" };
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
const successBox = {
  background: "#ecfdf5",
  color: "#166534",
  padding: 10,
  borderRadius: 10,
  marginBottom: 14,
  border: "1px solid #bbf7d0",
  fontWeight: 600,
};
