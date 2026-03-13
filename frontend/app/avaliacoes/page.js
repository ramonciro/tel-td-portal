"use client";
import CrudPage from "../../components/CrudPage"
export default function Page() {
  return <CrudPage title="Avalia\u00e7\u00f5es" subtitle="Registro de NPS, qualidade e provas" endpoint="/avaliacoes" fields=[{"name": "treinamento_id", "label": "Treinamento ID", "type": "number"}, {"name": "titulo", "label": "Título"}, {"name": "nota_nps", "label": "Nota NPS", "type": "number"}, {"name": "nota_qualidade", "label": "Nota Qualidade", "type": "number"}, {"name": "nota_prova", "label": "Nota Prova", "type": "number"}, {"name": "observacoes", "label": "Observações", "type": "textarea"}] />
}
