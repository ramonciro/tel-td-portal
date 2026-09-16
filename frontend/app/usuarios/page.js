"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import PageHero    from "../../components/PageHero";
import StatCard    from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { colors, chart } from "../../lib/theme";

/* ═══════════════════════════════════════════════
   UTILITÁRIOS
═══════════════════════════════════════════════ */
function fmt(n) { return new Intl.NumberFormat("pt-BR").format(Number(n || 0)); }

function iniciais(nome) {
  const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  return (p[0]?.[0] || "?").toUpperCase();
}

function normalizarClientes(valor) {
  if (!valor) return [];
  return String(valor).split(",").map((s) => s.trim()).filter(Boolean);
}

/* ── Cor por perfil (Pacote 3 — redesign, 16/09/2026) ──────────────────────
   Antes: cada linha desta tela carregava até 5 elementos coloridos
   diferentes (avatar, badge de perfil, chips de operação, status, botões
   de ação), com uma paleta de ~50 cores distintas usadas só nessa tela —
   cada bg/text/avatar escolhido a dedo, perfil por perfil, sem reaproveitar
   nenhum padrão do resto do sistema.

   Agora: 1 tom por perfil, escolhido da paleta categórica que já existe em
   lib/theme.js (`chart`) — a mesma que o design-system.md recomenda para
   "métricas sem semântica de bom/ruim". O bg claro do badge/avatar não é
   mais um hex escolhido à parte: é derivado do próprio tom (corBadge),
   então um perfil = uma cor, em vez de três. */
const PERFIL_TOM = {
  coordenador: chart.blue,
  supervisor: chart.purple,
  superintendente: chart.orange,
  instrutor: chart.teal,
  coaching: chart.pink,
  metodologia: chart.cyan,
  // Ajuste pós-entrega do Pacote Salas (15/09/2026): o perfil já existia no
  // backend desde a Fase 1 (authorizeRoles em várias rotas já aceitava
  // "assistente_treinamento"), mas não dava pra criar um usuário com esse
  // perfil pela tela — faltava aqui.
  assistente_treinamento: chart.orange,
  treinando: colors.neutral,
  // Achado ao revisar o Pacote 3 (16/09/2026): usuários do módulo R&S são
  // criados por uma tela dedicada (Configurações R&S), não por aqui — mas
  // eles aparecem nesta listagem geral igual a qualquer outro usuário, e
  // como não estavam mapeados, caíam no cinza neutro (badge quase invisível)
  // e ficavam de fora da contagem "Distribuição por perfil". Reaproveitando
  // tons já usados (mesma ideia de "coordenador" e "metodologia").
  coordenador_rs: chart.blue,
  gestor_rs: chart.cyan,
};
function tomPerfil(perfil) {
  return PERFIL_TOM[String(perfil || "").toLowerCase()] || colors.neutral;
}
function hexParaRgba(hex, alpha) {
  const limpo = String(hex || "").replace("#", "");
  const bigint = parseInt(limpo.length === 3 ? limpo.split("").map((c) => c + c).join("") : limpo, 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
// Badge único reaproveitado em qualquer lugar da tela que precise mostrar
// "cor por perfil" (badge de perfil, distribuição, legenda) — sempre a
// mesma fórmula (bg = tom a 14% de opacidade, texto = tom sólido).
function corBadge(tom) {
  return { bg: hexParaRgba(tom, 0.14), text: tom, border: `1px solid ${hexParaRgba(tom, 0.32)}` };
}
function perfilCor(perfil) {
  const tom = tomPerfil(perfil);
  return { ...corBadge(tom), avatar: tom };
}

const PERFIL_LABEL = {
  coordenador: "Coordenador", supervisor: "Supervisor", instrutor: "Instrutor",
  treinando: "Treinando", superintendente: "Superintendente",
  coaching: "Coaching", metodologia: "Metodologia",
  assistente_treinamento: "Assistente de Treinamento",
  coordenador_rs: "Coordenador R&S", gestor_rs: "Gestor R&S",
};

/* ── Opções fixas ── */
const PERFIL_OPTIONS = [
  { value: "coordenador",     label: "Coordenador"     },
  { value: "supervisor",      label: "Supervisor"       },
  { value: "instrutor",       label: "Instrutor"        },
  { value: "treinando",       label: "Treinando"        },
  { value: "superintendente", label: "Superintendente"  },
  { value: "coaching",        label: "Coaching"         },
  { value: "metodologia",     label: "Metodologia"      },
  { value: "assistente_treinamento", label: "Assistente de Treinamento" },
  // Incluídos no Pacote 3 (16/09/2026) — ver nota em PERFIL_TOM acima.
  { value: "coordenador_rs",  label: "Coordenador R&S"  },
  { value: "gestor_rs",       label: "Gestor R&S"       },
];

/* ═══════════════════════════════════════════════
   AVATAR
═══════════════════════════════════════════════ */
function Avatar({ nome, perfil, size = 38 }) {
  const cor = perfilCor(perfil);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: cor.avatar,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
      fontSize: size * 0.38, fontWeight: 800, color: "#fff",
      letterSpacing: "-.02em",
    }}>
      {iniciais(nome)}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   TOGGLE ATIVO
═══════════════════════════════════════════════ */
function ToggleAtivo({ ativo, onChange, loading }) {
  const isAtivo = String(ativo) === "1";
  return (
    <button
      onClick={onChange}
      disabled={loading}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "5px 12px", borderRadius: 999, cursor: loading ? "wait" : "pointer",
        border: `1.5px solid ${isAtivo ? "#86efac" : "#fca5a5"}`,
        background: isAtivo ? colors.successLight : colors.dangerLight,
        color: isAtivo ? colors.successText : colors.dangerText,
        fontWeight: 800, fontSize: 12, transition: "all .15s",
        opacity: loading ? .6 : 1,
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: isAtivo ? colors.success : colors.danger,
        flexShrink: 0,
      }} />
      {isAtivo ? "Ativo" : "Inativo"}
    </button>
  );
}

/* ═══════════════════════════════════════════════
   BARRA DE DISTRIBUIÇÃO DE PERFIS
═══════════════════════════════════════════════ */
function BarraDistribuicao({ usuarios }) {
  const total = usuarios.length || 1;
  const grupos = PERFIL_OPTIONS.map((p) => ({
    ...p,
    count: usuarios.filter((u) => String(u.perfil || "").toLowerCase() === p.value).length,
    cor: perfilCor(p.value),
  })).filter((g) => g.count > 0);

  return (
    <div style={barraWrap}>
      <div style={barraTitulo}>Distribuição por perfil</div>
      <div style={barraTrack}>
        {grupos.map((g) => (
          <div
            key={g.value}
            title={`${g.label}: ${g.count}`}
            style={{
              flex: g.count, minWidth: 6, height: "100%",
              background: g.cor.avatar,
              transition: "flex .3s",
            }}
          />
        ))}
      </div>
      <div style={barraLegenda}>
        {grupos.map((g) => (
          <span key={g.value} style={barraLegendaItem}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.cor.avatar, flexShrink: 0 }} />
            {g.label} ({g.count})
          </span>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PAINEL DE ALERTAS
═══════════════════════════════════════════════ */
function PainelAlertas({ kpis, onFiltrar }) {
  const alertas = [];

  if (kpis.semOperacao > 0)
    alertas.push({
      icon: "⚠️", cor: colors.warningLight, borda: "#fed7aa",
      titulo: `${kpis.semOperacao} usuário${kpis.semOperacao !== 1 ? "s" : ""} sem operação`,
      desc: "Usuários sem operação vinculada não conseguem filtrar por cliente.",
      acao: "Filtrar", onClick: () => onFiltrar("sem-operacao"),
    });

  if (kpis.inativos > 0)
    alertas.push({
      icon: "🔴", cor: colors.dangerLight, borda: "#fca5a5",
      titulo: `${kpis.inativos} conta${kpis.inativos !== 1 ? "s" : ""} inativa${kpis.inativos !== 1 ? "s" : ""}`,
      desc: "Usuários inativos não conseguem fazer login no portal.",
      acao: "Ver inativos", onClick: () => onFiltrar("inativos"),
    });

  if (kpis.multiOperacao > 0)
    alertas.push({
      icon: "🔗", cor: "#eff6ff", borda: "#bfdbfe",
      titulo: `${kpis.multiOperacao} usuário${kpis.multiOperacao !== 1 ? "s" : ""} multioperação`,
      desc: "Esses usuários enxergam dados de múltiplas operações.",
      acao: null, onClick: null,
    });

  if (alertas.length === 0)
    alertas.push({
      icon: "✅", cor: colors.successLight, borda: "#bbf7d0",
      titulo: "Base organizada",
      desc: "Nenhuma pendência crítica encontrada nos usuários cadastrados.",
      acao: null, onClick: null,
    });

  return (
    <div style={alertasWrap}>
      {alertas.map((a, i) => (
        <div key={i} style={{ ...alertaCard, background: a.cor, border: `1px solid ${a.borda}` }}>
          <span style={alertaIcon}>{a.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={alertaTitulo}>{a.titulo}</div>
            <div style={alertaDesc}>{a.desc}</div>
          </div>
          {a.acao && (
            <button style={alertaBtn} onClick={a.onClick}>{a.acao}</button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MODAL CRIAR / EDITAR
═══════════════════════════════════════════════ */
function emptyForm() {
  return {
    nome: "", email: "", senha: "", perfil: "", cliente: "",
    ativo: "1", troca_senha_obrigatoria: "1",
  };
}

function ModalUsuario({ modo, usuario, clientes, onSalvar, onFechar }) {
  const [form,     setForm]     = useState(() => modo === "editar" && usuario
    ? { ...emptyForm(), ...usuario,
        ativo: String(usuario.ativo ?? "1"),
        troca_senha_obrigatoria: String(usuario.troca_senha_obrigatoria ?? "1"),
        senha: "",
      }
    : emptyForm()
  );
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");

  function campo(k) { return (e) => setForm((p) => ({ ...p, [k]: e.target.value })); }

  async function salvar() {
    try {
      setSalvando(true); setErro("");
      if (!form.nome || !form.email || !form.perfil)
        throw new Error("Nome, e-mail e perfil são obrigatórios.");
      if (modo === "criar" && !form.senha)
        throw new Error("Senha é obrigatória para novos usuários.");

      const payload = {
        nome:    form.nome,
        email:   form.email,
        perfil:  form.perfil,
        cliente: form.cliente || "",
        ativo:   Number(form.ativo),
        troca_senha_obrigatoria: Number(form.troca_senha_obrigatoria),
      };
      if (form.senha) payload.senha = form.senha;

      if (modo === "editar") {
        await apiFetch(`/usuarios/${usuario.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/usuarios", { method: "POST", body: JSON.stringify(payload) });
      }
      onSalvar();
    } catch (e) {
      setErro(e.message || "Erro ao salvar usuário.");
    } finally {
      setSalvando(false);
    }
  }

  const clientesOptions = clientes.map((c) => c.nome || c).filter(Boolean).sort();

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div style={modal}>
        <div style={modalHeader}>
          <div>
            <div style={modalTitulo}>
              {modo === "criar" ? "Novo usuário" : `Editar — ${usuario?.nome}`}
            </div>
            <div style={modalSub}>
              {modo === "editar" ? "Deixe a senha em branco para mantê-la." : "Preencha todos os campos obrigatórios."}
            </div>
          </div>
          <button style={btnFechar} onClick={onFechar}>✕</button>
        </div>

        {erro && <div style={errBox}>{erro}</div>}

        <div style={modalGrid}>
          <MField label="Nome *" full>
            <input value={form.nome} onChange={campo("nome")} style={mInput} placeholder="Nome completo" />
          </MField>
          <MField label="E-mail *">
            <input type="email" value={form.email} onChange={campo("email")} style={mInput} placeholder="email@empresa.com" />
          </MField>
          <MField label={modo === "criar" ? "Senha *" : "Nova senha (opcional)"}>
            <input type="password" value={form.senha} onChange={campo("senha")} style={mInput} placeholder={modo === "criar" ? "Senha de acesso" : "Em branco = manter"} />
          </MField>
          <MField label="Perfil *">
            <select value={form.perfil} onChange={campo("perfil")} style={mInput}>
              <option value="">Selecione…</option>
              {PERFIL_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </MField>

          <MField label="Operações vinculadas" full>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {normalizarClientes(form.cliente).map((c) => (
                <span key={c} style={chipRemovivel}>
                  {c}
                  <button style={btnChipRemove} onClick={() => {
                    const lista = normalizarClientes(form.cliente).filter((x) => x !== c);
                    setForm((p) => ({ ...p, cliente: lista.join(", ") }));
                  }}>✕</button>
                </span>
              ))}
            </div>
            <select
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                const lista = normalizarClientes(form.cliente);
                if (!lista.includes(val)) setForm((p) => ({ ...p, cliente: [...lista, val].join(", ") }));
              }}
              style={mInput}
            >
              <option value="">Adicionar operação…</option>
              {clientesOptions.filter((c) => !normalizarClientes(form.cliente).includes(c)).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </MField>

          <MField label="Status">
            <select value={form.ativo} onChange={campo("ativo")} style={mInput}>
              <option value="1">Ativo</option>
              <option value="0">Inativo</option>
            </select>
          </MField>
          <MField label="Troca de senha obrigatória">
            <select value={form.troca_senha_obrigatoria} onChange={campo("troca_senha_obrigatoria")} style={mInput}>
              <option value="1">Sim</option>
              <option value="0">Não</option>
            </select>
          </MField>
        </div>

        <div style={modalFooter}>
          <button style={btnCancelar} onClick={onFechar}>Cancelar</button>
          <button style={btnSalvar} onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : modo === "criar" ? "Criar usuário" : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MField({ label, children, full = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: full ? "1 / -1" : "auto" }}>
      <span style={mLabel}>{label}</span>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PÁGINA PRINCIPAL
═══════════════════════════════════════════════ */
export default function UsuariosPage() {
  const [usuarios,   setUsuarios]   = useState([]);
  const [clientes,   setClientes]   = useState([]);
  const [vinculos,   setVinculos]   = useState(new Map());
  const [loading,    setLoading]    = useState(true);
  const [erro,       setErro]       = useState("");
  const [toggling,   setToggling]   = useState(new Set());

  const [busca,       setBusca]       = useState("");
  const [filtroPerfil,setFiltroPerfil]= useState("todos");
  const [filtroExtra, setFiltroExtra] = useState(null); // "inativos" | "sem-operacao"

  const [modal,   setModal]   = useState(null);  // null | { modo: "criar"|"editar", usuario? }
  const [excluindo, setExcluindo] = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try {
      setLoading(true); setErro("");
      const [usuariosData, clientesData, treinamentosData] = await Promise.all([
        apiFetch("/usuarios").catch(() => []),
        apiFetch("/clientes").catch(() => []),
        apiFetch("/treinamentos").catch(() => []),
      ]);

      const listaU = Array.isArray(usuariosData)     ? usuariosData     : [];
      const listaT = Array.isArray(treinamentosData) ? treinamentosData : [];
      setUsuarios(listaU);
      setClientes(Array.isArray(clientesData) ? clientesData : []);

      // Vínculo instrutor — client-side, sem N+1
      const mapa = new Map();
      listaU.filter((u) => String(u.perfil).toLowerCase() === "instrutor").forEach((u) => {
        const nome = String(u.nome || "").trim().toLowerCase();
        const turmas = listaT.filter((t) => String(t.instrutor || "").trim().toLowerCase() === nome);
        if (turmas.length) {
          const label = turmas.slice(0, 2).map((t) => t.tema).join(", ")
            + (turmas.length > 2 ? ` +${turmas.length - 2}` : "");
          mapa.set(u.id, label);
        }
      });
      setVinculos(mapa);
    } catch (e) {
      setErro(e.message || "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  /* ── toggle ativo ── */
  async function toggleAtivo(item) {
    const novoAtivo = String(item.ativo) === "1" ? 0 : 1;
    setToggling((s) => new Set(s).add(item.id));
    try {
      await apiFetch(`/usuarios/${item.id}`, {
        method: "PUT", body: JSON.stringify({ ativo: novoAtivo }),
      });
      setUsuarios((prev) =>
        prev.map((u) => u.id === item.id ? { ...u, ativo: novoAtivo } : u)
      );
    } catch (e) { setErro(e.message || "Erro ao alterar status."); }
    finally { setToggling((s) => { const n = new Set(s); n.delete(item.id); return n; }); }
  }

  /* ── excluir ── */
  async function excluir(id) {
    try {
      await apiFetch(`/usuarios/${id}`, { method: "DELETE" });
      setUsuarios((prev) => prev.filter((u) => u.id !== id));
      setExcluindo(null);
    } catch (e) { setErro(e.message || "Erro ao excluir."); }
  }

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const total       = usuarios.length;
    const ativos      = usuarios.filter((u) => String(u.ativo) === "1").length;
    const inativos    = total - ativos;
    const semOperacao = usuarios.filter((u) => normalizarClientes(u.cliente).length === 0).length;
    const multiOp     = usuarios.filter((u) => normalizarClientes(u.cliente).length > 1).length;
    const metodologia = usuarios.filter((u) => String(u.perfil || "").toLowerCase() === "metodologia").length;
    return { total, ativos, inativos, semOperacao, multiOperacao: multiOp, metodologia };
  }, [usuarios]);

  /* ── lista filtrada ── */
  const listaFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return usuarios.filter((u) => {
      const okPerfil = filtroPerfil === "todos"
        || String(u.perfil || "").toLowerCase() === filtroPerfil;
      const okExtra = !filtroExtra
        || (filtroExtra === "inativos"     && String(u.ativo) !== "1")
        || (filtroExtra === "sem-operacao" && normalizarClientes(u.cliente).length === 0);
      const okBusca = !termo
        || [u.nome, u.email, u.perfil].join(" ").toLowerCase().includes(termo);
      return okPerfil && okExtra && okBusca;
    });
  }, [usuarios, filtroPerfil, filtroExtra, busca]);

  function onFiltrar(tipo) {
    setFiltroExtra((prev) => prev === tipo ? null : tipo);
    setFiltroPerfil("todos");
  }

  /* ── pills de perfil ── */
  const perfilPills = useMemo(() => {
    const counts = {};
    usuarios.forEach((u) => {
      const p = String(u.perfil || "").toLowerCase();
      counts[p] = (counts[p] || 0) + 1;
    });
    return [
      { key: "todos", label: `Todos (${usuarios.length})`, cor: "#64748b" },
      ...PERFIL_OPTIONS
        .filter((p) => counts[p.value] > 0)
        .map((p) => ({
          key:   p.value,
          label: `${PERFIL_LABEL[p.value] || p.label} (${counts[p.value]})`,
          cor:   perfilCor(p.value).avatar,
        })),
    ];
  }, [usuarios]);

  return (
    <PortalShell>
      <div style={{ marginBottom: 20 }}>
        <PageHero eyebrow="Governança" title="Usuários"
          subtitle="Gestão de acessos, perfis e operações vinculadas." />
      </div>

      {erro && <div style={errorBox}>{erro}</div>}

      {/* ── KPIs ── */}
      <div style={kpiGrid}>
        <StatCard title="Total"    value={fmt(kpis.total)}   subtitle="usuários cadastrados" accent={chart.blue}    />
        <StatCard title="Ativos"   value={fmt(kpis.ativos)}  subtitle="com acesso liberado"  accent={colors.success} />
        <StatCard title="Inativos" value={fmt(kpis.inativos)}
          subtitle="sem acesso" accent={kpis.inativos > 0 ? colors.danger : colors.neutral} />
        <StatCard title="Metodologia" value={fmt(kpis.metodologia)}  subtitle="acesso ao módulo"      accent={chart.cyan}    />
      </div>

      {/* ── Barra de distribuição ── */}
      <BarraDistribuicao usuarios={usuarios} />

      {/* ── Painel de alertas ── */}
      <PainelAlertas kpis={kpis} onFiltrar={onFiltrar} />

      {/* ── Pills de perfil ── */}
      <div style={pillRow}>
        {perfilPills.map(({ key, label, cor }) => {
          const ativo = filtroPerfil === key && !filtroExtra;
          return (
            <button key={key} onClick={() => { setFiltroPerfil(key); setFiltroExtra(null); }}
              style={{
                ...pill,
                background:   ativo ? cor : "#fff",
                color:        ativo ? "#fff" : "#475569",
                border:       `1.5px solid ${ativo ? cor : "#e2e8f0"}`,
                fontWeight:   ativo ? 800 : 600,
              }}>
              {label}
            </button>
          );
        })}
        {filtroExtra && (
          <button onClick={() => setFiltroExtra(null)} style={{ ...pill, background: colors.warningLight, color: colors.warningText, border: `1.5px solid #fed7aa` }}>
            ✕ {filtroExtra === "inativos" ? "Inativos" : "Sem operação"}
          </button>
        )}
      </div>

      {/* ── Barra de controle ── */}
      <div style={controlBar}>
        <div style={{ position: "relative", flex: 1, maxWidth: 340 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8"
            strokeWidth="2.2" strokeLinecap="round"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail ou perfil…"
            style={{ ...searchInput, paddingLeft: 32 }} />
        </div>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>
          {listaFiltrada.length} de {usuarios.length}
        </span>
        <button style={btnNovoUsuario} onClick={() => setModal({ modo: "criar" })}>
          + Novo usuário
        </button>
      </div>

      {/* ── Tabela ── */}
      {loading ? (
        <div style={loadingBox}>Carregando usuários…</div>
      ) : (
        <div style={tabelaCard}>
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  {["Usuário","Perfil","Operações","Vínculo","Status",""].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.length === 0 ? (
                  <tr><td colSpan={6} style={tdVazio}>
                    {busca || filtroExtra || filtroPerfil !== "todos"
                      ? "Nenhum usuário encontrado para os filtros aplicados."
                      : "Nenhum usuário cadastrado."}
                  </td></tr>
                ) : (
                  listaFiltrada.map((u) => {
                    const clientes = normalizarClientes(u.cliente);
                    const vinculo  = vinculos.get(u.id);
                    return (
                      <tr key={u.id} style={trHover}>
                        {/* Usuário */}
                        <td style={td}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Avatar nome={u.nome} perfil={u.perfil} />
                            <div>
                              <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>{u.nome}</div>
                              <div style={{ fontSize: 12, color: "#64748b" }}>{u.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Perfil */}
                        <td style={td}>
                          <span style={{
                            ...badgeBase,
                            background: perfilCor(u.perfil).bg,
                            color: perfilCor(u.perfil).text,
                          }}>
                            {PERFIL_LABEL[String(u.perfil).toLowerCase()] || u.perfil || "—"}
                          </span>
                        </td>

                        {/* Operações */}
                        <td style={td}>
                          {clientes.length ? (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {clientes.map((c) => (
                                <span key={c} style={chipOp}>{c}</span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: "#94a3b8" }}>Sem operação</span>
                          )}
                        </td>

                        {/* Vínculo */}
                        <td style={td}>
                          <span style={{ fontSize: 12, color: vinculo ? "#334155" : "#cbd5e1" }}>
                            {vinculo || "—"}
                          </span>
                        </td>

                        {/* Toggle ativo */}
                        <td style={td}>
                          <ToggleAtivo
                            ativo={u.ativo}
                            loading={toggling.has(u.id)}
                            onChange={() => toggleAtivo(u)}
                          />
                        </td>

                        {/* Ações */}
                        <td style={{ ...td, textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={btnAcao(colors.primaryLight, colors.primary)}
                              onClick={() => setModal({ modo: "editar", usuario: u })}>
                              Editar
                            </button>
                            {excluindo === u.id ? (
                              <>
                                <button style={btnAcao(colors.dangerLight, colors.dangerText)}
                                  onClick={() => excluir(u.id)}>
                                  Confirmar
                                </button>
                                <button style={btnAcao("#f1f5f9","#64748b")}
                                  onClick={() => setExcluindo(null)}>
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <button style={btnAcao(colors.dangerLight, colors.dangerText)}
                                onClick={() => setExcluindo(u.id)}>
                                Excluir
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal criar/editar ── */}
      {modal && (
        <ModalUsuario
          modo={modal.modo}
          usuario={modal.usuario}
          clientes={clientes}
          onSalvar={() => { setModal(null); carregar(); }}
          onFechar={() => setModal(null)}
        />
      )}
    </PortalShell>
  );
}

/* ── Estilos ────────────────────────────── */
const errorBox = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14 };
const loadingBox = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: 16, color: "#64748b", fontSize: 13 };

const kpiGrid = { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 14 };

/* Barra de distribuição */
const barraWrap    = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, padding: "14px 16px", marginBottom: 14 };
const barraTitulo  = { fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 };
const barraTrack   = { display: "flex", height: 10, borderRadius: 999, overflow: "hidden", gap: 2, marginBottom: 10 };
const barraLegenda = { display: "flex", gap: 12, flexWrap: "wrap" };
const barraLegendaItem = { display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748b", fontWeight: 600 };

/* Alertas */
const alertasWrap  = { display: "grid", gap: 8, marginBottom: 14 };
const alertaCard   = { display: "flex", alignItems: "center", gap: 12, borderRadius: 12, padding: "12px 14px" };
const alertaIcon   = { fontSize: 18, flexShrink: 0 };
const alertaTitulo = { fontSize: 13, fontWeight: 800, color: "#0f172a" };
const alertaDesc   = { fontSize: 12, color: "#64748b", marginTop: 2 };
const alertaBtn    = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#334155", flexShrink: 0 };

/* Pills */
const pillRow = { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 };
const pill    = { padding: "5px 13px", borderRadius: 999, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" };

/* Barra de controle */
const controlBar = { display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" };
const searchInput = { height: 38, width: "100%", borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: 13, color: "#334155", outline: "none", paddingRight: 10, boxSizing: "border-box" };
const btnNovoUsuario = { height: 38, padding: "0 18px", borderRadius: 10, border: 0, background: colors.accent, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", marginLeft: "auto", whiteSpace: "nowrap", boxShadow: `0 4px 12px rgba(217,119,6,.25)` };

/* Tabela */
const tabelaCard = { background: "#fff", border: "1px solid #e9eef4", borderRadius: 14, overflow: "hidden" };
const tableWrap  = { overflowX: "auto" };
const table      = { width: "100%", borderCollapse: "collapse" };
const th         = { textAlign: "left", padding: "10px 14px", borderBottom: "1px solid #f1f5f9", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap", background: "#fafafa" };
const td         = { padding: "12px 14px", borderBottom: "1px solid #f8fafc", verticalAlign: "middle" };
const tdVazio    = { padding: "28px 14px", textAlign: "center", color: "#94a3b8", fontSize: 13 };
const trHover    = { transition: "background .1s" };

const badgeBase  = { display: "inline-block", padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800 };
const chipOp     = { background: colors.primaryLight, color: colors.primary, border: `1px solid ${colors.primary}55`, borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 700 };
const btnAcao    = (bg, cor) => ({ background: bg, color: cor, border: 0, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" });

/* Modal */
const overlay    = { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 };
const modal      = { background: "#fff", borderRadius: 20, padding: 24, width: "100%", maxWidth: 620, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.18)" };
const modalHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 };
const modalTitulo = { fontSize: 18, fontWeight: 800, color: "#0f172a" };
const modalSub    = { fontSize: 13, color: "#64748b", marginTop: 3 };
const btnFechar   = { background: "#f1f5f9", border: 0, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 14, color: "#64748b", fontWeight: 700 };
const modalGrid   = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 };
const modalFooter = { display: "flex", gap: 10, justifyContent: "flex-end" };
const mLabel      = { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".04em" };
const mInput      = { height: 38, borderRadius: 10, border: "1px solid #e2e8f0", padding: "0 10px", fontSize: 13, color: "#334155", outline: "none", width: "100%", boxSizing: "border-box" };
const errBox      = { background: colors.dangerLight, color: colors.dangerText, border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 14 };
const btnSalvar   = { background: colors.accent, color: "#fff", border: 0, borderRadius: 10, padding: "10px 22px", cursor: "pointer", fontWeight: 800, fontSize: 14 };
const btnCancelar = { background: "#f8fafc", color: "#64748b", border: "1px solid #e9eef4", borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontWeight: 600, fontSize: 14 };
const chipRemovivel = { display: "inline-flex", alignItems: "center", gap: 5, background: colors.primaryLight, color: colors.primary, border: `1px solid ${colors.primary}55`, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700 };
const btnChipRemove = { background: "none", border: "none", cursor: "pointer", color: colors.primary, fontWeight: 900, fontSize: 11, padding: 0, lineHeight: 1 };
