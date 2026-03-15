"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getStoredUser, hasSomeRole } from "../services/api";

const allMenu = [
  { href: "/inicio", label: "Início", icon: "🏠" },
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/usuarios", label: "Usuários", icon: "👤", restricted: true },
  { href: "/clientes", label: "Clientes", icon: "🏢", restricted: true },
  { href: "/treinamentos", label: "Treinamentos", icon: "🎓" },
  { href: "/presencas", label: "Turmas", icon: "👥" },
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
            <div style={brandWrap}>
              <img src="/logo-td.png" alt="Portal T&D" style={brandLogo} />
              <div>
                <div style={brandTitle}>Portal T&amp;D</div>
                <div style={brandSubtitle}>Treinamento &amp; Desenvolvimento</div>
              </div>
            </div>

            <div style={profileCard}>
              <div style={profileLabel}>Perfil em uso</div>
              <div style={profileName}>{user?.nome || "Usuário"}</div>
              <div style={profileRole}>{(user?.perfil || "perfil não identificado").toString().toUpperCase()}</div>
            </div>
          </div>

          <div style={menuArea}>
            <nav style={nav}>
              {menu.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} style={{ ...navItem, ...(active ? navItemActive : null) }}>
                    <span style={navIcon}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div style={footerBlock}>
            <div style={userCardMini}>
              <div style={userCardMiniName}>{user?.nome || "Usuário"}</div>
              <div style={userCardMiniRole}>{(user?.perfil || "Perfil").toString()}</div>
            </div>

            <div style={actionsWrap}>
              <Link href="/alterar-senha" style={secondaryAction}>Alterar senha</Link>
              <button onClick={sair} style={primaryAction}>Sair</button>
            </div>
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

const shell = { minHeight: "100vh", display: "flex", background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)" };
const sidebar = { width: 248, minWidth: 248, maxWidth: 248, background: "linear-gradient(180deg, #0f172a 0%, #1e3a8a 100%)", color: "#fff", height: "100vh", position: "sticky", top: 0, overflow: "hidden", borderRight: "1px solid rgba(255,255,255,.06)" };
const sidebarInner = { height: "100%", display: "grid", gridTemplateRows: "auto 1fr auto", gap: 14, padding: 16, boxSizing: "border-box" };
const brandWrap = { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 };
const brandLogo = { width: 48, height: 48, objectFit: "contain", borderRadius: 12, background: "rgba(255,255,255,.06)", padding: 4 };
const brandTitle = { fontSize: 18, fontWeight: 900, letterSpacing: "-0.03em" };
const brandSubtitle = { fontSize: 11, lineHeight: 1.4, color: "rgba(255,255,255,.74)" };
const profileCard = { background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 12 };
const profileLabel = { fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em", color: "rgba(255,255,255,.62)" };
const profileName = { marginTop: 8, fontWeight: 800, fontSize: 15, lineHeight: 1.2 };
const profileRole = { marginTop: 4, fontSize: 12, color: "rgba(255,255,255,.78)" };
const menuArea = { minHeight: 0, overflowY: "auto", paddingRight: 4 };
const nav = { display: "grid", gap: 6 };
const navItem = { textDecoration: "none", color: "#fff", padding: "10px 12px", borderRadius: 12, fontSize: 14, fontWeight: 600, border: "1px solid transparent", display: "flex", alignItems: "center", gap: 10 };
const navItemActive = { background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.16)", fontWeight: 800 };
const navIcon = { width: 20, textAlign: "center", fontSize: 15 };
const footerBlock = { display: "grid", gap: 10, paddingTop: 6 };
const userCardMini = { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 14, padding: 10 };
const userCardMiniName = { fontWeight: 800, fontSize: 13 };
const userCardMiniRole = { fontSize: 11, color: "rgba(255,255,255,.74)", marginTop: 4 };
const actionsWrap = { display: "grid", gap: 8 };
const secondaryAction = { textDecoration: "none", textAlign: "center", border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.08)", color: "#ffffff", borderRadius: 12, padding: "10px 12px", fontWeight: 700, fontSize: 14 };
const primaryAction = { width: "100%", border: "1px solid rgba(255,255,255,.14)", background: "#ffffff", color: "#1e3a8a", borderRadius: 12, padding: "10px 12px", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const main = { flex: 1, minWidth: 0, padding: 18, boxSizing: "border-box" };
const contentCard = { background: "rgba(255,255,255,.88)", backdropFilter: "blur(10px)", borderRadius: 22, padding: 20, border: "1px solid #dbeafe", boxShadow: "0 14px 32px rgba(15, 23, 42, 0.06)", minHeight: "calc(100vh - 36px)", boxSizing: "border-box" };
const headerBlock = { marginBottom: 18 };
const headerBadge = { display: "inline-block", background: "#dbeafe", color: "#1d4ed8", fontWeight: 800, padding: "5px 10px", borderRadius: 999, fontSize: 11, letterSpacing: ".03em", textTransform: "uppercase" };
const pageTitle = { margin: "12px 0 8px", fontSize: 34, lineHeight: 1.05, color: "#0f172a" };
const pageSubtitle = { margin: 0, color: "#64748b", fontSize: 15, maxWidth: 980, lineHeight: 1.55 };
