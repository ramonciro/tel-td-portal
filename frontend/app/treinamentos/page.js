"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";

const initialForm = {
  id: "",
  tema: "",
  cliente: "",
  instrutor: "",
  data: "",
  status: "",
  carga_horaria: "",
  participantes_previstos: "",
  participantes_presentes: "",
  concluidos: ""
};

export default function TreinamentosPage() {
  const [items, setItems] = useState([]);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(initialForm);

  async function carregar() {
    try {
      setErro("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/treinamentos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setErro("Erro ao carregar dados");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setErro("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const method = form.id ? "PUT" : "POST";
      const url = form.id ? `${apiUrl}/treinamentos/${form.id}` : `${apiUrl}/treinamentos`;

      const payload = {
        ...form,
        carga_horaria: Number(form.carga_horaria || 0),
        participantes_previstos: Number(form.participantes_previstos || 0),
        participantes_presentes: Number(form.participantes_presentes || 0),
        concluidos: Number(form.concluidos || 0)
      };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Erro ao salvar treinamento");
      }

      setForm(initialForm);
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar treinamento");
    }
  }

  function editar(item) {
    setForm({
      id: item.id,
      tema: item.tema || "",
      cliente: item.cliente || "",
      instrutor: item.instrutor || "",
      data: formatDateInput(item.data),
      status: item.status || "",
      carga_horaria: item.carga_horaria ?? "",
      participantes_previstos: item.participantes_previstos ?? "",
      participantes_presentes: item.participantes_presentes ?? "",
      concluidos: item.concluidos ?? ""
    });
  }

  async function excluir(id) {
    if (!confirm("Deseja excluir este treinamento?")) return;
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/treinamentos/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      carregar();
    } catch {
      setErro("Erro ao excluir treinamento");
    }
  }

  return (
    <PortalShell title="Treinamentos" subtitle="Cadastro, edição e exclusão de treinamentos.">
      {erro ? <div style={errorBox}>{erro}</div> : null}

      <div style={grid}>
        <div style={panel}>
          <h2 style={h2}>{form.id ? "Editar Treinamento" : "Novo Treinamento"}</h2>
          <form onSubmit={handleSubmit} style={formGrid}>
            <input name="tema" placeholder="Tema" value={form.tema} onChange={handleChange} style={input} />
            <input name="cliente" placeholder="Cliente" value={form.cliente} onChange={handleChange} style={input} />
            <input name="instrutor" placeholder="Instrutor" value={form.instrutor} onChange={handleChange} style={input} />
            <input name="data" type="date" value={form.data} onChange={handleChange} style={input} />
            <input name="status" placeholder="Status" value={form.status} onChange={handleChange} style={input} />
            <input name="carga_horaria" type="number" step="0.1" placeholder="Carga horária" value={form.carga_horaria} onChange={handleChange} style={input} />
            <input name="participantes_previstos" type="number" placeholder="Participantes previstos" value={form.participantes_previstos} onChange={handleChange} style={input} />
            <input name="participantes_presentes" type="number" placeholder="Participantes presentes" value={form.participantes_presentes} onChange={handleChange} style={input} />
            <input name="concluidos" type="number" placeholder="Concluídos" value={form.concluidos} onChange={handleChange} style={input} />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" style={buttonPrimary}>{form.id ? "Atualizar" : "Salvar"}</button>
              <button type="button" style={buttonSecondary} onClick={() => setForm(initialForm)}>Limpar</button>
            </div>
          </form>
        </div>

        <div style={panel}>
          <h2 style={h2}>Lista de Treinamentos</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={thtd}>Tema</th>
                  <th style={thtd}>Cliente</th>
                  <th style={thtd}>Instrutor</th>
                  <th style={thtd}>Data</th>
                  <th style={thtd}>Status</th>
                  <th style={thtd}>Carga Horária</th>
                  <th style={thtd}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={thtd}>{item.tema}</td>
                    <td style={thtd}>{item.cliente}</td>
                    <td style={thtd}>{item.instrutor}</td>
                    <td style={thtd}>{formatDate(item.data)}</td>
                    <td style={thtd}>{item.status}</td>
                    <td style={thtd}>{item.carga_horaria}</td>
                    <td style={thtd}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={miniBtn} onClick={() => editar(item)}>Editar</button>
                        <button style={miniBtnDanger} onClick={() => excluir(item.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr><td style={thtd} colSpan="7">Nenhum treinamento cadastrado.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("pt-BR");
}
function formatDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

const grid = { display: "grid", gridTemplateColumns: "1fr", gap: 16 };
const panel = { background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };
const h2 = { marginTop: 0 };
const formGrid = { display: "grid", gap: 12 };
const input = { padding: 12, borderRadius: 10, border: "1px solid #d1d5db" };
const buttonPrimary = { background: "#1d4ed8", color: "#fff", border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" };
const buttonSecondary = { background: "#e5e7eb", color: "#111827", border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" };
const miniBtn = { background: "#dbeafe", color: "#1d4ed8", border: 0, borderRadius: 8, padding: "8px 10px", cursor: "pointer" };
const miniBtnDanger = { background: "#fee2e2", color: "#b91c1c", border: 0, borderRadius: 8, padding: "8px 10px", cursor: "pointer" };
const table = { width: "100%", borderCollapse: "collapse" };
const thtd = { borderBottom: "1px solid #e5e7eb", padding: 12, textAlign: "left" };
const errorBox = { background: "#fef2f2", color: "#b91c1c", padding: 14, borderRadius: 12, marginBottom: 16 };
