"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";
import { formatDateBR, parseLocalDate } from "../../lib/date";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function parseDateSafe(value) {
  return parseLocalDate(value);
}

function formatDateSafe(value) {
  return formatDateBR(value, "-");
}

function getSaudeOperacao(taxaPresenca, nps, qualidade) {
  const presenca = Number(taxaPresenca || 0);
  const npsValor = Number(nps || 0);
  const qualidadeValor = Number(qualidade || 0);

  if (
    presenca >= 90 &&
    (npsValor >= 70 || npsValor === 0) &&
    (qualidadeValor >= 8 || qualidadeValor === 0)
  ) {
    return {
      label: "Estável",
      color: "#166534",
      bg: "#dcfce7",
      border: "#86efac",
      message:
        "A operação apresenta execução consistente, com presença diária saudável e sem desvios críticos relevantes.",
    };
  }

  if (presenca >= 80) {
    return {
      label: "Atenção",
      color: "#92400e",
      bg: "#fef3c7",
      border: "#fcd34d",
      message:
        "Há estabilidade parcial, porém já existem sinais de atenção em presença diária, satisfação ou qualidade.",
    };
  }

  return {
    label: "Crítico",
    color: "#b91c1c",
    bg: "#fee2e2",
    border: "#fca5a5",
    message:
      "Os indicadores apontam necessidade de atuação imediata na execução das turmas e no fechamento das chamadas diárias.",
  };
}

function getPriorityList(kpis, ultimasTurmas) {
  const prioridades = [];

  if (Number(kpis.pendentes || 0) > 0) {
    prioridades.push({
      titulo: "Finalizar chamadas pendentes",
      descricao: `${fmt(kpis.pendentes)} registro(s) ainda estão sem fechamento de chamada diária.`,
      tag: "Execução",
    });
  }

  if (Number(kpis.ausentes || 0) > 0) {
    prioridades.push({
      titulo: "Atuar sobre ausências",
      descricao: `${fmt(kpis.ausentes)} ausência(s) registradas nas chamadas diárias das turmas acompanhadas.`,
      tag: "Presença",
    });
  }

  if (Number(kpis.respostas_nps || 0) === 0) {
    prioridades.push({
      titulo: "Iniciar coleta de NPS",
      descricao: "Ainda não há respostas de satisfação registradas na base.",
      tag: "Experiência",
    });
  }

  if (
    Number(kpis.media_qualidade || 0) > 0 &&
    Number(kpis.media_qualidade || 0) < 7
  ) {
    prioridades.push({
      titulo: "Reforçar qualidade dos treinamentos",
      descricao: `A média de qualidade está em ${kpis.media_qualidade}, abaixo do patamar desejado.`,
      tag: "Qualidade",
    });
  }

  const turmaCritica = (ultimasTurmas || []).find(
    (item) => Number(item.ausentes || 0) > 0 || Number(item.pendentes || 0) > 0
  );

  if (turmaCritica) {
    prioridades.push({
      titulo: "Acompanhar turma com maior risco operacional",
      descricao: `${turmaCritica.tema || "Treinamento"} • ${turmaCritica.cliente || "Sem cliente"}`,
      tag: "Turma",
    });
  }

  if (!prioridades.length) {
    prioridades.push({
      titulo: "Operação dentro do esperado",
      descricao: "No momento, não há prioridades críticas abertas no portal.",
      tag: "Status",
    });
  }

  return prioridades.slice(0, 5);
}

export default function InicioPage() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        setErro("");
        setLoading(true);

        const response = await apiFetch("/dashboard/treinamentos");
        setDados(response || null);
      } catch (error) {
        setErro(error.message || "Erro ao carregar a visão inicial.");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const kpis = dados?.kpis || {};
  const presencaPorCliente = dados?.presenca_por_cliente || [];
  const rankingInstrutores = dados?.ranking_instrutores || [];
  const rankingNps = dados?.ranking_nps || [];
  const ultimasTurmas = dados?.ultimas_turmas || [];

  const saudeOperacao = useMemo(() => {
    return getSaudeOperacao(
      kpis.taxa_presenca,
      kpis.nps,
      kpis.media_qualidade
    );
  }, [kpis]);

  const prioridades = useMemo(() => {
    return getPriorityList(kpis, ultimasTurmas);
  }, [kpis, ultimasTurmas]);

  const taxaExecucao = useMemo(() => {
    const horasMinistradas = Number(
      kpis.horas_ministradas || kpis.horas_treinadas || 0
    );
    const cargaPlanejada = Number(kpis.carga_horaria_total || 0);

    if (!cargaPlanejada) return 0;
    return Math.round((horasMinistradas / cargaPlanejada) * 100);
  }, [kpis]);

  const gapPresenca = useMemo(() => {
    const previstosNoDia = Number(kpis.previstos_no_dia || 0);
    const presentesNoDia = Number(kpis.presentes_no_dia || 0);

    const gap = previstosNoDia - presentesNoDia;
    return gap > 0 ? gap : 0;
  }, [kpis]);

  const narrativaExecutiva = useMemo(() => {
    const frases = [];

    frases.push(
      `A área acumula ${fmt(kpis.treinamentos || 0)} turma(s), com ${fmt(kpis.treinados || 0)} registro(s) de chamada considerados na base real diária.`
    );

    if (Number(kpis.taxa_presenca || 0) > 0) {
      frases.push(
        `A taxa consolidada de presença diária está em ${kpis.taxa_presenca}%, com ${fmt(kpis.presentes || 0)} presentes, ${fmt(kpis.ausentes || 0)} ausências e ${fmt(kpis.pendentes || 0)} pendência(s).`
      );
    }

    if (Number(kpis.respostas_nps || 0) > 0) {
      frases.push(
        `A satisfação do treinando registra NPS ${kpis.nps}, com ${fmt(kpis.respostas_nps || 0)} resposta(s) já coletadas.`
      );
    } else {
      frases.push(
        "Ainda não há base consolidada de NPS para leitura de satisfação."
      );
    }

    if (Number(kpis.media_qualidade || 0) > 0) {
      frases.push(
        `A qualidade média dos treinamentos está em ${kpis.media_qualidade}.`
      );
    }

    return frases;
  }, [kpis]);

  return (
    <PortalShell
      title="Início"
      subtitle="Painel executivo da operação de Treinamento & Desenvolvimento."
    >
      {loading ? (
        <div style={loadingBox}>Carregando visão executiva...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <>
          <div style={heroWrap}>
            <div style={heroMain}>
              <div style={heroBadge}>Resumo executivo</div>
              <h2 style={heroTitle}>Panorama estratégico da área de T&amp;D</h2>
              <p style={heroText}>
                Acompanhe execução, presença diária, satisfação e qualidade em
                uma visão pensada para acompanhamento gerencial e apresentação
                de resultados.
              </p>

              <div
                style={{
                  ...healthPill,
                  background: saudeOperacao.bg,
                  color: saudeOperacao.color,
                  border: `1px solid ${saudeOperacao.border}`,
                }}
              >
                {saudeOperacao.label}
              </div>

              <p style={{ ...heroText, marginTop: 14 }}>
                {saudeOperacao.message}
              </p>
            </div>

            <div style={heroSide}>
              <div style={heroSideCard}>
                <span style={heroSideLabel}>Execução da grade</span>
                <strong style={heroSideValue}>{taxaExecucao}%</strong>
                <span style={heroSideSub}>
                  horas ministradas em relação à carga horária planejada
                </span>
              </div>

              <div style={heroSideCard}>
                <span style={heroSideLabel}>Gap de presença</span>
                <strong style={heroSideValue}>{fmt(gapPresenca)}</strong>
                <span style={heroSideSub}>
                  diferença entre previstos no dia e presença efetiva do dia
                </span>
              </div>

              <div style={heroSideCard}>
                <span style={heroSideLabel}>Carga efetiva</span>
                <strong style={heroSideValue}>
                  {fmt(kpis.horas_treinadas || 0)}h
                </strong>
                <span style={heroSideSub}>
                  horas realmente assistidas na base acompanhada
                </span>
              </div>
            </div>
          </div>

          <div style={gridFive}>
            <StatCard
              title="Turmas"
              value={fmt(kpis.treinamentos || 0)}
              subtitle="Volume consolidado"
              accent="#2563eb"
            />
            <StatCard
              title="Registros de chamada"
              value={fmt(kpis.treinados || 0)}
              subtitle="Base real diária"
              accent="#06b6d4"
            />
            <StatCard
              title="Presença"
              value={`${kpis.taxa_presenca || 0}%`}
              subtitle="Presença diária consolidada"
              accent="#0891b2"
            />
            <StatCard
              title="NPS"
              value={kpis.nps || 0}
              subtitle="Satisfação do treinando"
              accent="#1d4ed8"
            />
            <StatCard
              title="Qualidade"
              value={kpis.media_qualidade || 0}
              subtitle="Aproveitamento médio"
              accent="#059669"
            />
          </div>

          <div style={{ ...gridFour, marginTop: 14 }}>
            <StatCard
              title="Presentes"
              value={fmt(kpis.presentes || 0)}
              subtitle="Presença confirmada"
              accent="#16a34a"
            />
            <StatCard
              title="Ausentes"
              value={fmt(kpis.ausentes || 0)}
              subtitle="Não compareceram"
              accent="#dc2626"
            />
            <StatCard
              title="Justificados"
              value={fmt(kpis.justificados || 0)}
              subtitle="Com justificativa"
              accent="#f59e0b"
            />
            <StatCard
              title="Pendentes"
              value={fmt(kpis.pendentes || 0)}
              subtitle="Chamada diária em aberto"
              accent="#64748b"
            />
          </div>

          <div style={{ ...gridFour, marginTop: 14 }}>
            <StatCard
              title="Capacidade planejada"
              value={fmt(kpis.participantes_previstos || 0)}
              subtitle="Base prevista"
              accent="#7c3aed"
            />
            <StatCard
              title="Carga planejada"
              value={`${fmt(kpis.carga_horaria_total || 0)}h`}
              subtitle="Carga consolidada"
              accent="#0f766e"
            />
            <StatCard
              title="Horas assistidas"
              value={`${fmt(kpis.horas_treinadas || 0)}h`}
              subtitle="Execução real"
              accent="#ea580c"
            />
            <StatCard
              title="Conclusão"
              value={`${kpis.taxa_conclusao_chamada || 0}%`}
              subtitle="Fechamento da chamada diária"
              accent="#9333ea"
            />
          </div>

          <div style={twoCol}>
            <SectionCard
              title="Narrativa executiva"
              subtitle="Leitura pronta para acompanhamento gerencial."
            >
              <div style={narrativeGrid}>
                {narrativaExecutiva.map((item, index) => (
                  <div key={index} style={narrativeItem}>
                    {item}
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Prioridades imediatas"
              subtitle="Focos de atuação para a rotina da área."
            >
              <div style={priorityGrid}>
                {prioridades.map((item, index) => (
                  <div key={index} style={priorityItem}>
                    <div style={priorityHeader}>
                      <span style={priorityTag}>{item.tag}</span>
                      <strong style={priorityTitle}>{item.titulo}</strong>
                    </div>
                    <div style={priorityDescription}>{item.descricao}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div style={{ ...twoCol, marginTop: 14 }}>
            <SectionCard
              title="Presença por cliente"
              subtitle="Clientes com chamada registrada e taxa real de presença diária."
            >
              {presencaPorCliente.length ? (
                <div style={listGrid}>
                  {presencaPorCliente.map((item, index) => (
                    <div key={index} style={listItem}>
                      <div style={itemHeader}>
                        <div style={itemTitle}>
                          {item.cliente || "Sem cliente"}
                        </div>
                        <div style={itemBadgeBlue}>
                          {Number(item.taxa_presenca || 0)}%
                        </div>
                      </div>

                      <div style={itemMeta}>
                        {fmt(item.total_treinados || 0)} registro(s) •{" "}
                        {fmt(item.presentes || 0)} presentes •{" "}
                        {fmt(item.ausentes || 0)} ausentes •{" "}
                        {fmt(item.justificados || 0)} justificados
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyText}>
                  Sem clientes com chamada registrada no momento.
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Ranking de instrutores"
              subtitle="Leitura de produtividade por turmas e presença consolidada."
            >
              {rankingInstrutores.length ? (
                <div style={listGrid}>
                  {rankingInstrutores.map((item, index) => (
                    <div key={index} style={listItem}>
                      <div style={itemHeader}>
                        <div style={itemTitle}>
                          {item.instrutor || "Sem instrutor"}
                        </div>
                        <div style={itemBadgePurple}>
                          {Number(item.taxa_presenca || 0)}%
                        </div>
                      </div>

                      <div style={itemMeta}>
                        {fmt(item.total_turmas || 0)} turma(s) •{" "}
                        {fmt(item.total_treinados || 0)} registro(s) •{" "}
                        {fmt(item.presentes || 0)} presentes
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyText}>
                  Sem dados de instrutores no momento.
                </div>
              )}
            </SectionCard>
          </div>

          <div style={{ ...twoCol, marginTop: 14 }}>
            <SectionCard
              title="Ranking de satisfação"
              subtitle="Clientes com base de NPS já registrada."
            >
              {rankingNps.length ? (
                <div style={listGrid}>
                  {rankingNps.map((item, index) => (
                    <div key={index} style={listItem}>
                      <div style={itemHeader}>
                        <div style={itemTitle}>
                          {item.cliente || "Sem cliente"}
                        </div>
                        <div style={itemBadgeBlue}>{Number(item.nps || 0)}</div>
                      </div>

                      <div style={itemMeta}>
                        {fmt(item.respostas || 0)} resposta(s) de NPS
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyText}>Sem ranking de NPS no momento.</div>
              )}
            </SectionCard>

            <SectionCard
              title="Últimas turmas"
              subtitle="Resumo operacional das turmas mais recentes."
            >
              {ultimasTurmas.length ? (
                <div style={ultimasTurmasGrid}>
                  {ultimasTurmas.slice(0, 6).map((item) => (
                    <div key={item.id} style={turmaResumoCard}>
                      <div style={turmaResumoTop}>
                        <div>
                          <div style={turmaResumoTitulo}>
                            {item.tema || "Turma"}
                          </div>
                          <div style={turmaResumoMeta}>
                            {(item.cliente || "Sem cliente") +
                              " • " +
                              (item.instrutor || "Sem instrutor")}
                          </div>
                        </div>

                        <div style={turmaResumoData}>
                          {formatDateSafe(item.data_inicio || item.data)}
                        </div>
                      </div>

                      <div style={turmaResumoNumbers}>
                        <div style={turmaMiniBox}>
                          <span style={turmaMiniLabel}>Base ativa</span>
                          <strong style={turmaMiniValue}>
                            {fmt(item.base_ativa || 0)}
                          </strong>
                        </div>

                        <div style={turmaMiniBox}>
                          <span style={turmaMiniLabel}>Presentes</span>
                          <strong style={turmaMiniValue}>
                            {fmt(item.presentes || 0)}
                          </strong>
                        </div>

                        <div style={turmaMiniBox}>
                          <span style={turmaMiniLabel}>Ausentes</span>
                          <strong style={turmaMiniValue}>
                            {fmt(item.ausentes || 0)}
                          </strong>
                        </div>

                        <div style={turmaMiniBox}>
                          <span style={turmaMiniLabel}>Justificados</span>
                          <strong style={turmaMiniValue}>
                            {fmt(item.justificados || 0)}
                          </strong>
                        </div>

                        <div style={turmaMiniBox}>
                          <span style={turmaMiniLabel}>Pendentes</span>
                          <strong style={turmaMiniValue}>
                            {fmt(item.pendentes || 0)}
                          </strong>
                        </div>

                        <div style={turmaMiniBoxDestaque}>
                          <span style={turmaMiniLabel}>Carga</span>
                          <strong style={turmaMiniValue}>
                            {item.carga_horaria || "-"}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyText}>Nenhuma turma recente encontrada.</div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </PortalShell>
  );
}

const heroWrap = {
  display: "grid",
  gridTemplateColumns: "1.4fr 1fr",
  gap: 14,
  marginBottom: 14,
};

const heroMain = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 20,
  padding: 22,
  color: "#fff",
  boxShadow: "0 16px 30px rgba(29,78,216,.18)",
};

const heroBadge = {
  display: "inline-block",
  background: "rgba(255,255,255,.14)",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const heroTitle = {
  margin: "14px 0 8px",
  fontSize: 30,
  lineHeight: 1.05,
};

const heroText = {
  margin: 0,
  color: "rgba(255,255,255,.84)",
  lineHeight: 1.6,
};

const healthPill = {
  display: "inline-flex",
  marginTop: 16,
  padding: "7px 12px",
  borderRadius: 999,
  fontWeight: 800,
  fontSize: 12,
};

const heroSide = {
  display: "grid",
  gap: 10,
};

const heroSideCard = {
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid #dbeafe",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 10px 22px rgba(15,23,42,.05)",
  display: "grid",
  gap: 4,
};

const heroSideLabel = {
  fontSize: 12,
  fontWeight: 700,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: ".03em",
};

const heroSideValue = {
  fontSize: 28,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.1,
};

const heroSideSub = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.45,
};

const gridFive = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 14,
};

const gridFour = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
  marginTop: 16,
};

const narrativeGrid = {
  display: "grid",
  gap: 10,
};

const narrativeItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 12,
  color: "#334155",
  lineHeight: 1.6,
  fontWeight: 500,
};

const priorityGrid = {
  display: "grid",
  gap: 10,
};

const priorityItem = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 12,
};

const priorityHeader = {
  display: "grid",
  gap: 6,
};

const priorityTag = {
  display: "inline-block",
  width: "fit-content",
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
};

const priorityTitle = {
  color: "#0f172a",
};

const priorityDescription = {
  marginTop: 6,
  color: "#64748b",
  lineHeight: 1.5,
  fontSize: 13,
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
};

const itemHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
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

const itemBadgeBlue = {
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const itemBadgePurple = {
  background: "#ede9fe",
  color: "#6d28d9",
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
};

const emptyText = {
  color: "#64748b",
};

const ultimasTurmasGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 14,
};

const turmaResumoCard = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 16,
  display: "grid",
  gap: 12,
};

const turmaResumoTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const turmaResumoTitulo = {
  fontSize: 18,
  fontWeight: 800,
  color: "#0f172a",
  lineHeight: 1.25,
};

const turmaResumoMeta = {
  marginTop: 6,
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.45,
};

const turmaResumoData = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const turmaResumoNumbers = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const turmaMiniBox = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 4,
};

const turmaMiniBoxDestaque = {
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 4,
};

const turmaMiniLabel = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 700,
};

const turmaMiniValue = {
  color: "#0f172a",
  fontSize: 18,
  fontWeight: 800,
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
