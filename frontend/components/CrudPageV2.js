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

export default function CrudPageV2(props) {
  const {
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
  } = props;

  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(buildInitialForm(fields));
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");

  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
  }, []);

  const canCreate =
    !allowedCreateRoles.length || (user && hasSomeRole(user, allowedCreateRoles));

  const canEdit =
    !allowedEditRoles.length || (user && hasSomeRole(user, allowedEditRoles));

  const canDelete =
    !allowedDeleteRoles.length || (user && hasSomeRole(user, allowedDeleteRoles));

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
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleMultiChange(fieldName, nextValues) {
    setForm((prev) => ({ ...prev, [fieldName]: nextValues }));
  }

  function startEdit(record) {
    if (!canEdit) {
      setError("Sem permissão para editar.");
      return;
    }

    const baseForm = {};
    fields.forEach((field) => {
      const raw = record[field.name];

      if (field.type === "multiselect") {
        baseForm[field.name] = parseMultiValue(raw);
      } else {
        baseForm[field.name] = raw ?? normalizeInitialValue(field);
      }
    });

    const next =
      typeof transformRecordToForm === "function"
        ? transformRecordToForm(baseForm, record)
        : baseForm;

    setForm(next);
    setEditingId(record.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");

      const payload = {};

      fields.forEach((f) => {
        payload[f.name] =
          f.type === "multiselect"
            ? serializeMultiValue(form[f.name])
            : form[f.name];
      });

      if (editingId) {
        await apiFetch(`${endpoint}/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(endpoint, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      resetForm();
      loadRecords();
    } catch (err) {
      setError("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Excluir registro?")) return;

    await apiFetch(`${endpoint}/${id}`, { method: "DELETE" });
    loadRecords();
  }

  const filteredRecords = useMemo(() => {
    if (!search) return records;
    return records.filter((r) =>
      JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
    );
  }, [records, search]);

  return (
    <PortalShell title={title} subtitle={subtitle}>
      {hero}

      {error && <div style={errorBox}>{error}</div>}

      {(canCreate || editingId) && (
        <SectionCard title="Cadastro">
          <form onSubmit={handleSubmit} style={formGrid}>
            {fields.map((f) => (
              <input
                key={f.name}
                name={f.name}
                value={form[f.name] || ""}
                onChange={handleChange}
                placeholder={f.label}
                style={input}
              />
            ))}

            <button type="submit" disabled={saving} style={btnPrimary}>
              Salvar
            </button>
          </form>
        </SectionCard>
      )}

      <SectionCard title={recordsTitle}>
        <input
          placeholder="Buscar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={input}
        />

        {filteredRecords.map((r) => (
          <div key={r.id}>
            {JSON.stringify(r)}
            <button onClick={() => startEdit(r)}>Editar</button>
            <button onClick={() => handleDelete(r.id)}>Excluir</button>
          </div>
        ))}
      </SectionCard>
    </PortalShell>
  );
}

const input = { padding: 8, margin: 4 };
const btnPrimary = { padding: 10, background: "blue", color: "#fff" };
const formGrid = { display: "flex", flexDirection: "column" };
const errorBox = { color: "red" };
