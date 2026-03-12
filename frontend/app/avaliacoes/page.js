"use client";

import PortalShell from "../../components/PortalShell";

export default function Page() {
  return (
    <PortalShell title="Avaliações" subtitle="Registro de NPS, qualidade e materiais avaliativos.">
      <div style={
        background: "#fff",
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
      }>
        <p style={ margin: 0 }>Módulo carregado com sucesso.</p>
      </div>
    </PortalShell>
  );
}
