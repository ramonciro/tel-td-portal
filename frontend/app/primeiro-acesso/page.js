"use client";

import { useEffect, useState } from "react";
import API_URL from "../../services/api";

export default function PrimeiroAcessoPage() {
  const [email, setEmail] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("Tel@2026");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const user = JSON.parse(raw);
        setEmail(user?.email || "");
      }
    } catch {}
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    if (novaSenha !== confirmarSenha) {
      setErro("A confirmação da nova senha não confere");
      return;
    }

    try {
      setLoading(true);
      setErro("");
      setSucesso("");

      const response = await fetch(`${API_URL}/auth/alterar-senha-primeiro-acesso`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          senha_atual: senhaAtual,
          nova_senha: novaSenha,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Erro ao alterar senha");
      }

      setSucesso("Senha alterada com sucesso. Redirecionando...");
      setTimeout(() => {
        window.location.href = "/inicio";
      }, 1200);
    } catch (e) {
      setErro(e.message || "Erro ao alterar senha");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={title}>Primeiro acesso</h1>
        <p style={subtitle}>Para continuar, altere sua senha padrão.</p>

        {erro ? <div style={errorBox}>{erro}</div> : null}
        {sucesso ? <div style={successBox}>{sucesso}</div> : null}

        <form onSubmit={handleSubmit} style={form}>
          <input
            type="email"
            value={email}
            readOnly
            style={{ ...input, background: "#f8fafc" }}
          />
          <input
            type="password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            placeholder="Senha atual"
            style={input}
          />
          <input
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            placeholder="Nova senha"
            style={input}
          />
          <input
            type="password"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            placeholder="Confirmar nova senha"
            style={input}
          />
          <button type="submit" style={button}>
            {loading ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </div>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#f1f5f9",
  padding: 24,
};

const card = {
  width: "min(460px, 100%)",
  background: "#fff",
  borderRadius: 18,
  padding: 28,
  boxShadow: "0 10px 30px rgba(0,0,0,.08)",
};

const title = { margin: 0, fontSize: 30, color: "#0f172a" };
const subtitle = { marginTop: 8, color: "#64748b" };

const form = {
  display: "grid",
  gap: 12,
  marginTop: 20,
};

const input = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  width: "100%",
  boxSizing: "border-box",
};

const button = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "12px 16px",
  cursor: "pointer",
};

const errorBox = {
  background: "#fef2f2",
  color: "#b91c1c",
  padding: 12,
  borderRadius: 10,
  marginTop: 16,
};

const successBox = {
  background: "#ecfdf5",
  color: "#166534",
  padding: 12,
  borderRadius: 10,
  marginTop: 16,
};
