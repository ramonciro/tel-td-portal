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
    <div style={layoutWrap}>
      <aside style={asideWrap}>
        <div style={brandBlock}>
          <div style={brandTitle}>Tel T&amp;D</div>
          <div style={brandSubtitle}>
            Painel de governança de treinamento com foco em operação, indicadores e tomada de decisão.
          </div>
        </div>

        <div style={profileCard}>
          <div style={profileLabel}>Perfil em uso</div>
          <div style={profileName}>{user?.nome || "Usuário"}</div>
          <div style={profileRole}>{(user?.perfil || "perfil não identificado").toString().toUpperCase()}</div>
        </div>

        <div style={menuScroller}>
          <nav style={navGrid}>
            {menu.map((item) => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} style={navLink(active)}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div style={bottomActions}>
          <Link href="/alterar-senha" style={secondaryAction}>
            Alterar senha
          </Link>

          <button onClick={sair} style={primaryAction}>
            Sair
          </button>
        </div>
      </aside>

      <main style={mainWrap}>
        <div style={contentShell}>
          <div style={{ marginBottom: 24 }}>
            <div style={eyebrow}>Portal T&amp;D</div>
            <h1 style={pageTitle}>{title}</h1>
            <p style={pageSubtitle}>{subtitle}</p>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}

const layoutWrap = {
  minHeight: "100vh",
  display: "flex",
  background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)"
};

const asideWrap = {
  width: 240,
  minWidth: 240,
  background: "linear-gradient(180deg, #0f172a 0%, #1e3a8a 100%)",
  color: "#fff",
  padding: 18,
  boxSizing: "border-box",
  position: "sticky",
  top: 0,
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  overflow: "hidden",
  boxShadow: "16px 0 32px rgba(15, 23, 42, 0.12)"
};

const brandBlock = {
  padding: "6px 4px 2px"
};

const brandTitle = {
  fontSize: 28,
  fontWeight: 900,
  letterSpacing: "-0.03em"
};

const brandSubtitle = {
  fontSize: 13,
  color: "rgba(255,255,255,.72)",
  marginTop: 6,
  lineHeight: 1.5
};

const profileCard = {
  background: "rgba(255,255,255,.10)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 18,
  padding: 14,
  display: "grid",
  gap: 6
};

const profileLabel = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "rgba(255,255,255,.62)",
  fontWeight: 700
};

const profileName = {
  fontWeight: 800,
  fontSize: 16
};

const profileRole = {
  fontSize: 12,
  color: "rgba(255,255,255,.75)",
  fontWeight: 700
};

const menuScroller = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  paddingRight: 4,
  scrollbarWidth: "thin"
};

const navGrid = {
  display: "grid",
  gap: 8
};

const navLink = (active) => ({
  textDecoration: "none",
  color: "#fff",
  padding: "11px 13px",
  borderRadius: 14,
  background: active ? "rgba(255,255,255,.16)" : "transparent",
  border: active ? "1px solid rgba(255,255,255,.18)" : "1px solid transparent",
  fontWeight: active ? 800 : 600,
  boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,.08)" : "none"
});

const bottomActions = {
  display: "grid",
  gap: 10,
  paddingTop: 4,
  background: "linear-gradient(180deg, rgba(15,23,42,0) 0%, rgba(15,23,42,.34) 24%, rgba(15,23,42,.34) 100%)"
};

const secondaryAction = {
  textDecoration: "none",
  textAlign: "center",
  border: "1px solid rgba(255,255,255,.18)",
  background: "rgba(255,255,255,.08)",
  color: "#fff",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700
};

const primaryAction = {
  width: "100%",
  border: "1px solid rgba(255,255,255,.18)",
  background: "#ffffff",
  color: "#1e3a8a",
  borderRadius: 14,
  padding: 12,
  fontWeight: 800,
  cursor: "pointer"
};

const mainWrap = {
  flex: 1,
  padding: 22,
  boxSizing: "border-box"
};

const contentShell = {
  background: "rgba(255,255,255,.88)",
  backdropFilter: "blur(12px)",
  borderRadius: 28,
  padding: 26,
  border: "1px solid #dbeafe",
  boxShadow: "0 24px 48px rgba(15, 23, 42, 0.08)",
  minHeight: "calc(100vh - 44px)"
};

const eyebrow = {
  display: "inline-block",
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 800,
  padding: "6px 12px",
  borderRadius: 999,
  fontSize: 12,
  letterSpacing: ".02em",
  textTransform: "uppercase"
};

const pageTitle = {
  margin: "14px 0 10px",
  fontSize: 36,
  lineHeight: 1.05,
  color: "#0f172a"
};

const pageSubtitle = {
  margin: 0,
  color: "#64748b",
  fontSize: 15,
  maxWidth: 980,
  lineHeight: 1.65
};
