"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getStoredUser, hasSomeRole } from "../../services/api";
import { colors, chart } from "../../lib/theme";
import PortalShell from "../../components/PortalShell";
import PageHero from "../../components/PageHero";
import StatCard from "../../components/StatCard";

const EMPTY_FORM = {
  tema: "",
  cliente: "",
  necessidade_id: "",
  instrutor: "",
  supervisor: "",
  publico: "",
  carga_horaria: "",
  participantes: "",
  status: "planejado",
  data_inicio: "",
  data_fim: "",
  modalidade: "",
  sala: "",
  descricao: "",
};

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function parseHoras(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).replace(",", ".").trim();
  const match = text.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

function parseDateOnly(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  const parts = text.split("-");
  if (parts.length === 3) {
    const [ano, mes, dia] = parts.map(Number);
    const date = new Date(ano, mes - 1, dia);
    date.setHours(0, 0, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(value) {
  if (!value) return "—";
  const text = String(value).slice(0, 10);
  const parts = text.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value);
}

function normalizeStatus(status) {
  const key = String(status || "").trim().toLowerCase();
  if (["concluido", "concluída", "concluida", "finalizado", "finalizada"].includes(key)) return "concluido";
  if (["em_andamento", "em andamento", "andamento", "ativo", "ativa"].includes(key)) return "em_andamento";
  if (["cancelada", "cancelado"].includes(key)) return "cancelada";
  return "planejado";
}

function getStatus(item) {
  const current = normalizeStatus(item?.status);
  if (current === "cancelada" || current === "concluido") return current;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inicio = parseDateOnly(item?.data_inicio || item?.data);
  const fim = parseDateOnly(item?.data_fim);
  if (fim && fim < today) return "concluido";
  if (inicio && inicio <= today) return "em_andamento";
  return current;
}

const STATUS = {
  planejado: { label: "Planejada", icon: "◷", bg: "#eef2ff", color: "#4338ca" },
  em_andamento: { label: "Em andamento", icon: "●", bg: "#ecfdf5", color: "#047857" },
  concluido: { label: "Concluída", icon: "✓", bg: "#f0fdf4", color: "#15803d" },
  cancelada: { label: "Cancelada", icon: "×", bg: "#fef2f2", color: "#b91c1c" },
};

function parseClientes(value) {
  if (!value) return [];
  return String(value).split(",").map((x) => x.trim()).filter(Boolean);
}

function isGlobalUser(cliente) {
  return parseClientes(cliente).some((x) => x.toLowerCase() === "global");
}

function temClienteEmComum(a, b) {
  const A = parseClientes(a).map((x) => x.toLowerCase());
  const B = parseClientes(b).map((x) => x.toLowerCase());
  if (A.includes("global") || B.includes("global")) return true;
  return A.some((x) => B.includes(x));
}

function usuarioLabel(user) {
  const clientes = parseClientes(user.cliente);
  if (!clientes.length) return user.nome;
  if (clientes.length === 1) return `${user.nome} • ${clientes[0]}`;
  if (isGlobalUser(user.cliente)) return `${user.nome} • Global`;
  return `${user.nome} • ${clientes.length} operações`;
}

function parseMetadata(descricao) {
  const text = String(descricao || "");
  return {
    modalidade: text.match(/\[modalidade:([^\]]+)\]/i)?.[1]?.trim() || "",
    sala: text.match(/\[sala:([^\]]*)\]/i)?.[1]?.trim() || "",
    descricao: text.replace(/\[modalidade:[^\]]+\]\s*/gi, "").replace(/\[sala:[^\]]*\]\s*/gi, "").trim(),
  };
}

function buildDescricao(form) {
  const parts = [];
  if (form.modalidade) parts.push(`[modalidade:${form.modalidade}]`);
  if (form.sala) parts.push(`[sala:${form.sala}]`);
  if (form.descricao) parts.push(String(form.descricao).trim());
  return parts.join(" ").trim();
}

function normalizeNecessidades(data) {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.itens) ? data.itens : [];
}

function Modal({ children, onClose, title, subtitle }) {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div style={modalBackdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalBox} role="dialog" aria-modal="true">
        <div style={modalHeader}>
          <div>
            <div style={modalEyebrow}>Portal T&D · Turmas</div>
            <h2 style={modalTitle}>{title}</h2>
            {subtitle && <p style={modalSubtitle}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} style={closeButton} aria-label="Fechar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children, hint, error }) {
  return (
    <label style={fieldWrap}>
      <span style={fieldLabel}>{label} {required && <b style={{ color: "#dc2626" }}>*</b>}</span>
      {children}
      {hint && !error && <span style={fieldHint}>{hint}</span>}
      {error && <span style={fieldError}>{error}</span>}
    </label>
  );
}

function Input({ value, onChange, ...props }) {
  return <input {...props} value={value ?? ""} onChange={onChange} style={inputStyle} />;
}

function Select({ value, onChange, options, placeholder, ...props }) {
  return (
    <select {...props} value={value ?? ""} onChange={onChange} style={inputStyle}>
      <option value="">{placeholder || "Selecione..."}</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function TurmaCard({ item, necessidade, resumo, canEdit, canDelete, onEdit, onDelete }) {
  const statusCode = resumo?.status_turma
    ? normalizeStatus(resumo.status_turma)
    : getStatus(item);
  const status = STATUS[statusCode] || STATUS.planejado;
  const meta = parseMetadata(item.descricao);
  const inicio = item.data_inicio || item.data;
  const fim = item.data_fim;
  const confirmados = resumo ? Number(resumo.treinandos_confirmados || 0) : 0;
  const previstos = Number(item.participantes || item.participantes_previstos || 0);
  const progresso = previstos > 0 ? Math.min(100, Math.round((confirmados / previstos) * 100)) : 0;

  return (
    <article style={card}>
      <div style={cardTop}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <div style={clientMark}>{String(item.cliente || "T").slice(0, 1).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div style={clientName}>{item.cliente || "Sem cliente"}</div>
            <h3 style={cardTitle}>{item.tema || item.titulo || "Turma sem título"}</h3>
          </div>
        </div>
        <span style={{ ...statusBadge, background: status.bg, color: status.color }}>
          {status.icon} {status.label}
        </span>
      </div>

      <div style={needLine}>
        <div style={{ minWidth: 0 }}>
          <span style={needCaption}>Necessidade</span>
          <strong style={needText}>{necessidade?.tema || "Necessidade não vinculada"}</strong>
        </div>
      </div>

      <div style={metricsRow}>
        <div><span style={metricLabel}>Período</span><strong>{formatDate(inicio)}{fim ? ` → ${formatDate(fim)}` : ""}</strong></div>
        <div><span style={metricLabel}>Participantes</span><strong>{fmt(previstos)}{resumo ? ` · ${fmt(confirmados)} confirmados` : ""}</strong></div>
        <div><span style={metricLabel}>Carga</span><strong>{parseHoras(item.carga_horaria)}h</strong></div>
        <div><span style={metricLabel}>Formato</span><strong>{meta.modalidade === "presencial" ? "Presencial" : meta.modalidade === "online" ? "Online" : "—"}</strong></div>
      </div>

      {previstos > 0 && resumo && (
        <div style={{ marginTop: 14 }}>
          <div style={progressHeader}><span>Confirmação de participantes</span><b>{progresso}%</b></div>
          <div style={progressTrack}><div style={{ ...progressBar, width: `${progresso}%` }} /></div>
        </div>
      )}

      <div style={cardBottom}>
        <div style={ownerLine}>
          <span>{item.instrutor || "Sem instrutor"}</span>
          {meta.sala && <span>· {meta.sala}</span>}
          {item.supervisor && <span>· {item.supervisor}</span>}
        </div>
        <div style={cardActions}>
          {canEdit && <button type="button" style={ghostButton} onClick={() => onEdit(item)}>Editar</button>}
          {canDelete && <button type="button" style={dangerGhost} onClick={() => onDelete(item)}>Excluir</button>}
          <button type="button" style={primarySmall} onClick={() => { window.location.href = `/turma/${item.id}`; }}>Abrir turma →</button>
        </div>
      </div>
    </article>
  );
}

export default function TreinamentosPage() {
  const [turmas, setTurmas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [necessidades, setNecessidades] = useState([]);
  const [resumoPresenca, setResumoPresenca] = useState([]);
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todas");
  const [clientFilter, setClientFilter] = useState("todos");
  const [periodFilter, setPeriodFilter] = useState("todos");
  const [onlyMine, setOnlyMine] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});

  const perfil = String(usuario?.perfil || "").toLowerCase();
  const clienteLogado = usuario?.cliente || "";
  const nomeLogado = usuario?.nome || "";
  const global = isGlobalUser(clienteLogado);
  const canCreate = hasSomeRole(usuario, ["coordenador", "supervisor", "instrutor"]);
  const canEdit = hasSomeRole(usuario, ["coordenador", "supervisor", "instrutor"]);
  const canDelete = hasSomeRole(usuario, ["coordenador"]);
  const isInstructor = perfil === "instrutor";

  async function carregar() {
    try {
      setLoading(true);
      setError("");
      const [turmasData, usuariosData, clientesData, resumoData, necessidadesData] = await Promise.all([
        apiFetch("/treinamentos"),
        apiFetch("/usuarios").catch(() => []),
        apiFetch("/clientes").catch(() => []),
        apiFetch("/presenca-resumo").catch(() => null),
        apiFetch("/necessidades").catch(() => null),
      ]);
      setTurmas(Array.isArray(turmasData) ? turmasData : []);
      setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
      setClientes(Array.isArray(clientesData) ? clientesData : []);
      setResumoPresenca(Array.isArray(resumoData?.itens) ? resumoData.itens : []);
      setNecessidades(normalizeNecessidades(necessidadesData));
    } catch (err) {
      setError(err.message || "Não foi possível carregar as turmas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const stored = getStoredUser();
    setUsuario(stored);
    carregar();
  }, []);

  const resumoPorId = useMemo(() => new Map(resumoPresenca.map((x) => [Number(x.id), x])), [resumoPresenca]);
  const necessidadePorId = useMemo(() => new Map(necessidades.map((x) => [Number(x.id), x])), [necessidades]);

  const clientesOptions = useMemo(() => {
    const list = clientes.map((x) => x.nome).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (!isInstructor && perfil !== "supervisor") return list;
    return list.filter((x) => temClienteEmComum(x, clienteLogado));
  }, [clientes, isInstructor, perfil, clienteLogado]);

  const instrutores = useMemo(() => {
    let list = usuarios.filter((x) => String(x.perfil || "").toLowerCase() === "instrutor");
    if (isInstructor) list = list.filter((x) => x.nome === nomeLogado);
    else if (perfil === "supervisor" && !global) list = list.filter((x) => temClienteEmComum(x.cliente, clienteLogado));
    return list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [usuarios, isInstructor, nomeLogado, perfil, global, clienteLogado]);

  const supervisores = useMemo(() => {
    let list = usuarios.filter((x) => String(x.perfil || "").toLowerCase() === "supervisor");
    if (perfil === "instrutor" && !global) list = list.filter((x) => temClienteEmComum(x.cliente, clienteLogado));
    if (perfil === "supervisor" && !global) list = list.filter((x) => x.nome === nomeLogado);
    return list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [usuarios, perfil, global, clienteLogado, nomeLogado]);

  const necessidadesDisponiveis = useMemo(() => {
    return necessidades
      .filter((n) => n.status_calculado !== "atendida" && n.status_calculado !== "cancelada")
      .filter((n) => !form.cliente || temClienteEmComum(n.cliente, form.cliente))
      .sort((a, b) => String(a.tema || "").localeCompare(String(b.tema || ""), "pt-BR"));
  }, [necessidades, form.cliente]);

  const kpis = useMemo(() => {
    const base = isInstructor ? turmas.filter((x) => String(x.instrutor || "").toLowerCase() === nomeLogado.toLowerCase()) : turmas;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const andamento = base.filter((x) => getStatus(x) === "em_andamento").length;
    const proximas = base.filter((x) => {
      const d = parseDateOnly(x.data_inicio || x.data);
      return d && d >= hoje && d <= new Date(hoje.getTime() + 30 * 86400000);
    }).length;
    const concluidas = base.filter((x) => getStatus(x) === "concluido").length;
    const horasMes = base.filter((x) => {
      const d = parseDateOnly(x.data_inicio || x.data);
      return d && d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
    }).reduce((sum, x) => sum + parseHoras(x.carga_horaria), 0);
    const pendencias = base.filter((x) => !x.necessidade_id).length;
    const next = base.filter((x) => {
      const d = parseDateOnly(x.data_inicio || x.data);
      return d && d >= hoje && getStatus(x) !== "cancelada";
    }).sort((a, b) => parseDateOnly(a.data_inicio || a.data) - parseDateOnly(b.data_inicio || b.data))[0];
    return { base, andamento, proximas, concluidas, horasMes, pendencias, next };
  }, [turmas, isInstructor, nomeLogado]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const limite = new Date(hoje.getTime() + 30 * 86400000);
    return turmas.filter((item) => {
      if (onlyMine && String(item.instrutor || "").toLowerCase() !== nomeLogado.toLowerCase()) return false;
      if (statusFilter !== "todas" && getStatus(item) !== statusFilter) return false;
      if (clientFilter !== "todos" && String(item.cliente || "") !== clientFilter) return false;
      if (periodFilter !== "todos") {
        const d = parseDateOnly(item.data_inicio || item.data);
        if (!d) return false;
        if (periodFilter === "hoje" && d.getTime() !== hoje.getTime()) return false;
        if (periodFilter === "30dias" && (d < hoje || d > limite)) return false;
        if (periodFilter === "mes") {
          if (d.getMonth() !== hoje.getMonth() || d.getFullYear() !== hoje.getFullYear()) return false;
        }
      }
      if (!q) return true;
      const necessidade = necessidadePorId.get(Number(item.necessidade_id));
      const haystack = [item.tema, item.cliente, item.instrutor, item.supervisor, necessidade?.tema].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [turmas, search, statusFilter, clientFilter, periodFilter, onlyMine, nomeLogado, necessidadePorId]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, cliente: isInstructor && clientesOptions.length === 1 ? clientesOptions[0] : "", instrutor: isInstructor ? nomeLogado : "", supervisor: perfil === "supervisor" ? nomeLogado : "" });
    setFormErrors({}); setError(""); setSuccess(""); setModalOpen(true);
  }

  function openEdit(item) {
    if (!canEdit) return;
    const meta = parseMetadata(item.descricao);
    setEditingId(item.id);
    setForm({
      ...EMPTY_FORM,
      tema: item.tema || "",
      cliente: item.cliente || "",
      necessidade_id: item.necessidade_id ? String(item.necessidade_id) : "",
      instrutor: item.instrutor || "",
      supervisor: item.supervisor || "",
      publico: item.publico || "",
      carga_horaria: item.carga_horaria ?? "",
      participantes: item.participantes ?? item.participantes_previstos ?? "",
      status: normalizeStatus(item.status),
      data_inicio: String(item.data_inicio || item.data || "").slice(0, 10),
      data_fim: String(item.data_fim || "").slice(0, 10),
      modalidade: meta.modalidade || "",
      sala: meta.sala || "",
      descricao: meta.descricao || "",
    });
    setFormErrors({}); setError(""); setSuccess(""); setModalOpen(true);
  }

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
    setFormErrors((prev) => ({ ...prev, [name]: "" }));
    if (name === "cliente") setForm((prev) => ({ ...prev, cliente: value, necessidade_id: "" }));
  }

  function validate() {
    const errors = {};
    if (!form.tema.trim()) errors.tema = "Informe o nome da turma.";
    if (!form.cliente) errors.cliente = "Selecione o cliente.";
    if (!form.instrutor) errors.instrutor = "Selecione o instrutor.";
    if (!form.data_inicio) errors.data_inicio = "Informe a data de início.";
    if (!form.data_fim) errors.data_fim = "Informe a data de fim.";
    if (form.data_inicio && form.data_fim && form.data_fim < form.data_inicio) errors.data_fim = "A data final não pode ser anterior à inicial.";
    if (!form.modalidade) errors.modalidade = "Selecione a modalidade.";
    return errors;
  }

  async function save(event) {
    event.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length) { setFormErrors(errors); return; }
    try {
      setSaving(true); setError(""); setSuccess("");
      const payload = {
        tema: form.tema.trim(), cliente: form.cliente, necessidade_id: form.necessidade_id ? Number(form.necessidade_id) : null, instrutor: isInstructor ? nomeLogado : form.instrutor,
        supervisor: perfil === "supervisor" ? nomeLogado : form.supervisor, publico: form.publico, carga_horaria: form.carga_horaria,
        participantes: Number(form.participantes || 0), participantes_previstos: Number(form.participantes || 0), status: form.status || "planejado",
        data_inicio: form.data_inicio, data_fim: form.data_fim, data: form.data_inicio, descricao: buildDescricao(form),
      };
      if (editingId) await apiFetch(`/treinamentos/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      else await apiFetch("/treinamentos", { method: "POST", body: JSON.stringify(payload) });
      setSuccess(editingId ? "Turma atualizada com sucesso." : "Turma criada com sucesso.");
      setModalOpen(false);
      await carregar();
    } catch (err) {
      setError(err.message || "Não foi possível salvar a turma.");
    } finally { setSaving(false); }
  }

  async function deleteTurma(item) {
    if (!canDelete) return;
    if (!window.confirm(`Excluir a turma “${item.tema || "sem título"}”? Essa ação remove os dados relacionados.`)) return;
    try {
      setError("");
      await apiFetch(`/treinamentos/${item.id}`, { method: "DELETE" });
      setSuccess("Turma excluída com sucesso.");
      await carregar();
    } catch (err) { setError(err.message || "Não foi possível excluir a turma."); }
  }

  return (
    <PortalShell>
      <main style={page}>
      <div style={{ marginBottom: 20 }}>
        <PageHero
          eyebrow="Portal T&D · Operação"
          title="Gestão de Turmas"
          subtitle={isInstructor ? `Olá, ${nomeLogado || "instrutor"}. Aqui está o que precisa da sua atenção.` : "Planeje, acompanhe e organize as formações em um só lugar."}
        />
      </div>

      {error && <div style={alertError}>{error}</div>}
      {success && <div style={alertSuccess}>{success}</div>}

      <section style={kpiGrid}>
        <StatCard title={isInstructor ? "Minhas turmas" : "Turmas na base"} value={fmt(kpis.base.length)} subtitle={`${fmt(kpis.proximas)} próximas`} accent={chart.blue} />
        <StatCard title="Em andamento" value={fmt(kpis.andamento)} subtitle="Execuções ativas" accent={colors.success} />
        <StatCard title="Horas no mês" value={`${fmt(kpis.horasMes)}h`} subtitle={`${fmt(kpis.concluidas)} concluídas`} accent={chart.purple} />
        <StatCard title="Sem necessidade" value={fmt(kpis.pendencias)} subtitle={kpis.pendencias ? "Atenção necessária" : "Base consistente"} accent={kpis.pendencias ? colors.warning : colors.neutral} />
      </section>

      <section style={actionStrip}>
        <div>
          <span style={stripEyebrow}>PRÓXIMA TURMA</span>
          <strong style={stripTitle}>{kpis.next ? kpis.next.tema : "Nenhuma turma agendada"}</strong>
          {kpis.next && <span style={stripMeta}>{formatDate(kpis.next.data_inicio || kpis.next.data)} · {kpis.next.cliente || "Sem cliente"}</span>}
        </div>
        {kpis.next && <button type="button" style={stripButton} onClick={() => { window.location.href = `/turma/${kpis.next.id}`; }}>Abrir turma →</button>}
      </section>

      <section style={toolbarCard}>
        <div style={toolbarTop}>
          <div>
            <h2 style={sectionTitle}>Minhas turmas</h2>
            <p style={sectionSubtitle}>{filtered.length} resultado(s) · visão operacional</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={mineToggle(onlyMine)} onClick={() => setOnlyMine((v) => !v)}>{onlyMine ? "Somente minhas" : "Mostrar minhas"}</button>
            {canCreate && <button type="button" style={btnNovo} onClick={openCreate}>+ Criar nova turma</button>}
          </div>
        </div>
        <div style={filtersGrid}>
          <div style={searchWrap}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar turma, cliente ou necessidade..." style={searchInput} />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={[{ value: "todas", label: "Todos os status" }, ...Object.entries(STATUS).map(([value, x]) => ({ value, label: x.label }))]} />
          <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} options={[{ value: "todos", label: "Todos os clientes" }, ...clientesOptions.map((x) => ({ value: x, label: x }))]} />
          <Select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)} options={[{ value: "todos", label: "Qualquer período" }, { value: "hoje", label: "Hoje" }, { value: "30dias", label: "Próximos 30 dias" }, { value: "mes", label: "Este mês" }]} />
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        {loading ? <div style={emptyState}><div style={spinner} />Carregando suas turmas...</div> : filtered.length === 0 ? (
          <div style={emptyState}><div style={emptyIcon}>🎓</div><strong>Nenhuma turma encontrada</strong><span>Ajuste os filtros ou crie uma nova turma para começar.</span>{canCreate && <button type="button" style={createButtonSmall} onClick={openCreate}>+ Criar nova turma</button>}</div>
        ) : filtered.map((item) => <TurmaCard key={item.id} item={item} necessidade={necessidadePorId.get(Number(item.necessidade_id))} resumo={resumoPorId.get(Number(item.id))} canEdit={canEdit} canDelete={canDelete} onEdit={openEdit} onDelete={deleteTurma} />)}
      </section>

      {modalOpen && (
        <Modal title={editingId ? "Editar turma" : "Criar nova turma"} subtitle="Preencha os dados essenciais. A necessidade pode ser vinculada agora ou posteriormente." onClose={() => !saving && setModalOpen(false)}>
          <form onSubmit={save}>
            <div style={optionalNotice}><span style={noticeIcon}>🎯</span><div><strong>Necessidade de treinamento <span style={{ fontWeight: 500, color: colors.textMuted }}>(opcional)</span></strong><span>Se houver uma necessidade formal, você pode vinculá-la agora. A turma também pode ser criada sem esse vínculo.</span></div></div>
            <div style={formGrid}>
              <Field label="Necessidade (opcional)" hint="Você pode vincular uma necessidade agora ou deixar para depois.">
                <Select value={form.necessidade_id} onChange={(e) => setField("necessidade_id", e.target.value)} options={necessidadesDisponiveis.map((n) => ({ value: String(n.id), label: `${n.cliente} — ${n.tema} · ${n.horas_atendidas || 0}h / ${n.horas_necessarias || "?"}h` }))} placeholder="Nenhuma necessidade selecionada" />
              </Field>
              <Field label="Turma / treinamento" required error={formErrors.tema}><Input value={form.tema} onChange={(e) => setField("tema", e.target.value)} placeholder="Ex.: Reciclagem de Crédito" /></Field>
              <Field label="Cliente" required error={formErrors.cliente}><Select value={form.cliente} onChange={(e) => setField("cliente", e.target.value)} options={clientesOptions.map((x) => ({ value: x, label: x }))} placeholder="Selecione o cliente" /></Field>
              <Field label="Público"><Input value={form.publico} onChange={(e) => setField("publico", e.target.value)} placeholder="Ex.: Operação, onboarding, reciclagem" /></Field>
              <Field label="Instrutor" required error={formErrors.instrutor}><Select value={form.instrutor} disabled={isInstructor} onChange={(e) => setField("instrutor", e.target.value)} options={instrutores.map((x) => ({ value: x.nome, label: usuarioLabel(x) }))} placeholder="Selecione o instrutor" /></Field>
              <Field label="Supervisor"><Select value={form.supervisor} disabled={perfil === "supervisor"} onChange={(e) => setField("supervisor", e.target.value)} options={supervisores.map((x) => ({ value: x.nome, label: usuarioLabel(x) }))} placeholder="Selecione o supervisor" /></Field>
              <Field label="Carga horária"><Input value={form.carga_horaria} onChange={(e) => setField("carga_horaria", e.target.value)} placeholder="Ex.: 20h" /></Field>
              <Field label="Treinandos previstos"><Input type="number" min="0" value={form.participantes} onChange={(e) => setField("participantes", e.target.value)} placeholder="Quantidade prevista" /></Field>
              <Field label="Data de início" required error={formErrors.data_inicio}><Input type="date" value={form.data_inicio} onChange={(e) => setField("data_inicio", e.target.value)} /></Field>
              <Field label="Data de fim" required error={formErrors.data_fim}><Input type="date" value={form.data_fim} onChange={(e) => setField("data_fim", e.target.value)} /></Field>
              <Field label="Modalidade" required error={formErrors.modalidade}><Select value={form.modalidade} onChange={(e) => setField("modalidade", e.target.value)} options={[{ value: "online", label: "Online" }, { value: "presencial", label: "Presencial" }]} placeholder="Selecione a modalidade" /></Field>
              <Field label="Sala"><Input value={form.sala} onChange={(e) => setField("sala", e.target.value)} placeholder="Ex.: Sala 01 / Lab 02" /></Field>
              <Field label="Status"><Select value={form.status} onChange={(e) => setField("status", e.target.value)} options={Object.entries(STATUS).map(([value, x]) => ({ value, label: x.label }))} placeholder="Selecione o status" /></Field>
              <Field label="Observações"><textarea value={form.descricao} onChange={(e) => setField("descricao", e.target.value)} placeholder="Informações complementares" style={{ ...inputStyle, minHeight: 92, resize: "vertical" }} /></Field>
            </div>
            <div style={modalFooter}><span style={requiredFooter}>A necessidade de treinamento é opcional.</span><div style={{ display: "flex", gap: 10 }}><button type="button" disabled={saving} style={secondaryButton} onClick={() => setModalOpen(false)}>Cancelar</button><button type="submit" disabled={saving} style={createButton}>{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar turma"}</button></div></div>
          </form>
        </Modal>
      )}
      </main>
    </PortalShell>
  );
}

const page = { minHeight: "100vh", padding: "28px clamp(18px, 3vw, 42px) 48px", maxWidth: 1500, margin: "0 auto", boxSizing: "border-box" };
const createButton = { border: 0, background: "#fff", color: "#1d4ed8", borderRadius: 12, padding: "12px 17px", fontWeight: 850, fontSize: 13, cursor: "pointer", boxShadow: "0 8px 20px rgba(0,0,0,.12)", whiteSpace: "nowrap" };
const createButtonSmall = { ...createButton, background: "#1d4ed8", color: "#fff", marginTop: 10 };
const btnNovo = { height: 36, padding: "0 16px", borderRadius: 10, border: 0, background: colors.accent, color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" };
const kpiGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, margin: "16px 0" };
const actionStrip = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "15px 18px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, marginBottom: 16 };
const stripEyebrow = { display: "block", fontSize: 10, fontWeight: 850, color: "#94a3b8", letterSpacing: ".08em" };
const stripTitle = { display: "block", marginTop: 3, fontSize: 14, color: "#0f172a" };
const stripMeta = { fontSize: 12, color: "#64748b", marginTop: 2, display: "block" };
const stripButton = { border: 0, background: "#eff6ff", color: "#1d4ed8", borderRadius: 10, padding: "9px 12px", fontWeight: 800, cursor: "pointer" };
const toolbarCard = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: 18, marginBottom: 14 };
const toolbarTop = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 15 };
const sectionTitle = { margin: 0, fontSize: 18, fontWeight: 850, color: "#0f172a", letterSpacing: "-.02em" };
const sectionSubtitle = { margin: "3px 0 0", color: "#94a3b8", fontSize: 12 };
const mineToggle = (active) => ({ border: `1px solid ${active ? "#bfdbfe" : "#e2e8f0"}`, background: active ? "#eff6ff" : "#fff", color: active ? "#1d4ed8" : "#475569", borderRadius: 10, padding: "8px 11px", fontWeight: 800, cursor: "pointer" });
const filtersGrid = { display: "grid", gridTemplateColumns: "minmax(240px,2fr) repeat(3,minmax(145px,1fr))", gap: 9 };
const searchWrap = { display: "flex", alignItems: "center", gap: 8, padding: "0 12px", height: 40, border: "1px solid #e2e8f0", borderRadius: 11, background: "#f8fafc", color: "#64748b" };
const searchInput = { width: "100%", border: 0, outline: 0, background: "transparent", fontSize: 13, color: "#0f172a" };
const card = { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 20, padding: "17px 19px", boxShadow: "0 5px 18px rgba(15,23,42,.035)" };
const cardTop = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 };
const clientMark = { width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", background: "#eef2ff", color: "#4338ca", fontWeight: 900, flexShrink: 0 };
const clientName = { fontSize: 10, fontWeight: 850, color: "#64748b", textTransform: "uppercase", letterSpacing: ".08em" };
const cardTitle = { margin: "3px 0 0", fontSize: 17, color: "#0f172a", letterSpacing: "-.02em" };
const statusBadge = { borderRadius: 999, padding: "6px 9px", fontSize: 11, fontWeight: 850, whiteSpace: "nowrap" };
const needLine = { display: "flex", gap: 9, alignItems: "center", marginTop: 14, padding: "10px 12px", borderRadius: 12, background: "#faf5ff", border: "1px solid #ede9fe" };
const needCaption = { display: "block", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em", color: "#8b5cf6" };
const needText = { display: "block", marginTop: 1, fontSize: 12, color: "#4c1d95" };
const metricsRow = { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 15 };
const metricLabel = { display: "block", fontSize: 10, color: "#94a3b8", marginBottom: 3 };
const progressHeader = { display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginBottom: 5 };
const progressTrack = { height: 5, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" };
const progressBar = { height: "100%", borderRadius: 999, background: "#2563eb" };
const cardBottom = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, paddingTop: 13, borderTop: "1px solid #f1f5f9" };
const ownerLine = { display: "flex", flexWrap: "wrap", gap: 7, color: "#64748b", fontSize: 11 };
const cardActions = { display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" };
const primarySmall = { border: 0, background: "#1d4ed8", color: "#fff", borderRadius: 9, padding: "8px 11px", fontWeight: 800, fontSize: 11, cursor: "pointer" };
const ghostButton = { border: "1px solid #e2e8f0", background: "#fff", color: "#475569", borderRadius: 9, padding: "8px 10px", fontWeight: 750, fontSize: 11, cursor: "pointer" };
const dangerGhost = { ...ghostButton, color: "#b91c1c", borderColor: "#fecaca" };
const emptyState = { display: "grid", placeItems: "center", gap: 7, minHeight: 260, background: "#fff", border: "1px dashed #cbd5e1", borderRadius: 20, color: "#64748b", textAlign: "center", padding: 24 };
const emptyIcon = { width: 52, height: 52, borderRadius: 16, display: "grid", placeItems: "center", background: "#eff6ff", fontSize: 23, marginBottom: 4 };
const spinner = { width: 22, height: 22, borderRadius: "50%", border: "3px solid #dbeafe", borderTopColor: "#2563eb", animation: "spin 1s linear infinite" };
const alertError = { margin: "12px 0", padding: "11px 13px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 12, fontWeight: 700 };
const alertSuccess = { margin: "12px 0", padding: "11px 13px", borderRadius: 12, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857", fontSize: 12, fontWeight: 700 };
const modalBackdrop = { position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", padding: 18, background: "rgba(15,23,42,.62)", backdropFilter: "blur(5px)" };
const modalBox = { width: "min(940px,100%)", maxHeight: "min(92vh,900px)", overflow: "auto", background: "#fff", borderRadius: 24, boxShadow: "0 30px 80px rgba(0,0,0,.28)" };
const modalHeader = { display: "flex", justifyContent: "space-between", gap: 16, padding: "22px 24px 17px", borderBottom: "1px solid #eef2f7", position: "sticky", top: 0, background: "rgba(255,255,255,.96)", backdropFilter: "blur(8px)", zIndex: 2 };
const modalEyebrow = { fontSize: 10, fontWeight: 850, color: "#6366f1", letterSpacing: ".1em", textTransform: "uppercase" };
const modalTitle = { margin: "3px 0 0", fontSize: 21, color: "#0f172a" };
const modalSubtitle = { margin: "4px 0 0", fontSize: 12, color: "#64748b" };
const closeButton = { width: 34, height: 34, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 22, lineHeight: 1, color: "#64748b", cursor: "pointer" };
const requiredNotice = { display: "flex", gap: 11, margin: "18px 24px 0", padding: "12px 13px", borderRadius: 13, background: "#f5f3ff", border: "1px solid #ddd6fe", color: "#4c1d95" };
const optionalNotice = { ...requiredNotice, background: '#f8fafc', border: `1px solid ${colors.border}` };
const noticeIcon = { width: 32, height: 32, borderRadius: 10, display: "grid", placeItems: "center", background: "#ede9fe", flexShrink: 0 };
const formGrid = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14, padding: 24 };
const fieldWrap = { display: "grid", gap: 6, minWidth: 0 };
const fieldLabel = { fontSize: 11, fontWeight: 800, color: "#334155" };
const fieldHint = { fontSize: 10, color: "#94a3b8", lineHeight: 1.4 };
const fieldError = { fontSize: 10, color: "#dc2626", fontWeight: 700 };
const inputStyle = { width: "100%", height: 40, boxSizing: "border-box", border: "1px solid #dbe2ea", borderRadius: 10, background: "#f8fafc", color: "#0f172a", padding: "0 11px", outline: "none", fontSize: 12.5 };
const modalFooter = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "15px 24px 20px", borderTop: "1px solid #eef2f7" };
const requiredFooter = { fontSize: 10, color: "#94a3b8" };
const secondaryButton = { border: "1px solid #dbe2ea", background: "#fff", color: "#475569", borderRadius: 10, padding: "10px 14px", fontWeight: 800, cursor: "pointer" };
