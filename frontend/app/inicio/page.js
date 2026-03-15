"use client";

import PortalShell from "../../components/PortalShell";
import StatCard from "../../components/StatCard";
import SectionCard from "../../components/SectionCard";

const novidades = [
  {
    titulo: "Comunicados e atualizações",
    descricao: "Área pensada para concentrar avisos importantes do T&D, alterações em trilhas, atualizações de materiais e direcionamentos operacionais.",
  },
  {
    titulo: "Movimento das turmas",
    descricao: "Espaço para destacar novas turmas, reciclagens, onboarding, cronogramas e ações prioritárias do mês.",
  },
  {
    titulo: "Foco em desenvolvimento",
    descricao: "A página inicial precisa reforçar a visão de aprendizado contínuo, evolução de pessoas e qualidade das entregas do time.",
  },
];

export default function InicioPage() {
  return (
    <PortalShell
      title="Ambiente de atualizações e novidades do T&D"
      subtitle="Uma entrada mais viva, útil e estratégica para instrutores, supervisores e coordenação, conectando comunicação, rotina e desenvolvimento."
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18, marginBottom: 20 }}>
        <StatCard title="Atualizações do portal" value="V3" subtitle="Versão com navegação executiva e base preparada para refinamento por módulo." accent="#2563eb" helper="Ambiente em evolução" />
        <StatCard title="Comunicação interna" value="T&D" subtitle="Espaço pensado para reforçar o que está acontecendo, o que muda e o que é prioridade." accent="#7c3aed" helper="Mais utilidade no acesso" />
        <StatCard title="Próxima etapa" value="Página a página" subtitle="Agora a evolução acontece de forma orientada, amarrando fluxo, visual e gestão." accent="#059669" helper="Refino contínuo" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 18 }}>
        <SectionCard title="Leitura da página inicial" subtitle="Esta área foi pensada para não parecer superficial. A proposta é criar uma entrada leve, funcional e com cara de rotina viva do T&D.">
          <p style={{ color: "#475569", lineHeight: 1.8, marginTop: 0 }}>
            A página inicial deve funcionar como um ambiente de atualização e novidades, e não apenas como um painel estático. Ao acessar o portal, o usuário precisa sentir que entrou em um espaço de trabalho, desenvolvimento e acompanhamento.
          </p>
          <p style={{ color: "#475569", lineHeight: 1.8 }}>
            O ideal é que ela concentre destaques como movimentação de turmas, prioridades da semana, reforços de comunicação, materiais novos, ajustes de processo e pontos de atenção do time de Treinamento e Desenvolvimento.
          </p>
        </SectionCard>

        <SectionCard title="Destaques estruturais" subtitle="Base para a evolução futura desta página.">
          <div style={{ display: "grid", gap: 12 }}>
            {novidades.map((item) => (
              <div key={item.titulo} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: 16 }}>
                <div style={{ fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{item.titulo}</div>
                <div style={{ color: "#64748b", lineHeight: 1.65 }}>{item.descricao}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </PortalShell>
  );
}
