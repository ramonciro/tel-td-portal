"use client";
import CrudPage from "../../components/CrudPage"
export default function Page() {
  return <CrudPage title="Biblioteca" subtitle="Portf\u00f3lio de acesso r\u00e1pido para treinandos e instrutores" endpoint="/biblioteca" fields=[{"name": "titulo", "label": "Título"}, {"name": "tipo", "label": "Tipo", "type": "select", "options": ["PDF", "PPT", "DOC", "Vídeo", "Link", "Planilha"]}, {"name": "cliente", "label": "Cliente"}, {"name": "link_arquivo", "label": "Link do Arquivo"}, {"name": "descricao", "label": "Descrição", "type": "textarea"}, {"name": "categoria", "label": "Categoria"}, {"name": "publico", "label": "Público"}, {"name": "status", "label": "Status", "type": "select", "options": ["ativo", "em revisão", "arquivado"]}] />
}
