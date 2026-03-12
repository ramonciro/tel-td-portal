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
      <div style={brandMini}>TEL CENTRO DE CONTATOS</div>
      <h1 style={brandTitle}>Tel T&D</h1>
      <p style={brandText}>Portal de Treinamento e Desenvolvimento</p>
    </div>

    <nav style={navStyle}>
      {menuItems.map((item) => {
        const active = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              ...navItem,
              ...(active ? navItemActive : {})
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>

  </aside>

  <main style={mainStyle}>

    <div style={headerCard}>
      <h1 style={pageTitle}>{title}</h1>
      {subtitle && <p style={pageSubtitle}>{subtitle}</p>}
    </div>

    {children}

  </main>
</div>

);
}

const layoutStyle = {
minHeight: "100vh",
display: "grid",
gridTemplateColumns: "300px 1fr",
background: "#f1f5f9",
fontFamily: "Inter, system-ui, Arial, sans-serif"
};

const sidebarStyle = {
background: "linear-gradient(180deg,#0f172a,#1e3a8a)",
color: "#fff",
padding: "28px",
display: "flex",
flexDirection: "column",
gap: 28
};

const brandMini = {
fontSize: 11,
letterSpacing: "0.15em",
opacity: 0.7
};

const brandTitle = {
margin: "6px 0",
fontSize: 26
};

const brandText = {
fontSize: 14,
opacity: 0.8,
lineHeight: 1.4
};

const navStyle = {
display: "grid",
gap: 8
};

const navItem = {
padding: "12px 16px",
borderRadius: 10,
textDecoration: "none",
color: "#fff",
fontSize: 15,
fontWeight: 500
};

const navItemActive = {
background: "linear-gradient(90deg,#3b82f6,#2563eb)",
boxShadow: "0 6px 14px rgba(0,0,0,0.2)"
};

const mainStyle = {
padding: 28
};

const headerCard = {
background: "#fff",
borderRadius: 14,
padding: 22,
marginBottom: 20,
boxShadow: "0 1px 4px rgba(0,0,0,0.08)"
};

const pageTitle = {
margin: 0,
fontSize: 28,
color: "#334155"
};

const pageSubtitle = {
marginTop: 6,
fontSize: 15,
color: "#64748b"
};
const pageSubtitleStyle = {
  margin: "10px 0 0",
  fontSize: 15,
  color: "#64748b"
};
