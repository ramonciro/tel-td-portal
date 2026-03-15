"use client";

import PortalShell from "../../components/PortalShell";
import StatCard from "../../components/StatCard";

export default function InicioPage() {
  const destaques = [
    {
      title: "Portal estabilizado",
      value: "100%",
      subtitle: "Ambiente validado com frontend, backend e banco conectados.",
      accent: "#2563eb",
    },
    {
      title: "Próximo foco",
      value: "V2.0",
      subtitle: "Refino visual e funcional página por página para ganho executivo.",
      accent: "#7c3aed",
    },
    {
      title: "Prioridade",
      value: "UX",
      subtitle: "Melhorar leitura, navegação e percepção estratégica do portal.",
      accent: "#059669",
    },
  ];

  return (
    <PortalShell
      title="Início do Portal T&D"
      subtitle="Central de acompanhamento do ambiente, com visão executiva e base pronta para evolução por módulo."
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 18,
          marginBottom: 24,
        }}
      >
        {destaques.map((item) => (
          <StatCard key={item.title} {...item} />
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr .8fr",
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
          <h2 style={{ marginTop: 0, fontSize: 26 }}>Leitura executiva do momento</h2>
          <p style={{ color: "#475569", lineHeight: 1.7 }}>
            O ambiente do portal está operacional e já suporta a evolução estruturada dos
            módulos de T&D. A recomendação agora é seguir uma trilha de melhoria por página,
            priorizando experiência do usuário, clareza dos dados, padronização visual e
            aderência à rotina gerencial do time.
          </p>
          <p style={{ color: "#475569", lineHeight: 1.7 }}>
            A base atual permite avançar para um painel mais estratégico, com indicadores por
            cliente, treinamentos realizados, presença, avaliação, biblioteca de apoio e trilhas
            de aprendizagem com mais inteligência visual.
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
          <h2 style={{ marginTop: 0, fontSize: 22 }}>Próximos passos sugeridos</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {[
              "Refinar dashboard executivo",
              "Aprimorar páginas de cadastro",
              "Melhorar biblioteca e trilhas",
              "Padronizar mensagens e validações",
              "Evoluir para uma visão mais estratégica",
            ].map((item, index) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 16,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: "#dbeafe",
                    color: "#1d4ed8",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                  }}
                >
                  {index + 1}
                </div>
                <div style={{ color: "#334155", fontWeight: 600 }}>{item}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
