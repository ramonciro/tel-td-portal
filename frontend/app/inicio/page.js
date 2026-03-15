"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

export default function InicioPage() {
  const [dashboard, setDashboard] = useState(null);
  const [treinamentos, setTreinamentos] = useState([]);
  const [biblioteca, setBiblioteca] = useState([]);
  const [trilhas, setTrilhas] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const [dash, treinamentosData, bibliotecaData, trilhasData] = await Promise.all([
          apiFetch("/dashboard").catch(() => ({})),
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/biblioteca").catch(() => []),
          apiFetch("/trilhas").catch(() => []),
        ]);

        setDashboard(dash || {});
        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
        setBiblioteca(Array.isArray(bibliotecaData) ? bibliotecaData : []);
        setTrilhas(Array.isArray(trilhasData) ? trilhasData : []);
        setErro("");
      } catch (error) {
        setErro(error.message || "Erro ao carregar informações da página inicial");
      }
    }

    carregar();
  }, []);

  const ultimosTreinamentos = useMemo(
    () => [...treinamentos].slice(-5).reverse(),
    [treinamentos]
  );

  const ultimosMateriais = useMemo(
    () => [...biblioteca].slice(-5).reverse(),
    [biblioteca]
  );

  const ultimasTrilhas = useMemo(
    () => [...trilhas].slice(-5).reverse(),
    [trilhas]
  );

  return (
    <PortalShell
      title="Centro de atualizações do Treinamento & Desenvolvimento"
      subtitle="Visão dinâmica do setor com base no que já foi lançado no portal."
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 18,
          marginBottom: 20,
        }}
      >
        <StatCard
          title="Clientes"
          value={dashboard?.clientes ?? 0}
          subtitle="Clientes já cadastrados no portal"
          accent="#2563eb"
        />
        <StatCard
          title="Treinamentos"
          value={dashboard?.treinamentos ?? 0}
          subtitle="Turmas e ações lançadas"
          accent="#059669"
        />
        <StatCard
          title="Biblioteca"
          value={dashboard?.biblioteca ?? 0}
          subtitle="Materiais disponíveis"
          accent="#0891b2"
        />
        <StatCard
          title="Trilhas"
          value={dashboard?.trilhas ?? 0}
          subtitle="Percursos de aprendizagem cadastrados"
          accent="#65a30d"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr .9fr",
          gap: 18,
          marginBottom: 18,
        }}
      >
        <SectionCard
          title="Treinamentos recentes"
          subtitle="Últimos registros lançados no módulo de treinamentos"
        >
          {ultimosTreinamentos.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {ultimosTreinamentos.map((item, index) => (
                <div
                  key={item.id || index}
                  style={{
                    background: "#f8fafc",
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>
                    {item.titulo || item.tema || "Treinamento"}
                  </div>
                  <div style={{ marginTop: 6, color: "#475569", fontSize: 14 }}>
                    {item.cliente || "Sem cliente"} • {item.instrutor || "Sem instrutor"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#64748b" }}>Nenhum treinamento lançado até o momento.</div>
          )}
        </SectionCard>

        <SectionCard
          title="Materiais recentes da biblioteca"
          subtitle="Últimos conteúdos adicionados ao acervo"
        >
          {ultimosMateriais.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {ultimosMateriais.map((item, index) => (
                <div
                  key={item.id || index}
                  style={{
                    background: "#f8fafc",
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>
                    {item.titulo || "Material"}
                  </div>
                  <div style={{ marginTop: 6, color: "#475569", fontSize: 14 }}>
                    {item.tipo || "Sem tipo"} • {item.cliente || "Sem cliente"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#64748b" }}>Nenhum material cadastrado na biblioteca.</div>
          )}
        </SectionCard>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
        }}
      >
        <SectionCard
          title="Trilhas recentes"
          subtitle="Últimos percursos adicionados no ambiente"
        >
          {ultimasTrilhas.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {ultimasTrilhas.map((item, index) => (
                <div
                  key={item.id || index}
                  style={{
                    background: "#f8fafc",
                    padding: 14,
                    borderRadius: 14,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#0f172a" }}>
                    {item.titulo || "Trilha"}
                  </div>
                  <div style={{ marginTop: 6, color: "#475569", fontSize: 14 }}>
                    {item.cliente || "GLOBAL"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#64748b" }}>Nenhuma trilha cadastrada até o momento.</div>
          )}
        </SectionCard>

        <SectionCard
          title="Panorama do portal"
          subtitle="Leitura resumida com base nas informações já registradas"
        >
          <div style={{ display: "grid", gap: 12 }}>
            {[
              `Usuários cadastrados: ${dashboard?.usuarios ?? 0}`,
              `Presenças registradas: ${dashboard?.presencas ?? 0}`,
              `Avaliações lançadas: ${dashboard?.avaliacoes ?? 0}`,
              `Materiais na biblioteca: ${dashboard?.biblioteca ?? 0}`,
            ].map((item) => (
              <div
                key={item}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 14,
                  padding: 14,
                  color: "#334155",
                  fontWeight: 700,
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </PortalShell>
  );
}
