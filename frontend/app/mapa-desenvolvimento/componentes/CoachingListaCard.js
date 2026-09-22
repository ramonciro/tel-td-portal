"use client";

// Mapa de Desenvolvimento — lista de coaching e mentoria cadastrados.
// Extraído de page.js (22/09/2026, pedido do Ramon), sem nenhuma mudança
// de comportamento.

import SectionCard from "../../../components/SectionCard";
import { fmtNumber, fmtHours, badgeStyle, attentionBadge, displayStatus, sustentacaoTypeBadge } from "./helpers";
import {
  emptyCard,
  MiniExecutive,
  cardsGrid,
  execCard,
  execHeader,
  execTitle,
  execSubtitle,
  execBody,
  execText,
  miniExecutiveBand,
  buttonRow,
  buttonSecondaryStyle,
  buttonDangerStyle,
} from "./estilos";

export default function CoachingListaCard({ loading, filteredCoachings, editCoaching, removeRegistro }) {
  return (
    <SectionCard
      title="Coaching e mentoria cadastrados"
      subtitle="Lista de coachings e mentorias já registrados."
    >
      {loading ? (
        emptyCard("Carregando coachings...")
      ) : filteredCoachings.length === 0 ? (
        emptyCard("Nenhum coaching encontrado.")
      ) : (
        <div style={cardsGrid}>
          {filteredCoachings.map((item) => {
            const tipoBadge = sustentacaoTypeBadge(item.tipo_coaching);

            return (
              <div key={item.id} style={execCard}>
                <div style={execHeader}>
                  <div>
                    <div style={execTitle}>{item.titulo}</div>
                    <div style={execSubtitle}>
                      {item.jornada_nome} • {item.acao_nome}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={tipoBadge.style}>{tipoBadge.label}</span>
                    <span style={badgeStyle(item.status)}>{displayStatus(item.status)}</span>
                    <span style={attentionBadge(item.attention_info.level)}>
                      {item.attention_info.label}
                    </span>
                  </div>
                </div>

                <div style={execBody}>
                  <div style={execText}>{item.objetivo || "Sem objetivo registrado."}</div>

                  <div style={miniExecutiveBand}>
                    <MiniExecutive
                      label="Sessões"
                      value={fmtNumber(item.sessoes_realizadas || 0)}
                    />
                    <MiniExecutive
                      label="Participantes"
                      value={fmtNumber(item.participantes_realizados || 0)}
                    />
                    <MiniExecutive
                      label="Horas"
                      value={fmtHours(item.horas_totais || 0)}
                    />
                  </div>
                </div>

                <div style={buttonRow}>
                  <button style={buttonSecondaryStyle()} onClick={() => editCoaching(item)}>
                    Editar
                  </button>
                  <button
                    style={buttonDangerStyle()}
                    onClick={() => removeRegistro("coaching", item.id)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
