"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { clearSession, getStoredUser, hasSomeRole } from "../services/api";

const menuItems = [
  { href: "/inicio", label: "Início", icon: "🏠", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
  { href: "/dashboard", label: "Dashboard", icon: "📊", roles: ["coordenador", "supervisor"] },
  { href: "/usuarios", label: "Usuários", icon: "👤", roles: ["coordenador"] },
  { href: "/clientes", label: "Clientes", icon: "🏢", roles: ["coordenador", "supervisor"] },
  { href: "/treinamentos", label: "Treinamentos", icon: "🎓", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/presencas", label: "Gestão de Turmas", icon: "👥", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/avaliacoes", label: "Avaliações", icon: "⭐", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/responder-avaliacao", label: "Responder Avaliação", icon: "📝", roles: ["treinando", "instrutor", "supervisor", "coordenador"] },
  { href: "/resultados-avaliacoes", label: "Resultados das Avaliações", icon: "📈", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/nps", label: "NPS", icon: "💬", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/biblioteca", label: "Biblioteca", icon: "📚", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
  { href: "/trilhas", label: "Trilhas", icon: "🧭", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
  { href: "/mapa-desenvolvimento", label: "Mapa de Desenvolvimento", icon: "🗺️", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
];

function isRouteActive(pathname, href) {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export default function PortalShell({
  title,
  subtitle,
  children,
  topRight,
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth <= 900;
      setIsMobile(mobile);

      if (!mobile) {
        setMobileMenuOpen(false);
      }
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const allowedMenuItems = useMemo(() => {
    if (!user) return [];
    return menuItems.filter((item) => hasSomeRole(user, item.roles));
  }, [user]);

  const currentItem = useMemo(() => {
    return menuItems.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
    );
  }, [pathname]);

  const currentAllowed = useMemo(() => {
    if (!currentItem) return true;
    if (!user) return false;
    return hasSomeRole(user, currentItem.roles);
  }, [currentItem, user]);

  function handleLogout() {
    clearSession();
    router.push("/login");
  }

  const shellStyle = useMemo(
    () => ({
      minHeight: "100vh",
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "268px minmax(0, 1fr)",
      background:
        "radial-gradient(circle at top right, rgba(59,130,246,0.08), transparent 28%), linear-gradient(180deg, #f8fbff 0%, #f8fafc 100%)",
    }),
    [isMobile]
  );

  if (user === undefined) {
    return null;
  }

  if (!user) {
    return null;
  }

  if (!currentAllowed) {
    return (
      <div style={{ padding: 24 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 20,
            padding: 24,
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              display: "inline-block",
              background: "#fef2f2",
              color: "#b91c1c",
              padding: "6px 12px",
              borderRadius: 999,
              fontWeight: 700,
              marginBottom: 16,
            }}
          >
            Acesso restrito
          </div>
          <h2 style={{ marginTop: 0 }}>Você não tem permissão para acessar esta área.</h2>
          <p style={{ color: "#64748b" }}>
            Fale com o coordenador para revisar seu perfil de acesso.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      {isMobile ? (
        <>
          <header style={mobileTopbar}>
            <div style={mobileBrandWrap}>
              <img src="/logo-td.png" alt="Portal T&D" style={mobileLogo} />
              <div style={{ minWidth: 0 }}>
                <div style={mobileBrandTitle}>Portal T&amp;D</div>
                <div style={mobileBrandSubtitle}>Treinamento e Desenvolvimento</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              style={mobileMenuButton}
            >
              {mobileMenuOpen ? "Fechar" : "Menu"}
            </button>
          </header>

          {mobileMenuOpen ? (
            <div style={mobileDrawer}>
              <nav style={mobileNav}>
                {allowedMenuItems.map((item) => {
                  const active = isRouteActive(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        ...mobileNavItem,
                        ...(active ? mobileNavItemActive : {}),
                      }}
                    >
                      <span style={mobileNavIcon}>{item.icon}</span>
                      <span style={mobileNavLabel}>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div style={mobileFooterBlock}>
                <div style={mobileEnvCard}>
                  <span style={envLabel}>Ambiente</span>
                  <strong style={envValue}>Gestão Executiva de T&amp;D</strong>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  style={logoutButtonMobile}
                >
                  Sair do portal
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <aside style={sidebar}>
          <div style={brandBox}>
            <img src="/logo-td.png" alt="Portal T&D" style={logo} />

            <div style={{ minWidth: 0 }}>
              <div style={brandTitle}>Portal T&amp;D</div>
              <div style={brandSubtitle}>Treinamento e Desenvolvimento</div>
            </div>
          </div>

          <nav style={nav}>
            {allowedMenuItems.map((item) => {
              const active = isRouteActive(pathname, item.href);

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
                  <span style={navLabel}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div style={sidebarFooter}>
            <div style={envCard}>
              <span style={envLabel}>Ambiente</span>
              <strong style={envValue}>Gestão Executiva de T&amp;D</strong>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              style={logoutButton}
            >
              Sair do portal
            </button>
          </div>
        </aside>
      )}

      <main style={main}>
        <header style={header}>
          <div style={{ minWidth: 0 }}>
            <h1 style={titleStyle}>{title}</h1>
            {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
          </div>

          {topRight ? <div style={headerAction}>{topRight}</div> : null}
        </header>

        <section style={content}>{children}</section>
      </main>
    </div>
  );
}

const sidebar = {
  position: "sticky",
  top: 0,
  height: "100vh",
  overflowY: "auto",
  overflowX: "hidden",
  scrollbarWidth: "thin",
  background: "linear-gradient(180deg, #0f172a 0%, #1e3a8a 100%)",
  color: "#ffffff",
  padding: "18px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  borderRight: "1px solid rgba(255,255,255,0.08)",
};

const brandBox = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "4px 6px 10px",
};

const logo = {
  width: 58,
  height: 58,
  objectFit: "contain",
  background: "#ffffff",
  borderRadius: 14,
  padding: 7,
  flexShrink: 0,
  boxShadow: "0 8px 24px rgba(15,23,42,0.18)",
};

const brandTitle = {
  margin: 0,
  fontSize: 17,
  fontWeight: 800,
  lineHeight: 1.1,
  color: "#ffffff",
};

const brandSubtitle = {
  marginTop: 5,
  fontSize: 12,
  lineHeight: 1.35,
  color: "rgba(255,255,255,0.82)",
};

const nav = {
  display: "grid",
  gap: 4,
};

const navItem = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minHeight: 42,
  padding: "9px 12px",
  borderRadius: 12,
  textDecoration: "none",
  color: "#E2E8F0",
  background: "transparent",
  fontWeight: 700,
  fontSize: 14,
  lineHeight: 1.2,
  border: "1px solid transparent",
  boxSizing: "border-box",
};

const navItemActive = {
  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
  color: "#ffffff",
  boxShadow: "0 8px 18px rgba(0,0,0,0.22)",
  border: "1px solid rgba(255,255,255,0.14)",
};

const navIcon = {
  width: 20,
  minWidth: 20,
  textAlign: "center",
  fontSize: 16,
  lineHeight: 1,
  color: "inherit",
  textDecoration: "none",
};

const navLabel = {
  color: "inherit",
  textDecoration: "none",
  display: "block",
};

const sidebarFooter = {
  marginTop: "auto",
  display: "grid",
  gap: 10,
  paddingTop: 8,
};

const envCard = {
  display: "grid",
  gap: 4,
  padding: 14,
  borderRadius: 16,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const envLabel = {
  fontSize: 12,
  color: "rgba(255,255,255,0.76)",
};

const envValue = {
  fontSize: 14,
  lineHeight: 1.35,
  color: "#ffffff",
};

const logoutButton = {
  width: "100%",
  minHeight: 44,
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 800,
  boxShadow: "0 10px 24px rgba(15,23,42,0.16)",
};

const main = {
  minWidth: 0,
  padding: 24,
};

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
  flexWrap: "wrap",
};

const titleStyle = {
  margin: 0,
  fontSize: 30,
  lineHeight: 1.1,
  color: "#0f172a",
  fontWeight: 800,
  letterSpacing: "-0.02em",
};

const subtitleStyle = {
  margin: "8px 0 0",
  color: "#64748b",
  fontSize: 15,
  lineHeight: 1.5,
  maxWidth: 900,
};

const headerAction = {
  flexShrink: 0,
};

const content = {
  display: "grid",
  gap: 16,
  minWidth: 0,
};

const mobileTopbar = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
  background: "linear-gradient(180deg, #0f172a 0%, #1e3a8a 100%)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const mobileBrandWrap = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const mobileLogo = {
  width: 46,
  height: 46,
  objectFit: "contain",
  background: "#ffffff",
  borderRadius: 12,
  padding: 6,
  flexShrink: 0,
};

const mobileBrandTitle = {
  fontSize: 16,
  fontWeight: 800,
  lineHeight: 1.1,
  color: "#ffffff",
};

const mobileBrandSubtitle = {
  marginTop: 3,
  fontSize: 11,
  lineHeight: 1.3,
  color: "rgba(255,255,255,0.82)",
};

const mobileMenuButton = {
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.10)",
  color: "#ffffff",
  borderRadius: 10,
  minHeight: 38,
  padding: "0 14px",
  fontWeight: 700,
  cursor: "pointer",
  flexShrink: 0,
};

const mobileDrawer = {
  background: "linear-gradient(180deg, #0f172a 0%, #1e3a8a 100%)",
  padding: "10px 14px 16px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const mobileNav = {
  display: "grid",
  gap: 6,
};

const mobileNavItem = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minHeight: 44,
  padding: "10px 12px",
  borderRadius: 12,
  textDecoration: "none",
  color: "#E2E8F0",
  background: "transparent",
  fontWeight: 700,
  fontSize: 14,
  border: "1px solid transparent",
  boxSizing: "border-box",
};

const mobileNavItemActive = {
  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
  color: "#ffffff",
  border: "1px solid rgba(255,255,255,0.14)",
};

const mobileNavIcon = {
  width: 20,
  minWidth: 20,
  textAlign: "center",
  fontSize: 16,
  lineHeight: 1,
  color: "inherit",
  textDecoration: "none",
};

const mobileNavLabel = {
  color: "inherit",
  textDecoration: "none",
  display: "block",
};

const mobileFooterBlock = {
  display: "grid",
  gap: 10,
  marginTop: 12,
};

const mobileEnvCard = {
  display: "grid",
  gap: 4,
  padding: 14,
  borderRadius: 16,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const logoutButtonMobile = {
  width: "100%",
  minHeight: 44,
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 800,
};
