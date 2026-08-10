"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { clearSession, getStoredUser, hasSomeRole, hasOceanAccess } from "../services/api";

const menuItems = [
  { href: "/inicio", label: "Início", icon: "🏠", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
  { href: "/dashboard", label: "Dashboard", icon: "📊", roles: ["coordenador", "supervisor"] },
  { href: "/mapa-desenvolvimento", label: "Oceano do Desenvolvimento", icon: "🌊", roles: ["coordenador", "superintendente"], requiresOceanAccess: true },
  { href: "/necessidades", label: "Necessidades", icon: "🎯", roles: ["coordenador", "supervisor", "superintendente"] },
  { href: "/trilhas", label: "Trilhas", icon: "🧭", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
  { href: "/treinamentos", label: "Treinamentos", icon: "🎓", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/presencas", label: "Gestão de Turmas", icon: "🗂️", roles: ["coordenador", "supervisor", "instrutor"] },
  { href: "/biblioteca", label: "Biblioteca", icon: "📚", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
  { href: "/avaliacoes", label: "Avaliações", icon: "📝", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
  { href: "/mural", label: "Mural", icon: "📢", roles: ["coordenador", "supervisor", "instrutor", "treinando"] },
  { href: "/auditoria", label: "Auditoria", icon: "🛡️", roles: ["coordenador"] },
];

export default function PortalShell({ children, title, subtitle }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [ambienteAtual, setAmbienteAtual] = useState("dasa");

  useEffect(() => {
    const storedUser = getStoredUser();
    if (!storedUser) {
      router.push("/login");
      return;
    }
    setUser(storedUser);

    if (typeof window !== "undefined") {
      const salvo = localStorage.getItem("client_id") || "dasa";
      setAmbienteAtual(salvo);
    }
  }, [router]);

  const handleMudarAmbiente = (e) => {
    const novoAmbiente = e.target.value;
    setAmbienteAtual(novoAmbiente);
    if (typeof window !== "undefined") {
      localStorage.setItem("client_id", novoAmbiente);
      window.location.reload(); // Recarrega para aplicar o escopo do novo tenant
    }
  };

  const handleLogout = () => {
    clearSession();
    router.push("/login");
  };

  const filteredMenuItems = useMemo(() => {
    if (!user) return [];
    return menuItems.filter((item) => {
      const roleOk = hasSomeRole(user, item.roles);
      if (!roleOk) return false;
      if (item.requiresOceanAccess && !hasOceanAccess(user)) return false;
      return true;
    });
  }, [user]);

  return (
    <div style={shellContainer}>
      {/* Sidebar para Desktop */}
      <aside style={desktopSidebar}>
        <div style={brandArea}>
          <div style={brandBadge}>Tel T&D</div>
          <div style={brandTitle}>Portal de Treinamento</div>
        </div>

        {/* Seletor de Ambiente Multi-tenant */}
        <div style={clientSelectorBox}>
          <label style={clientLabel}>AMBIENTE / CLIENTE:</label>
          <select value={ambienteAtual} onChange={handleMudarAmbiente} style={clientSelect}>
            <option value="dasa" style={{ color: "#000" }}>Dasa</option>
            <option value="sebrae" style={{ color: "#000" }}>Sebrae</option>
            <option value="cemig" style={{ color: "#000" }}>Cemig</option>
            <option value="igua" style={{ color: "#000" }}>Iguá</option>
          </select>
        </div>

        <nav style={navMenu}>
          {filteredMenuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} style={{ ...navItem, ...(isActive ? navItemActive : {}) }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div style={sidebarFooter}>
          <div style={userInfo}>
            <div style={userName}>{user?.nome || "Usuário"}</div>
            <div style={userRole}>{user?.perfil || "Colaborador"}</div>
          </div>
          <button onClick={handleLogout} style={logoutButton}>Sair</button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main style={mainContent}>
        {/* Cabeçalho Mobile */}
        <header style={mobileHeader}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Portal T&D</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Ambiente: {ambienteAtual.toUpperCase()}</div>
          </div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={mobileMenuBtn}>
            {mobileMenuOpen ? "✕ Fechar" : "☰ Menu"}
          </button>
        </header>

        {mobileMenuOpen && (
          <div style={mobileDropdown}>
            <div style={{ padding: "10px 0" }}>
              <label style={{ fontSize: 10, color: "#94a3b8", display: "block", marginBottom: 4 }}>TROCAR AMBIENTE:</label>
              <select value={ambienteAtual} onChange={handleMudarAmbiente} style={{ ...clientSelect, width: "100%" }}>
                <option value="dasa" style={{ color: "#000" }}>Dasa</option>
                <option value="sebrae" style={{ color: "#000" }}>Sebrae</option>
                <option value="cemig" style={{ color: "#000" }}>Cemig</option>
                <option value="igua" style={{ color: "#000" }}>Iguá</option>
              </select>
            </div>
            {filteredMenuItems.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} style={mobileNavItem}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
            <button onClick={handleLogout} style={{ ...logoutButton, width: "100%", marginTop: 12 }}>Sair</button>
          </div>
        )}

        <div style={pageContentInner}>
          {title && (
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: 0 }}>{title}</h1>
              {subtitle && <p style={{ fontSize: 14, color: "#64748b", marginTop: 4 }}>{subtitle}</p>}
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

// Estilos de Layout
const shellContainer = { display: "flex", minHeight: "100vh", background: "#f8fafc", fontFamily: "sans-serif" };
const desktopSidebar = { width: 280, background: "linear-gradient(180deg, #0B1220 0%, #161D2E 100%)", color: "#fff", display: "flex", flexDirection: "column", padding: "20px 14px", position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 50 };
const brandArea = { padding: "0 10px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)" };
const brandBadge = { fontSize: 11, fontWeight: 900, textTransform: "uppercase", color: "#38bdf8", letterSpacing: "1px" };
const brandTitle = { fontSize: 18, fontWeight: 800, marginTop: 4 };
const clientSelectorBox = { padding: "12px 10px", borderBottom: "1px solid rgba(255,255,255,0.1)", marginBottom: 8 };
const clientLabel = { fontSize: 10, color: "rgba(255,255,255,0.6)", display: "block", marginBottom: 4, fontWeight: 800 };
const clientSelect = { width: "100%", background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "8px", fontSize: 13, fontWeight: 700, cursor: "pointer", outline: "none" };
const navMenu = { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginTop: 10 };
const navItem = { display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 10, color: "rgba(255,255,255,0.8)", textDecoration: "none", fontWeight: 700, fontSize: 14, transition: "0.2s" };
const navItemActive = { background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", borderLeft: "4px solid #38bdf8" };
const sidebarFooter = { borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 };
const userInfo = { padding: "0 6px" };
const userName = { fontSize: 14, fontWeight: 800, color: "#fff" };
const userRole = { fontSize: 12, color: "#94a3b8", textTransform: "capitalize" };
const logoutButton = { background: "rgba(239, 68, 68, 0.15)", color: "#fca5a5", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8, padding: "8px", fontWeight: 700, cursor: "pointer", textAlign: "center" };
const mainContent = { flex: 1, marginLeft: 280, display: "flex", flexDirection: "column" };
const mobileHeader = { display: "none", "@media (max-width: 768px)": { display: "flex" }, background: "#0B1220", color: "#fff", padding: "14px 20px", alignItems: "center", justifyContent: "between" };
const mobileMenuBtn = { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "6px 10px", borderRadius: 6, fontWeight: 700 };
const mobileDropdown = { background: "#0B1220", color: "#fff", padding: "16px", borderBottom: "1px solid rgba(255,255,255,0.1)" };
const mobileNavItem = { display: "flex", alignItems: "center", gap: 10, padding: "10px", color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: 14 };
const pageContentInner = { padding: "32px", maxWidth: 1200, width: "100%", margin: "0 auto" };
