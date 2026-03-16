"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { href: "/inicio", label: "Início", icon: "🏠" },
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/usuarios", label: "Usuários", icon: "👤" },
  { href: "/clientes", label: "Clientes", icon: "🏢" },
  { href: "/treinamentos", label: "Treinamentos", icon: "🎓" },
  { href: "/presencas", label: "Gestão de Turmas", icon: "👥" },
  { href: "/avaliacoes", label: "Avaliações", icon: "⭐" },
  { href: "/biblioteca", label: "Biblioteca", icon: "📚" },
  { href: "/trilhas", label: "Trilhas", icon: "🧭" },
  { href: "/mapa-desenvolvimento", label: "Mapa de desenvolvimento", icon: "🗺️" },
];

export default function PortalShell({ title, subtitle, children }) {
  const pathname = usePathname();

  return (
    <div style={layout}>
      <aside style={sidebar}>
        <div style={brandBox}>
          <img
            src="/logo-td.png"
            alt="Portal T&D"
            style={logo}
          />
          <div>
            <div style={brandTitle}>Portal T&amp;D</div>
            <div style={brandSubtitle}>Treinamento e Desenvolvimento</div>
          </div>
        </div>

        <nav style={nav}>
          {menuItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  ...navItem,
                  ...(active ? navItemActive : {}),
                }}
              >
                <span style={navIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <main style={main}>
        <header style={header}>
          <h1 style={titleStyle}>{title}</h1>
          {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
        </header>

        <section style={content}>{children}</section>
      </main>
    </div>
  );
}

const layout = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "280px 1fr",
  background: "#f8fafc",
};

const sidebar = {
  background: "linear-gradient(180deg, #0f172a 0%, #1d4ed8 100%)",
  color: "#fff",
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const brandBox = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "8px 4px 18px",
};

const logo = {
  width: 56,
  height: 56,
  objectFit: "contain",
  background: "#fff",
  borderRadius: 8,
  padding: 6,
};

const brandTitle = {
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1.1,
};

const brandSubtitle = {
  fontSize: 13,
  opacity: 0.8,
  marginTop: 3,
};

const nav = {
  display: "grid",
  gap: 8,
};

const navItem = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "14px 16px",
  borderRadius: 14,
  color: "#fff",
  textDecoration: "none",
  fontWeight: 700,
  background: "transparent",
};

const navItemActive = {
  background: "rgba(255,255,255,.16)",
};

const navIcon = {
  width: 22,
  textAlign: "center",
};

const main = {
  padding: 24,
};

const header = {
  marginBottom: 18,
};

const titleStyle = {
  margin: 0,
  fontSize: 34,
  color: "#0f172a",
};

const subtitleStyle = {
  margin: "8px 0 0",
  color: "#64748b",
  fontSize: 18,
};

const content = {
  display: "grid",
  gap: 16,
};
