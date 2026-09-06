"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { clearSession, getStoredUser, hasSomeRole, hasOceanAccess } from "../services/api";
import NavIcon from "./icons";
import { colors } from "../lib/theme";

// Ícones trocados de emoji para o conjunto de linha em icons.js — mesmo
// peso/estilo em todo o menu, sem depender de como cada sistema operacional
// desenha emoji (ver icons.js para o motivo completo).
const menuItems = [
  // Sprint 4: Super Admin — menu exclusivo
  { href: "/admin",         label: "Painel Super Admin",     icon: "settings", roles: ["super_admin"] },
  // Menu operacional
  { href: "/inicio",        label: "Início",                 icon: "home", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
  { href: "/dashboard",     label: "Dashboard",              icon: "chart", roles: ["coordenador", "supervisor"] },
  { href: "/mapa-desenvolvimento", label: "Mapa de Desenvolvimento", icon: "map", roles: ["coordenador", "superintendente"], requiresOceanAccess: true },
  { href: "/necessidades",  label: "Necessidades",           icon: "target", roles: ["coordenador", "supervisor", "superintendente"] },
  { href: "/trilhas",       label: "Trilhas",                icon: "compass", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
  { href: "/treinamentos",  label: "Treinamentos",           icon: "cap", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/presencas",     label: "Gestão de Turmas",       icon: "folder", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/minhas-turmas", label: "Minhas Turmas",          icon: "backpack", roles: ["instrutor", "treinando"] },
  { href: "/certificados",  label: "Certificados",           icon: "award", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
  { href: "/indicadores",  label: "Indicadores",             icon: "trending", roles: ["coordenador", "supervisor", "superintendente"] },
  { href: "/capacidade",   label: "CH por Instrutor",        icon: "clock", roles: ["coordenador", "supervisor", "superintendente"] },
  { href: "/biblioteca",    label: "Biblioteca",             icon: "book", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
  { href: "/clientes",      label: "Clientes",               icon: "building", roles: ["coordenador", "supervisor"] },
  { href: "/usuarios",      label: "Gestão de Usuários",     icon: "users", roles: ["coordenador", "supervisor"] },
  { href: "/auditoria",     label: "Auditoria",              icon: "shield", roles: ["coordenador", "superintendente"] },
  // Módulo R&S — Recrutamento & Seleção
  { href: "/rs",           label: "Dashboard R&S",       icon: "chart", roles: ["coordenador_rs", "gestor_rs"] },
  { href: "/rs/rps",       label: "Requisições",          icon: "users", roles: ["coordenador_rs", "gestor_rs"] },
  { href: "/rs/relatorio",      label: "Relatório Mensal",  icon: "trending", roles: ["coordenador_rs", "gestor_rs"] },
  { href: "/rs/configuracoes", label: "Configurações R&S", icon: "settings", roles: ["coordenador_rs"] },
];
// Removidos do menu (agora vivem dentro da Turma, nas abas Avaliações/NPS,
// ou como drill-down no Dashboard — ver frontend/components/TurmaTabs.js):
// Frequência Individual, Avaliações, Responder Avaliação,
// Resultados das Avaliações, NPS, Responder NPS.
// As páginas em si continuam existindo (/avaliacoes segue como biblioteca de
// provas, /responder-avaliacao e /responder-nps continuam sendo os links
// que a aba da turma usa) — só saíram da navegação principal.

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

  // Sprint 4: super_admin não pertence a nenhuma rota operacional.
  // Se cair em qualquer página que não seja /admin/*, redireciona.
  useEffect(() => {
    if (!user) return;
    if (user.perfil === "super_admin" && !pathname.startsWith("/admin")) {
      router.replace("/admin");
    }
    // Módulo R&S: redireciona para a área correta se tentar acessar T&D
    const rsPerfiles = ["coordenador_rs", "gestor_rs"];
    if (rsPerfiles.includes(user.perfil) && !pathname.startsWith("/rs")) {
      router.replace("/rs/rps");
    }
  }, [user, pathname]);

  const isSuperAdmin = user?.perfil === "super_admin";

  const allowedMenuItems = useMemo(() => {
    if (!user) return [];
    // super_admin vê apenas os itens do próprio menu (/admin)
    if (isSuperAdmin) {
      return menuItems.filter((item) => item.roles.includes("super_admin"));
    }
    return menuItems.filter((item) => {
      const roleOk = hasSomeRole(user, item.roles);
      if (!roleOk) return false;
      if (item.requiresOceanAccess) return hasOceanAccess(user);
      return true;
    });
  }, [user, isSuperAdmin]);

  const currentItem = useMemo(() => {
    return menuItems.find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
    );
  }, [pathname]);

  const currentAllowed = useMemo(() => {
    if (!currentItem) return true;
    if (!user) return false;
    // super_admin tem acesso irrestrito no frontend
    if (isSuperAdmin) return true;
    const roleOk = hasSomeRole(user, currentItem.roles);
    if (!roleOk) return false;
    if (currentItem.requiresOceanAccess) return hasOceanAccess(user);
    return true;
  }, [currentItem, user, isSuperAdmin]);

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
            Fale com a coordenação responsável para revisar o perfil e a liberação específica desta área.
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
                      <span style={mobileNavIcon}><NavIcon name={item.icon} /></span>
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
                  <span style={navIcon}><NavIcon name={item.icon} /></span>
                  <span style={navLabel}>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div style={sidebarFooter}>
            <div style={envCard}>
              {user?.perfil === "super_admin" ? (
                <>
                  <span style={{ ...envLabel, color: colors.accentBright }}>Super Admin</span>
                  <strong style={{ ...envValue, color: colors.accentBright }}>Tel Centro de Contatos</strong>
                </>
              ) : (
                <>
                  <span style={envLabel}>
                    {user?.nome ? user.nome.split(" ")[0] : "Usuário"}
                  </span>
                  <strong style={envValue}>
                    {user?.cliente || "Portal T&D"}
                  </strong>
                </>
              )}
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
  background: `linear-gradient(180deg, ${colors.navy} 0%, ${colors.navySoft} 100%)`,
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
  width: 44,
  height: 44,
  borderRadius: 12,
  objectFit: "contain",
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
  background: colors.accent,
  color: "#fff",
  boxShadow: "0 10px 18px rgba(217,119,6,0.35)",
};

const navIcon = {
  width: 22,
  height: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
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
  background: `linear-gradient(180deg, ${colors.navy} 0%, ${colors.navySoft} 100%)`,
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
  width: 38,
  height: 38,
  borderRadius: 10,
  objectFit: "contain",
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
  background: `linear-gradient(180deg, ${colors.navy} 0%, ${colors.navySoft} 100%)`,
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
  background: colors.accent,
  color: "#fff",
};

const mobileNavIcon = {
  width: 22,
  height: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
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
