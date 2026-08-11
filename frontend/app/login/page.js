"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import API_URL from "../../services/api";
import { colors, radius } from "../../lib/theme";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(e) {
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
        throw new Error(data.message || "Falha no login");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
      }

      if (data.user?.troca_senha_obrigatoria) {
        router.push("/primeiro-acesso");
      } else {
        router.push("/inicio");
      }
    } catch (err) {
      setErro(err.message || "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={container}>
      <div style={leftSide}>
        <div style={brandBox}>
          <img src="/logo-td.png" alt="Portal T&D" style={logo} />
          <p style={eyebrow}>Tel Centro de Contatos</p>
          <h1 style={title}>Portal T&amp;D</h1>
          <p style={subtitle}>
            Suas turmas, materiais e avaliações num só lugar — sem procurar em quatro telas pra achar o que você precisa agora.
          </p>

          <div style={pulseRow}>
            <span style={dot} />
            <span style={pulseText}>Necessidade → planejamento → execução → resultado, tudo rastreável.</span>
          </div>
        </div>
      </div>

      <div style={rightSide}>
        <form onSubmit={login} style={loginCard}>
          <h2 style={loginTitle}>Acessar plataforma</h2>
          <p style={loginSubtitle}>Utilize seu e-mail corporativo para acessar o portal.</p>

          {erro && <div style={errorBox}>{erro}</div>}

          <label style={fieldLabel}>E-mail</label>
          <input
            placeholder="voce@telcc.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
            required
          />

          <label style={fieldLabel}>Senha</label>
          <input
            type="password"
            placeholder="Sua senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            style={input}
            required
          />

          <button disabled={loading} style={loading ? { ...button, opacity: 0.7, cursor: "default" } : button}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

const container = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
};

const leftSide = {
  background: `linear-gradient(135deg, ${colors.navy} 0%, ${colors.navySoft} 100%)`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 48,
};

const brandBox = {
  maxWidth: 420,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const logo = {
  width: 64,
  height: 64,
  borderRadius: radius.md,
  objectFit: "contain",
  marginBottom: 18,
};

const eyebrow = {
  margin: 0,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "#8B93A7",
};

const title = {
  margin: "6px 0 12px",
  fontSize: 34,
  fontWeight: 800,
  letterSpacing: "-.02em",
  color: "#fff",
};

const subtitle = {
  margin: 0,
  fontSize: 14.5,
  color: "#C7CCDA",
  lineHeight: 1.6,
};

const pulseRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginTop: 28,
  paddingTop: 20,
  borderTop: "1px solid rgba(255,255,255,0.1)",
};

const dot = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: colors.accent,
  flexShrink: 0,
};

const pulseText = {
  fontSize: 12.5,
  color: "#8B93A7",
  lineHeight: 1.5,
};

const rightSide = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: colors.surfaceMuted,
};

const loginCard = {
  width: "100%",
  maxWidth: 360,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  background: "#fff",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.lg,
  padding: 32,
  boxShadow: "0 18px 36px rgba(15,23,42,.06)",
};

const loginTitle = {
  margin: 0,
  fontSize: 20,
  fontWeight: 800,
  color: colors.textPrimary,
};

const loginSubtitle = {
  margin: "4px 0 20px",
  fontSize: 13,
  color: colors.textSecondary,
};

const fieldLabel = {
  fontSize: 12,
  fontWeight: 700,
  color: colors.textSecondary,
  marginBottom: 6,
  marginTop: 12,
};

const input = {
  height: 42,
  borderRadius: radius.sm,
  border: `1px solid ${colors.border}`,
  padding: "0 12px",
  fontSize: 14,
  outline: "none",
};

const button = {
  marginTop: 24,
  height: 44,
  borderRadius: radius.sm,
  border: "none",
  background: colors.accent,
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const errorBox = {
  background: colors.dangerLight,
  color: colors.dangerText,
  borderRadius: radius.sm,
  padding: "10px 12px",
  fontSize: 13,
  marginBottom: 14,
};
