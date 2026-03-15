"use client";

import { useEffect, useMemo, useState } from "react";
import SectionCard from "./SectionCard";
import PortalShell from "./PortalShell";
import { apiFetch } from "../services/api";

const inputStyle = { width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 14, border: "1px solid #dbe3ef", background: "#fff", fontSize: 14 };
const labelStyle = { display: "grid", gap: 8, fontWeight: 700, color: "#334155" };

export default function CrudPageV2({
  title, subtitle, endpoint, fields = [], columns = [], recordsTitle = "Registros",
  recordsSubtitle = "Acompanhamento dos cadastros", hero, emptyMessage = "Nenhum registro encontrado.",
  transformBeforeSave, renderRecordCard
}) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function loadItems() {
    try {
      setLoading(true);
      const data = await apiFetch(endpoint);
      setItems(Array.isArray(data) ? data : []);
      setErro("");
    } catch (error) {
      setErro(error.message || "Erro ao listar registros");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadItems(); }, [endpoint]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function clearForm() {
    setForm({});
    setEditingId(null);
    setSucesso("");
    setErro("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    setSucesso("");

    try {
      const payload = typeof transformBeforeSave === "function" ? transformBeforeSave(form) : form;
      const method = editingId ? "PUT" : "POST";
      const path = editingId ? `${endpoint}/${editingId}` : endpoint;

      await apiFetch(path, { method, body: JSON.stringify(payload) });
      setSucesso(editingId ? "Registro atualizado com sucesso." : "Registro salvo com sucesso.");
      clearForm();
      await loadItems();
    } catch (error) {
      setErro(error.message || "Erro ao salvar registro");
    }
  }

  function editItem(item) {
    setEditingId(item.id || item.user_id || item.treinamento_id);
    setForm(item);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeItem(item) {
    const id = item.id || item.user_id || item.treinamento_id;
    if (!id) return;
    if (!window.confirm("Deseja realmente excluir este registro?")) return;
    try {
      await apiFetch(`${endpoint}/${id}`, { method: "DELETE" });
      await loadItems();
    } catch (error) {
      setErro(error.message || "Erro ao excluir registro");
    }
  }

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const term = search.toLowerCase();
    return items.filter((item) =>
      Object.values(item || {}).some((value) => String(value ?? "").toLowerCase().includes(term))
    );
  }, [items, search]);

  return (
    <PortalShell title={title} subtitle={subtitle}>
      {hero ? (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 18, marginBottom: 20 }}>
          {hero}
        </div>
      ) : null}

      {erro ? <div style={msgError}>{erro}</div> : null}
      {sucesso ? <div style={msgSuccess}>{sucesso}</div> : null}

      <div style={{ display: "grid", gap: 18 }}>
        <SectionCard
          title={editingId ? "Editar registro" : "Novo registro"}
          subtitle="Preencha os campos do formulário para manter o controle do módulo."
        >
          <form onSubmit={handleSubmit}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              {fields.map((field) => {
                const value = form[field.name] ?? "";
                const options = field.options || [];

                if (field.type === "textarea") {
                  return (
                    <label key={field.name} style={labelStyle}>
                      <span>{field.label}</span>
                      <textarea
                        name={field.name}
                        value={value}
                        onChange={handleChange}
                        placeholder={field.placeholder || field.label}
                        rows={field.rows || 4}
                        style={{ ...inputStyle, resize: "vertical" }}
                      />
                    </label>
                  );
                }

                if (field.type === "select") {
                  return (
                    <label key={field.name} style={labelStyle}>
                      <span>{field.label}</span>
                      <select name={field.name} value={value} onChange={handleChange} style={inputStyle}>
                        <option value="">{field.placeholder || `Selecione ${field.label.toLowerCase()}`}</option>
                        {options.map((option) => {
                          const opt = typeof option === "string" ? { value: option, label: option } : option;
                          return <option key={opt.value} value={opt.value}>{opt.label}</option>;
                        })}
                      </select>
                    </label>
                  );
                }

                return (
                  <label key={field.name} style={labelStyle}>
                    <span>{field.label}</span>
                    <input
                      name={field.name}
                      type={field.type || "text"}
                      value={value}
                      onChange={handleChange}
                      placeholder={field.placeholder || field.label}
                      style={inputStyle}
                    />
                  </label>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
              <button type="submit" style={btnPrimary}>{editingId ? "Atualizar" : "Salvar"}</button>
              <button type="button" onClick={clearForm} style={btnSecondary}>Limpar</button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title={recordsTitle}
          subtitle={recordsSubtitle}
          right={<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar registros" style={{ ...inputStyle, minWidth: 260 }} />}
        >
          {loading ? (
            <div style={{ color: "#64748b" }}>Carregando registros...</div>
          ) : renderRecordCard ? (
            filteredItems.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
                {filteredItems.map((item, index) => renderRecordCard({
                  item, index, onEdit: () => editItem(item), onDelete: () => removeItem(item)
                }))}
              </div>
            ) : <div style={{ color: "#64748b" }}>{emptyMessage}</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 860 }}>
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column.key} style={th}>{column.label}</th>
                    ))}
                    <th style={{ ...th, width: 170 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length ? filteredItems.map((item, index) => (
                    <tr key={item.id || item.user_id || index}>
                      {columns.map((column) => (
                        <td key={column.key} style={{ ...td, background: index % 2 === 0 ? "#ffffff" : "#fbfdff" }}>
                          {typeof column.render === "function" ? column.render(item) : String(item[column.key] ?? "-")}
                        </td>
                      ))}
                      <td style={{ ...td, background: index % 2 === 0 ? "#ffffff" : "#fbfdff" }}>
                        <div style={{ display: "flex", gap: 10 }}>
                          <button onClick={() => editItem(item)} style={btnEdit}>Editar</button>
                          <button onClick={() => removeItem(item)} style={btnDelete}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={columns.length + 1} style={{ padding: 20, color: "#64748b", textAlign: "center" }}>
                        {emptyMessage}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </PortalShell>
  );
}

const th = { textAlign: "left", background: "#f8fafc", color: "#334155", padding: 14, borderTop: "1px solid #e2e8f0", borderBottom: "1px solid #e2e8f0", fontSize: 13, textTransform: "uppercase", letterSpacing: ".03em" };
const td = { padding: 14, borderBottom: "1px solid #eef2f7", color: "#334155", verticalAlign: "top" };
const btnPrimary = { border: 0, background: "#2563eb", color: "#fff", padding: "12px 18px", borderRadius: 14, fontWeight: 800, cursor: "pointer" };
const btnSecondary = { border: "1px solid #cbd5e1", background: "#fff", color: "#334155", padding: "12px 18px", borderRadius: 14, fontWeight: 800, cursor: "pointer" };
const btnEdit = { border: 0, background: "#dbeafe", color: "#1d4ed8", padding: "10px 12px", borderRadius: 12, fontWeight: 800, cursor: "pointer" };
const btnDelete = { border: 0, background: "#fee2e2", color: "#b91c1c", padding: "10px 12px", borderRadius: 12, fontWeight: 800, cursor: "pointer" };
const msgError = { marginBottom: 18, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 16, padding: 16, fontWeight: 600 };
const msgSuccess = { marginBottom: 18, background: "#ecfdf5", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 16, padding: 16, fontWeight: 600 };
