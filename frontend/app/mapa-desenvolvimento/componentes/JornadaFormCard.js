"use client";

// Mapa de Desenvolvimento — formulário de cadastro/edição de Jornada de
// desenvolvimento. Extraído de page.js (22/09/2026, pedido do Ramon), sem
// nenhuma mudança de comportamento.

import SectionCard from "../../../components/SectionCard";
import { journeyInitial } from "./helpers";
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

export default function JornadaFormCard({
  jornadaForm,
  setJornadaForm,
  saveJornada,
  opcoesCliente,
  saving,
  setErro,
  setNotice,
}) {
  return (
    <SectionCard
      title="Cadastro de jornada"
      subtitle="Estruture a jornada de desenvolvimento."
    >
      <details open style={detailsCard}>
        <summary style={detailsSummary}>Registro de jornada</summary>

        <form onSubmit={saveJornada} style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <div style={formGrid}>
            <label style={{ ...labelStyle(), ...fieldSpan.xxl }}>
              Nome da jornada
              <input
                value={jornadaForm.titulo}
                onChange={(e) =>
                  setJornadaForm((prev) => ({ ...prev, titulo: e.target.value }))
                }
                style={compactInputStyle()}
                required
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
              Cliente
              <select
                value={jornadaForm.cliente}
                onChange={(e) =>
                  setJornadaForm((prev) => ({ ...prev, cliente: e.target.value }))
                }
                style={compactInputStyle()}
              >
                <option value="">Selecione</option>
                {opcoesCliente(jornadaForm.cliente).map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
              Público macro
              <input
                value={jornadaForm.publico_alvo}
                onChange={(e) =>
                  setJornadaForm((prev) => ({
                    ...prev,
                    publico_alvo: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Status
              <select
                value={jornadaForm.status}
                onChange={(e) =>
                  setJornadaForm((prev) => ({ ...prev, status: e.target.value }))
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
              Data início
              <input
                type="date"
                value={jornadaForm.data_inicio}
                onChange={(e) =>
                  setJornadaForm((prev) => ({
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
                value={jornadaForm.data_fim}
                onChange={(e) =>
                  setJornadaForm((prev) => ({ ...prev, data_fim: e.target.value }))
                }
                style={compactInputStyle()}
              />
            </label>
          </div>

          <label style={{ ...labelStyle(), ...fieldSpan.full }}>
            Objetivo macro
            <textarea
              value={jornadaForm.objetivo}
              onChange={(e) =>
                setJornadaForm((prev) => ({ ...prev, objetivo: e.target.value }))
              }
              style={textareaStyle(92)}
            />
          </label>

          <div style={buttonRow}>
            <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
              {jornadaForm.id ? "Atualizar jornada" : "Salvar jornada"}
            </button>
            <button
              type="button"
              style={buttonSecondaryStyle()}
              onClick={() => {
                setJornadaForm(journeyInitial);
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
