"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const menu = [
  { label: "Início", href: "/inicio", icon: "🏠" },
  { label: "Clientes", href: "/clientes", icon: "🏢" },
  { label: "Usuários", href: "/usuarios", icon: "👥" },
  { label: "Treinamentos", href: "/treinamentos", icon: "🎓" },
  { label: "Presenças", href: "/presencas", icon: "📋" },
  { label: "Avaliações", href: "/avaliacoes", icon: "⭐" },
  { label: "Biblioteca", href: "/biblioteca", icon: "📚" },
  { label: "Trilhas", href: "/trilhas", icon: "🧭" },
  { label: "Mapa de Desenvolvimento", href: "/mapa-desenvolvimento", icon: "🗺️" },
  { label: "Evolução do Colaborador", href: "/evolucao-colaborador", icon: "📈" },
];

export default function PortalShell({ title, subtitle, children, actions }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) setUser(JSON.parse(raw));
    } catch {}
  }, []);

  const menuItems = useMemo(() => menu, []);

  function sair() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  }

  return (
    <div style={layout}>
      <aside style={sidebar}>
        <div>
          <div style={brandMini}>TEL CENTRO DE CONTATOS</div>
          <h1 style={brandTitle}>Tel T&D 2.0</h1>
          <p style={brandText}>Gestão estratégica de Treinamento e Desenvolvimento</p>
        </div>

        <div style={profileBox}>
          <div style={avatar}>{(user?.nome || "U").slice(0, 1).toUpperCase()}</div>
          <div>
            <div style={profileName}>{user?.nome || "Usuário"}</div>
            <div style={profileRole}>{user?.perfil || "perfil"}</div>
            <div style={profileEmail}>{user?.email || ""}</div>
          </div>
        </div>

        <nav style={nav}>
          {menuItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} style={{ ...navItem, ...(active ? navItemActive : {}) }}>
                <span style={{ width: 24, display: "inline-block" }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <button onClick={sair} style={logoutBtn}>Sair</button>
      </aside>

      <main style={main}>
        <div style={topbar}>
          <div>
            <div style={pageEyebrow}>PORTAL EXECUTIVO</div>
            <h2 style={titleStyle}>{title}</h2>
            {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
          </div>
          {actions ? <div style={actionsWrap}>{actions}</div> : null}
        </div>
        {children}
      </main>
    </div>
  );
}

const layout = { display: "grid", gridTemplateColumns: "310px 1fr", minHeight: "100vh", background: "#f4f7fb" };
const sidebar = { background: "linear-gradient(180deg,#0f172a,#1d4ed8)", color: "#fff", padding: 24, display: "flex", flexDirection: "column", gap: 20, boxShadow: "8px 0 24px rgba(15,23,42,.12)", minHeight: "100vh" };
const brandMini = { fontSize: 11, opacity: .75, letterSpacing: ".18em" };
const brandTitle = { margin: "8px 0 6px", fontSize: 28 };
const brandText = { margin: 0, fontSize: 14, opacity: .88, lineHeight: 1.5 };
const profileBox = { display: "grid", gridTemplateColumns: "56px 1fr", gap: 12, alignItems: "center", background: "rgba(255,255,255,.12)", padding: 14, borderRadius: 16 };
const avatar = { width: 56, height: 56, borderRadius: 16, display: "grid", placeItems: "center", background: "rgba(255,255,255,.18)", fontSize: 22, fontWeight: 700 };
const profileName = { fontWeight: 700, fontSize: 15 };
const profileRole = { fontSize: 13, opacity: .9, marginTop: 4, textTransform: "capitalize" };
const profileEmail = { fontSize: 12, opacity: .8, marginTop: 4, wordBreak: "break-word" };
const nav = { display: "grid", gap: 8 };
const navItem = { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, textDecoration: "none", color: "#fff", fontSize: 14, opacity: .95 };
const navItemActive = { background: "rgba(255,255,255,.16)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.14)" };
const logoutBtn = { marginTop: "auto", width: "100%", border: 0, borderRadius: 14, padding: "12px 14px", background: "rgba(255,255,255,.14)", color: "#fff", cursor: "pointer", fontWeight: 600 };
const main = { padding: 28 };
const topbar = { background: "#fff", borderRadius: 20, padding: 24, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, boxShadow: "0 8px 30px rgba(15,23,42,.06)" };
const pageEyebrow = { fontSize: 12, letterSpacing: ".14em", color: "#2563eb", fontWeight: 700, marginBottom: 8 };
const titleStyle = { margin: 0, color: "#0f172a", fontSize: 30 };
const subtitleStyle = { margin: "8px 0 0", color: "#64748b", lineHeight: 1.5 };
const actionsWrap = { display: "flex", gap: 10, flexWrap: "wrap" };
