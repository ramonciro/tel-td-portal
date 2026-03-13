"use client";

import CrudPage from "../../components/CrudPage";

export default function Page() {
  return (
    <CrudPage
      title="Biblioteca"
      subtitle="Portfólio de materiais de apoio para treinandos e instrutores, com acesso rápido e organização por tipo."
      endpoint="/biblioteca"
      fields=[{"name": "titulo", "label": "Título"}, {"name": "tipo", "label": "Tipo", "type": "select", "options": ["PDF", "PPT", "DOC", "Vídeo", "Link", "Planilha"]}, {"name": "cliente", "label": "Cliente"}, {"name": "link_arquivo", "label": "Link do arquivo"}, {"name": "descricao", "label": "Descrição", "type": "textarea"}, {"name": "categoria", "label": "Categoria"}, {"name": "publico", "label": "Público"}, {"name": "status", "label": "Status", "type": "select", "options": ["ativo", "em revisão", "arquivado"]}]
      summary=[{"label": "Acesso rápido", "value": "Materiais", "icon": "📚", "helper": "Portfólio para desenvolvimento profissional"}, {"label": "Organização", "value": "Conhecimento", "icon": "🗂️", "helper": "Base de consulta para operação e instrutoria"}]
    />
  );
}
