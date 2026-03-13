"use client";
import CrudPage from "../../components/CrudPage"
export default function Page() {
  return <CrudPage title="Trilhas" subtitle="Jornadas de desenvolvimento pessoal e profissional" endpoint="/trilhas" fields=[{"name": "titulo", "label": "Título"}, {"name": "cliente", "label": "Cliente"}, {"name": "descricao", "label": "Descrição", "type": "textarea"}, {"name": "carga_horaria_estimada", "label": "Carga Horária Estimada"}, {"name": "publico", "label": "Público"}, {"name": "status", "label": "Status", "type": "select", "options": ["ativo", "em desenvolvimento", "arquivado"]}] />
}
