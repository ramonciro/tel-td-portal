"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getStoredUser } from "../services/api";

export default function PortalShell({ title, subtitle, children }) {

  const pathname = usePathname();
  const router = useRouter();
  const user = getStoredUser();

  function sair() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  }

  const menu = [
    { href: "/inicio", label: "Início", icon: "🏠" },
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/usuarios", label: "Usuários", icon: "👤" },
    { href: "/clientes", label: "Clientes", icon: "🏢" },
    { href: "/treinamentos", label: "Treinamentos", icon: "🎓" },
    { href: "/presencas", label: "Turmas", icon: "👥" },
    { href: "/avaliacoes", label: "Avaliações", icon: "⭐" },
    { href: "/biblioteca", label: "Biblioteca", icon: "📚" },
    { href: "/trilhas", label: "Trilhas", icon: "🧭" },
    { href: "/mapa-desenvolvimento", label: "Mapa de desenvolvimento", icon: "🗺️" }
  ];

  return (
    <div style={shell}>

      <aside style={sidebar}>

        <div style={logoArea}>
          <img src="/logo-td.png" style={logo}/>
          <div>
            <div style={brand}>Portal T&D</div>
            <div style={brandSub}>Treinamento e Desenvolvimento</div>
          </div>
        </div>

        <div style={menuArea}>

          {menu.map((item)=>{

            const active = pathname === item.href;

            return (

              <Link
                key={item.href}
                href={item.href}
                style={{
                  ...menuItem,
                  ...(active ? menuActive : {})
                }}
              >

                <span>{item.icon}</span>
                {item.label}

              </Link>

            )

          })}

        </div>

        <div style={userArea}>
          <div style={userName}>
            {user?.nome || "Usuário"}
          </div>

          <button onClick={sair} style={logout}>
            Sair
          </button>
        </div>

      </aside>

      <main style={main}>

        <div style={header}>
          <h1 style={titleStyle}>{title}</h1>
          {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
        </div>

        {children}

      </main>

    </div>
  );
}

const shell={
display:"flex",
minHeight:"100vh",
background:"#f8fafc"
}

const sidebar={
width:260,
background:"#1e3a8a",
color:"#fff",
display:"flex",
flexDirection:"column",
padding:20
}

const logoArea={
display:"flex",
gap:12,
alignItems:"center",
marginBottom:20
}

const logo={
width:60
}

const brand={
fontWeight:800,
fontSize:18
}

const brandSub={
fontSize:12,
opacity:.7
}

const menuArea={
display:"flex",
flexDirection:"column",
gap:6,
flex:1
}

const menuItem={
display:"flex",
gap:10,
alignItems:"center",
padding:"10px 12px",
borderRadius:8,
textDecoration:"none",
color:"#fff",
fontWeight:500
}

const menuActive={
background:"rgba(255,255,255,.2)"
}

const userArea={
borderTop:"1px solid rgba(255,255,255,.2)",
paddingTop:14
}

const userName={
marginBottom:8
}

const logout={
background:"#fff",
color:"#1e3a8a",
border:0,
padding:8,
borderRadius:6,
cursor:"pointer",
fontWeight:600
}

const main={
flex:1,
padding:30
}

const header={
marginBottom:24
}

const titleStyle={
fontSize:28,
marginBottom:6
}

const subtitleStyle={
color:"#64748b"
  }
