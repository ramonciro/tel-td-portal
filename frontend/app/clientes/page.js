"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";
import { apiFetch } from "../../services/api";

export default function ClientesPage() {
  const [clientes, setClientes] = useState([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);

  const [modal, setModal] = useState(false);
  const [clienteAtual, setClienteAtual] = useState(null);

  const [form, setForm] = useState({
    nome: "",
    empresa: "",
    status: "Ativo",
    observacoes: "",
  });

  useEffect(() => {
    carregarClientes();
  }, []);

  async function carregarClientes() {
    try {
      const res = await apiFetch("/clientes");
      const lista = res?.data || res || [];
      setClientes(Array.isArray(lista) ? lista : []);
    } catch {
      alert("Erro ao carregar clientes");
    } finally {
      setLoading(false);
    }
  }

  function abrirNovo() {
    setClienteAtual(null);
    setForm({
      nome: "",
      empresa: "",
      status: "Ativo",
      observacoes: "",
    });
    setModal(true);
  }

  function abrirEdicao(cliente) {
    setClienteAtual(cliente);
    setForm({
      nome: cliente.nome || "",
      empresa: cliente.empresa || "",
      status: cliente.status || "Ativo",
      observacoes: cliente.observacoes || "",
    });
    setModal(true);
  }

  function fecharModal() {
    setModal(false);
  }

  async function salvar() {
    try {
      if (clienteAtual) {
        await apiFetch(`/clientes/${clienteAtual.id}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch("/clientes", {
          method: "POST",
          body: JSON.stringify(form),
        });
      }

      carregarClientes();
      fecharModal();
    } catch {
      alert("Erro ao salvar");
    }
  }

  const filtrados = clientes.filter((c) =>
    (c.nome || "").toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <PortalShell>
      <div style={styles.container}>

        {/* HEADER */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.titulo}>Clientes</h1>
            <p style={styles.sub}>Cadastro e gestão de clientes</p>
          </div>

          <button style={styles.novo} onClick={abrirNovo}>
            + Novo Cliente
          </button>
        </div>

        {/* BUSCA */}
        <input
          style={styles.input}
          placeholder="Buscar cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        {/* LISTA */}
        <div style={styles.grid}>
          {loading ? (
            <p>Carregando...</p>
          ) : filtrados.length === 0 ? (
            <p>Nenhum cliente encontrado</p>
          ) : (
            filtrados.map((c) => (
              <div key={c.id} style={styles.card}>

                <h3>{c.nome}</h3>
                <p style={styles.empresa}>{c.empresa}</p>

                {/* STATUS */}
                <span
                  style={{
                    ...styles.status,
                    background:
                      c.status === "Ativo" ? "#16a34a" : "#dc2626",
                  }}
                >
                  {c.status}
                </span>

                <p style={styles.obs}>
                  {c.observacoes || "Sem observações"}
                </p>

                <button
                  style={styles.editar}
                  onClick={() => abrirEdicao(c)}
                >
                  Editar
                </button>
              </div>
            ))
          )}
        </div>

        {/* MODAL */}
        {modal && (
          <div style={styles.overlay}>
            <div style={styles.modal}>
              <h2>
                {clienteAtual ? "Editar Cliente" : "Novo Cliente"}
              </h2>

              <input
                placeholder="Nome"
                style={styles.input}
                value={form.nome}
                onChange={(e) =>
                  setForm({ ...form, nome: e.target.value })
                }
              />

              <input
                placeholder="Empresa"
                style={styles.input}
                value={form.empresa}
                onChange={(e) =>
                  setForm({ ...form, empresa: e.target.value })
                }
              />

              <select
                style={styles.input}
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value })
                }
              >
                <option>Ativo</option>
                <option>Inativo</option>
              </select>

              <textarea
                placeholder="Observações"
                style={styles.textarea}
                value={form.observacoes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    observacoes: e.target.value,
                  })
                }
              />

              <div style={styles.actions}>
                <button onClick={salvar} style={styles.salvar}>
                  Salvar
                </button>
                <button onClick={fecharModal} style={styles.cancelar}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalShell>
  );
}

/* 🎨 ESTILO */

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  titulo: {
    margin: 0,
    fontSize: 26,
  },

  sub: {
    fontSize: 13,
    color: "#666",
  },

  novo: {
    background: "#2563eb",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
  },

  input: {
    padding: 10,
    borderRadius: 6,
    border: "1px solid #ccc",
  },

  textarea: {
    padding: 10,
    borderRadius: 6,
    border: "1px solid #ccc",
    minHeight: 80,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
    gap: 15,
  },

  card: {
    background: "#fff",
    padding: 15,
    borderRadius: 10,
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  empresa: {
    fontSize: 13,
    color: "#555",
  },

  status: {
    padding: "4px 8px",
    borderRadius: 6,
    color: "#fff",
    fontSize: 12,
    width: "fit-content",
  },

  obs: {
    fontSize: 12,
    color: "#444",
  },

  editar: {
    marginTop: 10,
    background: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "6px",
    borderRadius: 6,
    cursor: "pointer",
  },

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },

  modal: {
    background: "#fff",
    padding: 20,
    borderRadius: 10,
    width: 320,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  actions: {
    display: "flex",
    justifyContent: "space-between",
  },

  salvar: {
    background: "#16a34a",
    color: "#fff",
    border: "none",
    padding: "8px",
    borderRadius: 6,
  },

  cancelar: {
    background: "#6b7280",
    color: "#fff",
    border: "none",
    padding: "8px",
    borderRadius: 6,
  },
};
