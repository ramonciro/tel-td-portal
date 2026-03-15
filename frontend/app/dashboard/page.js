"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../components/PortalShell";
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

  const cards = [
    {
      title: "Clientes",
      value: dados?.clientes ?? 0,
      subtitle: "Base de operações acompanhadas pelo T&D.",
      accent: "#2563eb",
    },
    {
      title: "Usuários",
      value: dados?.usuarios ?? 0,
      subtitle: "Perfis cadastrados para acesso ao portal.",
      accent: "#7c3aed",
    },
    {
      title: "Treinamentos",
      value: dados?.treinamentos ?? 0,
      subtitle: "Quantidade total registrada na plataforma.",
      accent: "#059669",
    },
    {
      title: "Presenças",
      value: dados?.presencas ?? 0,
      subtitle: "Apontamentos de presença e acompanhamento.",
      accent: "#ea580c",
    },
    {
      title: "Avaliações",
      value: dados?.avaliacoes ?? 0,
      subtitle: "Feedbacks e medições de qualidade aplicadas.",
      accent: "#dc2626",
    },
    {
      title: "Biblioteca",
      value: dados?.biblioteca ?? 0,
      subtitle: "Materiais de apoio cadastrados no portal.",
      accent: "#0891b2",
    },
    {
      title: "Trilhas",
      value: dados?.trilhas ?? 0,
      subtitle: "Estruturas de aprendizagem acompanhadas.",
      accent: "#65a30d",
    },
  ];

  return (
    <PortalShell
      title="Dashboard Executivo"
      subtitle="Visão estratégica do treinamento e desenvolvimento, com leitura rápida dos principais volumes cadastrados no ambiente."
    >
      {erro ? (
        <div
          style={{
            marginBottom: 18,
            background: "#fef2f2",
            color: "#b91c1c",
            border: "1px solid #fecaca",
            borderRadius: 16,
            padding: 16,
            fontWeight: 600,
          }}
        >
          {erro}
        </div>
      ) : null}

      {loading ? (
        <div
          style={{
            background: "#fff",
            borderRadius: 22,
            padding: 24,
            border: "1px solid #e2e8f0",
          }}
        >
          Carregando dashboard...
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 18,
              marginBottom: 22,
            }}
          >
            {cards.map((item) => (
              <StatCard key={item.title} {...item} />
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.15fr .85fr",
              gap: 18,
            }}
          >
            <section
              style={{
                background: "#fff",
                borderRadius: 22,
                padding: 24,
                border: "1px solid #e2e8f0",
                boxShadow: "0 12px 28px rgba(15,23,42,.06)",
              }}
            >
              <h2 style={{ marginTop: 0, fontSize: 24 }}>Resumo gerencial</h2>
              <p style={{ color: "#475569", lineHeight: 1.75 }}>
                O dashboard centraliza os volumes principais do portal e oferece uma leitura
                executiva do ambiente atual. A partir desta base, a próxima evolução pode incluir
                indicadores por cliente, taxa de participação, desempenho por instrutor, horas
                ministradas e consolidado de avaliações.
              </p>
              <p style={{ color: "#475569", lineHeight: 1.75 }}>
                A intenção desta versão é dar uma aparência mais institucional e estratégica,
                facilitando o acompanhamento do setor de T&D e preparando o portal para avanços
                mais robustos na próxima etapa.
              </p>
            </section>

            <section
              style={{
                background: "#fff",
                borderRadius: 22,
                padding: 24,
                border: "1px solid #e2e8f0",
                boxShadow: "0 12px 28px rgba(15,23,42,.06)",
              }}
            >
              <h2 style={{ marginTop: 0, fontSize: 22 }}>Leitura rápida</h2>
              <div style={{ display: "grid", gap: 12 }}>
                {[
                  `Clientes acompanhados: ${dados?.clientes ?? 0}`,
                  `Usuários cadastrados: ${dados?.usuarios ?? 0}`,
                  `Treinamentos cadastrados: ${dados?.treinamentos ?? 0}`,
                  `Avaliações registradas: ${dados?.avaliacoes ?? 0}`,
                  `Acervo da biblioteca: ${dados?.biblioteca ?? 0}`,
                  `Trilhas ativas: ${dados?.trilhas ?? 0}`,
                ].map((item) => (
                  <div
                    key={item}
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 16,
                      padding: 14,
                      color: "#334155",
                      fontWeight: 600,
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </PortalShell>
  );
}
