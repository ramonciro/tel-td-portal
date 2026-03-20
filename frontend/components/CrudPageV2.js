"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "./PortalShell";
import SectionCard from "./SectionCard";
import { apiFetch } from "../services/api";

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

export default function CrudPageV2({
  title,
  subtitle,
  endpoint,
  fields = [],
  columns = [],
  hero = null,
  recordsTitle = "Registros",
  recordsSubtitle = "Base cadastrada",
}) {
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(buildInitialForm(fields));
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");

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

  function handleChange(event, field) {
    if (field.type === "multiselect") {
      const selectedValues = Array.from(event.target.selectedOptions).map(
        (option) => option.value
      );

      setForm((prev) => ({
        ...prev,
        [field.name]: selectedValues,
      }));
      return;
    }

    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function startEdit(record) {
    const nextForm = {};

    fields.forEach((field) => {
      const rawValue = record[field.name];

      if (field.type === "multiselect") {
        nextForm[field.name] = parseMultiValue(rawValue);
      } else if (rawValue === null || rawValue === undefined) {
        nextForm[field.name] =
          field.defaultValue !== undefined
            ? field.defaultValue
            : normalizeInitialValue(field);
      } else {
        nextForm[field.name] = rawValue;
      }
    });

    setForm(nextForm);
    setEditingId(record.id);
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event) {
    event.preventDefault();

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

      if (editingId) {
        await apiFetch(`${endpoint}/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setSuccess("Registro atualizado com sucesso.");
      } else {
        await apiFetch(endpoint, {
          method: "POST",
          body: JSON.stringify(payload),
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
    const confirmed = window.confirm(
      "Deseja realmente excluir este registro?"
    );
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
                  gridColumn: field.type === "textarea" ? "1 / -1" : "auto",
                }}
              >
                <label style={label}>{field.label}</label>

                {field.type === "textarea" ? (
                  <textarea
                    name={field.name}
                    value={form[field.name] ?? ""}
                    onChange={(e) => handleChange(e, field)}
                    placeholder={field.placeholder || ""}
                    rows={4}
                    style={textarea}
                  />
                ) : field.type === "select" ? (
                  <select
                    name={field.name}
                    value={form[field.name] ?? ""}
                    onChange={(e) => handleChange(e, field)}
                    style={input}
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
                  <select
                    name={field.name}
                    multiple
                    value={Array.isArray(form[field.name]) ? form[field.name] : []}
                    onChange={(e) => handleChange(e, field)}
                    style={multiselect}
                  >
                    {(field.options || []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type || "text"}
                    name={field.name}
                    value={form[field.name] ?? ""}
                    onChange={(e) => handleChange(e, field)}
                    placeholder={field.placeholder || ""}
                    style={input}
                  />
                )}

                {field.helperText ? (
                  <span style={helperText}>{field.helperText}</span>
                ) : null}
              </div>
            ))}

            <div style={actionsRow}>
              <button type="submit" style={btnPrimary} disabled={saving}>
                {saving
                  ? "Salvando..."
                  : editingId
                  ? "Atualizar"
                  : "Cadastrar"}
              </button>

              <button type="button" style={btnSecondary} onClick={resetForm}>
                Limpar
              </button>
            </div>
          </form>
        </SectionCard>

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
                    <th style={th}>Ações</th>
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
                      <td style={td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            style={btnEdit}
                            onClick={() => startEdit(record)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            style={btnDelete}
                            onClick={() => handleDelete(record.id)}
                          >
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

const multiselect = {
  width: "100%",
  minHeight: 120,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  padding: "10px 12px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
  boxSizing: "border-box",
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
