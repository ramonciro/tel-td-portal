"use client";

import { useState, useMemo } from "react";
import { BarraHorizontal, Donut, GraficoLinha, Funil } from "../../components/Charts";
import CrudPageV2 from "../../components/CrudPageV2";
import { apiFetch } from "../../services/api";

// ─── helpers ───────────────────────────────────────────────────────────────
function fmt(n) { return Number(n || 0).toLocaleString("pt-BR"); }
function parseHoras(v) {
  if (!v) return 0;
  const s = String(v).replace(",", ".").trim();
  const m = s.match(/^(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}
function getStatusCode(item) {
  const status = String(item?.status || "").trim().toLowerCase();
  if (["cancelado","cancelada"].includes(status)) return "cancelada";
  if (["concluido","concluída","concluida"].includes(status)) return "concluido";
  if (["planejado","planejada"].includes(status)) return "planejado";
  const today = new Date(); today.setHours(0,0,0,0);
  const fim = (() => { const s = String(item?.data_fim||"").slice(0,10); if(!s) return null; const [y,m,d]=s.split("-"); return new Date(+y,+m-1,+d); })();
  if (fim && fim.getTime() < today.getTime()) return "concluido";
  return "em_andamento";
}
function parseDateOnly(s) { if(!s) return null; const str=String(s).trim(); const m=str.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return new Date(+m[1],+m[2]-1,+m[3]); const b=str.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if(b) return new Date(+b[3],+b[2]-1,+b[1]); return null; }
function formatDateSafe(v) { const d=parseDateOnly(v); if(!d||isNaN(d)) return v||"—"; return d.toLocaleDateString("pt-BR"); }
function normalizeStatusCode(s) { const v=String(s||"").trim().toLowerCase(); if(["concluido","concluída","concluida"].includes(v)) return "concluido"; if(["cancelado","cancelada"].includes(v)) return "cancelada"; if(["planejado","planejada"].includes(v)) return "planejado"; return "em_andamento"; }
function normalizeStatus(s) { const v=normalizeStatusCode(s); return ({concluido:"Concluída",cancelada:"Cancelada",planejado:"Planejada",em_andamento:"Em andamento"})[v]||s||"—"; }

export default function TreinamentosPage() {
  const [turmas, setTurmas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [filtroPeriodoInicio, setFiltroPeriodoInicio] = useState("");
  const [filtroPeriodoFim, setFiltroPeriodoFim] = useState("");

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = turmas.length;
    const planejadas = turmas.filter((item) => getStatusCode(item) === "planejado").length;
    const andamento = turmas.filter((item) => getStatusCode(item) === "em_andamento").length;
    const concluidas = turmas.filter((item) => getStatusCode(item) === "concluido").length;
    const canceladas = turmas.filter((item) => getStatusCode(item) === "cancelada").length;
    const treinandos = turmas.reduce((acc,item) => acc+Number(item.participantes||0),0);
    const horas = turmas.reduce((acc,item) => acc+parseHoras(item.carga_horaria),0);
    const horasRealizadas = turmas.filter((item) => getStatusCode(item)==="concluido").reduce((acc,item) => acc+parseHoras(item.carga_horaria),0);
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const atrasadas = turmas.filter((item) => {
      const sc = getStatusCode(item);
      if(sc==="concluido"||sc==="cancelada") return false;
      const df = parseDateOnly(item?.data_fim);
      return df && df.getTime() < hoje.getTime();
    }).length;
    return { total, planejadas, andamento, concluidas, canceladas, treinandos, horas, horasRealizadas, atrasadas };
  }, [turmas]);

  // ── Dados para gráficos ───────────────────────────────────────────────────
  const graficos = useMemo(() => {
    // Por cliente
    const byCliente = new Map();
    for (const t of turmas) {
      const cl = t.cliente||"Sem cliente";
      if (!byCliente.has(cl)) byCliente.set(cl,{cliente:cl,total:0,concluidas:0,horas:0,treinandos:0});
      const e = byCliente.get(cl);
      e.total++;
      if(getStatusCode(t)==="concluido") e.concluidas++;
      e.horas += parseHoras(t.carga_horaria);
      e.treinandos += Number(t.participantes||0);
    }
    const porCliente = Array.from(byCliente.values()).map(e=>({...e, taxa_conclusao: e.total>0?Math.round((e.concluidas/e.total)*100):0}));

    // Por instrutor
    const byInstrutor = new Map();
    for (const t of turmas) {
      const inst = t.instrutor||"Sem instrutor";
      if(!byInstrutor.has(inst)) byInstrutor.set(inst,{instrutor:inst,total:0,concluidas:0,treinandos:0});
      const e=byInstrutor.get(inst);
      e.total++;
      if(getStatusCode(t)==="concluido") e.concluidas++;
      e.treinandos+=Number(t.participantes||0);
    }
    const porInstrutor = Array.from(byInstrutor.values()).sort((a,b)=>b.total-a.total);

    // Evolução mensal
    const byMes = new Map();
    for (const t of turmas) {
      const raw = t.data_inicio||t.data;
      if(!raw) continue;
      const mes = String(raw).slice(0,7);
      if(!byMes.has(mes)) byMes.set(mes,{mes,turmas:0,concluidas:0,treinandos:0,horas:0});
      const e=byMes.get(mes);
      e.turmas++;
      if(getStatusCode(t)==="concluido") e.concluidas++;
      e.treinandos+=Number(t.participantes||0);
      e.horas+=parseHoras(t.carga_horaria);
    }
    const evolucao = Array.from(byMes.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>({...v,taxa_conclusao:v.turmas>0?Math.round((v.concluidas/v.turmas)*100):0}));

    return { porCliente, porInstrutor, evolucao };
  }, [turmas]);

  // ── Filtro de período ─────────────────────────────────────────────────────
  const filtrarPorPeriodo = useMemo(() => {
    if(!filtroPeriodoInicio && !filtroPeriodoFim) return null;
    return (item) => {
      const inicio = parseDateOnly(item.data_inicio||item.data);
      const fim = parseDateOnly(item.data_fim);
      const fi = filtroPeriodoInicio ? parseDateOnly(filtroPeriodoInicio) : null;
      const ff = filtroPeriodoFim ? parseDateOnly(filtroPeriodoFim) : null;
      if(fi && inicio && inicio.getTime()<fi.getTime()) return false;
      if(ff && (fim?fim.getTime()>ff.getTime():inicio&&inicio.getTime()>ff.getTime())) return false;
      return true;
    };
  }, [filtroPeriodoInicio, filtroPeriodoFim]);

  // ── Colunas ───────────────────────────────────────────────────────────────
  const instrutores = useMemo(()=>[...new Set(turmas.map(t=>t.instrutor).filter(Boolean))].sort(),[turmas]);
  const supervisores = useMemo(()=>[...new Set(turmas.map(t=>t.supervisor).filter(Boolean))].sort(),[turmas]);

  const badgeStatus = (item) => {
    const sc = getStatusCode(item);
    const cores = { concluido:["#dcfce7","#15803d"], em_andamento:["#eff6ff","#1d4ed8"], planejado:["#fef9c3","#92400e"], cancelada:["#fee2e2","#991b1b"] };
    const [bg,color] = cores[sc]||["#f3f4f6","#374151"];
    return <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:999,background:bg,color}}>{normalizeStatus(item.status)}</span>;
  };

  const columns = [
    { key:"tema", label:"Tema", render:(item)=><span style={{fontWeight:600}}>{item.tema||"—"}</span> },
    { key:"cliente", label:"Cliente" },
    { key:"instrutor", label:"Instrutor" },
    { key:"periodo", label:"Período", render:(item)=>(
      <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>
        {formatDateSafe(item.data_inicio||item.data)}
        {item.data_fim?` até ${formatDateSafe(item.data_fim)}`:""}
      </span>
    )},
    { key:"status", label:"Status", render:badgeStatus },
    { key:"acoes", label:"Ações", render:(item)=>{
      const sc=getStatusCode(item);
      const hoje=new Date(); hoje.setHours(0,0,0,0);
      const df=parseDateOnly(item?.data_fim);
      const atrasada=sc!=="concluido"&&sc!=="cancelada"&&df&&df.getTime()<hoje.getTime();
      return (
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {atrasada&&<span style={{fontSize:11,fontWeight:500,color:"#b91c1c",background:"#fee2e2",borderRadius:999,padding:"2px 8px",alignSelf:"flex-start"}}>Prazo vencido</span>}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button style={{fontSize:12,padding:"5px 12px",borderRadius:6,background:"#3b82f6",color:"#fff",border:"none",cursor:"pointer"}} onClick={()=>{window.location.href=`/turma/${item.id}`;}}>Gestão da turma</button>
            <button style={{fontSize:12,padding:"5px 12px",borderRadius:6,background:"var(--color-background-secondary)",color:"var(--color-text-primary)",border:"0.5px solid var(--color-border-secondary)",cursor:"pointer"}} onClick={()=>{window.location.href=`/turma/${item.id}/cronograma`;}}>Cronograma</button>
          </div>
        </div>
      );
    }},
  ];

  const fields = [
    {name:"tema",label:"Tema",type:"text",required:true},
    {name:"cliente",label:"Cliente",type:"select",options:[...new Set(clientes.map(c=>c.nome||c).filter(Boolean))].sort()},
    {name:"instrutor",label:"Instrutor",type:"select",options:instrutores},
    {name:"supervisor",label:"Supervisor",type:"select",options:supervisores},
    {name:"data_inicio",label:"Data início",type:"date"},
    {name:"data_fim",label:"Data fim",type:"date"},
    {name:"carga_horaria",label:"Carga horária",type:"text",placeholder:"Ex: 8h"},
    {name:"participantes",label:"Participantes previstos",type:"number"},
    {name:"publico",label:"Público",type:"text"},
    {name:"status",label:"Status",type:"select",options:["planejado","em_andamento","concluido","cancelado"]},
    {name:"descricao",label:"Descrição / Observações",type:"textarea"},
  ];

  const hero = (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>
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
        <div key={i} style={{background:"var(--color-background-primary)",border:`2px solid ${k.accent}`,borderTop:`4px solid ${k.accent}`,borderRadius:10,padding:"14px 16px"}}>
          <div style={{fontSize:10,fontWeight:700,color:k.accent,textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>{k.label}</div>
          <div style={{fontSize:22,fontWeight:800,color:"var(--color-text-primary)",marginBottom:2}}>{k.val}</div>
          <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>{k.sub}</div>
        </div>
      ))}
    </div>
  );

  const graficosSection = (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16,marginTop:8,marginBottom:24}}>

      {graficos.evolucao.length>1&&(
        <div style={{gridColumn:"1/-1",background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:20}}>
          <p style={{fontSize:13,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Evolução mensal de turmas</p>
          <GraficoLinha dados={graficos.evolucao} eixoX="mes" linhas={[
            {key:"turmas",label:"Turmas",cor:"#3b82f6"},
            {key:"concluidas",label:"Concluídas",cor:"#16a34a"},
            {key:"taxa_conclusao",label:"Taxa conclusão %",cor:"#f59e0b",sufixo:"%"},
          ]} />
        </div>
      )}

      <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:20}}>
        <p style={{fontSize:13,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Status das turmas</p>
        <Donut total={kpis.total} fatias={[
          {label:"Concluídas",valor:kpis.concluidas,cor:"#16a34a"},
          {label:"Em andamento",valor:kpis.andamento,cor:"#3b82f6"},
          {label:"Planejadas",valor:kpis.planejadas,cor:"#f59e0b"},
          {label:"Canceladas",valor:kpis.canceladas,cor:"#ef4444"},
        ].filter(f=>f.valor>0)} />
      </div>

      <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:20}}>
        <p style={{fontSize:13,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Funil de treinandos</p>
        <Funil etapas={[
          {label:"Previstos",valor:kpis.treinandos,cor:"#3b82f6"},
          {label:"Em turmas ativas",valor:turmas.filter(t=>getStatusCode(t)==="em_andamento").reduce((a,t)=>a+Number(t.participantes||0),0),cor:"#8b5cf6"},
          {label:"Em turmas concluídas",valor:turmas.filter(t=>getStatusCode(t)==="concluido").reduce((a,t)=>a+Number(t.participantes||0),0),cor:"#16a34a"},
        ]} />
      </div>

      {graficos.porCliente.length>0&&(
        <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:20}}>
          <p style={{fontSize:13,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Taxa de conclusão por cliente</p>
          <BarraHorizontal dados={graficos.porCliente} labelKey="cliente" valueKey="taxa_conclusao" cor="#16a34a" sufixo="%" />
        </div>
      )}

      {graficos.porInstrutor.length>0&&(
        <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:20}}>
          <p style={{fontSize:13,fontWeight:700,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:".05em",marginBottom:14}}>Turmas por instrutor</p>
          <BarraHorizontal dados={graficos.porInstrutor} labelKey="instrutor" valueKey="total" cor="#8b5cf6" sufixo=" turmas" />
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
      filterFn={filtrarPorPeriodo}
      extraHeaderContent={
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:12}}>
          <span style={{fontSize:13,color:"var(--color-text-secondary)",fontWeight:500}}>Período:</span>
          <input type="date" value={filtroPeriodoInicio} onChange={e=>setFiltroPeriodoInicio(e.target.value)} style={{fontSize:13,padding:"5px 10px",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}} />
          <span style={{fontSize:13,color:"var(--color-text-secondary)"}}>até</span>
          <input type="date" value={filtroPeriodoFim} onChange={e=>setFiltroPeriodoFim(e.target.value)} style={{fontSize:13,padding:"5px 10px",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)"}} />
          {(filtroPeriodoInicio||filtroPeriodoFim)&&(
            <button onClick={()=>{setFiltroPeriodoInicio("");setFiltroPeriodoFim("");}} style={{fontSize:12,padding:"5px 10px",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",color:"var(--color-text-secondary)",cursor:"pointer"}}>Limpar</button>
          )}
        </div>
      }
      hero={hero}
      extraContent={graficosSection}
      onDataLoad={(data)=>{
        setTurmas(data||[]);
        apiFetch("/usuarios").then(u=>setUsuarios(Array.isArray(u)?u:[])).catch(()=>{});
        apiFetch("/clientes").then(cl=>setClientes(Array.isArray(cl)?cl:[])).catch(()=>{});
        const me = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("usuario")||"null") : null;
        setUsuarioLogado(me);
      }}
      transformFormToPayload={(payload,form)=>({
        ...payload,
        status: form.status||payload.status||"planejado",
      })}
      transformRecordToForm={(record)=>({
        ...record,
        status: record.status||"planejado",
      })}
    />
  );
}
