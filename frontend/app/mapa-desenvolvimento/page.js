"use client";

import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";

export default function Page() {
  return (
    <PortalShell
      title="Mapa de Desenvolvimento"
      subtitle="Módulo em implantação"
    >
      <SectionCard
        title="Em breve"
        subtitle="Este módulo será conectado ao backend na próxima atualização."
      >
        <p style={{ color: "#64748b", margin: 0 }}>
          O mapa de desenvolvimento permitirá acompanhar a evolução dos colaboradores nas trilhas de aprendizagem e metas de capacitação.
        </p>
      </SectionCard>
    </PortalShell>
  );
}
