"use client";
import CrudPage from "../../components/CrudPage"
export default function Page() {
  return <CrudPage title="Treinamentos" subtitle="Cadastro e acompanhamento de treinamentos" endpoint="/treinamentos" fields=[{"name": "tema", "label": "Tema"}, {"name": "cliente", "label": "Cliente"}, {"name": "instrutor", "label": "Instrutor"}, {"name": "carga_horaria", "label": "Carga Horária", "type": "number"}, {"name": "participantes_previstos", "label": "Participantes Previstos", "type": "number"}, {"name": "participantes_presentes", "label": "Participantes Presentes", "type": "number"}, {"name": "concluidos", "label": "Concluídos", "type": "number"}, {"name": "status", "label": "Status", "type": "select", "options": ["planejado", "em andamento", "concluído"]}] />
}
