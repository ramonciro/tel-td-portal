"use client";

import { useState } from "react";
import PortalShell from "../../components/PortalShell";

const etapas = [
  "Integração",
  "Fundamentos",
  "Aplicação",
  "Acompanhamento",
  "Aprimoramento contínuo"
];

const initialForm = {
  id: "",
  colaborador: "",
  cliente: "",
  cargo: "",
  objetivo: "",
  trilha: "",
  etapa: "Integração",
  progresso: 0,
  proximo: "",
  mentor: "",
  observacoes: ""
};

export default function MapaDesenvolvimento(){

const [dados,setDados] = useState([])
const [form,setForm] = useState(initialForm)

function handleChange(e){
const {name,value} = e.target
setForm(prev=>({...prev,[name]:value}))
}

function salvar(e){
e.preventDefault()

if(form.id){
setDados(prev=>prev.map(d=>d.id===form.id?form:d))
}else{
setDados(prev=>[...prev,{...form,id:Date.now()}])
}

setForm(initialForm)
}

function editar(item){
setForm(item)
}

function excluir(id){
if(!confirm("Deseja excluir este mapa?")) return
setDados(prev=>prev.filter(d=>d.id!==id))
}

return(
<PortalShell title="Mapa de Desenvolvimento" subtitle="Evolução pessoal e profissional contínua">

<div style={hero}>
<h2>Jornada de desenvolvimento</h2>
<p>Planeje a evolução dos colaboradores de forma contínua.</p>
</div>

<div style={panel}>
<h3>Novo mapa de desenvolvimento</h3>

<form onSubmit={salvar} style={grid}>

<input name="colaborador" placeholder="Colaborador" value={form.colaborador} onChange={handleChange} style={input}/>

<input name="cliente" placeholder="Cliente / Operação" value={form.cliente} onChange={handleChange} style={input}/>

<input name="cargo" placeholder="Cargo" value={form.cargo} onChange={handleChange} style={input}/>

<input name="mentor" placeholder="Mentor / Responsável" value={form.mentor} onChange={handleChange} style={input}/>

<input name="trilha" placeholder="Trilha atual" value={form.trilha} onChange={handleChange} style={input}/>

<select name="etapa" value={form.etapa} onChange={handleChange} style={input}>
{etapas.map(e=><option key={e}>{e}</option>)}
</select>

<input name="progresso" type="number" min="0" max="100" placeholder="Progresso %" value={form.progresso} onChange={handleChange} style={input}/>

<input name="proximo" placeholder="Próximo passo" value={form.proximo} onChange={handleChange} style={input}/>

<textarea name="objetivo" placeholder="Objetivo profissional" value={form.objetivo} onChange={handleChange} style={input}/>

<textarea name="observacoes" placeholder="Observações" value={form.observacoes} onChange={handleChange} style={input}/>

<button style={btn}>Salvar</button>

</form>
</div>

<div style={cards}>

{dados.map(item=>(

<div key={item.id} style={card}>

<div style={title}>{item.colaborador}</div>
<div style={meta}>{item.cargo} • {item.cliente}</div>

<p>{item.objetivo}</p>

<div style={timeline}>
{etapas.map(e=>(
<span key={e} style={e===item.etapa?active:etapa}>{e}</span>
))}
</div>

<div style={progress}>
<div style={{...progressBar,width:item.progresso+"%"}}></div>
</div>

<div>Próximo passo: {item.proximo}</div>

<button onClick={()=>editar(item)} style={mini}>Editar</button>
<button onClick={()=>excluir(item.id)} style={danger}>Excluir</button>

</div>

))}

</div>

</PortalShell>
)
}

const hero={background:"#f1f5f9",padding:20,borderRadius:10,marginBottom:20}
const panel={background:"#fff",padding:20,borderRadius:10,border:"1px solid #e2e8f0",marginBottom:20}
const grid={display:"grid",gap:10}
const input={padding:10,border:"1px solid #cbd5e1",borderRadius:6}
const cards={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}
const card={background:"#fff",padding:16,borderRadius:10,border:"1px solid #e2e8f0"}
const title={fontWeight:"bold"}
const meta={fontSize:12,color:"#64748b",marginBottom:6}
const timeline={display:"flex",gap:6,flexWrap:"wrap",marginTop:10}
const etapa={fontSize:11,padding:"4px 8px",background:"#e2e8f0",borderRadius:999}
const active={fontSize:11,padding:"4px 8px",background:"#2563eb",color:"#fff",borderRadius:999}
const progress={background:"#e2e8f0",height:8,borderRadius:999,marginTop:10}
const progressBar={background:"#2563eb",height:"100%",borderRadius:999}
const btn={background:"#2563eb",color:"#fff",border:0,padding:"10px",borderRadius:6}
const mini={background:"#e0f2fe",border:0,padding:"6px 10px",borderRadius:6,marginRight:6}
const danger={background:"#fee2e2",border:0,padding:"6px 10px",borderRadius:6}
