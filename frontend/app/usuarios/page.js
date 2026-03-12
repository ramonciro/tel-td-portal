"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";

const initialForm = {
  id: "",
  nome: "",
  email: "",
  senha: "",
  perfil: "instrutor",
  cliente: "",
  ativo: true
};

const perfisDisponiveis = ["admin", "coordenador", "supervisor", "instrutor"];

export default function UsuariosPage() {
  const [items, setItems] = useState([]);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [form, setForm] = useState(initialForm);
  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [perfilAtual, setPerfilAtual] = useState("");

  async function carregar() {
    try {
      setErro("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const userRaw = localStorage.getItem("user");
      if (userRaw) {
        const user = JSON.parse(userRaw);
        setPerfilAtual(String(user?.perfil || "").toLowerCase());
      }

      const res = await fetch(`${apiUrl}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data.message || "Erro ao carregar usuários");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setErro(e.message || "Erro ao carregar usuários");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const clientesUnicos = useMemo(() => {
    const values = [...new Set(items.map((i) => i.cliente).filter(Boolean))];
    return values.sort((a, b) => a.localeCompare(b));
  }, [items]);

  const usuariosFiltrados = useMemo(() => {
    return items.filter((item) => {
      const matchBusca =
        !busca ||
        String(item.nome || "").toLowerCase().includes(busca.toLowerCase()) ||
        String(item.email || "").toLowerCase().includes(busca.toLowerCase());

      const matchPerfil =
        filtroPerfil === "todos" ||
        String(item.perfil || "").toLowerCase() === filtroPerfil;

      const matchStatus =
        filtroStatus === "todos" ||
        (filtroStatus === "ativos" ? !!item.ativo : !item.ativo);

      const matchCliente =
        filtroCliente === "todos" ||
        String(item.cliente || "") === filtroCliente;

      return matchBusca && matchPerfil && matchStatus && matchCliente;
    });
  }, [items, busca, filtroPerfil, filtroStatus, filtroCliente]);

  const resumo = useMemo(() => {
    return {
      total: items.length,
      ativos: items.filter((i) => i.ativo).length,
      supervisores: items.filter((i) => String(i.perfil || "").toLowerCase() === "supervisor").length,
      instrutores: items.filter((i) => String(i.perfil || "").toLowerCase() === "instrutor").length
    };
  }, [items]);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setErro("");
      setSucesso("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const method = form.id ? "PUT" : "POST";
      const url = form.id ? `${apiUrl}/users/${form.id}` : `${apiUrl}/users`;

      const payload = { ...form };
      if (!payload.senha) delete payload.senha;

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro ao salvar usuário");

      setForm(initialForm);
      setSucesso(form.id ? "Usuário atualizado com sucesso" : "Usuário criado com sucesso");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar usuário");
    }
  }

  function editar(item) {
    setForm({
      id: item.id,
      nome: item.nome || "",
      email: item.email || "",
      senha: "",
      perfil: String(item.perfil || "instrutor").toLowerCase(),
      cliente: item.cliente || "",
      ativo: !!item.ativo
    });
  }

  async function excluir(id) {
    if (!confirm("Deseja excluir este usuário?")) return;
    try {
      setErro("");
      setSucesso("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const res = await fetch(`${apiUrl}/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro ao excluir usuário");

      setSucesso("Usuário excluído com sucesso");
      carregar();
    } catch (e) {
      setErro(e.message || "Erro ao excluir usuário");
    }
  }

  const podeGerenciarUsuarios = ["admin", "coordenador", "supervisor"].includes(perfilAtual);

  return (
    <PortalShell title="Usuários" subtitle="Gestão de acessos, perfis e vínculo por cliente">
      {erro ? <div style={errorBox}>{erro}</div> : null}
      {sucesso ? <div style={successBox}>{sucesso}</div> : null}

      <div style={miniCardsGrid}>
        <MiniCard title="Total" value={resumo.total} />
        <MiniCard title="Ativos" value={resumo.ativos} />
        <MiniCard title="Supervisores" value={resumo.supervisores} />
        <MiniCard title="Instrutores" value={resumo.instrutores} />
      </div>

      <div style={filtersBar}>
        <input
          placeholder="Buscar por nome ou e-mail"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={input}
        />

        <select value={filtroPerfil} onChange={(e) => setFiltroPerfil(e.target.value)} style={input}>
          <option value="todos">Todos os perfis</option>
          {perfisDisponiveis.map((perfil) => (
            <option key={perfil} value={perfil}>{perfil}</option>
          ))}
        </select>

        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} style={input}>
          <option value="todos">Todos os status</option>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
        </select>

        <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} style={input}>
          <option value="todos">Todos os clientes</option>
          {clientesUnicos.map((cliente) => (
            <option key={cliente} value={cliente}>{cliente}</option>
          ))}
        </select>
      </div>

      {podeGerenciarUsuarios ? (
        <div style={panel}>
          <h2 style={h2}>{form.id ? "Editar usuário" : "Novo usuário"}</h2>
          <form onSubmit={handleSubmit} style={formGrid}>
            <div style={twoCols}>
              <input name="nome" placeholder="Nome" value={form.nome} onChange={handleChange} style={input} />
              <input name="email" placeholder="E-mail" value={form.email} onChange={handleChange} style={input} />
            </div>

            <div style={twoCols}>
              <input name="senha" type="password" placeholder={form.id ? "Nova senha (opcional)" : "Senha"} value={form.senha} onChange={handleChange} style={input} />
              <select name="perfil" value={form.perfil} onChange={handleChange} style={input}>
                {perfisDisponiveis.map((perfil) => (
                  <option key={perfil} value={perfil}>{perfil}</option>
                ))}
              </select>
            </div>

            <div style={twoCols}>
              <input name="cliente" placeholder="Cliente" value={form.cliente} onChange={handleChange} style={input} />
              <label style={checkboxLabel}>
                <input type="checkbox" name="ativo" checked={form.ativo} onChange={handleChange} />
                Usuário ativo
              </label>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" style={buttonPrimary}>{form.id ? "Atualizar" : "Salvar"}</button>
              <button type="button" style={buttonSecondary} onClick={() => setForm(initialForm)}>Limpar</button>
            </div>
          </form>
        </div>
      ) : (
        <div style={infoBox}>Seu perfil permite consulta, mas não gerenciamento completo de usuários.</div>
      )}

      <div style={panel}>
        <h2 style={h2}>Lista de usuários</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                <th style={thtd}>Nome</th>
                <th style={thtd}>E-mail</th>
                <th style={thtd}>Perfil</th>
                <th style={thtd}>Cliente</th>
                <th style={thtd}>Status</th>
                <th style={thtd}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.map((item) => (
                <tr key={item.id}>
                  <td style={thtd}>{item.nome}</td>
                  <td style={thtd}>{item.email}</td>
                  <td style={thtd}>
                    <span style={{ ...badge, ...perfilBadge(String(item.perfil || "").toLowerCase()) }}>
                      {item.perfil}
                    </span>
                  </td>
                  <td style={thtd}>{item.cliente || "-"}</td>
                  <td style={thtd}>
                    <span style={{ ...badge, ...(item.ativo ? ativoBadge : inativoBadge) }}>
                      {item.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td style={thtd}>
                    {podeGerenciarUsuarios ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button style={miniBtn} onClick={() => editar(item)}>Editar</button>
                        <button style={miniBtnDanger} onClick={() => excluir(item.id)}>Excluir</button>
                      </div>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>Consulta</span>
                    )}
                  </td>
                </tr>
              ))}
              {usuariosFiltrados.length === 0 ? (
                <tr><td style={thtd} colSpan="6">Nenhum usuário encontrado.</td></tr>
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

function perfilBadge(perfil) {
  if (perfil === "admin") return { background: "#ede9fe", color: "#6d28d9" };
  if (perfil === "coordenador") return { background: "#dbeafe", color: "#1d4ed8" };
  if (perfil === "supervisor") return { background: "#dcfce7", color: "#166534" };
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

const twoCols = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12
};

const input = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  width: "100%",
  boxSizing: "border-box"
};

const checkboxLabel = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  color: "#334155"
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

const ativoBadge = {
  background: "#dcfce7",
  color: "#166534"
};

const inativoBadge = {
  background: "#fee2e2",
  color: "#b91c1c"
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

const infoBox = {
  background: "#eff6ff",
  color: "#1d4ed8",
  padding: 14,
  borderRadius: 12,
  marginBottom: 16
};
