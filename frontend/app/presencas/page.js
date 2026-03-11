import PortalShell from "../../components/PortalShell";
<PortalShell title="..." subtitle="...">

"use client";

import { useEffect, useState } from "react";

const initialForm = {
  treinamento_id: "",
  treinando_nome: "",
  presente: true
};

export default function PresencasPage() {
  const [form, setForm] = useState(initialForm);
  const [treinamentos, setTreinamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function carregarTreinamentos() {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/treinamentos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setTreinamentos(data);
    } catch {
      setTreinamentos([]);
    }
  }

  async function carregarPresencas() {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/presencas`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      setPresencas(data);
    } catch {
      setErro("Erro ao carregar presenças");
    }
  }

  useEffect(() => {
    carregarTreinamentos();
    carregarPresencas();
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

      const payload = {
        ...form,
        treinamento_id: Number(form.treinamento_id),
        presente: Boolean(form.presente)
      };

      const res = await fetch(`${apiUrl}/presencas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.message || "Erro ao registrar presença");
        return;
      }

      setMensagem("Presença registrada com sucesso");
      setForm(initialForm);
      carregarPresencas();
    } catch {
      setErro("Erro ao salvar presença");
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: "Arial, sans-serif" }}>
      <h1>Presenças</h1>
      <p>Registro de participação dos treinandos por treinamento.</p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 24,
        maxWidth: 900,
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
          <h2 style={{ marginTop: 0 }}>Nova presença</h2>

          <label>Treinamento</label>
          <select name="treinamento_id" value={form.treinamento_id} onChange={handleChange} style={inputStyle}>
            <option value="">Selecione</option>
            {treinamentos.map((treinamento) => (
              <option key={treinamento.id} value={treinamento.id}>
                {treinamento.tema} - {treinamento.cliente}
              </option>
            ))}
          </select>

          <label>Nome do treinando</label>
          <input name="treinando_nome" value={form.treinando_nome} onChange={handleChange} style={inputStyle} />

          <label style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
            <input
              type="checkbox"
              name="presente"
              checked={form.presente}
              onChange={handleChange}
            />
            Presente
          </label>

          <button type="submit" style={buttonStyle}>Salvar presença</button>

          {mensagem ? <p style={{ color: "green" }}>{mensagem}</p> : null}
          {erro ? <p style={{ color: "#b91c1c" }}>{erro}</p> : null}
        </form>

        <div
          style={{
            background: "#fff",
            padding: 24,
            borderRadius: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
          }}
        >
          <h2 style={{ marginTop: 0 }}>Presenças registradas</h2>

          {presencas.length === 0 ? (
            <p>Nenhuma presença registrada ainda.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={cellStyle}>Treinamento ID</th>
                  <th style={cellStyle}>Treinando</th>
                  <th style={cellStyle}>Presença</th>
                </tr>
              </thead>
              <tbody>
                {presencas.map((item) => (
                  <tr key={item.id}>
                    <td style={cellStyle}>{item.treinamento_id}</td>
                    <td style={cellStyle}>{item.treinando_nome}</td>
                    <td style={cellStyle}>{item.presente ? "Presente" : "Ausente"}</td>
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

</PortalShell>
