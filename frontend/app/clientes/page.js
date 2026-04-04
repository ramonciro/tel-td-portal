"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";
import { apiFetch } from "../../services/api";

export default function ClientesPage() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  const [clienteEditando, setClienteEditando] = useState(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    carregarClientes();
  }, []);

  async function carregarClientes() {
    try {
      const response = await apiFetch("/clientes");

      const lista =
        response?.data ||
        response?.clientes ||
        response ||
        [];

      setClientes(Array.isArray(lista) ? lista : []);
    } catch (err) {
      console.error(err);
      alert("Erro ao carregar clientes");
    } finally {
      setLoading(false);
    }
  }

  function abrirEdicao(cliente) {
    setClienteEditando(cliente);
    setNome(cliente.nome || "");
    setEmail(cliente.email || "");
  }

  function fecharModal() {
    setClienteEditando(null);
    setNome("");
    setEmail("");
  }

  async function salvarEdicao() {
    try {
      await apiFetch(`/clientes/${clienteEditando.id}`, {
        method: "PUT",
        body: JSON.stringify({ nome, email }),
      });

      await carregarClientes();
      fecharModal();
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar");
    }
  }

  const filtrados = clientes.filter((c) =>
    (c.nome || "").toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <PortalShell>
      <div style={styles.container}>
        
        <h1>Clientes</h1>

        <input
          style={styles.input}
          placeholder="Buscar..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        <div style={styles.card}>
          {loading ? (
            <p>Carregando...</p>
          ) : (
            <table style={styles.tabela}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>
                {filtrados.map((cliente) => (
                  <tr key={cliente.id}>
                    <td>{cliente.nome}</td>
                    <td>{cliente.email}</td>
                    <td>
                      <button
                        style={styles.editar}
                        onClick={() => abrirEdicao(cliente)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* MODAL */}
        {clienteEditando && (
          <div style={styles.overlay}>
            <div style={styles.modal}>
              <h2>Editar Cliente</h2>

              <input
                style={styles.input}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome"
              />

              <input
                style={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
              />

              <div style={styles.modalActions}>
                <button onClick={salvarEdicao} style={styles.salvar}>
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
    gap: "15px",
  },

  card: {
    background: "#fff",
    padding: "15px",
    borderRadius: "10px",
  },

  tabela: {
    width: "100%",
    borderCollapse: "collapse",
  },

  input: {
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #ccc",
  },

  editar: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "6px 10px",
    borderRadius: "6px",
    cursor: "pointer",
  },

  /* MODAL */
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  modal: {
    background: "#fff",
    padding: "20px",
    borderRadius: "10px",
    width: "300px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  modalActions: {
    display: "flex",
    justifyContent: "space-between",
  },

  salvar: {
    background: "green",
    color: "#fff",
    border: "none",
    padding: "8px",
    borderRadius: "6px",
  },

  cancelar: {
    background: "gray",
    color: "#fff",
    border: "none",
    padding: "8px",
    borderRadius: "6px",
  },
};
