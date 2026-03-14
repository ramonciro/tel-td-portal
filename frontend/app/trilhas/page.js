"use client";

import CrudPage from "../../components/CrudPage";

const fields = [
  {
    "name": "cliente",
    "label": "Cliente"
  },
  {
    "name": "titulo",
    "label": "Título da trilha"
  },
  {
    "name": "descricao",
    "label": "Descrição",
    "type": "textarea"
  },
  {
    "name": "etapas",
    "label": "Etapas (JSON ou texto)",
    "type": "textarea"
  }
];

const summary = [
  {
    "label": "Desenvolvimento",
    "value": "Trilhas",
    "icon": "🧭",
    "helper": "Sequências contínuas de aprendizagem"
  },
  {
    "label": "Visão futura",
    "value": "Carreira",
    "icon": "🚀",
    "helper": "Base para evolução pessoal e profissional"
  }
];

export default function Page() {
  return (
    <CrudPage
      title="Trilhas"
      subtitle="Jornadas contínuas de desenvolvimento com leitura mais estruturada para evolução do time."
      endpoint="/trilhas"
      fields={fields}
      summary={summary}
    />
  );
}
