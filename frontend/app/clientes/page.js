"use client";
import CrudPage from "../../components/CrudPage"
export default function Page() {
  return <CrudPage title="Clientes" subtitle="Base de opera\u00e7\u00f5es acompanhadas pelo T&D" endpoint="/clientes" fields=[{"name": "nome", "label": "Nome"}, {"name": "segmento", "label": "Segmento"}, {"name": "status", "label": "Status", "type": "select", "options": ["ativo", "inativo"]}, {"name": "gestor", "label": "Gestor"}, {"name": "descricao", "label": "Descrição", "type": "textarea"}] />
}
