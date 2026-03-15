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
      const separator = endpoint.includes("?") ? "&" : "?";
      const data = await apiFetch(`${endpoint}${separator}t=${Date.now()}`).catch(() => []);
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      setErro(`Erro ao carregar ${String(title || "registros").toLowerCase()}`);
    } finally {
      setCarregando(false);
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  function limparFormulario() {
    setForm({});
    setEditingId(null);
    setErro("");
    setSucesso("");
  }

  function editarRegistro(item) {
    setForm({ ...(item || {}) });
    setEditingId(item?.id || null);
    setErro("");
    setSucesso("");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
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
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 16,
    alignItems: "stretch",
  };

  return (
    <PortalShell title={title} subtitle={subtitle}>
      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      {hero ? <div style={{ marginBottom: 20 }}>{hero}</div> : null}

      <div style={panel}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>
          {editingId ? "Editar registro" : "Novo registro"}
        </h3>
        <p style={helperText}>Preencha os campos do formulário para manter o controle do módulo.</p>

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
                    rows={4}
                    style={textarea}
                  />
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
                  style={input}
                />
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 10, gridColumn: "1 / -1", marginTop: 4, flexWrap: "wrap" }}>
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
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Registros</h3>
            {recordsSubtitle ? <p style={helperText}>{recordsSubtitle}</p> : null}
          </div>

          <input
            type="text"
            placeholder="Pesquisar registros"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchInput}
          />
        </div>

        {carregando ? (
          <div style={emptyState}>Carregando registros...</div>
        ) : filteredItems.length === 0 ? (
          <div style={emptyState}>Nenhum registro encontrado.</div>
        ) : recordsMode === "cards" ? (
          <div style={gridStyle}>
            {filteredItems.map((item) => (
              <div key={item.id} style={cardWrapper}>
                <div style={{ display: "grid", gap: 8 }}>
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
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
  borderRadius: 24,
  padding: 24,
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
  marginBottom: 20,
};

const helperText = {
  margin: "0 0 16px",
  color: "#64748b",
  lineHeight: 1.6,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 18,
};

const fieldWrap = {
  display: "grid",
  gap: 8,
};

const label = {
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 15,
};

const input = {
  width: "100%",
  minHeight: 52,
  borderRadius: 16,
  border: "1px solid #cbd5e1",
  padding: "0 16px",
  fontSize: 15,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
};

const textarea = {
  width: "100%",
  borderRadius: 16,
  border: "1px solid #cbd5e1",
  padding: "14px 16px",
  fontSize: 15,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
  resize: "vertical",
};

const buttonPrimary = {
  border: "none",
  borderRadius: 14,
  padding: "14px 22px",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 800,
  cursor: "pointer",
};

const buttonSecondary = {
  border: "1px solid #cbd5e1",
  borderRadius: 14,
  padding: "14px 22px",
  background: "#ffffff",
  color: "#334155",
  fontWeight: 800,
  cursor: "pointer",
};

const recordsHeader = {
  display: "flex",
  gap: 16,
  justifyContent: "space-between",
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 18,
};

const searchInput = {
  minWidth: 280,
  minHeight: 48,
  borderRadius: 16,
  border: "1px solid #cbd5e1",
  padding: "0 16px",
  fontSize: 15,
  outline: "none",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: "14px 12px",
  borderBottom: "1px solid #e2e8f0",
  color: "#334155",
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: ".03em",
};

const td = {
  padding: "16px 12px",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
};

const cardWrapper = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 14,
  boxShadow: "0 8px 18px rgba(15, 23, 42, 0.04)",
  display: "grid",
  gap: 14,
  alignContent: "space-between",
};

const cardActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const miniEditButton = {
  border: "none",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 800,
  cursor: "pointer",
};

const miniDeleteButton = {
  border: "none",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#fee2e2",
  color: "#b91c1c",
  fontWeight: 800,
  cursor: "pointer",
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 18,
  padding: 16,
  fontWeight: 700,
  marginBottom: 16,
};

const successBox = {
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 18,
  padding: 16,
  fontWeight: 700,
  marginBottom: 16,
};

const emptyState = {
  padding: 18,
  borderRadius: 16,
  background: "#f8fafc",
  color: "#64748b",
  textAlign: "center",
};
