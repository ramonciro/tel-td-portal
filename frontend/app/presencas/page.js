"use client";
import CrudPage from "../../components/CrudPage"
export default function Page() {
  return <CrudPage title="Presen\u00e7as" subtitle="Controle de presen\u00e7a, aus\u00eancia e justificativas" endpoint="/presencas" fields=[{"name": "treinamento_id", "label": "Treinamento ID", "type": "number"}, {"name": "treinando_nome", "label": "Nome do Treinando"}, {"name": "status", "label": "Status", "type": "select", "options": ["presente", "ausente", "justificado"]}, {"name": "justificativa", "label": "Justificativa", "type": "textarea"}] />
}
