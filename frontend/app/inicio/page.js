"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";
import SectionCard from "../../components/SectionCard";
import StatCard from "../../components/StatCard";
import { apiFetch } from "../../services/api";

function fmt(n) {
  return new Intl.NumberFormat("pt-BR").format(Number(n || 0));
}

function parseHoras(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).replace(",", ".").trim();
  const match = text.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

export default function InicioPage() {
  const [dashboard, setDashboard] = useState({});
  const [treinamentos, setTreinamentos] = useState([]);
  const [biblioteca, setBiblioteca] = useState([]);
  const [trilhas, setTrilhas] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const [
          dash,
          treinamentosData,
          bibliotecaData,
          trilhasData,
          avaliacoesData,
          presencasData,
        ] = await Promise.all([
          apiFetch("/dashboard").catch(() => ({})),
          apiFetch("/treinamentos").catch(() => []),
          apiFetch("/biblioteca").catch(() => []),
          apiFetch("/trilhas").catch(() => []),
          apiFetch("/avaliacoes").catch(() => []),
          apiFetch("/presencas").catch(() => []),
        ]);

        setDashboard(dash || {});
        setTreinamentos(Array.isArray(treinamentosData) ? treinamentosData : []);
        setBiblioteca(Array.isArray(bibliotecaData) ? bibliotecaData : []);
        setTrilhas(Array.isArray(trilhasData) ? trilhasData : []);
        setAvaliacoes(Array.isArray(avaliacoesData) ? avaliacoesData : []);
        setPresencas(Array.isArray(presencasData) ? presencasData : []);
        setErro("");
      } catch (error) {
        setErro(error.message || "Erro ao carregar a página inicial.");
      }
    }

    carregar();
  }, []);

  const leitura = useMemo(() => {
    const ultimosTreinamentos = [...treinamentos].slice(-5).reverse();
    const ultimosMateriais = [...biblioteca].slice(-5).reverse();
    const ultimasTrilhas = [...trilhas].slice(-5).reverse();

    const totalParticipacoes = presencas.length;
    const presentes = presencas.filter(
      (p) => String(p.status || "").toLowerCase() === "presente"
    ).length;
    const ausentes = presencas.filter(
      (p) => String(p.status || "").toLowerCase() === "ausente"
    ).length;

    const taxaPresenca = totalParticipacoes
      ? Math.round((presentes / totalParticipacoes) * 100)
      : 0;

    const horasMinistradas = treinamentos.reduce(
      (acc, item) => acc + parseHoras(item.carga_horaria),
      0
    );

    const horasTreinadas = treinamentos.reduce((acc, item) => {
      const horas = parseHoras(item.carga_horaria);
      const presentesTurma = presencas.filter(
        (p) =>
          String(p.treinamento_id) === String(item.id) &&
          String(p.status || "").toLowerCase() === "presente"
      ).length;

      return acc + horas * presentesTurma;
    }, 0);

    const mediaQualidade = avaliacoes.length
      ? (
          avaliacoes.reduce(
            (acc, item) => acc + Number(item.nota_qualidade || 0),
            0
          ) / avaliacoes.length
        ).toFixed(1)
      : "0.0";

    const mediaNps = avaliacoes.length
      ? (
          avaliacoes.reduce(
            (acc, item) => acc + Number(item.nota_nps || 0),
            0
          ) / avaliacoes.length
        ).toFixed(1)
      : "0.0";

    const porClienteMap = {};
    treinamentos.forEach((item) => {
      const cliente = item.cliente || "Sem cliente";
      if (!porClienteMap[cliente]) {
        porClienteMap[cliente] = {
          cliente,
          treinamentos: 0,
          participantes: 0,
        };
      }
      porClienteMap[cliente].treinamentos += 1;
      porClienteMap[cliente].participantes += Number(item.participantes || 0);
    });

    const porCliente = Object.values(porClienteMap)
      .sort((a, b) => b.treinamentos - a.treinamentos)
      .slice(0, 6);

    const alertas = [];

    const treinamentosSemInstrutor = treinamentos.filter(
      (item) => !item.instrutor
    ).length;
    if (treinamentosSemInstrutor > 0) {
      alertas.push(
        `${treinamentosSemInstrutor} treinamento(s) ainda sem instrutor definido.`
      );
    }

    const materiaisEmAtualizacao = biblioteca.filter((item) => {
      const status = String(item.status || "").toLowerCase();
      return status === "em atualização" || status === "em atualizacao";
    }).length;
    if (materiaisEmAtualizacao > 0) {
      alertas.push(
        `${materiaisEmAtualizacao} material(is) da biblioteca estão em atualização.`
      );
    }

    const trilhasEmConstrucao = trilhas.filter((item) => {
      const status = String(item.status || "").toLowerCase();
      return status === "em construção" || status === "em construcao";
    }).length;
    if (trilhasEmConstrucao > 0) {
      alertas.push(`${trilhasEmConstrucao} trilha(s) estão em construção.`);
    }

    if (!alertas.length) {
      alertas.push("Ambiente organizado, sem alertas críticos neste momento.");
    }

    return {
      ultimosTreinamentos,
      ultimosMateriais,
      ultimasTrilhas,
      totalParticipacoes,
      presentes,
      ausentes,
      taxaPresenca,
      horasMinistradas,
      horasTreinadas,
      mediaQualidade,
      mediaNps,
      porCliente,
      alertas,
    };
  }, [treinamentos, biblioteca, trilhas, avaliacoes, presencas]);

  return (
    <PortalShell
      title="Início"
      subtitle="Centro de gestão do portal de Treinamento & Desenvolvimento."
    >
      {erro ? <div style={errorBox}>{erro}</div> : null}

      <div style={heroWrap}>
        <div style={heroMain}>
          <div style={heroBadge}>Visão consolidada</div>
          <h2 style={heroTitle}>Painel central do T&amp;D</h2>
          <p style={heroText}>
            Acompanhe rapidamente o volume de ações, cobertura do portal,
            assiduidade, acervo e maturidade da jornada de aprendizagem.
          </p>
        </div>

        <div style={heroMiniGrid}>
          <div style={heroMiniCard}>
            <strong>{fmt(leitura.presentes)}</strong>
            <span>presenças confirmadas</span>
          </div>
          <div style={heroMiniCard}>
            <strong>{fmt(leitura.ausentes)}</strong>
            <span>ausências mapeadas</span>
          </div>
          <div style={heroMiniCard}>
            <strong>{leitura.taxaPresenca}%</strong>
            <span>presença média</span>
          </div>
        </div>
      </div>

      <div style={gridFour}>
        <StatCard
          title="Clientes"
          value={dashboard?.clientes ?? 0}
          subtitle="Clientes acompanhados"
          accent="#2563eb"
        />
        <StatCard
          title="Treinamentos"
          value={dashboard?.treinamentos ?? treinamentos.length}
          subtitle="Ações cadastradas"
          accent="#059669"
        />
        <StatCard
          title="Biblioteca"
          value={dashboard?.biblioteca ?? biblioteca.length}
          subtitle="Materiais no acervo"
          accent="#0891b2"
        />
        <StatCard
          title="Trilhas"
          value={dashboard?.trilhas ?? trilhas.length}
          subtitle="Jornadas estruturadas"
          accent="#7c3aed"
        />
      </div>

      <div style={{ ...gridFour, marginTop: 12 }}>
        <StatCard
          title="Horas ministradas"
          value={`${fmt(leitura.horasMinistradas)}h`}
          subtitle="Carga aplicada"
          accent="#0f766e"
        />
        <StatCard
          title="Horas treinadas"
          value={`${fmt(leitura.horasTreinadas)}h`}
          subtitle="Carga × presença"
          accent="#1d4ed8"
        />
        <StatCard
          title="Qualidade média"
          value={leitura.mediaQualidade}
          subtitle="Avaliações registradas"
          accent="#16a34a"
        />
        <StatCard
          title="NPS médio"
          value={leitura.mediaNps}
          subtitle="Percepção geral"
          accent="#ea580c"
        />
      </div>

      <div style={twoCol}>
        <SectionCard
          title="Impacto por cliente"
          subtitle="Clientes com maior volume de ações lançadas."
        >
          <div style={listGrid}>
            {leitura.porCliente.length ? (
              leitura.porCliente.map((item) => (
                <div key={item.cliente} style={listItem}>
                  <div style={itemTitle}>{item.cliente}</div>
                  <div style={itemMeta}>
                    {item.treinamentos} treinamento(s) • {fmt(item.participantes)} participantes
                  </div>
                </div>
              ))
            ) : (
              <div style={emptyText}>Nenhum cliente disponível.</div>
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Alertas gerenciais"
          subtitle="Leitura rápida para acompanhamento da operação."
        >
          <div style={alertGrid}>
            {leitura.alertas.map((item, index) => (
              <div key={index} style={alertItem}>
                {item}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div style={{ ...twoCol, marginTop: 12 }}>
        <SectionCard
          title="Treinamentos recentes"
          subtitle="Últimas ações registradas."
        >
          {leitura.ultimosTreinamentos.length ? (
            <div style={listGrid}>
              {leitura.ultimosTreinamentos.map((item, index) => (
                <div key={item.id || index} style={listItem}>
                  <div style={itemTitle}>
                    {item.tema || item.titulo || "Treinamento"}
                  </div>
                  <div style={itemMeta}>
                    {(item.cliente || "Sem cliente") +
                      " • " +
                      (item.instrutor || "Sem instrutor")}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhum treinamento registrado.</div>
          )}
        </SectionCard>

        <SectionCard
          title="Materiais recentes"
          subtitle="Últimos itens adicionados à biblioteca."
        >
          {leitura.ultimosMateriais.length ? (
            <div style={listGrid}>
              {leitura.ultimosMateriais.map((item, index) => (
                <div key={item.id || index} style={listItem}>
                  <div style={itemTitle}>{item.titulo || "Material"}</div>
                  <div style={itemMeta}>
                    {(item.tipo || "Sem tipo") +
                      " • " +
                      (item.cliente || "GLOBAL")}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhum material cadastrado.</div>
          )}
        </SectionCard>
      </div>

      <div style={{ marginTop: 12 }}>
        <SectionCard
          title="Trilhas recentes"
          subtitle="Últimas jornadas estruturadas no portal."
        >
          {leitura.ultimasTrilhas.length ? (
            <div style={listGrid}>
              {leitura.ultimasTrilhas.map((item, index) => (
                <div key={item.id || index} style={listItem}>
                  <div style={itemTitle}>{item.titulo || "Trilha"}</div>
                  <div style={itemMeta}>
                    {(item.cliente || "GLOBAL") +
                      " • " +
                      (item.publico || "Sem público")}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={emptyText}>Nenhuma trilha cadastrada.</div>
          )}
        </SectionCard>
      </div>
    </PortalShell>
  );
}

const heroWrap = {
  display: "grid",
  gridTemplateColumns: "1.5fr .9fr",
  gap: 14,
  marginBottom: 14,
};

const heroMain = {
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
  borderRadius: 20,
  padding: 20,
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
  fontSize: 28,
  lineHeight: 1.05,
};

const heroText = {
  margin: 0,
  color: "rgba(255,255,255,.84)",
  lineHeight: 1.6,
};

const heroMiniGrid = {
  display: "grid",
  gap: 10,
};

const heroMiniCard = {
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid #dbeafe",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 10px 22px rgba(15,23,42,.05)",
  display: "grid",
  gap: 4,
};

const gridFour = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const twoCol = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginTop: 14,
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
