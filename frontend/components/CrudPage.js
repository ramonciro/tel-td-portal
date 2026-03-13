"use client";
import { useEffect, useState } from "react"
import PortalShell from "./PortalShell"
import { apiFetch } from "../services/api"

export default function CrudPage({ title, subtitle, endpoint, fields }) {
  const [items, setItems] = useState([]); const [erro, setErro] = useState(""); const [sucesso, setSucesso] = useState(""); const [form, setForm] = useState({})
  async function carregar() { try { setErro(""); const data = await apiFetch(endpoint); setItems(Array.isArray(data) ? data : []) } catch (e) { setErro(e.message || "Erro ao carregar dados") } }
  useEffect(() => { carregar() }, [])
  function handleChange(e) { const { name, value } = e.target; setForm((prev) => ({ ...prev, [name]: value })) }
  async function salvar(e) {
    e.preventDefault()
    try {
      setErro(""); setSucesso("")
      if (form.id) { await apiFetch(`${endpoint}/${form.id}`, { method: "PUT", body: JSON.stringify(form) }); setSucesso("Registro atualizado com sucesso") }
      else { await apiFetch(endpoint, { method: "POST", body: JSON.stringify(form) }); setSucesso("Registro criado com sucesso") }
      setForm({}); carregar()
    } catch (e) { setErro(e.message || "Erro ao salvar") }
  }
  async function excluir(id) {
    if (!confirm("Deseja excluir este registro?")) return
    try { await apiFetch(`${endpoint}/${id}`, { method: "DELETE" }); setSucesso("Registro excluído com sucesso"); carregar() }
    catch (e) { setErro(e.message || "Erro ao excluir") }
  }
  return (
    <PortalShell title={title} subtitle={subtitle}>
      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}
      <div style={panel}>
        <h3 style={{ marginTop: 0 }}>{form.id ? "Editar registro" : "Novo registro"}</h3>
        <form onSubmit={salvar} style={formGrid}>
          {fields.map((field) => field.type === "textarea" ? (
            <textarea key={field.name} name={field.name} placeholder={field.label} value={form[field.name] || ""} onChange={handleChange} style={{ ...input, minHeight: 90 }} />
          ) : field.type === "select" ? (
            <select key={field.name} name={field.name} value={form[field.name] || ""} onChange={handleChange} style={input}>
              <option value="">{field.label}</option>{field.options.map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
          ) : (
            <input key={field.name} type={field.type || "text"} name={field.name} placeholder={field.label} value={form[field.name] || ""} onChange={handleChange} style={input} />
          ))}
          <div style={{ display: "flex", gap: 10 }}><button type="submit" style={buttonPrimary}>Salvar</button><button type="button" style={buttonSecondary} onClick={() => setForm({})}>Limpar</button></div>
        </form>
      </div>
      <div style={panel}>
        <h3 style={{ marginTop: 0 }}>Registros</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead><tr>{["ID", ...fields.map((f) => f.label), "Ações"].map((col) => <th key={col} style={thtd}>{col}</th>)}</tr></thead>
            <tbody>
              {items.map((item) => <tr key={item.id}><td style={thtd}>{item.id}</td>{fields.map((f) => <td key={f.name} style={thtd}>{String(item[f.name] ?? "")}</td>)}<td style={thtd}><div style={{ display: "flex", gap: 8 }}><button style={miniBtn} onClick={() => setForm(item)}>Editar</button><button style={miniBtnDanger} onClick={() => excluir(item.id)}>Excluir</button></div></td></tr>)}
              {!items.length ? <tr><td style={thtd} colSpan={fields.length + 2}>Nenhum registro encontrado.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </PortalShell>
  )
}
const panel = { background: "#fff", padding: 20, borderRadius: 12, marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,.08)" }
const formGrid = { display: "grid", gap: 12 }
const input = { padding: 12, border: "1px solid #cbd5e1", borderRadius: 10, width: "100%", boxSizing: "border-box" }
const buttonPrimary = { background: "#2563eb", color: "#fff", border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" }
const buttonSecondary = { background: "#e5e7eb", color: "#111827", border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" }
const table = { width: "100%", borderCollapse: "collapse" }
const thtd = { padding: 12, borderBottom: "1px solid #e5e7eb", textAlign: "left", verticalAlign: "top" }
const errorBox = { background: "#fef2f2", color: "#b91c1c", padding: 12, borderRadius: 10, marginBottom: 16 }
const successBox = { background: "#ecfdf5", color: "#166534", padding: 12, borderRadius: 10, marginBottom: 16 }
const miniBtn = { background: "#dbeafe", color: "#1d4ed8", border: 0, padding: "8px 10px", borderRadius: 8, cursor: "pointer" }
const miniBtnDanger = { background: "#fee2e2", color: "#b91c1c", border: 0, padding: "8px 10px", borderRadius: 8, cursor: "pointer" }
