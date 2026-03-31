"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import PortalShell from "../../../components/PortalShell";
import SectionCard from "../../../components/SectionCard";
import StatCard from "../../../components/StatCard";

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseLocaleNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  if (raw.includes(",") && raw.includes(".")) {
    const normalized = raw.replace(/\./g, "").replace(",", ".");
    const num = Number(normalized.replace(/[^\d.-]/g, ""));
    return Number.isFinite(num) ? num : 0;
  }

  const normalized = raw.replace(",", ".");
  const num = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function toNumber(value) {
  return parseLocaleNumber(value);
}

function toPercentValue(value) {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    if (value >= 0 && value <= 1) return value * 100;
    if (value > 100 && value <= 10000) return value / 100;
    return value;
  }

  const raw = String(value).trim();
  if (!raw) return 0;

  if (raw.includes("%")) {
    const num = parseLocaleNumber(raw.replace("%", ""));
    if (num > 100 && num <= 10000) return num / 100;
    return num;
  }

  const num = parseLocaleNumber(raw);
  if (num >= 0 && num <= 1) return num * 100;
  if (num > 100 && num <= 10000) return num / 100;
  return num;
}

function average(values) {
  const valid = values.filter((v) => Number.isFinite(Number(v)));
  if (!valid.length) return 0;
  return valid.reduce((acc, v) => acc + Number(v), 0) / valid.length;
}

function sumBy(rows, key) {
  return rows.reduce((acc, item) => acc + toNumber(item[key]), 0);
}

function fmtNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
}

function fmtScore(value) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function fmtPercent(value) {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(value || 0))}%`;
}

function excelSerialToDate(serial) {
  if (typeof serial !== "number" || !Number.isFinite(serial)) return null;
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) return null;
  const dt = new Date(parsed.y, parsed.m - 1, parsed.d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDateCell(value) {
  if (!value) return "—";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString("pt-BR");
  }

  if (typeof value === "number") {
    const dt = excelSerialToDate(value);
    if (dt) return dt.toLocaleDateString("pt-BR");
  }

  const raw = String(value).trim();
  if (!raw) return "—";

  const isoDate = new Date(raw);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate.toLocaleDateString("pt-BR");
  }

  const parts = raw.split(/[\/\-]/);
  if (parts.length === 3) {
    let d, m, y;
    if (parts[0].length === 4) {
      [y, m, d] = parts;
    } else if (Number(parts[0]) > 12 && Number(parts[1]) <= 12) {
      [d, m, y] = parts;
    } else if (Number(parts[1]) > 12 && Number(parts[0]) <= 12) {
      [m, d, y] = parts;
    } else {
      [m, d, y] = parts;
    }

    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString("pt-BR");
    }
  }

  return raw;
}

function extractMonth(value) {
  if (!value) return "Sem período";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  }

  if (typeof value === "number") {
    const dt = excelSerialToDate(value);
    if (dt) return dt.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  }

  const raw = String(value).trim();
  const formatted = formatDateCell(raw);
  if (formatted !== "—") {
    const parts = formatted.split("/");
    if (parts.length === 3) {
      const dt = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
      }
    }
  }

  return raw || "Sem período";
}

function getColumnValue(row, aliases) {
  const keys = Object.keys(row || {});
  for (const alias of aliases) {
    const found = keys.find((key) => normalize(key) === normalize(alias));
    if (found) return row[found];
  }
  return "";
}

function mapRow(rawRow, index) {
  return {
    id: index + 1,
    data: getColumnValue(rawRow, ["Data", "Data Treinamento", "Dt", "Data da Ação"]),
    cliente: getColumnValue(rawRow, ["Cliente"]),
    tipoTreinamento: getColumnValue(rawRow, [
      "Tipo_Treinamento",
      "Tipo Treinamento",
      "Tipo de Treinamento",
      "Tipo",
    ]),
    instrutor: getColumnValue(rawRow, ["Instrutor"]),
    supervisor: getColumnValue(rawRow, ["Supervisor"]),
    turma: getColumnValue(rawRow, ["Turma"]),
    competencia: getColumnValue(rawRow, ["Competência", "Competencia", "Indicador"]),
    participantes: toNumber(
      getColumnValue(rawRow, ["Participantes", "Participantes Prev", "Qtd Participantes"])
    ),
    presencas: toNumber(getColumnValue(rawRow, ["Presenças", "Presencas"])),
    faltas: toNumber(getColumnValue(rawRow, ["Faltas"])),
    presencaPct: toPercentValue(
      getColumnValue(rawRow, ["% Presença", "% Presenca", "Presença %", "Presenca %"])
    ),
    avaliacao: toNumber(
      getColumnValue(rawRow, ["Avaliação (0-10)", "Avaliacao (0-10)", "Avaliação", "Avaliacao"])
    ),
    indicador: getColumnValue(rawRow, ["Indicador"]),
    antes: toNumber(getColumnValue(rawRow, ["Antes"])),
    depois: toNumber(getColumnValue(rawRow, ["Depois"])),
    janelaDias: toNumber(getColumnValue(rawRow, ["Janela (dias)", "Janela Dias", "Janela em Dias"])),
    evolucaoPct: toPercentValue(getColumnValue(rawRow, ["Evolução %", "Evolucao %"])),
    impactoPos: toNumber(
      getColumnValue(rawRow, ["Impacto_Pos (0/1)", "Impacto Pos (0/1)", "Impacto_Pos", "Impacto Pos"])
    ),
  };
}

function groupAverage(rows, field) {
  if (!rows.length) return 0;
  return average(rows.map((item) => toNumber(item[field])));
}

function groupImpact(rows) {
  if (!rows.length) return 0;
  return average(rows.map((item) => (toNumber(item.impactoPos) > 0 ? 100 : 0)));
}

function uniqueOptions(rows, field) {
  return [...new Set(rows.map((item) => String(item[field] || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
}

const inputBase = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
  background: "#fff",
};

const labelBase = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  color: "#334155",
  fontWeight: 700,
};

const cardWrap = {
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  background: "#fff",
  padding: 18,
  boxShadow: "0 10px 24px rgba(15,23,42,.05)",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 980,
};

const thStyle = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 12,
  fontWeight: 800,
  color: "#475569",
  background: "#f8fafc",
  borderBottom: "1px solid #e2e8f0",
  position: "sticky",
  top: 0,
};

const tdStyle = {
  padding: "12px 14px",
  fontSize: 13,
  color: "#0f172a",
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "top",
};

const executiveHero = {
  borderRadius: 22,
  padding: 22,
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #0ea5e9 100%)",
  color: "#fff",
  boxShadow: "0 18px 40px rgba(15,23,42,.22)",
};

function EmptyState({ message }) {
  return (
    <div
      style={{
        border: "1px dashed #cbd5e1",
        borderRadius: 16,
        padding: 26,
        textAlign: "center",
        color: "#64748b",
        background: "#f8fafc",
      }}
    >
      {message}
    </div>
  );
}

function InfoBox({ label, value, tone = "default" }) {
  const palette = {
    default: { bg: "#f8fafc", color: "#0f172a", border: "#e2e8f0" },
    alert: { bg: "#fff7ed", color: "#9a3412", border: "#fed7aa" },
    success: { bg: "#ecfdf5", color: "#166534", border: "#bbf7d0" },
    executive: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  };
  const p = palette[tone] || palette.default;

  return (
    <div
      style={{
        border: `1px solid ${p.border}`,
        background: p.bg,
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: p.color }}>{value}</div>
    </div>
  );
}

function TypeExecutiveCard({ item, index }) {
  const accents = ["#2563eb", "#0f766e", "#7c3aed", "#ea580c"];
  const accent = accents[index % accents.length];

  return (
    <div
      style={{
        border: `1px solid ${accent}22`,
        borderTop: `4px solid ${accent}`,
        borderRadius: 18,
        padding: 18,
        background: "#fff",
        boxShadow: "0 10px 24px rgba(15,23,42,.05)",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
          Tipo de treinamento
        </div>
        <div
          style={{
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 800,
            color: accent,
            background: `${accent}14`,
          }}
        >
          {fmtNumber(item.treinamentos)} ações
        </div>
      </div>

      <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", lineHeight: 1.2 }}>
        {item.tipo}
      </div>

      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        }}
      >
        <InfoBox label="Participantes" value={fmtNumber(item.participantes)} />
        <InfoBox label="Presenças" value={fmtNumber(item.presencas)} />
        <InfoBox label="Nota média" value={fmtScore(item.notaMedia)} tone="success" />
        <InfoBox label="Evolução" value={fmtPercent(item.evolucaoMedia)} tone="executive" />
      </div>

      <div
        style={{
          borderRadius: 14,
          padding: "10px 12px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
          Impacto positivo
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: accent }}>
          {fmtPercent(item.impactoPositivo)}
        </div>
      </div>
    </div>
  );
}

export default function SebraeApresentacaoPage() {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    tipoTreinamento: "",
    instrutor: "",
    supervisor: "",
    competencia: "",
    busca: "",
  });

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
      const sheetName =
        workbook.SheetNames.find((name) => normalize(name) === "base_dados") ||
        workbook.SheetNames.find((name) => normalize(name) === "base dados") ||
        workbook.SheetNames[0];

      if (!sheetName) {
        throw new Error("Não foi possível localizar a aba Base_Dados.");
      }

      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: true,
      });

      const mapped = json
        .map((item, index) => mapRow(item, index))
        .filter((item) => {
          const linhaModelo =
            normalize(item.cliente) === "(lista)" ||
            normalize(item.tipoTreinamento) === "(lista)" ||
            normalize(item.instrutor) === "(lista)" ||
            normalize(item.supervisor) === "(lista)";

          const linhaVazia = ![
            item.cliente,
            item.tipoTreinamento,
            item.instrutor,
            item.supervisor,
            item.turma,
            item.competencia,
            item.participantes,
            item.presencas,
            item.faltas,
            item.avaliacao,
          ].some((value) => String(value || "").trim() !== "" && String(value || "").trim() !== "0");

          return !linhaModelo && !linhaVazia;
        });

      setRows(mapped);
    } catch (err) {
      setRows([]);
      setError(err?.message || "Não foi possível processar o arquivo Excel.");
    }
  }

  const options = useMemo(
    () => ({
      tipoTreinamento: uniqueOptions(rows, "tipoTreinamento"),
      instrutor: uniqueOptions(rows, "instrutor"),
      supervisor: uniqueOptions(rows, "supervisor"),
      competencia: uniqueOptions(rows, "competencia"),
    }),
    [rows]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((item) => {
      const matchTipo =
        !filters.tipoTreinamento || normalize(item.tipoTreinamento) === normalize(filters.tipoTreinamento);
      const matchInstrutor =
        !filters.instrutor || normalize(item.instrutor) === normalize(filters.instrutor);
      const matchSupervisor =
        !filters.supervisor || normalize(item.supervisor) === normalize(filters.supervisor);
      const matchCompetencia =
        !filters.competencia || normalize(item.competencia) === normalize(filters.competencia);

      const haystack = normalize(
        [
          item.cliente,
          item.tipoTreinamento,
          item.instrutor,
          item.supervisor,
          item.turma,
          item.competencia,
          item.indicador,
        ].join(" ")
      );
      const matchBusca = !filters.busca || haystack.includes(normalize(filters.busca));

      return matchTipo && matchInstrutor && matchSupervisor && matchCompetencia && matchBusca;
    });
  }, [rows, filters]);

  const summary = useMemo(() => {
    return {
      treinamentos: filteredRows.length,
      participantes: sumBy(filteredRows, "participantes"),
      presencas: sumBy(filteredRows, "presencas"),
      faltas: sumBy(filteredRows, "faltas"),
      presencaMedia: average(filteredRows.map((item) => item.presencaPct)),
      notaMedia: average(filteredRows.map((item) => item.avaliacao)),
      evolucaoMedia: average(filteredRows.map((item) => item.evolucaoPct)),
      impactoPositivo: groupImpact(filteredRows),
    };
  }, [filteredRows]);

  const monthlyData = useMemo(() => {
    const bucket = {};
    filteredRows.forEach((item) => {
      const key = extractMonth(item.data);
      if (!bucket[key]) {
        bucket[key] = {
          periodo: key,
          treinamentos: 0,
          presencas: 0,
          participantes: 0,
          notaMedia: [],
          evolucaoMedia: [],
        };
      }
      bucket[key].treinamentos += 1;
      bucket[key].presencas += item.presencas;
      bucket[key].participantes += item.participantes;
      bucket[key].notaMedia.push(item.avaliacao);
      bucket[key].evolucaoMedia.push(item.evolucaoPct);
    });

    return Object.values(bucket).map((item) => ({
      ...item,
      notaMedia: average(item.notaMedia),
      evolucaoMedia: average(item.evolucaoMedia),
    }));
  }, [filteredRows]);

  const byType = useMemo(() => {
    const bucket = {};
    filteredRows.forEach((item) => {
      const key = item.tipoTreinamento || "Não informado";
      if (!bucket[key]) bucket[key] = [];
      bucket[key].push(item);
    });

    return Object.entries(bucket)
      .map(([tipo, items]) => ({
        tipo,
        treinamentos: items.length,
        participantes: sumBy(items, "participantes"),
        presencas: sumBy(items, "presencas"),
        notaMedia: groupAverage(items, "avaliacao"),
        evolucaoMedia: groupAverage(items, "evolucaoPct"),
        impactoPositivo: groupImpact(items),
      }))
      .sort((a, b) => b.treinamentos - a.treinamentos);
  }, [filteredRows]);

  const byInstructor = useMemo(() => {
    const bucket = {};
    filteredRows.forEach((item) => {
      const key = item.instrutor || "Não informado";
      if (!bucket[key]) bucket[key] = [];
      bucket[key].push(item);
    });

    return Object.entries(bucket)
      .map(([instrutor, items]) => ({
        instrutor,
        treinamentos: items.length,
        participantes: sumBy(items, "participantes"),
        presencas: sumBy(items, "presencas"),
        notaMedia: groupAverage(items, "avaliacao"),
        evolucaoMedia: groupAverage(items, "evolucaoPct"),
        impactoPositivo: groupImpact(items),
      }))
      .sort((a, b) => b.treinamentos - a.treinamentos);
  }, [filteredRows]);

  const featuredTypes = useMemo(() => byType.slice(0, 4), [byType]);

  return (
    <PortalShell
      title="Apresentação Sebrae"
      subtitle="Página apartada para apresentação executiva com atualização por upload de Excel."
    >
      <div style={{ display: "grid", gap: 18 }}>
        <section style={executiveHero}>
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "1.6fr 1fr",
              alignItems: "end",
            }}
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  display: "inline-flex",
                  width: "fit-content",
                  borderRadius: 999,
                  background: "rgba(255,255,255,.16)",
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                }}
              >
                Dashboard Executivo
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.15 }}>
                Resultados de Treinamento Sebrae
              </div>
              <div style={{ fontSize: 15, color: "rgba(255,255,255,.88)", maxWidth: 760 }}>
                Visão executiva com leitura isolada da base, acompanhamento por tipo
                de treinamento, desempenho dos instrutores e efetividade das ações realizadas.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gap: 10,
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              }}
            >
              <div
                style={{
                  background: "rgba(255,255,255,.12)",
                  border: "1px solid rgba(255,255,255,.18)",
                  borderRadius: 18,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", opacity: 0.8 }}>
                  Arquivo em uso
                </div>
                <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800 }}>
                  {fileName || "Nenhum arquivo enviado"}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(255,255,255,.12)",
                  border: "1px solid rgba(255,255,255,.18)",
                  borderRadius: 18,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", opacity: 0.8 }}>
                  Tipos mapeados
                </div>
                <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>
                  {fmtNumber(byType.length)}
                </div>
              </div>
            </div>
          </div>
        </section>

        <SectionCard
          title="Carga da Base"
          subtitle="Envie o Excel do Sebrae. A página prioriza a aba Base_Dados e atualiza a apresentação imediatamente."
        >
          <div
            style={{
              display: "grid",
              gap: 14,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              alignItems: "end",
            }}
          >
            <label style={labelBase}>
              Arquivo Excel
              <input type="file" accept=".xlsx,.xls" onChange={handleUpload} style={inputBase} />
            </label>

            <div style={{ ...cardWrap, padding: 14 }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800, textTransform: "uppercase" }}>
                Arquivo carregado
              </div>
              <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
                {fileName || "Nenhum arquivo enviado"}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setRows([]);
                setFileName("");
                setError("");
                setFilters({
                  tipoTreinamento: "",
                  instrutor: "",
                  supervisor: "",
                  competencia: "",
                  busca: "",
                });
              }}
              style={{
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#0f172a",
                borderRadius: 12,
                padding: "10px 14px",
                fontWeight: 800,
                cursor: "pointer",
                height: 44,
              }}
            >
              Limpar base
            </button>
          </div>

          <div style={{ marginTop: 12, fontSize: 13, color: "#475569" }}>
            Recomendação: manter a aba <strong>Base_Dados</strong> com os nomes de colunas do modelo atual.
          </div>

          {error ? (
            <div
              style={{
                marginTop: 14,
                border: "1px solid #fecaca",
                background: "#fff1f2",
                color: "#b91c1c",
                borderRadius: 12,
                padding: "12px 14px",
                fontWeight: 700,
              }}
            >
              {error}
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Resumo Executivo" subtitle="Leitura imediata para apresentação ao cliente.">
          {!rows.length ? (
            <EmptyState message="Envie um arquivo Excel para carregar os dados do Sebrae." />
          ) : (
            <div style={{ display: "grid", gap: 18 }}>
              <div
                style={{
                  display: "grid",
                  gap: 14,
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                }}
              >
                <StatCard title="Treinamentos" value={fmtNumber(summary.treinamentos)} accent="#2563eb" />
                <StatCard title="Participantes" value={fmtNumber(summary.participantes)} accent="#0f766e" />
                <StatCard title="Presenças" value={fmtNumber(summary.presencas)} accent="#16a34a" />
                <StatCard title="Faltas" value={fmtNumber(summary.faltas)} accent="#dc2626" />
                <StatCard title="% presença média" value={fmtPercent(summary.presencaMedia)} accent="#7c3aed" />
                <StatCard title="Nota média" value={fmtScore(summary.notaMedia)} accent="#ea580c" />
                <StatCard title="Evolução média" value={fmtPercent(summary.evolucaoMedia)} accent="#0891b2" />
                <StatCard title="Impacto positivo" value={fmtPercent(summary.impactoPositivo)} accent="#65a30d" />
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Filtros da Apresentação"
          subtitle="Refine a leitura sem tocar nos dados do portal principal."
        >
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <label style={labelBase}>
              Tipo de treinamento
              <select
                value={filters.tipoTreinamento}
                onChange={(e) => setFilters((prev) => ({ ...prev, tipoTreinamento: e.target.value }))}
                style={inputBase}
              >
                <option value="">Todos</option>
                {options.tipoTreinamento.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelBase}>
              Instrutor
              <select
                value={filters.instrutor}
                onChange={(e) => setFilters((prev) => ({ ...prev, instrutor: e.target.value }))}
                style={inputBase}
              >
                <option value="">Todos</option>
                {options.instrutor.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelBase}>
              Supervisor
              <select
                value={filters.supervisor}
                onChange={(e) => setFilters((prev) => ({ ...prev, supervisor: e.target.value }))}
                style={inputBase}
              >
                <option value="">Todos</option>
                {options.supervisor.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelBase}>
              Competência
              <select
                value={filters.competencia}
                onChange={(e) => setFilters((prev) => ({ ...prev, competencia: e.target.value }))}
                style={inputBase}
              >
                <option value="">Todas</option>
                {options.competencia.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...labelBase, gridColumn: "1 / -1" }}>
              Busca livre
              <input
                value={filters.busca}
                onChange={(e) => setFilters((prev) => ({ ...prev, busca: e.target.value }))}
                placeholder="Instrutor, turma, indicador, tipo..."
                style={inputBase}
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard
          title="Destaques por Tipo de Treinamento"
          subtitle="Leitura executiva dos tipos com maior volume e relevância na base."
        >
          {!filteredRows.length ? (
            <EmptyState message="Sem dados para exibir os destaques por tipo." />
          ) : (
            <div
              style={{
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              }}
            >
              {featuredTypes.map((item, index) => (
                <TypeExecutiveCard key={item.tipo} item={item} index={index} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Visão Mensal" subtitle="Comportamento consolidado por período.">
          {!filteredRows.length ? (
            <EmptyState message="Sem dados após a aplicação dos filtros." />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {monthlyData.map((item) => (
                <div
                  key={item.periodo}
                  style={{
                    ...cardWrap,
                    display: "grid",
                    gap: 14,
                    gridTemplateColumns: "220px 1fr",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase" }}>
                      Período
                    </div>
                    <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: "#0f172a" }}>
                      {item.periodo}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 12,
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    }}
                  >
                    <InfoBox label="Treinamentos" value={fmtNumber(item.treinamentos)} />
                    <InfoBox label="Presenças" value={fmtNumber(item.presencas)} />
                    <InfoBox label="Participantes" value={fmtNumber(item.participantes)} />
                    <InfoBox label="Nota média" value={fmtScore(item.notaMedia)} tone="success" />
                    <InfoBox label="Evolução média" value={fmtPercent(item.evolucaoMedia)} tone="alert" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Visão por Tipo de Treinamento" subtitle="Comparativo executivo dos tipos de treinamento.">
          {!filteredRows.length ? (
            <EmptyState message="Sem dados para exibir a visão por tipo." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Tipo</th>
                    <th style={thStyle}>Treinamentos</th>
                    <th style={thStyle}>Participantes</th>
                    <th style={thStyle}>Presenças</th>
                    <th style={thStyle}>Nota média</th>
                    <th style={thStyle}>Evolução média</th>
                    <th style={thStyle}>Impacto positivo</th>
                  </tr>
                </thead>
                <tbody>
                  {byType.map((item) => (
                    <tr key={item.tipo}>
                      <td style={tdStyle}><strong>{item.tipo}</strong></td>
                      <td style={tdStyle}>{fmtNumber(item.treinamentos)}</td>
                      <td style={tdStyle}>{fmtNumber(item.participantes)}</td>
                      <td style={tdStyle}>{fmtNumber(item.presencas)}</td>
                      <td style={tdStyle}>{fmtScore(item.notaMedia)}</td>
                      <td style={tdStyle}>{fmtPercent(item.evolucaoMedia)}</td>
                      <td style={tdStyle}>{fmtPercent(item.impactoPositivo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Performance dos Instrutores" subtitle="Leitura individual para apoio na apresentação.">
          {!filteredRows.length ? (
            <EmptyState message="Sem dados para exibir a visão por instrutor." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Instrutor</th>
                    <th style={thStyle}>Treinamentos</th>
                    <th style={thStyle}>Participantes</th>
                    <th style={thStyle}>Presenças</th>
                    <th style={thStyle}>Nota média</th>
                    <th style={thStyle}>Evolução média</th>
                    <th style={thStyle}>Impacto positivo</th>
                  </tr>
                </thead>
                <tbody>
                  {byInstructor.map((item) => (
                    <tr key={item.instrutor}>
                      <td style={tdStyle}><strong>{item.instrutor}</strong></td>
                      <td style={tdStyle}>{fmtNumber(item.treinamentos)}</td>
                      <td style={tdStyle}>{fmtNumber(item.participantes)}</td>
                      <td style={tdStyle}>{fmtNumber(item.presencas)}</td>
                      <td style={tdStyle}>{fmtScore(item.notaMedia)}</td>
                      <td style={tdStyle}>{fmtPercent(item.evolucaoMedia)}</td>
                      <td style={tdStyle}>{fmtPercent(item.impactoPositivo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Detalhamento da Base" subtitle="Tabela de apoio para consulta durante a reunião.">
          {!filteredRows.length ? (
            <EmptyState message="Sem linhas para detalhamento." />
          ) : (
            <div style={{ overflowX: "auto", maxHeight: 560 }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Data</th>
                    <th style={thStyle}>Cliente</th>
                    <th style={thStyle}>Tipo</th>
                    <th style={thStyle}>Instrutor</th>
                    <th style={thStyle}>Supervisor</th>
                    <th style={thStyle}>Turma</th>
                    <th style={thStyle}>Competência</th>
                    <th style={thStyle}>Participantes</th>
                    <th style={thStyle}>Presenças</th>
                    <th style={thStyle}>Faltas</th>
                    <th style={thStyle}>% presença</th>
                    <th style={thStyle}>Avaliação</th>
                    <th style={thStyle}>Indicador</th>
                    <th style={thStyle}>Antes</th>
                    <th style={thStyle}>Depois</th>
                    <th style={thStyle}>Janela</th>
                    <th style={thStyle}>Evolução</th>
                    <th style={thStyle}>Impacto</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((item) => (
                    <tr key={item.id}>
                      <td style={tdStyle}>{formatDateCell(item.data)}</td>
                      <td style={tdStyle}>{item.cliente || "—"}</td>
                      <td style={tdStyle}>{item.tipoTreinamento || "—"}</td>
                      <td style={tdStyle}>{item.instrutor || "—"}</td>
                      <td style={tdStyle}>{item.supervisor || "—"}</td>
                      <td style={tdStyle}>{item.turma || "—"}</td>
                      <td style={tdStyle}>{item.competencia || "—"}</td>
                      <td style={tdStyle}>{fmtNumber(item.participantes)}</td>
                      <td style={tdStyle}>{fmtNumber(item.presencas)}</td>
                      <td style={tdStyle}>{fmtNumber(item.faltas)}</td>
                      <td style={tdStyle}>{fmtPercent(item.presencaPct)}</td>
                      <td style={tdStyle}>{fmtScore(item.avaliacao)}</td>
                      <td style={tdStyle}>{item.indicador || "—"}</td>
                      <td style={tdStyle}>{fmtScore(item.antes)}</td>
                      <td style={tdStyle}>{fmtScore(item.depois)}</td>
                      <td style={tdStyle}>{fmtNumber(item.janelaDias)}</td>
                      <td style={tdStyle}>{fmtPercent(item.evolucaoPct)}</td>
                      <td style={tdStyle}>{toNumber(item.impactoPos) > 0 ? "Positivo" : "Neutro"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </PortalShell>
  );
}
