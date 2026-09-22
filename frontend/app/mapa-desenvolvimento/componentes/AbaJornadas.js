"use client";

// Mapa de Desenvolvimento — aba "Jornadas": compõe Clientes da Metodologia,
// Cadastro de jornada, Etapas (portos), Participantes e Progresso das
// jornadas, na mesma ordem da aba original. Extraído de page.js
// (22/09/2026, pedido do Ramon), sem nenhuma mudança de comportamento.

import ClientesMetodologiaCard from "./ClientesMetodologiaCard";
import JornadaFormCard from "./JornadaFormCard";
import EtapasJornadaCard from "./EtapasJornadaCard";
import ParticipantesJornadaCard from "./ParticipantesJornadaCard";
import ProgressoJornadasCard from "./ProgressoJornadasCard";

export default function AbaJornadas({
  // Clientes da metodologia
  clienteMetForm,
  setClienteMetForm,
  saveClienteMetodologia,
  editClienteMetodologia,
  alternarStatusCliente,
  metodologiaClientes,

  // Cadastro de jornada
  jornadaForm,
  setJornadaForm,
  saveJornada,
  opcoesCliente,

  // Etapas da jornada
  etapaForm,
  setEtapaForm,
  saveEtapa,
  editEtapa,
  jornadas,
  trilhasCatalogo,
  usuarios,
  filteredJornadas,
  etapasPorJornada,
  trilhasMap,
  removeRegistro,

  // Participantes da jornada
  participanteForm,
  setParticipanteForm,
  saveParticipante,
  importarTripulacao,
  arquivoTripulacao,
  setArquivoTripulacao,
  participantesPorJornada,
  removeParticipante,

  // Progresso das jornadas
  loading,
  jornadasFluxo,
  editJornada,

  // Compartilhados
  saving,
  setErro,
  setNotice,
}) {
  return (
    <>
      <ClientesMetodologiaCard
        clienteMetForm={clienteMetForm}
        setClienteMetForm={setClienteMetForm}
        saveClienteMetodologia={saveClienteMetodologia}
        editClienteMetodologia={editClienteMetodologia}
        alternarStatusCliente={alternarStatusCliente}
        metodologiaClientes={metodologiaClientes}
        saving={saving}
        setErro={setErro}
        setNotice={setNotice}
      />

      <JornadaFormCard
        jornadaForm={jornadaForm}
        setJornadaForm={setJornadaForm}
        saveJornada={saveJornada}
        opcoesCliente={opcoesCliente}
        saving={saving}
        setErro={setErro}
        setNotice={setNotice}
      />

      <EtapasJornadaCard
        etapaForm={etapaForm}
        setEtapaForm={setEtapaForm}
        saveEtapa={saveEtapa}
        editEtapa={editEtapa}
        jornadas={jornadas}
        trilhasCatalogo={trilhasCatalogo}
        usuarios={usuarios}
        filteredJornadas={filteredJornadas}
        etapasPorJornada={etapasPorJornada}
        trilhasMap={trilhasMap}
        removeRegistro={removeRegistro}
        saving={saving}
        setErro={setErro}
        setNotice={setNotice}
      />

      <ParticipantesJornadaCard
        participanteForm={participanteForm}
        setParticipanteForm={setParticipanteForm}
        saveParticipante={saveParticipante}
        importarTripulacao={importarTripulacao}
        arquivoTripulacao={arquivoTripulacao}
        setArquivoTripulacao={setArquivoTripulacao}
        jornadas={jornadas}
        opcoesCliente={opcoesCliente}
        filteredJornadas={filteredJornadas}
        participantesPorJornada={participantesPorJornada}
        removeParticipante={removeParticipante}
        saving={saving}
      />

      <ProgressoJornadasCard
        loading={loading}
        jornadasFluxo={jornadasFluxo}
        editJornada={editJornada}
        removeRegistro={removeRegistro}
      />
    </>
  );
}
