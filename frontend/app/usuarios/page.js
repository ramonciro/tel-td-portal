"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";

const initialForm = {
  id: "",
  nome: "",
  email: "",
  senha: "",
  perfil: "",
  cliente: "",
  ativo: true
};

export default function UsuariosPage() {
  const [items, setItems] = useState([]);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(initialForm);

  async function carregar() {
    try {
      setErro("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/users`, {
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
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setErro("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const method = form.id ? "PUT" : "POST";
      const url = form.id ? `${apiUrl}/users/${form.id}` : `${apiUrl}/users`;

      const payload = { ...form };
      if (!payload.senha) delete payload.senha;

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
        throw new Error(data.message || "Erro ao salvar usuário");
      }

      setForm(initialForm);
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar usuário");
    }
  }

  function editar(item) {
    setForm({
      id: item.id,
      nome: item.nome || "",
      email: item.email || "",
      senha: "",
      perfil: item.perfil || "",
      cliente: item.cliente || "",
      ativo: !!item.ativo
    });
  }

  async function excluir(id) {
    if (!confirm("Deseja excluir este usuário?")) return;
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      carregar();
    } catch {
      setErro("Erro ao excluir usuário");
    }
  }

  return (
    <PortalShell title="Usuários" subtitle="Cadastro, edição e exclusão de usuários do portal.">
      {erro ? <div style={errorBox}>{erro}</div> : null}

      <div style={grid}>
        <div style={panel}>
          <h2 style={h2}>{form.id ? "Editar Usuário" : "Novo Usuário"}</h2>
          <form onSubmit={handleSubmit} style={formGrid}>
            <input name="nome" placeholder="Nome" value={form.nome} onChange={handleChange} style={input} />
            <input name="email" placeholder="E-mail" value={form.email} onChange={handleChange} style={input} />
            <input name="senha" type="password" placeholder="Senha" value={form.senha} onChange={handleChange} style={input} />
            <input name="perfil" placeholder="Perfil" value={form.perfil} onChange={handleChange} style={input} />
            <input name="cliente" placeholder="Cliente" value={form.cliente} onChange={handleChange} style={input} />
            <label style={label}>
              <input type="checkbox" name="ativo" checked={form.ativo} onChange={handleChange} />
              Ativo
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" style={buttonPrimary}>{form.id ? "Atualizar" : "Salvar"}</button>
              <button type="button" style={buttonSecondary} onClick={() => setForm(initialForm)}>Limpar</button>
            </div>
          </form>
        </div>

        <div style={panel}>
          <h2 style={h2}>Lista de Usuários</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={thtd}>Nome</th>
                  <th style={thtd}>E-mail</th>
                  <th style={thtd}>Perfil</th>
                  <th style={thtd}>Cliente</th>
                  <th style={thtd}>Ativo</th>
                  <th style={thtd}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={thtd}>{item.nome}</td>
                    <td style={thtd}>{item.email}</td>
                    <td style={thtd}>{item.perfil}</td>
                    <td style={thtd}>{item.cliente}</td>
                    <td style={thtd}>{item.ativo ? "Sim" : "Não"}</td>
                    <td style={thtd}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={miniBtn} onClick={() => editar(item)}>Editar</button>
                        <button style={miniBtnDanger} onClick={() => excluir(item.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {items.length === 0 ? (
                  <tr><td style={thtd} colSpan="6">Nenhum usuário cadastrado.</td></tr>
                ) : null}
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
const input = { padding: 12, borderRadius: 10, border: "1px solid #d1d5db" };
const label = { display: "flex", gap: 8, alignItems: "center" };
const buttonPrimary = { background: "#1d4ed8", color: "#fff", border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" };
const buttonSecondary = { background: "#e5e7eb", color: "#111827", border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" };
const miniBtn = { background: "#dbeafe", color: "#1d4ed8", border: 0, borderRadius: 8, padding: "8px 10px", cursor: "pointer" };
const miniBtnDanger = { background: "#fee2e2", color: "#b91c1c", border: 0, borderRadius: 8, padding: "8px 10px", cursor: "pointer" };
const table = { width: "100%", borderCollapse: "collapse" };
const thtd = { borderBottom: "1px solid #e5e7eb", padding: 12, textAlign: "left" };
const errorBox = { background: "#fef2f2", color: "#b91c1c", padding: 14, borderRadius: 12, marginBottom: 16 };
