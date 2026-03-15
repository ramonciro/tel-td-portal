"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getStoredUser, hasSomeRole } from "../services/api";

const allMenu = [
  { href: "/inicio", label: "Início" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/usuarios", label: "Usuários", restricted: true },
  { href: "/clientes", label: "Clientes", restricted: true },
  { href: "/treinamentos", label: "Treinamentos" },
  { href: "/presencas", label: "Presenças" },
  { href: "/avaliacoes", label: "Avaliações" },
  { href: "/biblioteca", label: "Biblioteca" },
  { href: "/trilhas", label: "Trilhas" },
  { href: "/mapa-desenvolvimento", label: "Mapa de desenvolvimento" }
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
    <div style={{ minHeight: "100vh", display: "flex" }}>
      <aside
        style={{
          width: 282,
          background: "linear-gradient(180deg, #0f172a 0%, #1e3a8a 100%)",
          color: "#fff",
          padding: 24,
          boxSizing: "border-box",
          position: "sticky",
          top: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column"
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em" }}>Tel T&D</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.72)", marginTop: 6, lineHeight: 1.5 }}>
            Ambiente de Treinamento e Desenvolvimento com foco em gestão, operação e evolução.
          </div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,.09)",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 18,
            padding: 14,
            marginBottom: 18
          }}
        >
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "rgba(255,255,255,.6)" }}>
            Perfil em uso
          </div>
          <div style={{ marginTop: 8, fontWeight: 800, fontSize: 16 }}>{user?.nome || "Usuário"}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "rgba(255,255,255,.72)" }}>
            {(user?.perfil || "perfil não identificado").toString().toUpperCase()}
          </div>
        </div>

        <nav style={{ display: "grid", gap: 8, flex: 1, overflowY: "auto", paddingRight: 4 }}>
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
                  fontWeight: active ? 700 : 500
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          <Link
            href="/alterar-senha"
            style={{
              textDecoration: "none",
              textAlign: "center",
              border: "1px solid rgba(255,255,255,.18)",
              background: "rgba(255,255,255,.08)",
              color: "#fff",
              borderRadius: 14,
              padding: 12,
              fontWeight: 700
            }}
          >
            Alterar senha
          </Link>

          <button
            onClick={sair}
            style={{
              width: "100%",
              border: "1px solid rgba(255,255,255,.18)",
              background: "#ffffff",
              color: "#1e3a8a",
              borderRadius: 14,
              padding: 12,
              fontWeight: 800,
              cursor: "pointer"
            }}
          >
            Sair
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, padding: 28, boxSizing: "border-box" }}>
        <div
          style={{
            background: "rgba(255,255,255,.82)",
            backdropFilter: "blur(10px)",
            borderRadius: 26,
            padding: 28,
            border: "1px solid #dbeafe",
            boxShadow: "0 20px 40px rgba(15, 23, 42, 0.06)"
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "inline-block",
                background: "#dbeafe",
                color: "#1d4ed8",
                fontWeight: 800,
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 12,
                letterSpacing: ".02em",
                textTransform: "uppercase"
              }}
            >
              Portal T&D
            </div>
            <h1 style={{ margin: "14px 0 10px", fontSize: 38, lineHeight: 1.05 }}>{title}</h1>
            <p style={{ margin: 0, color: "#64748b", fontSize: 16, maxWidth: 980, lineHeight: 1.65 }}>
              {subtitle}
            </p>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
