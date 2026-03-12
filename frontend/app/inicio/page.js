"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../components/PortalShell";

const initialData = {
  totalClientes: 0,
  totalUsuarios: 0,
  totalTreinamentos: 0,
  totalPresencas: 0,
  totalAvaliacoes: 0,
  totalMateriaisAvaliativos: 0,
  totalConteudosBiblioteca: 0,
  totalTrilhas: 0,
  horasTreinadas: 0,
  participantesTreinados: 0,
  taxaConclusao: 0,
  aproveitamentoMedio: 0,
  npsMedio: 0,
  qualidadeMedia: 0,
  assiduidadeMedia: 0,
  mediaTreinamentosPorPessoa: 0,
  treinamentosRecentes: [],
  treinamentosPorCliente: [],
  treinamentosPorInstrutor: [],
  avaliacoesPorCliente: [],
  rankingInstrutores: []
};

export default function InicioPage() {
  const [dados, setDados] = useState(initialData);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const token = localStorage.getItem("token");
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!token) {
          window.location.href = "/login";
          return;
        }
        const res = await fetch(`${apiUrl}/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Falha ao consultar dashboard");
        const json = await res.json();
        setDados({
          ...initialData,
          ...json,
          treinamentosRecentes: Array.isArray(json.treinamentosRecentes) ? json.treinamentosRecentes : [],
          treinamentosPorCliente: Array.isArray(json.treinamentosPorCliente) ? json.treinamentosPorCliente : [],
          treinamentosPorInstrutor: Array.isArray(json.treinamentosPorInstrutor) ? json.treinamentosPorInstrutor : [],
          avaliacoesPorCliente: Array.isArray(json.avaliacoesPorCliente) ? json.avaliacoesPorCliente : [],
          rankingInstrutores: Array.isArray(json.rankingInstrutores) ? json.rankingInstrutores : []
        });
      } catch {
        setErro("Erro ao carregar dashboard executivo");
      }
    }
    carregar();
  }, []);

  const alertas = useMemo(() => {
    const itens = [];
    if (dados.npsMedio < 8.5) itens.push({ tipo: "atenção", texto: "NPS médio abaixo da meta sugerida de 8,5." });
    else itens.push({ tipo: "positivo", texto: "NPS médio dentro ou acima da meta sugerida." });
    if (dados.assiduidadeMedia < 90) itens.push({ tipo: "atenção", texto: "Assiduidade média abaixo da meta sugerida de 90%." });
    else itens.push({ tipo: "positivo", texto: "Assiduidade média em linha com a meta." });
    if (dados.qualidadeMedia < 4.5) itens.push({ tipo: "atenção", texto: "Qualidade média abaixo da meta sugerida de 4,5." });
    else itens.push({ tipo: "positivo", texto: "Qualidade média dentro do patamar esperado." });
    if (dados.taxaConclusao < 85) itens.push({ tipo: "atenção", texto: "Taxa de conclusão abaixo do patamar desejado." });
    else itens.push({ tipo: "positivo", texto: "Taxa de conclusão em nível saudável." });
    return itens;
  }, [dados]);

  return (
    <PortalShell title="Dashboard Executivo 4.0" subtitle="Visão estratégica do Treinamento e Desenvolvimento">
      {erro ? <div style={alertBoxStyle}>{erro}</div> : null}

      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>Resumo executivo</div>
          <h2 style={heroTitleStyle}>Painel estratégico do Tel T&D</h2>
          <p style={heroTextStyle}>
            Monitoramento de volume, qualidade, presença, conclusão, aproveitamento, biblioteca e trilhas por cliente e por instrutor.
          </p>
        </div>
        <div style={metaGridStyle}>
          <MetaCard label="Meta NPS" value="8,5+" />
          <MetaCard label="Meta Assiduidade" value="90%+" />
          <MetaCard label="Meta Conclusão" value="85%+" />
        </div>
      </section>

      <div style={cardsGrid}>
        <KpiCard title="Clientes" value={dados.totalClientes} caption="Base ativa monitorada" />
        <KpiCard title="Usuários" value={dados.totalUsuarios} caption="Pessoas cadastradas" />
        <KpiCard title="Treinamentos" value={dados.totalTreinamentos} caption="Volume total aplicado" />
        <KpiCard title="Horas Treinadas" value={dados.horasTreinadas} caption="Carga horária consolidada" />
        <KpiCard title="Participantes" value={dados.participantesTreinados} caption="Presenças efetivas registradas" />
        <KpiCard title="Trein./Pessoa" value={dados.mediaTreinamentosPorPessoa} caption="Média por usuário" />
        <KpiCard title="Taxa de Conclusão" value={`${dados.taxaConclusao}%`} caption={dados.taxaConclusao >= 85 ? "Acima da meta" : "Abaixo da meta"} highlight={dados.taxaConclusao >= 85} />
        <KpiCard title="Aproveitamento" value={dados.aproveitamentoMedio} caption="Média de nota_prova" highlight={dados.aproveitamentoMedio >= 8} />
        <KpiCard title="NPS Médio" value={dados.npsMedio} caption={dados.npsMedio >= 8.5 ? "Acima da meta" : "Abaixo da meta"} highlight={dados.npsMedio >= 8.5} />
        <KpiCard title="Qualidade Média" value={dados.qualidadeMedia} caption={dados.qualidadeMedia >= 4.5 ? "Acima da meta" : "Abaixo da meta"} highlight={dados.qualidadeMedia >= 4.5} />
        <KpiCard title="Biblioteca" value={dados.totalConteudosBiblioteca} caption="Conteúdos cadastrados" />
        <KpiCard title="Trilhas" value={dados.totalTrilhas} caption="Jornadas de aprendizagem" />
      </div>

      <div style={twoColsStyle}>
        <Panel title="Treinamentos por Cliente" subtitle="Volume e carga horária por operação">
          {dados.treinamentosPorCliente.length === 0 ? <p style={emptyStyle}>Sem dados ainda.</p> : dados.treinamentosPorCliente.map((item, index) => (
            <BarItem key={`${item.cliente}-${index}`} label={`${item.cliente || "Cliente"} • ${item.horas || 0}h`} value={Number(item.total || 0)} max={maxValue(dados.treinamentosPorCliente, "total")} />
          ))}
        </Panel>

        <Panel title="Treinamentos por Instrutor" subtitle="Volume e carga horária por instrutor">
          {dados.treinamentosPorInstrutor.length === 0 ? <p style={emptyStyle}>Sem dados ainda.</p> : dados.treinamentosPorInstrutor.map((item, index) => (
            <BarItem key={`${item.instrutor}-${index}`} label={`${item.instrutor || "Instrutor"} • ${item.horas || 0}h`} value={Number(item.total || 0)} max={maxValue(dados.treinamentosPorInstrutor, "total")} />
          ))}
        </Panel>
      </div>

      <div style={twoColsStyle}>
        <Panel title="Ranking de Instrutores" subtitle="Volume, horas e médias de avaliação">
          {dados.rankingInstrutores.length === 0 ? <p style={emptyStyle}>Sem dados ainda.</p> : (
            <div style={{ display: "grid", gap: 12 }}>
              {dados.rankingInstrutores.map((item, idx) => (
                <div key={idx} style={rankingCard}>
                  <strong>{idx + 1}º • {item.instrutor || "-"}</strong>
                  <div style={rankingMeta}>Treinamentos: {item.total_treinamentos} | Horas: {item.horas} | NPS: {item.nps_medio} | Qualidade: {item.qualidade_media}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Alertas Executivos" subtitle="Sinais rápidos para tomada de decisão">
          <div style={{ display: "grid", gap: 10 }}>
            {alertas.map((item, index) => (
              <div key={index} style={{ padding: 14, borderRadius: 12, background: item.tipo === "positivo" ? "#ecfdf5" : "#fef2f2", color: item.tipo === "positivo" ? "#166534" : "#b91c1c", border: `1px solid ${item.tipo === "positivo" ? "#bbf7d0" : "#fecaca"}` }}>
                {item.texto}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </PortalShell>
  );
}

function KpiCard({ title, value, caption, highlight = false }) {
  return (
    <div style={{ ...cardStyle, border: highlight ? "1px solid #bfdbfe" : "1px solid transparent", boxShadow: highlight ? "0 0 0 1px rgba(59,130,246,0.08)" : cardStyle.boxShadow }}>
      <div style={{ color: "#64748b", fontSize: 14 }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: "bold" }}>{value}</div>
      <div style={{ marginTop: 8, color: highlight ? "#1d4ed8" : "#64748b", fontSize: 13 }}>{caption}</div>
    </div>
  );
}

function MetaCard({ label, value }) {
  return (
    <div style={metaCardStyle}>
      <div style={{ fontSize: 12, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: "bold", marginTop: 8 }}>{value}</div>
    </div>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <div style={panelStyle}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
        <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function BarItem({ label, value, max }) {
  const width = max > 0 ? Math.max(8, Math.round((value / max) * 100)) : 8;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{label}</span>
        <strong>{value}</strong>
      </div>
      <div style={{ background: "#e5e7eb", borderRadius: 999, height: 10, overflow: "hidden" }}>
        <div style={{ width: `${width}%`, height: "100%", background: "#1d4ed8" }} />
      </div>
    </div>
  );
}

function maxValue(items, key) {
  const values = items.map((item) => Number(item[key] || 0));
  return Math.max(...values, 1);
}

const heroStyle = { background: "linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)", borderRadius: 18, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, marginBottom: 20 };
const eyebrowStyle = { fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1d4ed8", fontWeight: 700 };
const heroTitleStyle = { margin: "10px 0 8px", fontSize: 30 };
const heroTextStyle = { margin: 0, color: "#475569", lineHeight: 1.5 };
const metaGridStyle = { display: "grid", gridTemplateColumns: "1fr", gap: 12 };
const metaCardStyle = { background: "#fff", borderRadius: 14, padding: 16, border: "1px solid #dbeafe" };
const cardsGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 20 };
const twoColsStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16, marginBottom: 16 };
const cardStyle = { background: "#fff", padding: 20, borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };
const panelStyle = { background: "#fff", padding: 24, borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };
const rankingCard = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 };
const rankingMeta = { color: "#64748b", marginTop: 6, fontSize: 14 };
const emptyStyle = { margin: 0, color: "#64748b" };
const alertBoxStyle = { background: "#fef2f2", color: "#b91c1c", padding: 14, borderRadius: 12, marginBottom: 16 };
