"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";
import { apiFetch } from "../../services/api";

export default function ClientesPage() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

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

  const clientesFiltrados = clientes.filter((cliente) =>
    (cliente.nome || "")
      .toLowerCase()
      .includes(busca.toLowerCase())
  );

  return (
    <PortalShell>
      <div style={styles.container}>
        
        {/* TOPO */}
        <div style={styles.topo}>
          <div>
            <h1 style={styles.titulo}>Clientes</h1>
            <span style={styles.subtitulo}>
              Gestão de clientes cadastrados
            </span>
          </div>

          <button style={styles.botaoNovo}>
            + Novo Cliente
          </button>
        </div>

        {/* BUSCA */}
        <input
          style={styles.input}
          placeholder="Buscar cliente por nome..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        {/* TABELA */}
        <div style={styles.card}>
          {loading ? (
            <p>Carregando clientes...</p>
          ) : clientesFiltrados.length === 0 ? (
            <p>Nenhum cliente encontrado</p>
          ) : (
            <table style={styles.tabela}>
              <thead>
                <tr>
                  <th style={styles.th}>Nome</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Ações</th>
                </tr>
              </thead>

              <tbody>
                {clientesFiltrados.map((cliente, index) => (
                  <tr key={cliente.id || index}>
                    <td style={styles.td}>
                      {cliente.nome || "-"}
                    </td>

                    <td style={styles.td}>
                      {cliente.email || "-"}
                    </td>

                    <td style={styles.td}>
                      <button style={styles.editar}>
                        Editar
                      </button>

                      <button style={styles.excluir}>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PortalShell>
  );
}

/* ===================== STYLES ===================== */

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },

  topo: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  titulo: {
    margin: 0,
    fontSize: "24px",
  },

  subtitulo: {
    fontSize: "13px",
    color: "#666",
  },

  input: {
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    maxWidth: "300px",
  },

  botaoNovo: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "10px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "bold",
  },

  card: {
    background: "#fff",
    borderRadius: "12px",
    padding: "15px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.1)",
  },

  tabela: {
    width: "100%",
    borderCollapse: "collapse",
  },

  th: {
    textAlign: "left",
    padding: "10px",
    borderBottom: "1px solid #eee",
    fontSize: "14px",
  },

  td: {
    padding: "10px",
    borderBottom: "1px solid #f0f0f0",
    fontSize: "14px",
  },

  editar: {
    marginRight: "8px",
    background: "#f59e0b",
    border: "none",
    padding: "6px 10px",
    color: "#fff",
    borderRadius: "5px",
    cursor: "pointer",
  },

  excluir: {
    background: "#dc2626",
    border: "none",
    padding: "6px 10px",
    color: "#fff",
    borderRadius: "5px",
    cursor: "pointer",
  },
};
