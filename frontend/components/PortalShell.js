"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getStoredUser, hasSomeRole } from "../services/api";

const allMenu = [
  { href: "/inicio", label: "Início" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/usuarios", label: "Usuários", restricted: true },
  { href: "/clientes", label: "Clientes", restricted: true },
  { href: "/treinamentos", label: "Treinamentos" },
  { href: "/presencas", label: "Turmas" },
  { href: "/avaliacoes", label: "Avaliações" },
  { href: "/biblioteca", label: "Biblioteca" },
  { href: "/trilhas", label: "Trilhas" },
  { href: "/mapa-desenvolvimento", label: "Mapa de desenvolvimento" }
];

export default function PortalShell({ title, subtitle, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const menu = useMemo(() => {
    const elevated = hasSomeRole(user, ["admin", "coordenador", "supervisor"]);
    return allMenu.filter((item) => !item.restricted || elevated);
  }, [user]);

  function sair() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
    router.push("/login");
  }

  return (
    <div style={shellWrap}>
      <aside style={asideStyle}>
        <div style={topBlock}>
          <div>
            <div style={brandTitle}>Tel T&amp;D</div>
            <div style={brandSubtitle}>Gestão de treinamento e desenvolvimento</div>
          </div>

          <div style={profileCard}>
            <div style={profileLabel}>Perfil</div>
            <div style={profileName}>{user?.nome || "Usuário"}</div>
            <div style={profileRole}>{String(user?.perfil || "não identificado").toUpperCase()}</div>
          </div>
        </div>

        <div style={navWrap}>
          <nav style={navStyle}>
            {menu.map((item) => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} style={navItem(active)}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div style={footerActions}>
          <Link href="/alterar-senha" style={secondaryButton}>
            Alterar senha
          </Link>
          <button onClick={sair} style={primaryButton}>
            Sair
          </button>
        </div>
      </aside>

      <main style={mainStyle}>
        <div style={contentWrap}>
          <div style={pageHeader}>
            <h1 style={pageTitle}>{title}</h1>
            {subtitle ? <p style={pageSubtitle}>{subtitle}</p> : null}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

const shellWrap = {
  minHeight: "100vh",
  display: "flex",
  background: "#f8fafc"
};

const asideStyle = {
  width: 228,
  minWidth: 228,
  height: "100vh",
  position: "sticky",
  top: 0,
  display: "flex",
  flexDirection: "column",
  background: "linear-gradient(180deg, #0f172a 0%, #1e3a8a 100%)",
  color: "#fff",
  padding: 16,
  boxSizing: "border-box",
  overflow: "hidden"
};

const topBlock = {
  display: "grid",
  gap: 14,
  marginBottom: 12,
  flexShrink: 0
};

const brandTitle = {
  fontSize: 27,
  fontWeight: 900,
  letterSpacing: "-0.03em"
};

const brandSubtitle = {
  marginTop: 4,
  fontSize: 12,
  color: "rgba(255,255,255,.72)",
  lineHeight: 1.45
};

const profileCard = {
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 14,
  padding: 12
};

const profileLabel = {
  fontSize: 10,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,.62)"
};

const profileName = {
  marginTop: 8,
  fontSize: 14,
  fontWeight: 800
};

const profileRole = {
  marginTop: 4,
  fontSize: 11,
  color: "rgba(255,255,255,.72)"
};

const navWrap = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  paddingRight: 4,
  marginRight: -4
};

const navStyle = {
  display: "grid",
  gap: 7,
  alignContent: "start"
};

const navItem = (active) => ({
  textDecoration: "none",
  color: "#fff",
  padding: "10px 12px",
  borderRadius: 12,
  border: active ? "1px solid rgba(255,255,255,.18)" : "1px solid transparent",
  background: active ? "rgba(255,255,255,.14)" : "transparent",
  fontSize: 13,
  fontWeight: active ? 800 : 600
});

const footerActions = {
  display: "grid",
  gap: 8,
  marginTop: 12,
  flexShrink: 0
};

const secondaryButton = {
  textDecoration: "none",
  textAlign: "center",
  border: "1px solid rgba(255,255,255,.18)",
  background: "rgba(255,255,255,.08)",
  color: "#fff",
  borderRadius: 12,
  padding: 11,
  fontWeight: 700,
  fontSize: 13
};

const primaryButton = {
  width: "100%",
  border: "1px solid rgba(255,255,255,.12)",
  background: "#ffffff",
  color: "#1d4ed8",
  borderRadius: 12,
  padding: 11,
  fontWeight: 800,
  fontSize: 13,
  cursor: "pointer"
};

const mainStyle = {
  flex: 1,
  padding: 18,
  boxSizing: "border-box"
};

const contentWrap = {
  background: "rgba(255,255,255,.92)",
  borderRadius: 22,
  border: "1px solid #e2e8f0",
  boxShadow: "0 20px 36px rgba(15,23,42,.05)",
  padding: 20,
  minHeight: "calc(100vh - 36px)"
};

const pageHeader = {
  marginBottom: 18
};

const pageTitle = {
  margin: 0,
  fontSize: 34,
  lineHeight: 1.05,
  letterSpacing: "-0.03em",
  color: "#0f172a"
};

const pageSubtitle = {
  margin: "8px 0 0",
  color: "#64748b",
  fontSize: 14,
  lineHeight: 1.55
};
