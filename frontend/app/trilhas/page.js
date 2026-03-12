
"use client";

import { useState, useMemo } from "react";
import PortalShell from "../../components/PortalShell";

const initialForm = {
  id: "",
  cliente: "",
  titulo: "",
  descricao: "",
  carga_horaria_estimada: "",
  publico: "todos",
  status: "ativo"
};

export default function TrilhasPage() {

  const [trilhas, setTrilhas] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [busca, setBusca] = useState("");

  function handleChange(e){
    const {name,value} = e.target;
    setForm(prev => ({...prev,[name]:value}));
  }

  function salvar(e){
    e.preventDefault();

    if(form.id){
      setTrilhas(prev =>
        prev.map(t => t.id === form.id ? form : t)
      );
    } else {
      setTrilhas(prev => [
        ...prev,
        { ...form, id: Date.now() }
      ]);
    }

    setForm(initialForm);
  }

  function editar(item){
    setForm(item);
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function excluir(id){
    if(!confirm("Deseja excluir esta trilha?")) return;
    setTrilhas(prev => prev.filter(t => t.id !== id));
  }

  const trilhasFiltradas = useMemo(()=>{
    return trilhas.filter(t =>
      t.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      t.cliente.toLowerCase().includes(busca.toLowerCase())
    )
  },[trilhas,busca])

  const resumo = {
    total: trilhas.length,
    ativas: trilhas.filter(t=>t.status==="ativo").length,
    desenvolvimento: trilhas.filter(t=>t.status==="em desenvolvimento").length,
    arquivadas: trilhas.filter(t=>t.status==="arquivado").length
  };

  return (
    <PortalShell
      title="Trilhas de Desenvolvimento"
      subtitle="Planejamento contínuo de desenvolvimento pessoal e profissional"
    >

      <div style={hero}>
        <div>
          <h2 style={{margin:0}}>Jornadas de aprendizagem contínua</h2>
          <p style={{color:"#475569"}}>
            Organize sequências de desenvolvimento para treinandos,
            instrutores e operação. Cada trilha representa uma jornada
            estruturada de aprendizagem.
          </p>
        </div>
      </div>

      <div style={cards}>
        <MiniCard title="Total de Trilhas" value={resumo.total}/>
        <MiniCard title="Ativas" value={resumo.ativas}/>
        <MiniCard title="Em Desenvolvimento" value={resumo.desenvolvimento}/>
        <MiniCard title="Arquivadas" value={resumo.arquivadas}/>
      </div>

      <div style={panel}>
        <h3>{form.id ? "Editar Trilha" : "Nova Trilha"}</h3>

        <form onSubmit={salvar} style={formGrid}>

          <input
            name="titulo"
            placeholder="Nome da trilha"
            value={form.titulo}
            onChange={handleChange}
            style={input}
          />

          <input
            name="cliente"
            placeholder="Cliente"
            value={form.cliente}
            onChange={handleChange}
            style={input}
          />

          <input
            name="carga_horaria_estimada"
            placeholder="Carga horária estimada"
            value={form.carga_horaria_estimada}
            onChange={handleChange}
            style={input}
          />

          <select name="publico" value={form.publico} onChange={handleChange} style={input}>
            <option value="todos">todos</option>
            <option value="instrutor">instrutor</option>
            <option value="supervisor">supervisor</option>
            <option value="operacao">operação</option>
            <option value="treinandos">treinandos</option>
          </select>

          <select name="status" value={form.status} onChange={handleChange} style={input}>
            <option value="ativo">ativo</option>
            <option value="em desenvolvimento">em desenvolvimento</option>
            <option value="arquivado">arquivado</option>
          </select>

          <textarea
            name="descricao"
            placeholder="Descrição da trilha e objetivos de desenvolvimento"
            value={form.descricao}
            onChange={handleChange}
            style={{...input,minHeight:100}}
          />

          <div style={{display:"flex",gap:10}}>
            <button type="submit" style={primaryBtn}>Salvar</button>
            <button type="button" style={secondaryBtn} onClick={()=>setForm(initialForm)}>Limpar</button>
          </div>

        </form>
      </div>

      <div style={panel}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
          <h3 style={{margin:0}}>Trilhas cadastradas</h3>
          <input
            placeholder="Buscar trilha"
            value={busca}
            onChange={(e)=>setBusca(e.target.value)}
            style={{...input,maxWidth:220}}
          />
        </div>

        <div style={grid}>
          {trilhasFiltradas.map(item => (
            <div key={item.id} style={card}>
              <div style={cardTitle}>{item.titulo}</div>
              <div style={cardClient}>{item.cliente}</div>

              <p style={{fontSize:14,color:"#475569"}}>
                {item.descricao || "Sem descrição"}
              </p>

              <div style={badge}>{item.status}</div>

              <div style={{display:"flex",gap:8,marginTop:10}}>
                <button style={miniBtn} onClick={()=>editar(item)}>Editar</button>
                <button style={dangerBtn} onClick={()=>excluir(item.id)}>Excluir</button>
              </div>
            </div>
          ))}
        </div>

      </div>

    </PortalShell>
  )
}

function MiniCard({title,value}){
  return (
    <div style={miniCard}>
      <div style={{fontSize:12,color:"#64748b"}}>{title}</div>
      <div style={{fontSize:24,fontWeight:"bold"}}>{value}</div>
    </div>
  )
}

const hero = {
  background:"#f1f5f9",
  padding:20,
  borderRadius:16,
  marginBottom:18
}

const cards = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",
  gap:14,
  marginBottom:18
}

const miniCard = {
  background:"#fff",
  padding:16,
  borderRadius:12,
  border:"1px solid #e2e8f0"
}

const panel = {
  background:"#fff",
  padding:22,
  borderRadius:16,
  marginBottom:18,
  border:"1px solid #e2e8f0"
}

const formGrid = {
  display:"grid",
  gap:10
}

const input = {
  padding:10,
  borderRadius:8,
  border:"1px solid #cbd5e1"
}

const grid = {
  display:"grid",
  gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",
  gap:14
}

const card = {
  border:"1px solid #e2e8f0",
  borderRadius:14,
  padding:16,
  background:"#fff"
}

const cardTitle = {
  fontWeight:"bold",
  fontSize:16
}

const cardClient = {
  fontSize:12,
  color:"#64748b",
  marginBottom:6
}

const badge = {
  background:"#dbeafe",
  padding:"4px 10px",
  borderRadius:999,
  fontSize:12,
  display:"inline-block"
}

const primaryBtn = {
  background:"#2563eb",
  color:"#fff",
  border:0,
  padding:"10px 14px",
  borderRadius:8
}

const secondaryBtn = {
  background:"#e2e8f0",
  border:0,
  padding:"10px 14px",
  borderRadius:8
}

const miniBtn = {
  background:"#e0f2fe",
  border:0,
  padding:"6px 10px",
  borderRadius:8
}

const dangerBtn = {
  background:"#fee2e2",
  border:0,
  padding:"6px 10px",
  borderRadius:8
}
