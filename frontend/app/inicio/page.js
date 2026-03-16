"use client";

import PortalShell from "../../components/PortalShell";
import AccessGate from "../../components/AccessGate";
import { getStoredUser } from "../../services/api";

export default function InicioPage() {

  const user = getStoredUser();

  return (
    <AccessGate allowedRoles={["admin","coordenador","supervisor","instrutor","treinando"]}>
      <PortalShell
        title="Portal de Treinamento e Desenvolvimento"
        subtitle="Ambiente central de gestão e acompanhamento das iniciativas de capacitação."
      >

        <div style={grid}>

          <div style={card}>
            <h3>Bem-vindo</h3>
            <p>
              {user?.nome || "Usuário"}, este portal concentra
              as principais informações de treinamento da operação.
            </p>
          </div>

          <div style={card}>
            <h3>Objetivo</h3>
            <p>
              Acompanhar indicadores de capacitação,
              desempenho de turmas e qualidade dos treinamentos.
            </p>
          </div>

          <div style={card}>
            <h3>Funcionalidades</h3>
            <ul>
              <li>Gestão de treinamentos</li>
              <li>Controle de turmas</li>
              <li>Avaliação de qualidade</li>
              <li>Biblioteca de conteúdos</li>
              <li>Dashboard executivo</li>
            </ul>
          </div>

        </div>

      </PortalShell>
    </AccessGate>
  );
}

const grid = {
display:"grid",
gridTemplateColumns:"repeat(3,1fr)",
gap:20
}

const card={
background:"#fff",
padding:20,
borderRadius:14,
border:"1px solid #e5e7eb"
}
