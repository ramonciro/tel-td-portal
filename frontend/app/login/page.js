"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import API_URL from "../../services/api";
import { colors, radius } from "../../lib/theme";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [ambiente, setAmbiente] = useState("Comércio"); // Padrão inicial
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  // Lista exatamente como pedida, apenas os nomes limpos
  const ambientesDisponiveis = [
    "Comércio",
    "Dasa",
    "Sebrae",
    "CEMIG",
    "FSA",
    "Iguá"
  ];

  async function login(e) {
    e.preventDefault();
    setErro("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha, ambiente }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Falha no login");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.setItem("clienteAtivo", ambiente);
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
      {/* Lado esquerdo restaurado com o visual original do portal */}
      <div style={leftSide}>
        <div style={leftContent}>
          <div style={badge}>
            <span style={dot} />
            <span style={pulseText}>Portal T&D — Sistema Integrado</span>
          </div>
          <h1 style={leftTitle}>Suas turmas, materiais e avaliações num só lugar.</h1>
          <p style={leftDesc}>
            Necessidade → planejamento → execução → resultado, tudo integrado e rastreável.
          </p>
        </div>
      </div>

      {/* Lado direito com o card de login */}
      <div style={rightSide}>
        <form onSubmit={login} style={loginCard}>
          <h2 style={loginTitle}>Acessar Portal</h2>
          <p style={loginSubtitle}>Selecione o ambiente e digite suas credenciais</p>

          {erro && <div style={errorBox}>{erro}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={fieldLabel}>Ambiente</label>
              <select
                value={ambiente}
                onChange={(e) => setAmbiente(e.target.value)}
                style={selectInput}
              >
                {ambientesDisponiveis.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={fieldLabel}>E-mail</label>
              <input
                type="email"
                placeholder="seu.email@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={textInput}
              />
            </div>

            <div>
              <label style={fieldLabel}>Senha</label>
              <input
                type="password"
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                style={textInput}
              />
            </div>

            <button type="submit" disabled={loading} style={submitButton}>
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Estilos alinhados com o Design System original (lib/theme)
const container = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  minHeight: "100vh",
  background: colors.background || "#0f172a",
};

const leftSide = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  padding: 64,
  background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
  color: "#fff",
};

const leftContent = {
  maxWidth: 480,
};

const badge = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  background: "rgba(255,255,255,0.05)",
  borderRadius: radius.full || 999,
  border: "1px solid rgba(255,255,255,0.1)",
  marginBottom: 24,
};

const dot = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: colors.accent || "#3b82f6",
  flexShrink: 0,
};

const pulseText = {
  fontSize: 12.5,
  color: "#94a3b8",
  lineHeight: 1.5,
};

const leftTitle = {
  fontSize: 32,
  fontWeight: 800,
  lineHeight: 1.25,
  marginBottom: 16,
};

const leftDesc = {
  fontSize: 15,
  color: "#94a3b8",
  lineHeight: 1.6,
};

const rightSide = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: colors.surfaceMuted || "#f8fafc",
};

const loginCard = {
  width: "100%",
  maxWidth: 360,
  display: "flex",
  flexDirection: "column",
  background: "#fff",
  border: `1px solid ${colors.border || "#e2e8f0"}`,
  borderRadius: radius.lg || 12,
  padding: 32,
  boxShadow: "0 18px 36px rgba(15,23,42,.06)",
};

const loginTitle = {
  margin: 0,
  fontSize: 20,
  fontWeight: 800,
  color: colors.textPrimary || "#0f172a",
};

const loginSubtitle = {
  margin: "4px 0 20px",
  fontSize: 13,
  color: colors.textSecondary || "#64748b",
};

const fieldLabel = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
  marginBottom: 6,
};

const textInput = {
  width: "100%",
  padding: "10px 14px",
  fontSize: 14,
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  outline: "none",
  boxSizing: "border-box",
};

const selectInput = {
  width: "100%",
  padding: "10px 14px",
  fontSize: 14,
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

const submitButton = {
  width: "100%",
  padding: "12px",
  marginTop: 8,
  fontSize: 14,
  fontWeight: 700,
  color: "#fff",
  background: colors.primary || "#2563eb",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  transition: "background 0.2s",
};

const errorBox = {
  padding: "10px 14px",
  marginBottom: 16,
  fontSize: 13,
  color: "#dc2626",
  background: "#ffeeec",
  borderRadius: 8,
  border: "1px solid #fecaca",
};
