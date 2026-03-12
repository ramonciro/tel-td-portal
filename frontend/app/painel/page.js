"use client";

import PortalShell from "../../components/PortalShell";

export default function PainelPage() {
  return (
    <PortalShell
      title="Dashboard"
      subtitle="Visão geral do Portal de Treinamento e Desenvolvimento"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16
        }}
      >
        <Card titulo="Clientes" valor="8" />
        <Card titulo="Usuários" valor="Em validação" />
        <Card titulo="Treinamentos" valor="Em validação" />
        <Card titulo="Presenças" valor="Em validação" />
        <Card titulo="Avaliações" valor="Em validação" />
        <Card titulo="Status" valor="Versão 1.0" />
      </div>

      <div
        style={{
          background: "#fff",
          padding: 24,
          borderRadius: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          marginTop: 24
        }}
      >
        <h2 style={{ marginTop: 0 }}>Painel inicial</h2>
        <p>
          Portal Tel T&amp;D operacional, com módulos de clientes, usuários,
          treinamentos, presenças e avaliações já disponíveis para navegação.
        </p>
      </div>
    </PortalShell>
