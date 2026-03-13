"use client";

import CrudPage from "../../components/CrudPage";

export default function Page() {
  return (
    <CrudPage
      title="Clientes"
      subtitle="Base de operações acompanhadas pelo T&D"
      endpoint="/clientes"
    />
  );
}
