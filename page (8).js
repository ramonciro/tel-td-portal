"use client";
import { useEffect, useState } from "react"
import PortalShell from "../../components/PortalShell"
import { apiFetch } from "../../services/api"

export default function InicioPage() {
  const [data, setData] = useState(null); const [erro, setErro] = useState("")
  useEffect(() => { apiFetch("/dashboard").then(setData).catch((e) => setErro(e.message || "Erro ao carregar dashboard executivo")) }, [])
  return (
    <PortalShell title="Dashboard Executivo" subtitle="Visão estratégica do Treinamento e Desenvolvimento">
      {erro ? <div style={errorBox}>{erro}</div> : null}
      <div style={grid}>
        <Card title="Clientes" value={data?.clientes || 0} /><Card title="Usuários" value={data?.usuarios || 0} />
        <Card title="Treinamentos" value={data?.treinamentos || 0} /><Card title="Presenças" value={data?.presencas || 0} />
        <Card title="Avaliações" value={data?.avaliacoes || 0} /><Card title="Biblioteca" value={data?.biblioteca || 0} />
        <Card title="Trilhas" value={data?.trilhas || 0} />
      </div>
    </PortalShell>
  )
}
function Card({ title, value }) { return <div style={card}><div style={{ color: "#64748b", fontSize: 14 }}>{title}</div><div style={{ fontSize: 32, fontWeight: 700, marginTop: 8 }}>{value}</div></div> }
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }
const card = { background: "#fff", padding: 20, borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.08)" }
const errorBox = { background: "#fef2f2", color: "#b91c1c", padding: 12, borderRadius: 10, marginBottom: 16 }
