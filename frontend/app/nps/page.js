"use client";

export const dynamic = 'force-dynamic';
import { useEffect, useMemo, useState } from "react";
import CrudPageV2 from "../../components/CrudPageV2";
import StatCard from "../../components/StatCard";
import SectionCard from "../../components/SectionCard";
import { apiFetch } from "../../services/api";

function classificar(nota) {
  const valor = Number(nota || 0);
  if (valor >= 9) return "Promotor";
  if (valor >= 7) return "Neutro";
  return "Detrator";
}

function badgeStyle(tipo) {
  const base = {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };

  if (tipo === "Promotor") {
    return { ...base, background: "#dcfce7", color: "#166534" };
  }
  if (tipo === "Neutro") {
    return { ...base, background: "#fef3c7", color: "#92400e" };
  }
  return { ...base, background: "#fee2e2", color: "#b91c1c" };
}

export default function NpsPage() {
  const [dados, setDados] = useState([]);
  const [treinamentos, setTreinamentos] = useState([]);

  useEffect(() => {
    async function load() {
      const [npsData, treinamentosData] = await Promise.all([
        apiFetch("/avaliacoes-treinandos").catch(() => []),
        apiFetch("/treinamentos").catch(() => []),
      ]);

      setDados(Array.isArray(npsData) ? npsData : []);
      setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
    }

    load();
  }, []);

  const total = dados.length;
  const promotores = dados.filter((d) => Number(d.nota_nps) >= 9).length;
  const neutros = dados.filter((d) => Number(d.nota_nps) >= 7 && Number(d.nota_nps) <= 8).length;
  const detratores = dados.filter((d) => Number(d.nota_nps) <= 6).length;

  const nps = total
    ? Math.round((promotores / total) * 100 - (detratores / total) * 100)
    : 0;

  const treinamentoOptions = useMemo(() => {
    return treinamentos.map((t) => ({
      value: t.id,
      label: `${t.tema || "Treinamento"} - ${t.cliente || "Sem cliente"}`,
    }));
  }, [treinamentos]);

  const fields = [
    {
      name: "treinamento_id",
      label: "Turma",
      type: "select",
      options: treinamentoOptions,
      placeholder: "Selecione a turma",
    },
    {
      name: "treinando_nome",
      label: "Treinando",
    },
    {
      name: "nota_nps",
      label: "Nota NPS (0-10)",
      type: "number",
      min: 0,
      max: 10,
      step: 1,
    },
    {
      name: "comentario",
      label: "Comentário",
      type: "textarea",
    },
  ];

  const columns = [
    {
      key: "treinando_nome",
      label: "Treinando",
      render: (item) => (
        <div>
          <div style={titleCell}>{item.treinando_nome || "-"}</div>
          <div style={subCell}>
            {(item.tema || "Turma") + " • " + (item.cliente || "Sem cliente")}
          </div>
        </div>
      ),
    },
    { key: "nota_nps", label: "Nota" },
    {
      key: "classificacao",
      label: "Classificação",
      render: (item) => {
        const tipo = classificar(item.nota_nps);
        return <span style={badgeStyle(tipo)}>{tipo}</span>;
      },
    },
    {
      key: "comentario",
      label: "Comentário",
      render: (item) => <span style={{ color: "#475569" }}>{item.comentario || "-"}</span>,
    },
  ];

  return (
    <CrudPageV2
      title="Satisfação do Treinando (NPS)"
      subtitle="Leitura executiva de promotores, neutros e detratores por turma."
      endpoint="/avaliacoes-treinandos"
      fields={fields}
      columns={columns}
      allowedCreateRoles={["coordenador", "supervisor", "instrutor"]}
      allowedEditRoles={[]}
      allowedDeleteRoles={[]}
      hero={
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10 }}>
            <StatCard title="NPS" value={nps} accent="#2563eb" />
            <StatCard title="Promotores" value={promotores} accent="#16a34a" />
            <StatCard title="Neutros" value={neutros} accent="#f59e0b" />
            <StatCard title="Detratores" value={detratores} accent="#dc2626" />
          </div>

          <SectionCard
            title="Aplicação ao treinando"
            subtitle="O treinando deve responder o NPS pela página própria após participar da turma."
          >
            <div style={infoBox}>
              Use a página <strong>/responder-nps</strong> para o treinando registrar a nota apenas das turmas em que ele está vinculado.
            </div>
          </SectionCard>
        </div>
      }
    />
  );
}

const titleCell = {
  fontWeight: 800,
  color: "#0f172a",
};

const subCell = {
  marginTop: 4,
  color: "#64748b",
  fontSize: 12,
};

const infoBox = {
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
  borderRadius: 12,
  padding: 12,
  fontWeight: 600,
};
