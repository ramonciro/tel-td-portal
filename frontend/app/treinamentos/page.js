"use client";

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

/* 🔥 NOVO: presença */
function turmaConcluidaPorPresenca(turmaId, presencas) {
  const lista = presencas.filter(
    (p) => String(p.treinamento_id) === String(turmaId)
  );

  if (!lista.length) return false;

  return lista.every((p) =>
    ["presente", "falta", "justificado"].includes(
      String(p.status || "").toLowerCase()
    )
  );
}

/* 🔥 AJUSTADO */
function statusLabel(status, dataFim, turmaId, presencas) {
  if (turmaConcluidaPorPresenca(turmaId, presencas)) {
    return "Concluída";
  }

  const key = String(status || "").trim().toLowerCase();

  if (key === "concluido" || key === "concluído" || key === "concluida") {
    return "Concluída";
  }

  if (key === "em_andamento" || key === "em andamento") {
    return "Em andamento";
  }

  if (key === "cancelada" || key === "cancelado") {
    return "Cancelada";
  }

  return "Planejada";
}

function statusStyle(status) {
  const label = statusLabel(status, null, null, []);

  const base = {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };

  if (label === "Concluída") {
    return { ...base, background: "#dcfce7", color: "#166534" };
  }

  if (label === "Em andamento") {
    return { ...base, background: "#ffedd5", color: "#9a3412" };
  }

  if (label === "Cancelada") {
    return { ...base, background: "#fee2e2", color: "#b91c1c" };
  }

  return { ...base, background: "#dbeafe", color: "#1d4ed8" };
}

/* ================= PAGE ================= */

export default function TreinamentosPage() {
  const [turmas, setTurmas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [presencas, setPresencas] = useState([]); // 🔥 NOVO
  const [usuarioLogado, setUsuarioLogado] = useState(null);

  useEffect(() => {
    async function carregar() {
      try {
        const [treinamentosData, usuariosData, clientesData, presencasData] =
          await Promise.all([
            apiFetch("/treinamentos").catch(() => []),
            apiFetch("/usuarios").catch(() => []),
            apiFetch("/clientes").catch(() => []),
            apiFetch("/presencas").catch(() => []), // 🔥 NOVO
          ]);

        setTurmas(Array.isArray(treinamentosData) ? treinamentosData : []);
        setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
        setClientes(Array.isArray(clientesData) ? clientesData : []);
        setPresencas(Array.isArray(presencasData) ? presencasData : []); // 🔥 NOVO
        setUsuarioLogado(getStoredUser());
      } catch {
        setTurmas([]);
        setUsuarios([]);
        setClientes([]);
        setPresencas([]); // 🔥 NOVO
        setUsuarioLogado(getStoredUser());
      }
    }

    carregar();
  }, []);

  const kpis = useMemo(() => {
    const total = turmas.length;

    const planejadas = turmas.filter(
      (item) =>
        statusLabel(item.status, item.data_fim, item.id, presencas) === "Planejada"
    ).length;

    const andamento = turmas.filter(
      (item) =>
        statusLabel(item.status, item.data_fim, item.id, presencas) === "Em andamento"
    ).length;

    const concluidas = turmas.filter(
      (item) =>
        statusLabel(item.status, item.data_fim, item.id, presencas) === "Concluída"
    ).length;

    return { total, planejadas, andamento, concluidas };
  }, [turmas, presencas]);

  const columns = [
    {
      key: "tema",
      label: "Turma",
      render: (item) => <strong>{item.tema}</strong>,
    },
    {
      key: "status",
      label: "Status",
      render: (item) => (
        <span style={statusStyle(item.status)}>
          {statusLabel(item.status, item.data_fim, item.id, presencas)}
        </span>
      ),
    },
  ];

  return (
    <CrudPageV2
      title="Gestão de Turmas"
      endpoint="/treinamentos"
      columns={columns}
      hero={
        <div style={{ display: "grid", gap: 12 }}>
          <StatCard title="Total" value={fmt(kpis.total)} />
          <StatCard title="Planejadas" value={fmt(kpis.planejadas)} />
          <StatCard title="Em andamento" value={fmt(kpis.andamento)} />
          <StatCard title="Concluídas" value={fmt(kpis.concluidas)} />
        </div>
      }
    />
  );
}
