"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../services/api";

export default function ChamadaTurma({ params }) {

  const { id } = params;

  const [participantes, setParticipantes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {

      const data = await apiFetch(`/presencas/treinamento/${id}`).catch(() => []);

      setParticipantes(Array.isArray(data) ? data : []);

    } finally {
      setLoading(false);
    }
  }

  function alterarStatus(index, status) {

    const copia = [...participantes];
    copia[index].status = status;

    setParticipantes(copia);
  }

  async function salvar() {

    await apiFetch(`/presencas/salvar-lote`, {
      method: "POST",
      body: JSON.stringify({
        treinamento_id: id,
        participantes
      })
    });

    alert("Chamada salva com sucesso");
  }

  if (loading) return <div style={{ padding: 30 }}>Carregando...</div>;

  return (

    <div style={{ padding: 30 }}>

      <h1>Chamada da Turma</h1>

      <table style={table}>

        <thead>
          <tr>
            <th>Participante</th>
            <th>Status</th>
            <th>Justificativa</th>
          </tr>
        </thead>

        <tbody>

          {participantes.map((p, i) => (

            <tr key={i}>

              <td>{p.nome}</td>

              <td style={{ display: "flex", gap: 6 }}>

                <button onClick={() => alterarStatus(i,"presente")} style={btnPresente}>
                  Presente
                </button>

                <button onClick={() => alterarStatus(i,"ausente")} style={btnAusente}>
                  Ausente
                </button>

                <button onClick={() => alterarStatus(i,"justificado")} style={btnJustificado}>
                  Justificado
                </button>

              </td>

              <td>
                <input
                  value={p.justificativa || ""}
                  onChange={(e)=>{
                    const copia=[...participantes];
                    copia[i].justificativa=e.target.value;
                    setParticipantes(copia);
                  }}
                />
              </td>

            </tr>

          ))}

        </tbody>

      </table>

      <button style={btnSalvar} onClick={salvar}>
        Salvar chamada
      </button>

    </div>

  );
}

const table={
  width:"100%",
  borderCollapse:"collapse",
  marginTop:20
}

const btnPresente={
  background:"#16a34a",
  color:"#fff",
  border:0,
  padding:"5px 8px",
  borderRadius:6
}

const btnAusente={
  background:"#dc2626",
  color:"#fff",
  border:0,
  padding:"5px 8px",
  borderRadius:6
}

const btnJustificado={
  background:"#f59e0b",
  color:"#fff",
  border:0,
  padding:"5px 8px",
  borderRadius:6
}

const btnSalvar={
  marginTop:20,
  background:"#2563eb",
  color:"#fff",
  padding:"10px 16px",
  borderRadius:8,
  border:0,
  fontWeight:700
}
