"use client";

import CrudPage from "../../components/CrudPage";

export default function Page() {
  return (
    <CrudPage
      title="Usuários"
      subtitle="Gestão de perfis, acessos e relacionamento dos usuários com a estrutura do portal."
      endpoint="/usuarios"
      fields=[{"name": "nome", "label": "Nome completo"}, {"name": "email", "label": "E-mail", "type": "email"}, {"name": "senha", "label": "Senha"}, {"name": "perfil", "label": "Perfil", "type": "select", "options": ["admin", "coordenador", "supervisor", "instrutor"]}, {"name": "cliente", "label": "Cliente"}, {"name": "ativo", "label": "Ativo (1/0)", "type": "number"}, {"name": "troca_senha_obrigatoria", "label": "Primeiro acesso (1/0)", "type": "number"}]
      summary=[{"label": "Gestão de acesso", "value": "Perfis", "icon": "👥", "helper": "Controle de usuários por função"}, {"label": "Segurança", "value": "Portal", "icon": "🔐", "helper": "Preparado para evolução de permissões"}]
    />
  );
}
