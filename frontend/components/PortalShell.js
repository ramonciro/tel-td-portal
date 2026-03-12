"use client";

import Link from "next/link";

export default function PortalShell({ title, subtitle, children }) {

  const menu = [
    { href: "/inicio", label: "Dashboard" },
    { href: "/clientes", label: "Clientes" },
    { href: "/usuarios", label: "Usuários" },
    { href: "/treinamentos", label: "Treinamentos" },
    { href: "/presencas", label: "Presenças" },
    { href: "/avaliacoes", label: "Avaliações" }
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>

      <aside style={{
        width: 220,
        background: "#0f172a",
        color: "#fff",
        padding: 20
      }}>
        <h2>Tel T&D</h2>

        <nav style={{ marginTop: 20 }}>
          {menu.map((item) => (
            <div key={item.href} style={{ marginBottom: 10 }}>
              <Link href={item.href} style={{ color: "#fff", textDecoration: "none" }}>
                {item.label}
              </Link>
            </div>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, padding: 40, background: "#f5f5f5" }}>
        <h1>{title}</h1>
        <p>{subtitle}</p>

        <div style={{ marginTop: 20 }}>
          {children}
        </div>
      </main>

    </div>
  );
}
