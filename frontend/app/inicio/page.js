"use client";

import PortalShell from "../../components/PortalShell";

export default function InicioPage() {
  return (
    <PortalShell title="Início" subtitle="Portal de Treinamento e Desenvolvimento">
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
      }}>
        <h2 style={{ marginTop: 0 }}>Bem-vindo ao Tel T&D</h2>
        <p>Ambiente inicial do portal. A partir daqui você pode acessar clientes, usuários, treinamentos, presenças e avaliações.</p>
      </div>
    </PortalShell>
  );
}
