"use client";

import CrudPage from "../../components/CrudPage";

export default function Page() {
  return (
    <CrudPage
      title="Trilhas"
      subtitle="Jornadas de desenvolvimento pessoal e profissional"
      endpoint="/trilhas"
    />
  );
}
