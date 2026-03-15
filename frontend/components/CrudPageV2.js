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
      setErro(`Erro ao carregar ${String(title || "registros").toLowerCase()}.`);
    } finally {
      setCarregando(false);
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
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
      await apiFetch(`${endpoint}/${id}`, { method: "DELETE" });
      setSucesso("Registro excluído com sucesso.");
      await carregar();
      if (editingId === id) limparFormulario();
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
    gridTemplateColumns: "repeat(auto-fill, minmax(255px, 1fr))",
    gap: 12,
  };

  return (
    <PortalShell title={title} subtitle={subtitle}>
      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      {hero ? <div style={{ marginBottom: 14 }}>{hero}</div> : null}

      <div style={panel}>
        <div style={sectionHeader}>
          <h3 style={sectionTitle}>{editingId ? "Editar registro" : "Novo registro"}</h3>
          <div style={sectionBadge}>{editingId ? "Edição" : "Cadastro"}</div>
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

            if (field.type === "select") {
              return (
                <div key={field.name} style={fieldWrap}>
                  <label style={label}>{field.label}</label>
                  <select name={field.name} value={value} onChange={handleChange} style={input}>
                    <option value="">{field.placeholder || `Selecione ${field.label.toLowerCase()}`}</option>
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

          <div style={actionRow}>
            <button type="submit" style={buttonPrimary}>{editingId ? "Atualizar" : "Salvar"}</button>
            <button type="button" onClick={limparFormulario} style={buttonSecondary}>Limpar</button>
          </div>
        </form>
      </div>

      <div style={panel}>
        <div style={recordsHeader}>
          <h3 style={sectionTitle}>Registros</h3>
          <input
            type="text"
            placeholder="Pesquisar"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchInput}
          />
        </div>

        {recordsSubtitle ? <div style={recordsNote}>{recordsSubtitle}</div> : null}

        {carregando ? (
          <div style={emptyState}>Carregando registros...</div>
        ) : filteredItems.length === 0 ? (
          <div style={emptyState}>Nenhum registro encontrado.</div>
        ) : recordsMode === "cards" ? (
          <div style={gridStyle}>
            {filteredItems.map((item) => (
              <div key={item.id} style={cardWrapper}>
                <div style={{ display: "grid", gap: 6 }}>
                  {columns.map((column) => (
                    <div key={column.key}>{column.render ? column.render(item) : item[column.key] ?? "-"}</div>
                  ))}
                </div>
                <div style={cardActions}>
                  <button type="button" onClick={() => editarRegistro(item)} style={miniEditButton}>Editar</button>
                  <button type="button" onClick={() => excluirRegistro(item.id)} style={miniDeleteButton}>Excluir</button>
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
                    <th key={column.key} style={th}>{column.label}</th>
                  ))}
                  <th style={th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    {columns.map((column) => (
                      <td key={column.key} style={td}>{column.render ? column.render(item) : item[column.key] ?? "-"}</td>
                    ))}
                    <td style={td}>
                      <div style={tableActionRow}>
                        <button type="button" onClick={() => editarRegistro(item)} style={miniEditButton}>Editar</button>
                        <button type="button" onClick={() => excluirRegistro(item.id)} style={miniDeleteButton}>Excluir</button>
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
  padding: 18,
  boxShadow: "0 10px 24px rgba(15,23,42,.04)",
  marginBottom: 14,
};

const sectionHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 12,
  flexWrap: "wrap"
};

const sectionTitle = {
  margin: 0,
  fontSize: 16,
  color: "#0f172a"
};

const sectionBadge = {
  background: "#eff6ff",
  color: "#2563eb",
  border: "1px solid #bfdbfe",
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".03em"
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
};

const fieldWrap = {
  display: "grid",
  gap: 6,
};

const label = {
  fontWeight: 800,
  color: "#334155",
  fontSize: 13,
};

const input = {
  width: "100%",
  height: 40,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
  boxSizing: "border-box"
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
  boxSizing: "border-box"
};

const actionRow = {
  display: "flex",
  gap: 8,
  gridColumn: "1 / -1",
  marginTop: 2,
  flexWrap: "wrap"
};

const buttonPrimary = {
  border: "none",
  borderRadius: 10,
  padding: "11px 16px",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13
};

const buttonSecondary = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "11px 16px",
  background: "#ffffff",
  color: "#334155",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13
};

const recordsHeader = {
  display: "flex",
  gap: 12,
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 10,
};

const searchInput = {
  width: 220,
  maxWidth: "100%",
  height: 38,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box"
};

const recordsNote = {
  marginBottom: 12,
  color: "#64748b",
  fontSize: 13
};

const table = { width: "100%", borderCollapse: "collapse" };
const th = { textAlign: "left", padding: "12px 10px", borderBottom: "1px solid #e2e8f0", color: "#334155", fontSize: 12, textTransform: "uppercase", letterSpacing: ".03em" };
const td = { padding: "12px 10px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top", fontSize: 14 };

const cardWrapper = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 14,
  boxShadow: "0 8px 18px rgba(15,23,42,.04)",
  display: "grid",
  gap: 10,
};

const cardActions = { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" };
const tableActionRow = { display: "flex", gap: 8, flexWrap: "wrap" };

const miniEditButton = {
  border: "none",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12
};

const miniDeleteButton = {
  border: "none",
  borderRadius: 10,
  padding: "8px 12px",
  background: "#fee2e2",
  color: "#b91c1c",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 12
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
};
