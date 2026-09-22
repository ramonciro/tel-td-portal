"use client";

// Mapa de Desenvolvimento — aba "Visão geral": jornadas de desenvolvimento
// agrupadas por cliente (com progresso) e ações em destaque. Extraído de
// page.js (22/09/2026, pedido do Ramon) sem nenhuma mudança de
// comportamento — só a marcação JSX movida pra cá, recebendo por props os
// dados já calculados e os handlers que já existiam no componente pai.

import SectionCard from "../../../components/SectionCard";
import { fmtNumber, fmtHours, badgeStyle, attentionBadge, prazoBadge, displayStatus } from "./helpers";
import {
  emptyCard,
  MetricBox,
  MiniExecutive,
  clienteGroupHeader,
  clienteGroupCount,
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
  cardsGrid,
  execCard,
  execHeader,
  execTitle,
  execSubtitle,
  execBody,
  execText,
  miniExecutiveBand,
} from "./estilos";

export default function AbaGeral({
  loading,
  jornadasFluxo,
  jornadasFluxoAgrupadas,
  filteredAcoes,
  editJornada,
  removeRegistro,
  editAcao,
}) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SectionCard
        title="Jornadas de desenvolvimento"
        subtitle="Jornadas agrupadas por cliente, com ações, coaching/mentoria e progresso."
      >
        {loading ? (
          emptyCard("Carregando fluxo das jornadas...")
        ) : jornadasFluxo.length === 0 ? (
          emptyCard("Nenhuma jornada encontrada para os filtros aplicados.")
        ) : (
          <div style={{ display: "grid", gap: 24 }}>
            {jornadasFluxoAgrupadas.map((grupo) => (
              <div key={grupo.cliente} style={{ display: "grid", gap: 12 }}>
                <div style={clienteGroupHeader}>
                  {grupo.cliente} <span style={clienteGroupCount}>({grupo.itens.length})</span>
                </div>
                <div style={{ display: "grid", gap: 16 }}>
                  {grupo.itens.map((jornada) => (
                    <div key={jornada.id} style={journeyFlowCard}>
                      <div style={journeyFlowHeader}>
                        <div style={{ display: "grid", gap: 8 }}>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              alignItems: "center",
                            }}
                          >
                            <span style={badgeStyle(jornada.status)}>
                              {displayStatus(jornada.status)}
                            </span>
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
                            Público: {jornada.publico_macro || "Não informado"} • Cliente:{" "}
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
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Ações em destaque"
        subtitle="Leitura executiva das ações do mapa."
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
                  <div style={execText}>{acao.descricao || "Sem descrição registrada."}</div>

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
    </div>
  );
}
