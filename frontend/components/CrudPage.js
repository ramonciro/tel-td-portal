"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "./PortalShell";
import SectionCard from "./SectionCard";
import { StatsGrid } from "./StatsGrid";
import { apiFetch } from "../services/api";

export default function CrudPage({ title, subtitle, endpoint, fields = [], summary = [] }) {
  const [items, setItems] = useState([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [form, setForm] = useState({});

  async function carregar() {
    try {
      setErro("");
      const data = await apiFetch(endpoint);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setErro(e.message || `Erro ao listar ${endpoint.replace("/", "")}`);
      setItems([]);
    }
  }

  useEffect(() => { carregar(); }, [endpoint]);

  const summaryItems = useMemo(() => summary.length ? summary : [
    { label: "Total de registros", value: items.length, icon: "📌", helper: "Base atual carregada da API" },
    { label: "Último status", value: erro ? "Atenção" : "OK", icon: erro ? "⚠️" : "✅", helper: erro || "Consulta realizada com sucesso" },
  ], [items.length, erro, summary]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function salvar(e) {
    e.preventDefault();
    try {
      setErro("");
      setSucesso("");
      if (form.id) {
        await apiFetch(`${endpoint}/${form.id}`, { method: "PUT", body: JSON.stringify(form) });
        setSucesso("Registro atualizado com sucesso.");
      } else {
        await apiFetch(endpoint, { method: "POST", body: JSON.stringify(form) });
        setSucesso("Registro criado com sucesso.");
      }
      setForm({});
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar");
    }
  }

  async function excluir(id) {
    if (!confirm("Deseja excluir este registro?")) return;
    try {
      await apiFetch(`${endpoint}/${id}`, { method: "DELETE" });
      setSucesso("Registro excluído com sucesso.");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao excluir");
    }
  }

  return (
    <PortalShell title={title} subtitle={subtitle}>
      <StatsGrid items={summaryItems} />
      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <SectionCard title={form.id ? "Editar registro" : "Novo registro"} subtitle="Preencha os campos abaixo para manter a base atualizada.">
        <form onSubmit={salvar} style={formGrid}>
          {(fields || []).map((field) =>
            field.type === "textarea" ? (
              <div key={field.name} style={fieldWrap}>
                <label style={label}>{field.label}</label>
                <textarea name={field.name} placeholder={field.placeholder || field.label} value={form[field.name] || ""} onChange={handleChange} style={{ ...input, minHeight: 96 }} />
              </div>
            ) : field.type === "select" ? (
              <div key={field.name} style={fieldWrap}>
                <label style={label}>{field.label}</label>
                <select name={field.name} value={form[field.name] || ""} onChange={handleChange} style={input}>
                  <option value="">Selecione</option>
                  {(field.options || []).map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
              </div>
            ) : (
              <div key={field.name} style={fieldWrap}>
                <label style={label}>{field.label}</label>
                <input type={field.type || "text"} name={field.name} placeholder={field.placeholder || field.label} value={form[field.name] || ""} onChange={handleChange} style={input} />
              </div>
            )
          )}
          <div style={buttonRow}>
            <button type="submit" style={buttonPrimary}>Salvar</button>
            <button type="button" style={buttonSecondary} onClick={() => setForm({})}>Limpar</button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Registros" subtitle="Visualização operacional da base cadastrada.">
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>{["ID", ...(fields || []).map((f) => f.label), "Ações"].map((col) => <th key={col} style={thtdHead}>{col}</th>)}</tr>
            </thead>
            <tbody>
              {(items || []).map((item) => (
                <tr key={item.id} style={row}>
                  <td style={thtd}>{item.id}</td>
                  {(fields || []).map((f) => <td key={f.name} style={thtd}>{String(item?.[f.name] ?? "")}</td>)}
                  <td style={thtd}>
                    <div style={actionRow}>
                      <button style={miniBtn} onClick={() => setForm(item)} type="button">Editar</button>
                      <button style={miniBtnDanger} onClick={() => excluir(item.id)} type="button">Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length ? <tr><td style={emptyCell} colSpan={(fields || []).length + 2}>Nenhum registro encontrado.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </PortalShell>
  );
}

const formGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 };
const fieldWrap = { display: "grid", gap: 8 };
const label = { fontSize: 13, color: "#334155", fontWeight: 600 };
const input = { padding: 12, border: "1px solid #dbe3ef", borderRadius: 12, width: "100%", boxSizing: "border-box", background: "#fcfdff" };
const buttonRow = { display: "flex", gap: 10, alignItems: "center", gridColumn: "1 / -1", marginTop: 4 };
const buttonPrimary = { background: "#2563eb", color: "#fff", border: 0, borderRadius: 12, padding: "12px 18px", cursor: "pointer", fontWeight: 700 };
const buttonSecondary = { background: "#e2e8f0", color: "#0f172a", border: 0, borderRadius: 12, padding: "12px 18px", cursor: "pointer", fontWeight: 700 };
const table = { width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 760 };
const thtdHead = { textAlign: "left", padding: 14, background: "#f8fafc", color: "#334155", fontSize: 13, borderBottom: "1px solid #e2e8f0" };
const thtd = { padding: 14, borderBottom: "1px solid #eef2f7", color: "#0f172a", verticalAlign: "top" };
const row = { background: "#fff" };
const actionRow = { display: "flex", gap: 8, flexWrap: "wrap" };
const emptyCell = { padding: 24, color: "#64748b", textAlign: "center" };
const errorBox = { background: "#fef2f2", color: "#b91c1c", padding: 14, borderRadius: 14, marginBottom: 16, border: "1px solid #fecaca" };
const successBox = { background: "#ecfdf5", color: "#166534", padding: 14, borderRadius: 14, marginBottom: 16, border: "1px solid #bbf7d0" };
const miniBtn = { background: "#dbeafe", color: "#1d4ed8", border: 0, padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontWeight: 600 };
const miniBtnDanger = { background: "#fee2e2", color: "#b91c1c", border: 0, padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontWeight: 600 };
