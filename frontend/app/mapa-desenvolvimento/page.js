"use client";
import CrudPage from "../../components/CrudPage"
export default function Page() {
  return <CrudPage title="Mapa de Desenvolvimento" subtitle="Evolu\u00e7\u00e3o pessoal e profissional cont\u00ednua" endpoint="/mapa-desenvolvimento" fields=[{"name": "colaborador", "label": "Colaborador"}, {"name": "cliente", "label": "Cliente"}, {"name": "cargo", "label": "Cargo"}, {"name": "objetivo_profissional", "label": "Objetivo Profissional", "type": "textarea"}, {"name": "trilha_atual", "label": "Trilha Atual"}, {"name": "etapa_atual", "label": "Etapa Atual"}, {"name": "status", "label": "Status"}, {"name": "percentual", "label": "Percentual", "type": "number"}, {"name": "proximo_passo", "label": "Próximo Passo", "type": "textarea"}, {"name": "mentor", "label": "Mentor"}, {"name": "observacoes", "label": "Observações", "type": "textarea"}] />
}
