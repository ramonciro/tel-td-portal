"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";

export default function ClientesPage() {
  const [clientes, setClientes] = useState([]);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [clienteEditando, setClienteEditando] = useState(null);

  const [form, setForm] = useState({
    nome: "",
    status: "ativo",
    supervisor: "",
    observacoes: ""
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  async function carregarClientes() {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch(`${apiUrl}/clientes`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      setClientes(Array.isArray(data) ? data : []);
    } catch {
      setErro("Erro ao carregar clientes");
    }
  }

  useEffect(() => {
    carregarClientes();
  }, []);

  function abrirNovoCliente() {
    setClienteEditando(null);
    setForm({ nome: "", status: "ativo", supervisor: "", observacoes: "" });
    setModalAberto(true);
  }

  function editarCliente(cliente) {
    setClienteEditando(cliente);
    setForm(cliente);
    setModalAberto(true);
  }

  async function salvarCliente() {
    const token = localStorage.getItem("token");

    const metodo = clienteEditando ? "PUT" : "POST";
    const url = clienteEditando
      ? `${apiUrl}/clientes/${clienteEditando.id}`
      : `${apiUrl}/clientes`;

    await fetch(url, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(form)
    });

    setModalAberto(false);
    carregarClientes();
  }

  async function excluirCliente(id) {
    const token = localStorage.getItem("token");

    if (!confirm("Deseja excluir este cliente?")) return;

    await fetch(`${apiUrl}/clientes/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    carregarClientes();
  }

  const clientesFiltrados = clientes.filter((c) =>
    c.nome?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <PortalShell
      title="Clientes"
      subtitle="Gestão das operações atendidas pelo Treinamento e Desenvolvimento"
    >
      {erro && <div style={alertStyle}>{erro}</div>}

      <div style={topBar}>
        <input
          placeholder="Buscar cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={searchInput}
        />

        <button onClick={abrirNovoCliente} style={btnPrimary}>
          Novo Cliente
        </button>
      </div>

      <div style={grid}>
        {clientesFiltrados.map((cliente) => (
          <div key={cliente.id} style={card}>
            <div style={cardHeader}>
              <h3>{cliente.nome}</h3>
              <span
                style={{
                  ...statusBadge,
                  background:
                    cliente.status === "ativo" ? "#dcfce7" : "#fee2e2"
                }}
              >
                {cliente.status}
              </span>
            </div>

            <p style={meta}>
              Supervisor: {cliente.supervisor || "-"}
            </p>

            <p style={meta}>
              Observações: {cliente.observacoes || "-"}
            </p>

            <div style={actions}>
              <button
                style={btnSecondary}
                onClick={() => editarCliente(cliente)}
              >
                Editar
              </button>

              <button
                style={btnDanger}
                onClick={() => excluirCliente(cliente.id)}
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      {modalAberto && (
        <div style={modalOverlay}>
          <div style={modal}>
            <h3>{clienteEditando ? "Editar Cliente" : "Novo Cliente"}</h3>

            <input
              placeholder="Nome do cliente"
              value={form.nome}
              onChange={(e) =>
                setForm({ ...form, nome: e.target.value })
              }
              style={input}
            />

            <input
              placeholder="Supervisor responsável"
              value={form.supervisor}
              onChange={(e) =>
                setForm({ ...form, supervisor: e.target.value })
              }
              style={input}
            />

            <select
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value })
              }
              style={input}
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>

            <textarea
              placeholder="Observações"
              value={form.observacoes}
              onChange={(e) =>
                setForm({ ...form, observacoes: e.target.value })
              }
              style={input}
            />

            <div style={actions}>
              <button style={btnPrimary} onClick={salvarCliente}>
                Salvar
              </button>

              <button
                style={btnSecondary}
                onClick={() => setModalAberto(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))",
  gap: 20
};

const card = {
  background: "#fff",
  padding: 20,
  borderRadius: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)"
};

const cardHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center"
};

const meta = {
  fontSize: 14,
  color: "#475569"
};

const actions = {
  display: "flex",
  gap: 10,
  marginTop: 14
};

const btnPrimary = {
  background: "#2563eb",
  color: "#fff",
  padding: "8px 14px",
  borderRadius: 8,
  border: "none"
};

const btnSecondary = {
  background: "#e2e8f0",
  padding: "8px 14px",
  borderRadius: 8,
  border: "none"
};

const btnDanger = {
  background: "#ef4444",
  color: "#fff",
  padding: "8px 14px",
  borderRadius: 8,
  border: "none"
};

const topBar = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 20
};

const searchInput = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ddd"
};

const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center"
};

const modal = {
  background: "#fff",
  padding: 30,
  borderRadius: 14,
  width: 400,
  display: "flex",
  flexDirection: "column",
  gap: 10
};

const input = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ddd"
};

const alertStyle = {
  background: "#fee2e2",
  padding: 12,
  borderRadius: 8,
  marginBottom: 16
};

const statusBadge = {
  padding: "4px 8px",
  borderRadius: 8,
  fontSize: 12
};
