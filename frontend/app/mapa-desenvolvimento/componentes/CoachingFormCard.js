"use client";

// Mapa de Desenvolvimento — formulário de cadastro/edição de Coaching e
// mentoria (coaching_planos). Extraído de page.js (22/09/2026, pedido do
// Ramon), sem nenhuma mudança de comportamento.

import SectionCard from "../../../components/SectionCard";
import { coachingInitial } from "./helpers";
import {
  detailsCard,
  detailsSummary,
  formGrid,
  fieldSpan,
  buttonRow,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  compactInputStyle,
  textareaStyle,
  labelStyle,
} from "./estilos";

export default function CoachingFormCard({
  coachingForm,
  setCoachingForm,
  saveCoaching,
  jornadas,
  acoesOptions,
  usuarios,
  saving,
  setErro,
  setNotice,
}) {
  return (
    <SectionCard
      title="Cadastro de coaching e mentoria"
      subtitle="Registre coaching e mentoria como reforço e continuidade da jornada."
    >
      <details open style={detailsCard}>
        <summary style={detailsSummary}>Registro de coaching</summary>

        <form onSubmit={saveCoaching} style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <div style={formGrid}>
            <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
              Jornada
              <select
                value={coachingForm.jornada_id}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    jornada_id: e.target.value,
                    acao_id: "",
                  }))
                }
                style={compactInputStyle()}
              >
                <option value="">Selecione</option>
                {jornadas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome || item.titulo}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
              Ação vinculada
              <select
                value={coachingForm.acao_id}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    acao_id: e.target.value,
                  }))
                }
                style={compactInputStyle()}
                disabled={!coachingForm.jornada_id}
              >
                <option value="">
                  {coachingForm.jornada_id ? "Sem ação vinculada" : "Selecione primeiro a jornada"}
                </option>
                {coachingForm.jornada_id
                  ? acoesOptions
                      .filter(
                        (item) =>
                          String(item.jornada_id) === String(coachingForm.jornada_id)
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.tema}
                        </option>
                      ))
                  : null}
              </select>
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Tipo
              <select
                value={coachingForm.tipo_coaching}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    tipo_coaching: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              >
                <option value="coaching">Coaching</option>
                <option value="mentoria">Mentoria</option>
              </select>
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.xxl }}>
              Título
              <input
                value={coachingForm.titulo}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    titulo: e.target.value,
                  }))
                }
                style={compactInputStyle()}
                required
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
              Público-alvo
              <input
                value={coachingForm.publico_alvo}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    publico_alvo: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
              Responsável
              <select
                value={coachingForm.responsavel_id}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    responsavel_id: e.target.value,
                  }))
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
                value={coachingForm.status}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    status: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              >
                <option value="planejado">Planejado</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluido">Concluído</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Data início
              <input
                type="date"
                value={coachingForm.data_inicio}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    data_inicio: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Data fim
              <input
                type="date"
                value={coachingForm.data_fim}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    data_fim: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Participantes previstos
              <input
                type="number"
                min="0"
                value={coachingForm.participantes_previstos}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    participantes_previstos: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Participantes realizados
              <input
                type="number"
                min="0"
                value={coachingForm.participantes_realizados}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    participantes_realizados: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Sessões previstas
              <input
                type="number"
                min="0"
                value={coachingForm.sessoes_previstas}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    sessoes_previstas: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Sessões realizadas
              <input
                type="number"
                min="0"
                value={coachingForm.sessoes_realizadas}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    sessoes_realizadas: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Carga horária por sessão
              <input
                type="number"
                step="0.5"
                min="0"
                value={coachingForm.carga_horaria_sessao}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    carga_horaria_sessao: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Horas planejadas
              <input
                type="number"
                step="0.5"
                min="0"
                value={coachingForm.horas_planejadas}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    horas_planejadas: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Horas realizadas
              <input
                type="number"
                step="0.5"
                min="0"
                value={coachingForm.horas_totais}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    horas_totais: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.full }}>
              Objetivo
              <textarea
                value={coachingForm.objetivo}
                onChange={(e) =>
                  setCoachingForm((prev) => ({
                    ...prev,
                    objetivo: e.target.value,
                  }))
                }
                style={textareaStyle(92)}
              />
            </label>
          </div>

          <div style={buttonRow}>
            <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
              {coachingForm.id ? "Atualizar coaching" : "Salvar coaching"}
            </button>
            <button
              type="button"
              style={buttonSecondaryStyle()}
              onClick={() => {
                setCoachingForm(coachingInitial);
                setErro("");
                setNotice("");
              }}
            >
              Limpar
            </button>
          </div>
        </form>
      </details>
    </SectionCard>
  );
}
