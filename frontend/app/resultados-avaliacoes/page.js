"use client";

import { useEffect, useMemo, useState } from "react";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import PortalShell from "../../components/PortalShell";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function avg(arr, field) {
  if (!arr.length) return 0;
  const total = arr.reduce((acc, item) => acc + Number(item?.[field] || 0), 0);
  return total / arr.length;
}

function getNotaFinal(item) {
  return Number(item?.nota_final || 0);
}

function classificarResultado(item) {
  const nota = getNotaFinal(item);
  if (nota >= 8) return "Aprovado";
  if (nota >= 6) return "Atenção";
  return "Reforço";
}

function badgeClassificacao(label) {
  const base = {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };

  if (label === "Aprovado") {
    return { ...base, background: "#dcfce7", color: "#166534" };
  }

  if (label === "Atenção") {
    return { ...base, background: "#fff7ed", color: "#c2410c" };
  }

  return { ...base, background: "#fee2e2", color: "#b91c1c" };
}

function getTreinamento(item, treinamentos) {
  return treinamentos.find(
    (t) => String(t.id) === String(item.treinamento_id)
  );
}

function getMaterial(item, materiais) {
  return materiais.find(
    (m) => String(m.id) === String(item.material_id)
  );
}

export default function ResultadosDasAvaliacoesPage() {
  const [treinamentos, setTreinamentos] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [respostas, setRespostas] = useState([]);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [filtroTreinamento, setFiltroTreinamento] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        setErro("");
        setLoading(true);

        const [treinamentosData, materiaisData, respostasData] = await Promise.all([
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/materiais-avaliativos").catch(() => []),
          apiFetch("/respostas-avaliativas").catch(() => []),
        ]);

        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
        setMateriais(Array.isArray(materiaisData) ? materiaisData : []);
        setRespostas(Array.isArray(respostasData) ? respostasData : []);
      } catch (error) {
        setErro(error.message || "Erro ao carregar resultados das avaliações.");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const clienteOptions = useMemo(() => {
    const lista = [...new Set(
      treinamentos.map((item) => item.cliente).filter(Boolean)
    )];
    return lista.sort((a, b) => String(a).localeCompare(String(b)));
  }, [treinamentos]);

  const treinamentoOptions = useMemo(() => {
    const lista = treinamentos.map((item) => ({
      value: String(item.id),
      label: `${item.tema || "Treinamento"}${item.cliente ? ` - ${item.cliente}` : ""}`,
    }));

    return lista.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [treinamentos]);

  const baseFiltrada = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return respostas.filter((item) => {
      const treinamento = getTreinamento(item, treinamentos);
      const material = getMaterial(item, materiais);
      const status = classificarResultado(item);

      const matchCliente =
        filtroCliente === "todos" ||
        String(treinamento?.cliente || "") === filtroCliente;

      const matchTreinamento =
        filtroTreinamento === "todos" ||
        String(item.treinamento_id) === filtroTreinamento;

      const matchStatus =
        filtroStatus === "todos" ||
        status === filtroStatus;

      const alvoBusca = [
        item.treinando_nome,
        material?.titulo,
        treinamento?.tema,
        treinamento?.cliente,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchBusca = !termo || alvoBusca.includes(termo);

      return matchCliente && matchTreinamento && matchStatus && matchBusca;
    });
  }, [
    respostas,
    treinamentos,
    materiais,
    filtroCliente,
    filtroTreinamento,
    filtroStatus,
    busca,
  ]);

  const kpis = useMemo(() => {
    const totalRespostas = baseFiltrada.length;
    const mediaAcertos = avg(baseFiltrada, "acertos").toFixed(1);
    const mediaPercentual = avg(baseFiltrada, "percentual").toFixed(1);
    const mediaNotaFinal = avg(baseFiltrada, "nota_final").toFixed(1);

    const aprovados = baseFiltrada.filter(
      (item) => classificarResultado(item) === "Aprovado"
    ).length;

    const atencao = baseFiltrada.filter(
      (item) => classificarResultado(item) === "Atenção"
    ).length;

    const reforco = baseFiltrada.filter(
      (item) => classificarResultado(item) === "Reforço"
    ).length;

    const porProvaMap = {};
    const porTurmaMap = {};

    baseFiltrada.forEach((item) => {
      const treinamento = getTreinamento(item, treinamentos);
      const material = getMaterial(item, materiais);

      const chaveProva = String(item.material_id || "sem-material");
      const chaveTurma = String(item.treinamento_id || "sem-treinamento");

      if (!porProvaMap[chaveProva]) {
        porProvaMap[chaveProva] = {
          titulo: material?.titulo || `Material #${item.material_id || "-"}`,
          total: 0,
          somaNota: 0,
          somaPercentual: 0,
        };
      }

      porProvaMap[chaveProva].total += 1;
      porProvaMap[chaveProva].somaNota += Number(item.nota_final || 0);
      porProvaMap[chaveProva].somaPercentual += Number(item.percentual || 0);

      if (!porTurmaMap[chaveTurma]) {
        porTurmaMap[chaveTurma] = {
          turma: treinamento?.tema || `Turma #${item.treinamento_id || "-"}`,
          total: 0,
          somaNota: 0,
          somaPercentual: 0,
        };
      }

      porTurmaMap[chaveTurma].total += 1;
      porTurmaMap[chaveTurma].somaNota += Number(item.nota_final || 0);
      porTurmaMap[chaveTurma].somaPercentual += Number(item.percentual || 0);
    });

    const rankingProva = Object.values(porProvaMap)
      .map((item) => ({
        ...item,
        mediaNota: item.total ? (item.somaNota / item.total).toFixed(1) : "0.0",
        mediaPercentual: item.total
          ? (item.somaPercentual / item.total).toFixed(1)
          : "0.0",
      }))
      .sort((a, b) => Number(b.mediaNota) - Number(a.mediaNota));

    const rankingTurma = Object.values(porTurmaMap)
      .map((item) => ({
        ...item,
        mediaNota: item.total ? (item.somaNota / item.total).toFixed(1) : "0.0",
        mediaPercentual: item.total
          ? (item.somaPercentual / item.total).toFixed(1)
          : "0.0",
      }))
      .sort((a, b) => Number(b.mediaNota) - Number(a.mediaNota));

    return {
      totalRespostas,
      mediaAcertos,
      mediaPercentual,
      mediaNotaFinal,
      aprovados,
      atencao,
      reforco,
      rankingProva,
      rankingTurma,
    };
  }, [baseFiltrada, treinamentos, materiais]);

  return (
    <PortalShell
      title="Resultados das Avaliações"
      subtitle="Consolidado dos resultados de provas e simulados com leitura prática do desempenho."
    >
      {loading ? (
        <div style={loadingBox}>Carregando resultados...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <SectionCard
            title="Filtros"
            subtitle="Refine a visualização por cliente, turma, status ou busca."
          >
            <div style={filtersGrid}>
              <div style={fieldWrap}>
                <label style={label}>Cliente</label>
                <select
                  value={filtroCliente}
                  onChange={(e) => setFiltroCliente(e.target.value)}
                  style={input}
                >
                  <option value="todos">Todos</option>
                  {clienteOptions.map((cliente) => (
                    <option key={cliente} value={cliente}>
                      {cliente}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={label}>Turma</label>
                <select
                  value={filtroTreinamento}
                  onChange={(e) => setFiltroTreinamento(e.target.value)}
                  style={input}
                >
                  <option value="todos">Todas</option>
                  {treinamentoOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={label}>Status</label>
                <select
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                  style={input}
                >
                  <option value="todos">Todos</option>
                  <option value="Aprovado">Aprovado</option>
                  <option value="Atenção">Atenção</option>
                  <option value="Reforço">Reforço</option>
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={label}>Busca</label>
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por treinando, prova, turma ou cliente"
                  style={input}
                />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                style={btnSecundario}
                onClick={() => {
                  setFiltroCliente("todos");
                  setFiltroTreinamento("todos");
                  setFiltroStatus("todos");
                  setBusca("");
                }}
              >
                Limpar filtros
              </button>
            </div>
          </SectionCard>

          <div style={heroGrid}>
            <StatCard
              title="Respostas"
              value={fmt(kpis.totalRespostas)}
              subtitle="Envios realizados"
              accent="#2563eb"
            />
            <StatCard
              title="Média de acertos"
              value={kpis.mediaAcertos}
              subtitle="Acertos por tentativa"
              accent="#0891b2"
            />
            <StatCard
              title="Média percentual"
              value={`${kpis.mediaPercentual}%`}
              subtitle="Taxa média de acerto"
              accent="#06b6d4"
            />
            <StatCard
              title="Média nota final"
              value={kpis.mediaNotaFinal}
              subtitle="Nota média das avaliações"
              accent="#7c3aed"
            />
          </div>

          <div style={heroGrid}>
            <StatCard
              title="Aprovados"
              value={fmt(kpis.aprovados)}
              subtitle="Nota final ≥ 8"
              accent="#16a34a"
            />
            <StatCard
              title="Atenção"
              value={fmt(kpis.atencao)}
              subtitle="Nota entre 6 e 7,9"
              accent="#f59e0b"
            />
            <StatCard
              title="Reforço"
              value={fmt(kpis.reforco)}
              subtitle="Nota abaixo de 6"
              accent="#b91c1c"
            />
            <StatCard
              title="Base filtrada"
              value={fmt(baseFiltrada.length)}
              subtitle="Registros considerados"
              accent="#475569"
            />
          </div>

          <div style={twoCol}>
            <SectionCard
              title="Ranking por prova"
              subtitle="Média de nota e percentual por material aplicado."
            >
              <div style={listGrid}>
                {kpis.rankingProva.length ? (
                  kpis.rankingProva.slice(0, 8).map((item) => (
                    <div key={item.titulo} style={listItem}>
                      <div style={itemTitle}>{item.titulo}</div>
                      <div style={itemMeta}>
                        {fmt(item.total)} resposta(s) • {item.mediaPercentual}% média de acerto
                      </div>
                      <div style={itemBadgeBlue}>{item.mediaNota}</div>
                    </div>
                  ))
                ) : (
                  <div style={emptyText}>Nenhuma prova respondida ainda.</div>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Ranking por turma"
              subtitle="Desempenho consolidado por turma."
            >
              <div style={listGrid}>
                {kpis.rankingTurma.length ? (
                  kpis.rankingTurma.slice(0, 8).map((item) => (
                    <div key={item.turma} style={listItem}>
                      <div style={itemTitle}>{item.turma}</div>
                      <div style={itemMeta}>
                        {fmt(item.total)} resposta(s) • {item.mediaPercentual}% média de acerto
                      </div>
                      <div style={itemBadgePurple}>{item.mediaNota}</div>
                    </div>
                  ))
                ) : (
                  <div style={emptyText}>Nenhuma turma com respostas ainda.</div>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard
            title="Base detalhada de respostas"
            subtitle="Visão individual do desempenho dos treinandos."
          >
            {baseFiltrada.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Treinando</th>
                      <th style={th}>Prova</th>
                      <th style={th}>Turma</th>
                      <th style={th}>Acertos</th>
                      <th style={th}>Percentual</th>
                      <th style={th}>Nota</th>
                      <th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baseFiltrada.map((item) => {
                      const treinamento = getTreinamento(item, treinamentos);
                      const material = getMaterial(item, materiais);
                      const status = classificarResultado(item);

                      return (
                        <tr key={item.id}>
                          <td style={td}>{item.treinando_nome || "-"}</td>
                          <td style={td}>{material?.titulo || `Material #${item.material_id || "-"}`}</td>
                          <td style={td}>{treinamento?.tema || "-"}</td>
                          <td style={td}>
                            {fmt(item.acertos || 0)}/{fmt(item.total_questoes || 0)}
                          </td>
                          <td style={td}>{Number(item.percentual || 0).toFixed(1)}%</td>
                          <td style={td}>{Number(item.nota_final || 0).toFixed(1)}</td>
                          <td style={td}>
                            <span style={badgeClassificacao(status)}>{status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={emptyText}>Nenhuma resposta registrada para os filtros aplicados.</div>
            )}
          </SectionCard>
        </div>
      )}
    </PortalShell>
  );
}

const heroGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const filtersGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldWrap = {
  display: "grid",
  gap: 6,
};

const label = {
  fontWeight: 800,
  color: "#0f172a",
  fontSize: 14,
};

const input = {
  width: "100%",
  height: 42,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "0 12px",
  fontSize: 14,
  color: "#0f172a",
  outline: "none",
  background: "#ffffff",
  boxSizing: "border-box",
};

const btnSecundario = {
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 16px",
  background: "#ffffff",
  color: "#334155",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 14,
};

const listGrid = {
  display: "grid",
  gap: 10,
};

const listItem = {
  background: "#f8fafc",
  padding: 12,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
  display: "grid",
  gap: 6,
};

const itemTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const itemMeta = {
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.45,
};

const itemBadgeBlue = {
  display: "inline-block",
  justifySelf: "start",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 12,
};

const itemBadgePurple = {
  display: "inline-block",
  justifySelf: "start",
  padding: "4px 10px",
  borderRadius: 999,
  background: "#f5f3ff",
  color: "#7c3aed",
  fontWeight: 800,
  fontSize: 12,
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "1px solid #e2e8f0",
  color: "#475569",
  fontSize: 13,
};

const td = {
  padding: "12px 10px",
  borderBottom: "1px solid #f1f5f9",
  color: "#0f172a",
  fontSize: 14,
};

const loadingBox = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 18,
  color: "#475569",
  fontWeight: 700,
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 16,
  padding: 16,
  fontWeight: 700,
};

const emptyText = {
  color: "#64748b",
};
