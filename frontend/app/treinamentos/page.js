"use client";

import { useEffect, useState } from "react";

const initialForm = {
  tema: "",
  cliente: "",
  instrutor: "",
  data: "",
  status: "AGENDADO"
};

export default function TreinamentosPage() {
  const [form, setForm] = useState(initialForm);
  const [treinamentos, setTreinamentos] = useState([]);
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

  async function carregarTreinamentos() {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/treinamentos`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setTreinamentos(data);
    } catch {
      setErro("Erro ao carregar treinamentos");
    }
  }

  useEffect(() => {
    carregarClientes();
    carregarTreinamentos();
  }, []);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMensagem("");
    setErro("");

    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const res = await fetch(`${apiUrl}/treinamentos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.message || "Erro ao criar treinamento");
        return;
      }

      setMensagem("Treinamento criado com sucesso");
      setForm(initialForm);
      carregarTreinamentos();
    } catch {
      setErro("Erro ao salvar treinamento");
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Treinamentos</h1>
      <p>Cadastro e acompanhamento dos treinamentos da operação.</p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 24,
        maxWidth: 700,
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
          <h2 style={{ marginTop: 0 }}>Novo treinamento</h2>

          <label>Tema</label>
          <input name="tema" value={form.tema} onChange={handleChange} style={inputStyle} />

          <label>Cliente</label>
          <select name="cliente" value={form.cliente} onChange={handleChange} style={inputStyle}>
            <option value="">Selecione</option>
            {clientes.map((cliente) => (
              <option key={cliente.id || cliente.nome} value={cliente.nome}>
                {cliente.nome}
              </option>
            ))}
          </select>

          <label>Instrutor</label>
          <input name="instrutor" value={form.instrutor} onChange={handleChange} style={inputStyle} />

          <label>Data</label>
          <input type="date" name="data" value={form.data} onChange={handleChange} style={inputStyle} />

          <label>Status</label>
          <select name="status" value={form.status} onChange={handleChange} style={inputStyle}>
            <option value="AGENDADO">Agendado</option>
            <option value="EM_ANDAMENTO">Em andamento</option>
            <option value="PENDENTE_VALIDACAO">Pendente validação</option>
            <option value="ENCERRADO">Encerrado</option>
          </select>

          <button type="submit" style={buttonStyle}>Salvar treinamento</button>

          {mensagem ? <p style={{ color: "green" }}>{mensagem}</p> : null}
          {erro ? <p style={{ color: "#b91c1c" }}>{erro}</p> : null}
        </form>

        <div style={{
          background: "#fff",
          padding: 24,
          borderRadius: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
        }}>
          <h2 style={{ marginTop: 0 }}>Treinamentos cadastrados</h2>

          {treinamentos.length === 0 ? (
            <p>Nenhum treinamento cadastrado ainda.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={cellStyle}>Tema</th>
                  <th style={cellStyle}>Cliente</th>
                  <th style={cellStyle}>Instrutor</th>
                  <th style={cellStyle}>Data</th>
                  <th style={cellStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {treinamentos.map((item) => (
                  <tr key={item.id}>
                    <td style={cellStyle}>{item.tema}</td>
                    <td style={cellStyle}>{item.cliente}</td>
                    <td style={cellStyle}>{item.instrutor}</td>
                    <td style={cellStyle}>{item.data ? String(item.data).slice(0, 10) : "-"}</td>
                    <td style={cellStyle}>{item.status}</td>
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
