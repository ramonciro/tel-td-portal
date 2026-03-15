"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import API_URL from "../../services/api";

export default function PrimeiroAcessoPage(){

const router = useRouter()

const [senha,setSenha]=useState("")
const [confirmacao,setConfirmacao]=useState("")
const [erro,setErro]=useState("")

async function salvar(e){

e.preventDefault()

if(senha!==confirmacao){

setErro("Senhas não conferem")
return

}

const user = JSON.parse(localStorage.getItem("user"))

await fetch(`${API_URL}/auth/alterar-senha`,{

method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
email:user.email,
novaSenha:senha
})

})

router.push("/inicio")

}

return(

<div style={{padding:40}}>

<h2>Primeiro acesso</h2>

<form onSubmit={salvar}>

<input
type="password"
placeholder="Nova senha"
value={senha}
onChange={(e)=>setSenha(e.target.value)}
/>

<input
type="password"
placeholder="Confirmar senha"
value={confirmacao}
onChange={(e)=>setConfirmacao(e.target.value)}
/>

<button>Salvar senha</button>

</form>

</div>

)

}
