"use client";

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch, getStoredUser } from "../../services/api";

// --- Funções Auxiliares ---
function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = String(value).replace(",", ".").replace(/[^\d.-]/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseHoras(value) {
  if (!value) return 0;
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

function formatDateSafe(value) {
  if (!value) return "-";
  const text = String(value).slice(0, 10);
  const parts = text.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return String(value);
}

function isTruthy(value) {
  if (value === true) return true;
  const text = String(value || "").trim().toLowerCase();
  return ["1", "true", "sim", "yes", "ok", "concluido", "concluída", "concluida", "cumprido", "cumprida", "finalizado", "finalizada"].includes(text);
}

function pickFirstPositiveNumber(item, keys) {
  for (const key of keys) {
    const value = item?.[key];
    const parsed = toNumber(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function hasCompletedCalls(item) {
  if (!item || typeof item !== "object") return false;
  const done = pickFirstPositiveNumber(item, ["chamadas_realizadas", "chamadas_cumpridas", "presencas_realizadas", "aulas_realizadas"]);
  const planned = pickFirstPositiveNumber(item, ["chamadas_previstas", "total_chamadas", "presencas_previstas"]);
  if (planned > 0 && done >= planned) return true;
  return ["chamadas_concluidas", "cronograma_concluido", "turma_concluida"].some(key => isTruthy(item?.[key]));
}

function hasCompletedWorkload(item) {
  const horasPrevistas = pickFirstPositiveNumber(item, ["carga_horaria", "carga_horaria_total"]);
  const horasRealizadas = pickFirstPositiveNumber(item, ["horas_realizadas", "carga_horaria_realizada"]);
  return horasPrevistas > 0 && horasRealizadas >= horasPrevistas;
}

function normalizeStatusCode(status) {
  const key = String(status || "").trim().toLowerCase();
  if (["concluido", "concluído", "finalizado"].includes(key)) return "concluido";
  if (["em_andamento", "em andamento", "ativo"].includes(key)) return "em_andamento";
  if (["cancelada", "cancelado"].includes(key)) return "cancelada";
  return "planejado";
}

function getStatusCode(item) {
  const current = normalizeStatusCode(item?.status);
  if (current === "cancelada" || current === "concluido") return current;
  if (hasCompletedCalls(item) || hasCompletedWorkload(item)) return "concluido";
  const today = new Date(); today.setHours(0,0,0,0);
  const dataFim = parseDateOnly(item?.data_fim || item?.data_termino);
  if (dataFim && dataFim < today) return "concluido";
  const dataInicio = parseDateOnly(item?.data_inicio || item?.data);
  if (dataInicio && dataInicio <= today) return "em_andamento";
  return current;
}

function statusLabel(statusOrItem) {
  const code = typeof statusOrItem === "object" ? getStatusCode(statusOrItem) : normalizeStatusCode(statusOrItem);
  if (code === "concluido") return "Concluída";
  if (code === "em_andamento") return "Em andamento";
  if (code === "cancelada") return "Cancelada";
  return "Planejada";
}

function statusStyle(statusOrItem) {
  const label = statusLabel(statusOrItem);
  const base = { display: "inline-block", padding: "5px 9px", borderRadius: 999, fontWeight: 800, fontSize: 11 };
  if (label === "Concluída") return { ...base, background: "#dcfce7", color: "#166534" };
  if (label === "Em andamento") return { ...base, background: "#ffedd5", color: "#9a3412" };
  if (label === "Cancelada") return { ...base, background: "#fee2e2", color: "#b91c1c" };
  return { ...base, background: "#dbeafe", color: "#1d4ed8" };
}

function parseClientes(value) {
  if (!value) return [];
  return String(value).split(",").map(i => i.trim()).filter(Boolean);
}
function isGlobalUser(cliente) { return parseClientes(cliente).some(i => i.toLowerCase() === "global"); }
function temClienteEmComum(a, b) {
  const la = parseClientes(a).map(i => i.toLowerCase());
  const lb = parseClientes(b).map(i => i.toLowerCase());
  return la.includes("global") || lb.includes("global") || la.some(i => lb.includes(i));
}
function usuarioOptionLabel(u) {
  const c = parseClientes(u.cliente);
  if (!c.length) return u.nome;
  if (c.length === 1) return `${u.nome} • ${c[0]}`;
  return `${u.nome} • ${c.length} operações`;
}
function parseTurmaMetadata(desc) {
  const text = String(desc || "");
  const modalidade = text.match(/\[modalidade:([^\]]+)\]/i)?.[1]?.trim() || "";
  const sala = text.match(/\[sala:([^\]]*)\]/i)?.[1]?.trim() || "";
  const limpa = text.replace(/\[modalidade:[^\]]+\]\s*/gi, "").replace(/\[sala:[^\]]*\]\s*/gi, "").trim();
  return { modalidade, sala, descricaoLimpa: limpa };
}
function buildDescricaoComMetadata({ descricao, modalidade, sala }) {
  const p = [];
  if (modalidade) p.push(`[modalidade:${modalidade}]`);
  if (sala) p.push(`[sala:${sala}]`);
  if (descricao) p.push(String(descricao).trim());
  return p.join(" ").trim();
}

// --- Componente Principal ---
export default function TreinamentosPage() {
  const [turmas, setTurmas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [usuarioLogado, setUsuarioLogado] = useState(null);

  useEffect(() => {
    async function carregar() {
      try {
        const [t, u, c] = await Promise.all([
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/usuarios").catch(() => []),
          apiFetch("/clientes").catch(() => []),
        ]);
        setTurmas(Array.isArray(t) ? t : []);
        setUsuarios(Array.isArray(u) ? u : []);
        setClientes(Array.isArray(c) ? c : []);
        setUsuarioLogado(getStoredUser());
      } catch {
        setTurmas([]); setUsuarios([]); setClientes([]); setUsuarioLogado(getStoredUser());
      }
    }
    carregar();
  }, []);

  const perfilLogado = String(usuarioLogado?.perfil || "").toLowerCase();
  const clienteLogado = usuarioLogado?.cliente || "";
  const nomeLogado = usuarioLogado?.nome || "";
  const usuarioEhGlobal = isGlobalUser(clienteLogado);

  const clientesOptions = useMemo(() => {
    const lista = clientes.map(i => ({ value: i.nome, label: i.nome })).sort((a,b) => a.label.localeCompare(b.label, 'pt-BR'));
    if (!perfilLogado || perfilLogado === "coordenador" || usuarioEhGlobal) return lista;
    if (perfilLogado === "instrutor" || perfilLogado === "supervisor") return lista.filter(i => temClienteEmComum(i.value, clienteLogado));
    return lista;
  }, [clientes, perfilLogado, usuarioEhGlobal, clienteLogado]);

  const clientePadrao = useMemo(() => {
    if ((perfilLogado === "instrutor" || perfilLogado === "supervisor") && clientesOptions.length === 1) return clientesOptions[0].value;
    return "";
  }, [perfilLogado, clientesOptions]);

  const instrutores = useMemo(() => {
    let base = usuarios.filter(i => String(i.perfil || "").toLowerCase() === "instrutor");
    if (!perfilLogado || perfilLogado === "coordenador" || usuarioEhGlobal) {}
    else if (perfilLogado === "supervisor") base = base.filter(i => temClienteEmComum(i.cliente, clienteLogado));
    else if (perfilLogado === "instrutor") base = base.filter(i => i.nome === nomeLogado);
    return base.map(i => ({ value: i.nome, label: usuarioOptionLabel(i) })).sort((a,b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [usuarios, perfilLogado, usuarioEhGlobal, clienteLogado, nomeLogado]);

  const supervisores = useMemo(() => {
    let base = usuarios.filter(i => String(i.perfil || "").toLowerCase() === "supervisor");
    if (!perfilLogado || perfilLogado === "coordenador" || usuarioEhGlobal) {}
    else base = base.filter(i => temClienteEmComum(i.cliente, clienteLogado));
    return base.map(i => ({ value: i.nome, label: usuarioOptionLabel(i) })).sort((a,b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [usuarios, perfilLogado, usuarioEhGlobal, clienteLogado]);

  const fields = [
    { name: "tema", label: "Turma / treinamento", placeholder: "Tema ou nome da turma" },
    { name: "cliente", label: "Cliente", type: "select", options: clientesOptions, placeholder: "Selecione o cliente", defaultValue: clientePadrao },
    { name: "instrutor", label: "Instrutor", type: "select", options: instrutores, placeholder: "Selecione o instrutor", defaultValue: perfilLogado === "instrutor" ? nomeLogado : "", disabled: perfilLogado === "instrutor" },
    { name: "supervisor", label: "Supervisor", type: "select", options: supervisores, placeholder: "Selecione o supervisor" },
    { name: "publico", label: "Público", placeholder: "Ex.: Operação, onboarding..." },
    { name: "carga_horaria", label: "Carga horária total", placeholder: "Ex.: 20h" },
    { name: "participantes", label: "Treinandos previstos", type: "number" },
    { name: "status", label: "Status", type: "select", options: [{value:"planejado",label:"Planejada"},{value:"em_andamento",label:"Em andamento"},{value:"concluido",label:"Concluída"},{value:"cancelada",label:"Cancelada"}] },
    { name: "data_inicio", label: "Data de início", type: "date" },
    { name: "data_fim", label: "Data de fim", type: "date" },
    { name: "modalidade", label: "Modalidade", type: "select", options: [{value:"online",label:"Online"},{value:"presencial",label:"Presencial"}] },
    { name: "sala", label: "Sala", placeholder: "Ex.: Sala 01" },
    { name: "descricao", label: "Observações", type: "textarea" },
  ];

  const kpis = useMemo(() => {
    const total = turmas.length;
    const planejadas = turmas.filter(i => getStatusCode(i) === "planejado").length;
    const andamento = turmas.filter(i => getStatusCode(i) === "em_andamento").length;
    const concluidas = turmas.filter(i => getStatusCode(i) === "concluido").length;
    const treinandos = turmas.reduce((acc, i) => acc + Number(i.participantes || 0), 0);
    const horas = turmas.reduce((acc, i) => acc + parseHoras(i.carga_horaria), 0);
    
    const autoConcluidas = turmas.filter(i => 
      normalizeStatusCode(i.status) !== "concluido" && getStatusCode(i) === "concluido"
    ).length;

    const atrasadas = turmas.filter(i => {
      const dataFim = parseDateOnly(i?.data_fim || i?.data_termino);
      return dataFim && dataFim < new Date(new Date().setHours(0,0,0,0)) && 
             normalizeStatusCode(i.status) !== "concluido" && 
             normalizeStatusCode(i.status) !== "cancelada";
    }).length;

    const alertas = [];
    if (planejadas > 0) alertas.push(`${planejadas} turma(s) ainda estão planejadas.`);
    if (andamento > 0) alertas.push(`${andamento} turma(s) estão em andamento.`);
    if (autoConcluidas > 0) alertas.push(`${autoConcluidas} turma(s) aparecem como concluídas automaticamente.`);
    if (atrasadas > 0) alertas.push(`${atrasadas} turma(s) com status desatualizado.`);
    if (alertas.length === 0) alertas.push("Base organizada, sem pendências críticas.");

    return { total, planejadas, andamento, concluidas, treinandos, horas, alertas, autoConcluidas, atrasadas };
  }, [turmas]);

  const columns = [
    {
      key: "tema",
      label: "Turma",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.tema || item.titulo || "-"}</div>
          <div style={subCell}>{(item.cliente || "Sem cliente") + " • " + (item.instrutor || "Sem instrutor")}</div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (item) => <span style={statusStyle(item)}>{statusLabel(item)}</span>,
    },
    {
      key: "periodo",
      label: "Período",
      render: (item) => (
        <span style={plainCell}>
          {formatDateSafe(item.data_inicio || item.data)} até {formatDateSafe(item.data_fim || item.data_inicio || item
          {formatDateSafe(item.data_inicio || item.data)} até {formatDateSafe(item.data_fim || item.data_inicio || item.data)}
        </span>
      ),
    },
    {
      key: "participantes",
      label: "Treinandos",
      render: (item) => <span style={plainCell}>{fmt(item.treinandos || item.participantes || 0)}</span>,
    },
    {
      key: "carga",
      label: "Carga Horária",
      render: (item) => <span style={plainCell}>{item.carga_horaria || "-"}</span>,
    },
  ];

  function abrirTurma(item) {
    window.location.href = `/treinamentos/${item.id}`;
  }

  return (
    <CrudPageV2
      title="Treinamentos"
      subtitle="Cadastro e gestão das turmas e treinamentos."
      endpoint="/treinamentos"
      fields={fields}
      columns={columns}
      onView={abrirTurma}
      hero={
        <>
          <div style={statsGrid}>
            <StatCard title="Total de turmas" value={fmt(kpis.total)} accent="#2563eb" />
            <StatCard title="Planejadas" value={fmt(kpis.planejadas)} accent="#f59e0b" />
            <StatCard title="Em andamento" value={fmt(kpis.andamento)} accent="#2563eb" />
            <StatCard title="Concluídas" value={fmt(kpis.concluidas)} accent="#16a34a" />
            <StatCard title="Treinandos" value={fmt(kpis.treinandos)} accent="#8b5cf6" />
            <StatCard title="Horas totais" value={`${fmt(kpis.horas)}h`} accent="#0ea5e9" />
          </div>

          <SectionCard title="Resumo da base" subtitle="Indicadores automáticos baseados no status e datas.">
            <div style={alertasList}>
              {kpis.alertas.map((msg, idx) => (
                <div key={idx} style={alertaItem}>• {msg}</div>
              ))}
            </div>
          </SectionCard>
        </>
      }
    />
  );
}

// --- Estilos ---
const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
  marginBottom: 16,
};

const alertasList = {
  display: "grid",
  gap: 8,
  padding: "4px 0",
};

const alertaItem = {
  fontSize: 14,
  color: "#334155",
};

const titleCell = {
  fontWeight: 700,
  color: "#0f172a",
};

const subCell = {
  fontSize: 13,
  color: "#64748b",
};

const plainCell = {
  fontSize: 14,
  color: "#334155",
};

const btnPrimario = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "10px 16px",
  cursor: "pointer",
  fontWeight: 700,
};

const btnSecundario = {
  background: "#e2e8f0",
  color: "#0f172a",
  border: 0,
  borderRadius: 10,
  padding: "10px 16px",
  cursor: "pointer",
  fontWeight: 700,
};                                                                   
