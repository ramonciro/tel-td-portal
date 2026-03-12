"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const menuBase = [
  { label: "Início", href: "/inicio", roles: ["admin", "coordenador", "supervisor", "instrutor"] },
  { label: "Clientes", href: "/clientes", roles: ["admin", "coordenador"] },
  { label: "Usuários", href: "/usuarios", roles: ["admin", "coordenador", "supervisor"] },
  { label: "Treinamentos", href: "/treinamentos", roles: ["admin", "coordenador", "supervisor", "instrutor"] },
  { label: "Presenças", href: "/presencas", roles: ["admin", "coordenador", "supervisor", "instrutor"] },
  { label: "Avaliações", href: "/avaliacoes", roles: ["admin", "coordenador", "supervisor", "instrutor"] },
  { label: "Biblioteca", href: "/biblioteca", roles: ["admin", "coordenador", "supervisor", "instrutor"] },
  { label: "Trilhas", href: "/trilhas", roles: ["admin", "coordenador", "supervisor", "instrutor"] }
];

export default function PortalShell({ title, subtitle, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) setUser(JSON.parse(raw));
    } catch {}
  }, []);

  const perfil = String(user?.perfil || "").toLowerCase();

  const menuItems = useMemo(() => {
    if (!perfil) return [];
    return menuBase.filter((item) => item.roles.includes(perfil));
  }, [perfil]);

  function sair() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  }

  return (
    <div style={layoutStyle}>
      <aside style={sidebarStyle}>
        <div>
          <div style={brandMini}>TEL CENTRO DE CONTATOS</div>
          <h1 style={brandTitle}>Tel T&amp;D</h1>
          <p style={brandText}>Portal de Treinamento e Desenvolvimento</p>
        </div>

        <div style={profileBox}>
          <div style={profileName}>{user?.nome || "Usuário"}</div>
          <div style={profileRole}>{user?.perfil || "Perfil não definido"}</div>
          <div style={profileEmail}>{user?.email || ""}</div>
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

        <button onClick={sair} style={logoutBtn}>Sair</button>
      </aside>

      <main style={mainStyle}>
        <div style={headerCard}>
          <h1 style={pageTitle}>{title}</h1>
          {subtitle ? <p style={pageSubtitle}>{subtitle}</p> : null}
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
  gap: 24
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

const profileBox = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 14,
  padding: 14
};

const profileName = {
  fontWeight: 700,
  fontSize: 15
};

const profileRole = {
  marginTop: 4,
  fontSize: 13,
  opacity: 0.85,
  textTransform: "capitalize"
};

const profileEmail = {
  marginTop: 4,
  fontSize: 12,
  opacity: 0.75,
  wordBreak: "break-word"
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

const logoutBtn = {
  marginTop: "auto",
  background: "rgba(255,255,255,0.12)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10,
  padding: "12px 16px",
  cursor: "pointer",
  fontSize: 14
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
