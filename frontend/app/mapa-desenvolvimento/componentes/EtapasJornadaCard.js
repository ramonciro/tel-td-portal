"use client";

// Mapa de Desenvolvimento — Etapas da jornada ("portos"): formulário de
// cadastro/edição + lista por jornada. Extraído de page.js (22/09/2026,
// pedido do Ramon), sem nenhuma mudança de comportamento.
//
// Comentário original (20/09/2026, pedido do Ramon): o back-end já existia
// (jornadasEtapasController.js) mas nunca teve tela — e é o data_fim de
// cada etapa que alimenta o KPI "Adesão ao Cronograma"
// (metodologiaKpisController.js), então sem esta tela aquele card ficava
// sempre vazio. tipo é VARCHAR livre no banco (sem enum), a lista em
// ETAPA_TIPOS é só uma sugestão pra padronizar o cadastro.

import SectionCard from "../../../components/SectionCard";
import { etapaInitial, ETAPA_TIPOS, getPrazoInfo, badgeStyle, prazoBadge, displayStatus, formatDate, fmtNumber } from "./helpers";
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
  textareaStyle,
  labelStyle,
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

export default function EtapasJornadaCard({
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
  saving,
  setErro,
  setNotice,
}) {
  return (
    <SectionCard
      title="Etapas da jornada (portos)"
      subtitle="Divida a jornada em etapas com prazo — é o data_fim de cada etapa que alimenta o indicador Adesão ao Cronograma. Uma etapa pode, opcionalmente, usar uma trilha do catálogo como conteúdo de apoio."
    >
      <details open style={detailsCard}>
        <summary style={detailsSummary}>
          {etapaForm.id ? "Editar etapa" : "Registrar etapa"}
        </summary>

        <form onSubmit={saveEtapa} style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <div style={formGrid}>
            <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
              Jornada
              <select
                value={etapaForm.jornada_id}
                onChange={(e) =>
                  setEtapaForm((prev) => ({ ...prev, jornada_id: e.target.value }))
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
              Nome da etapa
              <input
                value={etapaForm.nome}
                onChange={(e) =>
                  setEtapaForm((prev) => ({ ...prev, nome: e.target.value }))
                }
                style={compactInputStyle()}
                required
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Tipo
              <select
                value={etapaForm.tipo}
                onChange={(e) =>
                  setEtapaForm((prev) => ({ ...prev, tipo: e.target.value }))
                }
                style={compactInputStyle()}
              >
                {ETAPA_TIPOS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
              Trilha vinculada (opcional)
              <select
                value={etapaForm.trilha_id}
                onChange={(e) =>
                  setEtapaForm((prev) => ({ ...prev, trilha_id: e.target.value }))
                }
                style={compactInputStyle()}
              >
                <option value="">Nenhuma</option>
                {trilhasCatalogo.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.titulo}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
              Responsável
              <select
                value={etapaForm.responsavel_id}
                onChange={(e) =>
                  setEtapaForm((prev) => ({ ...prev, responsavel_id: e.target.value }))
                }
                style={compactInputStyle()}
              >
                <option value="">Selecione</option>
                {usuarios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Status
              <select
                value={etapaForm.status}
                onChange={(e) =>
                  setEtapaForm((prev) => ({ ...prev, status: e.target.value }))
                }
                style={compactInputStyle()}
              >
                <option value="planejada">Planejada</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Prazo início
              <input
                type="date"
                value={etapaForm.data_inicio}
                onChange={(e) =>
                  setEtapaForm((prev) => ({ ...prev, data_inicio: e.target.value }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Prazo fim
              <input
                type="date"
                value={etapaForm.data_fim}
                onChange={(e) =>
                  setEtapaForm((prev) => ({ ...prev, data_fim: e.target.value }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Carga horária prevista
              <input
                type="number"
                step="0.5"
                min="0"
                value={etapaForm.carga_horaria_prevista}
                onChange={(e) =>
                  setEtapaForm((prev) => ({
                    ...prev,
                    carga_horaria_prevista: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Carga horária realizada
              <input
                type="number"
                step="0.5"
                min="0"
                value={etapaForm.carga_horaria_realizada}
                onChange={(e) =>
                  setEtapaForm((prev) => ({
                    ...prev,
                    carga_horaria_realizada: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>
          </div>

          <label style={{ ...labelStyle(), ...fieldSpan.full }}>
            Objetivo da etapa
            <textarea
              value={etapaForm.objetivo}
              onChange={(e) =>
                setEtapaForm((prev) => ({ ...prev, objetivo: e.target.value }))
              }
              style={textareaStyle(72)}
            />
          </label>

          <label style={{ ...labelStyle(), ...fieldSpan.full }}>
            Observações
            <textarea
              value={etapaForm.observacoes}
              onChange={(e) =>
                setEtapaForm((prev) => ({ ...prev, observacoes: e.target.value }))
              }
              style={textareaStyle(72)}
            />
          </label>

          <div style={buttonRow}>
            <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
              {etapaForm.id ? "Atualizar etapa" : "Salvar etapa"}
            </button>
            <button
              type="button"
              style={buttonSecondaryStyle()}
              onClick={() => {
                setEtapaForm((prev) => ({ ...etapaInitial, jornada_id: prev.jornada_id }));
                setErro("");
                setNotice("");
              }}
            >
              Limpar
            </button>
          </div>
        </form>
      </details>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {filteredJornadas.length === 0 ? (
          emptyCard("Cadastre uma jornada para começar a definir etapas.")
        ) : (
          filteredJornadas.map((jornada) => {
            const etapas = (etapasPorJornada[String(jornada.id)] || []).slice().sort(
              (a, b) => Number(a.ordem || 0) - Number(b.ordem || 0)
            );

            return (
              <div key={`etapas-${jornada.id}`} style={crewJourneyCard}>
                <div style={crewJourneyHeader}>
                  <div>
                    <div style={crewJourneyTitle}>{jornada.nome}</div>
                    <div style={crewJourneyMeta}>
                      {fmtNumber(etapas.length)} etapa(s) cadastrada(s)
                    </div>
                  </div>
                  <button
                    type="button"
                    style={buttonSecondaryStyle()}
                    onClick={() =>
                      setEtapaForm((prev) => ({ ...prev, jornada_id: String(jornada.id) }))
                    }
                  >
                    Usar esta jornada
                  </button>
                </div>

                <div style={crewListGrid}>
                  {etapas.length ? (
                    etapas.map((etapa) => {
                      const prazoEtapa = getPrazoInfo(etapa);
                      return (
                        <div key={etapa.id} style={crewListCard}>
                          <div style={crewListName}>{etapa.nome}</div>
                          <div style={crewListMeta}>
                            {ETAPA_TIPOS.find((t) => t.value === etapa.tipo)?.label || etapa.tipo}
                            {etapa.trilha_id
                              ? ` • Trilha: ${trilhasMap[String(etapa.trilha_id)] || etapa.trilha_titulo || "—"}`
                              : ""}
                          </div>
                          <div style={crewListMeta}>
                            Prazo: {etapa.data_fim ? formatDate(etapa.data_fim) : "Não definido"}
                          </div>
                          <div style={buttonRow}>
                            <span style={badgeStyle(etapa.status)}>{displayStatus(etapa.status)}</span>
                            <span style={prazoBadge(prazoEtapa.tone)}>{prazoEtapa.label}</span>
                          </div>
                          <div style={buttonRow}>
                            <button
                              type="button"
                              style={buttonSecondaryStyle()}
                              onClick={() => editEtapa(etapa)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              style={buttonDangerStyle()}
                              onClick={() => removeRegistro("etapa", etapa.id)}
                            >
                              Excluir
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={timelineEmpty}>Nenhuma etapa cadastrada para esta jornada.</div>
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
