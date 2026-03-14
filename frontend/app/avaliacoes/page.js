"use client";

import CrudPage from "../../components/CrudPage";

const fields = [
  {
    "name": "treinamento_id",
    "label": "ID do treinamento",
    "type": "number"
  },
  {
    "name": "titulo",
    "label": "Título"
  },
  {
    "name": "nota_nps",
    "label": "Nota NPS",
    "type": "number"
  },
  {
    "name": "nota_qualidade",
    "label": "Nota de qualidade",
    "type": "number"
  },
  {
    "name": "nota_prova",
    "label": "Nota da prova",
    "type": "number"
  },
  {
    "name": "observacoes",
    "label": "Observações",
    "type": "textarea"
  }
];

const summary = [
  {
    "label": "Leitura de qualidade",
    "value": "Feedback",
    "icon": "⭐",
    "helper": "Base para NPS, qualidade e aproveitamento"
  },
  {
    "label": "Apoio gerencial",
    "value": "Indicadores",
    "icon": "📈",
    "helper": "KPIs de treinamento mais tangíveis"
  }
];

export default function Page() {
  return (
    <CrudPage
      title="Avaliações"
      subtitle="Registro de feedback, prova e percepção de qualidade para apoiar os KPIs de treinamento."
      endpoint="/avaliacoes"
      fields={fields}
      summary={summary}
    />
  );
}
