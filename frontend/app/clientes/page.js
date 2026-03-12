"use client";

import PortalShell from "../../components/PortalShell";

const CLIENTES_FIXOS = [
  { id: 1, nome: "Agibank" },
  { id: 2, nome: "Mercantil" },
  { id: 3, nome: "Crea" },
  { id: 4, nome: "Buser" },
  { id: 5, nome: "Rede Américas" },
  { id: 6, nome: "Prefeitura de Salvador" },
  { id: 7, nome: "Claro" },
  { id: 8, nome: "Hugsnet" }
];

export default function ClientesPage() {
  return (
    <PortalShell
      title="Clientes"
      subtitle="Visão consolidada dos clientes acompanhados pelo T&D."
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 20
        }}
      >
        {CLIENTES_FIXOS.map((cliente) => (
          <div
            key={cliente.id}
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 22 }}>{cliente.nome}</h2>
            <p style={{ margin: "12px 0" }}>
              <strong>Status:</strong> Ativo
            </p>
          </div>
        ))}
      </div>
    </PortalShell>
  );
}
