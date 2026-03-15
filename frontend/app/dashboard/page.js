"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function sum(arr){
return arr.reduce((a,b)=>a+Number(b||0),0)
}

function fmt(n){
return new Intl.NumberFormat("pt-BR").format(Number(n||0))
}

export default function DashboardPage(){

const [treinamentos,setTreinamentos]=useState([])
const [presencas,setPresencas]=useState([])
const [avaliacoes,setAvaliacoes]=useState([])

useEffect(()=>{

async function carregar(){

const treinamentosData = await apiFetch("/treinamentos").catch(()=>[])
const presencasData = await apiFetch("/presencas").catch(()=>[])
const avaliacoesData = await apiFetch("/avaliacoes").catch(()=>[])

setTreinamentos(treinamentosData)
setPresencas(presencasData)
setAvaliacoes(avaliacoesData)

}

carregar()

},[])

const dados = useMemo(()=>{

const presentes = presencas.filter(p=>p.status==="presente").length
const ausentes = presencas.filter(p=>p.status==="ausente").length
const justificados = presencas.filter(p=>p.status==="justificado").length

const totalParticipacoes = presencas.length

const taxaPresenca = totalParticipacoes
? Math.round((presentes/totalParticipacoes)*100)
:0

// impacto por cliente

const clienteMap={}

treinamentos.forEach(t=>{

const c = t.cliente || "Sem cliente"

if(!clienteMap[c]){
clienteMap[c]={cliente:c,treinamentos:0,participantes:0}
}

clienteMap[c].treinamentos +=1
clienteMap[c].participantes += Number(t.participantes||0)

})

const clientes = Object.values(clienteMap).sort((a,b)=>b.treinamentos-a.treinamentos)

// ranking instrutores

const instrutorMap={}

treinamentos.forEach(t=>{

const i = t.instrutor || "Instrutor"

if(!instrutorMap[i]){
instrutorMap[i]={instrutor:i,treinamentos:0}
}

instrutorMap[i].treinamentos +=1

})

const instrutores = Object.values(instrutorMap).sort((a,b)=>b.treinamentos-a.treinamentos)

return{

presentes,
ausentes,
justificados,
taxaPresenca,
clientes,
instrutores

}

},[treinamentos,presencas])

return(

<PortalShell
title="Dashboard Estratégico de T&D"
subtitle="Painel executivo com leitura de desempenho do setor"
>

<div style={{
display:"grid",
gridTemplateColumns:"repeat(4,1fr)",
gap:20,
marginBottom:20
}}>

<StatCard
title="Treinamentos"
value={fmt(treinamentos.length)}
/>

<StatCard
title="Participações"
value={fmt(presencas.length)}
/>

<StatCard
title="Presenças"
value={fmt(dados.presentes)}
/>

<StatCard
title="Taxa de presença"
value={`${dados.taxaPresenca}%`}
/>

</div>

<div style={{
display:"grid",
gridTemplateColumns:"1fr 1fr",
gap:20
}}>

<SectionCard
title="Impacto por cliente"
subtitle="Volume de treinamentos por operação"
>

{dados.clientes.map(c=>(
<div key={c.cliente}
style={{
padding:10,
borderBottom:"1px solid #eee"
}}
>

<strong>{c.cliente}</strong>

<div>
Treinamentos: {c.treinamentos}
</div>

<div>
Participantes: {fmt(c.participantes)}
</div>

</div>
))}

</SectionCard>

<SectionCard
title="Ranking de instrutores"
subtitle="Instrutores com maior volume de turmas"
>

{dados.instrutores.slice(0,5).map(i=>(
<div key={i.instrutor}
style={{
padding:10,
borderBottom:"1px solid #eee"
}}
>

<strong>{i.instrutor}</strong>

<div>
Treinamentos ministrados: {i.treinamentos}
</div>

</div>
))}

</SectionCard>

</div>

</PortalShell>

)

}
