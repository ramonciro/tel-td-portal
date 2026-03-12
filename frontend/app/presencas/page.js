"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";

const initialForm = {
  id: "",
  treinamento_id: "",
  treinando_nome: "",
  status: "presente",
  justificativa: ""
};

export default function PresencasPage() {
  const [items, setItems] = useState([]);
  const [treinamentos, setTreinamentos] = useState([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [form, setForm] = useState(initialForm);
  const [showPopup, setShowPopup] = useState(false);

  const [busca, setBusca] = useState("");
  const [filtroTreinamento, setFiltroTreinamento] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  async function carregar() {
    try {
      setErro("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const [r1, r2] = await Promise.all([
        fetch(`${apiUrl}/presencas`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/treinamentos`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (!r1.ok || !r2.ok) throw new Error();

      const d1 = await r1.json();
      const d2 = await r2.json();

      setItems(Array.isArray(d1) ? d1 : []);
      setTreinamentos(Array.isArray(d2) ? d2 : []);
    } catch {
      setErro("Erro ao carregar dados");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  function getTreinamento(id) {
    return treinamentos.find((t) => String(t.id) === String(id));
  }

  function getNomeTreinamento(id) {
    const treinamento = getTreinamento(id);
    if (!treinamento) return `Treinamento #${id}`;
    return `${treinamento.tema} - ${treinamento.cliente}`;
  }

  const resumo = useMemo(() => {
    return {
      total: items.length,
      presentes: items.filter((i) => i.status === "presente").length,
      ausentes: items.filter((i) => i.status === "ausente").length,
      justificadas: items.filter((i) => i.status === "justificado").length
    };
  }, [items]);

  const itensFiltrados = useMemo(() => {
    return items.filter((item) => {
      const matchBusca =
        !busca ||
        String(item.treinando_nome || "").toLowerCase().includes(busca.toLowerCase()) ||
        getNomeTreinamento(item.treinamento_id).toLowerCase().includes(busca.toLowerCase());

      const matchTreinamento =
        filtroTreinamento === "todos" ||
        String(item.treinamento_id || "") === filtroTreinamento;

      const matchStatus =
        filtroStatus === "todos" ||
        String(item.status || "").toLowerCase() === filtroStatus;

      return matchBusca && matchTreinamento && matchStatus;
    });
  }, [items, busca, filtroTreinamento, filtroStatus, treinamentos]);

  function handleChange(e) {
    const { name, value } = e.target;
    const next = { ...form, [name]: value };

    if (name === "status" && value === "justificado") {
      setShowPopup(true);
    }

    if (name === "status" && value !== "justificado") {
      next.justificativa = "";
      setShowPopup(false);
    }

    setForm(next);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setErro("");
      setSucesso("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const method = form.id ? "PUT" : "POST";
      const url = form.id ? `${apiUrl}/presencas/${form.id}` : `${apiUrl}/presencas`;

      const payload = {
        treinamento_id: Number(form.treinamento_id),
        treinando_nome: form.treinando_nome,
        status: form.status,
        justificativa: form.status === "justificado" ? form.justificativa : ""
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
      if (!res.ok) throw new Error(data.message || "Erro ao salvar presença");

      setForm(initialForm);
      setShowPopup(false);
      setSucesso("Presença salva com sucesso");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar presença");
    }
  }

  function editar(item) {
    setForm({
      id: item.id,
      treinamento_id: String(item.treinamento_id || ""),
      treinando_nome: item.treinando_nome || "",
      status: item.status || "presente",
      justificativa: item.justificativa || ""
    });
    setShowPopup((item.status || "") === "justificado");
  }

  async function excluir(id) {
    if (!confirm("Deseja excluir esta presença?")) return;
    try {
      setErro("");
      setSucesso("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/presencas/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      setSucesso("Presença excluída com sucesso");
      carregar();
    } catch {
      setErro("Erro ao excluir presença");
    }
  }

  function baixarCSV() {
    const headers = ["treinamento", "treinando_nome", "status", "justificativa"];
    const rows = itensFiltrados.map((item) => [
      getNomeTreinamento(item.treinamento_id),
      item.treinando_nome ?? "",
      item.status ?? "",
      item.justificativa ?? ""
    ]);

    const escape = (value) => {
      const text = String(value ?? "");
      if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const hoje = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `lista_presenca_${hoje}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PortalShell title="Presenças" subtitle="Controle dinâmico de presença, ausência, justificativas e exportação da lista">
      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={miniCardsGrid}>
        <MiniCard title="Total" value={resumo.total} />
        <MiniCard title="Presentes" value={resumo.presentes} />
        <MiniCard title="Ausentes" value={resumo.ausentes} />
        <MiniCard title="Justificadas" value={resumo.justificadas} />
      </div>

      <div style={filtersBar}>
        <input
          placeholder="Buscar por treinando ou treinamento"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={input}
        />

        <select value={filtroTreinamento} onChange={(e) => setFiltroTreinamento(e.target.value)} style={input}>
          <option value="todos">Todos os treinamentos</option>
          {treinamentos.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.tema} - {t.cliente}
            </option>
          ))}
        </select>

        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} style={input}>
          <option value="todos">Todos os status</option>
          <option value="presente">Presente</option>
          <option value="ausente">Ausente</option>
          <option value="justificado">Justificado</option>
        </select>

        <button onClick={baixarCSV} style={buttonPrimary}>Baixar CSV</button>
      </div>

      <div style={panel}>
        <h2 style={h2}>{form.id ? "Editar presença" : "Nova presença"}</h2>
        <form onSubmit={handleSubmit} style={formGrid}>
          <select name="treinamento_id" value={form.treinamento_id} onChange={handleChange} style={input}>
            <option value="">Selecione o treinamento</option>
            {treinamentos.map((t) => (
              <option key={t.id} value={t.id}>{t.tema} - {t.cliente}</option>
            ))}
          </select>

          <input
            name="treinando_nome"
            placeholder="Nome do treinando"
            value={form.treinando_nome}
            onChange={handleChange}
            style={input}
          />

          <select name="status" value={form.status} onChange={handleChange} style={input}>
            <option value="presente">Presente</option>
            <option value="ausente">Ausente</option>
            <option value="justificado">Justificado</option>
          </select>

          {form.status === "justificado" ? (
            <textarea
              name="justificativa"
              placeholder="Informe a justificativa"
              value={form.justificativa}
              onChange={handleChange}
              style={{ ...input, minHeight: 100 }}
            />
          ) : null}

          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" style={buttonPrimary}>{form.id ? "Atualizar" : "Salvar"}</button>
            <button type="button" style={buttonSecondary} onClick={() => { setForm(initialForm); setShowPopup(false); }}>
              Limpar
            </button>
          </div>
        </form>
      </div>

      <div style={panel}>
        <h2 style={h2}>Histórico de presenças</h2>
        <p style={subText}>Lista consolidada dos registros lançados na plataforma.</p>

        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={thtd}>Treinamento</th>
                <th style={thtd}>Treinando</th>
                <th style={thtd}>Status</th>
                <th style={thtd}>Justificativa</th>
                <th style={thtd}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {itensFiltrados.map((item) => {
                const treinamento = getTreinamento(item.treinamento_id);
                return (
                  <tr key={item.id}>
                    <td style={thtd}>
                      <div style={trainingCell}>
                        <div style={trainingTitle}>
                          {treinamento?.tema || `Treinamento #${item.treinamento_id}`}
                        </div>
                        <div style={trainingSubtitle}>
                          {treinamento?.cliente || "Cliente não identificado"}
                        </div>
                      </div>
                    </td>
                    <td style={thtd}>
                      <div style={personCell}>{item.treinando_nome}</div>
                    </td>
                    <td style={thtd}>
                      <span style={{ ...badge, ...statusBadge(item.status) }}>{item.status}</span>
                    </td>
                    <td style={thtd}>{item.justificativa || "-"}</td>
                    <td style={thtd}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={miniBtn} onClick={() => editar(item)}>Editar</button>
                        <button style={miniBtnDanger} onClick={() => excluir(item.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {itensFiltrados.length === 0 ? (
                <tr><td style={thtd} colSpan="5">Nenhuma presença cadastrada.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {showPopup ? (
        <div style={overlay}>
          <div style={modal}>
            <h3 style={{ marginTop: 0 }}>Justificativa obrigatória</h3>
            <p style={{ color: "#64748b" }}>Informe o motivo da justificativa para este registro.</p>
            <textarea
              name="justificativa"
              placeholder="Descreva a justificativa"
              value={form.justificativa}
              onChange={handleChange}
              style={{ ...input, minHeight: 120 }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button style={buttonPrimary} onClick={() => setShowPopup(false)}>Confirmar</button>
              <button
                style={buttonSecondary}
                onClick={() => {
                  setForm((prev) => ({ ...prev, status: "ausente", justificativa: "" }));
                  setShowPopup(false);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  if (status === "presente") return { background: "#dcfce7", color: "#166534" };
  if (status === "ausente") return { background: "#fee2e2", color: "#b91c1c" };
  return { background: "#fef3c7", color: "#92400e" };
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
  gridTemplateColumns: "2fr 1.4fr 1fr auto",
  gap: 12,
  marginBottom: 18,
  alignItems: "center"
};

const panel = {
  background: "#fff",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  marginBottom: 18
};

const h2 = { marginTop: 0, color: "#334155" };
const subText = { marginTop: -4, color: "#64748b", fontSize: 14 };
const formGrid = { display: "grid", gap: 12 };

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
  textAlign: "left",
  verticalAlign: "top"
};

const trainingCell = {
  display: "grid",
  gap: 4
};

const trainingTitle = {
  fontSize: 14,
  fontWeight: 700,
  color: "#0f172a"
};

const trainingSubtitle = {
  fontSize: 12,
  color: "#64748b"
};

const personCell = {
  fontSize: 14,
  color: "#334155",
  fontWeight: 500
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

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "grid",
  placeItems: "center",
  zIndex: 50
};

const modal = {
  width: "min(520px, 92vw)",
  background: "#fff",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 12px 30px rgba(0,0,0,0.18)"
};
