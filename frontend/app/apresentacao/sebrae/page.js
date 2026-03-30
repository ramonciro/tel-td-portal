
"use client";

import { useMemo, useState } from "react";
import PortalShell from "../../../../components/PortalShell";
import SectionCard from "../../../../components/SectionCard";
import StatCard from "../../../../components/StatCard";
import baseDados from "./base-dados.json";

function numberBR(value, digits = 0) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function percentBR(value, digits = 1) {
  return `${numberBR(Number(value || 0) * 100, digits)}%`;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function monthLabel(year, month) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" }).format(
    new Date(Number(year), Number(month) - 1, 1)
  );
}

function cardTone(accent) {
  return {
    borderRadius: 18,
    padding: 18,
    border: `1px solid ${accent}22`,
    background: "#fff",
    boxShadow: "0 10px 28px rgba(15,23,42,.06)",
  };
}

function pillStyle(bg, color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    background: bg,
    color,
    whiteSpace: "nowrap",
  };
}

const inputStyle = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
};

const labelStyle = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  color: "#334155",
  fontWeight: 700,
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 1080,
};

const thStyle = {
  textAlign: "left",
  padding: "12px 14px",
  background: "#eff6ff",
  color: "#1e3a8a",
  fontSize: 12,
  fontWeight: 800,
  borderBottom: "1px solid #dbeafe",
  position: "sticky",
  top: 0,
};

const tdStyle = {
  padding: "12px 14px",
  borderBottom: "1px solid #e2e8f0",
  color: "#0f172a",
  fontSize: 13,
  verticalAlign: "top",
};

function ChartBars({ items, valueKey, labelKey, formatter = (v) => v }) {
  const max = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 1);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {items.map((item) => {
        const value = Number(item[valueKey] || 0);
        const width = Math.max((value / max) * 100, value > 0 ? 8 : 0);
        return (
          <div key={String(item[labelKey])} style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
              <strong style={{ color: "#0f172a" }}>{item[labelKey]}</strong>
              <span style={{ color: "#475569", fontWeight: 700 }}>{formatter(value)}</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
              <div
                style={{
                  width: `${width}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #2563eb, #7c3aed)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ApresentacaoSebraePage() {
  const [filters, setFilters] = useState({
    tipo: "",
    instrutor: "",
    supervisor: "",
    indicador: "",
    busca: "",
  });

  const rows = useMemo(() => {
    return (baseDados || []).map((item) => ({
      id: Number(item.ID || 0),
      data: item.Data,
      mes: Number(item["Mês"] || 0),
      ano: Number(item.Ano || 0),
      cliente: item.Cliente || "SEBRAE",
      tipoTreinamento: item.Tipo_Treinamento || "Não informado",
      instrutor: item.Instrutor || "Não informado",
      supervisor: item.Supervisor || "Não informado",
      turma: item.Turma,
      participantes: Number(item.Participantes || 0),
      presencas: Number(item.Presenças || 0),
      faltas: Number(item.Faltas || 0),
      presencaPct: Number(item["% Presença"] || 0),
      avaliacao: Number(item["Avaliação (0-10)"] || 0),
      indicador: item.Indicador || "Não informado",
      antes: Number(item.Antes || 0),
      depois: Number(item.Depois || 0),
      janelaDias: Number(item["Janela (dias)"] || 0),
      observacoes: item.Observações || "",
      evolucaoPct: Number(item["Evolução %"] || 0),
      impactoPos: Number(item["Impacto_Pos (0/1)"] || 0),
    }));
  }, []);

  const options = useMemo(() => {
    const unique = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
    return {
      tipos: unique(rows.map((r) => r.tipoTreinamento)),
      instrutores: unique(rows.map((r) => r.instrutor)),
      supervisores: unique(rows.map((r) => r.supervisor)),
      indicadores: unique(rows.map((r) => r.indicador)),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((item) => {
      const text = normalize([
        item.tipoTreinamento,
        item.instrutor,
        item.supervisor,
        item.indicador,
        item.observacoes,
        item.turma,
      ].join(" "));
      return (
        (!filters.tipo || item.tipoTreinamento === filters.tipo) &&
        (!filters.instrutor || item.instrutor === filters.instrutor) &&
        (!filters.supervisor || item.supervisor === filters.supervisor) &&
        (!filters.indicador || item.indicador === filters.indicador) &&
        (!filters.busca || text.includes(normalize(filters.busca)))
      );
    });
  }, [rows, filters]);

  const summary = useMemo(() => {
    const totalTreinamentos = filtered.length;
    const participantes = filtered.reduce((acc, item) => acc + item.participantes, 0);
    const presencas = filtered.reduce((acc, item) => acc + item.presencas, 0);
    const faltas = filtered.reduce((acc, item) => acc + item.faltas, 0);
    const mediaPresenca = totalTreinamentos ? filtered.reduce((acc, item) => acc + item.presencaPct, 0) / totalTreinamentos : 0;
    const notaMedia = totalTreinamentos ? filtered.reduce((acc, item) => acc + item.avaliacao, 0) / totalTreinamentos : 0;
    const evolucaoMedia = totalTreinamentos ? filtered.reduce((acc, item) => acc + item.evolucaoPct, 0) / totalTreinamentos : 0;
    const impactoPositivo = totalTreinamentos ? filtered.reduce((acc, item) => acc + item.impactoPos, 0) / totalTreinamentos : 0;
    const instrutoresAtivos = new Set(filtered.map((item) => item.instrutor)).size;
    const tiposAtivos = new Set(filtered.map((item) => item.tipoTreinamento)).size;
    return {
      totalTreinamentos,
      participantes,
      presencas,
      faltas,
      mediaPresenca,
      notaMedia,
      evolucaoMedia,
      impactoPositivo,
      instrutoresAtivos,
      tiposAtivos,
    };
  }, [filtered]);

  const monthly = useMemo(() => {
    const map = new Map();
    filtered.forEach((item) => {
      const key = `${item.ano}-${item.mes}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: monthLabel(item.ano, item.mes),
          treinamentos: 0,
          participantes: 0,
          presencas: 0,
          avaliacaoTotal: 0,
          evolucaoTotal: 0,
          impactoTotal: 0,
        });
      }
      const curr = map.get(key);
      curr.treinamentos += 1;
      curr.participantes += item.participantes;
      curr.presencas += item.presencas;
      curr.avaliacaoTotal += item.avaliacao;
      curr.evolucaoTotal += item.evolucaoPct;
      curr.impactoTotal += item.impactoPos;
    });
    return [...map.values()]
      .map((item) => ({
        ...item,
        notaMedia: item.treinamentos ? item.avaliacaoTotal / item.treinamentos : 0,
        evolucaoMedia: item.treinamentos ? item.evolucaoTotal / item.treinamentos : 0,
        impactoPositivo: item.treinamentos ? item.impactoTotal / item.treinamentos : 0,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [filtered]);

  const byType = useMemo(() => {
    const map = new Map();
    filtered.forEach((item) => {
      if (!map.has(item.tipoTreinamento)) {
        map.set(item.tipoTreinamento, {
          tipo: item.tipoTreinamento,
          treinamentos: 0,
          participantes: 0,
          presencas: 0,
          notaTotal: 0,
          evolucaoTotal: 0,
          impactoTotal: 0,
        });
      }
      const curr = map.get(item.tipoTreinamento);
      curr.treinamentos += 1;
      curr.participantes += item.participantes;
      curr.presencas += item.presencas;
      curr.notaTotal += item.avaliacao;
      curr.evolucaoTotal += item.evolucaoPct;
      curr.impactoTotal += item.impactoPos;
    });
    return [...map.values()]
      .map((item) => ({
        ...item,
        notaMedia: item.treinamentos ? item.notaTotal / item.treinamentos : 0,
        evolucaoMedia: item.treinamentos ? item.evolucaoTotal / item.treinamentos : 0,
        impactoPositivo: item.treinamentos ? item.impactoTotal / item.treinamentos : 0,
      }))
      .sort((a, b) => b.treinamentos - a.treinamentos || a.tipo.localeCompare(b.tipo, "pt-BR"));
  }, [filtered]);

  const byInstructor = useMemo(() => {
    const map = new Map();
    filtered.forEach((item) => {
      if (!map.has(item.instrutor)) {
        map.set(item.instrutor, {
          instrutor: item.instrutor,
          treinamentos: 0,
          participantes: 0,
          presencas: 0,
          notaTotal: 0,
          evolucaoTotal: 0,
          impactoTotal: 0,
        });
      }
      const curr = map.get(item.instrutor);
      curr.treinamentos += 1;
      curr.participantes += item.participantes;
      curr.presencas += item.presencas;
      curr.notaTotal += item.avaliacao;
      curr.evolucaoTotal += item.evolucaoPct;
      curr.impactoTotal += item.impactoPos;
    });
    return [...map.values()]
      .map((item) => ({
        ...item,
        notaMedia: item.treinamentos ? item.notaTotal / item.treinamentos : 0,
        evolucaoMedia: item.treinamentos ? item.evolucaoTotal / item.treinamentos : 0,
        impactoPositivo: item.treinamentos ? item.impactoTotal / item.treinamentos : 0,
      }))
      .sort((a, b) => b.treinamentos - a.treinamentos || b.evolucaoMedia - a.evolucaoMedia);
  }, [filtered]);

  return (
    <PortalShell
      title="Apresentação Sebrae"
      subtitle="Página apartada para apresentação executiva, alimentada somente pela base temporária do Sebrae."
    >
      <div style={{ display: "grid", gap: 18 }}>
        <section
          style={{
            borderRadius: 24,
            padding: 24,
            background: "linear-gradient(135deg, #0f172a, #1d4ed8)",
            color: "#fff",
            display: "grid",
            gap: 16,
            boxShadow: "0 16px 36px rgba(15,23,42,.22)",
          }}
        >
          <div style={pillStyle("rgba(255,255,255,.14)", "#fff")}>Visão exclusiva do cliente</div>
          <div style={{ display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>Resultados de Treinamento — Sebrae</h2>
            <p style={{ margin: 0, color: "#dbeafe", maxWidth: 860 }}>
              Esta página é temporária e isolada do restante do portal. Os indicadores abaixo foram recalculados exclusivamente a partir da base do Sebrae, sem vínculo com as tabelas operacionais do sistema.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={pillStyle("rgba(255,255,255,.12)", "#fff")}>Base carregada: {numberBR(rows.length)} registros</span>
            <span style={pillStyle("rgba(255,255,255,.12)", "#fff")}>Cliente: SEBRAE</span>
            <span style={pillStyle("rgba(255,255,255,.12)", "#fff")}>
              Período: {filtered.length ? `${formatDate(filtered[0].data)} até ${formatDate(filtered[filtered.length - 1].data)}` : "Sem dados"}
            </span>
          </div>
        </section>

        <SectionCard title="Filtros da apresentação" subtitle="Selecione recortes para a reunião sem afetar o restante do portal.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label style={labelStyle}>
              Tipo de treinamento
              <select value={filters.tipo} onChange={(e) => setFilters((prev) => ({ ...prev, tipo: e.target.value }))} style={inputStyle}>
                <option value="">Todos</option>
                {options.tipos.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Instrutor
              <select value={filters.instrutor} onChange={(e) => setFilters((prev) => ({ ...prev, instrutor: e.target.value }))} style={inputStyle}>
                <option value="">Todos</option>
                {options.instrutores.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Supervisor
              <select value={filters.supervisor} onChange={(e) => setFilters((prev) => ({ ...prev, supervisor: e.target.value }))} style={inputStyle}>
                <option value="">Todos</option>
                {options.supervisores.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Indicador
              <select value={filters.indicador} onChange={(e) => setFilters((prev) => ({ ...prev, indicador: e.target.value }))} style={inputStyle}>
                <option value="">Todos</option>
                {options.indicadores.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label style={{ ...labelStyle, gridColumn: "span 2" }}>
              Busca livre
              <input
                value={filters.busca}
                onChange={(e) => setFilters((prev) => ({ ...prev, busca: e.target.value }))}
                placeholder="Turma, observação, tipo, instrutor..."
                style={inputStyle}
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard title="Resumo executivo" subtitle="Leitura rápida dos principais resultados da base filtrada.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <StatCard title="Treinamentos" value={numberBR(summary.totalTreinamentos)} accent="#2563eb" />
            <StatCard title="Participantes" value={numberBR(summary.participantes)} accent="#0f766e" />
            <StatCard title="Presenças" value={numberBR(summary.presencas)} accent="#16a34a" />
            <StatCard title="Faltas" value={numberBR(summary.faltas)} accent="#dc2626" />
            <StatCard title="Presença média" value={percentBR(summary.mediaPresenca)} accent="#7c3aed" />
            <StatCard title="Nota média" value={numberBR(summary.notaMedia, 2)} accent="#ea580c" />
            <StatCard title="Evolução média" value={percentBR(summary.evolucaoMedia)} accent="#0891b2" />
            <StatCard title="Impacto positivo" value={percentBR(summary.impactoPositivo)} accent="#65a30d" />
          </div>
        </SectionCard>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 18 }}>
          <SectionCard title="Evolução mensal" subtitle="Volume e efetividade por mês da base filtrada.">
            {monthly.length === 0 ? (
              <div style={{ color: "#64748b" }}>Nenhum dado encontrado para os filtros selecionados.</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <ChartBars items={monthly} valueKey="treinamentos" labelKey="label" formatter={(v) => `${numberBR(v)} trein.`} />
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Mês</th>
                        <th style={thStyle}>Treinamentos</th>
                        <th style={thStyle}>Participantes</th>
                        <th style={thStyle}>Presenças</th>
                        <th style={thStyle}>Nota média</th>
                        <th style={thStyle}>Evolução média</th>
                        <th style={thStyle}>Impacto positivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((item) => (
                        <tr key={item.key}>
                          <td style={tdStyle}><strong>{item.label}</strong></td>
                          <td style={tdStyle}>{numberBR(item.treinamentos)}</td>
                          <td style={tdStyle}>{numberBR(item.participantes)}</td>
                          <td style={tdStyle}>{numberBR(item.presencas)}</td>
                          <td style={tdStyle}>{numberBR(item.notaMedia, 2)}</td>
                          <td style={tdStyle}>{percentBR(item.evolucaoMedia)}</td>
                          <td style={tdStyle}>{percentBR(item.impactoPositivo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Leitura rápida" subtitle="Indicadores de apoio para narrativa da apresentação.">
            <div style={{ display: "grid", gap: 12 }}>
              <div style={cardTone("#2563eb")}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800, textTransform: "uppercase" }}>Tipos ativos</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", marginTop: 8 }}>{numberBR(summary.tiposAtivos)}</div>
              </div>
              <div style={cardTone("#16a34a")}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800, textTransform: "uppercase" }}>Instrutores ativos</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", marginTop: 8 }}>{numberBR(summary.instrutoresAtivos)}</div>
              </div>
              <div style={cardTone("#7c3aed")}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 800, textTransform: "uppercase" }}>Base filtrada</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", marginTop: 8 }}>{numberBR(filtered.length)} linhas</div>
                <div style={{ marginTop: 6, color: "#64748b", fontSize: 13 }}>Ideal para uma apresentação limpa e isolada do portal principal.</div>
              </div>
            </div>
          </SectionCard>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <SectionCard title="Resultados por tipo de treinamento" subtitle="Volume, avaliação e efetividade por tema.">
            {byType.length === 0 ? (
              <div style={{ color: "#64748b" }}>Nenhum dado encontrado.</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <ChartBars items={byType.slice(0, 8)} valueKey="treinamentos" labelKey="tipo" formatter={(v) => numberBR(v)} />
                <div style={{ overflowX: "auto" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Tipo</th>
                        <th style={thStyle}>Treinamentos</th>
                        <th style={thStyle}>Participantes</th>
                        <th style={thStyle}>Nota média</th>
                        <th style={thStyle}>Evolução média</th>
                        <th style={thStyle}>Impacto positivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byType.map((item) => (
                        <tr key={item.tipo}>
                          <td style={tdStyle}><strong>{item.tipo}</strong></td>
                          <td style={tdStyle}>{numberBR(item.treinamentos)}</td>
                          <td style={tdStyle}>{numberBR(item.participantes)}</td>
                          <td style={tdStyle}>{numberBR(item.notaMedia, 2)}</td>
                          <td style={tdStyle}>{percentBR(item.evolucaoMedia)}</td>
                          <td style={tdStyle}>{percentBR(item.impactoPositivo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Performance dos instrutores" subtitle="Acompanhamento por instrutor para a reunião com o cliente.">
            {byInstructor.length === 0 ? (
              <div style={{ color: "#64748b" }}>Nenhum dado encontrado.</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <ChartBars items={byInstructor.slice(0, 8)} valueKey="participantes" labelKey="instrutor" formatter={(v) => `${numberBR(v)} part.`} />
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
                          <td style={tdStyle}>{numberBR(item.treinamentos)}</td>
                          <td style={tdStyle}>{numberBR(item.participantes)}</td>
                          <td style={tdStyle}>{numberBR(item.presencas)}</td>
                          <td style={tdStyle}>{numberBR(item.notaMedia, 2)}</td>
                          <td style={tdStyle}>{percentBR(item.evolucaoMedia)}</td>
                          <td style={tdStyle}>{percentBR(item.impactoPositivo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Base detalhada para apoio na apresentação" subtitle="Consulta detalhada dos registros filtrados para perguntas do cliente.">
          <div style={{ overflowX: "auto", maxHeight: 560, border: "1px solid #e2e8f0", borderRadius: 18 }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Data</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Instrutor</th>
                  <th style={thStyle}>Supervisor</th>
                  <th style={thStyle}>Turma</th>
                  <th style={thStyle}>Participantes</th>
                  <th style={thStyle}>Presenças</th>
                  <th style={thStyle}>Faltas</th>
                  <th style={thStyle}>% Presença</th>
                  <th style={thStyle}>Avaliação</th>
                  <th style={thStyle}>Indicador</th>
                  <th style={thStyle}>Antes</th>
                  <th style={thStyle}>Depois</th>
                  <th style={thStyle}>Evolução</th>
                  <th style={thStyle}>Impacto positivo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td style={tdStyle}>{formatDate(item.data)}</td>
                    <td style={tdStyle}>{item.tipoTreinamento}</td>
                    <td style={tdStyle}>{item.instrutor}</td>
                    <td style={tdStyle}>{item.supervisor}</td>
                    <td style={tdStyle}>{item.turma}</td>
                    <td style={tdStyle}>{numberBR(item.participantes)}</td>
                    <td style={tdStyle}>{numberBR(item.presencas)}</td>
                    <td style={tdStyle}>{numberBR(item.faltas)}</td>
                    <td style={tdStyle}>{percentBR(item.presencaPct)}</td>
                    <td style={tdStyle}>{numberBR(item.avaliacao, 2)}</td>
                    <td style={tdStyle}>{item.indicador}</td>
                    <td style={tdStyle}>{numberBR(item.antes, 2)}</td>
                    <td style={tdStyle}>{numberBR(item.depois, 2)}</td>
                    <td style={tdStyle}>{percentBR(item.evolucaoPct)}</td>
                    <td style={tdStyle}>
                      <span style={pillStyle(item.impactoPos ? "#ecfdf5" : "#f8fafc", item.impactoPos ? "#166534" : "#475569")}>
                        {item.impactoPos ? "Positivo" : "Neutro"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </PortalShell>
  );
}
