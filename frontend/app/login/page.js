"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import API_URL from "../../services/api";
import { colors, radius } from "../../lib/theme";

// Fase "arquitetura multi-ambiente" (10/09/2026): a tela de login ganhou um
// passo de seleção de empresa/ambiente antes do e-mail+senha, alimentado por
// GET /api/auth/ambientes (empresas ativas, só com o que é seguro mostrar
// sem sessão: nome/código/logo/cor). Isso é o "seletor no próprio app" —
// não depende de subdomínio de verdade (comercio.teltd.com / dasa.teltd.com
// hoje não apontam pro Vercel ainda), mas já cumpre o objetivo de cada
// empresa entrar no seu próprio ambiente, com a marca certa, e evita que
// alguém confunda o e-mail com a empresa errada (o backend valida isso em
// /auth/login quando "empresa_codigo" é enviado).
//
// Com 0 ou 1 empresa cadastrada, o seletor nem aparece — vai direto pro
// formulário (mesmo comportamento de hoje), então isso nunca atrapalha um
// ambiente que ainda não tem uma segunda empresa configurada.

const LOGO_PADRAO = "/logo-td.png";
const NOME_PADRAO = "Portal T&D";
const COR_PADRAO = colors.accent;

export default function LoginPage() {
  const router = useRouter();

  const [ambientes, setAmbientes] = useState([]);
  const [carregandoAmbientes, setCarregandoAmbientes] = useState(true);
  const [empresaSelecionada, setEmpresaSelecionada] = useState(null); // null = ainda escolhendo / pulou
  const [mostrarSeletor, setMostrarSeletor] = useState(false);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelado = false;
    fetch(`${API_URL}/auth/ambientes`)
      .then((r) => (r.ok ? r.json() : []))
      .then((lista) => {
        if (cancelado) return;
        const validas = Array.isArray(lista) ? lista : [];
        setAmbientes(validas);
        // Só faz sentido perguntar quando há mais de uma empresa pra escolher.
        setMostrarSeletor(validas.length > 1);
      })
      .catch(() => {
        if (!cancelado) setAmbientes([]);
      })
      .finally(() => {
        if (!cancelado) setCarregandoAmbientes(false);
      });
    return () => { cancelado = true; };
  }, []);

  function escolherEmpresa(emp) {
    setEmpresaSelecionada(emp);
    setMostrarSeletor(false);
    setErro("");
  }

  function trocarEmpresa() {
    setEmpresaSelecionada(null);
    setMostrarSeletor(true);
    setErro("");
  }

  async function login(e) {
    e.preventDefault();
    setErro("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          senha,
          empresa_codigo: empresaSelecionada?.codigo || undefined,
        }),
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
        // Usuários de R&S vão direto para o módulo R&S
        const perfil = (data.user?.perfil || "").toLowerCase().trim();
        const rsPerfiles = ["coordenador_rs", "gestor_rs"];
        router.push(rsPerfiles.includes(perfil) ? "/rs/rps" : "/inicio");
      }
    } catch (err) {
      setErro(err.message || "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  }

  const nomeAtual = empresaSelecionada?.nome || NOME_PADRAO;
  const logoAtual = empresaSelecionada?.logo_url || LOGO_PADRAO;
  const corAtual = empresaSelecionada?.cor_primaria || COR_PADRAO;
  const eyebrowAtual = empresaSelecionada ? "Portal T&D" : "Tel Centro de Contatos";

  return (
    <div style={container}>
      <div style={{ ...leftSide, background: `linear-gradient(135deg, ${colors.navy} 0%, ${colors.navySoft} 100%)` }}>
        <div style={brandBox}>
          <img src={logoAtual} alt={nomeAtual} style={logo} onError={(e) => { e.currentTarget.src = LOGO_PADRAO; }} />
          <p style={eyebrow}>{eyebrowAtual}</p>
          <h1 style={title}>{empresaSelecionada ? empresaSelecionada.nome : "Portal T&D"}</h1>
          <p style={subtitle}>
            Suas turmas, materiais e avaliações num só lugar — sem procurar em quatro telas pra achar o que você precisa agora.
          </p>

          <div style={pulseRow}>
            <span style={{ ...dot, background: corAtual }} />
            <span style={pulseText}>Necessidade → planejamento → execução → resultado, tudo rastreável.</span>
          </div>
        </div>
      </div>

      <div style={rightSide}>
        {mostrarSeletor ? (
          <div style={loginCard}>
            <h2 style={loginTitle}>Qual é a sua empresa?</h2>
            <p style={loginSubtitle}>Selecione seu ambiente para continuar.</p>

            <div style={ambientesGrid}>
              {ambientes.map((emp) => (
                <button
                  key={emp.codigo}
                  type="button"
                  style={ambienteCard}
                  onClick={() => escolherEmpresa(emp)}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = emp.cor_primaria || COR_PADRAO; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border; }}
                >
                  <img
                    src={emp.logo_url || LOGO_PADRAO}
                    alt={emp.nome}
                    style={ambienteLogo}
                    onError={(e) => { e.currentTarget.src = LOGO_PADRAO; }}
                  />
                  <span style={ambienteNome}>{emp.nome}</span>
                </button>
              ))}
            </div>

            <button type="button" style={pularLink} onClick={() => { setMostrarSeletor(false); setEmpresaSelecionada(null); }}>
              Não sei / continuar só com e-mail
            </button>
          </div>
        ) : (
          <form onSubmit={login} style={loginCard}>
            <h2 style={loginTitle}>Acessar plataforma</h2>
            <p style={loginSubtitle}>Utilize seu e-mail corporativo para acessar o portal.</p>

            {empresaSelecionada && (
              <div style={empresaChip}>
                <span>Entrando em <strong>{empresaSelecionada.nome}</strong></span>
                {ambientes.length > 1 && (
                  <button type="button" style={trocarBtn} onClick={trocarEmpresa}>Trocar</button>
                )}
              </div>
            )}

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

            <button disabled={loading} style={loading ? { ...button, background: corAtual, opacity: 0.7, cursor: "default" } : { ...button, background: corAtual }}>
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <a href="/esqueci-senha" style={forgotLink}>Esqueci minha senha</a>
          </form>
        )}
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
  background: "#fff",
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
  maxWidth: 380,
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
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

const forgotLink = {
  marginTop: 16,
  fontSize: 12.5,
  color: colors.textSecondary,
  textAlign: "center",
  textDecoration: "none",
  alignSelf: "center",
};

const errorBox = {
  background: colors.dangerLight,
  color: colors.dangerText,
  borderRadius: radius.sm,
  padding: "10px 12px",
  fontSize: 13,
  marginBottom: 14,
};

const ambientesGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginTop: 12,
  marginBottom: 8,
};

const ambienteCard = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  padding: "18px 12px",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  background: "#fff",
  cursor: "pointer",
  transition: "border-color .15s ease",
};

const ambienteLogo = {
  width: 40,
  height: 40,
  objectFit: "contain",
  borderRadius: radius.sm,
};

const ambienteNome = {
  fontSize: 13,
  fontWeight: 700,
  color: colors.textPrimary,
  textAlign: "center",
};

const pularLink = {
  marginTop: 8,
  background: "none",
  border: "none",
  color: colors.textSecondary,
  fontSize: 12.5,
  textDecoration: "underline",
  cursor: "pointer",
  alignSelf: "center",
};

const empresaChip = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: colors.surfaceMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  padding: "8px 12px",
  fontSize: 12.5,
  color: colors.textSecondary,
  marginBottom: 14,
};

const trocarBtn = {
  background: "none",
  border: "none",
  color: colors.primary,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
  padding: 0,
};
