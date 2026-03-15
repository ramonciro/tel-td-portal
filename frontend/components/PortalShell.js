 "use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getStoredUser, hasSomeRole } from "../services/api";

const allMenu = [
  { href: "/inicio", label: "Início", icon: "🏠" },
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/usuarios", label: "Usuários", restricted: true, icon: "👥" },
  { href: "/clientes", label: "Clientes", restricted: true, icon: "🏢" },
  { href: "/treinamentos", label: "Treinamentos", icon: "🎓" },
  { href: "/presencas", label: "Turmas", icon: "👨‍🏫" },
  { href: "/avaliacoes", label: "Avaliações", icon: "⭐" },
  { href: "/biblioteca", label: "Biblioteca", icon: "📚" },
  { href: "/trilhas", label: "Trilhas", icon: "🧭" },
  { href: "/mapa-desenvolvimento", label: "Mapa de desenvolvimento", icon: "📈" },
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
              <div style={logoWrap}>
                <div style={logoBox}>
                  <Image
                    src="/logo-td.png"
                    alt="Portal T&D"
                    width={56}
                    height={56}
                    style={logoImg}
                    priority
                  />
                </div>

                <div>
                  <div style={brandTitle}>Portal T&amp;D</div>
                  <div style={brandText}>
                    Treinamento &amp; Desenvolvimento
                  </div>
                </div>
              </div>
            </div>

            <div style={profileCard}>
              <div style={profileLabel}>Perfil em uso</div>
              <div style={profileName}>{user?.nome || "Usuário"}</div>
              <div style={profileRole}>
                {(user?.perfil || "perfil não identificado")
                  .toString()
                  .replaceAll("_", " ")
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
                    <span>{item.label}</span>
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
  width: 248,
  minWidth: 248,
  maxWidth: 248,
  background: "linear-gradient(180deg, #10214d 0%, #1e3a8a 100%)",
  color: "#ffffff",
  height: "100vh",
  position: "sticky",
  top: 0,
  overflow: "hidden",
  borderRight: "1px solid rgba(255,255,255,.08)",
};

const sidebarInner = {
  height: "100%",
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  gap: 14,
  padding: 14,
  boxSizing: "border-box",
};

const brandBlock = {
  marginBottom: 10,
};

const logoWrap = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const logoBox = {
  width: 68,
  height: 68,
  minWidth: 68,
  borderRadius: 16,
  background: "#ffffff",
  border: "1px solid rgba(255,255,255,.14)",
  boxShadow: "0 10px 24px rgba(15,23,42,.18)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  padding: 6,
  boxSizing: "border-box",
};

const logoImg = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
};

const brandTitle = {
  fontSize: 20,
  fontWeight: 900,
  letterSpacing: "-0.03em",
  lineHeight: 1.05,
};

const brandText = {
  marginTop: 6,
  fontSize: 12,
  lineHeight: 1.45,
  color: "rgba(255,255,255,.80)",
};

const profileCard = {
  background: "rgba(255,255,255,.10)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 18,
  padding: 12,
};

const profileLabel = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  color: "rgba(255,255,255,.68)",
};

const profileName = {
  marginTop: 8,
  fontWeight: 800,
  fontSize: 16,
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
  paddingRight: 2,
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
  fontSize: 15,
  fontWeight: 700,
  border: "1px solid transparent",
  transition: "all .2s ease",
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const navItemActive = {
  background: "rgba(255,255,255,.14)",
  border: "1px solid rgba(255,255,255,.18)",
  fontWeight: 800,
};

const navIcon = {
  width: 18,
  textAlign: "center",
  opacity: 0.95,
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
  borderRadius: 14,
  padding: "11px 12px",
  fontWeight: 700,
  fontSize: 14,
};

const primaryAction = {
  width: "100%",
  border: "1px solid rgba(255,255,255,.12)",
  background: "#ffffff",
  color: "#1e3a8a",
  borderRadius: 14,
  padding: "11px 12px",
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
