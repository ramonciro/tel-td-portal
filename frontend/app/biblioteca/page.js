"use client";

import CrudPage from "../../components/CrudPage";

const fields = [
  {
    "name": "titulo",
    "label": "Título"
  },
  {
    "name": "tipo",
    "label": "Tipo",
    "type": "select",
    "options": [
      "PDF",
      "PPT",
      "DOC",
      "Vídeo",
      "Link",
      "Planilha"
    ]
  },
  {
    "name": "cliente",
    "label": "Cliente"
  },
  {
    "name": "link_arquivo",
    "label": "Link do arquivo"
  },
  {
    "name": "descricao",
    "label": "Descrição",
    "type": "textarea"
  }
];

const summary = [
  {
    "label": "Acesso rápido",
    "value": "Materiais",
    "icon": "📚",
    "helper": "Portfólio para desenvolvimento profissional"
  },
  {
    "label": "Organização",
    "value": "Conhecimento",
    "icon": "🗂️",
    "helper": "Base de consulta para operação e instrutoria"
  }
];

export default function Page() {
  return (
    <CrudPage
      title="Biblioteca"
      subtitle="Portfólio de materiais de apoio para treinandos e instrutores, com acesso rápido e organização por tipo."
      endpoint="/biblioteca"
      fields={fields}
      summary={summary}
    />
  );
}
