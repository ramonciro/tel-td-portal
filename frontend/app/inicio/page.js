"use client";

import PortalShell from "../../components/PortalShell";
import StatCard from "../../components/StatCard";
import SectionCard from "../../components/SectionCard";

const comunicados = [
  "Atualização de materiais de treinamento disponível na Biblioteca.",
  "Novas trilhas de aprendizagem em construção para operações prioritárias.",
  "Reforço de acompanhamento de presença e de consolidação das avaliações aplicadas."
];

const agendaRapida = [
  "Onboarding operacional — Mercantil",
  "Reciclagem de processo — Claro",
  "Capacitação de produto — Agibank",
  "Atualização de trilha — Prefeitura de Salvador"
];

const destaques = [
  {
    titulo: "Novidades do portal",
    descricao: "Espaço para reforçar o que foi atualizado, publicado ou reorganizado no ambiente."
  },
  {
    titulo: "Movimento das turmas",
    descricao: "Quadro pensado para dar percepção de rotina ativa do T&D e não apenas uma vitrine institucional."
  },
  {
    titulo: "Foco de desenvolvimento",
    descricao: "A página inicial passa a reforçar aprendizagem contínua, evolução e apoio ao negócio."
  }
];

export default function InicioPage() {
  return (
    <PortalShell
      title="Centro de atualizações do Treinamento & Desenvolvimento"
      subtitle="Uma entrada mais viva, útil e estratégica para o dia a dia do T&D, conectando comunicação, rotina, capacitação e prioridades do setor."
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: 18,
          marginBottom: 20
        }}
      >
        <StatCard
          title="Ambiente do T&D"
          value="Ativo"
          subtitle="Treinamentos, reciclagens e ações de desenvolvimento em andamento."
          accent="#2563eb"
          helper="Rotina viva"
        />
        <StatCard
          title="Atualizações recentes"
          value="Portal"
          subtitle="Materiais, trilhas e conteúdos em revisão ou publicação contínua."
          accent="#7c3aed"
          helper="Comunicação útil"
        />
        <StatCard
          title="Foco do momento"
          value="Capacitação"
          subtitle="Desenvolvimento técnico, padronização e melhoria contínua."
          accent="#059669"
          helper="Direção do setor"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 18, marginBottom: 18 }}>
        <SectionCard
          title="Comunicados e novidades do T&D"
          subtitle="Espaço para avisos importantes, mudanças de processo, reforços e atualizações relevantes para instrutores, treinandos e gestão."
        >
          <div style={{ display: "grid", gap: 12 }}>
            {comunicados.map((item) => (
              <div
                key={item}
                style={{
                  background: "#f8fafc",
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid #e2e8f0",
                  color: "#334155",
                  fontWeight: 600
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Agenda rápida de treinamentos"
          subtitle="Uma visão simples do movimento das ações formativas em andamento ou já priorizadas."
        >
          <div style={{ display: "grid", gap: 10 }}>
            {agendaRapida.map((item) => (
              <div
                key={item}
                style={{
                  background: "#f8fafc",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  color: "#475569",
                  fontWeight: 600
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <SectionCard
          title="Leitura da página inicial"
          subtitle="Esta página deixa de ser apenas introdutória e passa a ter papel de ambiente vivo de acompanhamento."
        >
          <p style={{ color: "#475569", lineHeight: 1.8, marginTop: 0 }}>
            A proposta é que, ao acessar o portal, o usuário veja um espaço com cara de rotina real do T&D. Isso inclui comunicação, percepção de agenda, reforço de prioridades e sensação de movimento contínuo das entregas do setor.
          </p>
          <p style={{ color: "#475569", lineHeight: 1.8 }}>
            Na prática, esta tela pode evoluir para concentrar novidades da semana, materiais recém-publicados, campanhas de aprendizagem, turmas em destaque e reforços operacionais importantes para o time.
          </p>
        </SectionCard>

        <SectionCard
          title="Estrutura sugerida para evolução"
          subtitle="Base do que pode ser alimentado com dados reais antes da apresentação."
        >
          <div style={{ display: "grid", gap: 12 }}>
            {destaques.map((item) => (
              <div
                key={item.titulo}
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 16,
                  padding: 16
                }}
              >
                <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
                  {item.titulo}
                </div>
                <div style={{ color: "#64748b", lineHeight: 1.65 }}>
                  {item.descricao}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </PortalShell>
  );
}
