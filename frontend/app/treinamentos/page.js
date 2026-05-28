"use client";

import { useState, useMemo } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import { BarraHorizontal, Donut, GraficoLinha, Funil } from "../../components/Charts";
import { apiFetch } from "../../services/api";

function fmt(n) { return Number(n||0).toLocaleString("pt-BR"); }
function parseHoras(v) { if(!v) return 0; const m=String(v).replace(",",".").match(/^(\d+(?:\.\d+)?)/); return m?parseFloat(m[1]):0; }
function parseDateOnly(s) { if(!s) return null; const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return new Date(+m[1],+m[2]-1,+m[3]); const b=String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})/); if(b) return new Date(+b[3],+b[2]-1,+b[1]); return null; }
function formatDateSafe(v) { const d=parseDateOnly(v); if(!d||isNaN(d)) return v||"—"; return d.toLocaleDateString("pt-BR"); }
function getStatusCode(item) {
  const s=String(item?.status||"").trim().toLowerCase();
  if(["cancelado","cancelada"].includes(s)) return "cancelada";
  if(["concluido","concluída","concluida"].includes(s)) return "concluido";
  if(["planejado","planejada"].includes(s)) return "planejado";
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  const fim=parseDateOnly(item?.data_fim);
  if(fim&&fim.getTime()<hoje.getTime()) return "concluido";
  return "em_andamento";
}
function normalizeStatus(s) { return ({concluido:"Concluída",cancelada:"Cancelada",planejado:"Planejada",em_andamento:"Em andamento"})[getStatusCode({status:s})]||s||"—"; }

export default function TreinamentosPage() {
  const [turmas, setTurmas] = useState([]);
  const [filtroPeriodoInicio, setFiltroPeriodoInicio] = useState("");
  const [filtroPeriodoFim, setFiltroPeriodoFim] = useState("");

  const kpis = useMemo(() => {
    const total=turmas.length;
    const concluidas=turmas.filter(t=>getStatusCode(t)==="concluido").length;
    const andamento=turmas.filter(t=>getStatusCode(t)==="em_andamento").length;
    const planejadas=turmas.filter(t=>getStatusCode(t)==="planejado").length;
    const canceladas=turmas.filter(t=>getStatusCode(t)==="cancelada").length;
    const treinandos=turmas.reduce((a,t)=>a+Number(t.participantes||0),0);
    const horas=turmas.reduce((a,t)=>a+parseHoras(t.carga_horaria),0);
    const horasRealizadas=turmas.filter(t=>getStatusCode(t)==="concluido").reduce((a,t)=>a+parseHoras(t.carga_horaria),0);
    const hoje=new Date(); hoje.setHours(0,0,0,0);
    const atrasadas=turmas.filter(t=>{
      const sc=getStatusCode(t);
      if(sc==="concluido"||sc==="cancelada") return false;
      const df=parseDateOnly(t?.data_fim);
      return df&&df.getTime()<hoje.getTime();
    }).length;
    return {total,concluidas,andamento,planejadas,canceladas,treinandos,horas,horasRealizadas,atrasadas};
  },[turmas]);

  const graficos = useMemo(() => {
    const byCliente=new Map();
    const byInstrutor=new Map();
    const byMes=new Map();
    for(const t of turmas){
      const cl=t.cliente||"Sem cliente";
      const inst=t.instrutor||"Sem instrutor";
      const raw=t.data_inicio||t.data;
      const mes=raw?String(raw).slice(0,7):null;
      if(!byCliente.has(cl)) byCliente.set(cl,{cliente:cl,total:0,concluidas:0});
      const ec=byCliente.get(cl); ec.total++; if(getStatusCode(t)==="concluido") ec.concluidas++;
      if(!byInstrutor.has(inst)) byInstrutor.set(inst,{instrutor:inst,total:0});
      byInstrutor.get(inst).total++;
      if(mes){
        if(!byMes.has(mes)) byMes.set(mes,{mes,turmas:0,concluidas:0});
        const em=byMes.get(mes); em.turmas++; if(getStatusCode(t)==="concluido") em.concluidas++;
      }
    }
    const porCliente=Array.from(byCliente.values()).map(e=>({...e,taxa_conclusao:e.total>0?Math.round((e.concluidas/e.total)*100):0}));
    const porInstrutor=Array.from(byInstrutor.values()).sort((a,b)=>b.total-a.total);
    const evolucao=Array.from(byMes.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>({...v,taxa_conclusao:v.turmas>0?Math.round((v.concluidas/v.turmas)*100):0}));
    return {porCliente,porInstrutor,evolucao};
  },[turmas]);

  const filtrarPorPeriodo = useMemo(()=>{
    if(!filtroPeriodoInicio&&!filtroPeriodoFim) return null;
    return (item)=>{
      const inicio=parseDateOnly(item.data_inicio||item.data);
      const fim=parseDateOnly(item.data_fim);
      const fi=filtroPeriodoInicio?parseDateOnly(filtroPeriodoInicio):null;
      const ff=filtroPeriodoFim?parseDateOnly(filtroPeriodoFim):null;
      if(fi&&inicio&&inicio.getTime()<fi.getTime()) return false;
      if(ff&&(fim?fim.getTime()>ff.getTime():inicio&&inicio.getTime()>ff.getTime())) return false;
      return true;
    };
  },[filtroPeriodoInicio,filtroPeriodoFim]);

  const instrutores=useMemo(()=>[...new Set(turmas.map(t=>t.instrutor).filter(Boolean))].sort(),[turmas]);
  const supervisores=useMemo(()=>[...new Set(turmas.map(t=>t.supervisor).filter(Boolean))].sort(),[turmas]);
  const clientes=useMemo(()=>[...new Set(turmas.map(t=>t.cliente).filter(Boolean))].sort(),[turmas]);

  const columns=[
    {key:"tema",label:"Tema",render:(item)=><span style={{fontWeight:700,color:"#0f172a"}}>{item.tema||"—"}</span>},
    {key:"cliente",label:"Cliente",render:(item)=><span style={{color:"#475569"}}>{item.cliente||"—"}</span>},
    {key:"instrutor",label:"Instrutor",render:(item)=><span style={{color:"#475569"}}>{item.instrutor||"—"}</span>},
    {key:"periodo",label:"Período",render:(item)=>(
      <span style={{fontSize:12,color:"#64748b"}}>
        {formatDateSafe(item.data_inicio||item.data)}
        {item.data_fim?` até ${formatDateSafe(item.data_fim)}`:""}
      </span>
    )},
    {key:"status",label:"Status",render:(item)=>{
      const sc=getStatusCode(item);
      const m={concluido:["#dcfce7","#15803d"],em_andamento:["#eff6ff","#1d4ed8"],planejado:["#fef9c3","#92400e"],cancelada:["#fee2e2","#991b1b"]};
      const [bg,color]=m[sc]||["#f3f4f6","#374151"];
      return <span style={{fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:999,background:bg,color}}>{normalizeStatus(item.status)}</span>;
    }},
    {key:"acoes",label:"Ações",render:(item)=>{
      const sc=getStatusCode(item);
      const hoje=new Date(); hoje.setHours(0,0,0,0);
      const df=parseDateOnly(item?.data_fim);
      const atrasada=sc!=="concluido"&&sc!=="cancelada"&&df&&df.getTime()<hoje.getTime();
      return(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {atrasada&&<span style={{fontSize:11,fontWeight:600,color:"#b91c1c",background:"#fee2e2",borderRadius:999,padding:"2px 8px",alignSelf:"flex-start"}}>Prazo vencido</span>}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button style={{fontSize:12,padding:"5px 12px",borderRadius:8,background:"#2563eb",color:"#fff",border:"none",cursor:"pointer"}} onClick={()=>{window.location.href=`/turma/${item.id}`;}}>Gestão da turma</button>
            <button style={{fontSize:12,padding:"5px 12px",borderRadius:8,background:"#f8fafc",color:"#334155",border:"1px solid #cbd5e1",cursor:"pointer"}} onClick={()=>{window.location.href=`/turma/${item.id}/cronograma`;}}>Cronograma</button>
          </div>
        </div>
      );
    }},
  ];

  const fields=[
    {name:"tema",label:"Tema",type:"text",required:true},
    {name:"cliente",label:"Cliente",type:"select",options:clientes.map(v=>({value:v,label:v}))},
    {name:"instrutor",label:"Instrutor",type:"select",options:instrutores.map(v=>({value:v,label:v}))},
    {name:"supervisor",label:"Supervisor",type:"select",options:supervisores.map(v=>({value:v,label:v}))},
    {name:"data_inicio",label:"Data início",type:"date"},
    {name:"data_fim",label:"Data fim",type:"date"},
    {name:"carga_horaria",label:"Carga horária",type:"text",placeholder:"Ex: 8h"},
    {name:"participantes",label:"Participantes previstos",type:"number"},
    {name:"publico",label:"Público",type:"text"},
    {name:"status",label:"Status",type:"select",options:[
      {value:"planejado",label:"Planejada"},
      {value:"em_andamento",label:"Em andamento"},
      {value:"concluido",label:"Concluída"},
      {value:"cancelado",label:"Cancelada"},
    ]},
    {name:"descricao",label:"Descrição / Observações",type:"textarea"},
  ];

  const hero=(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:4}}>
      {[
        {label:"TURMAS",val:fmt(kpis.total),sub:"Base total",accent:"#3b82f6"},
        {label:"PLANEJADAS",val:fmt(kpis.planejadas),sub:"Aguardando execução",accent:"#f59e0b"},
        {label:"EM ANDAMENTO",val:fmt(kpis.andamento),sub:"Turmas ativas",accent:"#3b82f6"},
        {label:"CONCLUÍDAS",val:fmt(kpis.concluidas),sub:"Ações finalizadas",accent:"#16a34a"},
        {label:"TREINANDOS PREVISTOS",val:fmt(kpis.treinandos),sub:"Capacidade da base",accent:"#8b5cf6"},
        {label:"CARGA REALIZADA",val:`${fmt(kpis.horasRealizadas)}h`,sub:`de ${fmt(kpis.horas)}h planejadas`,accent:"#7c3aed"},
        {label:"TAXA DE CONCLUSÃO",val:kpis.total>0?`${Math.round((kpis.concluidas/kpis.total)*100)}%`:"—",sub:"Concluídas / total",accent:"#0f766e"},
        {label:"ATRASADAS",val:fmt(kpis.atrasadas),sub:"Data vencida sem conclusão",accent:kpis.atrasadas>0?"#dc2626":"#334155"},
      ].map((k,i)=>(
        <div key={i} style={{background:"#fff",border:`2px solid ${k.accent}`,borderTop:`4px solid ${k.accent}`,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:10,fontWeight:800,color:k.accent,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>{k.label}</div>
          <div style={{fontSize:22,fontWeight:900,color:"#0f172a",marginBottom:2}}>{k.val}</div>
          <div style={{fontSize:11,color:"#64748b"}}>{k.sub}</div>
        </div>
      ))}
    </div>
  );

  const extraHeaderContent=(
    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
      <span style={{fontSize:13,color:"#64748b",fontWeight:700}}>Período:</span>
      <input type="date" value={filtroPeriodoInicio} onChange={e=>setFiltroPeriodoInicio(e.target.value)} style={{fontSize:13,padding:"5px 10px",borderRadius:10,border:"1px solid #cbd5e1",background:"#fff",color:"#0f172a"}}/>
      <span style={{fontSize:13,color:"#64748b"}}>até</span>
      <input type="date" value={filtroPeriodoFim} onChange={e=>setFiltroPeriodoFim(e.target.value)} style={{fontSize:13,padding:"5px 10px",borderRadius:10,border:"1px solid #cbd5e1",background:"#fff",color:"#0f172a"}}/>
      {(filtroPeriodoInicio||filtroPeriodoFim)&&(
        <button onClick={()=>{setFiltroPeriodoInicio("");setFiltroPeriodoFim("");}} style={{fontSize:12,padding:"5px 10px",borderRadius:10,border:"1px solid #cbd5e1",background:"#f8fafc",color:"#64748b",cursor:"pointer"}}>Limpar</button>
      )}
    </div>
  );

  const extraContent=(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16,marginTop:16}}>
      {graficos.evolucao.length>1&&(
        <div style={{gridColumn:"1/-1",background:"#fff",border:"1px solid #e2e8f0",borderRadius:18,padding:20}}>
          <p style={{fontSize:12,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Evolução mensal de turmas</p>
          <GraficoLinha dados={graficos.evolucao} eixoX="mes" linhas={[
            {key:"turmas",label:"Turmas",cor:"#3b82f6"},
            {key:"concluidas",label:"Concluídas",cor:"#16a34a"},
            {key:"taxa_conclusao",label:"Taxa conclusão %",cor:"#f59e0b",sufixo:"%"},
          ]}/>
        </div>
      )}
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:18,padding:20}}>
        <p style={{fontSize:12,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Status das turmas</p>
        <Donut total={kpis.total} fatias={[
          {label:"Concluídas",valor:kpis.concluidas,cor:"#16a34a"},
          {label:"Em andamento",valor:kpis.andamento,cor:"#3b82f6"},
          {label:"Planejadas",valor:kpis.planejadas,cor:"#f59e0b"},
          {label:"Canceladas",valor:kpis.canceladas,cor:"#ef4444"},
        ].filter(f=>f.valor>0)}/>
      </div>
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:18,padding:20}}>
        <p style={{fontSize:12,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Funil de treinandos</p>
        <Funil etapas={[
          {label:"Previstos",valor:kpis.treinandos,cor:"#3b82f6"},
          {label:"Em turmas ativas",valor:turmas.filter(t=>getStatusCode(t)==="em_andamento").reduce((a,t)=>a+Number(t.participantes||0),0),cor:"#8b5cf6"},
          {label:"Em turmas concluídas",valor:turmas.filter(t=>getStatusCode(t)==="concluido").reduce((a,t)=>a+Number(t.participantes||0),0),cor:"#16a34a"},
        ]}/>
      </div>
      {graficos.porCliente.length>0&&(
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:18,padding:20}}>
          <p style={{fontSize:12,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Taxa de conclusão por cliente</p>
          <BarraHorizontal dados={graficos.porCliente} labelKey="cliente" valueKey="taxa_conclusao" cor="#16a34a" sufixo="%"/>
        </div>
      )}
      {graficos.porInstrutor.length>0&&(
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:18,padding:20}}>
          <p style={{fontSize:12,fontWeight:800,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Turmas por instrutor</p>
          <BarraHorizontal dados={graficos.porInstrutor} labelKey="instrutor" valueKey="total" cor="#8b5cf6" sufixo=" turmas"/>
        </div>
      )}
    </div>
  );

  return (
    <CrudPageV2
      title="Gestão de Turmas"
      subtitle="Execução operacional das turmas com período de formação e controle de chamada diária."
      endpoint="/treinamentos"
      fields={fields}
      columns={columns}
      hero={hero}
      recordsTitle="Turmas cadastradas"
      recordsSubtitle="Lista completa com filtros e ações"
      extraHeaderContent={extraHeaderContent}
      extraContent={extraContent}
      filterFn={filtrarPorPeriodo}
      onDataLoad={(data)=>setTurmas(data||[])}
      transformFormToPayload={(payload,form)=>({
        ...payload,
        status:form.status||payload.status||"planejado",
      })}
      transformRecordToForm={(form)=>({
        ...form,
        status:form.status||"planejado",
      })}
    />
  );
}
