"use client";
import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

export default function PresencasPage() {
  const [treinamentos, setTreinamentos] = useState([]);
  useEffect(() => {
    async function loadTreinamentos() {
      try {
        const data = await apiFetch("/treinamentos").catch(() => []);
        setTreinamentos((Array.isArray(data) ? data : []).map((item) => ({ value: item.id, label: `${item.titulo || "Treinamento"}${item.cliente ? ` - ${item.cliente}` : ""}` })));
      } catch {
        setTreinamentos([]);
      }
    }
    loadTreinamentos();
  }, []);

  const fields = useMemo(() => [
    { name: "treinamento_id", label: "Treinamento", type: "select", options: treinamentos },
    { name: "treinando_nome", label: "Colaborador / treinando", placeholder: "Nome do participante" },
    { name: "status", label: "Presença", type: "select", options: [{ value: "Presente", label: "Presente" }, { value: "Ausente", label: "Ausente" }, { value: "Justificado", label: "Justificado" }]},
    { name: "justificativa", label: "Justificativa", type: "textarea", placeholder: "Preencha apenas se necessário" },
  ], [treinamentos]);

  const columns = [
    { key: "treinamento_id", label: "Treinamento" }, { key: "treinando_nome", label: "Participante" }, { key: "status", label: "Presença" }, { key: "justificativa", label: "Justificativa" },
  ];

  return (
    <CrudPageV2
      title="Presenças"
      subtitle="Controle de participação com leitura mais objetiva para acompanhamento das ações de treinamento."
      endpoint="/presencas"
      fields={fields}
      columns={columns}
      recordsSubtitle="Acompanhamento operacional da presença dos participantes."
      hero={<><StatCard title="Controle de participação" value="Acompanhamento" subtitle="Registre presença, ausência e justificativa com leitura mais clara." accent="#ea580c" /><SectionCard title="Aplicação prática" subtitle="Melhoria focada em acompanhamento e tomada de ação."><p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>A intenção é facilitar a leitura de quem participou, quem faltou e quais casos precisam de atuação posterior do time.</p></SectionCard></>}
    />
  );
}
