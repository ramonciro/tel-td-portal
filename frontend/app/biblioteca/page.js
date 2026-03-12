"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";

const initialForm = {
  id: "",
  titulo: "",
  tipo: "",
  cliente: "",
  link_arquivo: "",
  descricao: ""
};

export default function BibliotecaPage() {
  const [items, setItems] = useState([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [form, setForm] = useState(initialForm);

  async function carregar() {
    try {
      setErro("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/biblioteca`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setErro("Erro ao carregar biblioteca");
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
      const url = form.id ? `${apiUrl}/biblioteca/${form.id}` : `${apiUrl}/biblioteca`;

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro ao salvar conteúdo");

      setForm(initialForm);
      setSucesso("Conteúdo salvo com sucesso");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar conteúdo");
    }
  }

  function editar(item) {
    setForm({
      id: item.id,
      titulo: item.titulo || "",
      tipo: item.tipo || "",
      cliente: item.cliente || "",
      link_arquivo: item.link_arquivo || "",
      descricao: item.descricao || ""
    });
  }

  async function excluir(id) {
    if (!confirm("Deseja excluir este conteúdo?")) return;
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/biblioteca/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      setSucesso("Conteúdo excluído com sucesso");
      carregar();
    } catch {
      setErro("Erro ao excluir conteúdo");
    }
  }

  return (
    <PortalShell title="Biblioteca" subtitle="Conteúdos de treinamento, materiais e links por cliente.">
      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={grid}>
        <div style={panel}>
          <h2 style={h2}>{form.id ? "Editar Conteúdo" : "Novo Conteúdo"}</h2>
          <form onSubmit={handleSubmit} style={formGrid}>
            <input name="titulo" placeholder="Título" value={form.titulo} onChange={handleChange} style={input} />
            <input name="tipo" placeholder="Tipo (PDF, PPT, vídeo, link)" value={form.tipo} onChange={handleChange} style={input} />
            <input name="cliente" placeholder="Cliente" value={form.cliente} onChange={handleChange} style={input} />
            <input name="link_arquivo" placeholder="Link do arquivo" value={form.link_arquivo} onChange={handleChange} style={input} />
            <textarea name="descricao" placeholder="Descrição" value={form.descricao} onChange={handleChange} style={{ ...input, minHeight: 100 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" style={buttonPrimary}>{form.id ? "Atualizar" : "Salvar"}</button>
              <button type="button" style={buttonSecondary} onClick={() => setForm(initialForm)}>Limpar</button>
            </div>
          </form>
        </div>

        <div style={panel}>
          <h2 style={h2}>Conteúdos Cadastrados</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={thtd}>Título</th>
                  <th style={thtd}>Tipo</th>
                  <th style={thtd}>Cliente</th>
                  <th style={thtd}>Link</th>
                  <th style={thtd}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={thtd}>{item.titulo}</td>
                    <td style={thtd}>{item.tipo}</td>
                    <td style={thtd}>{item.cliente}</td>
                    <td style={thtd}>{item.link_arquivo || "-"}</td>
                    <td style={thtd}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={miniBtn} onClick={() => editar(item)}>Editar</button>
                        <button style={miniBtnDanger} onClick={() => excluir(item.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? <tr><td style={thtd} colSpan="5">Nenhum conteúdo cadastrado.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

const grid = { display: "grid", gridTemplateColumns: "1fr", gap: 16 };
const panel = { background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };
const h2 = { marginTop: 0 };
const formGrid = { display: "grid", gap: 12 };
const input = { padding: 12, borderRadius: 10, border: "1px solid #d1d5db", width: "100%", boxSizing: "border-box" };
const buttonPrimary = { background: "#1d4ed8", color: "#fff", border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" };
const buttonSecondary = { background: "#e5e7eb", color: "#111827", border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" };
const miniBtn = { background: "#dbeafe", color: "#1d4ed8", border: 0, borderRadius: 8, padding: "8px 10px", cursor: "pointer" };
const miniBtnDanger = { background: "#fee2e2", color: "#b91c1c", border: 0, borderRadius: 8, padding: "8px 10px", cursor: "pointer" };
const table = { width: "100%", borderCollapse: "collapse" };
const thtd = { borderBottom: "1px solid #e5e7eb", padding: 12, textAlign: "left" };
const errorBox = { background: "#fef2f2", color: "#b91c1c", padding: 14, borderRadius: 12, marginBottom: 16 };
const successBox = { background: "#ecfdf5", color: "#166534", padding: 14, borderRadius: 12, marginBottom: 16 };
