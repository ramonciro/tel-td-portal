"use client";

// Mapa de Desenvolvimento — formulário de cadastro/edição de Ação de
// desenvolvimento. Extraído de page.js (22/09/2026, pedido do Ramon), sem
// nenhuma mudança de comportamento.

import SectionCard from "../../../components/SectionCard";
import { actionInitial, SUBTIPOS_ACAO } from "./helpers";
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

export default function AcaoFormCard({
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
}) {
  return (
    <SectionCard
      title="Cadastro de ação"
      subtitle="Cadastre ações com lançamento manual, sem vínculo com a página de turmas."
    >
      <details open style={detailsCard}>
        <summary style={detailsSummary}>Registro de ação</summary>

        <form onSubmit={saveAcao} style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <div style={formGrid}>
            <label style={{ ...labelStyle(), ...fieldSpan.xl }}>
              Jornada
              <select
                value={acaoForm.jornada_id}
                onChange={(e) =>
                  setAcaoForm((prev) => ({
                    ...prev,
                    jornada_id: e.target.value,
                  }))
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

            <label style={{ ...labelStyle(), ...fieldSpan.xxl }}>
              Título da ação
              <input
                value={acaoForm.titulo}
                onChange={(e) =>
                  setAcaoForm((prev) => ({ ...prev, titulo: e.target.value }))
                }
                style={compactInputStyle()}
                required
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
              Subdivisão
              <select
                value={acaoForm.subtipo}
                onChange={(e) =>
                  setAcaoForm((prev) => ({ ...prev, subtipo: e.target.value }))
                }
                style={compactInputStyle()}
              >
                <option value="">Não classificada</option>
                {SUBTIPOS_ACAO.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
              Vincular turma (opcional)
              <select
                value={acaoForm.turma_id}
                onChange={(e) => handleSelecionarTurma(e.target.value)}
                style={compactInputStyle()}
              >
                <option value="">Nenhuma</option>
                {turmas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.tema} • {item.cliente}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.lg }}>
              Responsável
              <select
                value={acaoForm.responsavel_id}
                onChange={(e) =>
                  setAcaoForm((prev) => ({
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
                value={acaoForm.status}
                onChange={(e) =>
                  setAcaoForm((prev) => ({ ...prev, status: e.target.value }))
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
                value={acaoForm.data_inicio}
                onChange={(e) =>
                  setAcaoForm((prev) => ({
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
                value={acaoForm.data_fim}
                onChange={(e) =>
                  setAcaoForm((prev) => ({
                    ...prev,
                    data_fim: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Carga horária base
              <input
                type="number"
                step="0.5"
                min="0"
                value={acaoForm.carga_horaria}
                onChange={(e) =>
                  setAcaoForm((prev) => ({
                    ...prev,
                    carga_horaria: e.target.value,
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
                value={acaoForm.participantes_previstos}
                onChange={(e) =>
                  setAcaoForm((prev) => ({
                    ...prev,
                    participantes_previstos: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.md }}>
              Turmas / sessões
              <input
                type="number"
                min="0"
                value={acaoForm.quantidade_turmas_sessoes}
                onChange={(e) =>
                  setAcaoForm((prev) => ({
                    ...prev,
                    quantidade_turmas_sessoes: e.target.value,
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
                value={acaoForm.participantes_realizados}
                onChange={(e) =>
                  setAcaoForm((prev) => ({
                    ...prev,
                    participantes_realizados: e.target.value,
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
                value={acaoForm.horas_planejadas}
                onChange={(e) =>
                  setAcaoForm((prev) => ({
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
                value={acaoForm.horas_realizadas}
                onChange={(e) =>
                  setAcaoForm((prev) => ({
                    ...prev,
                    horas_realizadas: e.target.value,
                  }))
                }
                style={compactInputStyle()}
              />
            </label>

            <label style={{ ...labelStyle(), ...fieldSpan.full }}>
              Descrição
              <textarea
                value={acaoForm.descricao}
                onChange={(e) =>
                  setAcaoForm((prev) => ({
                    ...prev,
                    descricao: e.target.value,
                  }))
                }
                style={textareaStyle(92)}
              />
            </label>
          </div>

          <div style={buttonRow}>
            <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
              {acaoForm.id ? "Atualizar ação" : "Salvar ação"}
            </button>

            <button
              type="button"
              style={buttonSecondaryStyle()}
              onClick={() => {
                setAcaoForm(actionInitial);
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
