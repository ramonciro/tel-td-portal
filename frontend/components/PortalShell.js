"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getStoredUser, hasSomeRole } from "../services/api";

const allMenu = [
  {
    href: "/inicio",
    label: "Início",
    icon: "🏠",
    roles: ["admin", "coordenador", "supervisor", "instrutor", "treinando"],
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "📊",
    roles: ["admin", "coordenador", "supervisor"],
  },
  {
    href: "/usuarios",
    label: "Usuários",
    icon: "👤",
    roles: ["admin", "coordenador"],
  },
  {
    href: "/clientes",
    label: "Clientes",
    icon: "🏢",
    roles: ["admin", "coordenador", "supervisor"],
  },
  {
    href: "/treinamentos",
    label: "Treinamentos",
    icon: "🎓",
    roles: ["admin", "coordenador", "supervisor", "instrutor"],
  },
  {
    href: "/presencas",
    label: "Turmas",
    icon: "👥",
    roles: ["admin", "coordenador", "supervisor", "instrutor"],
  },
  {
    href: "/avaliacoes",
    label: "Avaliações",
    icon: "⭐",
    roles: ["admin", "coordenador", "supervisor", "instrutor"],
  },
  {
    href: "/biblioteca",
    label: "Biblioteca",
    icon: "📚",
    roles: ["admin", "coordenador", "supervisor", "instrutor", "treinando"],
  },
  {
    href: "/trilhas",
    label: "Trilhas",
    icon: "🧭",
    roles: ["admin", "coordenador", "supervisor", "instrutor", "treinando"],
  },
  {
    href: "/mapa-desenvolvimento",
    label: "Mapa de desenvolvimento",
    icon: "🗺️",
    roles: ["admin", "coordenador", "supervisor"],
  },
];

export default function PortalShell({ title, subtitle, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const menu = useMemo(() => {
    return allMenu.filter((item) => hasSomeRole(user, item.roles));
  }, [user]);

  function sair() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
    router.push("/login");
  }

  return (
    <div style={shell}>
      <aside style={sidebar}>
        <div style={sidebarInner}>
          <div>
            <div style={brandWrap}>
              <div style={logoBox}>
                <img src="/logo-td.png" alt="Portal T&D" style={logoImg} />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={brandTitle}>Portal T&amp;D</div>
                <div style={brandSub}>Treinamento &amp; Desenvolvimento</div>
              </div>
            </div>

            <div style={profileCard}>
              <div style={profileBadge}>Perfil em uso</div>
              <div style={profileName}>{user?.nome || "Usuário"}</div>
              <div style={profileRole}>
                {(user?.perfil || "perfil não identificado")
                  .toString()
                  .toUpperCase()}
              </div>
            </div>
          </div>

          <div style={menuArea}>
            <nav style={nav}>
              {menu.map((item) => {
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      ...navItem,
                      ...(active ? navItemActive : null),
                    }}
                  >
                    <span style={navIcon}>{item.icon}</span>
                    <span style={navLabel}>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div style={bottomActions}>
            <Link href="/alterar-senha" style={secondaryAction}>
              <span style={actionIcon}>⚙️</span>
              <span>Alterar senha</span>
            </Link>

            <button onClick={sair} style={primaryAction}>
              <span style={actionIcon}>🚪</span>
              <span>Sair</span>
            </button>
          </div>
        </div>
      </aside>

      <main style={main}>
        <div style={contentCard}>
          <div style={headerBlock}>
            <div style={headerBadge}>Portal T&amp;D</div>
            <h1 style={pageTitle}>{title}</h1>
            {subtitle ? <p style={pageSubtitle}>{subtitle}</p> : null}
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}

const shell = {
  minHeight: "100vh",
  display: "flex",
  background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)",
};

const sidebar = {
  width: 258,
  minWidth: 258,
  maxWidth: 258,
  background: "linear-gradient(180deg, #0f172a 0%, #1e3a8a 100%)",
  color: "#ffffff",
  height: "100vh",
  position: "sticky",
  top: 0,
  overflow: "hidden",
  borderRight: "1px solid rgba(255,255,255,.06)",
  boxShadow: "8px 0 30px rgba(15,23,42,.12)",
};

const sidebarInner = {
  height: "100%",
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  gap: 16,
  padding: 16,
  boxSizing: "border-box",
};

const brandWrap = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  marginBottom: 14,
};

const logoBox = {
  width: 68,
  height: 68,
  minWidth: 68,
  borderRadius: 18,
  background: "rgba(255,255,255,.98)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 10px 24px rgba(15,23,42,.18)",
  padding: 8,
  boxSizing: "border-box",
};

const logoImg = {
  width: 52,
  height: 52,
  objectFit: "contain",
};

const brandTitle = {
  fontSize: 20,
  fontWeight: 900,
  letterSpacing: "-0.03em",
  lineHeight: 1.05,
};

const brandSub = {
  marginTop: 4,
  fontSize: 12,
  lineHeight: 1.4,
  color: "rgba(255,255,255,.78)",
};

const profileCard = {
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 16,
  padding: 12,
};

const profileBadge = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  color: "rgba(255,255,255,.62)",
};

const profileName = {
  marginTop: 8,
  fontWeight: 800,
  fontSize: 15,
  lineHeight: 1.2,
};

const profileRole = {
  marginTop: 4,
  fontSize: 12,
  color: "rgba(255,255,255,.82)",
};

const menuArea = {
  minHeight: 0,
  overflowY: "auto",
  paddingRight: 4,
};

const nav = {
  display: "grid",
  gap: 6,
};

const navItem = {
  textDecoration: "none",
  color: "#ffffff",
  padding: "11px 12px",
  borderRadius: 14,
  fontSize: 14,
  fontWeight: 600,
  border: "1px solid transparent",
  transition: "all .2s ease",
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const navItemActive = {
  background: "rgba(255,255,255,.16)",
  border: "1px solid rgba(255,255,255,.18)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
};

const navIcon = {
  width: 22,
  minWidth: 22,
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  fontSize: 16,
};

const navLabel = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const bottomActions = {
  display: "grid",
  gap: 8,
  paddingTop: 4,
};

const secondaryAction = {
  textDecoration: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  border: "1px solid rgba(255,255,255,.16)",
  background: "rgba(255,255,255,.08)",
  color: "#ffffff",
  borderRadius: 12,
  padding: "11px 12px",
  fontWeight: 700,
  fontSize: 14,
};

const primaryAction = {
  width: "100%",
  border: "1px solid rgba(255,255,255,.14)",
  background: "#ffffff",
  color: "#1e3a8a",
  borderRadius: 12,
  padding: "11px 12px",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const actionIcon = {
  fontSize: 15,
  lineHeight: 1,
};

const main = {
  flex: 1,
  minWidth: 0,
  padding: 18,
  boxSizing: "border-box",
};

const contentCard = {
  background: "rgba(255,255,255,.9)",
  backdropFilter: "blur(10px)",
  borderRadius: 24,
  padding: 22,
  border: "1px solid #dbeafe",
  boxShadow: "0 16px 34px rgba(15,23,42,.06)",
  minHeight: "calc(100vh - 36px)",
  boxSizing: "border-box",
};

const headerBlock = {
  marginBottom: 18,
};

const headerBadge = {
  display: "inline-block",
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 800,
  padding: "6px 11px",
  borderRadius: 999,
  fontSize: 11,
  letterSpacing: ".03em",
  textTransform: "uppercase",
};

const pageTitle = {
  margin: "12px 0 8px",
  fontSize: 34,
  lineHeight: 1.05,
  color: "#0f172a",
};

const pageSubtitle = {
  margin: 0,
  color: "#64748b",
  fontSize: 15,
  maxWidth: 980,
  lineHeight: 1.55,
};
