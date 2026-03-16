"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import API_URL from "../../services/api";

export default function LoginPage() {

  const router = useRouter()

  const [email,setEmail] = useState("")
  const [senha,setSenha] = useState("")
  const [erro,setErro] = useState("")
  const [loading,setLoading] = useState(false)

  async function login(e){

    e.preventDefault()
    setErro("")
    setLoading(true)

    try{

      const response = await fetch(`${API_URL}/auth/login`,{
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({email,senha})
      })

      const data = await response.json()

      if(!response.ok){
        throw new Error(data.message || "Falha no login")
      }

      localStorage.setItem("token",data.token)
      localStorage.setItem("user",JSON.stringify(data.user))

      if(data.user.troca_senha_obrigatoria){
        router.push("/primeiro-acesso")
      }else{
        router.push("/inicio")
      }

    }catch(err){

      setErro(err.message)

    }finally{

      setLoading(false)

    }

  }

  return(

    <div style={container}>

      <div style={leftSide}>

        <div style={brandBox}>

          <img
            src="/logo-td.png"
            style={logo}
          />

          <h1 style={title}>
            Portal T&D
          </h1>

          <p style={subtitle}>
            Plataforma de gestão de Treinamento & Desenvolvimento
          </p>

        </div>

      </div>

      <div style={rightSide}>

        <form onSubmit={login} style={loginCard}>

          <h2 style={loginTitle}>
            Acessar plataforma
          </h2>

          <p style={loginSubtitle}>
            Utilize seu e-mail corporativo para acessar o portal
          </p>

          {erro && (
            <div style={errorBox}>
              {erro}
            </div>
          )}

          <input
            placeholder="E-mail"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            style={input}
            required
          />

          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e)=>setSenha(e.target.value)}
            style={input}
            required
          />

          <button
            disabled={loading}
            style={button}
          >

            {loading ? "Entrando..." : "Entrar"}

          </button>

        </form>

      </div>

    </div>

  )

}

const container = {
  minHeight:"100vh",
  display:"grid",
  gridTemplateColumns:"1fr 1fr",
  background:"#f8fafc"
}

const leftSide = {
  background:"linear-gradient(135deg,#1e3a8a,#2563eb)",
  display:"flex",
  alignItems:"center",
  justifyContent:"center",
  color:"#fff"
}

const brandBox = {
  textAlign:"center",
  maxWidth:380
}

const logo = {
  width:110,
  marginBottom:20
}

const title = {
  fontSize:36,
  marginBottom:10
}

const subtitle = {
  opacity:.85,
  lineHeight:1.5
}

const rightSide = {
  display:"flex",
  alignItems:"center",
  justifyContent:"center"
}

const loginCard = {
  width:360,
  background:"#fff",
  padding:40,
  borderRadius:18,
  boxShadow:"0 15px 35px rgba(0,0,0,.08)",
  display:"flex",
  flexDirection:"column",
  gap:14
}

const loginTitle = {
  marginBottom:4
}

const loginSubtitle = {
  color:"#64748b",
  fontSize:14,
  marginBottom:10
}

const input = {
  padding:12,
  borderRadius:8,
  border:"1px solid #ddd",
  fontSize:14
}

const button = {
  marginTop:10,
  padding:12,
  borderRadius:8,
  border:0,
  background:"#2563eb",
  color:"#fff",
  fontWeight:700,
  cursor:"pointer"
}

const errorBox = {
  background:"#fee2e2",
  color:"#b91c1c",
  padding:10,
  borderRadius:8,
  fontSize:13
}
