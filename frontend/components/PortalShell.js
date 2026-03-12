"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menu = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clientes", label: "Clientes" },
  { href: "/usuarios", label: "Usuários" },
  { href: "/treinamentos", label: "Treinamentos" },
  { href: "/presencas", label: "Presenças" },
  { href: "/avaliacoes", label: "Avaliações" }
];

export default function PortalShell({ title, subtitle, children }) {
  const pathname = usePathname();

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Arial, sans-serif" }}>
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: "100vh" }}>
        <aside style={{
          background: "#172554",
          color: "#fff",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 20
        }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.8 }}>
              Tel Centro de Contatos
            </div>
            <h2 style={{ margin: "8px 0 0", fontSize: 28 }}>Tel T&D</h2>
            <p style={{ margin: "8px 0 0", color: "#c7d2fe", fontSize: 14 }}>
              Portal de Treinamento e Desenvolvimento
            </p>
          </div>

          <nav style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {menu.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    textDecoration: "none",
                    color: "#fff",
                    background: active ? "#1d4ed8" : "transparent",
                    fontWeight: active ? "bold" : "normal"
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div style={{
            marginTop: "auto",
            background: "rgba(255,255,255,0.08)",
            padding: 16,
            borderRadius: 14
          }}>
            <div style={{ fontWeight: "bold" }}>Ramon Ciro</div>
            <div style={{ fontSize: 14, color: "#c7d2fe", marginTop: 4 }}>
              Coordenador de T&D
            </div>
          </div>
        </aside>

        <main style={{ padding: 32 }}>
          <header style={{
            background: "#fff",
            borderRadius: 18,
            padding: 24,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            marginBottom: 24
          }}>
            <h1 style={{ margin: 0, fontSize: 30 }}>{title}</h1>
            <p style={{ margin: "8px 0 0", color: "#64748b" }}>{subtitle}</p>
          </header>

          {children}
        </main>
      </div>
    </div>
  );
}
