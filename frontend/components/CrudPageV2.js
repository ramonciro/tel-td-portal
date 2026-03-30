"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "./PortalShell";
import SectionCard from "./SectionCard";
import { apiFetch, getStoredUser, hasSomeRole } from "../services/api";

function normalizeInitialValue(field) {
  if (field.type === "multiselect") return [];
  return "";
}

function buildInitialForm(fields) {
  return fields.reduce((acc, field) => {
    acc[field.name] =
      field.defaultValue !== undefined
        ? field.defaultValue
        : normalizeInitialValue(field);
    return acc;
  }, {});
}

function parseMultiValue(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeMultiValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).join(", ");
  }
  return String(value || "").trim();
}

function toggleMultiValue(currentValues, optionValue) {
  const current = Array.isArray(currentValues) ? currentValues : [];
  if (current.includes(optionValue)) {
    return current.filter((item) => item !== optionValue);
  }
  return [...current, optionValue];
}

function MultiSelectField({ field, value, onChange }) {
  const selectedValues = Array.isArray(value) ? value : [];
  const options = Array.isArray(field.options) ? field.options : [];

  return (
    <div style={multiWrap}>
      <div style={multiHeader}>
        {selectedValues.length ? (
          <div style={chipsWrap}>
            {selectedValues.map((item) => (
              <span key={item} style={chip}>
                {item}
              </span>
            ))}
          </div>
        ) : (
          <span style={multiPlaceholder}>
            {field.placeholder || "Selecione uma ou mais opções"}
          </span>
        )}
      </div>

      <div style={multiList}>
        {options.length ? (
          options.map((option) => {
            const checked = selectedValues.includes(option.value);

            return (
              <label key={option.value} style={multiOption}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(toggleMultiValue(selectedValues, option.value))
                  }
                />
                <span style={multiOptionText}>{option.label}</span>
              </label>
            );
          })
        ) : (
          <div style={multiEmpty}>Nenhuma opção disponível.</div>
        )}
      </div>
    </div>
  );
}

export default function CrudPageV2({
  title,
  subtitle,
  endpoint,
  fields = [],
  columns = [],
  hero = null,
  recordsTitle = "Registros",
  recordsSubtitle = "Base cadastrada",
  allowedCreateRoles = [],
  allowedEditRoles = [],
  allowedDeleteRoles = [],
  transformRecordToForm = null,
  transformFormToPayload = null,
}) {
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(buildInitialForm(fields));
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");

  const user = getStoredUser();

  const canCreate =
    !allowedCreateRoles.length || hasSomeRole(user, allowedCreateRoles);

  const canEdit =
    !allowedEditRoles.length || hasSomeRole(user, allowedEditRoles);

  const canDelete =
    !allowedDeleteRoles.length || hasSomeRole(user, allowedDeleteRoles);

  useEffect(() => {
    loadRecords();
  }, [endpoint]);

  useEffect(() => {
    setForm(buildInitialForm(fields));
  }, [fields]);

  async function loadRecords() {
    try {
      setLoading(true);
      setError("");
      const data = await apiFetch(endpoint);
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Erro ao carregar registros.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm(buildInitialForm(fields));
    setEditingId(null);
    setError("");
    setSuccess("");
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function handleMultiChange(fieldName, nextValues) {
    setForm((prev) => ({
      ...prev,
      [fieldName]: nextValues,
    }));
  }

  function startEdit(record) {
    if (!canEdit) {
      setError("Você não tem permissão para editar este registro.");
      return;
    }

    const baseForm = {};

    fields.forEach((field) => {
      const rawValue = record[field.name];

      if (field.type === "multiselect") {
        baseForm[field.name] = parseMultiValue(rawValue);
      } else if (rawValue === null || rawValue === undefined) {
        baseForm[field.name] =
          field.defaultValue !== undefined
            ? field.defaultValue
            : normalizeInitialValue(field);
      } else {
        baseForm[field.name] = rawValue;
      }
    });

    const nextForm =
      typeof transformRecordToForm === "function"
        ? transformRecordToForm(baseForm, record)
        : baseForm;

    setForm(nextForm);
    setEditingId(record.id);
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (editingId && !canEdit) {
      setError("Você não tem permissão para editar este registro.");
      return;
    }

    if (!editingId && !canCreate) {
      setError("Você não tem permissão para criar registros nesta área.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {};

      fields.forEach((field) => {
        const value = form[field.name];

        if (field.type === "multiselect") {
          payload[field.name] = serializeMultiValue(value);
        } else {
          payload[field.name] = value;
        }
      });

      const finalPayload =
        typeof transformFormToPayload === "function"
          ? transformFormToPayload(payload, form)
          : payload;

      if (editingId) {
        await apiFetch(`${endpoint}/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(finalPayload),
        });
        setSuccess("Registro atualizado com sucesso.");
      } else {
        await apiFetch(endpoint, {
          method: "POST",
          body: JSON.stringify(finalPayload),
        });
        setSuccess("Registro cadastrado com sucesso.");
      }

      resetForm();
      await loadRecords();
    } catch (err) {
      setError(err.message || "Erro ao salvar registro.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!canDelete) {
      setError("Você não tem permissão para excluir este registro.");
      return;
    }

    const confirmed = window.confirm("Deseja realmente excluir este registro?");
    if (!confirmed) return;

    try {
      setError("");
      setSuccess("");

      await apiFetch(`${endpoint}/${id}`, {
        method: "DELETE",
      });

      setSuccess("Registro excluído com sucesso.");
      await loadRecords();
    } catch (err) {
      setError(err.message || "Erro ao excluir registro.");
    }
  }

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;

    return records.filter((record) =>
      Object.values(record || {}).some((value) =>
        String(value || "").toLowerCase().includes(term)
      )
    );
  }, [records, search]);

  return (
    <PortalShell title={title} subtitle={subtitle}>
      <div style={{ display: "grid", gap: 14 }}>
        {hero}

        {error ? <div style={errorBox}>{error}</div> : null}
        {success ? <div style={successBox}>{success}</div> : null}

        {(canCreate || (editingId && canEdit)) ? (
          <SectionCard
            title={editingId ? "Editar registro" : "Novo registro"}
            subtitle="Preencha os campos abaixo para salvar na base."
          >
            <form onSubmit={handleSubmit} style={formGrid}>
              {fields.map((field) => (
                <div
                  key={field.name}
                  style={{
                    ...fieldWrap,
                    gridColumn:
                      field.type === "textarea" || field.type === "multiselect"
                        ? "1 / -1"
                        : "auto",
                  }}
                >
                  <label style={label}>{field.label}</label>

                  {field.type === "textarea" ? (
                    <textarea
                      name={field.name}
                      value={form[field.name] ?? ""}
                      onChange={handleChange}
                      placeholder={field.placeholder || ""}
                      rows={4}
                      style={textarea}
                      disabled={field.disabled}
                    />
                  ) : field.type === "select" ? (
                    <select
                      name={field.name}
                      value={form[field.name] ?? ""}
                      onChange={handleChange}
                      style={input}
                      disabled={field.disabled}
                    >
                      <option value="">
                        {field.placeholder || "Selecione uma opção"}
                      </option>
                      {(field.options || []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "multiselect" ? (
                    <MultiSelectField
                      field={field}
                      value={form[field.name]}
                      onChange={(nextValues) =>
                        handleMultiChange(field.name, nextValues)
                      }
                    />
                  ) : (
                    <input
                      type={field.type || "text"}
                      name={field.name}
                      value={form[field.name] ?? ""}
                      onChange={handleChange}
                      placeholder={field.placeholder || ""}
                      style={input}
                      disabled={field.disabled}
                    />
                  )}

                  {field.helperText ? (
                    <span style={helperText}>{field.helperText}</span>
                  ) : null}
                </div>
              ))}

              <div style={actionsRow}>
                <button type="submit" style={btnPrimary} disabled={saving}>
                  {saving ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
                </button>

                <button type="button" style={btnSecondary} onClick={resetForm}>
                  Limpar
                </button>
              </div>
            </form>
          </SectionCard>
        ) : null}

        <SectionCard title={recordsTitle} subtitle={recordsSubtitle}>
          <div style={toolbar}>
            <input
              type="text"
              placeholder="Buscar registros..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={searchInput}
            />
          </div>

          {loading ? (
            <div style={emptyState}>Carregando registros...</div>
          ) : filteredRecords.length === 0 ? (
            <div style={emptyState}>Nenhum registro encontrado.</div>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column.key} style={th}>
                        {column.label}
                      </th>
                    ))}
                    {(canEdit || canDelete) ? <th style={th}>Ações</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => (
                    <tr key={record.id}>
                      {columns.map((column) => (
                        <td key={column.key} style={td}>
                          {column.render
                            ? column.render(record)
                            : String(record[column.key] ?? "-")}
                        </td>
                      ))}
                      {(canEdit || canDelete) ? (
                        <td style={td}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {canEdit ? (
                              <button
                                type="button"
                                style={btnEdit}
                                onClick={() => startEdit(record)}
                              >
                                Editar
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button
                                type="button"
                                style={btnDelete}
                                onClick={() => handleDelete(record.id)}
                              >
                                Excluir
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </PortalShell>
  );
}

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};

const successBox = {
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 14,
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

const helperText = {
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.4,
};

const input = {
  width: "100%",
  height: 46,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  padding: "0 14px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
  boxSizing: "border-box",
};

const textarea = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  padding: "12px 14px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
  boxSizing: "border-box",
  resize: "vertical",
};

const multiWrap = {
  width: "100%",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  overflow: "hidden",
};

const multiHeader = {
  padding: "12px 14px",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
  minHeight: 50,
  display: "flex",
  alignItems: "center",
};

const multiPlaceholder = {
  color: "#94a3b8",
  fontSize: 14,
};

const chipsWrap = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const chip = {
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 700,
};

const multiList = {
  display: "grid",
  gap: 8,
  padding: 12,
  maxHeight: 180,
  overflowY: "auto",
};

const multiOption = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 10,
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  cursor: "pointer",
};

const multiOptionText = {
  color: "#0f172a",
  fontSize: 14,
  fontWeight: 600,
};

const multiEmpty = {
  color: "#64748b",
  fontSize: 14,
  padding: "4px 2px",
};

const actionsRow = {
  display: "flex",
  gap: 10,
  gridColumn: "1 / -1",
  flexWrap: "wrap",
};

const btnPrimary = {
  border: "none",
  borderRadius: 10,
  padding: "10px 18px",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 14,
};

const btnSecondary = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 18px",
  background: "#ffffff",
  color: "#334155",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 14,
};

const btnEdit = {
  border: "1px solid #bfdbfe",
  borderRadius: 8,
  padding: "7px 10px",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};

const btnDelete = {
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "7px 10px",
  background: "#fff1f2",
  color: "#be123c",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12,
};

const toolbar = {
  display: "flex",
  justifyContent: "flex-end",
  marginBottom: 12,
};

const searchInput = {
  width: "100%",
  maxWidth: 320,
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

const tableWrap = {
  width: "100%",
  overflowX: "auto",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "1px solid #e2e8f0",
  color: "#475569",
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const td = {
  padding: "14px 10px",
  borderBottom: "1px solid #f1f5f9",
  color: "#0f172a",
  verticalAlign: "top",
};

const emptyState = {
  padding: 16,
  color: "#64748b",
};
