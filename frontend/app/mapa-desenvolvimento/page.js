"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function avg(arr, field) {
  if (!arr.length) return 0;
  const total = arr.reduce((acc, item) => acc + Number(item?.[field] || 0), 0);
  return total / arr.length;
}

function maturityLabel(totalTreinamentos, assiduidade, mediaQualidade) {
  if (totalTreinamentos >= 6 && assiduidade >= 90 && mediaQualidade >= 8.5) {
    return "Especialista";
  }
  if (totalTreinamentos >= 4 && assiduidade >= 85 && mediaQualidade >= 7.5) {
    return "Avançado";
  }
  if (totalTreinamentos >= 2 && assiduidade >= 70) {
    return "Em desenvolvimento";
  }
  return "Inicial";
}

function maturityStyle(label) {
  const base = {
    display: "inline-block",
    padding: "5px 9px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 11,
  };

  if (label === "Especialista") {
    return { ...base, background: "#dcfce7", color: "#166534" };
  }
  if (label === "Avançado") {
    return { ...base, background: "#dbeafe", color: "#1d4ed8" };
  }
  if (label === "Em desenvolvimento") {
    return { ...base, background: "#ffedd5", color: "#9a3412" };
  }
  return { ...base, background: "#fee2e2", color: "#b91c1c" };
}

function progressColor(percent) {
  if (percent >= 85) return "#16a34a";
  if (percent >= 70) return "#2563eb";
  if (percent >= 50) return "#ea580c";
  return "#dc2626";
}

export default function MapaDesenvolvimentoPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [treinamentos, setTreinamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [trilhas, setTrilhas] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const [usuariosData, treinamentosData, presencasData, avaliacoesData, trilhasData] =
          await Promise.all([
            apiFetch("/usuarios").catch(() => []),
            apiFetch("/treinamentos").catch(() => []),
            apiFetch("/presencas").catch(() => []),
            apiFetch("/avaliacoes").catch(() => []),
            apiFetch("/trilhas").catch(() => []),
          ]);

        setUsuarios(Array.isArray(usuariosData) ? usuariosData : []);
        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
        setPresencas(Array.isArray(presencasData) ? presencasData : []);
        setAvaliacoes(Array.isArray(avaliacoesData) ? avaliacoesData : []);
        setTrilhas(Array.isArray(trilhasData) ? trilhasData : []);
        setErro("");
      } catch (error) {
        setErro(error.message || "Erro ao carregar mapa de desenvolvimento.");
      }
    }

    carregar();
  }, []);

  const colaboradores = useMemo(() => {
    const baseUsuarios = usuarios.filter((u) => {
      const perfil = String(u.perfil || "").toLowerCase();
      return !["admin", "coordenador", "supervisor"].includes(perfil);
    });

    return baseUsuarios
      .map((u) => {
        const nome = String(u.nome || "").trim();
        const cliente = u.cliente || "Sem cliente";

        const presencasColaborador = presencas.filter(
          (p) => String(p.treinando_nome || "").trim().toLowerCase() === nome.toLowerCase()
        );

        const idsTreinamentos = [
          ...new Set(
            presencasColaborador
              .map((p) => p.treinamento_id)
              .filter((id) => id !== null && id !== undefined && id !== "")
              .map(String)
          ),
        ];

        const treinamentosRelacionados = treinamentos.filter((t) =>
          idsTreinamentos.includes(String(t.id))
        );

        const avaliacoesRelacionadas = avaliacoes.filter((a) =>
          idsTreinamentos.includes(String(a.treinamento_id))
        );

        const presentes = presencasColaborador.filter(
          (p) => String(p.status || "").toLowerCase() === "presente"
        ).length;

        const totalPresencas = presencasColaborador.length;
        const assiduidade = totalPresencas
          ? Math.round((presentes / totalPresencas) * 100)
          : 0;

        const mediaQualidade = avaliacoesRelacionadas.length
          ? avg(avaliacoesRelacionadas, "nota_qualidade")
          : 0;

        const mediaNps = avaliacoesRelacionadas.length
          ? avg(avaliacoesRelacionadas, "nota_nps")
          : 0;

        const trilhasDoCliente = trilhas.filter(
          (t) => String(t.cliente || "GLOBAL").toLowerCase() === String(cliente).toLowerCase()
        );

        const trilhasAtribuidas = trilhasDoCliente.length;
        const trilhasConcluidas =
          trilhasDoCliente.length && treinamentosRelacionados.length >= 4
            ? Math.min(trilhasDoCliente.length, 1)
            : 0;

        const progresso =
          trilhasAtribuidas > 0
            ? Math.round((trilhasConcluidas / trilhasAtribuidas) * 100)
            : 0;

        const maturidade = maturityLabel(
          treinamentosRelacionados.length,
          assiduidade,
          mediaQualidade
        );

        const gaps = [];
        if (trilhasAtribuidas === 0) gaps.push("Sem trilha atribuída");
        if (treinamentosRelacionados.length < 2) gaps.push("Baixa exposição a treinamento");
        if (assiduidade < 70) gaps.push("Assiduidade abaixo do esperado");
        if (avaliacoesRelacionadas.length > 0 && mediaQualidade < 7)
          gaps.push("Baixo aproveitamento");
        if (!gaps.length) gaps.push("Sem gaps críticos");

        return {
          id: u.id,
          nome,
          cliente,
          perfil: u.perfil || "Colaborador",
          treinamentos: treinamentosRelacionados.length,
          assiduidade,
          mediaQualidade: mediaQualidade.toFixed(1),
          mediaNps: mediaNps.toFixed(1),
          trilhasAtribuidas,
          trilhasConcluidas,
          progresso,
          maturidade,
          gaps,
        };
      })
      .sort((a, b) => {
        const order = {
          Especialista: 4,
          Avançado: 3,
          "Em desenvolvimento": 2,
          Inicial: 1,
        };
        return (order[b.maturidade] || 0) - (order[a.maturidade] || 0);
      });
  }, [usuarios, treinamentos, presencas, avaliacoes, trilhas]);

  const kpis = useMemo(() => {
    const total = colaboradores.length;
    const especialistas = colaboradores.filter((c) => c.maturidade === "Especialista").length;
    const avancados = colaboradores.filter((c) => c.maturidade === "Avançado").length;
    const emDesenvolvimento = colaboradores.filter(
      (c) => c.maturidade === "Em desenvolvimento"
    ).length;
    const iniciais = colaboradores.filter((c) => c.maturidade === "Inicial").length;

    const comTrilha = colaboradores.filter((c) => c.trilhasAtribuidas > 0).length;
    const semTrilha = colaboradores.filter((c) => c.trilhasAtribuidas === 0).length;

    const porClienteMap = {};
    colaboradores.forEach((c) => {
      if (!porClienteMap[c.cliente]) {
        porClienteMap[c.cliente] = {
          cliente: c.cliente,
          colaboradores: 0,
          especialistas: 0,
          avancados: 0,
          emDesenvolvimento: 0,
          iniciais: 0,
          progresso: 0,
        };
      }

      porClienteMap[c.cliente].colaboradores += 1;
      porClienteMap[c.cliente].progresso += c.progresso;

      if (c.maturidade === "Especialista") porClienteMap[c.cliente].especialistas += 1;
      else if (c.maturidade === "Avançado") porClienteMap[c.cliente].avancados += 1;
      else if (c.maturidade === "Em desenvolvimento")
        porClienteMap[c.cliente].emDesenvolvimento += 1;
      else porClienteMap[c.cliente].iniciais += 1;
    });

    const porCliente = Object.values(porClienteMap)
      .map((item) => ({
        ...item,
        progressoMedio: item.colaboradores
          ? Math.round(item.progresso / item.colaboradores)
          : 0,
      }))
      .sort((a, b) => b.colaboradores - a.colaboradores);

    const alertas = [];
    if (semTrilha > 0) {
      alertas.push(`${semTrilha} colaborador(es) ainda sem trilha atribuída.`);
    }

    const baixaAssiduidade = colaboradores.filter((c) => c.assiduidade < 70).length;
    if (baixaAssiduidade > 0) {
      alertas.push(`${baixaAssiduidade} colaborador(es) com assiduidade abaixo de 70%.`);
    }

    const baixoAproveitamento = colaboradores.filter(
      (c) => Number(c.mediaQualidade) > 0 && Number(c.mediaQualidade) < 7
    ).length;
    if (baixoAproveitamento > 0) {
      alertas.push(`${baixoAproveitamento} colaborador(es) com aproveitamento abaixo da meta.`);
    }

    if (!alertas.length) {
      alertas.push("Mapa saudável, sem alertas críticos no momento.");
    }

    return {
      total,
      especialistas,
      avancados,
      emDesenvolvimento,
      iniciais,
      comTrilha,
      semTrilha,
      porCliente,
      alertas,
    };
  }, [colaboradores]);

  return (
    <PortalShell
      title="Mapa de desenvolvimento"
      subtitle="Leitura estratégica da maturidade, cobertura de trilhas e evolução dos colaboradores."
    >
      {erro ? <div style={errorBox}>{erro}</div> : null}

      <div style={heroGrid}>
        <StatCard
          title="Colaboradores"
          value={fmt(kpis.total)}
          subtitle="Base mapeada"
          accent="#2563eb"
        />
        <StatCard
          title="Especialistas"
          value={fmt(kpis.especialistas)}
          subtitle="Maior maturidade"
          accent="#16a34a"
        />
        <StatCard
          title="Avançados"
          value={fmt(kpis.avancados)}
          subtitle="Boa evolução"
          accent="#1d4ed8"
        />
        <StatCard
          title="Em desenvolvimento"
          value={fmt(kpis.emDesenvolvimento)}
          subtitle="Em evolução"
          accent="#ea580c"
        />
        <StatCard
          title="Iniciais"
          value={fmt(kpis.iniciais)}
          subtitle="Prioridade de desenvolvimento"
          accent="#dc2626"
        />
        <StatCard
          title="Sem trilha"
          value={fmt(kpis.semTrilha)}
          subtitle="Cobertura pendente"
          accent="#7c3aed"
        />
      </div>

      <div style={twoCol}>
        <SectionCard
          title="Maturidade por cliente"
          subtitle="Distribuição do desenvolvimento por operação."
        >
          <div style={listGrid}>
            {kpis.porCliente.length ? (
              kpis.porCliente.map((item) => (
                <div key={item.cliente} style={clientCard}>
                  <div style={clientTop}>
                    <div>
                      <div style={itemTitle}>{item.cliente}</div>
                      <div style={itemMeta}>
                        {item.colaboradores} colaborador(es) • {item.progressoMedio}% progresso médio
                      </div>
                    </div>
                    <div style={progressBadge}>{item.progressoMedio}%</div>
                  </div>

                  <div style={maturityRow}>
                    <span style={miniTagGreen}>{item.especialistas} esp.</span>
                    <span style={miniTagBlue}>{item.avancados} av.</span>
                    <span style={miniTagOrange}>{item.emDesenvolvimento} des.</span>
                    <span style={miniTagRed}>{item.iniciais} inic.</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={emptyText}>Nenhum cliente disponível.</div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Alertas e lacunas"
          subtitle="Pontos prioritários para atuação do T&D."
        >
          <div style={alertGrid}>
            {kpis.alertas.map((item, index) => (
              <div key={index} style={alertItem}>
                {item}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Radar de desenvolvimento por colaborador"
        subtitle="Leitura individual com maturidade, trilhas, assiduidade e aproveitamento."
      >
        {colaboradores.length ? (
          <div style={cardsGrid}>
            {colaboradores.map((item) => (
              <div key={item.id || item.nome} style={card}>
                <div style={cardTop}>
                  <div>
                    <div style={cardTitle}>{item.nome}</div>
                    <div style={cardMeta}>
                      {item.perfil} • {item.cliente}
                    </div>
                  </div>
                  <span style={maturityStyle(item.maturidade)}>{item.maturidade}</span>
                </div>

                <div style={metricsGrid}>
                  <div style={metricBox}>
                    <strong>{fmt(item.treinamentos)}</strong>
                    <span>treinamentos</span>
                  </div>
                  <div style={metricBox}>
                    <strong>{item.assiduidade}%</strong>
                    <span>assiduidade</span>
                  </div>
                  <div style={metricBox}>
                    <strong>{item.mediaQualidade}</strong>
                    <span>qualidade</span>
                  </div>
                  <div style={metricBox}>
                    <strong>{item.mediaNps}</strong>
                    <span>NPS</span>
                  </div>
                </div>

                <div style={progressWrap}>
                  <div style={progressHeader}>
                    <span style={progressLabel}>Progresso da jornada</span>
                    <strong style={{ color: progressColor(item.progresso) }}>
                      {item.progresso}%
                    </strong>
                  </div>
                  <div style={progressTrack}>
                    <div
                      style={{
                        ...progressFill,
                        width: `${item.progresso}%`,
                        background: progressColor(item.progresso),
                      }}
                    />
                  </div>
                </div>

                <div style={journeyGrid}>
                  <div style={journeyBox}>
                    <strong>{fmt(item.trilhasAtribuidas)}</strong>
                    <span>trilhas atribuídas</span>
                  </div>
                  <div style={journeyBox}>
                    <strong>{fmt(item.trilhasConcluidas)}</strong>
                    <span>trilhas concluídas</span>
                  </div>
                </div>

                <div style={gapWrap}>
                  {item.gaps.map((gap, index) => (
                    <span
                      key={index}
                      style={gap === "Sem gaps críticos" ? gapNeutral : gapTag}
                    >
                      {gap}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={emptyText}>Nenhum colaborador disponível para leitura.</div>
        )}
      </SectionCard>
    </PortalShell>
  );
}

const heroGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1.1fr .9fr",
  gap: 14,
  marginBottom: 14,
};

const listGrid = {
  display: "grid",
  gap: 10,
};

const clientCard = {
  background: "#f8fafc",
  padding: 12,
  borderRadius: 14,
  border: "1px solid #e2e8f0",
};

const clientTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
};

const itemTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const itemMeta = {
  marginTop: 5,
  color: "#475569",
  fontSize: 13,
  lineHeight: 1.45,
};

const progressBadge = {
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 800,
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 11,
};

const maturityRow = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginTop: 10,
};

const miniTagGreen = {
  background: "#dcfce7",
  color: "#166534",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
};

const miniTagBlue = {
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
};

const miniTagOrange = {
  background: "#ffedd5",
  color: "#9a3412",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
};

const miniTagRed = {
  background: "#fee2e2",
  color: "#b91c1c",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
};

const alertGrid = {
  display: "grid",
  gap: 10,
};

const alertItem = {
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
  borderRadius: 12,
  padding: 12,
  fontWeight: 600,
};

const cardsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
  gap: 12,
};

const card = {
  background: "#ffffff",
  borderRadius: 16,
  border: "1px solid #e2e8f0",
  padding: 14,
  boxShadow: "0 8px 18px rgba(15,23,42,.04)",
  display: "grid",
  gap: 12,
};

const cardTop = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
};

const cardTitle = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.2,
};

const cardMeta = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748b",
};

const metricsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
};

const metricBox = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 10,
  textAlign: "center",
  display: "grid",
  gap: 4,
};

const progressWrap = {
  display: "grid",
  gap: 6,
};

const progressHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const progressLabel = {
  fontSize: 12,
  color: "#64748b",
  fontWeight: 700,
};

const progressTrack = {
  height: 10,
  borderRadius: 999,
  background: "#e2e8f0",
  overflow: "hidden",
};

const progressFill = {
  height: "100%",
  borderRadius: 999,
};

const journeyGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const journeyBox = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 4,
  textAlign: "center",
};

const gapWrap = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const gapTag = {
  display: "inline-block",
  padding: "5px 8px",
  borderRadius: 999,
  background: "#fff7ed",
  color: "#9a3412",
  fontSize: 11,
  fontWeight: 800,
};

const gapNeutral = {
  display: "inline-block",
  padding: "5px 8px",
  borderRadius: 999,
  background: "#f1f5f9",
  color: "#475569",
  fontSize: 11,
  fontWeight: 800,
};

const emptyText = {
  color: "#64748b",
};

const errorBox = {
  marginBottom: 12,
  background: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  borderRadius: 14,
  padding: 12,
  fontWeight: 700,
};
