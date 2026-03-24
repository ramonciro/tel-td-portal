"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { clearSession, getStoredUser, hasSomeRole } from "../services/api";

const menuItems = [
  { href: "/inicio", label: "Início", icon: "🏠", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
  { href: "/dashboard", label: "Dashboard", icon: "📊", roles: ["coordenador", "supervisor"] },
  { href: "/clientes", label: "Clientes", icon: "🏢", roles: ["coordenador", "supervisor"] },
  { href: "/usuarios", label: "Gestão de Usuários", icon: "👥", roles: ["coordenador", "supervisor"] },
  { href: "/treinamentos", label: "Treinamentos", icon: "🎓", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/presencas", label: "Gestão de Turmas", icon: "🗂️", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/frequencia-individual", label: "Frequência Individual", icon: "📍", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/avaliacoes", label: "Avaliações", icon: "⭐", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/responder-avaliacao", label: "Responder Avaliação", icon: "📝", roles: ["treinando", "instrutor", "supervisor", "coordenador"] },
  { href: "/resultados-avaliacoes", label: "Resultados das Avaliações", icon: "📈", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/nps", label: "NPS", icon: "💬", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/responder-nps", label: "Responder NPS", icon: "🗳️", roles: ["treinando"] },
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

  if (user === undefined) return null;
  if (!user) return null;

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
        <div style={headerCard}>
          <div>
            <div style={pageTitle}>{title}</div>
            {subtitle ? <div style={pageSubtitle}>{subtitle}</div> : null}
          </div>

          {topRight ? <div>{topRight}</div> : null}
        </div>

        <div style={content}>{children}</div>
      </main>
    </div>
  );
}

const sidebar = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #0f172a 0%, #1d4ed8 100%)",
  color: "#fff",
  display: "flex",
  flexDirection: "column",
  padding: "20px 18px",
  position: "sticky",
  top: 0,
  overflowY: "auto",
};

const brandBox = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  marginBottom: 24,
};

const logo = {
  width: 70,
  height: 70,
  borderRadius: 18,
  background: "#fff",
  objectFit: "contain",
  padding: 8,
};

const brandTitle = {
  fontSize: 20,
  fontWeight: 800,
  lineHeight: 1.1,
};

const brandSubtitle = {
  marginTop: 6,
  color: "rgba(255,255,255,0.75)",
  fontSize: 14,
  lineHeight: 1.35,
};

const nav = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  overflowY: "auto",
  paddingRight: 4,
};

const navItem = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 16,
  color: "rgba(255,255,255,0.88)",
  textDecoration: "none",
  fontWeight: 700,
  transition: "all .2s ease",
};

const navItemActive = {
  background: "#2563eb",
  color: "#fff",
  boxShadow: "0 10px 18px rgba(37,99,235,0.35)",
};

const navIcon = {
  width: 22,
  textAlign: "center",
  fontSize: 16,
};

const navLabel = {
  lineHeight: 1.2,
};

const sidebarFooter = {
  marginTop: "auto",
  display: "grid",
  gap: 12,
  paddingTop: 18,
};

const envCard = {
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16,
  padding: 14,
  display: "grid",
  gap: 4,
};

const envLabel = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "rgba(255,255,255,0.68)",
  fontWeight: 800,
};

const envValue = {
  fontSize: 14,
  lineHeight: 1.35,
};

const logoutButton = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  padding: "12px 14px",
  cursor: "pointer",
  fontWeight: 800,
};

const main = {
  padding: 18,
  minWidth: 0,
};

const headerCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 22,
  padding: 20,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)",
};

const pageTitle = {
  fontSize: 28,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.1,
};

const pageSubtitle = {
  marginTop: 8,
  color: "#64748b",
  lineHeight: 1.5,
};

const content = {
  marginTop: 16,
};

const mobileTopbar = {
  position: "sticky",
  top: 0,
  zIndex: 20,
  background: "linear-gradient(180deg, #0f172a 0%, #1d4ed8 100%)",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "14px 16px",
};

const mobileBrandWrap = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const mobileLogo = {
  width: 48,
  height: 48,
  borderRadius: 14,
  background: "#fff",
  objectFit: "contain",
  padding: 6,
};

const mobileBrandTitle = {
  fontSize: 18,
  fontWeight: 800,
  lineHeight: 1.1,
};

const mobileBrandSubtitle = {
  marginTop: 4,
  color: "rgba(255,255,255,0.75)",
  fontSize: 12,
  lineHeight: 1.3,
};

const mobileMenuButton = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 12,
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 800,
};

const mobileDrawer = {
  background: "linear-gradient(180deg, #0f172a 0%, #1d4ed8 100%)",
  color: "#fff",
  padding: "0 16px 16px",
};

const mobileNav = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  paddingTop: 8,
};

const mobileNavItem = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  borderRadius: 14,
  color: "rgba(255,255,255,0.88)",
  textDecoration: "none",
  fontWeight: 700,
};

const mobileNavItemActive = {
  background: "#2563eb",
  color: "#fff",
};

const mobileNavIcon = {
  width: 22,
  textAlign: "center",
  fontSize: 16,
};

const mobileNavLabel = {
  lineHeight: 1.2,
};

const mobileFooterBlock = {
  display: "grid",
  gap: 12,
  marginTop: 14,
};

const mobileEnvCard = {
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16,
  padding: 14,
  display: "grid",
  gap: 4,
};

const logoutButtonMobile = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  padding: "12px 14px",
  cursor: "pointer",
  fontWeight: 800,
};
