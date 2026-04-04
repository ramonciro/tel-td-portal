
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

  const filtrados = clientes.filter((c) =>
    (c.nome || "")
      .toLowerCase()
      .includes(busca.toLowerCase())
  );

  return (
    <PortalShell>
      <div style={styles.container}>
        
        {/* HEADER */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.titulo}>Clientes</h1>
            <p style={styles.sub}>Gestão completa de clientes</p>
          </div>

          <button style={styles.botaoNovo}>
            + Novo Cliente
          </button>
        </div>

        {/* KPI */}
        <div style={styles.kpiBox}>
          <div style={styles.kpiCard}>
            <span style={styles.kpiNumero}>{clientes.length}</span>
            <span style={styles.kpiLabel}>Clientes cadastrados</span>
          </div>
        </div>

        {/* BUSCA */}
        <div style={styles.buscaContainer}>
          <input
            style={styles.input}
            placeholder="🔍 Buscar cliente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        {/* TABELA */}
        <div style={styles.card}>
          {loading ? (
            <p>Carregando...</p>
          ) : filtrados.length === 0 ? (
            <p>Nenhum cliente encontrado</p>
          ) : (
            <table style={styles.tabela}>
              <thead>
                <tr>
                  <th style={styles.th}>Cliente</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Ações</th>
                </tr>
              </thead>

              <tbody>
                {filtrados.map((cliente, index) => (
                  <tr key={cliente.id || index} style={styles.tr}>
                    <td style={styles.td}>
                      <div style={styles.nomeBox}>
                        <div style={styles.avatar}>
                          {cliente.nome?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <span>{cliente.nome}</span>
                      </div>
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

/* 🎨 ESTILOS */

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  titulo: {
    margin: 0,
    fontSize: "26px",
    fontWeight: "bold",
  },

  sub: {
    color: "#666",
    fontSize: "13px",
  },

  botaoNovo: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "10px 16px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold",
  },

  /* KPI */
  kpiBox: {
    display: "flex",
    gap: "15px",
  },

  kpiCard: {
    background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
    color: "#fff",
    padding: "20px",
    borderRadius: "12px",
    width: "220px",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
  },

  kpiNumero: {
    fontSize: "30px",
    fontWeight: "bold",
  },

  kpiLabel: {
    fontSize: "13px",
    opacity: 0.9,
  },

  /* BUSCA */
  buscaContainer: {
    display: "flex",
  },

  input: {
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    width: "300px",
    outline: "none",
  },

  /* CARD */
  card: {
    background: "#fff",
    borderRadius: "12px",
    padding: "15px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.1)",
  },

  tabela: {
    width: "100%",
    borderCollapse: "collapse",
  },

  th: {
    textAlign: "left",
    padding: "10px",
    borderBottom: "1px solid #ddd",
    fontSize: "14px",
  },

  tr: {
    borderBottom: "1px solid #eee",
  },

  td: {
    padding: "10px",
    fontSize: "14px",
  },

  nomeBox: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },

  avatar: {
    width: "35px",
    height: "35px",
    borderRadius: "50%",
    background: "#2563eb",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "bold",
  },

  editar: {
    marginRight: "8px",
    background: "#f59e0b",
    border: "none",
    padding: "6px 10px",
    color: "#fff",
    borderRadius: "6px",
    cursor: "pointer",
  },

  excluir: {
    background: "#dc2626",
    border: "none",
    padding: "6px 10px",
    color: "#fff",
    borderRadius: "6px",
    cursor: "pointer",
  },
};
