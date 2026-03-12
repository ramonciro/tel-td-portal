"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";

const initialForm = {
  id: "",
  titulo: "",
  tipo: "PDF",
  cliente: "",
  link_arquivo: "",
  descricao: "",
  categoria: "produto",
  publico: "todos",
  status: "ativo"
};

export default function BibliotecaPage() {
  const [items, setItems] = useState([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [form, setForm] = useState(initialForm);

  const [busca, setBusca] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroCategoria, setFiltroCategoria] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  async function carregar() {
    try {
      setErro("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const res = await fetch(`${apiUrl}/biblioteca`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.message || "Erro ao carregar biblioteca");

      const normalized = (Array.isArray(data) ? data : []).map((item) => ({
        ...item,
        categoria: item.categoria || "produto",
        publico: item.publico || "todos",
        status: item.status || "ativo"
      }));

      setItems(normalized);
    } catch (e) {
      setErro(e.message || "Erro ao carregar biblioteca");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const resumo = useMemo(() => {
    return {
      total: items.length,
      pdfs: items.filter((i) => String(i.tipo || "").toLowerCase() === "pdf").length,
      links: items.filter((i) => ["link", "vídeo", "video"].includes(String(i.tipo || "").toLowerCase())).length,
      ativos: items.filter((i) => String(i.status || "").toLowerCase() === "ativo").length
    };
  }, [items]);

  const clientesUnicos = useMemo(() => {
    return [...new Set(items.map((i) => i.cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const tiposUnicos = useMemo(() => {
    return [...new Set(items.map((i) => i.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const categoriasUnicas = useMemo(() => {
    return [...new Set(items.map((i) => i.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [items]);

  const itensFiltrados = useMemo(() => {
    return items.filter((item) => {
      const matchBusca =
        !busca ||
        String(item.titulo || "").toLowerCase().includes(busca.toLowerCase()) ||
        String(item.descricao || "").toLowerCase().includes(busca.toLowerCase()) ||
        String(item.cliente || "").toLowerCase().includes(busca.toLowerCase());

      const matchCliente = filtroCliente === "todos" || String(item.cliente || "") === filtroCliente;
      const matchTipo = filtroTipo === "todos" || String(item.tipo || "") === filtroTipo;
      const matchCategoria = filtroCategoria === "todos" || String(item.categoria || "") === filtroCategoria;
      const matchStatus = filtroStatus === "todos" || String(item.status || "") === filtroStatus;

      return matchBusca && matchCliente && matchTipo && matchCategoria && matchStatus;
    });
  }, [items, busca, filtroCliente, filtroTipo, filtroCategoria, filtroStatus]);

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
      const url = form.id ? `${apiUrl}/biblioteca/${form.id}` : `${apiUrl}/biblioteca`;

      const payload = { ...form };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro ao salvar conteúdo");

      setForm(initialForm);
      setSucesso(form.id ? "Conteúdo atualizado com sucesso" : "Conteúdo criado com sucesso");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar conteúdo");
    }
  }

  function editar(item) {
    setForm({
      id: item.id,
      titulo: item.titulo || "",
      tipo: item.tipo || "PDF",
      cliente: item.cliente || "",
      link_arquivo: item.link_arquivo || "",
      descricao: item.descricao || "",
      categoria: item.categoria || "produto",
      publico: item.publico || "todos",
      status: item.status || "ativo"
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function excluir(id) {
    if (!confirm("Deseja excluir este conteúdo?")) return;

    try {
      setErro("");
      setSucesso("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const res = await fetch(`${apiUrl}/biblioteca/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro ao excluir conteúdo");

      setSucesso("Conteúdo excluído com sucesso");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao excluir conteúdo");
    }
  }

  function copiarLink(link) {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setSucesso("Link copiado com sucesso");
  }

  return (
    <PortalShell
      title="Biblioteca"
      subtitle="Portfólio de acesso rápido para treinandos e instrutores"
    >
      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={heroPanel}>
        <div>
          <div style={eyebrow}>Portfólio de conteúdos</div>
          <h2 style={heroTitle}>Base rápida de consulta para treinamento</h2>
          <p style={heroText}>
            Organize materiais por cliente, categoria, público e status.
            Use a biblioteca como apoio para aplicação, reciclagem e trilhas de aprendizagem.
          </p>
        </div>
        <div style={heroTags}>
          <span style={heroTag}>Acesso rápido</span>
          <span style={heroTag}>Instrutores</span>
          <span style={heroTag}>Treinandos</span>
        </div>
      </div>

      <div style={miniCardsGrid}>
        <MiniCard title="Total de conteúdos" value={resumo.total} />
        <MiniCard title="PDFs" value={resumo.pdfs} />
        <MiniCard title="Links/Vídeos" value={resumo.links} />
        <MiniCard title="Ativos" value={resumo.ativos} />
      </div>

      <div style={filtersBar}>
        <input
          placeholder="Buscar por título, cliente ou descrição"
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

        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={input}>
          <option value="todos">Todos os tipos</option>
          {tiposUnicos.map((tipo) => (
            <option key={tipo} value={tipo}>{tipo}</option>
          ))}
        </select>

        <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={input}>
          <option value="todos">Todas as categorias</option>
          {categoriasUnicas.map((categoria) => (
            <option key={categoria} value={categoria}>{categoria}</option>
          ))}
        </select>

        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} style={input}>
          <option value="todos">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="em revisão">Em revisão</option>
          <option value="arquivado">Arquivado</option>
        </select>
      </div>

      <div style={panel}>
        <h2 style={h2}>{form.id ? "Editar conteúdo" : "Novo conteúdo"}</h2>
        <p style={subText}>Cadastre materiais para consulta rápida do time e apoio às trilhas.</p>

        <form onSubmit={handleSubmit} style={formGrid}>
          <div style={twoCols}>
            <input name="titulo" placeholder="Título" value={form.titulo} onChange={handleChange} style={input} />
            <input name="cliente" placeholder="Cliente" value={form.cliente} onChange={handleChange} style={input} />
          </div>

          <div style={threeCols}>
            <select name="tipo" value={form.tipo} onChange={handleChange} style={input}>
              <option>PDF</option>
              <option>PPT</option>
              <option>DOC</option>
              <option>Vídeo</option>
              <option>Link</option>
              <option>Planilha</option>
            </select>

            <select name="categoria" value={form.categoria} onChange={handleChange} style={input}>
              <option value="onboarding">onboarding</option>
              <option value="produto">produto</option>
              <option value="atendimento">atendimento</option>
              <option value="sistema">sistema</option>
              <option value="qualidade">qualidade</option>
              <option value="reciclagem">reciclagem</option>
            </select>

            <select name="publico" value={form.publico} onChange={handleChange} style={input}>
              <option value="todos">todos</option>
              <option value="instrutor">instrutor</option>
              <option value="supervisor">supervisor</option>
              <option value="operacao">operação</option>
              <option value="treinandos">treinandos</option>
            </select>
          </div>

          <div style={twoCols}>
            <select name="status" value={form.status} onChange={handleChange} style={input}>
              <option value="ativo">ativo</option>
              <option value="em revisão">em revisão</option>
              <option value="arquivado">arquivado</option>
            </select>

            <input
              name="link_arquivo"
              placeholder="Link do conteúdo"
              value={form.link_arquivo}
              onChange={handleChange}
              style={input}
            />
          </div>

          <textarea
            name="descricao"
            placeholder="Descrição curta do material"
            value={form.descricao}
            onChange={handleChange}
            style={{ ...input, minHeight: 110 }}
          />

          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" style={buttonPrimary}>{form.id ? "Atualizar" : "Salvar"}</button>
            <button type="button" style={buttonSecondary} onClick={() => setForm(initialForm)}>Limpar</button>
          </div>
        </form>
      </div>

      <div style={portfolioHeader}>
        <div>
          <h2 style={{ margin: 0, color: "#334155" }}>Portfólio de materiais</h2>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
            Conteúdos organizados para acesso rápido e consulta operacional.
          </p>
        </div>
        <div style={portfolioCount}>{itensFiltrados.length} itens</div>
      </div>

      <div style={portfolioGrid}>
        {itensFiltrados.map((item) => (
          <div key={item.id} style={card}>
            <div style={cardTop}>
              <div style={cardTitleWrap}>
                <div style={cardTitle}>{item.titulo}</div>
                <div style={cardClient}>{item.cliente || "Sem cliente"}</div>
              </div>

              <span style={{ ...badge, ...statusBadge(item.status) }}>
                {item.status}
              </span>
            </div>

            <div style={badgesRow}>
              <span style={{ ...pill, ...typePill }}>{item.tipo}</span>
              <span style={{ ...pill, ...categoryPill }}>{item.categoria || "categoria"}</span>
              <span style={{ ...pill, ...audiencePill }}>{item.publico || "todos"}</span>
            </div>

            <p style={cardDescription}>
              {item.descricao || "Sem descrição cadastrada."}
            </p>

            <div style={actionGrid}>
              <a
                href={item.link_arquivo || "#"}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...buttonPrimary,
                  textDecoration: "none",
                  textAlign: "center",
                  pointerEvents: item.link_arquivo ? "auto" : "none",
                  opacity: item.link_arquivo ? 1 : 0.5
                }}
              >
                Abrir
              </a>

              <button style={buttonSecondary} onClick={() => copiarLink(item.link_arquivo)}>
                Copiar link
              </button>
            </div>

            <div style={cardActions}>
              <button style={miniBtn} onClick={() => editar(item)}>Editar</button>
              <button style={miniBtnDanger} onClick={() => excluir(item.id)}>Excluir</button>
            </div>
          </div>
        ))}

        {itensFiltrados.length === 0 ? (
          <div style={emptyCard}>
            Nenhum conteúdo encontrado com os filtros aplicados.
          </div>
        ) : null}
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
  const value = String(status || "").toLowerCase();
  if (value === "ativo") return { background: "#dcfce7", color: "#166534" };
  if (value === "em revisão") return { background: "#fef3c7", color: "#92400e" };
  return { background: "#e5e7eb", color: "#334155" };
}

const heroPanel = {
  background: "linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)",
  borderRadius: 18,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr",
  gap: 16,
  marginBottom: 18
};

const eyebrow = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#1d4ed8",
  fontWeight: 700
};

const heroTitle = {
  margin: "10px 0 8px",
  fontSize: 28,
  color: "#0f172a"
};

const heroText = {
  margin: 0,
  color: "#475569",
  lineHeight: 1.5
};

const heroTags = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignContent: "start",
  justifyContent: "flex-end"
};

const heroTag = {
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "8px 12px",
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 600
};

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
  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
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
const subText = { marginTop: -4, color: "#64748b", fontSize: 14 };
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

const portfolioHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 14
};

const portfolioCount = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  padding: "8px 12px",
  borderRadius: 999,
  fontSize: 13,
  color: "#475569"
};

const portfolioGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16
};

const card = {
  background: "#fff",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  border: "1px solid #e5e7eb",
  display: "grid",
  gap: 14
};

const cardTop = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "start"
};

const cardTitleWrap = {
  display: "grid",
  gap: 4
};

const cardTitle = {
  fontSize: 17,
  fontWeight: 700,
  color: "#0f172a"
};

const cardClient = {
  fontSize: 13,
  color: "#64748b"
};

const badgesRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap"
};

const pill = {
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600
};

const typePill = {
  background: "#dbeafe",
  color: "#1d4ed8"
};

const categoryPill = {
  background: "#ede9fe",
  color: "#6d28d9"
};

const audiencePill = {
  background: "#ecfccb",
  color: "#3f6212"
};

const cardDescription = {
  margin: 0,
  color: "#475569",
  lineHeight: 1.5,
  minHeight: 44
};

const actionGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10
};

const cardActions = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end"
};

const emptyCard = {
  background: "#fff",
  borderRadius: 18,
  padding: 24,
  border: "1px dashed #cbd5e1",
  color: "#64748b"
};

const badge = {
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600
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
