"use client";

import CrudPage from "../../components/CrudPage";

export default function Page() {
  return (
    <CrudPage
      title="Treinamentos"
      subtitle="Cadastro e acompanhamento de treinamentos"
      endpoint="/treinamentos"
    />
  );
}
