"use client";

import CrudPage from "../../components/CrudPage";

export default function Page() {
  return (
    <CrudPage
      title="Treinamentos"
      subtitle="Controle operacional e executivo das turmas, instrutores e resultados de capacitação."
      endpoint="/treinamentos"
      fields=[{"name": "tema", "label": "Tema do treinamento"}, {"name": "cliente", "label": "Cliente"}, {"name": "instrutor", "label": "Instrutor"}, {"name": "carga_horaria", "label": "Carga horária", "type": "number"}, {"name": "participantes_previstos", "label": "Participantes previstos", "type": "number"}, {"name": "participantes_presentes", "label": "Participantes presentes", "type": "number"}, {"name": "concluidos", "label": "Concluídos", "type": "number"}, {"name": "status", "label": "Status", "type": "select", "options": ["planejado", "em andamento", "concluído"]}]
      summary=[{"label": "Operação", "value": "Turmas", "icon": "🎓", "helper": "Controle de temas, presença e conclusão"}, {"label": "Visão gerencial", "value": "Capacitação", "icon": "📊", "helper": "Base para indicadores de horas e aproveitamento"}]
    />
  );
}
