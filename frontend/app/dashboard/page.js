"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function parseHoras(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = String(value).trim().toLowerCase().replace(",", ".");
  const match = text.match(/(\d+(\.\d+)?)/);

  return match ? Number(match[1]) || 0 : 0;
}

function sum(arr) {
  return arr.reduce((acc, item) => acc + Number(item || 0), 0);
}

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function avg(arr, field) {
  if (!arr.length) return 0;
  return sum(arr.map((item) => Number(item?.[field] || 0))) / arr.length;
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState({});
  const [treinamentos, setTreinamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const [dash, treinamentosData, presencasData, avaliacoesData] =
          await Promise.all([
            apiFetch("/dashboard").catch(() => ({})),
            apiFetch("/treinamentos").catch(() => []),
            apiFetch("/presencas").catch(() => []),
            apiFetch("/avaliacoes").catch(() => []),
          ]);

        setDashboard(dash || {});
        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
        setPresencas(Array.isArray(presencasData) ? presencasData : []);
        setAvaliacoes(Array.isArray(avaliacoesData) ? avaliacoesData : []);
        setErro("");
      } catch (error) {
        setErro(error.message || "Erro ao carregar dados do dashboard.");
      }
    }

    carregar();
  }, []);

  const dados = useMemo(() => {
    const totalParticipacoes = presencas.length;

    const presentes = presencas.filter(
      (p) => String(p.status || "").toLowerCase() === "presente"
    ).length;

    const ausentes = presencas.filter(
      (p) => String(p.status || "").toLowerCase() === "ausente"
    ).length;

    const justificados = presencas.filter(
      (p) => String(p.status || "").toLowerCase() === "justificado"
    ).length;

    const taxaPresenca = totalParticipacoes
      ? Math.round((presentes / totalParticipacoes) * 100)
      : 0;

    const taxaAbsenteismo = totalParticipacoes
      ? Math.round((ausentes / totalParticipacoes) * 100)
      : 0;

    const horasMinistradas = sum(
      treinamentos.map((item) => parseHoras(item.carga_horaria))
    );

    const horasTreinadas = sum(
      treinamentos.map((item) => {
        const horas = parseHoras(item.carga_horaria);

        const presentesTurma = presencas.filter(
          (p) =>
            String(p.treinamento_id) === String(item.id) &&
            String(p.status || "").toLowerCase() === "presente"
        ).length;

        return horas * presentesTurma;
      })
    );

    const mediaHorasTreinamento = treinamentos.length
      ? (horasMinistradas / treinamentos.length).toFixed(1)
      : "0.0";

    const mediaQualidade = avg(avaliacoes, "nota_qualidade").toFixed(1);
    const mediaNps = avg(avaliacoes, "nota_nps").toFixed(1);

    const impactoPorClienteMap = {};
    treinamentos.forEach((item) => {
      const cliente = item.cliente || "Sem cliente";
      const horas = parseHoras(item.carga_horaria);

      if (!impactoPorClienteMap[cliente]) {
        impactoPorClienteMap[cliente] = {
          cliente,
          treinamentos: 0,
          participantes: 0,
          horas: 0,
        };
      }

      impactoPorClienteMap[cliente].treinamentos += 1;
      impactoPorClienteMap[cliente].participantes += Number(item.participantes || 0);
      impactoPorClienteMap[cliente].horas += horas;
    });

    const impactoPorCliente = Object.values(impactoPorClienteMap).sort(
      (a, b) => b.treinamentos - a.treinamentos || b.participantes - a.participantes
    );

    const rankingInstrutoresMap = {};
    treinamentos.forEach((item) => {
      const instrutor = item.instrutor || "Sem instrutor";
      const horas = parseHoras(item.carga_horaria);

      if (!rankingInstrutoresMap[instrutor]) {
        rankingInstrutoresMap[instrutor] = {
          instrutor,
          treinamentos: 0,
          participantes: 0,
          horas: 0,
        };
      }

      rankingInstrutoresMap[instrutor].treinamentos += 1;
      rankingInstrutoresMap[instrutor].participantes += Number(item.participantes || 0);
      rankingInstrutoresMap[instrutor].horas += horas;
    });

    const rankingInstrutores = Object.values(rankingInstrutoresMap).sort(
      (a, b) => b.treinamentos - a.treinamentos || b.horas - a.horas
    );

    const alertas = treinamentos
      .map((item) => {
        const participantesPrevistos = Number(item.participantes || 0);

        const presentesTurma = presencas.filter(
          (p) =>
            String(p.treinamento_id) === String(item.id) &&
            String(p.status || "").toLowerCase() === "presente"
        ).length;

        const ausentesTurma = presencas.filter(
          (p) =>
            String(p.treinamento_id) === String(item.id) &&
            String(p.status || "").toLowerCase() === "ausente"
        ).length;

        const taxa = participantesPrevistos
          ? Math.round((presentesTurma / participantesPrevistos) * 100)
          : 0;

        return {
          id: item.id,
          tema: item.tema || item.titulo || item.turma || "Treinamento",
          cliente: item.cliente || "Sem cliente",
          instrutor: item.instrutor || "Sem instrutor",
          ausentes: ausentesTurma,
          taxa,
          status: taxa < 85 ? "critico" : taxa < 92 ? "atencao" : "ok",
        };
      })
      .filter((item) => item.status !== "ok")
      .sort((a, b) => a.taxa - b.taxa)
      .slice(0, 5);

    const ultimosTreinamentos = [...treinamentos].slice(-6).reverse();
    const ultimasAvaliacoes = [...avaliacoes].slice(-6).reverse();

    return {
      totalParticipacoes,
      presentes,
      ausentes,
      justificados,
      taxaPresenca,
      taxaAbsenteismo,
      horasMinistradas,
      horasTreinadas,
      mediaHorasTreinamento,
      mediaQualidade,
      mediaNps,
      impactoPorCliente,
      rankingInstrutores,
      alertas,
      ultimosTreinamentos,
      ultimasAvaliacoes,
    };
  }, [treinamentos, presencas, avaliacoes]);

  const maxCliente = Math.max(
    ...dados.impactoPorCliente.map((item) => item.treinamentos),
    1
  );

  const maxInstrutor = Math.max(
    ...dados.rankingInstrutores.map((item) => item.treinamentos),
    1
  );

  return (
    <PortalShell
      title="Dashboard estratégico de T&D"
      subtitle="Painel executivo com leitura de volume, presença, qualidade, impacto por cliente e produtividade dos instrutores."
    >
      {erro ? <div style={errorBox}>{erro}</div> : null}

      <div style={heroWrap}>
        <div style={heroTextBlock}>
          <div style={heroBadge}>Visão executiva</div>
          <h2 style={heroTitle}>Painel central do Treinamento & Desenvolvimento</h2>
          <p style={heroText}>
            Acompanhe rapidamente cobertura do setor, produtividade das ações,
            presença, qualidade percebida e distribuição de treinamento por cliente.
          </p>
        </div>

        <div style={heroMiniGrid}>
          <div style={miniStatCard}>
            <strong>{fmt(dados.presentes)}</strong>
            <span>presenças confirmadas</span>
          </div>
          <div style={miniStatCard}>
            <strong>{fmt(dados.ausentes)}</strong>
            <span>ausências mapeadas</span>
          </div>
          <div style={miniStatCard}>
            <strong>{fmt(dados.justificados)}</strong>
            <span>justificativas registradas</span>
          </div>
        </div>
      </div>

      <div style={gridFour}>
        <StatCard
          title="Clientes"
          value={dashboard?.clientes ?? 0}
          subtitle="Clientes atendidos pelo T&D"
          accent="#2563eb"
        />
        <StatCard
          title="Treinamentos"
          value={dashboard?.treinamentos ?? treinamentos.length}
          subtitle="Ações cadastradas no portal"
          accent="#059669"
        />
        <StatCard
          title="Participações"
          value={fmt(dados.totalParticipacoes)}
          subtitle="Registros de presença lançados"
          accent="#7c3aed"
        />
        <StatCard
          title="Avaliações"
          value={dashboard?.avaliacoes ?? avaliacoes.length}
          subtitle="Leituras de qualidade e NPS"
          accent="#ea580c"
        />
      </div>

      <div style={{ ...gridFour, marginTop: 18 }}>
        <StatCard
          title="Horas ministradas"
          value={`${fmt(dados.horasMinistradas)}h`}
          subtitle="Carga horária aplicada"
          accent="#0f766e"
        />
        <StatCard
          title="Horas treinadas"
          value={`${fmt(dados.horasTreinadas)}h`}
          subtitle="Carga × presença efetiva"
          accent="#1d4ed8"
        />
        <StatCard
          title="Taxa de presença"
          value={`${dados.taxaPresenca}%`}
          subtitle="Assiduidade média"
          accent="#16a34a"
        />
        <StatCard
          title="Absenteísmo"
          value={`${dados.taxaAbsenteismo}%`}
          subtitle="Ponto de atenção"
          accent="#dc2626"
        />
      </div>

      <div style={{ ...gridFour, marginTop: 18 }}>
        <StatCard
          title="Justificativas"
          value={fmt(dados.justificados)}
          subtitle="Ausências justificadas"
          accent="#ca8a04"
        />
        <StatCard
          title="Qualidade média"
          value={dados.mediaQualidade}
          subtitle="Avaliações do treinamento"
          accent="#0891b2"
        />
        <StatCard
          title="NPS médio"
          value={dados.mediaNps}
          subtitle="Percepção do público"
          accent="#9333ea"
        />
        <StatCard
          title="Média de horas"
          value={`${dados.mediaHorasTreinamento}h`}
          subtitle="Carga média por ação"
          accent="#475569"
        />
      </div>

      <div style={twoCol}>
        <SectionCard
          title="Impacto por cliente"
          subtitle="Distribuição das ações por operação com volume, participantes e horas."
        >
          {dados.impactoPorCliente.length ? (
            <div style={barsWrap}>
              {dados.impactoPorCliente.map((item) => (
                <div key={item.cliente} style={barRow}>
                  <div style={barHeader}>
                    <div>
                      <div style={barLabel}>{item.cliente}</div>
                      <div style={mutedSmall}>
                        {fmt(item.participantes)} participantes • {fmt(item.horas)}h
                      </div>
                    </div>
                    <strong style={barValue}>{item.treinamentos}</strong>
                  </div>

                  <div style={barTrack}>
                    <div
                      style={{
                        ...barFill,
                        width: `${(item.treinamentos / maxCliente) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhum cliente disponível.</div>
          )}
        </SectionCard>

        <SectionCard
          title="Ranking de instrutores"
          subtitle="Quem mais sustentou turmas, participantes e carga horária."
        >
          {dados.rankingInstrutores.length ? (
            <div style={barsWrap}>
              {dados.rankingInstrutores.slice(0, 6).map((item) => (
                <div key={item.instrutor} style={barRow}>
                  <div style={barHeader}>
                    <div>
                      <div style={barLabel}>{item.instrutor}</div>
                      <div style={mutedSmall}>
                        {fmt(item.participantes)} participantes • {fmt(item.horas)}h
                      </div>
                    </div>
                    <strong style={barValue}>{item.treinamentos}</strong>
                  </div>

                  <div style={barTrack}>
                    <div
                      style={{
                        ...barFill,
                        width: `${(item.treinamentos / maxInstrutor) * 100}%`,
                        background:
                          "linear-gradient(90deg, #9333ea 0%, #7c3aed 100%)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhum instrutor disponível.</div>
          )}
        </SectionCard>
      </div>

      <div style={{ ...twoCol, marginTop: 18 }}>
        <SectionCard
          title="Alertas executivos"
          subtitle="Turmas com baixa presença que merecem atenção."
        >
          {dados.alertas.length ? (
            <div style={listGrid}>
              {dados.alertas.map((item) => (
                <div key={item.id} style={alertCard(item.status)}>
                  <div style={alertTop}>
                    <span style={alertBadge(item.status)}>
                      {item.status === "critico" ? "Crítico" : "Atenção"}
                    </span>
                    <strong>{item.taxa}% presença</strong>
                  </div>

                  <div style={itemTitle}>{item.tema}</div>
                  <div style={itemMeta}>
                    {item.cliente} • {item.instrutor}
                  </div>
                  <div style={{ ...itemMeta, marginTop: 8 }}>
                    {item.ausentes} ausência(s) sinalizada(s)
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>
              Nenhum alerta crítico no momento. O cenário está saudável.
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Leitura gerencial"
          subtitle="Resumo pronto para uso em reunião com liderança e cliente."
        >
          <div style={managerNotes}>
            <div style={noteItem}>
              <strong>Capilaridade:</strong> {fmt(dashboard?.clientes ?? 0)} clientes
              com ações registradas no portal.
            </div>
            <div style={noteItem}>
              <strong>Produtividade:</strong>{" "}
              {fmt(dashboard?.treinamentos ?? treinamentos.length)} turmas mapeadas
              e {fmt(dados.horasTreinadas)} horas treinadas.
            </div>
            <div style={noteItem}>
              <strong>Assiduidade:</strong> presença média de {dados.taxaPresenca}%
              com absenteísmo de {dados.taxaAbsenteismo}%.
            </div>
            <div style={noteItem}>
              <strong>Percepção:</strong> NPS médio de {dados.mediaNps} e média de
              qualidade de {dados.mediaQualidade}.
            </div>
          </div>
        </SectionCard>
      </div>

      <div style={{ ...twoCol, marginTop: 18 }}>
        <SectionCard
          title="Treinamentos recentes"
          subtitle="Últimos registros lançados no sistema."
        >
          {dados.ultimosTreinamentos.length ? (
            <div style={listGrid}>
              {dados.ultimosTreinamentos.map((item, index) => (
                <div key={item.id || index} style={listItem}>
                  <div style={itemTitle}>
                    {item.tema || item.titulo || item.turma || "Treinamento"}
                  </div>
                  <div style={itemMeta}>
                    {item.cliente || "Sem cliente"} • {item.instrutor || "Sem instrutor"}
                  </div>
                  <div style={{ ...itemMeta, marginTop: 6 }}>
                    {item.carga_horaria || "0h"} • {fmt(item.participantes || 0)} participantes
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhum treinamento cadastrado ainda.</div>
          )}
        </SectionCard>

        <SectionCard
          title="Avaliações recentes"
          subtitle="Últimos registros de avaliação do portal."
        >
          {dados.ultimasAvaliacoes.length ? (
            <div style={listGrid}>
              {dados.ultimasAvaliacoes.map((item, index) => (
                <div key={item.id || index} style={listItem}>
                  <div style={itemTitle}>
                    {item.titulo || item.tipo_registro || "Avaliação"}
                  </div>
                  <div style={itemMeta}>
                    Qualidade: {item.nota_qualidade ?? "-"} • NPS: {item.nota_nps ?? "-"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhuma avaliação registrada ainda.</div>
          )}
        </SectionCard>
      </div>
    </PortalShell>
  );
}

const heroWrap = {
  display: "grid",
  gridTemplateColumns: "1.6fr .9fr",
  gap: 18,
  marginBottom: 18,
};

const heroTextBlock = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 26,
  padding: 24,
  color: "#fff",
  boxShadow: "0 20px 36px rgba(29, 78, 216, 0.18)",
};

const heroBadge = {
  display: "inline-block",
  background: "rgba(255,255,255,.14)",
  padding: "7px 12px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const heroTitle = {
  margin: "18px 0 10px",
  fontSize: 30,
  lineHeight: 1.05,
};

const heroText = {
  margin: 0,
  color: "rgba(255,255,255,.82)",
  lineHeight: 1.7,
  maxWidth: 720,
};

const heroMiniGrid = {
  display: "grid",
  gap: 14,
};

const miniStatCard = {
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid #dbeafe",
  borderRadius: 22,
  padding: 18,
  boxShadow: "0 16px 28px rgba(15,23,42,.06)",
  display: "grid",
  gap: 6,
};

const gridFour = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 18,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 18,
  marginTop: 20,
};

const barsWrap = {
  display: "grid",
  gap: 14,
};

const barRow = {
  display: "grid",
  gap: 8,
};

const barHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const barLabel = {
  fontWeight: 800,
  color: "#0f172a",
};

const barValue = {
  color: "#1d4ed8",
};

const mutedSmall = {
  color: "#64748b",
  fontSize: 13,
  marginTop: 4,
};

const barTrack = {
  height: 11,
  background: "#e2e8f0",
  borderRadius: 999,
  overflow: "hidden",
};

const barFill = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, #2563eb 0%, #0ea5e9 100%)",
};

const listGrid = {
  display: "grid",
  gap: 12,
};

const listItem = {
  background: "#f8fafc",
  padding: 14,
  borderRadius: 16,
  border: "1px solid #e2e8f0",
};

const itemTitle = {
  fontWeight: 800,
  color: "#0f172a",
};

const itemMeta = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.45,
};

const emptyText = {
  color: "#64748b",
};

const alertCard = (status) => ({
  background: status === "critico" ? "#fff1f2" : "#fff7ed",
  border: status === "critico" ? "1px solid #fecdd3" : "1px solid #fed7aa",
  borderRadius: 16,
  padding: 14,
  display: "grid",
  gap: 8,
});

const alertTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const alertBadge = (status) => ({
  display: "inline-block",
  padding: "5px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  background: status === "critico" ? "#fee2e2" : "#ffedd5",
  color: status === "critico" ? "#b91c1c" : "#9a3412",
});

const managerNotes = {
  display: "grid",
  gap: 10,
};

const noteItem = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: 12,
  color: "#334155",
  lineHeight: 1.55,
};

const errorBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  borderRadius: 18,
  padding: 16,
  fontWeight: 700,
  marginBottom: 16,
};
