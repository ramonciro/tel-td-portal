
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PortalShell({ title, subtitle, children }) {
  const pathname = usePathname();

  const menu = [
    { label: "Início", icon: "🏠", href: "/inicio" },
    { label: "Turmas", icon: "👥", href: "/turmas" },
    { label: "Avaliações", icon: "⭐", href: "/avaliacoes" },
    { label: "Biblioteca", icon: "📚", href: "/biblioteca" },
    { label: "Trilhas", icon: "🧭", href: "/trilhas" },
    { label: "Mapa de desenvolvimento", icon: "📈", href: "/mapa-desenvolvimento" },
  ];

  const user = typeof window !== "undefined"
    ? JSON.parse(localStorage.getItem("user") || "{}")
    : {};

  return (
    <div style={wrap}>
      <aside style={sidebar}>

        {/* LOGO */}
        <div style={logoWrap}>
          <div style={logoBox}>
            <img src="/logo-td.png" alt="Portal T&D" style={logoImg} />
          </div>

          <div>
            <div style={logoTitle}>Portal T&D</div>
            <div style={logoSub}>Treinamento & Desenvolvimento</div>
          </div>
        </div>

        {/* PERFIL */}
        <div style={profileBox}>
          <div style={profileBadge}>Perfil em uso</div>
          <div style={profileName}>{user?.nome || "Usuário"}</div>
          <div style={profileRole}>{user?.perfil || ""}</div>
        </div>

        {/* MENU */}
        <nav style={menuWrap}>
          {menu.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} style={{
                ...menuItem,
                ...(active ? menuItemActive : {})
              }}>
                <span style={menuIcon}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* AÇÕES */}
        <div style={footer}>
          <Link href="/alterar-senha" style={actionButton}>
            ⚙ Alterar senha
          </Link>

          <button
            style={logoutButton}
            onClick={() => {
              localStorage.removeItem("token");
              localStorage.removeItem("user");
              window.location.href = "/login";
            }}
          >
            🚪 Sair
          </button>
        </div>

      </aside>

      <main style={content}>
        {title && <h1 style={pageTitle}>{title}</h1>}
        {subtitle && <p style={pageSubtitle}>{subtitle}</p>}
        {children}
      </main>
    </div>
  );
}

/* LAYOUT */

const wrap = {
  display: "flex",
  minHeight: "100vh",
  background: "#f1f5f9"
};

const sidebar = {
  width: 270,
  background: "#1e3a8a",
  color: "#fff",
  paddingTop: 10,
  display: "flex",
  flexDirection: "column"
};

const content = {
  flex: 1,
  padding: 28
};

/* LOGO */

const logoWrap = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "16px"
};

const logoBox = {
  background: "#fff",
  borderRadius: 12,
  padding: 6
};

const logoImg = {
  width: 48,
  height: 48
};

const logoTitle = {
  fontWeight: 800,
  fontSize: 18
};

const logoSub = {
  fontSize: 12,
  opacity: 0.8
};

/* PERFIL */

const profileBox = {
  background: "rgba(255,255,255,0.08)",
  borderRadius: 14,
  margin: "12px",
  padding: "12px"
};

const profileBadge = {
  fontSize: 10,
  textTransform: "uppercase",
  opacity: 0.7
};

const profileName = {
  fontWeight: 700,
  marginTop: 4
};

const profileRole = {
  fontSize: 12,
  opacity: 0.8
};

/* MENU */

const menuWrap = {
  display: "flex",
  flexDirection: "column",
  padding: "8px"
};

const menuItem = {
  padding: "10px 14px",
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "#fff",
  textDecoration: "none",
  marginBottom: 6
};

const menuItemActive = {
  background: "rgba(255,255,255,0.18)"
};

const menuIcon = {
  width: 20
};

/* FOOTER */

const footer = {
  marginTop: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8
};

const actionButton = {
  background: "rgba(255,255,255,0.1)",
  padding: 10,
  borderRadius: 10,
  textDecoration: "none",
  color: "#fff",
  textAlign: "center"
};

const logoutButton = {
  background: "#e5e7eb",
  border: 0,
  borderRadius: 10,
  padding: 10,
  fontWeight: 600,
  cursor: "pointer"
};

/* PAGE */

const pageTitle = {
  fontSize: 28,
  fontWeight: 800,
  marginBottom: 6
};

const pageSubtitle = {
  color: "#64748b",
  marginBottom: 18
};
