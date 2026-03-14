"use client";

import CrudPage from "../../components/CrudPage";

const fields = [
  {
    "name": "treinamento_id",
    "label": "ID do treinamento",
    "type": "number"
  },
  {
    "name": "treinando_nome",
    "label": "Nome do treinando"
  },
  {
    "name": "status",
    "label": "Status",
    "type": "select",
    "options": [
      "presente",
      "ausente",
      "justificado"
    ]
  },
  {
    "name": "justificativa",
    "label": "Justificativa",
    "type": "textarea"
  }
];

const summary = [
  {
    "label": "Controle",
    "value": "Presença",
    "icon": "📋",
    "helper": "Base para leitura de assiduidade"
  },
  {
    "label": "Indicador futuro",
    "value": "Absenteísmo",
    "icon": "📉",
    "helper": "Pronto para visão executiva por cliente"
  }
];

export default function Page() {
  return (
    <CrudPage
      title="Presenças"
      subtitle="Registro de presença, ausência e justificativas, com apoio à leitura de absenteísmo."
      endpoint="/presencas"
      fields={fields}
      summary={summary}
    />
  );
}
