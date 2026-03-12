"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";

const initialForm = {
  id: "",
  treinamento_id: "",
  nota_nps: "",
  nota_qualidade: "",
  nota_prova: "",
  comentario: ""
};

const initialMaterialForm = {
  id: "",
  treinamento_id: "",
  titulo: "",
  tipo: "Prova",
  link_arquivo: "",
  descricao: "",
  nota_maxima: "",
  data_aplicacao: ""
};

export default function AvaliacoesPage() {
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [treinamentos, setTreinamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [form, setForm] = useState(initialForm);
  const [materialForm, setMaterialForm] = useState(initialMaterialForm);

  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [filtroTreinamento, setFiltroTreinamento] = useState("todos");
  const [filtroInstrutor, setFiltroInstrutor] = useState("todos");

  async function carregar() {
    try {
      setErro("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const [r1, r2, r3, r4] = await Promise.all([
        fetch(`${apiUrl}/avaliacoes`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/materiais-avaliativos`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/treinamentos`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/presencas`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (!r1.ok || !r2.ok || !r3.ok || !r4.ok) throw new Error();

      const d1 = await r1.json();
      const d2 = await r2.json();
      const d3 = await r3.json();
      const d4 = await r4.json();

      setAvaliacoes(Array.isArray(d1) ? d1 : []);
      setMateriais(Array.isArray(d2) ? d2 : []);
      setTreinamentos(Array.isArray(d3) ? d3 : []);
      setPresencas(Array.isArray(d4) ? d4 : []);
    } catch {
      setErro("Erro ao carregar dados");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const treinamentoMap = useMemo(() => {
    const map = {};
    treinamentos.forEach((t) => { map[t.id] = t; });
    return map;
  }, [treinamentos]);

  const clientesUnicos = useMemo(() => {
    return [...new Set(treinamentos.map((t) => t.cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [treinamentos]);

  const instrutoresUnicos = useMemo(() => {
    return [...new Set(treinamentos.map((t) => t.instrutor).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [treinamentos]);

  const treinamentoIdsFiltrados = useMemo(() => {
    return treinamentos
      .filter((t) => {
        const matchCliente = filtroCliente === "todos" || String(t.cliente || "") === filtroCliente;
        const matchTreinamento = filtroTreinamento === "todos" || String(t.id) === filtroTreinamento;
        const matchInstrutor = filtroInstrutor === "todos" || String(t.instrutor || "") === filtroInstrutor;
        return matchCliente && matchTreinamento && matchInstrutor;
      })
      .map((t) => t.id);
  }, [treinamentos, filtroCliente, filtroTreinamento, filtroInstrutor]);

  const avaliacoesFiltradas = useMemo(() => {
    return avaliacoes.filter((a) => treinamentoIdsFiltrados.includes(a.treinamento_id));
  }, [avaliacoes, treinamentoIdsFiltrados]);

  const materiaisFiltrados = useMemo(() => {
    return materiais.filter((m) => treinamentoIdsFiltrados.includes(m.treinamento_id));
  }, [materiais, treinamentoIdsFiltrados]);

  const presencasFiltradas = useMemo(() => {
    return presencas.filter((p) => treinamentoIdsFiltrados.includes(p.treinamento_id));
  }, [presencas, treinamentoIdsFiltrados]);

  const kpis = useMemo(() => {
    const totalAvaliacoes = avaliacoesFiltradas.length;
    const npsMedio = totalAvaliacoes ? avg(avaliacoesFiltradas.map((a) => Number(a.nota_nps || 0))) : 0;
    const qualidadeMedia = totalAvaliacoes ? avg(avaliacoesFiltradas.map((a) => Number(a.nota_qualidade || 0))) : 0;
    const aproveitamentoMedio = totalAvaliacoes ? avg(avaliacoesFiltradas.map((a) => Number(a.nota_prova || 0))) : 0;

    const previstos = treinamentoIdsFiltrados.reduce((acc, id) => acc + Number(treinamentoMap[id]?.participantes_previstos || 0), 0);
    const presentes = presencasFiltradas.filter((p) => p.status === "presente").length;
    const ausentes = presencasFiltradas.filter((p) => p.status === "ausente").length;
    const justificadas = presencasFiltradas.filter((p) => p.status === "justificado").length;

    const assiduidade = presencasFiltradas.length ? round((presentes / presencasFiltradas.length) * 100) : 0;
    const absenteismo = previstos > 0 ? round((ausentes / previstos) * 100) : 0;

    const concluidos = treinamentoIdsFiltrados.reduce((acc, id) => acc + Number(treinamentoMap[id]?.concluidos || 0), 0);
    const presentesTreinamento = treinamentoIdsFiltrados.reduce((acc, id) => acc + Number(treinamentoMap[id]?.participantes_presentes || 0), 0);
    const taxaConclusao = presentesTreinamento > 0 ? round((concluidos / presentesTreinamento) * 100) : 0;

    return {
      totalAvaliacoes,
      npsMedio,
      qualidadeMedia,
      aproveitamentoMedio,
      previstos,
      presentes,
      ausentes,
      justificadas,
      assiduidade,
      absenteismo,
      taxaConclusao
    };
  }, [avaliacoesFiltradas, presencasFiltradas, treinamentoIdsFiltrados, treinamentoMap]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleMaterialChange(e) {
    const { name, value } = e.target;
    setMaterialForm((prev) => ({ ...prev, [name]: value }));
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

  async function handleMaterialSubmit(e) {
    e.preventDefault();
    try {
      setErro("");
      setSucesso("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const method = materialForm.id ? "PUT" : "POST";
      const url = materialForm.id ? `${apiUrl}/materiais-avaliativos/${materialForm.id}` : `${apiUrl}/materiais-avaliativos`;

      const payload = {
        treinamento_id: Number(materialForm.treinamento_id),
        titulo: materialForm.titulo,
        tipo: materialForm.tipo,
        link_arquivo: materialForm.link_arquivo,
        descricao: materialForm.descricao,
        nota_maxima: Number(materialForm.nota_maxima || 0),
        data_aplicacao: materialForm.data_aplicacao || null
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
      if (!res.ok) throw new Error(data.message || "Erro ao salvar material avaliativo");

      setMaterialForm(initialMaterialForm);
      setSucesso("Material avaliativo salvo com sucesso");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar material avaliativo");
    }
  }

  function editarAvaliacao(item) {
    setForm({
      id: item.id,
      treinamento_id: String(item.treinamento_id || ""),
      nota_nps: item.nota_nps ?? "",
      nota_qualidade: item.nota_qualidade ?? "",
      nota_prova: item.nota_prova ?? "",
      comentario: item.comentario || ""
    });
  }

  function editarMaterial(item) {
    setMaterialForm({
      id: item.id,
      treinamento_id: String(item.treinamento_id || ""),
      titulo: item.titulo || "",
      tipo: item.tipo || "Prova",
      link_arquivo: item.link_arquivo || "",
      descricao: item.descricao || "",
      nota_maxima: item.nota_maxima ?? "",
      data_aplicacao: formatDateInput(item.data_aplicacao)
    });
  }

  async function excluirAvaliacao(id) {
    if (!confirm("Deseja excluir esta avaliação?")) return;
    try {
      setErro("");
      setSucesso("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/avaliacoes/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro ao excluir avaliação");
      setSucesso("Avaliação excluída com sucesso");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao excluir avaliação");
    }
  }

  async function excluirMaterial(id) {
    if (!confirm("Deseja excluir este material avaliativo?")) return;
    try {
      setErro("");
      setSucesso("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      const res = await fetch(`${apiUrl}/materiais-avaliativos/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro ao excluir material avaliativo");
      setSucesso("Material avaliativo excluído com sucesso");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao excluir material avaliativo");
    }
  }

  function baixarCSV() {
    const headers = ["treinamento", "cliente", "nps", "qualidade", "nota_prova", "comentario"];
    const rows = avaliacoesFiltradas.map((item) => {
      const t = treinamentoMap[item.treinamento_id] || {};
      return [
        t.tema || item.treinamento_id,
        t.cliente || "",
        item.nota_nps ?? "",
        item.nota_qualidade ?? "",
        item.nota_prova ?? "",
        item.comentario ?? ""
      ];
    });

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
    link.href = url;
    link.download = `avaliacoes_kpis_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PortalShell title="Indicadores e Avaliações" subtitle="KPIs de treinamento, absenteísmo, avaliação de reação e materiais avaliativos">
      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={miniCardsGrid}>
        <MiniCard title="NPS médio" value={kpis.npsMedio} />
        <MiniCard title="Qualidade média" value={kpis.qualidadeMedia} />
        <MiniCard title="Aproveitamento" value={kpis.aproveitamentoMedio} />
        <MiniCard title="Assiduidade" value={`${kpis.assiduidade}%`} />
        <MiniCard title="Absenteísmo" value={`${kpis.absenteismo}%`} />
        <MiniCard title="Conclusão" value={`${kpis.taxaConclusao}%`} />
        <MiniCard title="Previstos" value={kpis.previstos} />
        <MiniCard title="Presentes" value={kpis.presentes} />
      </div>

      <div style={filtersBar}>
        <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} style={input}>
          <option value="todos">Todos os clientes</option>
          {clientesUnicos.map((cliente) => <option key={cliente} value={cliente}>{cliente}</option>)}
        </select>

        <select value={filtroInstrutor} onChange={(e) => setFiltroInstrutor(e.target.value)} style={input}>
          <option value="todos">Todos os instrutores</option>
          {instrutoresUnicos.map((instrutor) => <option key={instrutor} value={instrutor}>{instrutor}</option>)}
        </select>

        <select value={filtroTreinamento} onChange={(e) => setFiltroTreinamento(e.target.value)} style={input}>
          <option value="todos">Todos os treinamentos</option>
          {treinamentos.map((t) => <option key={t.id} value={String(t.id)}>{t.tema} - {t.cliente}</option>)}
        </select>

        <button onClick={baixarCSV} style={buttonPrimary}>Baixar CSV</button>
      </div>

      <div style={twoCols}>
        <div style={panel}>
          <h2 style={h2}>Avaliações de treinamento</h2>
          <p style={subText}>Lance NPS, qualidade, prova e comentário por treinamento.</p>
          <form onSubmit={handleSubmit} style={formGrid}>
            <select name="treinamento_id" value={form.treinamento_id} onChange={handleChange} style={input}>
              <option value="">Selecione o treinamento</option>
              {treinamentos.map((t) => <option key={t.id} value={t.id}>{t.tema} - {t.cliente}</option>)}
            </select>
            <div style={threeCols}>
              <input name="nota_nps" type="number" step="0.1" placeholder="NPS" value={form.nota_nps} onChange={handleChange} style={input} />
              <input name="nota_qualidade" type="number" step="0.1" placeholder="Qualidade" value={form.nota_qualidade} onChange={handleChange} style={input} />
              <input name="nota_prova" type="number" step="0.1" placeholder="Nota da prova" value={form.nota_prova} onChange={handleChange} style={input} />
            </div>
            <textarea name="comentario" placeholder="Comentário" value={form.comentario} onChange={handleChange} style={{ ...input, minHeight: 110 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" style={buttonPrimary}>{form.id ? "Atualizar" : "Salvar"}</button>
              <button type="button" style={buttonSecondary} onClick={() => setForm(initialForm)}>Limpar</button>
            </div>
          </form>
        </div>

        <div style={panel}>
          <h2 style={h2}>Materiais avaliativos</h2>
          <p style={subText}>Vincule provas, quizzes, simulados e atividades ao treinamento.</p>
          <form onSubmit={handleMaterialSubmit} style={formGrid}>
            <select name="treinamento_id" value={materialForm.treinamento_id} onChange={handleMaterialChange} style={input}>
              <option value="">Selecione o treinamento</option>
              {treinamentos.map((t) => <option key={t.id} value={t.id}>{t.tema} - {t.cliente}</option>)}
            </select>
            <div style={twoSmallCols}>
              <input name="titulo" placeholder="Título do material" value={materialForm.titulo} onChange={handleMaterialChange} style={input} />
              <select name="tipo" value={materialForm.tipo} onChange={handleMaterialChange} style={input}>
                <option>Prova</option>
                <option>Quiz</option>
                <option>Simulado</option>
                <option>Atividade prática</option>
                <option>Checklist operacional</option>
              </select>
            </div>
            <div style={twoSmallCols}>
              <input name="nota_maxima" type="number" step="0.1" placeholder="Nota máxima" value={materialForm.nota_maxima} onChange={handleMaterialChange} style={input} />
              <input name="data_aplicacao" type="date" value={materialForm.data_aplicacao} onChange={handleMaterialChange} style={input} />
            </div>
            <input name="link_arquivo" placeholder="Link do arquivo ou formulário" value={materialForm.link_arquivo} onChange={handleMaterialChange} style={input} />
            <textarea name="descricao" placeholder="Descrição / objetivo do material" value={materialForm.descricao} onChange={handleMaterialChange} style={{ ...input, minHeight: 110 }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" style={buttonPrimary}>{materialForm.id ? "Atualizar" : "Salvar"}</button>
              <button type="button" style={buttonSecondary} onClick={() => setMaterialForm(initialMaterialForm)}>Limpar</button>
            </div>
          </form>
        </div>
      </div>

      <div style={twoCols}>
        <div style={panel}>
          <h2 style={h2}>Histórico de avaliações</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={thtd}>Treinamento</th>
                  <th style={thtd}>Cliente</th>
                  <th style={thtd}>NPS</th>
                  <th style={thtd}>Qualidade</th>
                  <th style={thtd}>Prova</th>
                  <th style={thtd}>Comentário</th>
                  <th style={thtd}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {avaliacoesFiltradas.map((item) => {
                  const t = treinamentoMap[item.treinamento_id] || {};
                  return (
                    <tr key={item.id}>
                      <td style={thtd}>{t.tema || item.treinamento_id}</td>
                      <td style={thtd}>{t.cliente || "-"}</td>
                      <td style={thtd}>{item.nota_nps}</td>
                      <td style={thtd}>{item.nota_qualidade}</td>
                      <td style={thtd}>{item.nota_prova}</td>
                      <td style={thtd}>{item.comentario || "-"}</td>
                      <td style={thtd}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button style={miniBtn} onClick={() => editarAvaliacao(item)}>Editar</button>
                          <button style={miniBtnDanger} onClick={() => excluirAvaliacao(item.id)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {avaliacoesFiltradas.length === 0 ? <tr><td style={thtd} colSpan="7">Nenhuma avaliação encontrada.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div style={panel}>
          <h2 style={h2}>Materiais cadastrados</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={thtd}>Treinamento</th>
                  <th style={thtd}>Tipo</th>
                  <th style={thtd}>Título</th>
                  <th style={thtd}>Nota máx.</th>
                  <th style={thtd}>Data</th>
                  <th style={thtd}>Link</th>
                  <th style={thtd}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {materiaisFiltrados.map((item) => {
                  const t = treinamentoMap[item.treinamento_id] || {};
                  return (
                    <tr key={item.id}>
                      <td style={thtd}>{t.tema || item.treinamento_id}</td>
                      <td style={thtd}>{item.tipo}</td>
                      <td style={thtd}>{item.titulo}</td>
                      <td style={thtd}>{item.nota_maxima}</td>
                      <td style={thtd}>{formatDate(item.data_aplicacao)}</td>
                      <td style={thtd}>{item.link_arquivo || "-"}</td>
                      <td style={thtd}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button style={miniBtn} onClick={() => editarMaterial(item)}>Editar</button>
                          <button style={miniBtnDanger} onClick={() => excluirMaterial(item.id)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {materiaisFiltrados.length === 0 ? <tr><td style={thtd} colSpan="7">Nenhum material encontrado.</td></tr> : null}
              </tbody>
            </table>
          </div>
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

function avg(values) {
  if (!values.length) return 0;
  return round(values.reduce((a, b) => a + b, 0) / values.length);
}

function round(value) {
  return Number(Number(value || 0).toFixed(1));
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
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
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
  gridTemplateColumns: "1fr 1fr 1fr auto",
  gap: 12,
  marginBottom: 18,
  alignItems: "center"
};

const twoCols = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
  marginBottom: 18
};

const twoSmallCols = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12
};

const threeCols = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 12
};

const panel = {
  background: "#fff",
  borderRadius: 16,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
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
