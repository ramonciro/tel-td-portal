"use client";

// Mapa de Desenvolvimento — cadastro de Clientes da Metodologia (lista
// exclusiva deste módulo, sem vínculo com a tabela `clientes` da
// Treinamento). Extraído de page.js (22/09/2026, pedido do Ramon), sem
// nenhuma mudança de comportamento.

import SectionCard from "../../../components/SectionCard";
import { clienteMetInitial, badgeStyle } from "./helpers";
import {
  emptyCard,
  detailsCard,
  detailsSummary,
  formGrid,
  fieldSpan,
  buttonRow,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  compactInputStyle,
  labelStyle,
  crewPillRow,
  crewPill,
  crewPillName,
} from "./estilos";

export default function ClientesMetodologiaCard({
  clienteMetForm,
  setClienteMetForm,
  saveClienteMetodologia,
  editClienteMetodologia,
  alternarStatusCliente,
  metodologiaClientes,
  saving,
  setErro,
  setNotice,
}) {
  return (
    <SectionCard
      title="Clientes da Metodologia"
      subtitle="Lista de clientes exclusiva deste módulo — não é a mesma lista de clientes da Treinamento. Cadastre aqui os nomes que vão aparecer nos formulários de jornada, participante e trilha."
    >
      <details style={detailsCard}>
        <summary style={detailsSummary}>
          {clienteMetForm.id ? "Editar cliente" : "Cadastrar cliente"}
        </summary>

        <form
          onSubmit={saveClienteMetodologia}
          style={{ display: "grid", gap: 12, marginTop: 14 }}
        >
          <div style={formGrid}>
            <label style={{ ...labelStyle(), ...fieldSpan.xl }}>
              Nome do cliente
              <input
                value={clienteMetForm.nome}
                onChange={(e) =>
                  setClienteMetForm((prev) => ({ ...prev, nome: e.target.value }))
                }
                style={compactInputStyle()}
                required
              />
            </label>

            {clienteMetForm.id ? (
              <label style={{ ...labelStyle(), ...fieldSpan.md }}>
                Status
                <select
                  value={clienteMetForm.status}
                  onChange={(e) =>
                    setClienteMetForm((prev) => ({ ...prev, status: e.target.value }))
                  }
                  style={compactInputStyle()}
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
            ) : null}
          </div>

          <div style={buttonRow}>
            <button type="submit" style={buttonPrimaryStyle(saving)} disabled={saving}>
              {clienteMetForm.id ? "Atualizar cliente" : "Cadastrar cliente"}
            </button>
            <button
              type="button"
              style={buttonSecondaryStyle()}
              onClick={() => {
                setClienteMetForm(clienteMetInitial);
                setErro("");
                setNotice("");
              }}
            >
              Limpar
            </button>
          </div>
        </form>
      </details>

      <div style={{ marginTop: 14 }}>
        {metodologiaClientes.length === 0 ? (
          emptyCard("Nenhum cliente cadastrado ainda.")
        ) : (
          <div style={crewPillRow}>
            {metodologiaClientes.map((item) => (
              <div key={item.id} style={crewPill}>
                <div style={crewPillName}>{item.nome}</div>
                <div style={{ ...buttonRow, marginTop: 6 }}>
                  <span style={badgeStyle(item.status === "inativo" ? "inativo" : "ativo")}>
                    {item.status === "inativo" ? "Inativo" : "Ativo"}
                  </span>
                  <button
                    type="button"
                    style={buttonSecondaryStyle()}
                    onClick={() => editClienteMetodologia(item)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    style={buttonSecondaryStyle()}
                    onClick={() => alternarStatusCliente(item)}
                  >
                    {item.status === "inativo" ? "Reativar" : "Desativar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
