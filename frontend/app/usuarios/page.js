"use client";

import CrudPage from "../../components/CrudPage";

export default function Page() {
  return (
    <CrudPage
      title="Usuarios"
      subtitle="Gestão de perfis e acessos"
      endpoint="/usuarios"
    />
  );
}
