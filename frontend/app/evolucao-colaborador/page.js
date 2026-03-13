
"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";

export default function EvolucaoColaboradorPage() {
  const [users, setUsers] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [treinamentos, setTreinamentos] = useState([]);
  const [erro, setErro] = useState("");

  const [colaborador, setColaborador] = useState("todos");
  const [busca, setBusca] = useState("");

  async function carregar() {
    try {
      setErro("");
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      const [rUsers, rPresencas, rAvaliacoes, rTreinamentos] = await Promise.all([
        fetch(`${apiUrl}/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/presencas`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/avaliacoes`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/treinamentos`, { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (!rUsers.ok || !rPresencas.ok || !rAvaliacoes.ok || !rTreinamentos.ok) {
        throw new Error();
      }

      const dUsers = await rUsers.json();
      const dPresencas = await rPresencas.json();
      const dAvaliacoes = await rAvaliacoes.json();
      const dTreinamentos = await rTreinamentos.json();

      setUsers(Array.isArray(dUsers) ? dUsers : []);
      setPresencas(Array.isArray(dPresencas) ? dPresencas : []);
      setAvaliacoes(Array.isArray(dAvaliacoes) ? dAvaliacoes : []);
      setTreinamentos(Array.isArray(dTreinamentos) ? dTreinamentos : []);
    } catch {
      setErro("Erro ao carregar dados da evolução do colaborador");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const treinamentoMap = useMemo(() => {
    const map = {};
    treinamentos.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [treinamentos]);

  const colaboradores = useMemo(() => {
    const nomesUsuarios = users.map((u) => u.nome).filter(Boolean);
    const nomesPresencas = presencas.map((p) => p.treinando_nome).filter(Boolean);
    return [...new Set([...nomesUsuarios, ...nomesPresencas])].sort((a, b) => a.localeCompare(b));
  }, [users, presencas]);

  const colaboradoresVisiveis = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return colaboradores.filter((nome) => !termo || nome.toLowerCase().includes(termo));
  }, [colaboradores, busca]);

  const registros = useMemo(() => {
    const nomes = colaborador === "todos" ? colaboradoresVisiveis : [colaborador];

    return nomes.map((nome) => {
      const usuario = users.find((u) => String(u.nome || "").toLowerCase() === String(nome || "").toLowerCase());

      const presencasColab = presencas.filter(
        (p) => String(p.treinando_nome || "").toLowerCase() === String(nome || "").toLowerCase()
      );

      const treinamentoIds = [...new Set(presencasColab.map((p) => p.treinamento_id).filter(Boolean))];
      const treinamentosColab = treinamentoIds
        .map((id) => treinamentoMap[id])
        .filter(Boolean);

      const avaliacoesRelacionadas = avaliacoes.filter((a) => treinamentoIds.includes(a.treinamento_id));

      const presentes = presencasColab.filter((p) => p.status === "presente").length;
      const ausentes = presencasColab.filter((p) => p.status === "ausente").length;
      const justificadas = presencasColab.filter((p) => p.status === "justificado").length;
      const totalRegistros = presencasColab.length;

      const assiduidade = totalRegistros > 0 ? round((presentes / totalRegistros) * 100) : 0;
      const absenteismo = totalRegistros > 0 ? round((ausentes / totalRegistros) * 100) : 0;

      const npsMedio = avaliacoesRelacionadas.length
        ? round(avg(avaliacoesRelacionadas.map((a) => Number(a.nota_nps || 0))))
        : 0;

      const qualidadeMedia = avaliacoesRelacionadas.length
        ? round(avg(avaliacoesRelacionadas.map((a) => Number(a.nota_qualidade || 0))))
        : 0;

      const notaMedia = avaliacoesRelacionadas.length
        ? round(avg(avaliacoesRelacionadas.map((a) => Number(a.nota_prova || 0))))
        : 0;

      const horasTreinadas = treinamentosColab.reduce((acc, t) => acc + Number(t.carga_horaria || 0), 0);
      const concluidos = treinamentosColab.reduce((acc, t) => acc + Number(t.concluidos || 0), 0);
      const previstos = treinamentosColab.reduce((acc, t) => acc + Number(t.participantes_previstos || 0), 0);
      const presentesTreinamento = treinamentosColab.reduce((acc, t) => acc + Number(t.participantes_presentes || 0), 0);
      const taxaConclusao = presentesTreinamento > 0 ? round((concluidos / presentesTreinamento) * 100) : 0;

      const etapas = [
        { label: "Integração", done: treinamentosColab.length >= 1 },
        { label: "Participação", done: presentes >= 1 },
        { label: "Aprendizagem", done: notaMedia > 0 },
        { label: "Consolidação", done: qualidadeMedia >= 4 || npsMedio >= 8 },
        { label: "Evolução contínua", done: horasTreinadas >= 8 || treinamentosColab.length >= 3 }
      ];

      return {
        nome,
        perfil: usuario?.perfil || "-",
        cliente: usuario?.cliente || treinamentosColab[0]?.cliente || "-",
        email: usuario?.email || "-",
        treinamentos: treinamentosColab.length,
        horasTreinadas,
        presentes,
        ausentes,
        justificadas,
        assiduidade,
        absenteismo,
        npsMedio,
        qualidadeMedia,
        notaMedia,
        taxaConclusao,
        previstos,
        concluidos,
        proximosTreinamentos: treinamentosColab.slice(0, 4),
        etapas
      };
    });
  }, [colaborador, colaboradoresVisiveis, users, presencas, avaliacoes, treinamentoMap]);

  const resumo = useMemo(() => {
    return {
      total: registros.length,
      progressoMedio: registros.length ? round(avg(registros.map((r) => progressoEtapas(r.etapas)))) : 0,
      assiduidadeMedia: registros.length ? round(avg(registros.map((r) => r.assiduidade))) : 0,
      notaMedia: registros.length ? round(avg(registros.map((r) => r.notaMedia))) : 0
    };
  }, [registros]);

  return (
    <PortalShell
      title="Evolução do Colaborador"
      subtitle="Acompanhamento real de presença, aprendizagem, avaliações e desenvolvimento contínuo"
    >
      {erro ? <div style={errorBox}>{erro}</div> : null}

      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>Desenvolvimento contínuo</div>
          <h2 style={heroTitle}>Painel de evolução com dados reais do portal</h2>
          <p style={heroText}>
            Esta tela usa os dados já cadastrados de usuários, presenças, avaliações e treinamentos
            para acompanhar a jornada de cada colaborador de forma pessoal e profissional.
          </p>
        </div>

        <div style={heroMeta}>
          <MiniHero title="Colaboradores" value={resumo.total} />
          <MiniHero title="Progresso médio" value={`${resumo.progressoMedio}%`} />
          <MiniHero title="Assiduidade média" value={`${resumo.assiduidadeMedia}%`} />
          <MiniHero title="Nota média" value={resumo.notaMedia} />
        </div>
      </section>

      <div style={filtersBar}>
        <input
          placeholder="Buscar colaborador"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={input}
        />

        <select value={colaborador} onChange={(e) => setColaborador(e.target.value)} style={input}>
          <option value="todos">Todos os colaboradores</option>
          {colaboradoresVisiveis.map((nome) => (
            <option key={nome} value={nome}>{nome}</option>
          ))}
        </select>
      </div>

      <div style={gridStyle}>
        {registros.map((item) => (
          <div key={item.nome} style={cardStyle}>
            <div style={cardHeader}>
              <div>
                <div style={cardTitle}>{item.nome}</div>
                <div style={cardMeta}>
                  {item.perfil} • {item.cliente}
                </div>
                <div style={cardMeta}>{item.email}</div>
              </div>

              <span style={{ ...pillStyle, ...perfilPill(item.perfil) }}>
                {item.perfil}
              </span>
            </div>

            <div style={statsGrid}>
              <Stat label="Treinamentos" value={item.treinamentos} />
              <Stat label="Horas" value={item.horasTreinadas} />
              <Stat label="Assiduidade" value={`${item.assiduidade}%`} />
              <Stat label="Absenteísmo" value={`${item.absenteismo}%`} />
              <Stat label="Nota média" value={item.notaMedia} />
              <Stat label="Conclusão" value={`${item.taxaConclusao}%`} />
            </div>

            <div style={sectionBlock}>
              <div style={sectionLabel}>Trilha de evolução</div>
              <div style={timelineWrap}>
                {item.etapas.map((etapa, idx) => (
                  <div key={idx} style={timelineItem}>
                    <div style={{ ...timelineDot, ...(etapa.done ? timelineDotActive : {}) }} />
                    <div style={{ ...timelineText, ...(etapa.done ? timelineTextActive : {}) }}>
                      {etapa.label}
                    </div>
                  </div>
                ))}
              </div>
              <div style={progressBarTrack}>
                <div style={{ ...progressBarFill, width: `${progressoEtapas(item.etapas)}%` }} />
              </div>
              <div style={progressText}>Progresso da jornada: {progressoEtapas(item.etapas)}%</div>
            </div>

            <div style={sectionBlock}>
              <div style={sectionLabel}>Indicadores de aprendizagem</div>
              <div style={indicatorGrid}>
                <Indicator label="NPS médio" value={item.npsMedio} />
                <Indicator label="Qualidade média" value={item.qualidadeMedia} />
                <Indicator label="Presentes" value={item.presentes} />
                <Indicator label="Justificadas" value={item.justificadas} />
              </div>
            </div>

            <div style={sectionBlock}>
              <div style={sectionLabel}>Treinamentos relacionados</div>
              <div style={trainingList}>
                {item.proximosTreinamentos.length > 0 ? (
                  item.proximosTreinamentos.map((t) => (
                    <div key={t.id} style={trainingItem}>
                      <div style={trainingTitle}>{t.tema}</div>
                      <div style={trainingMeta}>
                        {t.cliente} • {t.instrutor || "Sem instrutor"} • {Number(t.carga_horaria || 0)}h
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={emptySmall}>Sem treinamentos vinculados ainda.</div>
                )}
              </div>
            </div>
          </div>
        ))}

        {registros.length === 0 ? (
          <div style={emptyCard}>Nenhum colaborador encontrado com dados suficientes no portal.</div>
        ) : null}
      </div>
    </PortalShell>
  );
}

function MiniHero({ title, value }) {
  return (
    <div style={miniHeroCard}>
      <div style={{ fontSize: 12, color: "#64748b" }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{value}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={statCard}>
      <div style={statLabel}>{label}</div>
      <div style={statValue}>{value}</div>
    </div>
  );
}

function Indicator({ label, value }) {
  return (
    <div style={indicatorCard}>
      <div style={indicatorLabel}>{label}</div>
      <div style={indicatorValue}>{value}</div>
    </div>
  );
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(v) {
  return Number(Number(v || 0).toFixed(1));
}

function progressoEtapas(etapas) {
  if (!etapas.length) return 0;
  const done = etapas.filter((e) => e.done).length;
  return Math.round((done / etapas.length) * 100);
}

function perfilPill(perfil) {
  const p = String(perfil || "").toLowerCase();
  if (p === "coordenador") return { background: "#dbeafe", color: "#1d4ed8" };
  if (p === "supervisor") return { background: "#dcfce7", color: "#166534" };
  if (p === "instrutor") return { background: "#fef3c7", color: "#92400e" };
  return { background: "#e5e7eb", color: "#334155" };
}

const heroStyle = {
  background: "linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)",
  borderRadius: 18,
  padding: 24,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr",
  gap: 16,
  marginBottom: 18
};

const eyebrowStyle = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#1d4ed8",
  fontWeight: 700
};

const heroTitle = {
  margin: "10px 0 8px",
  fontSize: 28,
  color: "#0f172a"
};

const heroText = {
  margin: 0,
  color: "#475569",
  lineHeight: 1.5
};

const heroMeta = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12
};

const miniHeroCard = {
  background: "#fff",
  borderRadius: 14,
  padding: 16,
  border: "1px solid #dbeafe"
};

const filtersBar = {
  display: "grid",
  gridTemplateColumns: "2fr 1fr",
  gap: 12,
  marginBottom: 18
};

const input = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  width: "100%",
  boxSizing: "border-box"
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
  gap: 16
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 18,
  display: "grid",
  gap: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
};

const cardHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "start"
};

const cardTitle = {
  fontSize: 18,
  fontWeight: 700,
  color: "#0f172a"
};

const cardMeta = {
  fontSize: 13,
  color: "#64748b",
  marginTop: 4
};

const pillStyle = {
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10
};

const statCard = {
  background: "#f8fafc",
  borderRadius: 12,
  padding: 12,
  border: "1px solid #e2e8f0"
};

const statLabel = {
  fontSize: 12,
  color: "#64748b"
};

const statValue = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 700,
  color: "#0f172a"
};

const sectionBlock = {
  display: "grid",
  gap: 10
};

const sectionLabel = {
  fontSize: 12,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 700
};

const timelineWrap = {
  display: "grid",
  gap: 8,
  padding: 12,
  background: "#f8fafc",
  borderRadius: 14
};

const timelineItem = {
  display: "flex",
  alignItems: "center",
  gap: 10
};

const timelineDot = {
  width: 10,
  height: 10,
  borderRadius: 999,
  background: "#cbd5e1",
  flexShrink: 0
};

const timelineDotActive = {
  background: "#2563eb"
};

const timelineText = {
  fontSize: 13,
  color: "#64748b"
};

const timelineTextActive = {
  color: "#0f172a",
  fontWeight: 600
};

const progressBarTrack = {
  height: 10,
  background: "#e5e7eb",
  borderRadius: 999,
  overflow: "hidden"
};

const progressBarFill = {
  height: "100%",
  background: "#2563eb",
  borderRadius: 999
};

const progressText = {
  fontSize: 13,
  color: "#334155"
};

const indicatorGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 10
};

const indicatorCard = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12
};

const indicatorLabel = {
  fontSize: 12,
  color: "#64748b"
};

const indicatorValue = {
  marginTop: 6,
  fontSize: 18,
  fontWeight: 700,
  color: "#0f172a"
};

const trainingList = {
  display: "grid",
  gap: 10
};

const trainingItem = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 12,
  background: "#fff"
};

const trainingTitle = {
  fontSize: 14,
  fontWeight: 700,
  color: "#0f172a"
};

const trainingMeta = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 4
};

const emptySmall = {
  color: "#64748b",
  fontSize: 14
};

const emptyCard = {
  background: "#fff",
  border: "1px dashed #cbd5e1",
  borderRadius: 16,
  padding: 24,
  color: "#64748b"
};

const errorBox = {
  background: "#fef2f2",
  color: "#b91c1c",
  padding: 14,
  borderRadius: 12,
  marginBottom: 16
};
