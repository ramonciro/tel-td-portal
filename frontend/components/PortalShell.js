"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { label: "Início", href: "/inicio" },
  { label: "Clientes", href: "/clientes" },
  { label: "Usuários", href: "/usuarios" },
  { label: "Treinamentos", href: "/treinamentos" },
  { label: "Presenças", href: "/presencas" },
  { label: "Avaliações", href: "/avaliacoes" },
  { label: "Biblioteca", href: "/biblioteca" },
  { label: "Trilhas", href: "/trilhas" }
];

export default function PortalShell({ title, subtitle, children }) {
  const pathname = usePathname();

  return (
    <div style={layoutStyle}>
      <aside style={sidebarStyle}>
        <div>
          <div style={brandMiniStyle}>TEL CENTRO DE CONTATOS</div>
          <h1 style={brandTitleStyle}>Tel T&amp;D</h1>
          <p style={brandTextStyle}>Portal de Treinamento e Desenvolvimento</p>
        </div>

        <nav style={navStyle}>
          {menuItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  ...navItemStyle,
                  ...(active ? navItemActiveStyle : {})
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main style={mainStyle}>
        <div style={headerCardStyle}>
          <h1 style={pageTitleStyle}>{title}</h1>
          {subtitle ? <p style={pageSubtitleStyle}>{subtitle}</p> : null}
        </div>

        {children}
      </main>
    </div>
  );
}

const layoutStyle = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "340px 1fr",
  background: "#f8fafc"
};

const sidebarStyle = {
  background: "linear-gradient(180deg, #0b1020 0%, #172554 100%)",
  color: "#fff",
  padding: "32px 28px",
  display: "flex",
  flexDirection: "column",
  gap: 28
};

const brandMiniStyle = {
  fontSize: 12,
  letterSpacing: "0.18em",
  opacity: 0.75,
  marginBottom: 10
};

const brandTitleStyle = {
  fontSize: 28,
  margin: 0
};

const brandTextStyle = {
  marginTop: 12,
  color: "rgba(255,255,255,0.82)",
  lineHeight: 1.35
};

const navStyle = {
  display: "grid",
  gap: 10
};

const navItemStyle = {
  display: "block",
  padding: "16px 18px",
  borderRadius: 16,
  color: "#fff",
  textDecoration: "none",
  fontSize: 18,
  fontWeight: 600,
  background: "transparent"
};

const navItemActiveStyle = {
  background: "linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)",
  boxShadow: "0 10px 24px rgba(37,99,235,0.28)"
};

const mainStyle = {
  padding: 28
};

const headerCardStyle = {
  background: "#fff",
  borderRadius: 20,
  padding: 28,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  marginBottom: 20
};

const pageTitleStyle = {
  margin: 0,
  fontSize: 34,
  color: "#334155"
};

const pageSubtitleStyle = {
  margin: "10px 0 0",
  fontSize: 16,
  color: "#64748b"
};
