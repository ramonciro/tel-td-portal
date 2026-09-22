"use client";

// Mapa de Desenvolvimento — aba "Coaching e mentoria": compõe o formulário
// de cadastro e a lista de registros. Extraído de page.js (22/09/2026,
// pedido do Ramon).

import CoachingFormCard from "./CoachingFormCard";
import CoachingListaCard from "./CoachingListaCard";

export default function AbaCoaching({
  coachingForm,
  setCoachingForm,
  saveCoaching,
  jornadas,
  acoesOptions,
  usuarios,
  saving,
  setErro,
  setNotice,
  loading,
  filteredCoachings,
  editCoaching,
  removeRegistro,
}) {
  return (
    <>
      <CoachingFormCard
        coachingForm={coachingForm}
        setCoachingForm={setCoachingForm}
        saveCoaching={saveCoaching}
        jornadas={jornadas}
        acoesOptions={acoesOptions}
        usuarios={usuarios}
        saving={saving}
        setErro={setErro}
        setNotice={setNotice}
      />
      <CoachingListaCard
        loading={loading}
        filteredCoachings={filteredCoachings}
        editCoaching={editCoaching}
        removeRegistro={removeRegistro}
      />
    </>
  );
}
