"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getStoredUser } from "../services/api";

export default function PortalShell({ title, subtitle, children }) {

  const pathname = usePathname()
  const router = useRouter()
  const [user,setUser]=useState(null)

  useEffect(()=>{
    setUser(getStoredUser())
  },[])

  function sair(){

    localStorage.removeItem("token")
    localStorage.removeItem("user")

    router.push("/login")

  }

  const menu = [

    {href:"/inicio",label:"Início"},
    {href:"/dashboard",label:"Dashboard"},
    {href:"/treinamentos",label:"Treinamentos"},
    {href:"/presencas",label:"Turmas"},
    {href:"/avaliacoes",label:"Avaliações"},
    {href:"/biblioteca",label:"Biblioteca"},
    {href:"/trilhas",label:"Trilhas"},
    {href:"/mapa-desenvolvimento",label:"Mapa de desenvolvimento"}

  ]

  return(

  <div style={{display:"flex",minHeight:"100vh",background:"#f8fafc"}}>

  <aside style={{
  width:240,
  background:"#1e3a8a",
  color:"#fff",
  padding:20,
  display:"flex",
  flexDirection:"column"
  }}>

  <div style={{marginBottom:20}}>

  <img src="/logo-td.png" style={{width:50}} />

  <h2 style={{margin:"8px 0"}}>Portal T&D</h2>

  </div>

  <div style={{
  background:"rgba(255,255,255,0.1)",
  padding:12,
  borderRadius:10,
  marginBottom:16
  }}>

  <strong>{user?.nome}</strong>

  <div style={{fontSize:12}}>
  {user?.perfil}
  </div>

  </div>

  <nav style={{display:"flex",flexDirection:"column",gap:6}}>

  {menu.map((item)=>{

  const active = pathname === item.href

  return(

  <Link
  key={item.href}
  href={item.href}
  style={{
  padding:10,
  borderRadius:8,
  background:active ? "rgba(255,255,255,0.2)" : "transparent",
  color:"#fff",
  textDecoration:"none"
  }}
  >

  {item.label}

  </Link>

  )

  })}

  </nav>

  <div style={{marginTop:"auto"}}>

  <Link
  href="/alterar-senha"
  style={{
  display:"block",
  padding:10,
  marginBottom:6,
  background:"rgba(255,255,255,0.1)",
  borderRadius:8,
  textAlign:"center",
  textDecoration:"none",
  color:"#fff"
  }}
  >

  Alterar senha

  </Link>

  <button
  onClick={sair}
  style={{
  width:"100%",
  padding:10,
  borderRadius:8,
  border:0,
  background:"#fff",
  color:"#1e3a8a",
  fontWeight:700
  }}
  >

  Sair

  </button>

  </div>

  </aside>

  <main style={{flex:1,padding:30}}>

  <h1>{title}</h1>

  {subtitle && <p style={{color:"#64748b"}}>{subtitle}</p>}

  {children}

  </main>

  </div>

  )

}
