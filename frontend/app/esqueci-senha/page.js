"use client";

import { useState } from "react";
import Link from "next/link";
import API_URL from "../../services/api";
import { colors, radius } from "../../lib/theme";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/esqueci-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível processar sua solicitação.");
      }

      // A API sempre responde OK aqui (mesmo se o e-mail não existir) —
      // proposital, evita que alguém descubra quais e-mails estão
      // cadastrados testando este formulário.
      setEnviado(true);
    } catch (err) {
      setErro(err.message || "Erro ao processar solicitação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <img src="/logo-td.png" alt="Portal T&D" style={logo} />
        <h1 style={title}>Esqueci minha senha</h1>

        {enviado ? (
          <>
            <p style={subtitle}>
              Se o e-mail <strong>{email}</strong> estiver cadastrado, você receberá em instantes
              uma mensagem com um link para criar uma nova senha (válido por 1 hora).
            </p>
            <Link href="/login" style={backLink}>Voltar para o login</Link>
          </>
        ) : (
          <>
            <p style={subtitle}>
              Informe o e-mail cadastrado no portal. Enviaremos um link para você redefinir sua senha.
            </p>

            {erro && <div style={errorBox}>{erro}</div>}

            <form onSubmit={enviar} style={form}>
              <input
                type="email"
                placeholder="voce@telcc.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={input}
                required
              />

              <button style={loading ? { ...button, opacity: 0.7, cursor: "default" } : button} disabled={loading}>
                {loading ? "Enviando..." : "Enviar link de redefinição"}
              </button>

              <Link href="/login" style={backLink}>Voltar para o login</Link>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const wrap = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: colors.surfaceMuted,
  padding: 24,
};

const card = {
  width: "100%",
  maxWidth: 420,
  background: colors.surface,
  padding: 32,
  borderRadius: radius.lg,
  boxShadow: "0 18px 36px rgba(15,23,42,.06)",
  border: `1px solid ${colors.border}`,
};

const logo = {
  width: 64,
  height: 64,
  objectFit: "contain",
  borderRadius: radius.md,
  marginBottom: 16,
};

const title = {
  margin: "0 0 8px",
  fontSize: 20,
  fontWeight: 800,
  color: colors.textPrimary,
};

const subtitle = {
  margin: "0 0 20px",
  color: colors.textSecondary,
  fontSize: 13.5,
  lineHeight: 1.6,
};

const form = {
  display: "grid",
  gap: 12,
};

const input = {
  height: 42,
  padding: "0 12px",
  borderRadius: radius.sm,
  border: `1px solid ${colors.border}`,
  fontSize: 14,
  outline: "none",
};

const button = {
  height: 44,
  borderRadius: radius.sm,
  border: 0,
  background: colors.accent,
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const backLink = {
  marginTop: 4,
  fontSize: 12.5,
  color: colors.textSecondary,
  textAlign: "center",
  textDecoration: "none",
};

const errorBox = {
  background: colors.dangerLight,
  color: colors.dangerText,
  padding: "10px 12px",
  borderRadius: radius.sm,
  fontSize: 13,
  marginBottom: 14,
};
