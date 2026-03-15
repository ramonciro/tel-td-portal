"use client";
import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

export default function AvaliacoesPage() {
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
    { name: "tipo_registro", label: "Tipo", type: "select", options: [{ value: "Avaliação de treinamento", label: "Avaliação de treinamento" }, { value: "Prova", label: "Prova" }, { value: "Teste", label: "Teste" }, { value: "Simulado", label: "Simulado" }]},
    { name: "titulo", label: "Título / tema", placeholder: "Nome da avaliação ou atividade" },
    { name: "nota_nps", label: "NPS / satisfação", type: "number", placeholder: "0 a 10" },
    { name: "nota_qualidade", label: "Qualidade / aproveitamento", type: "number", placeholder: "Nota ou percentual" },
    { name: "observacoes", label: "Observações", type: "textarea", placeholder: "Comentários relevantes" },
  ], [treinamentos]);

  const columns = [
    { key: "tipo_registro", label: "Tipo" }, { key: "treinamento_id", label: "Treinamento" }, { key: "titulo", label: "Tema / atividade" }, { key: "nota_nps", label: "NPS / satisfação" }, { key: "nota_qualidade", label: "Aproveitamento" }, { key: "observacoes", label: "Observações" },
  ];

  return (
    <CrudPageV2
      title="Avaliações, provas, testes e simulados"
      subtitle="Uma visão menos redundante e mais aderente à realidade do T&D, conectando avaliação de treinamento e instrumentos de verificação."
      endpoint="/avaliacoes"
      fields={fields}
      columns={columns}
      recordsSubtitle="Consolidação de avaliações aplicadas e instrumentos de medição do aprendizado."
      hero={<><StatCard title="Qualidade da aprendizagem" value="Medição" subtitle="Registre percepção do treinamento e evidências de conhecimento." accent="#dc2626" /><SectionCard title="Melhoria aplicada" subtitle="A redundância visual foi reduzida e o foco agora está no propósito da avaliação."><p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>A tela foi reposicionada para tratar não só avaliação de reação, mas também provas, testes e simulados que podem compor a plataforma.</p></SectionCard></>}
    />
  );
}
