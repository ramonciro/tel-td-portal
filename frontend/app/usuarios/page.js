"use client";

import CrudPage from "../../components/CrudPage";

export default function Page() {
  return (
    <CrudPage
      title="Usuários"
      subtitle="Gestão de perfis e acessos"
      endpoint="/usuarios"
    />
  );
}
