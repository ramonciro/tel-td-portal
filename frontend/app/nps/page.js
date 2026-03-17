"use client";

import { useEffect, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function classificar(nota) {
  if (nota >= 9) return "Promotor";
  if (nota >= 7) return "Neutro";
  return "Detrator";
}

export default function NpsPage() {
  const [dados, setDados] = useState([]);

  useEffect(() => {
    apiFetch("/avaliacoes-treinandos").then(setDados);
  }, []);

  const total = dados.length;
  const promotores = dados.filter((d) => d.nota_nps >= 9).length;
  const detratores = dados.filter((d) => d.nota_nps <= 6).length;

  const nps = total ? Math.round((promotores / total) * 100 - (detratores / total) * 100) : 0;

  const fields = [
    { name: "treinamento_id", label: "Turma", type: "number" },
    { name: "treinando_nome", label: "Treinando" },
    { name: "nota_nps", label: "Nota NPS (0-10)", type: "number" },
    { name: "comentario", label: "Comentário", type: "textarea" },
  ];

  const columns = [
    { key: "treinando_nome", label: "Treinando" },
    { key: "nota_nps", label: "Nota" },
    {
      key: "classificacao",
      label: "Classificação",
      render: (item) => classificar(item.nota_nps),
    },
  ];

  return (
    <CrudPageV2
      title="Satisfação do Treinando (NPS)"
      subtitle="Avaliação real de satisfação do treinamento"
      endpoint="/avaliacoes-treinandos"
      fields={fields}
      columns={columns}
      hero={
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <StatCard title="NPS" value={nps} />
          <StatCard title="Promotores" value={promotores} />
          <StatCard title="Detratores" value={detratores} />
        </div>
      }
    />
  );
}
