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
  { href: "/mapa-desenvolvimento", label: "Mapa de desenvolvimento" },
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
    <div style={shell}>
      <aside style={sidebar}>
        <div style={sidebarInner}>
          <div>
            <div style={brandBlock}>
              <div style={brandTitle}>Tel T&amp;D</div>
              <div style={brandText}>
                Portal de Treinamento e Desenvolvimento com foco em gestão,
                acompanhamento e resultados.
              </div>
            </div>

            <div style={profileCard}>
              <div style={profileLabel}>Perfil em uso</div>
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
  width: 232,
  minWidth: 232,
  maxWidth: 232,
  background: "linear-gradient(180deg, #0f172a 0%, #1e3a8a 100%)",
  color: "#ffffff",
  height: "100vh",
  position: "sticky",
  top: 0,
  overflow: "hidden",
  borderRight: "1px solid rgba(255,255,255,.06)",
};

const sidebarInner = {
  height: "100%",
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  gap: 14,
  padding: 16,
  boxSizing: "border-box",
};

const brandBlock = {
  marginBottom: 10,
};

const brandTitle = {
  fontSize: 28,
  fontWeight: 900,
  letterSpacing: "-0.03em",
};

const brandText = {
  marginTop: 6,
  fontSize: 12,
  lineHeight: 1.5,
  color: "rgba(255,255,255,.74)",
};

const profileCard = {
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 16,
  padding: 12,
};

const profileLabel = {
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
  color: "rgba(255,255,255,.78)",
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
  padding: "10px 12px",
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 600,
  border: "1px solid transparent",
  transition: "all .2s ease",
};

const navItemActive = {
  background: "rgba(255,255,255,.14)",
  border: "1px solid rgba(255,255,255,.16)",
  fontWeight: 800,
};

const bottomActions = {
  display: "grid",
  gap: 8,
  paddingTop: 6,
};

const secondaryAction = {
  textDecoration: "none",
  textAlign: "center",
  border: "1px solid rgba(255,255,255,.16)",
  background: "rgba(255,255,255,.08)",
  color: "#ffffff",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 700,
  fontSize: 14,
};

const primaryAction = {
  width: "100%",
  border: "1px solid rgba(255,255,255,.14)",
  background: "#ffffff",
  color: "#1e3a8a",
  borderRadius: 12,
  padding: "10px 12px",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
};

const main = {
  flex: 1,
  minWidth: 0,
  padding: 18,
  boxSizing: "border-box",
};

const contentCard = {
  background: "rgba(255,255,255,.88)",
  backdropFilter: "blur(10px)",
  borderRadius: 22,
  padding: 20,
  border: "1px solid #dbeafe",
  boxShadow: "0 14px 32px rgba(15, 23, 42, 0.06)",
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
  padding: "5px 10px",
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
