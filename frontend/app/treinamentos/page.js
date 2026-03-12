"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";

const initialForm = {
  id: "",
  tema: "",
  cliente: "",
  instrutor: "",
  data: "",
  status: "planejado",
  carga_horaria: "",
  participantes_previstos: "",
  participantes_presentes: "",
  concluidos: ""
};

const statusOptions = ["planejado", "em andamento", "concluído", "cancelado", "reagendado"];

export default function TreinamentosPage() {
  const [items, setItems] = useState([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [form, setForm] = useState(initialForm);

  const [busca, setBusca] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [filtroInstrutor, setFiltroInstrutor] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  async function carregar() {
    try {
      setErro("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const res = await fetch(`${apiUrl}/treinamentos`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.message || "Erro ao carregar treinamentos");

      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setErro(e.message || "Erro ao carregar treinamentos");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const resumo = useMemo(() => {
    return {
      total: items.length,
      horas: items.reduce((acc, item) => acc + Number(item.carga_horaria || 0), 0),
      previstos: items.reduce((acc, item) => acc + Number(item.participantes_previstos || 0), 0),
      presentes: items.reduce((acc, item) => acc + Number(item.participantes_presentes || 0), 0)
    };
  }, [items]);

  const clientesUnicos = useMemo(() => {
    return [...new Set(items.map((i) => i.cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const instrutoresUnicos = useMemo(() => {
    return [...new Set(items.map((i) => i.instrutor).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const itensFiltrados = useMemo(() => {
    return items.filter((item) => {
      const matchBusca =
        !busca ||
        String(item.tema || "").toLowerCase().includes(busca.toLowerCase()) ||
        String(item.cliente || "").toLowerCase().includes(busca.toLowerCase()) ||
        String(item.instrutor || "").toLowerCase().includes(busca.toLowerCase());

      const matchCliente = filtroCliente === "todos" || String(item.cliente || "") === filtroCliente;
      const matchInstrutor = filtroInstrutor === "todos" || String(item.instrutor || "") === filtroInstrutor;
      const matchStatus = filtroStatus === "todos" || String(item.status || "").toLowerCase() === filtroStatus;

      return matchBusca && matchCliente && matchInstrutor && matchStatus;
    });
  }, [items, busca, filtroCliente, filtroInstrutor, filtroStatus]);

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
      const url = form.id ? `${apiUrl}/treinamentos/${form.id}` : `${apiUrl}/treinamentos`;

      const payload = {
        ...form,
        carga_horaria: Number(form.carga_horaria || 0),
        participantes_previstos: Number(form.participantes_previstos || 0),
        participantes_presentes: Number(form.participantes_presentes || 0),
        concluidos: Number(form.concluidos || 0)
      };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro ao salvar treinamento");

      setForm(initialForm);
      setSucesso(form.id ? "Treinamento atualizado com sucesso" : "Treinamento criado com sucesso");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar treinamento");
    }
  }

  function editar(item) {
    setForm({
      id: item.id,
      tema: item.tema || "",
      cliente: item.cliente || "",
      instrutor: item.instrutor || "",
      data: formatDateInput(item.data),
      status: String(item.status || "planejado").toLowerCase(),
      carga_horaria: item.carga_horaria ?? "",
      participantes_previstos: item.participantes_previstos ?? "",
      participantes_presentes: item.participantes_presentes ?? "",
      concluidos: item.concluidos ?? ""
    });
  }

  async function excluir(id) {
    if (!confirm("Deseja excluir este treinamento?")) return;

    try {
      setErro("");
      setSucesso("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const res = await fetch(`${apiUrl}/treinamentos/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro ao excluir treinamento");

      setSucesso("Treinamento excluído com sucesso");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao excluir treinamento");
    }
  }

  return (
    <PortalShell title="Treinamentos" subtitle="Gestão executiva da agenda, volume e execução dos treinamentos">
      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={miniCardsGrid}>
        <MiniCard title="Total de treinamentos" value={resumo.total} />
        <MiniCard title="Horas treinadas" value={resumo.horas} />
        <MiniCard title="Participantes previstos" value={resumo.previstos} />
        <MiniCard title="Participantes presentes" value={resumo.presentes} />
      </div>

      <div style={filtersBar}>
        <input
          placeholder="Buscar por tema, cliente ou instrutor"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={input}
        />

        <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} style={input}>
          <option value="todos">Todos os clientes</option>
          {clientesUnicos.map((cliente) => (
            <option key={cliente} value={cliente}>{cliente}</option>
          ))}
        </select>

        <select value={filtroInstrutor} onChange={(e) => setFiltroInstrutor(e.target.value)} style={input}>
          <option value="todos">Todos os instrutores</option>
          {instrutoresUnicos.map((instrutor) => (
            <option key={instrutor} value={instrutor}>{instrutor}</option>
          ))}
        </select>

        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} style={input}>
          <option value="todos">Todos os status</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      <div style={panel}>
        <h2 style={h2}>{form.id ? "Editar treinamento" : "Novo treinamento"}</h2>

        <form onSubmit={handleSubmit} style={formGrid}>
          <div style={twoCols}>
            <input name="tema" placeholder="Tema" value={form.tema} onChange={handleChange} style={input} />
            <input name="cliente" placeholder="Cliente" value={form.cliente} onChange={handleChange} style={input} />
          </div>

          <div style={twoCols}>
            <input name="instrutor" placeholder="Instrutor" value={form.instrutor} onChange={handleChange} style={input} />
            <input name="data" type="date" value={form.data} onChange={handleChange} style={input} />
          </div>

          <div style={twoCols}>
            <select name="status" value={form.status} onChange={handleChange} style={input}>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <input name="carga_horaria" type="number" step="0.1" placeholder="Carga horária" value={form.carga_horaria} onChange={handleChange} style={input} />
          </div>

          <div style={threeCols}>
            <input name="participantes_previstos" type="number" placeholder="Participantes previstos" value={form.participantes_previstos} onChange={handleChange} style={input} />
            <input name="participantes_presentes" type="number" placeholder="Participantes presentes" value={form.participantes_presentes} onChange={handleChange} style={input} />
            <input name="concluidos" type="number" placeholder="Concluídos" value={form.concluidos} onChange={handleChange} style={input} />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" style={buttonPrimary}>{form.id ? "Atualizar" : "Salvar"}</button>
            <button type="button" style={buttonSecondary} onClick={() => setForm(initialForm)}>Limpar</button>
          </div>
        </form>
      </div>

      <div style={panel}>
        <h2 style={h2}>Lista de treinamentos</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={thtd}>Tema</th>
                <th style={thtd}>Cliente</th>
                <th style={thtd}>Instrutor</th>
                <th style={thtd}>Data</th>
                <th style={thtd}>Status</th>
                <th style={thtd}>Horas</th>
                <th style={thtd}>Previstos</th>
                <th style={thtd}>Presentes</th>
                <th style={thtd}>Concluídos</th>
                <th style={thtd}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {itensFiltrados.map((item) => (
                <tr key={item.id}>
                  <td style={thtd}>{item.tema}</td>
                  <td style={thtd}>{item.cliente}</td>
                  <td style={thtd}>{item.instrutor}</td>
                  <td style={thtd}>{formatDate(item.data)}</td>
                  <td style={thtd}>
                    <span style={{ ...badge, ...statusBadge(String(item.status || "").toLowerCase()) }}>
                      {item.status}
                    </span>
                  </td>
                  <td style={thtd}>{item.carga_horaria}</td>
                  <td style={thtd}>{item.participantes_previstos}</td>
                  <td style={thtd}>{item.participantes_presentes}</td>
                  <td style={thtd}>{item.concluidos}</td>
                  <td style={thtd}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={miniBtn} onClick={() => editar(item)}>Editar</button>
                      <button style={miniBtnDanger} onClick={() => excluir(item.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
              {itensFiltrados.length === 0 ? (
                <tr><td style={thtd} colSpan="10">Nenhum treinamento encontrado.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </PortalShell>
  );
}

function MiniCard({ title, value }) {
  return (
    <div style={miniCard}>
      <div style={{ color: "#64748b", fontSize: 13 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: "bold", color: "#0f172a" }}>{value}</div>
    </div>
  );
}

function statusBadge(status) {
  if (status === "planejado") return { background: "#dbeafe", color: "#1d4ed8" };
  if (status === "em andamento") return { background: "#fef3c7", color: "#92400e" };
  if (status === "concluído") return { background: "#dcfce7", color: "#166534" };
  if (status === "cancelado") return { background: "#fee2e2", color: "#b91c1c" };
  return { background: "#e5e7eb", color: "#334155" };
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("pt-BR");
}

function formatDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

const miniCardsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 16,
  marginBottom: 18
};

const miniCard = {
  background: "#fff",
  padding: 18,
  borderRadius: 16,
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
};

const filtersBar = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr 1fr 1fr",
  gap: 12,
  marginBottom: 18
};

const panel = {
  background: "#fff",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  marginBottom: 18
};

const h2 = { marginTop: 0, color: "#334155" };
const formGrid = { display: "grid", gap: 12 };
const twoCols = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const threeCols = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 };

const input = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  width: "100%",
  boxSizing: "border-box"
};

const buttonPrimary = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "12px 16px",
  cursor: "pointer"
};

const buttonSecondary = {
  background: "#e5e7eb",
  color: "#111827",
  border: 0,
  borderRadius: 10,
  padding: "12px 16px",
  cursor: "pointer"
};

const miniBtn = {
  background: "#dbeafe",
  color: "#1d4ed8",
  border: 0,
  borderRadius: 8,
  padding: "8px 10px",
  cursor: "pointer"
};

const miniBtnDanger = {
  background: "#fee2e2",
  color: "#b91c1c",
  border: 0,
  borderRadius: 8,
  padding: "8px 10px",
  cursor: "pointer"
};

const table = {
  width: "100%",
  borderCollapse: "collapse"
};

const thtd = {
  borderBottom: "1px solid #e5e7eb",
  padding: 12,
  textAlign: "left"
};

const badge = {
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600
};

const errorBox = {
  background: "#fef2f2",
  color: "#b91c1c",
  padding: 14,
  borderRadius: 12,
  marginBottom: 16
};

const successBox = {
  background: "#ecfdf5",
  color: "#166534",
  padding: 14,
  borderRadius: 12,
  marginBottom: 16
};
