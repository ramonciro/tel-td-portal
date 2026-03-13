"use client";

import CrudPage from "../../components/CrudPage";

export default function Page() {
  return (
    <CrudPage
      title="Presenças"
      subtitle="Controle de presença, ausência e justificativas"
      endpoint="/presencas"
    />
  );
}
