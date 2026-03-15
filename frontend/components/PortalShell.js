"use client";

import Link from "next/link";

export default function PortalShell({children,title}){

const user = JSON.parse(localStorage.getItem("user")||"{}")

return(

<div style={{display:"flex"}}>

<aside style={{width:260,background:"#1e3a8a",color:"#fff",padding:20}}>

<h2>Portal T&D</h2>

<p>{user.nome}</p>

<nav style={{display:"flex",flexDirection:"column",gap:10}}>

<Link href="/inicio">Início</Link>
<Link href="/presencas">Turmas</Link>
<Link href="/avaliacoes">Avaliações</Link>
<Link href="/biblioteca">Biblioteca</Link>
<Link href="/trilhas">Trilhas</Link>

</nav>

</aside>

<main style={{flex:1,padding:30}}>

<h1>{title}</h1>

{children}

</main>

</div>

)

}
