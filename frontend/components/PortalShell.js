"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const menuBase = [
  { label: "Início", href: "/inicio", roles: ["admin","coordenador","supervisor","instrutor"] },
  { label: "Clientes", href: "/clientes", roles: ["admin","coordenador"] },
  { label: "Usuários", href: "/usuarios", roles: ["admin","coordenador","supervisor"] },
  { label: "Treinamentos", href: "/treinamentos", roles: ["admin","coordenador","supervisor","instrutor"] },
  { label: "Presenças", href: "/presencas", roles: ["admin","coordenador","supervisor","instrutor"] },
  { label: "Avaliações", href: "/avaliacoes", roles: ["admin","coordenador","supervisor","instrutor"] },
  { label: "Biblioteca", href: "/biblioteca", roles: ["admin","coordenador","supervisor","instrutor"] },
  { label: "Trilhas", href: "/trilhas", roles: ["admin","coordenador","supervisor","instrutor"] },

  // NOVAS TELAS
  { label: "Mapa de Desenvolvimento", href: "/mapa-desenvolvimento", roles: ["admin","coordenador","supervisor"] },
  { label: "Evolução do Colaborador", href: "/evolucao-colaborador", roles: ["admin","coordenador","supervisor"] }
];

export default function PortalShell({ title, subtitle, children }) {

  const pathname = usePathname();
  const router = useRouter();
  const [user,setUser] = useState(null);

  useEffect(()=>{
    try{
      const raw = localStorage.getItem("user");
      if(raw) setUser(JSON.parse(raw));
    }catch{}
  },[])

  const perfil = String(user?.perfil || "").toLowerCase();

  const menuItems = useMemo(()=>{
    if(!perfil) return [];
    return menuBase.filter(item=>item.roles.includes(perfil))
  },[perfil])

  function sair(){
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  }

  return(
    <div style={layout}>

      <aside style={sidebar}>

        <div>
          <div style={brandMini}>TEL CENTRO DE CONTATOS</div>
          <h1 style={brandTitle}>Tel T&D</h1>
          <p style={brandText}>Portal de Treinamento</p>
        </div>

        <div style={profileBox}>
          <div style={profileName}>{user?.nome || "Usuário"}</div>
          <div style={profileRole}>{user?.perfil}</div>
          <div style={profileEmail}>{user?.email}</div>
        </div>

        <nav style={nav}>
          {menuItems.map(item=>{
            const active = pathname === item.href
            return(
              <Link
                key={item.href}
                href={item.href}
                style={{
                  ...navItem,
                  ...(active?navItemActive:{})
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <button onClick={sair} style={logoutBtn}>Sair</button>

      </aside>

      <main style={main}>
        <div style={header}>
          <h1 style={titleStyle}>{title}</h1>
          {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
        </div>

        {children}
      </main>

    </div>
  )
}

const layout={
display:"grid",
gridTemplateColumns:"300px 1fr",
minHeight:"100vh",
background:"#f1f5f9"
}

const sidebar={
background:"linear-gradient(180deg,#0f172a,#1e3a8a)",
color:"#fff",
padding:28,
display:"flex",
flexDirection:"column",
gap:24
}

const brandMini={fontSize:11,opacity:.7}
const brandTitle={margin:"6px 0",fontSize:26}
const brandText={fontSize:14,opacity:.8}

const profileBox={
background:"rgba(255,255,255,.08)",
borderRadius:12,
padding:12
}

const profileName={fontWeight:"bold"}
const profileRole={fontSize:13}
const profileEmail={fontSize:12}

const nav={
display:"grid",
gap:8
}

const navItem={
padding:"12px 16px",
borderRadius:10,
textDecoration:"none",
color:"#fff"
}

const navItemActive={
background:"#2563eb"
}

const logoutBtn={
marginTop:"auto",
background:"rgba(255,255,255,.1)",
border:"none",
padding:12,
borderRadius:8,
color:"#fff"
}

const main={padding:28}

const header={
background:"#fff",
padding:20,
borderRadius:12,
marginBottom:20
}

const titleStyle={margin:0}
const subtitleStyle={color:"#64748b"}
