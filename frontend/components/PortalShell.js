"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const menuItems = [
  { href: "/inicio", label: "Início", icon: "🏠" },
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/usuarios", label: "Usuários", icon: "👤" },
  { href: "/clientes", label: "Clientes", icon: "🏢" },
  { href: "/treinamentos", label: "Treinamentos", icon: "🎓" },
  { href: "/presencas", label: "Gestão de Turmas", icon: "👥" },
  { href: "/avaliacoes", label: "Avaliações", icon: "⭐" },
  { href: "/nps", label: "NPS", icon: "💬" },
  { href: "/biblioteca", label: "Biblioteca", icon: "📚" },
  { href: "/trilhas", label: "Trilhas", icon: "🧭" },
  { href: "/mapa-desenvolvimento", label: "Mapa de Desenvolvimento", icon: "🗺️" },
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

  function handleLogout() {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        localStorage.removeItem("user");
      }
    } catch (error) {
      console.error("Erro ao limpar sessão:", error);
    }

    router.push("/login");
  }

  return (
    <div className="portal-shell">
      <aside className="portal-sidebar">
        <div className="portal-brand">
          <img
            src="/logo-td.png"
            alt="Portal T&D"
            className="portal-brand-logo"
          />
          <div className="portal-brand-text">
            <div className="portal-brand-title">Portal T&amp;D</div>
            <div className="portal-brand-subtitle">
              Treinamento e Desenvolvimento
            </div>
          </div>
        </div>

        <nav className="portal-nav" aria-label="Menu principal">
          {menuItems.map((item) => {
            const active = isRouteActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`portal-nav-item ${active ? "active" : ""}`}
              >
                <span className="portal-nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="portal-nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="portal-sidebar-footer">
          <div className="portal-sidebar-footer-card">
            <span className="portal-sidebar-footer-label">Ambiente</span>
            <strong className="portal-sidebar-footer-value">
              Gestão Executiva de T&amp;D
            </strong>
          </div>

          <button
            type="button"
            className="portal-logout-button"
            onClick={handleLogout}
          >
            Sair do portal
          </button>
        </div>
      </aside>

      <main className="portal-main">
        <header className="portal-header">
          <div className="portal-header-text">
            <h1 className="portal-title">{title}</h1>
            {subtitle ? <p className="portal-subtitle">{subtitle}</p> : null}
          </div>

          {topRight ? (
            <div className="portal-header-action">{topRight}</div>
          ) : null}
        </header>

        <section className="portal-content">{children}</section>
      </main>

      <style jsx>{`
        .portal-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 270px minmax(0, 1fr);
          background:
            radial-gradient(circle at top right, rgba(59, 130, 246, 0.08), transparent 28%),
            linear-gradient(180deg, #f8fbff 0%, #f8fafc 100%);
        }

        .portal-sidebar {
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 22px;
          padding: 22px 18px;
          background: linear-gradient(180deg, #0f172a 0%, #1e3a8a 100%);
          color: #ffffff;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.04);
        }

        .portal-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 4px 4px 10px;
        }

        .portal-brand-logo {
          width: 64px;
          height: 64px;
          object-fit: contain;
          background: #ffffff;
          border-radius: 16px;
          padding: 8px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
          flex-shrink: 0;
        }

        .portal-brand-text {
          min-width: 0;
        }

        .portal-brand-title {
          font-size: 18px;
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: 0.2px;
          color: #ffffff;
        }

        .portal-brand-subtitle {
          margin-top: 6px;
          font-size: 13px;
          line-height: 1.4;
          color: rgba(255, 255, 255, 0.82);
        }

        .portal-nav {
          display: grid;
          gap: 8px;
        }

        .portal-nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 50px;
          padding: 12px 14px;
          border-radius: 12px;
          text-decoration: none;
          color: rgba(255, 255, 255, 0.88);
          font-weight: 600;
          font-size: 15px;
          line-height: 1.2;
          transition: all 0.2s ease;
          background: transparent;
          border: 1px solid transparent;
        }

        .portal-nav-item:visited {
          color: rgba(255, 255, 255, 0.88);
        }

        .portal-nav-item:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          transform: translateX(4px);
          border-color: rgba(255, 255, 255, 0.08);
        }

        .portal-nav-item.active {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: #ffffff;
          font-weight: 700;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
          border-color: rgba(255, 255, 255, 0.14);
        }

        .portal-nav-item.active:visited {
          color: #ffffff;
        }

        .portal-nav-icon {
          width: 24px;
          min-width: 24px;
          text-align: center;
          font-size: 18px;
          opacity: 0.95;
        }

        .portal-nav-label {
          display: block;
        }

        .portal-sidebar-footer {
          margin-top: auto;
          display: grid;
          gap: 14px;
          padding-top: 12px;
        }

        .portal-sidebar-footer-card {
          display: grid;
          gap: 4px;
          padding: 16px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .portal-sidebar-footer-label {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.76);
        }

        .portal-sidebar-footer-value {
          font-size: 14px;
          line-height: 1.35;
          color: #ffffff;
        }

        .portal-logout-button {
          width: 100%;
          min-height: 48px;
          border: none;
          border-radius: 14px;
          cursor: pointer;
          background: #ffffff;
          color: #0f172a;
          font-size: 14px;
          font-weight: 800;
          transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
        }

        .portal-logout-button:hover {
          transform: translateY(-1px);
          opacity: 0.96;
        }

        .portal-main {
          min-width: 0;
          padding: 28px;
        }

        .portal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 22px;
        }

        .portal-header-text {
          min-width: 0;
        }

        .portal-title {
          margin: 0;
          font-size: 32px;
          line-height: 1.1;
          color: #0f172a;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .portal-subtitle {
          margin: 8px 0 0;
          color: #64748b;
          font-size: 16px;
          line-height: 1.5;
          max-width: 900px;
        }

        .portal-header-action {
          flex-shrink: 0;
        }

        .portal-content {
          display: grid;
          gap: 16px;
          min-width: 0;
        }

        @media (max-width: 1024px) {
          .portal-shell {
            grid-template-columns: 230px minmax(0, 1fr);
          }

          .portal-main {
            padding: 22px;
          }

          .portal-title {
            font-size: 28px;
          }
        }

        @media (max-width: 820px) {
          .portal-shell {
            grid-template-columns: 1fr;
          }

          .portal-sidebar {
            position: relative;
            height: auto;
            overflow: visible;
          }

          .portal-main {
            padding: 18px;
          }

          .portal-header {
            flex-direction: column;
            align-items: stretch;
          }

          .portal-title {
            font-size: 26px;
          }
        }
      `}</style>
    </div>
  );
}
