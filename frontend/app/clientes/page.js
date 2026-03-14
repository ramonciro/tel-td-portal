"use client";

import CrudPage from "../../components/CrudPage";

const fields = [
  {
    "name": "nome",
    "label": "Nome do cliente"
  },
  {
    "name": "segmento",
    "label": "Segmento"
  },
  {
    "name": "status",
    "label": "Status",
    "type": "select",
    "options": [
      "ativo",
      "inativo"
    ]
  },
  {
    "name": "gestor",
    "label": "Gestor"
  },
  {
    "name": "descricao",
    "label": "Descrição",
    "type": "textarea"
  }
];

const summary = [
  {
    "label": "Gestão da carteira",
    "value": "Clientes",
    "icon": "🏢",
    "helper": "Cadastro e manutenção das operações"
  },
  {
    "label": "Objetivo",
    "value": "Organização",
    "icon": "📌",
    "helper": "Base estruturada por cliente e segmento"
  }
];

export default function Page() {
  return (
    <CrudPage
      title="Clientes"
      subtitle="Base de operações acompanhadas pelo T&D, com visão mais organizada para gestão da carteira."
      endpoint="/clientes"
      fields={fields}
      summary={summary}
    />
  );
}
