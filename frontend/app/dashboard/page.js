"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";

export default function DashboardPage() {

  const [dados, setDados] = useState({
    totalClientes: 0,
    totalUsuarios: 0,
    totalTreinamentos: 0,
    totalPresencas: 0,
    totalAvaliacoes: 0,
    npsMedio: 0,
    qualidadeMedia: 0,
    assiduidadeMedia: 0,
    treinamentosRecentes: []
  });

  const [erro, setErro] = useState("");

  useEffect(() => {

    async function carregar() {

      try {

        const token = localStorage.getItem("token");
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;

        if (!token) {
          setErro("Sessão expirada. Faça login novamente.");
          return;
        }

        const res = await fetch(`${apiUrl}/dashboard`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!res.ok) {
          setErro("Erro ao consultar API do dashboard.");
          return;
        }

        const json = await res.json();

        setDados({
          ...dados,
          ...json
        });

      } catch (e) {

        setErro("Falha ao carregar indicadores.");

      }

    }

    carregar();

  }, []);

  return (

    <PortalShell
      title="Dashboard"
      subtitle="Indicadores estratégicos de Treinamento e Desenvolvimento"
    >

      {erro && (
        <div style={{background:"#fff",padding:20,borderRadius:10}}>
          {erro}
        </div>
      )}

      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
        gap:16
      }}>

        <Card titulo="Clientes" valor={dados.totalClientes}/>
        <Card titulo="Usuários" valor={dados.totalUsuarios}/>
        <Card titulo="Treinamentos" valor={dados.totalTreinamentos}/>
        <Card titulo="Presenças" valor={dados.totalPresencas}/>
        <Card titulo="Avaliações" valor={dados.totalAvaliacoes}/>
        <Card titulo="NPS Médio" valor={dados.npsMedio}/>
        <Card titulo="Qualidade Média" valor={dados.qualidadeMedia}/>
        <Card titulo="Assiduidade %" valor={dados.assiduidadeMedia}/>

      </div>

    </PortalShell>

  );

}

function Card({titulo,valor}){

  return(

    <div style={{
      background:"#fff",
      padding:20,
      borderRadius:14,
      boxShadow:"0 1px 3px rgba(0,0,0,0.08)"
    }}>

      <div style={{fontSize:14,color:"#64748b"}}>
        {titulo}
      </div>

      <div style={{fontSize:28,fontWeight:"bold"}}>
        {valor ?? 0}
      </div>

    </div>

  )

}
