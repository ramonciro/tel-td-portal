"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("pt-BR");
}

function parseHoras(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).replace(",", ".").trim();
  const match = text.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

export default function TurmasPage() {
  const [turmas, setTurmas] = useState([]);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        setErro("");
        setLoading(true);

        const response = await apiFetch("/treinamentos");
        setTurmas(Array.isArray(response) ? response : []);
      } catch (error) {
        setErro(error.message || "Erro ao carregar turmas.");
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const resumo = useMemo(() => {
    const totalTurmas = turmas.length;
    const treinandos = turmas.reduce(
      (acc, item) => acc + Number(item.participantes || 0),
      0
    );
    const presentes = turmas.reduce(
      (acc, item) => acc + Number(item.participantes_presentes || 0),
      0
    );
    const horas = turmas.reduce(
      (acc, item) => acc + parseHoras(item.carga_horaria),
      0
    );

    return {
      totalTurmas,
      treinandos,
      presentes,
      horas,
    };
  }, [turmas]);

  const painelTurmas = useMemo(() => {
    return [...turmas]
      .map((item) => {
        const previstos = Number(item.participantes || 0);
        const presentes = Number(item.participantes_presentes || 0);
        const ausentes = Math.max(previstos - presentes, 0);
        const taxa =
          previstos > 0 ? Math.round((presentes / previstos) * 100) : 0;

        let classificacao = "Estável";
        if (taxa < 85) classificacao = "Crítico";
        else if (taxa < 95) classificacao = "Atenção";

        return {
          ...item,
          previstos,
          presentes,
          ausentes,
          justificados: Number(item.justificados || 0),
          taxa,
          classificacao,
        };
      })
      .sort((a, b) => a.taxa - b.taxa);
  }, [turmas]);

  return (
    <PortalShell
      title="Gestão de Turmas"
      subtitle="Execução operacional das turmas, treinandos e acompanhamento consolidado da presença."
    >
      {loading ? (
        <div style={loadingBox}>Carregando gestão de turmas...</div>
      ) : erro ? (
        <div style={errorBox}>{erro}</div>
      ) : (
        <>
          <div style={statsGrid}>
            <StatCard
              title="Turmas"
              value={fmt(resumo.totalTurmas)}
              subtitle="Consolidadas no portal"
              accent="#2563eb"
            />
            <StatCard
              title="Treinandos"
              value={fmt(resumo.treinandos)}
              subtitle="Capacidade planejada"
              accent="#38bdf8"
            />
            <StatCard
              title="Presentes"
              value={fmt(resumo.presentes)}
              subtitle="Participações confirmadas"
              accent="#16a34a"
            />
            <StatCard
              title="Carga horária"
              value={`${fmt(resumo.horas)}h`}
              subtitle="Carga consolidada"
              accent="#7c3aed"
            />
          </div>

          <SectionCard
            title="Painel das turmas"
            subtitle="Leitura rápida das turmas com maior necessidade de acompanhamento."
          >
            {painelTurmas.length ? (
              <div style={cardsGrid}>
                {painelTurmas.map((item) => (
                  <div key={item.id} style={turmaCard}>
                    <div style={cardTop}>
                      <span
                        style={
                          item.classificacao === "Crítico"
                            ? badgeCritico
                            : item.classificacao === "Atenção"
                            ? badgeAtencao
                            : badgeEstavel
                        }
                      >
                        {item.classificacao}
                      </span>

                      <span style={badgeTaxa}>{item.taxa}%</span>
                    </div>

                    <div style={turmaTitulo}>{item.tema || "Turma"}</div>
                    <div style={turmaMeta}>
                      {(item.cliente || "Sem cliente") +
                        " • " +
                        (item.instrutor || "Sem instrutor")}
                    </div>

                    <div style={miniLinha}>
                      <span>{fmt(item.previstos)} prev.</span>
                      <span>{fmt(item.presentes)} pres.</span>
                      <span>{fmt(item.ausentes)} aus.</span>
                      <span>{fmt(item.justificados)} just.</span>
                    </div>

                    <div style={infoBloco}>
                      <div>
                        <strong>Público:</strong> {item.publico || "-"}
                      </div>
                      <div>
                        <strong>Carga:</strong> {item.carga_horaria || "-"}
                      </div>
                      <div>
                        <strong>Supervisor:</strong> {item.supervisor || "-"}
                      </div>
                      <div>
                        <strong>Data-base:</strong> {formatDate(item.data)}
                      </div>
                    </div>

                    <div style={acoesWrap}>
                      <button
                        style={btnPrimario}
                        onClick={() => {
                          window.location.href = `/turma/${item.id}`;
                        }}
                      >
                        Gestão da turma
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptyText}>Nenhuma turma encontrada.</div>
            )}
          </SectionCard>
        </>
      )}
    </PortalShell>
  );
}

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 14,
  marginBottom: 16,
};

const cardsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 14,
};

const turmaCard = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 8px 22px rgba(15,23,42,.05)",
  display: "grid",
  gap: 10,
};

const cardTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const badgeCritico = {
  background: "#fef2f2",
  color: "#b91c1c",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const badgeAtencao = {
  background: "#fff7ed",
  color: "#c2410c",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const badgeEstavel = {
  background: "#ecfdf5",
  color: "#047857",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const badgeTaxa = {
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const turmaTitulo = {
  fontSize: 20,
  fontWeight: 800,
  color: "#0f172a",
};

const turmaMeta = {
  color: "#64748b",
  fontSize: 14,
};

const miniLinha = {
  display: "flex",
  gap: 18,
  flexWrap: "wrap",
  color: "#64748b",
  fontSize: 13,
};

const infoBloco = {
  display: "grid",
  gap: 6,
  color: "#475569",
  fontSize: 14,
};

const acoesWrap = {
  marginTop: 4,
  display: "flex",
  justifyContent: "flex-end",
};

const btnPrimario = {
  background: "#2563eb",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "10px 14px",
  cursor: "pointer",
  fontWeight: 700,
};

const emptyText = {
  color: "#64748b",
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
