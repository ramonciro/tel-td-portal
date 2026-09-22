"use client";

// Mapa de Desenvolvimento — Participantes da jornada: inclusão manual +
// importação por planilha + lista por jornada. Extraído de page.js
// (22/09/2026, pedido do Ramon), sem nenhuma mudança de comportamento.

import SectionCard from "../../../components/SectionCard";
import { participantInitial, PARTICIPANTE_STATUS_OPTIONS, displayJourneyParticipantStatus, crewStatusBadge, fmtNumber } from "./helpers";
import {
  emptyCard,
  detailsCard,
  detailsSummary,
  formGrid,
  fieldSpan,
  buttonRow,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  buttonDangerStyle,
  compactInputStyle,
  labelStyle,
  tripulacaoGrid,
  importHintCard,
  crewJourneyCard,
  crewJourneyHeader,
  crewJourneyTitle,
  crewJourneyMeta,
  crewListGrid,
  crewListCard,
  crewListName,
  crewListMeta,
  timelineEmpty,
} from "./estilos";

export default function ParticipantesJornadaCard({
  participanteForm,
  setParticipanteForm,
  saveParticipante,
  importarTripulacao,
  arquivoTripulacao,
  setArquivoTripulacao,
  jornadas,
  opcoesCliente,
  filteredJornadas,
  participantesPorJornada,
  removeParticipante,
  saving,
}) {
  return (
    <SectionCard
      title="Participantes da jornada"
      subtitle="Vincule pessoas manualmente ou importe os participantes da jornada por planilha."
    >
      <div style={tripulacaoGrid}>
        <details open style={detailsCard}>
          <summary style={detailsSummary}>Inclusão manual</summary>

          <form onSubmit={saveParticipante} style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <div style={formGrid}>
              <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
                Jornada
                <select
                  value={participanteForm.jornada_id}
                  onChange={(e) =>
                    setParticipanteForm((prev) => ({ ...prev, jornada_id: e.target.value }))
                  }
                  style={compactInputStyle()}
                  required
                >
                  <option value="">Selecione</option>
                  {jornadas.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome || item.titulo}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ ...labelStyle(), ...fieldSpan.xl }}>
                Nome
                <input
                  value={participanteForm.nome}
                  onChange={(e) =>
                    setParticipanteForm((prev) => ({ ...prev, nome: e.target.value }))
                  }
                  style={compactInputStyle()}
                  required
                />
              </label>

              <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                Matrícula
                <input
                  value={participanteForm.matricula}
                  onChange={(e) =>
                    setParticipanteForm((prev) => ({ ...prev, matricula: e.target.value }))
                  }
                  style={compactInputStyle()}
                />
              </label>

              <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                Turma
                <input
                  value={participanteForm.turma}
                  onChange={(e) =>
                    setParticipanteForm((prev) => ({ ...prev, turma: e.target.value }))
                  }
                  style={compactInputStyle()}
                />
              </label>

              <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                Cargo
                <input
                  value={participanteForm.cargo}
                  onChange={(e) =>
                    setParticipanteForm((prev) => ({ ...prev, cargo: e.target.value }))
                  }
                  style={compactInputStyle()}
                />
              </label>

              <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                Supervisor
                <input
                  value={participanteForm.supervisor}
                  onChange={(e) =>
                    setParticipanteForm((prev) => ({ ...prev, supervisor: e.target.value }))
                  }
                  style={compactInputStyle()}
                />
              </label>

              <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                Cliente
                <select
                  value={participanteForm.cliente}
                  onChange={(e) =>
                    setParticipanteForm((prev) => ({ ...prev, cliente: e.target.value }))
                  }
                  style={compactInputStyle()}
                >
                  <option value="">Selecione</option>
                  {opcoesCliente(participanteForm.cliente).map((nome) => (
                    <option key={nome} value={nome}>
                      {nome}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                Situação na jornada
                <select
                  value={participanteForm.status_jornada}
                  onChange={(e) =>
                    setParticipanteForm((prev) => ({ ...prev, status_jornada: e.target.value }))
                  }
                  style={compactInputStyle()}
                >
                  {PARTICIPANTE_STATUS_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={buttonRow}>
              <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
                Vincular pessoa
              </button>
              <button
                type="button"
                style={buttonSecondaryStyle()}
                onClick={() => setParticipanteForm((prev) => ({ ...participantInitial, jornada_id: prev.jornada_id }))}
              >
                Limpar
              </button>
            </div>
          </form>
        </details>

        <details open style={detailsCard}>
          <summary style={detailsSummary}>Importação por planilha</summary>

          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <label style={labelStyle()}>
              Arquivo Excel (.xlsx, .xls ou .csv)
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setArquivoTripulacao(e.target.files?.[0] || null)}
                style={compactInputStyle()}
              />
            </label>

            <div style={importHintCard}>
              Colunas aceitas: nome, matricula, cliente, turma, cargo, supervisor e status_jornada.
            </div>

            <div style={buttonRow}>
              <button
                type="button"
                style={buttonPrimaryStyle(saving)}
                disabled={saving}
                onClick={importarTripulacao}
              >
                Importar participantes
              </button>
            </div>
          </div>
        </details>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {filteredJornadas.length === 0 ? (
          emptyCard("Selecione ou cadastre uma jornada para começar a vincular participantes.")
        ) : (
          filteredJornadas.map((jornada) => {
            const tripulacao = participantesPorJornada[String(jornada.id)] || [];

            return (
              <div key={`crew-${jornada.id}`} style={crewJourneyCard}>
                <div style={crewJourneyHeader}>
                  <div>
                    <div style={crewJourneyTitle}>{jornada.nome}</div>
                    <div style={crewJourneyMeta}>
                      {fmtNumber(tripulacao.length)} pessoa(s) vinculada(s)
                    </div>
                  </div>
                  <button
                    type="button"
                    style={buttonSecondaryStyle()}
                    onClick={() => setParticipanteForm((prev) => ({ ...prev, jornada_id: String(jornada.id) }))}
                  >
                    Usar esta jornada
                  </button>
                </div>

                <div style={crewListGrid}>
                  {tripulacao.length ? (
                    tripulacao.map((item) => (
                      <div key={item.id} style={crewListCard}>
                        <div style={crewListName}>{item.nome}</div>
                        <div style={crewListMeta}>
                          {item.turma || "Sem turma"} • {item.cargo || "Sem cargo"}
                        </div>
                        <div style={crewListMeta}>
                          {item.supervisor || "Sem supervisor"}
                        </div>
                        <div style={buttonRow}>
                          <span style={crewStatusBadge(item.status_jornada)}>
                            {displayJourneyParticipantStatus(item.status_jornada)}
                          </span>
                          <button
                            type="button"
                            style={buttonDangerStyle()}
                            onClick={() => removeParticipante(item.id)}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={timelineEmpty}>Nenhuma pessoa vinculada a esta jornada.</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </SectionCard>
  );
}
