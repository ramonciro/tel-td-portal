"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {

  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {

    async function carregar() {

      try {

        const res = await fetch(
          process.env.NEXT_PUBLIC_API_URL + "/api/dashboard"
        );

        if (!res.ok) {
          throw new Error("API não respondeu");
        }

        const json = await res.json();

        setDados(json);

      } catch (e) {

        console.error("Erro dashboard:", e);
        setErro(true);

      }

    }

    carregar();

  }, []);

  if (erro) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Dashboard Tel T&D</h1>
        <p>Erro ao carregar o dashboard</p>
      </div>
    );
  }

  if (!dados) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Dashboard Tel T&D</h1>
        <p>Carregando indicadores...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Dashboard Tel T&D</h1>

      <p>Total de treinamentos: {dados.treinamentos}</p>
      <p>Total de usuários: {dados.usuarios}</p>
      <p>Total de presenças: {dados.presencas}</p>
      <p>Total de avaliações: {dados.avaliacoes}</p>

    </div>
  );

}
    </div>

  )

}
