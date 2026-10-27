"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PortalShell from "../../components/PortalShell";
import { getStoredUser } from "../../services/api";
import { colors } from "../../lib/theme";
import { chip, chipOn } from "./ui";
import AbaTurmas from "./AbaTurmas";
import RadarSemana from "./RadarSemana";
import CargaFutura from "./CargaFutura";
import DemandaRS from "./DemandaRS";

// Radar preventivo (26/10/2026): o que vai dar errado se ninguém agir, enquanto ainda dá tempo.
//  Semana (Pacote 3) · Turmas e certificação (Pacote 1) · Carga futura e R&S → T&D (Pacote 2)

function Radar() {
  const router = useRouter();
  const params = useSearchParams();
  const [soProprias, setSoProprias] = useState(false);
  const [perfil, setPerfil] = useState("");

  useEffect(() => {
    setPerfil(String(getStoredUser()?.perfil || ""));
  }, []);

  const instrutor = perfil === "instrutor";
  const abas = [
    ...(instrutor ? [] : [{ id: "semana", rotulo: "Semana" }]),
    { id: "turmas", rotulo: "Turmas e certificação" },
    { id: "carga", rotulo: "Carga futura" },
    ...(instrutor ? [] : [{ id: "rs", rotulo: "R&S → T&D" }]),
  ];
  const padrao = instrutor ? "turmas" : "semana";
  const pedida = params.get("aba");
  const aba = abas.some((a) => a.id === pedida) ? pedida : padrao;
  const ir = (id) => router.replace(id === padrao ? "/radar" : `/radar?aba=${id}`);

  return (
    <PortalShell>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: colors.textPrimary }}>Radar</h1>
          <p style={{ fontSize: 13, color: colors.textSecondary, margin: "4px 0 0", maxWidth: 760 }}>
            O que vai dar errado se ninguém agir — e ainda dá tempo de agir: turmas que começam com algo faltando, pessoas
            perdendo a chance de certificar, instrutores e salas sobrecarregados nos próximos meses e demanda do R&S sem turma.
            {soProprias || instrutor ? " Você vê apenas as suas turmas e a sua carga." : ""}
          </p>
        </div>

        <div role="tablist" aria-label="Seções do Radar" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {abas.map((a) => (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => ir(a.id)} style={{ ...chip, ...(aba === a.id ? chipOn : {}) }}>
              {a.rotulo}
            </button>
          ))}
        </div>

        {aba === "semana" && !instrutor && <RadarSemana />}
        {aba === "turmas" && <AbaTurmas onSoProprias={setSoProprias} />}
        {aba === "carga" && <CargaFutura />}
        {aba === "rs" && !instrutor && <DemandaRS />}
      </div>
    </PortalShell>
  );
}

export default function RadarPage() {
  return (
    <Suspense fallback={null}>
      <Radar />
    </Suspense>
  );
}
