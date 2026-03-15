"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

export default function DashboardPage() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        const response = await apiFetch("/dashboard");
        setDados(response);
        setErro("");
      } catch (error) {
        setErro(error.message || "Erro ao carregar dashboard executivo");
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, []);

  const cards = useMemo(() => [
    { title: "Clientes", value: dados?.clientes ?? 0, subtitle: "Base de operações acompanhadas pelo T&D.", accent: "#2563eb" },
    { title: "Usuários", value: dados?.usuarios ?? 0, subtitle: "Perfis ativos para operação e gestão do portal.", accent: "#7c3aed" },
    { title: "Treinamentos", value: dados?.treinamentos ?? 0, subtitle: "Quantidade de ações formativas cadastradas.", accent: "#059669" },
    { title: "Presenças", value: dados?.presencas ?? 0, subtitle: "Controles aplicados nas ações de treinamento.", accent: "#ea580c" },
    { title: "Avaliações", value: dados?.avaliacoes ?? 0, subtitle: "Avaliações, provas, testes e simulados registrados.", accent: "#dc2626" },
    { title: "Biblioteca", value: dados?.biblioteca ?? 0, subtitle: "Materiais disponíveis no acervo do T&D.", accent: "#0891b2" },
    { title: "Trilhas", value: dados?.trilhas ?? 0, subtitle: "Estruturas de aprendizagem e desenvolvimento.", accent: "#65a30d" },
  ], [dados]);

  return (
    <PortalShell
      title="Dashboard executivo do trabalho do time"
      subtitle="Painel central para leitura do ambiente de T&D, com visão gerencial sobre entregas, base cadastral e estrutura atual da operação."
    >
      {erro ? <div style={{ marginBottom: 18, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 16, padding: 16, fontWeight: 600 }}>{erro}</div> : null}

      {loading ? (
        <SectionCard title="Carregando dashboard">
          <div style={{ color: "#64748b" }}>Aguarde enquanto os indicadores são atualizados.</div>
        </SectionCard>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18, marginBottom: 20 }}>
            {cards.map((item) => <StatCard key={item.title} {...item} />)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 18 }}>
            <SectionCard title="Leitura executiva do T&D" subtitle="Este é o local para leitura do trabalho do time, com foco em visão ampla e acompanhamento da operação.">
              <p style={{ color: "#475569", lineHeight: 1.8, marginTop: 0 }}>
                O dashboard deve consolidar a percepção do que o time de T&D está movimentando no ambiente. Mais do que contar registros, ele precisa apoiar leitura de capacidade, rotina, evolução dos módulos e visão do trabalho entregue.
              </p>
              <p style={{ color: "#475569", lineHeight: 1.8 }}>
                Na próxima etapa, a base pode ser expandida com indicadores como horas ministradas, turmas por cliente, ranking de instrutores, evolução mensal de treinamentos, provas e simulados aplicados e distribuição das trilhas por público.
              </p>
            </SectionCard>

            <SectionCard title="Leitura rápida do ambiente" subtitle="Resumo do que hoje já está refletido no portal.">
              <div style={{ display: "grid", gap: 12 }}>
                {[
                  `Clientes acompanhados: ${dados?.clientes ?? 0}`,
                  `Usuários cadastrados: ${dados?.usuarios ?? 0}`,
                  `Treinamentos registrados: ${dados?.treinamentos ?? 0}`,
                  `Presenças registradas: ${dados?.presencas ?? 0}`,
                  `Avaliações, provas e simulados: ${dados?.avaliacoes ?? 0}`,
                  `Itens na biblioteca: ${dados?.biblioteca ?? 0}`,
                  `Trilhas disponíveis: ${dados?.trilhas ?? 0}`,
                ].map((item) => (
                  <div key={item} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: 14, color: "#334155", fontWeight: 700 }}>
                    {item}
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </PortalShell>
  );
}
