"use client";

// Mapa de Desenvolvimento — lista de ações cadastradas. Extraído de
// page.js (22/09/2026, pedido do Ramon), sem nenhuma mudança de
// comportamento.

import SectionCard from "../../../components/SectionCard";
import { fmtNumber, fmtHours, badgeStyle, attentionBadge, displayStatus } from "./helpers";
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

export default function AcoesListaCard({ loading, filteredAcoes, editAcao, removeRegistro }) {
  return (
    <SectionCard
      title="Ações cadastradas"
      subtitle="Lista das ações já registradas no mapa."
    >
      {loading ? (
        emptyCard("Carregando ações...")
      ) : filteredAcoes.length === 0 ? (
        emptyCard("Nenhuma ação encontrada.")
      ) : (
        <div style={cardsGrid}>
          {filteredAcoes.map((acao) => (
            <div key={acao.id} style={execCard}>
              <div style={execHeader}>
                <div>
                  <div style={execTitle}>{acao.tema}</div>
                  <div style={execSubtitle}>
                    {acao.jornada_nome} • {acao.responsavel_nome}
                    {acao.subtipo ? ` • ${acao.subtipo}` : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={badgeStyle(acao.status)}>{displayStatus(acao.status)}</span>
                  <span style={attentionBadge(acao.attention_info.level)}>
                    {acao.attention_info.label}
                  </span>
                </div>
              </div>

              <div style={execBody}>
                <div style={execText}>
                  {acao.descricao || "Sem descrição registrada."}
                </div>

                <div style={miniExecutiveBand}>
                  <MiniExecutive
                    label="Sessões/Turmas"
                    value={fmtNumber(acao.quantidade_turmas_sessoes || 0)}
                  />
                  <MiniExecutive
                    label="Participantes"
                    value={fmtNumber(acao.participantes_realizados || 0)}
                  />
                  <MiniExecutive
                    label="Horas"
                    value={fmtHours(acao.horas_realizadas || 0)}
                  />
                </div>
              </div>

              <div style={buttonRow}>
                <button style={buttonSecondaryStyle()} onClick={() => editAcao(acao)}>
                  Editar
                </button>
                <button
                  style={buttonDangerStyle()}
                  onClick={() => removeRegistro("acao", acao.id)}
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
