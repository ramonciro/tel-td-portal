"use client";

import CrudPage from "../../components/CrudPage";

export default function Page() {
  return (
    <CrudPage
      title="Avaliações"
      subtitle="Registro de NPS, qualidade e provas"
      endpoint="/avaliacoes"
    />
  );
}
