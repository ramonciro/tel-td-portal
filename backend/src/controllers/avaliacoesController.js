"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "./PortalShell";
import { apiFetch } from "../services/api";

export default function CrudPageV2({
  title,
  subtitle,
  endpoint,
  fields = [],
  columns = [],
  hero = null,
  recordsSubtitle = "",
  recordsMode = "table",
  recordsGridStyle = null,
  recordsTitle = "Registros",
  renderRecordCard = null,
}) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    carregar();
  }, [endpoint]);

  async function carregar() {
    try {
      setCarregando(true);
      setErro("");
      const data = await apiFetch(`${endpoint}?t=${Date.now()}`).catch(() => []);
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      setErro(`Erro ao carregar ${String(title || "registros").toLowerCase()}.`);
    } finally {
      setCarregando(false);
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((prev) => {
      const next = {
        ...prev,
        [name]: value,
      };

      fields.forEach((field) => {
        if (field.type === "dependent-select" && field.dependsOn === name) {
          next[field.name] = "";
        }
      });

      return next;
    });
  }

  function limparFormulario() {
    setForm({});
    setEditingId(null);
    setErro("");
    setSucesso("");
  }

  function editarRegistro(item) {
    setForm({ ...item });
    setEditingId(item?.id || null);
    setErro("");
    setSucesso("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function excluirRegistro(id) {
    const confirmar = window.confirm("Deseja realmente excluir este registro?");
    if (!confirmar) return;

    try {
      setErro("");
      setSucesso("");

      await apiFetch(`${endpoint}/${id}`, {
        method: "DELETE",
      });

      setSucesso("Registro excluído com sucesso.");
      await carregar();

      if (editingId === id) {
        limparFormulario();
      }
    } catch (error) {
      setErro(error.message || "Erro ao excluir registro.");
    }
  }

  async function salvar(event) {
    event.preventDefault();

    try {
      setErro("");
      setSucesso("");

      const metodo = editingId ? "PUT" : "POST";
      const url = editingId ? `${endpoint}/${editingId}` : endpoint;

      await apiFetch(url, {
        method: metodo,
        body: JSON.stringify(form),
      });

      setSucesso(editingId ? "Registro atualizado com sucesso." : "Registro criado com sucesso.");
      setForm({});
      setEditingId(null);
      await carregar();
    } catch (error) {
      setErro(error.message || "Erro ao salvar registro.");
    }
  }

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const termo = search.toLowerCase();
    return items.filter((item) => JSON.stringify(item).toLowerCase().includes(termo));
  }, [items, search]);

  const gridStyle = recordsGridStyle || {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  };

  return (
    <PortalShell title={title} subtitle={subtitle}>
      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      {hero ? <div style={{ marginBottom: 14 }}>{hero}</div> : null}

      <div style={panel}>
        <div style={panelHeaderCompact}>
          <h3 style={panelTitle}>{editingId ? "Editar registro" : "Novo registro"}</h3>
          {editingId ? (
            <span style={editingTag}>Modo edição</span>
          ) : null}
        </div>

        <form onSubmit={salvar} style={formGrid}>
          {fields.map((field) => {
            const value = form[field.name] ?? "";

            if (field.type === "textarea") {
              return (
                <div key={field.name} style={{ ...fieldWrap, gridColumn: "1 / -1" }}>
                  <label style={label}>{field.label}</label>
                  <textarea
                    name={field.name}
                    value={value}
                    onChange={handleChange}
                    placeholder={field.placeholder || ""}
                    rows={3}
                    style={textarea}
                  />
                </div>
              );
            }

            if (field.type === "dependent-select") {
              const parentValue = form[field.dependsOn] ?? "";
              const options = field.optionsMap?.[String(parentValue)] || [];

              return (
                <div key={field.name} style={fieldWrap}>
                  <label style={label}>{field.label}</label>
                  <select
                    name={field.name}
                    value={value}
                    onChange={handleChange}
                    style={input}
                    disabled={!parentValue}
                  >
                    <option value="">
                      {field.placeholder || `Selecione ${field.label.toLowerCase()}`}
                    </option>
                    {options.map((option) => {
                      const optionValue = typeof option === "object" ? option.value : option;
                      const optionLabel = typeof option === "object" ? option.label : option;

                      return (
                        <option key={`${field.name}-${optionValue}`} value={optionValue}>
                          {optionLabel}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            }

            if (field.type === "select") {
              return (
                <div key={field.name} style={fieldWrap}>
                  <label style={label}>{field.label}</label>
                  <select
                    name={field.name}
                    value={value}
                    onChange={handleChange}
                    style={input}
                  >
                    <option value="">
                      {field.placeholder || `Selecione ${field.label.toLowerCase()}`}
                    </option>
                    {(field.options || []).map((option) => {
                      const optionValue = typeof option === "object" ? option.value : option;
                      const optionLabel = typeof option === "object" ? option.label : option;

                      return (
                        <option key={`${field.name}-${optionValue}`} value={optionValue}>
                          {optionLabel}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            }

            return (
              <div key={field.name} style={fieldWrap}>
                <label style={label}>{field.label}</label>
                <input
                  type={field.type || "text"}
                  name={field.name}
                  value={value}
                  onChange={handleChange}
                  placeholder={field.placeholder || ""}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  style={input}
                />
              </div>
            );
          })}

          <div style={actionsRow}>
            <button type="submit" style={buttonPrimary}>
              {editingId ? "Atualizar" : "Salvar"}
            </button>
            <button type="button" onClick={limparFormulario} style={buttonSecondary}>
              Limpar
            </button>
          </div>
        </form>
      </div>

      <div style={panel}>
        <div style={recordsHeader}>
          <div>
            <h3 style={panelTitle}>{recordsTitle}</h3>
            {recordsSubtitle ? <p style={helperText}>{recordsSubtitle}</p> : null}
          </div>

          <input
            type="text"
            placeholder="Pesquisar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchInput}
          />
        </div>

        {carregando ? (
          <div style={emptyState}>Carregando registros...</div>
        ) : filteredItems.length === 0 ? (
          <div style={emptyState}>Nenhum registro encontrado.</div>
        ) : renderRecordCard ? (
          <div style={gridStyle}>
            {filteredItems.map((item) =>
              renderRecordCard({
                item,
                onEdit: () => editarRegistro(item),
                onDelete: () => excluirRegistro(item.id),
              })
            )}
          </div>
        ) : recordsMode === "cards" ? (
          <div style={gridStyle}>
            {filteredItems.map((item) => (
              <div key={item.id} style={cardWrapper}>
                <div style={{ display: "grid", gap: 6 }}>
                  {columns.map((column) => (
                    <div key={column.key}>
                      {column.render ? column.render(item) : item[column.key] ?? "-"}
                    </div>
                  ))}
                </div>

                <div style={cardActions}>
                  <button type="button" onClick={() => editarRegistro(item)} style={miniEditButton}>
                    Editar
                  </button>
                  <button type="button" onClick={() => excluirRegistro(item.id)} style={miniDeleteButton}>
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} style={th}>
                      {column.label}
                    </th>
                  ))}
                  <th style={th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    {columns.map((column) => (
                      <td key={column.key} style={td}>
                        {column.render ? column.render(item) : item[column.key] ?? "-"}
                      </td>
                    ))}
                    <td style={td}>
                      <div style={tableActions}>
                        <button type="button" onClick={() => editarRegistro(item)} style={miniEditButton}>
                          Editar
                        </button>
                        <button type="button" onClick={() => excluirRegistro(item.id)} style={miniDeleteButton}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

const panel = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.04)",
  marginBottom: 14,
};

const panelHeaderCompact = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 12,
};

const panelTitle = {
  margin: 0,
  fontSize: 16,
  color: "#0f172a",
};

const editingTag = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: 999,
  background: "#dbeafe",
  color: "#1d4ed8",
  fontSize: 11,
  fontWeight: 800,
};

const helperText = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldWrap = {
  display: "grid",
  gap: 6,
};

const label = {
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 14,
};

const input = {
  width: "100%",
  height: 42,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
  boxSizing: "border-box",
};

const textarea = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "10px 12px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
  resize: "vertical",
  boxSizing: "border-box",
  minHeight: 76,
};

const actionsRow = {
  display: "flex",
  gap: 8,
  gridColumn: "1 / -1",
  marginTop: 2,
  flexWrap: "wrap",
};

const buttonPrimary = {
  border: "none",
  borderRadius: 10,
  padding: "10px 16px",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 14,
};

const buttonSecondary = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 16px",
  background: "#ffffff",
  color: "#334155",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 14,
};

const recordsHeader = {
  display: "flex",
  gap: 12,
  justifyContent: "space-between",
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12,
};

const searchInput = {
  width: 180,
  height: 38,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid #e2e8f0",
  color: "#334155",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".03em",
};

const td = {
  padding: "12px 8px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
  fontSize: 14,
};

const tableActions = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const cardWrapper = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 12,
  boxShadow: "0 6px 14px rgba(15, 23, 42, 0.03)",
  display: "grid",
  gap: 10,
};

const cardActions = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const miniEditButton = {
  border: "none",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
};

const miniDeleteButton = {
  border: "none",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#fee2e2",
  color: "#b91c1c",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
  marginBottom: 12,
};

const successBox = {
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
  marginBottom: 12,
};

const emptyState = {
  padding: 14,
  borderRadius: 12,
  background: "#f8fafc",
  color: "#64748b",
  textAlign: "center",
  fontSize: 14,
};
