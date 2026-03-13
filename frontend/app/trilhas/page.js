"use client";

import CrudPage from "../../components/CrudPage";

export default function Page() {
  return (
    <CrudPage
      title="Trilhas"
      subtitle="Jornadas contínuas de desenvolvimento com leitura mais estruturada para evolução do time."
      endpoint="/trilhas"
      fields=[{"name": "titulo", "label": "Título da trilha"}, {"name": "cliente", "label": "Cliente"}, {"name": "descricao", "label": "Descrição", "type": "textarea"}, {"name": "carga_horaria_estimada", "label": "Carga horária estimada"}, {"name": "publico", "label": "Público"}, {"name": "status", "label": "Status", "type": "select", "options": ["ativo", "em desenvolvimento", "arquivado"]}]
      summary=[{"label": "Desenvolvimento", "value": "Trilhas", "icon": "🧭", "helper": "Sequências contínuas de aprendizagem"}, {"label": "Visão futura", "value": "Carreira", "icon": "🚀", "helper": "Base para evolução pessoal e profissional"}]
    />
  );
}
