"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import API_URL from "../../services/api";
import { colors, radius } from "../../lib/theme";

// Next.js exige que useSearchParams() fique dentro de um <Suspense> em rota
// estática (sem isso, o build de produção falha com "useSearchParams()
// should be wrapped in a suspense boundary") — mesmo padrão já usado em
// responder-nps/page.js e responder-avaliacao/page.js.
export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={<div style={wrap} />}>
      <RedefinirSenhaConteudo />
    </Suspense>
  );
}

function RedefinirSenhaConteudo() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function redefinir(e) {
    e.preventDefault();
    setErro("");

    if (!token) {
      setErro("Link inválido — token não encontrado. Solicite um novo link em \"Esqueci minha senha\".");
      return;
    }
    if (novaSenha.length < 6) {
      setErro("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmacao) {
      setErro("As senhas não conferem.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/redefinir-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, nova_senha: novaSenha }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível redefinir a senha.");
      }

      setSucesso(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setErro(err.message || "Erro ao redefinir senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <img src="/logo-td.png" alt="Portal T&D" style={logo} />
        <h1 style={title}>Redefinir senha</h1>

        {sucesso ? (
          <p style={subtitle}>
            Senha redefinida com sucesso! Redirecionando para o login...
          </p>
        ) : (
          <>
            <p style={subtitle}>Crie uma nova senha para acessar o Portal T&amp;D.</p>

            {!token && (
              <div style={errorBox}>
                Link inválido ou incompleto. Solicite um novo em{" "}
                <Link href="/esqueci-senha" style={{ color: colors.dangerText, fontWeight: 700 }}>
                  Esqueci minha senha
                </Link>.
              </div>
            )}
            {erro && <div style={errorBox}>{erro}</div>}

            <form onSubmit={redefinir} style={form}>
              <input
                type="password"
                placeholder="Nova senha"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                style={input}
                required
              />
              <input
                type="password"
                placeholder="Confirmar nova senha"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                style={input}
                required
              />

              <button style={loading ? { ...button, opacity: 0.7, cursor: "default" } : button} disabled={loading}>
                {loading ? "Salvando..." : "Redefinir senha"}
              </button>
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

const errorBox = {
  background: colors.dangerLight,
  color: colors.dangerText,
  padding: "10px 12px",
  borderRadius: radius.sm,
  fontSize: 13,
  marginBottom: 14,
};
