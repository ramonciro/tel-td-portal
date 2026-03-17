"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [treinamentos, setTreinamentos] = useState([]);

  useEffect(() => {
    async function load() {
      const [npsData, treinamentosData] = await Promise.all([
        apiFetch("/avaliacoes-treinandos").catch(() => []),
        apiFetch("/treinamentos").catch(() => []),
      ]);

      setDados(Array.isArray(npsData) ? npsData : []);
      setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
    }

    load();
  }, []);

  const total = dados.length;
  const promotores = dados.filter((d) => d.nota_nps >= 9).length;
  const detratores = dados.filter((d) => d.nota_nps <= 6).length;

  const nps = total
    ? Math.round((promotores / total) * 100 - (detratores / total) * 100)
    : 0;

  const treinamentoOptions = useMemo(() => {
    return treinamentos.map((t) => ({
      value: t.id,
      label: `${t.tema || "Treinamento"} - ${t.cliente || "Sem cliente"}`,
    }));
  }, [treinamentos]);

  const fields = [
    {
      name: "treinamento_id",
      label: "Turma",
      type: "select",
      options: treinamentoOptions,
      placeholder: "Selecione a turma",
    },
    {
      name: "treinando_nome",
      label: "Treinando",
    },
    {
      name: "nota_nps",
      label: "Nota NPS (0-10)",
      type: "number",
      min: 0,
      max: 10,
      step: 1,
    },
    {
      name: "comentario",
      label: "Comentário",
      type: "textarea",
    },
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
