"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";

const initialForm = {
  id: "",
  cliente: "",
  titulo: "",
  descricao: "",
  etapasTexto: ""
};

export default function TrilhasPage() {
  const [items, setItems] = useState([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [form, setForm] = useState(initialForm);

  async function carregar() {
    try {
      setErro("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/trilhas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setErro("Erro ao carregar trilhas");
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
      setSucesso("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const method = form.id ? "PUT" : "POST";
      const url = form.id ? `${apiUrl}/trilhas/${form.id}` : `${apiUrl}/trilhas`;

      const etapas = form.etapasTexto
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);

      const payload = {
        cliente: form.cliente,
        titulo: form.titulo,
        descricao: form.descricao,
        etapas
      };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro ao salvar trilha");

      setForm(initialForm);
      setSucesso("Trilha salva com sucesso");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar trilha");
    }
  }

  function editar(item) {
    setForm({
      id: item.id,
      cliente: item.cliente || "",
      titulo: item.titulo || "",
      descricao: item.descricao || "",
      etapasTexto: Array.isArray(item.etapas) ? item.etapas.join("\n") : ""
    });
  }

  async function excluir(id) {
    if (!confirm("Deseja excluir esta trilha?")) return;
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/trilhas/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      setSucesso("Trilha excluída com sucesso");
      carregar();
    } catch {
      setErro("Erro ao excluir trilha");
    }
  }

  return (
    <PortalShell title="Trilhas de Aprendizagem" subtitle="Estruture jornadas por cliente e operação.">
      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={grid}>
        <div style={panel}>
          <h2 style={h2}>{form.id ? "Editar Trilha" : "Nova Trilha"}</h2>
          <form onSubmit={handleSubmit} style={formGrid}>
            <input name="cliente" placeholder="Cliente" value={form.cliente} onChange={handleChange} style={input} />
            <input name="titulo" placeholder="Título da trilha" value={form.titulo} onChange={handleChange} style={input} />
            <textarea name="descricao" placeholder="Descrição" value={form.descricao} onChange={handleChange} style={{ ...input, minHeight: 90 }} />
            <textarea
              name="etapasTexto"
              placeholder={"Digite uma etapa por linha\nProduto\nAtendimento\nSistemas\nCompliance"}
              value={form.etapasTexto}
              onChange={handleChange}
              style={{ ...input, minHeight: 140 }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" style={buttonPrimary}>{form.id ? "Atualizar" : "Salvar"}</button>
              <button type="button" style={buttonSecondary} onClick={() => setForm(initialForm)}>Limpar</button>
            </div>
          </form>
        </div>

        <div style={panel}>
          <h2 style={h2}>Trilhas Cadastradas</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((item) => (
              <div key={item.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <strong>{item.titulo}</strong>
                    <div style={{ color: "#64748b", marginTop: 4 }}>{item.cliente}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={miniBtn} onClick={() => editar(item)}>Editar</button>
                    <button style={miniBtnDanger} onClick={() => excluir(item.id)}>Excluir</button>
                  </div>
                </div>
                <p style={{ color: "#475569" }}>{item.descricao || "Sem descrição."}</p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {(item.etapas || []).map((etapa, idx) => <li key={idx}>{etapa}</li>)}
                </ul>
              </div>
            ))}
            {items.length === 0 ? <div>Nenhuma trilha cadastrada.</div> : null}
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

const grid = { display: "grid", gridTemplateColumns: "1fr", gap: 16 };
const panel = { background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };
const card = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 };
const h2 = { marginTop: 0 };
const formGrid = { display: "grid", gap: 12 };
const input = { padding: 12, borderRadius: 10, border: "1px solid #d1d5db", width: "100%", boxSizing: "border-box" };
const buttonPrimary = { background: "#1d4ed8", color: "#fff", border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" };
const buttonSecondary = { background: "#e5e7eb", color: "#111827", border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" };
const miniBtn = { background: "#dbeafe", color: "#1d4ed8", border: 0, borderRadius: 8, padding: "8px 10px", cursor: "pointer" };
const miniBtnDanger = { background: "#fee2e2", color: "#b91c1c", border: 0, borderRadius: 8, padding: "8px 10px", cursor: "pointer" };
const errorBox = { background: "#fef2f2", color: "#b91c1c", padding: 14, borderRadius: 12, marginBottom: 16 };
const successBox = { background: "#ecfdf5", color: "#166534", padding: 14, borderRadius: 12, marginBottom: 16 };
