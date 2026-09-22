"use client";

// Mapa de Desenvolvimento — Progresso das jornadas: visão detalhada com
// timeline de ações, coaching/mentoria e participantes por jornada.
// Extraído de page.js (22/09/2026, pedido do Ramon), sem nenhuma mudança
// de comportamento.

import SectionCard from "../../../components/SectionCard";
import { fmtNumber, fmtHours, badgeStyle, attentionBadge, prazoBadge, displayStatus } from "./helpers";
import {
  emptyCard,
  MetricBox,
  journeyFlowCard,
  journeyFlowHeader,
  journeyFlowTitle,
  journeyFlowMeta,
  journeyFlowSummary,
  journeyProgressBarWrap,
  journeyProgressBarTrack,
  journeyProgressBarFill,
  buttonRow,
  buttonSecondaryStyle,
  buttonDangerStyle,
  timelineWrap,
  timelineLabel,
  timelineItems,
  timelineItem,
  timelineItemTitle,
  timelineItemMeta,
  timelineEmpty,
  crewPillRow,
  crewPill,
  crewPillName,
  crewPillMeta,
} from "./estilos";

export default function ProgressoJornadasCard({ loading, jornadasFluxo, editJornada, removeRegistro }) {
  return (
    <SectionCard
      title="Progresso das jornadas"
      subtitle="Visão do andamento de cada jornada, com ações e coaching/mentoria."
    >
      {loading ? (
        emptyCard("Carregando progresso das jornadas...")
      ) : jornadasFluxo.length === 0 ? (
        emptyCard("Nenhuma jornada encontrada para exibir o percurso.")
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {jornadasFluxo.map((jornada) => (
            <div key={jornada.id} style={journeyFlowCard}>
              <div style={journeyFlowHeader}>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={badgeStyle(jornada.status)}>{displayStatus(jornada.status)}</span>
                    <span style={attentionBadge(jornada.attention_info.level)}>
                      {jornada.attention_info.label}
                    </span>
                    <span style={prazoBadge(jornada.prazo_info.tone)}>
                      {jornada.prazo_info.label}
                    </span>
                  </div>

                  <div style={journeyFlowTitle}>{jornada.nome}</div>

                  <div style={journeyFlowMeta}>
                    Objetivo: {jornada.objetivo || "Não informado"}
                  </div>

                  <div style={journeyFlowMeta}>
                    Público: {jornada.publico_macro || "Não informado"} • Cliente: {" "}
                    {jornada.cliente || "Não informado"}
                  </div>
                </div>

                <div style={journeyFlowSummary}>
                  <MetricBox label="Ações" value={fmtNumber(jornada.acoesDaJornada.length)} />
                  <MetricBox label="Coaching" value={fmtNumber(jornada.coachingsDaJornada.length)} />
                  <MetricBox label="Participantes" value={fmtNumber(jornada.total_tripulantes || 0)} />
                  <MetricBox label="Coaching individual" value={fmtNumber(jornada.total_coaching_individual || 0)} />
                  <MetricBox label="Horas" value={fmtHours(jornada.horas_totais)} />
                  <MetricBox label="Progresso" value={`${jornada.progresso}%`} />
                </div>
              </div>

              <div style={journeyProgressBarWrap}>
                <div style={journeyProgressBarTrack}>
                  <div
                    style={{
                      ...journeyProgressBarFill,
                      width: `${Math.max(jornada.progresso, 6)}%`,
                    }}
                  />
                </div>

                <div style={journeyFlowMeta}>
                  Próxima etapa: {jornada.proximoPasso}
                </div>
              </div>

              <div style={timelineWrap}>
                <div style={timelineLabel}>Ações</div>
                <div style={timelineItems}>
                  {jornada.acoesDaJornada.length ? (
                    jornada.acoesDaJornada.map((acao) => (
                      <div key={`acao-${acao.id}`} style={timelineItem}>
                        <div style={timelineItemTitle}>{acao.tema}</div>
                        <div style={timelineItemMeta}>
                          {displayStatus(acao.status)} • {fmtHours(acao.horas_realizadas || 0)}h
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={timelineEmpty}>Nenhuma ação registrada.</div>
                  )}
                </div>
              </div>

              <div style={timelineWrap}>
                <div style={timelineLabel}>Coaching e mentoria</div>
                <div style={timelineItems}>
                  {jornada.coachingsDaJornada.length ? (
                    jornada.coachingsDaJornada.map((item) => (
                      <div key={`coach-${item.id}`} style={timelineItem}>
                        <div style={timelineItemTitle}>{item.titulo}</div>
                        <div style={timelineItemMeta}>
                          {item.tipo_coaching || "coaching"} • {fmtHours(item.horas_totais || 0)}h
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={timelineEmpty}>Nenhum coaching ou mentoria registrado.</div>
                  )}
                </div>
              </div>

              <div style={timelineWrap}>
                <div style={timelineLabel}>Participantes</div>
                <div style={crewPillRow}>
                  {jornada.tripulacao_preview?.length ? (
                    jornada.tripulacao_preview.map((item) => (
                      <div key={`trip-${item.id}`} style={crewPill}>
                        <div style={crewPillName}>{item.nome}</div>
                        <div style={crewPillMeta}>{item.turma || item.cargo || "Em andamento"}</div>
                      </div>
                    ))
                  ) : (
                    <div style={timelineEmpty}>Nenhuma pessoa vinculada a esta jornada.</div>
                  )}
                </div>
              </div>

              <div style={buttonRow}>
                <button
                  type="button"
                  style={buttonSecondaryStyle()}
                  onClick={() => editJornada(jornada)}
                >
                  Editar
                </button>

                <button
                  type="button"
                  style={buttonDangerStyle()}
                  onClick={() => removeRegistro("jornada", jornada.id)}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
