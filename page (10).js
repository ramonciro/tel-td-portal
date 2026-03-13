"use client";
import CrudPage from "../../components/CrudPage"
export default function Page() {
  return <CrudPage title="Usu\u00e1rios" subtitle="Gest\u00e3o de perfis e acessos" endpoint="/usuarios" fields=[{"name": "nome", "label": "Nome"}, {"name": "email", "label": "E-mail", "type": "email"}, {"name": "senha", "label": "Senha"}, {"name": "perfil", "label": "Perfil", "type": "select", "options": ["admin", "coordenador", "supervisor", "instrutor"]}, {"name": "cliente", "label": "Cliente"}, {"name": "ativo", "label": "Ativo (1/0)", "type": "number"}, {"name": "troca_senha_obrigatoria", "label": "Troca senha obrigatória (1/0)", "type": "number"}] />
}
