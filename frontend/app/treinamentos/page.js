"use client";

import { useEffect, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import AccessGate from "../../components/AccessGate";
import { apiFetch } from "../../services/api";

export default function TreinamentosPage() {

  const [clientes,setClientes] = useState([]);
  const [instrutores,setInstrutores] = useState([]);

  useEffect(()=>{

    carregar();

  },[]);

  async function carregar(){

    try{

      const clientesData = await apiFetch("/clientes").catch(()=>[]);
      const usuariosData = await apiFetch("/usuarios").catch(()=>[]);

      setClientes(clientesData || []);

      const listaInstrutores = (usuariosData || []).filter(u =>
        ["instrutor","coordenador"].includes((u.perfil || "").toLowerCase())
      );

      setInstrutores(listaInstrutores);

    }catch{

      setClientes([]);
      setInstrutores([]);

    }

  }

  const clienteOptions = clientes.map(c => ({
    value: c.nome,
    label: c.nome
  }));

  const instrutorOptions = instrutores.map(i => ({
    value: i.nome,
    label: i.nome
  }));

  const fields = [

    {
      name:"tema",
      label:"Tema",
      placeholder:"Tema do treinamento"
    },

    {
      name:"cliente",
      label:"Cliente",
      type:"select",
      options:clienteOptions
    },

    {
      name:"instrutor",
      label:"Instrutor",
      type:"select",
      options:instrutorOptions
    },

    {
      name:"data",
      label:"Data",
      type:"date"
    },

    {
      name:"carga_horaria",
      label:"Carga horária",
      placeholder:"Ex: 2h"
    },

    {
      name:"participantes",
      label:"Participantes",
      type:"number"
    }

  ];

  const columns = [

    {
      key:"tema",
      label:"Treinamento"
    },

    {
      key:"cliente",
      label:"Cliente"
    },

    {
      key:"instrutor",
      label:"Instrutor"
    },

    {
      key:"data",
      label:"Data"
    },

    {
      key:"participantes",
      label:"Participantes"
    },

    {
      key:"acoes",
      label:"Ações",
      render:(item)=>(

        <div style={{display:"flex",gap:8}}>

          <button
            style={btnChamada}
            onClick={()=>{

              window.location.href = `/turmas/${item.id}`;

            }}
          >
            Chamada
          </button>

        </div>

      )
    }

  ];

  return(

    <AccessGate allowed={["admin","coordenador","supervisor","instrutor"]}>

      <CrudPageV2
        title="Treinamentos"
        subtitle="Gestão das turmas e treinamentos realizados."
        endpoint="/treinamentos"
        fields={fields}
        columns={columns}
        recordsTitle="Treinamentos cadastrados"
        recordsSubtitle="Base de treinamentos do portal"
      />

    </AccessGate>

  );

}

const btnChamada = {

  background:"#2563eb",
  color:"#fff",
  border:0,
  borderRadius:6,
  padding:"6px 10px",
  cursor:"pointer",
  fontWeight:600

};
