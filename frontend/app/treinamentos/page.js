"use client";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch, getStoredUser } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function parseHoras(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).replace(",", ".").trim();
  const match = text.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

function formatDateSafe(value) {
  if (!value) return "-";
  const text = String(value).slice(0, 10);
  const parts = text.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return String(value);
}

function statusLabel(status) {
  const key = String(status || "").trim().toLowerCase();
  if (key.includes("conclu")) return "Concluída";
  if (key.includes("andamento")) return "Em andamento";
  if (key.includes("cancel")) return "Cancelada";
  return "Planejada";
}

function statusStyle(status) {
  const label = statusLabel(status);
  const base = { display: "inline-block", padding: "5px 9px", borderRadius: 999, fontWeight: 800, fontSize: 11 };
  if (label === "Concluída") return { ...base, background: "#dcfce7", color: "#166534" };
  if (label === "Em andamento") return { ...base, background: "#ffedd5", color: "#9a3412" };
  if (label === "Cancelada") return { ...base, background: "#fee2e2", color: "#b91c1c" };
  return { ...base, background: "#dbeafe", color: "#1d4ed8" };
}

function parseClientes(value) {
  if (!value) return [];
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function isGlobalUser(cliente) {
  return parseClientes(cliente).some((item) => item.toLowerCase() === "global");
}

function temClienteEmComum(clienteA, clienteB) {
  const listaA = parseClientes(clienteA).map((item) => item.toLowerCase());
  const listaB = parseClientes(clienteB).map((item) => item.toLowerCase());
  if (listaA.includes("global") || listaB.includes("global")) return true;
  return listaA.some((item) => listaB.includes(item));
}

function parseTurmaMetadata(descricao) {
  const text = String(descricao || "");
  const modalidade = text.match(/\[modalidade:([^\]]+)\]/i)?.[1]?.trim() || "";
  const sala = text.match(/\[sala:([^\]]*)\]/i)?.[1]?.trim() || "";
  const descricaoLimpa = text
    .replace(/\[modalidade:[^\]]+\]\s*/gi, "")
    .replace(/\[sala:[^\]]*\]\s*/gi, "")
    .trim();
  return { modalidade, sala, descricaoLimpa };
}

export default function TreinamentosPage() {
  const [turmas, setTurmas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [usuarioLogado, setUsuarioLogado] = useState(null);

  useEffect(() => {
    async function carregar() {
      try {
        const [resT, resU, resC] = await Promise.all([
          apiFetch("/treinamentos"),
          apiFetch("/usuarios"),
          apiFetch("/clientes"),
        ]);
        const tData = await resT.json();
        const uData = await resU.json();
        const cData = await resC.json();

        setTurmas(Array.isArray(tData) ? tData : []);
        setUsuarios(Array.isArray(uData) ? uData : []);
        setClientes(Array.isArray(cData) ? cData : []);
        setUsuarioLogado(getStoredUser());
      } catch (err) {
        console.error("Erro ao carregar turmas:", err);
        setUsuarioLogado(getStoredUser());
      }
    }
    carregar();
  }, []);

  const perfilLogado = String(usuarioLogado?.perfil || "").toLowerCase();
  const clienteLogado = usuarioLogado?.cliente || "";
  const nomeLogado = usuarioLogado?.nome || "";
  const usuarioEhGlobal = isGlobalUser(clienteLogado);

  const options = useMemo(() => {
    const cOpts = clientes
      .map(i => ({ value: i.nome, label: i.nome }))
      .filter(i => usuarioEhGlobal || perfilLogado === "coordenador" || temClienteEmComum(i.value, clienteLogado))
      .sort((a, b) => a.label.localeCompare(b.label));

    const instBase = usuarios.filter(u => String(u.perfil).toLowerCase() === "instrutor");
    const instOpts = instBase
      .filter(u => {
        if (perfilLogado === "instrutor") return u.nome === nomeLogado;
        if (perfilLogado === "supervisor") return temClienteEmComum(u.cliente, clienteLogado);
        return true;
      })
      .map(u => ({ value: u.nome, label: u.nome }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const supOpts = usuarios
      .filter(u => String(u.perfil).toLowerCase() === "supervisor")
      .filter(u => usuarioEhGlobal || perfilLogado === "coordenador" || temClienteEmComum(u.cliente, clienteLogado))
      .map(u => ({ value: u.nome, label: u.nome }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return { clientes: cOpts, instrutores: instOpts, supervisores: supOpts };
  }, [clientes, usuarios, perfilLogado, clienteLogado, nomeLogado, usuarioEhGlobal]);

  const kpis = useMemo(() => {
    const total = turmas.length;
    const planejadas = turmas.filter(i => statusLabel(i.status) === "Planejada").length;
    const andamento = turmas.filter(i => statusLabel(i.status) === "Em andamento").length;
    const concluidas = turmas.filter(i => statusLabel(i.status) === "Concluída").length;
    const treinandos = turmas.reduce((acc, i) => acc + Number(i.participantes || 0), 0);
    const horas = turmas.reduce((acc, i) => acc + parseHoras(i.carga_horaria), 0);

    return { total, planejadas, andamento, concluidas, treinandos, horas };
  }, [turmas]);

  const fields = [
    { name: "tema", label: "Turma / treinamento" },
    { name: "cliente", label: "Cliente", type: "select", options: options.clientes },
    { name: "instrutor", label: "Instrutor", type: "select", options: options.instrutores, disabled: perfilLogado === "instrutor" },
    { name: "supervisor", label: "Supervisor", type: "select", options: options.supervisores },
    { name: "publico", label: "Público" },
    { name: "carga_horaria", label: "Carga horária total" },
    { name: "participantes", label: "Treinandos previstos", type: "number" },
    { name: "status", label: "Status", type: "select", options: [
      { value: "planejado", label: "Planejada" },
      { value: "em_andamento", label: "Em andamento" },
      { value: "concluido", label: "Concluída" },
    ]},
    { name: "data_inicio", label: "Data de início", type: "date" },
    { name: "data_fim", label: "Data de fim", type: "date" },
    { name: "modalidade", label: "Modalidade", type: "select", options: [
      { value: "online", label: "Online" },
      { value: "presencial", label: "Presencial" },
    ]},
    { name: "sala", label: "Sala" },
    { name: "descricao", label: "Observações", type: "textarea" },
  ];

  const columns = [
    { key: "tema", label: "Turma", render: (item) => (
      <div>
        <div style={titleCell}>{item.tema || "-"}</div>
        <div style={subCell}>{(item.cliente || "Sem cliente") + " • " + (item.instrutor || "Sem instrutor")}</div>
      </div>
    )},
    { key: "status", label: "Status", render: (item) => <span style={statusStyle(item.status)}>{statusLabel(item.status)}</span> },
    { key: "periodo", label: "Período", render: (item) => <span style={plainCell}>{formatDateSafe(item.data_inicio)} até {formatDateSafe(item.data_fim)}</span> },
    { key: "participantes", label: "Previstos", render: (item) => <strong style={scoreBlue}>{fmt(item.participantes)}</strong> },
    { key: "acoes", label: "Ações", render: (item) => (
      <div style={{ display: "flex", gap: 8 }}>
        <button style={btnAcao} onClick={() => window.location.href = `/turma/${item.id}`}>Gestão</button>
        <button style={btnSecundario} onClick={() => window.location.href = `/turma/${item.id}/cronograma`}>Cronograma</button>
      </div>
    )},
  ];

  return (
    <CrudPageV2
      title="Gestão de Turmas"
      subtitle="Controle operacional e execução das turmas de formação."
      endpoint="/treinamentos"
      fields={fields}
      columns={columns}
      allowedCreateRoles={["coordenador", "supervisor", "instrutor"]}
      allowedEditRoles={["coordenador", "supervisor", "instrutor"]}
      allowedDeleteRoles={["coordenador"]}
      transformRecordToForm={(base, record) => {
        const meta = parseTurmaMetadata(record?.descricao);
        return { ...base, modalidade: meta.modalidade, sala: meta.sala, descricao: meta.descricaoLimpa };
      }}
      transformFormToPayload={(payload, form) => ({
        ...payload,
        descricao: `[modalidade:${form.modalidade || ""}] [sala:${form.sala || ""}] ${form.descricao || ""}`.trim()
      })}
      hero={
        <div style={{ display: "grid", gap: 14 }}>
          <div style={heroGrid}>
            <StatCard title="Total" value={fmt(kpis.total)} accent="#2563eb" />
            <StatCard title="Ativas" value={fmt(kpis.andamento)} accent="#ea580c" />
            <StatCard title="Treinandos" value={fmt(kpis.treinandos)} accent="#06b6d4" />
            <StatCard title="Horas" value={`${fmt(kpis.horas)}h`} accent="#7c3aed" />
          </div>
        </div>
      }
    />
  );
}

// Estilos
const heroGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 };
const titleCell = { fontWeight: 800, color: "#0f172a" };
const subCell = { marginTop: 4, color: "#64748b", fontSize: 12 };
const plainCell = { color: "#334155" };
const scoreBlue = { color: "#2563eb" };
const btnAcao = { border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", borderRadius: 8, padding: "7px 10px", fontWeight: 800, cursor: "pointer", fontSize: 12 };
const btnSecundario = { border: "1px solid #ddd6fe", background: "#f5f3ff", color: "#7c3aed", borderRadius: 8, padding: "7px 10px", fontWeight: 800, cursor: "pointer", fontSize: 12 };
