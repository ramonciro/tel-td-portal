"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const menu = [
  { href: "/inicio", label: "Início" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/usuarios", label: "Usuários" },
  { href: "/clientes", label: "Clientes" },
  { href: "/treinamentos", label: "Treinamentos" },
  { href: "/presencas", label: "Presenças" },
  { href: "/avaliacoes", label: "Avaliações" },
  { href: "/biblioteca", label: "Biblioteca" },
  { href: "/trilhas", label: "Trilhas" },
  { href: "/mapa-desenvolvimento", label: "Mapa de desenvolvimento" },
];

export default function PortalShell({ title, subtitle, children }) {
  const pathname = usePathname();
  const router = useRouter();

  function sair() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
    router.push("/login");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      <aside
        style={{
          width: 270,
          background: "linear-gradient(180deg, #0f172a 0%, #1e3a8a 100%)",
          color: "#fff",
          padding: 24,
          boxSizing: "border-box",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em" }}>
            Tel T&D
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.72)", marginTop: 6 }}>
            Gestão estratégica de Treinamento e Desenvolvimento
          </div>
        </div>

        <nav style={{ display: "grid", gap: 8 }}>
          {menu.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  textDecoration: "none",
                  color: "#fff",
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: active ? "rgba(255,255,255,.16)" : "transparent",
                  border: active ? "1px solid rgba(255,255,255,.2)" : "1px solid transparent",
                  fontWeight: active ? 700 : 500,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={sair}
          style={{
            marginTop: 24,
            width: "100%",
            border: "1px solid rgba(255,255,255,.18)",
            background: "rgba(255,255,255,.08)",
            color: "#fff",
            borderRadius: 14,
            padding: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Sair
        </button>
      </aside>

      <main style={{ flex: 1, padding: 28, boxSizing: "border-box" }}>
        <div
          style={{
            background: "rgba(255,255,255,.8)",
            backdropFilter: "blur(10px)",
            borderRadius: 26,
            padding: 28,
            border: "1px solid #dbeafe",
            boxShadow: "0 20px 40px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "inline-block",
                background: "#dbeafe",
                color: "#1d4ed8",
                fontWeight: 700,
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 12,
                letterSpacing: ".02em",
                textTransform: "uppercase",
              }}
            >
              Portal Executivo
            </div>
            <h1 style={{ margin: "14px 0 10px", fontSize: 38, lineHeight: 1.05 }}>
              {title}
            </h1>
            <p style={{ margin: 0, color: "#64748b", fontSize: 16, maxWidth: 900 }}>
              {subtitle}
            </p>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
