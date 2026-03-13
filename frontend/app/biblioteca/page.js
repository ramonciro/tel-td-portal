"use client";

import CrudPage from "../../components/CrudPage";

export default function Page() {
  return (
    <CrudPage
      title="Biblioteca"
      subtitle="Portfólio de acesso rápido para treinandos e instrutores"
      endpoint="/biblioteca"
    />
  );
}
