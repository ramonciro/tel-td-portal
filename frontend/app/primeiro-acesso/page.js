"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getStoredUser } from "../../services/api";

export default function PrimeiroAcessoPage() {
  const router = useRouter();

  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setErro("");

    if (senha !== confirmacao) {
      setErro("Senhas não conferem");
      return;
    }

    const user = getStoredUser();

    if (!user?.email) {
      setErro("Usuário não identificado");
      return;
    }

    try {
      setLoading(true);

      await apiFetch("/auth/alterar-senha", {
        method: "POST",
        body: JSON.stringify({ novaSenha: senha }),
      });

      if (typeof window !== "undefined") {
        localStorage.setItem(
          "user",
          JSON.stringify({
            ...user,
            troca_senha_obrigatoria: false,
          })
        );
      }

      router.push("/inicio");
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <img src="/logo-td.png" alt="Portal T&D" style={logo} />
        <h1 style={title}>Primeiro acesso</h1>
        <p style={subtitle}>
          Defina sua nova senha para continuar usando o portal.
        </p>

        {erro && <div style={errorBox}>{erro}</div>}

        <form onSubmit={salvar} style={form}>
          <input
            type="password"
            placeholder="Nova senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            style={input}
            required
          />

          <input
            type="password"
            placeholder="Confirmar senha"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            style={input}
            required
          />

          <button style={button} disabled={loading}>
            {loading ? "Salvando..." : "Salvar senha"}
          </button>
        </form>
      </div>
    </div>
  );
}

const wrap = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f8fafc",
  padding: 24,
};

const card = {
  width: "100%",
  maxWidth: 420,
  background: "#fff",
  padding: 32,
  borderRadius: 18,
  boxShadow: "0 15px 35px rgba(0,0,0,.08)",
};

const logo = {
  width: 82,
  marginBottom: 16,
};

const title = {
  margin: "0 0 8px",
};

const subtitle = {
  margin: "0 0 16px",
  color: "#64748b",
};

const form = {
  display: "grid",
  gap: 12,
};

const input = {
  padding: 12,
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 14,
};

const button = {
  padding: 12,
  borderRadius: 8,
  border: 0,
  background: "#2563eb",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const errorBox = {
  background: "#fee2e2",
  color: "#b91c1c",
  padding: 10,
  borderRadius: 8,
  fontSize: 13,
  marginBottom: 12,
};
