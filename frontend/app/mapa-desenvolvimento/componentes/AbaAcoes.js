"use client";

// Mapa de Desenvolvimento — aba "Ações": compõe o formulário de cadastro e
// a lista de ações já registradas. Extraído de page.js (22/09/2026, pedido
// do Ramon).

import AcaoFormCard from "./AcaoFormCard";
import AcoesListaCard from "./AcoesListaCard";

export default function AbaAcoes({
  acaoForm,
  setAcaoForm,
  saveAcao,
  jornadas,
  turmas,
  usuarios,
  handleSelecionarTurma,
  saving,
  setErro,
  setNotice,
  loading,
  filteredAcoes,
  editAcao,
  removeRegistro,
}) {
  return (
    <>
      <AcaoFormCard
        acaoForm={acaoForm}
        setAcaoForm={setAcaoForm}
        saveAcao={saveAcao}
        jornadas={jornadas}
        turmas={turmas}
        usuarios={usuarios}
        handleSelecionarTurma={handleSelecionarTurma}
        saving={saving}
        setErro={setErro}
        setNotice={setNotice}
      />
      <AcoesListaCard
        loading={loading}
        filteredAcoes={filteredAcoes}
        editAcao={editAcao}
        removeRegistro={removeRegistro}
      />
    </>
  );
}
