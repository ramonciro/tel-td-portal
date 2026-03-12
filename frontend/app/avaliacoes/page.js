"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";

const initialForm = {
  id: "",
  treinamento_id: "",
  nota_nps: "",
  nota_qualidade: "",
  nota_prova: "",
  comentario: ""
};

export default function AvaliacoesPage() {
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [treinamentos, setTreinamentos] = useState([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [form, setForm] = useState(initialForm);

  async function carregar() {
    try {
      setErro("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const [r1, r2, r3] = await Promise.all([
        fetch(`${apiUrl}/avaliacoes`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/materiais-avaliativos`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/treinamentos`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (!r1.ok || !r2.ok || !r3.ok) throw new Error();

      const d1 = await r1.json();
      const d2 = await r2.json();
      const d3 = await r3.json();

      setAvaliacoes(Array.isArray(d1) ? d1 : []);
      setMateriais(Array.isArray(d2) ? d2 : []);
      setTreinamentos(Array.isArray(d3) ? d3 : []);
    } catch {
      setErro("Erro ao carregar dados");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

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
      const url = form.id ? `${apiUrl}/avaliacoes/${form.id}` : `${apiUrl}/avaliacoes`;

      const payload = {
        treinamento_id: Number(form.treinamento_id),
        nota_nps: Number(form.nota_nps),
        nota_qualidade: Number(form.nota_qualidade),
        nota_prova: Number(form.nota_prova || 0),
        comentario: form.comentario
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
      if (!res.ok) throw new Error(data.message || "Erro ao salvar avaliação");

      setForm(initialForm);
      setSucesso("Avaliação salva com sucesso");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar avaliação");
    }
  }

  function editar(item) {
    setForm({
      id: item.id,
      treinamento_id: String(item.treinamento_id || ""),
      nota_nps: item.nota_nps ?? "",
      nota_qualidade: item.nota_qualidade ?? "",
      nota_prova: item.nota_prova ?? "",
      comentario: item.comentario || ""
    });
  }

  async function excluir(id) {
    if (!confirm("Deseja excluir esta avaliação?")) return;
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/avaliacoes/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      setSucesso("Avaliação excluída com sucesso");
      carregar();
    } catch {
      setErro("Erro ao excluir avaliação");
    }
  }

  return (
    <PortalShell title="Avaliações" subtitle="Registro de NPS, qualidade, prova e materiais avaliativos.">
      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={grid}>
        <div style={panel}>
          <h2 style={h2}>{form.id ? "Editar Avaliação" : "Nova Avaliação"}</h2>
          <form onSubmit={handleSubmit} style={formGrid}>
            <select name="treinamento_id" value={form.treinamento_id} onChange={handleChange} style={input}>
              <option value="">Selecione o treinamento</option>
              {treinamentos.map((t) => (
                <option key={t.id} value={t.id}>{t.tema} - {t.cliente}</option>
              ))}
            </select>
            <input name="nota_nps" type="number" step="0.1" placeholder="NPS" value={form.nota_nps} onChange={handleChange} style={input} />
            <input name="nota_qualidade" type="number" step="0.1" placeholder="Qualidade" value={form.nota_qualidade} onChange={handleChange} style={input} />
            <input name="nota_prova" type="number" step="0.1" placeholder="Nota da prova" value={form.nota_prova} onChange={handleChange} style={input} />
            <textarea name="comentario" placeholder="Comentário" value={form.comentario} onChange={handleChange} style={{ ...input, minHeight: 100 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" style={buttonPrimary}>{form.id ? "Atualizar" : "Salvar"}</button>
              <button type="button" style={buttonSecondary} onClick={() => setForm(initialForm)}>Limpar</button>
            </div>
          </form>
        </div>

        <div style={panel}>
          <h2 style={h2}>Lista de Avaliações</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={thtd}>Treinamento ID</th>
                  <th style={thtd}>NPS</th>
                  <th style={thtd}>Qualidade</th>
                  <th style={thtd}>Prova</th>
                  <th style={thtd}>Comentário</th>
                  <th style={thtd}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {avaliacoes.map((item) => (
                  <tr key={item.id}>
                    <td style={thtd}>{item.treinamento_id}</td>
                    <td style={thtd}>{item.nota_nps}</td>
                    <td style={thtd}>{item.nota_qualidade}</td>
                    <td style={thtd}>{item.nota_prova}</td>
                    <td style={thtd}>{item.comentario || "-"}</td>
                    <td style={thtd}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={miniBtn} onClick={() => editar(item)}>Editar</button>
                        <button style={miniBtnDanger} onClick={() => excluir(item.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {avaliacoes.length === 0 ? <tr><td style={thtd} colSpan="6">Nenhuma avaliação cadastrada.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div style={panel}>
          <h2 style={h2}>Materiais Avaliativos</h2>
          <p style={{ marginTop: 0 }}>Total de materiais avaliativos: {materiais.length}</p>
        </div>
      </div>
    </PortalShell>
  );
}

const grid = { display: "grid", gridTemplateColumns: "1fr", gap: 16 };
const panel = { background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };
const h2 = { marginTop: 0 };
const formGrid = { display: "grid", gap: 12 };
const input = { padding: 12, borderRadius: 10, border: "1px solid #d1d5db", width: "100%", boxSizing: "border-box" };
const buttonPrimary = { background: "#1d4ed8", color: "#fff", border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" };
const buttonSecondary = { background: "#e5e7eb", color: "#111827", border: 0, borderRadius: 10, padding: "12px 16px", cursor: "pointer" };
const miniBtn = { background: "#dbeafe", color: "#1d4ed8", border: 0, borderRadius: 8, padding: "8px 10px", cursor: "pointer" };
const miniBtnDanger = { background: "#fee2e2", color: "#b91c1c", border: 0, borderRadius: 8, padding: "8px 10px", cursor: "pointer" };
const table = { width: "100%", borderCollapse: "collapse" };
const thtd = { borderBottom: "1px solid #e5e7eb", padding: 12, textAlign: "left" };
const errorBox = { background: "#fef2f2", color: "#b91c1c", padding: 14, borderRadius: 12, marginBottom: 16 };
const successBox = { background: "#ecfdf5", color: "#166534", padding: 14, borderRadius: 12, marginBottom: 16 };
