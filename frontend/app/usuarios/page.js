"use client";

import { useEffect, useState } from "react";

const initialForm = {
  nome: "",
  email: "",
  senha: "Tel@2026",
  perfil: "INSTRUTOR",
  cliente: "",
  ativo: true
};

export default function UsuariosPage() {
  const [form, setForm] = useState(initialForm);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function carregarClientes() {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/clientes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setClientes(data);
    } catch {
      setClientes([]);
    }
  }

  async function carregarUsuarios() {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setUsuarios(data);
    } catch {
      setErro("Erro ao carregar usuários");
    }
  }

  useEffect(() => {
    carregarClientes();
    carregarUsuarios();
  }, []);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMensagem("");
    setErro("");

    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const res = await fetch(`${apiUrl}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.message || "Erro ao criar usuário");
        return;
      }

      setMensagem("Usuário criado com sucesso");
      setForm(initialForm);
      carregarUsuarios();
    } catch {
      setErro("Erro ao salvar usuário");
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Usuários</h1>
      <p>Cadastro e acompanhamento de usuários do portal.</p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 24,
        maxWidth: 850,
        marginTop: 24
      }}>
        <form
          onSubmit={handleSubmit}
          style={{
            background: "#fff",
            padding: 24,
            borderRadius: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
          }}
        >
          <h2 style={{ marginTop: 0 }}>Novo usuário</h2>

          <label>Nome</label>
          <input name="nome" value={form.nome} onChange={handleChange} style={inputStyle} />

          <label>E-mail</label>
          <input name="email" value={form.email} onChange={handleChange} style={inputStyle} />

          <label>Senha inicial</label>
          <input name="senha" value={form.senha} onChange={handleChange} style={inputStyle} />

          <label>Perfil</label>
          <select name="perfil" value={form.perfil} onChange={handleChange} style={inputStyle}>
            <option value="COORDENADOR">Coordenador</option>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="INSTRUTOR">Instrutor</option>
            <option value="TREINANDO">Treinando</option>
          </select>

          <label>Cliente</label>
          <select name="cliente" value={form.cliente} onChange={handleChange} style={inputStyle}>
            <option value="">Selecione</option>
            <option value="GLOBAL">GLOBAL</option>
            {clientes.map((cliente) => (
              <option key={cliente.id || cliente.nome} value={cliente.nome}>
                {cliente.nome}
              </option>
            ))}
          </select>

          <label style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
            <input
              type="checkbox"
              name="ativo"
              checked={form.ativo}
              onChange={handleChange}
            />
            Usuário ativo
          </label>

          <button type="submit" style={buttonStyle}>Salvar usuário</button>

          {mensagem ? <p style={{ color: "green" }}>{mensagem}</p> : null}
          {erro ? <p style={{ color: "#b91c1c" }}>{erro}</p> : null}
        </form>

        <div style={{
          background: "#fff",
          padding: 24,
          borderRadius: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
        }}>
          <h2 style={{ marginTop: 0 }}>Usuários cadastrados</h2>

          {usuarios.length === 0 ? (
            <p>Nenhum usuário cadastrado ainda.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={cellStyle}>Nome</th>
                  <th style={cellStyle}>E-mail</th>
                  <th style={cellStyle}>Perfil</th>
                  <th style={cellStyle}>Cliente</th>
                  <th style={cellStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((item) => (
                  <tr key={item.id}>
                    <td style={cellStyle}>{item.nome}</td>
                    <td style={cellStyle}>{item.email}</td>
                    <td style={cellStyle}>{item.perfil}</td>
                    <td style={cellStyle}>{item.cliente}</td>
                    <td style={cellStyle}>{item.ativo ? "Ativo" : "Inativo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: 12,
  marginTop: 8,
  marginBottom: 16,
  border: "1px solid #d1d5db",
  borderRadius: 10
};

const buttonStyle = {
  background: "#172554",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "12px 18px",
  cursor: "pointer",
  fontWeight: "bold"
};

const cellStyle = {
  borderBottom: "1px solid #e5e7eb",
  padding: 12,
  textAlign: "left"
};
