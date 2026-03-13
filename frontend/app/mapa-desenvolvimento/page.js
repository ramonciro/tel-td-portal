"use client";

import CrudPage from "../../components/CrudPage";

export default function Page() {
  return (
    <CrudPage
      title="Mapa de Desenvolvimento"
      subtitle="Painel de acompanhamento individual para orientar objetivos, trilhas e próximos passos."
      endpoint="/mapa-desenvolvimento"
      fields=[{"name": "colaborador", "label": "Colaborador"}, {"name": "cliente", "label": "Cliente"}, {"name": "cargo", "label": "Cargo"}, {"name": "objetivo_profissional", "label": "Objetivo profissional", "type": "textarea"}, {"name": "trilha_atual", "label": "Trilha atual"}, {"name": "etapa_atual", "label": "Etapa atual"}, {"name": "status", "label": "Status"}, {"name": "percentual", "label": "Percentual", "type": "number"}, {"name": "proximo_passo", "label": "Próximo passo", "type": "textarea"}, {"name": "mentor", "label": "Mentor"}, {"name": "observacoes", "label": "Observações", "type": "textarea"}]
      summary=[{"label": "Acompanhamento", "value": "Evolução", "icon": "🗺️", "helper": "Leitura individual e contínua"}, {"label": "Aplicação", "value": "Desenvolvimento", "icon": "📈", "helper": "Base para crescimento técnico e comportamental"}]
    />
  );
}
