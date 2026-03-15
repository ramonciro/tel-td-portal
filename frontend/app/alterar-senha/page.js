"use client";

import { useState } from "react";
import PortalShell from "../../components/PortalShell";
import API_URL from "../../services/api";

export default function AlterarSenhaPage(){

const [senha,setSenha]=useState("")
const [confirmacao,setConfirmacao]=useState("")
const [erro,setErro]=useState("")

async function salvar(e){

e.preventDefault()

if(senha!==confirmacao){
setErro("Senhas diferentes")
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

alert("Senha alterada")

}

return(

<PortalShell title="Alterar senha">

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

<button>Salvar</button>

</form>

</PortalShell>

)

}
